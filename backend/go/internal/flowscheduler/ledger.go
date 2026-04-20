package flowscheduler

import (
	"context"
	"time"

	"open-kraken/backend/go/internal/ael"
)

// Ledger is the subset of ael.Service that the scheduler depends on. It is
// declared here so unit tests can supply a fake without spinning up
// PostgreSQL. *ael.Service satisfies this interface.
type Ledger interface {
	// PendingSteps returns up to `limit` Steps in the pending state.
	// Empty tenantID means all tenants (single-tenant dev default).
	PendingSteps(ctx context.Context, tenantID string, limit int) ([]ael.Step, error)

	// LeaseMirror records a successful Step Lease acquisition in AEL and
	// debits the Run's estimated token budget. Returns ael.ErrBudgetExhausted
	// when the Run cannot afford the estimate.
	LeaseMirror(ctx context.Context, in ael.T1LeaseMirrorInput) error

	// MarkStepRunning transitions a Step from leased → running after an
	// AgentInstance has accepted the assignment.
	MarkStepRunning(ctx context.Context, stepID string) error

	// CompleteStep runs T2: atomic Step terminal transition +
	// SideEffect commit + Run cost update under serializable isolation.
	CompleteStep(ctx context.Context, in ael.StepCompletionInput) error

	// CancelStep transitions a pending Step to cancelled. Used when the
	// Run has exhausted its token budget.
	CancelStep(ctx context.Context, stepID string) error

	// ExpiryScan runs T4: a backup scan that moves any Step whose
	// mirrored lease has expired while still in leased/running back to
	// pending. The real implementation delegates to Repository.
	ExpiryScan(ctx context.Context, now time.Time) (*ael.T4ExpiryScanResult, error)

	// EnsureRunRunning transitions a Run from pending → running if it is
	// still pending. Idempotent.
	EnsureRunRunning(ctx context.Context, runID string) error

	// EnsureFlowRunning transitions a Flow toward running through any
	// intermediate FSM steps. Idempotent. assignedNode is recorded when
	// the Flow's assigned_node is still empty.
	EnsureFlowRunning(ctx context.Context, flowID, assignedNode string) error

	// TryFinalizeFlow checks whether all Steps under a Flow are terminal
	// and, if so, transitions the Flow to the appropriate aggregate
	// terminal state. Returns true iff a transition was made.
	TryFinalizeFlow(ctx context.Context, flowID string) (bool, error)

	// TryFinalizeRun is the Flow-aware equivalent at the Run layer.
	TryFinalizeRun(ctx context.Context, runID string) (bool, error)

	// FlowRunID returns the RunID of a Flow. The scheduler needs this
	// after a Flow finalizes so it can attempt to finalize the parent Run.
	FlowRunID(ctx context.Context, flowID string) (string, error)

	// UpdateStepArm records a CWS-selected (agent_type, provider) pair
	// on a Step. Only legal while the Step is still pending.
	UpdateStepArm(ctx context.Context, stepID, agentType, provider string) error

	// RenewLease mirrors a fresh etcd keepalive into the PG
	// steps.lease_expires_at column. Never changes Step state; a
	// failure is non-fatal (the etcd side is authoritative).
	RenewLease(ctx context.Context, stepID string, expiresAt time.Time) error

	// CreateRetryStep inserts a new Step chained to `parent` via
	// retry_of (paper §5.3). The parent's state is NOT mutated;
	// the new row is pending, inherits flow_id / run_id / tenant /
	// regime / workload_class / agent_type / provider / event_stream
	// from parent, and has retry_count = parent.RetryCount + 1.
	CreateRetryStep(ctx context.Context, parent *ael.Step) (*ael.Step, error)
}

// ledgerAdapter wraps *ael.Service so the scheduler can consume it via the
// Ledger interface. Keeping the wrapper here (rather than adding a method
// on ael.Service) avoids leaking scheduler-specific concerns into AEL.
type ledgerAdapter struct {
	svc *ael.Service
}

// NewServiceLedger adapts an *ael.Service into the Ledger interface.
func NewServiceLedger(svc *ael.Service) Ledger {
	return &ledgerAdapter{svc: svc}
}

func (l *ledgerAdapter) PendingSteps(ctx context.Context, tenantID string, limit int) ([]ael.Step, error) {
	return l.svc.PendingSteps(ctx, tenantID, limit)
}

func (l *ledgerAdapter) LeaseMirror(ctx context.Context, in ael.T1LeaseMirrorInput) error {
	return l.svc.LeaseMirror(ctx, in)
}

func (l *ledgerAdapter) MarkStepRunning(ctx context.Context, stepID string) error {
	return l.svc.MarkStepRunning(ctx, stepID)
}

func (l *ledgerAdapter) CompleteStep(ctx context.Context, in ael.StepCompletionInput) error {
	return l.svc.CompleteStep(ctx, in)
}

func (l *ledgerAdapter) CancelStep(ctx context.Context, stepID string) error {
	return l.svc.CancelStep(ctx, stepID)
}

func (l *ledgerAdapter) ExpiryScan(ctx context.Context, now time.Time) (*ael.T4ExpiryScanResult, error) {
	return l.svc.Repo().T4ExpiryBackupScanner(ctx, now)
}

func (l *ledgerAdapter) EnsureRunRunning(ctx context.Context, runID string) error {
	return l.svc.EnsureRunRunning(ctx, runID)
}

func (l *ledgerAdapter) EnsureFlowRunning(ctx context.Context, flowID, assignedNode string) error {
	return l.svc.EnsureFlowRunning(ctx, flowID, assignedNode)
}

func (l *ledgerAdapter) TryFinalizeFlow(ctx context.Context, flowID string) (bool, error) {
	return l.svc.TryFinalizeFlow(ctx, flowID)
}

func (l *ledgerAdapter) TryFinalizeRun(ctx context.Context, runID string) (bool, error) {
	return l.svc.TryFinalizeRun(ctx, runID)
}

func (l *ledgerAdapter) FlowRunID(ctx context.Context, flowID string) (string, error) {
	flow, err := l.svc.GetFlow(ctx, flowID)
	if err != nil {
		return "", err
	}
	return flow.RunID, nil
}

func (l *ledgerAdapter) UpdateStepArm(ctx context.Context, stepID, agentType, provider string) error {
	return l.svc.UpdateStepArm(ctx, stepID, agentType, provider)
}

func (l *ledgerAdapter) RenewLease(ctx context.Context, stepID string, expiresAt time.Time) error {
	return l.svc.RenewLease(ctx, ael.T3LeaseRenewalInput{
		StepID:         stepID,
		LeaseExpiresAt: expiresAt,
	})
}

func (l *ledgerAdapter) CreateRetryStep(ctx context.Context, parent *ael.Step) (*ael.Step, error) {
	return l.svc.CreateRetryStep(ctx, parent)
}
