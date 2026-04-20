package llmexec

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"testing"
	"time"

	"open-kraken/backend/go/internal/ael"
	"open-kraken/backend/go/internal/flowscheduler"
	"open-kraken/backend/go/internal/provider"
)

// fakeProvider lets tests stub the LLM without doing any I/O.
type fakeProvider struct {
	name     string
	resp     *provider.Completion
	err      error
	observed provider.Prompt
}

func (f *fakeProvider) Name() string { return f.name }

func (f *fakeProvider) Complete(ctx context.Context, p provider.Prompt) (*provider.Completion, error) {
	f.observed = p
	if f.err != nil {
		return nil, f.err
	}
	return f.resp, nil
}

func mustJSON(t *testing.T, v any) []byte {
	t.Helper()
	b, err := json.Marshal(v)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	return b
}

func newStep(t *testing.T, input stepInput) ael.Step {
	t.Helper()
	return ael.Step{
		ID:             "step-1",
		FlowID:         "flow-1",
		RunID:          "run-1",
		TenantID:       "tenant-a",
		State:          ael.StepPending,
		Regime:         ael.RegimeOpaque,
		AgentType:      "assistant",
		// Provider matches fakeProvider.Name() so llmexec can route.
		Provider:       "fake",
		EventStreamRaw: mustJSON(t, input),
	}
}

func TestExecutor_HappyPath(t *testing.T) {
	fp := &fakeProvider{
		name: "fake",
		resp: &provider.Completion{
			Content:    "hello back",
			Model:      "claude-opus-4-7",
			StopReason: "end_turn",
			Usage:      provider.TokenUsage{InputTokens: 3, OutputTokens: 2, TotalTokens: 5, CostUSD: 0.001},
			Latency:    120 * time.Millisecond,
		},
	}
	e := New(fp, Options{})

	step := newStep(t, stepInput{
		Model:  "claude-opus-4-7",
		System: "be brief",
		Messages: []inMsg{
			{Role: "user", Content: "hi"},
		},
		MaxTokens: 64,
	})
	res, err := e.Execute(context.Background(), flowscheduler.ExecutionRequest{Step: step})
	if err != nil {
		t.Fatalf("Execute: %v", err)
	}
	if res.FinalState != ael.StepSucceeded {
		t.Errorf("final state: %s", res.FinalState)
	}
	if res.TokensUsed != 5 || res.CostUSD != 0.001 {
		t.Errorf("usage passthrough: tokens=%d cost=%f", res.TokensUsed, res.CostUSD)
	}
	if res.DurationMS != 120 {
		t.Errorf("duration: %d", res.DurationMS)
	}

	// Prompt was built correctly.
	if fp.observed.Model != "claude-opus-4-7" {
		t.Errorf("model: %s", fp.observed.Model)
	}
	if fp.observed.System != "be brief" {
		t.Errorf("system: %s", fp.observed.System)
	}
	if len(fp.observed.Messages) != 1 || fp.observed.Messages[0].Content != "hi" {
		t.Errorf("messages: %+v", fp.observed.Messages)
	}
	if fp.observed.Metadata["tenant_id"] != "tenant-a" {
		t.Errorf("metadata tenant_id missing: %+v", fp.observed.Metadata)
	}

	// event_stream out contains the assistant turn.
	var out stepInput
	if err := json.Unmarshal(res.EventStream, &out); err != nil {
		t.Fatalf("decode out: %v", err)
	}
	if len(out.Messages) != 2 || out.Messages[1].Role != "assistant" || out.Messages[1].Content != "hello back" {
		t.Errorf("output messages: %+v", out.Messages)
	}
}

func TestExecutor_DefaultModelWhenOmitted(t *testing.T) {
	fp := &fakeProvider{
		name: "fake",
		resp: &provider.Completion{Content: "ok"},
	}
	e := New(fp, Options{DefaultModel: "claude-haiku-4-5"})

	step := newStep(t, stepInput{Messages: []inMsg{{Role: "user", Content: "hi"}}})
	_, err := e.Execute(context.Background(), flowscheduler.ExecutionRequest{Step: step})
	if err != nil {
		t.Fatalf("Execute: %v", err)
	}
	if fp.observed.Model != "claude-haiku-4-5" {
		t.Errorf("default model not applied: %s", fp.observed.Model)
	}
}

func TestExecutor_NoModelNoDefault_Fails(t *testing.T) {
	fp := &fakeProvider{name: "fake"}
	e := New(fp, Options{})
	step := newStep(t, stepInput{Messages: []inMsg{{Role: "user", Content: "hi"}}})
	res, err := e.Execute(context.Background(), flowscheduler.ExecutionRequest{Step: step})
	if err != nil {
		t.Fatalf("Execute: %v", err)
	}
	if res.FinalState != ael.StepFailed {
		t.Errorf("want failed, got %s", res.FinalState)
	}
	if !strings.Contains(res.FailureReason, "no model") {
		t.Errorf("failure reason: %q", res.FailureReason)
	}
}

func TestExecutor_EmptyMessagesFails(t *testing.T) {
	fp := &fakeProvider{name: "fake"}
	e := New(fp, Options{DefaultModel: "claude-haiku-4-5"})
	step := newStep(t, stepInput{})
	res, err := e.Execute(context.Background(), flowscheduler.ExecutionRequest{Step: step})
	if err != nil {
		t.Fatalf("Execute: %v", err)
	}
	if res.FinalState != ael.StepFailed {
		t.Errorf("want failed, got %s", res.FinalState)
	}
	if !strings.Contains(res.FailureReason, "no messages") {
		t.Errorf("failure reason: %q", res.FailureReason)
	}
}

func TestExecutor_InvalidJSONFails(t *testing.T) {
	fp := &fakeProvider{name: "fake"}
	e := New(fp, Options{DefaultModel: "claude-haiku-4-5"})
	step := ael.Step{
		ID:             "step-bad",
		FlowID:         "flow-1",
		RunID:          "run-1",
		EventStreamRaw: []byte(`{not json`),
	}
	res, err := e.Execute(context.Background(), flowscheduler.ExecutionRequest{Step: step})
	if err != nil {
		t.Fatalf("Execute: %v", err)
	}
	if res.FinalState != ael.StepFailed {
		t.Errorf("want failed, got %s", res.FinalState)
	}
	if !strings.Contains(res.FailureReason, "invalid event_stream") {
		t.Errorf("failure reason: %q", res.FailureReason)
	}
}

func TestExecutor_MultiProvider_RoutesByStepProvider(t *testing.T) {
	// Two providers; Step picks one by name. The other must NOT be called.
	a := &fakeProvider{name: "anthropic", resp: &provider.Completion{Content: "A", Model: "claude"}}
	o := &fakeProvider{name: "openai", resp: &provider.Completion{Content: "B", Model: "gpt"}}

	e, err := NewMulti(map[string]provider.LLMProvider{
		"anthropic": a,
		"openai":    o,
	}, Options{})
	if err != nil {
		t.Fatal(err)
	}

	step := newStep(t, stepInput{Model: "gpt-4o", Messages: []inMsg{{Role: "user", Content: "hi"}}})
	step.Provider = "openai"
	res, err := e.Execute(context.Background(), flowscheduler.ExecutionRequest{Step: step})
	if err != nil {
		t.Fatalf("Execute: %v", err)
	}
	if res.FinalState != ael.StepSucceeded {
		t.Errorf("want succeeded, got %s: %s", res.FinalState, res.FailureReason)
	}
	if o.observed.Model != "gpt-4o" {
		t.Errorf("openai provider not called: observed=%+v", o.observed)
	}
	if a.observed.Model != "" {
		t.Errorf("anthropic must not be called; observed=%+v", a.observed)
	}
}

func TestExecutor_MultiProvider_UnknownProviderFails(t *testing.T) {
	a := &fakeProvider{name: "anthropic", resp: &provider.Completion{Content: "A"}}
	e, err := NewMulti(map[string]provider.LLMProvider{"anthropic": a}, Options{})
	if err != nil {
		t.Fatal(err)
	}
	step := newStep(t, stepInput{Model: "g", Messages: []inMsg{{Role: "user", Content: "hi"}}})
	step.Provider = "gemini"
	res, err := e.Execute(context.Background(), flowscheduler.ExecutionRequest{Step: step})
	if err != nil {
		t.Fatalf("Execute: %v", err)
	}
	if res.FinalState != ael.StepFailed {
		t.Errorf("want failed, got %s", res.FinalState)
	}
	if !strings.Contains(res.FailureReason, "unknown provider") {
		t.Errorf("failure reason: %q", res.FailureReason)
	}
}

func TestExecutor_DefaultProviderFallback(t *testing.T) {
	// When step.Provider is empty, Options.DefaultProvider routes.
	a := &fakeProvider{name: "anthropic", resp: &provider.Completion{Content: "A"}}
	e, err := NewMulti(map[string]provider.LLMProvider{"anthropic": a},
		Options{DefaultProvider: "anthropic"})
	if err != nil {
		t.Fatal(err)
	}
	step := newStep(t, stepInput{Model: "c", Messages: []inMsg{{Role: "user", Content: "hi"}}})
	step.Provider = ""
	res, err := e.Execute(context.Background(), flowscheduler.ExecutionRequest{Step: step})
	if err != nil {
		t.Fatalf("Execute: %v", err)
	}
	if res.FinalState != ael.StepSucceeded {
		t.Errorf("want succeeded, got %s: %s", res.FinalState, res.FailureReason)
	}
}

func TestNewMulti_EmptyMapRejected(t *testing.T) {
	if _, err := NewMulti(map[string]provider.LLMProvider{}, Options{}); err == nil {
		t.Error("empty provider map should error")
	}
}

func TestNewMulti_NilProviderRejected(t *testing.T) {
	if _, err := NewMulti(map[string]provider.LLMProvider{"x": nil}, Options{}); err == nil {
		t.Error("nil provider should error")
	}
}

func TestExecutor_SkillTemplatePrependedToSystem(t *testing.T) {
	fp := &fakeProvider{name: "fake", resp: &provider.Completion{Content: "ok"}}
	binder := SkillBinderFunc(func(ctx context.Context, agentType, workload, tenant string) (*SkillBinding, error) {
		if agentType != "assistant" {
			return nil, ErrNoSkill
		}
		return &SkillBinding{
			ID:             "sk-1",
			Name:           "concise assistant",
			PromptTemplate: "You are a concise assistant. Reply in one sentence.",
		}, nil
	})
	e, err := NewMulti(map[string]provider.LLMProvider{"fake": fp}, Options{SkillBinder: binder})
	if err != nil {
		t.Fatal(err)
	}

	step := newStep(t, stepInput{
		Model:    "m",
		System:   "user-provided extra",
		Messages: []inMsg{{Role: "user", Content: "hi"}},
	})
	step.AgentType = "assistant"

	if _, err := e.Execute(context.Background(), flowscheduler.ExecutionRequest{Step: step}); err != nil {
		t.Fatal(err)
	}
	gotSystem := fp.observed.System
	if !strings.HasPrefix(gotSystem, "You are a concise assistant.") {
		t.Errorf("skill template should be prepended; got: %q", gotSystem)
	}
	if !strings.Contains(gotSystem, "user-provided extra") {
		t.Errorf("user system should be preserved; got: %q", gotSystem)
	}
	if fp.observed.Metadata["skill_id"] != "sk-1" {
		t.Errorf("skill_id should be in metadata; got: %+v", fp.observed.Metadata)
	}
}

func TestExecutor_SkillOnlyAsSystemWhenUserSystemEmpty(t *testing.T) {
	fp := &fakeProvider{name: "fake", resp: &provider.Completion{Content: "ok"}}
	binder := SkillBinderFunc(func(ctx context.Context, _, _, _ string) (*SkillBinding, error) {
		return &SkillBinding{ID: "sk-2", PromptTemplate: "Only skill"}, nil
	})
	e, _ := NewMulti(map[string]provider.LLMProvider{"fake": fp}, Options{SkillBinder: binder})

	step := newStep(t, stepInput{
		Model:    "m",
		Messages: []inMsg{{Role: "user", Content: "hi"}},
	})
	_, _ = e.Execute(context.Background(), flowscheduler.ExecutionRequest{Step: step})
	if fp.observed.System != "Only skill" {
		t.Errorf("system: want 'Only skill', got %q", fp.observed.System)
	}
}

func TestExecutor_SkillMissingFallsBackToRawInput(t *testing.T) {
	fp := &fakeProvider{name: "fake", resp: &provider.Completion{Content: "ok"}}
	binder := SkillBinderFunc(func(ctx context.Context, _, _, _ string) (*SkillBinding, error) {
		return nil, ErrNoSkill
	})
	e, _ := NewMulti(map[string]provider.LLMProvider{"fake": fp}, Options{SkillBinder: binder})

	step := newStep(t, stepInput{
		Model:    "m",
		System:   "raw user system",
		Messages: []inMsg{{Role: "user", Content: "hi"}},
	})
	_, _ = e.Execute(context.Background(), flowscheduler.ExecutionRequest{Step: step})
	if fp.observed.System != "raw user system" {
		t.Errorf("want untouched user system, got %q", fp.observed.System)
	}
	if _, ok := fp.observed.Metadata["skill_id"]; ok {
		t.Errorf("skill_id should not be in metadata when no skill bound")
	}
}

func TestExecutor_SkillBinderErrorIsTreatedAsNoSkill(t *testing.T) {
	// A flaky binder (e.g. PG blip) should not block Steps — fall
	// back to raw input.
	fp := &fakeProvider{name: "fake", resp: &provider.Completion{Content: "ok"}}
	binder := SkillBinderFunc(func(ctx context.Context, _, _, _ string) (*SkillBinding, error) {
		return nil, errors.New("upstream blip")
	})
	e, _ := NewMulti(map[string]provider.LLMProvider{"fake": fp}, Options{SkillBinder: binder})

	step := newStep(t, stepInput{
		Model:    "m",
		System:   "raw system",
		Messages: []inMsg{{Role: "user", Content: "hi"}},
	})
	res, err := e.Execute(context.Background(), flowscheduler.ExecutionRequest{Step: step})
	if err != nil {
		t.Fatal(err)
	}
	if res.FinalState != ael.StepSucceeded {
		t.Errorf("binder error must not fail step; got %s", res.FinalState)
	}
	if fp.observed.System != "raw system" {
		t.Errorf("flaky binder should fall back; got %q", fp.observed.System)
	}
}

func TestExecutor_NilSkillBinderIsBypass(t *testing.T) {
	fp := &fakeProvider{name: "fake", resp: &provider.Completion{Content: "ok"}}
	e, _ := NewMulti(map[string]provider.LLMProvider{"fake": fp}, Options{})

	step := newStep(t, stepInput{
		Model:    "m",
		System:   "only user",
		Messages: []inMsg{{Role: "user", Content: "hi"}},
	})
	_, _ = e.Execute(context.Background(), flowscheduler.ExecutionRequest{Step: step})
	if fp.observed.System != "only user" {
		t.Errorf("nil binder should leave system untouched; got %q", fp.observed.System)
	}
}

func TestComposeSystemPrompt_DegenerateCases(t *testing.T) {
	cases := []struct {
		name, skillTpl, user, want string
	}{
		{"both empty", "", "", ""},
		{"only user", "", "u", "u"},
		{"only skill", "s", "", "s"},
		{"both", "s", "u", "s\n\nu"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			var sk *SkillBinding
			if c.skillTpl != "" {
				sk = &SkillBinding{PromptTemplate: c.skillTpl}
			}
			got := composeSystemPrompt(sk, c.user)
			if got != c.want {
				t.Errorf("want %q, got %q", c.want, got)
			}
		})
	}
}

func TestExecutor_ProviderErrorClassification(t *testing.T) {
	cases := []struct {
		name  string
		err   error
		want  string
	}{
		{"auth", provider.ErrAuth, "provider auth"},
		{"rate", provider.ErrRateLimited, "rate limited"},
		{"unknown_model", provider.ErrUnknownModel, "unknown model"},
		{"upstream", &provider.ErrUpstream{StatusCode: 500, Message: "boom"}, "upstream 500"},
		{"generic", errors.New("network down"), "network down"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			fp := &fakeProvider{name: "fake", err: tc.err}
			e := New(fp, Options{DefaultModel: "claude-haiku-4-5"})
			step := newStep(t, stepInput{Messages: []inMsg{{Role: "user", Content: "hi"}}})
			res, err := e.Execute(context.Background(), flowscheduler.ExecutionRequest{Step: step})
			if err != nil {
				t.Fatalf("Execute: %v", err)
			}
			if res.FinalState != ael.StepFailed {
				t.Errorf("final state: %s", res.FinalState)
			}
			if !strings.Contains(res.FailureReason, tc.want) {
				t.Errorf("reason %q doesn't contain %q", res.FailureReason, tc.want)
			}
		})
	}
}
