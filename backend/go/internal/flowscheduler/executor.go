package flowscheduler

import (
	"context"

	"open-kraken/backend/go/internal/ael"
	"open-kraken/backend/go/internal/runtime/instance"
)

// ExecutionRequest is the input handed to a StepExecutor. It carries a
// snapshot of the Step plus the AgentInstance that will run it, so the
// executor can access L1 context without re-reading from the database.
type ExecutionRequest struct {
	Step     ael.Step
	Instance *instance.AgentInstance
}

// ExecutionResult is the executor's report of what happened. The scheduler
// translates this into a T2StepComplete call.
type ExecutionResult struct {
	// FinalState must be ael.StepSucceeded or ael.StepFailed.
	FinalState ael.StepState

	// TokensUsed is the actual (not estimated) token cost of this Step.
	// The scheduler also uses it to reconcile the Run's tokens_used debit.
	TokensUsed int

	// CostUSD is the monetary cost added to Run.cost_usd.
	CostUSD float64

	// DurationMS is the wall-clock duration of the Step execution.
	DurationMS int

	// OutputRef is an opaque pointer (URI, blob id, hash) to any persisted
	// output. Empty when the Step produced no durable artifact.
	OutputRef string

	// EventStream is the JSON-encoded AEP event stream for this Step.
	// Stored on steps.event_stream; may be nil.
	EventStream []byte

	// FailureReason is human-readable text describing why the Step failed.
	// Only meaningful when FinalState is ael.StepFailed.
	FailureReason string

	// SideEffects committed atomically with the Step completion.
	SideEffects []ael.SideEffect
}

// StepExecutor is the pluggable hook point where real provider adapters
// live. The Phase 1 default is NoopExecutor; Phase 2 will supply a CWS-
// routed executor that dispatches to concrete LLM/tool adapters per
// (regime, workload_class) arm selection.
type StepExecutor interface {
	Execute(ctx context.Context, req ExecutionRequest) (ExecutionResult, error)
}

// NoopExecutor returns a synthetic success for every Step without calling
// any external system. It is the default in dev mode so the full scheduler
// path (lease → T1 → run → T2 → release) can be exercised end-to-end
// without provider credentials.
type NoopExecutor struct{}

// Execute implements StepExecutor.
func (NoopExecutor) Execute(ctx context.Context, req ExecutionRequest) (ExecutionResult, error) {
	return ExecutionResult{
		FinalState:  ael.StepSucceeded,
		TokensUsed:  0,
		CostUSD:     0,
		DurationMS:  0,
		OutputRef:   "",
		EventStream: []byte(`{"kind":"noop","note":"flowscheduler NoopExecutor"}`),
	}, nil
}
