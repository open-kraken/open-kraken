package ael

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
)

// This file implements the four AEL transactions from paper Appendix A.3.
//
// Important: in this v2 architecture the authoritative Step Lease lives in etcd
// (see internal/stepLease/). The PG-side T1 below does NOT use
// `SELECT ... FOR UPDATE SKIP LOCKED` as its primary locking mechanism —
// instead it simply mirrors the lease state that the FlowScheduler has already
// successfully established in etcd. The `steps.lease_*` columns are an audit
// mirror, not an authorization source.
//
// T2 remains the most important transaction: it atomically transitions a Step
// to a terminal state and commits its SideEffect records under serializable
// isolation, so there is no intermediate state where the Step appears
// succeeded but its external effects are unknown.

// --- T1: Lease mirror + budget debit ---

// T1LeaseMirrorInput describes a lease assignment that has already succeeded
// in etcd. This call reflects it in the durable PG record and debits the
// Run's token budget.
type T1LeaseMirrorInput struct {
	StepID          string
	RunID           string
	NodeID          string
	InstanceID      string // optional; AgentInstance that will hold the lease
	LeaseExpiresAt  time.Time
	EstimatedTokens int
}

// ErrBudgetExhausted is returned when a Run cannot afford the estimated cost
// of a new Step.
var ErrBudgetExhausted = errors.New("ael: run token budget exhausted")

// T1LeaseMirror records a successful etcd lease in the AEL and debits the
// Run's estimated token cost. Returns ErrBudgetExhausted if the Run cannot
// afford the estimate, in which case the caller must immediately revoke the
// etcd lease.
//
// This is not the authorization point — that was the etcd CAS. This is the
// audit + budget point.
func (r *Repository) T1LeaseMirror(ctx context.Context, in T1LeaseMirrorInput) error {
	tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.ReadCommitted})
	if err != nil {
		return fmt.Errorf("T1: begin: %w", err)
	}
	defer tx.Rollback(ctx)

	// Read current step state.
	var state string
	var version int
	if err := tx.QueryRow(ctx,
		`SELECT state, version FROM steps WHERE id = $1 FOR UPDATE`,
		in.StepID,
	).Scan(&state, &version); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrNotFound
		}
		return fmt.Errorf("T1: read step: %w", err)
	}
	if err := ValidateStepTransition(StepState(state), StepLeased); err != nil {
		return err
	}

	// Debit run budget if requested. A Run with token_budget = 0 is considered
	// unbounded (dev mode).
	if in.EstimatedTokens > 0 {
		tag, err := tx.Exec(ctx, `
			UPDATE runs
			SET tokens_used = tokens_used + $1, updated_at = NOW()
			WHERE id = $2
			  AND (token_budget = 0 OR tokens_used + $1 <= token_budget)`,
			in.EstimatedTokens, in.RunID)
		if err != nil {
			return fmt.Errorf("T1: debit budget: %w", err)
		}
		if tag.RowsAffected() == 0 {
			return ErrBudgetExhausted
		}
	}

	// Write the lease mirror fields.
	_, err = tx.Exec(ctx, `
		UPDATE steps
		SET state = 'leased',
		    lease_node_id = $1,
		    lease_expires_at = $2,
		    instance_id = NULLIF($3, '')::UUID,
		    version = version + 1,
		    updated_at = NOW()
		WHERE id = $4 AND version = $5`,
		in.NodeID, in.LeaseExpiresAt, in.InstanceID, in.StepID, version)
	if err != nil {
		return fmt.Errorf("T1: update step: %w", err)
	}

	return tx.Commit(ctx)
}

// --- T2: Step completion (the correctness cornerstone) ---

// StepCompletionInput carries the final Step outcome plus any SideEffects that
// must commit atomically with it.
type StepCompletionInput struct {
	StepID        string
	RunID         string
	FinalState    StepState // must be StepSucceeded or StepFailed
	TokensUsed    int
	CostUSD       float64
	DurationMS    int
	OutputRef     string
	EventStream   []byte // JSON-encoded AEP event stream
	FailureReason string
	SideEffects   []SideEffect
}

// T2StepComplete atomically transitions a Step to a terminal state, commits
// all of its SideEffect records, and updates the parent Run's cost/tokens.
// Runs under SERIALIZABLE isolation. This is the transaction that guarantees
// the "Step succeeded ⟺ SideEffects committed" property which underpins the
// fault-recovery reasoning in paper §5.3.
func (r *Repository) T2StepComplete(ctx context.Context, in StepCompletionInput) error {
	if in.FinalState != StepSucceeded && in.FinalState != StepFailed {
		return fmt.Errorf("T2: final state must be succeeded or failed, got %s", in.FinalState)
	}

	tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.Serializable})
	if err != nil {
		return fmt.Errorf("T2: begin: %w", err)
	}
	defer tx.Rollback(ctx)

	// Load current Step state + version.
	var (
		currentState string
		version      int
		runID        string
	)
	if err := tx.QueryRow(ctx,
		`SELECT state, version, run_id FROM steps WHERE id = $1`,
		in.StepID,
	).Scan(&currentState, &version, &runID); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrNotFound
		}
		return fmt.Errorf("T2: read step: %w", err)
	}
	if err := ValidateStepTransition(StepState(currentState), in.FinalState); err != nil {
		return err
	}

	// Update step to its terminal state.
	_, err = tx.Exec(ctx, `
		UPDATE steps
		SET state = $1,
		    tokens_used = $2,
		    cost_usd = $3,
		    duration_ms = $4,
		    output_ref = NULLIF($5, ''),
		    event_stream = COALESCE($6::JSONB, event_stream),
		    failure_reason = NULLIF($7, ''),
		    version = version + 1,
		    updated_at = NOW()
		WHERE id = $8 AND version = $9`,
		string(in.FinalState), in.TokensUsed, in.CostUSD, in.DurationMS,
		in.OutputRef, in.EventStream, in.FailureReason,
		in.StepID, version)
	if err != nil {
		return fmt.Errorf("T2: update step: %w", err)
	}

	// Commit all SideEffect records atomically.
	for _, se := range in.SideEffects {
		if err := insertSideEffectTx(ctx, tx, runID, &se); err != nil {
			return fmt.Errorf("T2: side effect seq=%d: %w", se.Seq, err)
		}
	}

	// Update the parent Run's accrued cost / tokens. The run stays in 'running' —
	// a separate Close call on the Run transitions it to a terminal state.
	_, err = tx.Exec(ctx, `
		UPDATE runs
		SET cost_usd = cost_usd + $1,
		    tokens_used = GREATEST(0, tokens_used - COALESCE((
		        SELECT tokens_used FROM steps WHERE id = $2
		    ), 0)) + $3,
		    updated_at = NOW()
		WHERE id = $4`,
		in.CostUSD, in.StepID, in.TokensUsed, runID)
	if err != nil {
		return fmt.Errorf("T2: update run: %w", err)
	}

	return tx.Commit(ctx)
}

// insertSideEffectTx inserts a SideEffect row inside an existing transaction.
func insertSideEffectTx(ctx context.Context, tx pgx.Tx, runID string, se *SideEffect) error {
	if se.State == "" {
		se.State = SECommitted
	}
	if se.IdempotencyClass == "" {
		se.IdempotencyClass = IdempotencyIdempotent
	}
	executedAt := se.ExecutedAt
	if executedAt == nil {
		now := time.Now().UTC()
		executedAt = &now
	}
	const q = `
		INSERT INTO side_effects (
			step_id, run_id, tenant_id, seq, target_system, operation_type,
			idempotency_class, idempotency_key, request_payload, response_payload,
			state, policy_outcome, executed_at
		) VALUES (
			$1, $2, $3, $4, $5, $6, $7, NULLIF($8, ''),
			COALESCE($9::JSONB, '{}'::JSONB), COALESCE($10::JSONB, '{}'::JSONB),
			$11, NULLIF($12, ''), $13
		)
		ON CONFLICT (step_id, seq) DO NOTHING`
	_, err := tx.Exec(ctx, q,
		se.StepID, runID, se.TenantID, se.Seq, se.TargetSystem, se.OperationType,
		string(se.IdempotencyClass), se.IdempotencyKey, se.RequestPayload, se.ResponsePayload,
		string(se.State), se.PolicyOutcome, *executedAt,
	)
	return err
}

// --- T3: Lease renewal mirror ---
//
// The authoritative lease extension lives in etcd; the scheduler calls
// Lease.Keepalive there first. T3 reflects the new expiry into the PG
// mirror so T4 (the expiry scanner) sees a consistent picture. T3 never
// changes Step state — it is a lease-expiry update, not a transition.
//
// Failures here are recoverable (etcd already knows about the renewal);
// callers should log and continue executing.

// T3LeaseRenewalInput carries the new expiry set by a successful etcd
// keepalive. ObservedAt is the clock reading when the keepalive
// succeeded; stored into updated_at so operators can see how current
// the mirror is.
type T3LeaseRenewalInput struct {
	StepID         string
	LeaseExpiresAt time.Time
}

// T3LeaseRenewal updates steps.lease_expires_at to reflect a fresh
// etcd keepalive. Only applies to Steps that are currently leased or
// running — a renewal on a Step that has moved to a terminal state is
// a no-op and returns nil so the caller does not have to special-case
// the race between "last keepalive" and "T2 commit".
func (r *Repository) T3LeaseRenewal(ctx context.Context, in T3LeaseRenewalInput) error {
	const q = `
		UPDATE steps
		SET lease_expires_at = $1,
		    updated_at       = NOW()
		WHERE id = $2 AND state IN ('leased', 'running')`
	_, err := r.pool.Exec(ctx, q, in.LeaseExpiresAt.UTC(), in.StepID)
	if err != nil {
		return fmt.Errorf("T3: update lease expiry: %w", err)
	}
	return nil
}

// --- T4: Lease expiry backup scanner ---
//
// The authoritative expiry path is etcd watch on /leases/step/ (see
// internal/stepLease/). This scanner is the backup: if a watch event is lost
// during a connection drop, the scanner still catches leases whose mirrored
// TTL has passed and restores them to `pending`.

// T4ExpiryScanResult summarises one scanner pass.
type T4ExpiryScanResult struct {
	RecoveredStepIDs []string
}

// T4ExpiryBackupScanner returns any Step rows whose lease_expires_at has passed
// while still in leased/running state, transitioning them back to pending.
// Returns the IDs of steps that were recovered so the FlowScheduler can
// enqueue them for reassignment.
func (r *Repository) T4ExpiryBackupScanner(ctx context.Context, now time.Time) (*T4ExpiryScanResult, error) {
	const q = `
		UPDATE steps
		SET state = 'pending',
		    lease_node_id = NULL,
		    lease_expires_at = NULL,
		    instance_id = NULL,
		    version = version + 1,
		    updated_at = NOW()
		WHERE state IN ('leased', 'running')
		  AND lease_expires_at IS NOT NULL
		  AND lease_expires_at < $1
		RETURNING id`
	rows, err := r.pool.Query(ctx, q, now.UTC())
	if err != nil {
		return nil, fmt.Errorf("T4: scan: %w", err)
	}
	defer rows.Close()

	out := &T4ExpiryScanResult{}
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		out.RecoveredStepIDs = append(out.RecoveredStepIDs, id)
	}
	return out, rows.Err()
}
