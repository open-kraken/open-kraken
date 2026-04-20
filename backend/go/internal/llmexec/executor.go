package llmexec

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"

	"open-kraken/backend/go/internal/ael"
	"open-kraken/backend/go/internal/flowscheduler"
	"open-kraken/backend/go/internal/provider"
)

// Options tunes the Executor's behaviour. Zero-value defaults keep it
// safe: DefaultModel fires only when Step input does not specify one,
// MaxTokensDefault is the cap when the input leaves it blank.
type Options struct {
	DefaultModel     string
	MaxTokensDefault int

	// DefaultProvider is the registry key to use when the Step arrives
	// without a Provider set. Typically mirrors the single arm a
	// no-CWS deployment advertises (e.g. "anthropic"). Empty means
	// "require every Step to carry a Provider".
	DefaultProvider string

	// SkillBinder optionally resolves the Skill Library (paper §5.4.5)
	// at dispatch time. When non-nil, its PromptTemplate is prepended
	// to the Step's system prompt so an AgentInstance's static
	// (agent_type) tuple gets a concrete prompt identity. Nil disables
	// the lookup — the executor falls back to the raw Step input.
	//
	// Failures from the SkillBinder (including ErrNoSkill, pgx errors,
	// or network issues) are logged and treated as "no skill" so a
	// flaky registry never blocks a Step.
	SkillBinder SkillBinder
}

// Executor is a flowscheduler.StepExecutor that hands the Step's input
// stream to an LLM provider and records the assistant reply.
//
// The executor holds a REGISTRY of named providers rather than a single
// LLMProvider so a CWS-driven deployment can route each Step to a
// different arm by its `step.Provider` field. Single-provider
// deployments use NewSingle() which wraps this model under the hood.
type Executor struct {
	providers map[string]provider.LLMProvider
	opts      Options
}

// NewMulti constructs an Executor backed by the given named providers.
// Each key is the string Step.Provider will carry at dispatch time
// (e.g. "anthropic", "openai"). An empty map is rejected.
func NewMulti(providers map[string]provider.LLMProvider, opts Options) (*Executor, error) {
	if len(providers) == 0 {
		return nil, errors.New("llmexec.NewMulti: at least one provider is required")
	}
	if opts.MaxTokensDefault <= 0 {
		opts.MaxTokensDefault = 1024
	}
	// Copy so the caller cannot mutate our routing table after construction.
	copy := make(map[string]provider.LLMProvider, len(providers))
	for k, v := range providers {
		if v == nil {
			return nil, fmt.Errorf("llmexec.NewMulti: provider %q is nil", k)
		}
		copy[k] = v
	}
	return &Executor{providers: copy, opts: opts}, nil
}

// New constructs a single-provider Executor. Kept as the ergonomic API
// for deployments that only run one LLM vendor. Internally it populates
// a 1-element map with the provider's own Name().
func New(p provider.LLMProvider, opts Options) *Executor {
	if p == nil {
		// Preserve pre-refactor behaviour: a nil provider is a
		// programmer error that will crash on first Execute. Returning
		// nil here would be a silent change.
		panic("llmexec.New: provider is nil")
	}
	if opts.DefaultProvider == "" {
		opts.DefaultProvider = p.Name()
	}
	e, _ := NewMulti(map[string]provider.LLMProvider{p.Name(): p}, opts)
	return e
}

// Execute implements flowscheduler.StepExecutor. Any upstream error
// surfaces as ExecutionResult{FinalState: StepFailed} so the Step + Flow +
// Run state machine can settle; the scheduler only sees a non-nil error
// when we cannot even assemble the request.
func (e *Executor) Execute(ctx context.Context, req flowscheduler.ExecutionRequest) (flowscheduler.ExecutionResult, error) {
	step := req.Step

	input, err := parseInput(step.EventStreamRaw)
	if err != nil {
		return failed(step, "invalid event_stream: "+err.Error()), nil
	}

	p, err := e.resolveProvider(step)
	if err != nil {
		return failed(step, err.Error()), nil
	}

	// Skill Library lookup (paper §5.4.5). Prepends the skill's
	// prompt_template to the user system prompt so the agent's static
	// identity flows into the provider call.
	skill := e.resolveSkill(ctx, step)

	prompt, err := e.buildPrompt(step, input, skill)
	if err != nil {
		return failed(step, err.Error()), nil
	}

	completion, err := p.Complete(ctx, prompt)
	if err != nil {
		return classifyExecError(step, err), nil
	}

	out := input.appendAssistant(completion.Content)
	outBytes, mErr := json.Marshal(out)
	if mErr != nil {
		return failed(step, "marshal output: "+mErr.Error()), nil
	}

	return flowscheduler.ExecutionResult{
		FinalState:  ael.StepSucceeded,
		TokensUsed:  completion.Usage.TotalTokens,
		CostUSD:     completion.Usage.CostUSD,
		DurationMS:  int(completion.Latency.Milliseconds()),
		OutputRef:   "",
		EventStream: outBytes,
	}, nil
}

// resolveSkill asks the SkillBinder for the skill applicable to this
// Step. Any error (including ErrNoSkill) collapses to nil — the
// executor falls back to the raw Step input rather than blocking a
// flaky registry. A nil binder short-circuits immediately.
func (e *Executor) resolveSkill(ctx context.Context, step ael.Step) *SkillBinding {
	if e.opts.SkillBinder == nil {
		return nil
	}
	binding, err := e.opts.SkillBinder.FindSkillForAgent(ctx, step.AgentType, step.WorkloadClass, step.TenantID)
	if err != nil {
		return nil
	}
	return binding
}

// composeSystemPrompt prepends the skill template to the user's system
// prompt. Separator is a blank line so the two sections are visually
// distinct for logs and audit.
func composeSystemPrompt(skill *SkillBinding, userSystem string) string {
	if skill == nil || skill.PromptTemplate == "" {
		return userSystem
	}
	if userSystem == "" {
		return skill.PromptTemplate
	}
	return skill.PromptTemplate + "\n\n" + userSystem
}

// resolveProvider looks up the LLM backend for this Step. The lookup
// key is step.Provider (CWS writes it at arm-pick time); Options.
// DefaultProvider is the fallback when the Step arrived unrouted.
// Returns a classified failure message the caller can put in
// ExecutionResult.FailureReason.
func (e *Executor) resolveProvider(step ael.Step) (provider.LLMProvider, error) {
	name := step.Provider
	if name == "" {
		name = e.opts.DefaultProvider
	}
	if name == "" {
		return nil, errors.New("no provider set on step and no DefaultProvider configured")
	}
	p, ok := e.providers[name]
	if !ok {
		return nil, fmt.Errorf("unknown provider %q (registered: %v)", name, e.providerNames())
	}
	return p, nil
}

// providerNames is a stable-ordering helper used only in error messages.
// Allocations here are acceptable because it fires on a bad-route path.
func (e *Executor) providerNames() []string {
	out := make([]string, 0, len(e.providers))
	for k := range e.providers {
		out = append(out, k)
	}
	return out
}

// buildPrompt merges Step-level fields with in-band input to produce a
// provider-neutral Prompt. The policy is: the JSON payload wins; Step
// struct fields fill in gaps.
func (e *Executor) buildPrompt(step ael.Step, in stepInput, skill *SkillBinding) (provider.Prompt, error) {
	if len(in.Messages) == 0 {
		return provider.Prompt{}, errors.New("no messages in event_stream.messages")
	}

	model := in.Model
	if model == "" {
		model = e.opts.DefaultModel
	}
	if model == "" {
		return provider.Prompt{}, errors.New("no model set: missing both event_stream.model and executor DefaultModel")
	}

	maxTokens := in.MaxTokens
	if maxTokens <= 0 {
		maxTokens = e.opts.MaxTokensDefault
	}

	temp := in.Temperature
	if temp == nil {
		neg := -1.0
		temp = &neg
	}

	meta := map[string]string{}
	if step.TenantID != "" {
		meta["tenant_id"] = step.TenantID
	}
	if step.RunID != "" {
		meta["run_id"] = step.RunID
	}
	if step.ID != "" {
		meta["step_id"] = step.ID
	}
	if skill != nil {
		meta["skill_id"] = skill.ID
	}

	return provider.Prompt{
		Model:       model,
		System:      composeSystemPrompt(skill, in.System),
		Messages:    toProviderMessages(in.Messages),
		MaxTokens:   maxTokens,
		Temperature: *temp,
		Metadata:    meta,
	}, nil
}

// classifyExecError maps typed provider errors into ExecutionResults.
// Rate-limit errors are still reported as failures for this pass — future
// work may route them into a retry queue. The distinction is preserved in
// FailureReason so CWS can read it later.
func classifyExecError(step ael.Step, err error) flowscheduler.ExecutionResult {
	switch {
	case errors.Is(err, provider.ErrAuth):
		return failed(step, "provider auth: "+err.Error())
	case errors.Is(err, provider.ErrRateLimited):
		return failed(step, "provider rate limited: "+err.Error())
	case errors.Is(err, provider.ErrUnknownModel):
		return failed(step, "provider unknown model: "+err.Error())
	}
	var upstream *provider.ErrUpstream
	if errors.As(err, &upstream) {
		return failed(step, fmt.Sprintf("provider upstream %d: %s", upstream.StatusCode, upstream.Message))
	}
	return failed(step, "provider error: "+err.Error())
}

func failed(step ael.Step, reason string) flowscheduler.ExecutionResult {
	return flowscheduler.ExecutionResult{
		FinalState:    ael.StepFailed,
		FailureReason: reason,
	}
}
