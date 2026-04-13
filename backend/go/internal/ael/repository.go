package ael

import (
	"context"
	"embed"
	"errors"
	"fmt"
	"io/fs"
	"sort"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// ErrVersionConflict is returned by optimistic-concurrency updates when the
// expected row version did not match. Callers should reload and retry.
var ErrVersionConflict = errors.New("ael: version conflict")

// ErrNotFound is returned when a record lookup misses.
var ErrNotFound = errors.New("ael: not found")

//go:embed migrations/*.sql
var migrationFS embed.FS

// Repository is the low-level pgx-backed data access layer for the AEL.
// Higher-level transactions (T1/T2/T3/T4) are implemented in tx.go on top
// of this API.
type Repository struct {
	pool *pgxpool.Pool
}

// NewRepository connects to PostgreSQL and applies embedded migrations.
func NewRepository(ctx context.Context, dsn string) (*Repository, error) {
	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		return nil, fmt.Errorf("ael: pgx pool: %w", err)
	}
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("ael: postgres ping: %w", err)
	}
	r := &Repository{pool: pool}
	if err := r.applyMigrations(ctx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("ael: migrate: %w", err)
	}
	return r, nil
}

// Close releases the connection pool.
func (r *Repository) Close() {
	if r.pool != nil {
		r.pool.Close()
	}
}

// Pool exposes the underlying connection pool for transaction primitives in tx.go.
func (r *Repository) Pool() *pgxpool.Pool { return r.pool }

func (r *Repository) applyMigrations(ctx context.Context) error {
	entries, err := fs.ReadDir(migrationFS, "migrations")
	if err != nil {
		return fmt.Errorf("read embedded migrations: %w", err)
	}
	names := make([]string, 0, len(entries))
	for _, e := range entries {
		if e.IsDir() || !strings.HasSuffix(e.Name(), ".sql") {
			continue
		}
		names = append(names, e.Name())
	}
	sort.Strings(names)

	if _, err := r.pool.Exec(ctx, `
		CREATE TABLE IF NOT EXISTS ael_schema_migrations (
			filename   TEXT PRIMARY KEY,
			applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		)`); err != nil {
		return fmt.Errorf("ensure migrations table: %w", err)
	}

	for _, name := range names {
		var exists bool
		if err := r.pool.QueryRow(ctx,
			`SELECT EXISTS (SELECT 1 FROM ael_schema_migrations WHERE filename = $1)`,
			name).Scan(&exists); err != nil {
			return fmt.Errorf("check migration %s: %w", name, err)
		}
		if exists {
			continue
		}
		body, err := fs.ReadFile(migrationFS, "migrations/"+name)
		if err != nil {
			return fmt.Errorf("read migration %s: %w", name, err)
		}
		tx, err := r.pool.Begin(ctx)
		if err != nil {
			return fmt.Errorf("begin migration %s: %w", name, err)
		}
		if _, err := tx.Exec(ctx, string(body)); err != nil {
			_ = tx.Rollback(ctx)
			return fmt.Errorf("apply migration %s: %w", name, err)
		}
		if _, err := tx.Exec(ctx,
			`INSERT INTO ael_schema_migrations (filename) VALUES ($1)`, name); err != nil {
			_ = tx.Rollback(ctx)
			return fmt.Errorf("record migration %s: %w", name, err)
		}
		if err := tx.Commit(ctx); err != nil {
			return fmt.Errorf("commit migration %s: %w", name, err)
		}
	}
	return nil
}

// --- Run ---

// InsertRun creates a new Run row. The caller is expected to populate
// TenantID and HiveID at minimum; ID may be empty (Postgres assigns a UUID).
func (r *Repository) InsertRun(ctx context.Context, run *Run) error {
	const q = `
		INSERT INTO runs (tenant_id, hive_id, state, policy_set_id, token_budget, objective)
		VALUES ($1, $2, $3, NULLIF($4, '')::UUID, $5, $6)
		RETURNING id, version, created_at, updated_at`
	if run.State == "" {
		run.State = RunPending
	}
	return r.pool.QueryRow(ctx, q,
		run.TenantID, run.HiveID, string(run.State), run.PolicySetID, run.TokenBudget, run.Objective,
	).Scan(&run.ID, &run.Version, &run.CreatedAt, &run.UpdatedAt)
}

// GetRun loads a Run by ID.
func (r *Repository) GetRun(ctx context.Context, id string) (*Run, error) {
	const q = `
		SELECT id, tenant_id, hive_id, state, COALESCE(policy_set_id::TEXT, ''),
		       token_budget, tokens_used, cost_usd, objective,
		       version, created_at, updated_at
		FROM runs WHERE id = $1`
	run := &Run{}
	var state string
	err := r.pool.QueryRow(ctx, q, id).Scan(
		&run.ID, &run.TenantID, &run.HiveID, &state, &run.PolicySetID,
		&run.TokenBudget, &run.TokensUsed, &run.CostUSD, &run.Objective,
		&run.Version, &run.CreatedAt, &run.UpdatedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	run.State = RunState(state)
	return run, nil
}

// UpdateRunState transitions a Run to `to` using the FSM validator and
// optimistic concurrency. Callers must supply the expected current version.
func (r *Repository) UpdateRunState(ctx context.Context, id string, expectedVersion int, to RunState) error {
	current, err := r.GetRun(ctx, id)
	if err != nil {
		return err
	}
	if current.Version != expectedVersion {
		return ErrVersionConflict
	}
	if err := ValidateRunTransition(current.State, to); err != nil {
		return err
	}
	tag, err := r.pool.Exec(ctx, `
		UPDATE runs SET state = $1, version = version + 1, updated_at = NOW()
		WHERE id = $2 AND version = $3`,
		string(to), id, expectedVersion)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrVersionConflict
	}
	return nil
}

// --- Flow ---

func (r *Repository) InsertFlow(ctx context.Context, flow *Flow) error {
	const q = `
		INSERT INTO flows (run_id, tenant_id, agent_role, assigned_node, state)
		VALUES ($1, $2, $3, NULLIF($4, ''), $5)
		RETURNING id, version, created_at, updated_at`
	if flow.State == "" {
		flow.State = FlowPending
	}
	return r.pool.QueryRow(ctx, q,
		flow.RunID, flow.TenantID, flow.AgentRole, flow.AssignedNode, string(flow.State),
	).Scan(&flow.ID, &flow.Version, &flow.CreatedAt, &flow.UpdatedAt)
}

func (r *Repository) GetFlow(ctx context.Context, id string) (*Flow, error) {
	const q = `
		SELECT id, run_id, tenant_id, agent_role, COALESCE(assigned_node, ''), state, version, created_at, updated_at
		FROM flows WHERE id = $1`
	flow := &Flow{}
	var state string
	err := r.pool.QueryRow(ctx, q, id).Scan(
		&flow.ID, &flow.RunID, &flow.TenantID, &flow.AgentRole, &flow.AssignedNode,
		&state, &flow.Version, &flow.CreatedAt, &flow.UpdatedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	flow.State = FlowState(state)
	return flow, nil
}

// --- Step ---

func (r *Repository) InsertStep(ctx context.Context, step *Step) error {
	const q = `
		INSERT INTO steps (flow_id, run_id, tenant_id, state, regime, workload_class,
		                   agent_type, provider)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		RETURNING id, version, created_at, updated_at`
	if step.State == "" {
		step.State = StepPending
	}
	if step.Regime == "" {
		step.Regime = RegimeOpaque
	}
	if step.WorkloadClass == "" {
		step.WorkloadClass = "unknown"
	}
	return r.pool.QueryRow(ctx, q,
		step.FlowID, step.RunID, step.TenantID,
		string(step.State), string(step.Regime), step.WorkloadClass,
		step.AgentType, step.Provider,
	).Scan(&step.ID, &step.Version, &step.CreatedAt, &step.UpdatedAt)
}

func (r *Repository) GetStep(ctx context.Context, id string) (*Step, error) {
	const q = `
		SELECT id, flow_id, run_id, tenant_id, state, regime, workload_class,
		       COALESCE(lease_node_id, ''), lease_expires_at,
		       COALESCE(instance_id::TEXT, ''), COALESCE(agent_id, ''), COALESCE(agent_type, ''),
		       COALESCE(provider, ''), COALESCE(input_ref, ''), input_hash,
		       event_stream, COALESCE(output_ref, ''),
		       COALESCE(tokens_used, 0), COALESCE(cost_usd, 0), COALESCE(duration_ms, 0),
		       COALESCE(failure_reason, ''),
		       version, created_at, updated_at
		FROM steps WHERE id = $1`
	step := &Step{}
	var state, regime string
	err := r.pool.QueryRow(ctx, q, id).Scan(
		&step.ID, &step.FlowID, &step.RunID, &step.TenantID, &state, &regime, &step.WorkloadClass,
		&step.LeaseNodeID, &step.LeaseExpiresAt,
		&step.InstanceID, &step.AgentID, &step.AgentType,
		&step.Provider, &step.InputRef, &step.InputHash,
		&step.EventStreamRaw, &step.OutputRef,
		&step.TokensUsed, &step.CostUSD, &step.DurationMS,
		&step.FailureReason,
		&step.Version, &step.CreatedAt, &step.UpdatedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	step.State = StepState(state)
	step.Regime = StepRegime(regime)
	return step, nil
}

// ListRuns returns runs filtered by optional tenantID and state, newest first.
func (r *Repository) ListRuns(ctx context.Context, tenantID string, state RunState, limit int) ([]Run, error) {
	if limit <= 0 {
		limit = 50
	}
	const q = `
		SELECT id, tenant_id, hive_id, state, COALESCE(policy_set_id::TEXT, ''),
		       token_budget, tokens_used, cost_usd, objective,
		       version, created_at, updated_at
		FROM runs
		WHERE ($1 = '' OR tenant_id::TEXT = $1)
		  AND ($2 = '' OR state = $2)
		ORDER BY created_at DESC
		LIMIT $3`
	rows, err := r.pool.Query(ctx, q, tenantID, string(state), limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Run
	for rows.Next() {
		var ru Run
		var s string
		if err := rows.Scan(
			&ru.ID, &ru.TenantID, &ru.HiveID, &s, &ru.PolicySetID,
			&ru.TokenBudget, &ru.TokensUsed, &ru.CostUSD, &ru.Objective,
			&ru.Version, &ru.CreatedAt, &ru.UpdatedAt,
		); err != nil {
			return nil, err
		}
		ru.State = RunState(s)
		out = append(out, ru)
	}
	return out, rows.Err()
}

// ListFlowsByRun returns all flows belonging to a Run.
func (r *Repository) ListFlowsByRun(ctx context.Context, runID string) ([]Flow, error) {
	const q = `
		SELECT id, run_id, tenant_id, agent_role, COALESCE(assigned_node, ''), state, version, created_at, updated_at
		FROM flows WHERE run_id = $1 ORDER BY created_at ASC`
	rows, err := r.pool.Query(ctx, q, runID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Flow
	for rows.Next() {
		var f Flow
		var s string
		if err := rows.Scan(
			&f.ID, &f.RunID, &f.TenantID, &f.AgentRole, &f.AssignedNode,
			&s, &f.Version, &f.CreatedAt, &f.UpdatedAt,
		); err != nil {
			return nil, err
		}
		f.State = FlowState(s)
		out = append(out, f)
	}
	return out, rows.Err()
}

// ListStepsByFlow returns all steps belonging to a Flow.
func (r *Repository) ListStepsByFlow(ctx context.Context, flowID string) ([]Step, error) {
	const q = `
		SELECT id, flow_id, run_id, tenant_id, state, regime, workload_class,
		       COALESCE(agent_type, ''), COALESCE(provider, ''),
		       version, created_at, updated_at
		FROM steps WHERE flow_id = $1 ORDER BY created_at ASC`
	rows, err := r.pool.Query(ctx, q, flowID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Step
	for rows.Next() {
		var s Step
		var state, regime string
		if err := rows.Scan(
			&s.ID, &s.FlowID, &s.RunID, &s.TenantID, &state, &regime, &s.WorkloadClass,
			&s.AgentType, &s.Provider,
			&s.Version, &s.CreatedAt, &s.UpdatedAt,
		); err != nil {
			return nil, err
		}
		s.State = StepState(state)
		s.Regime = StepRegime(regime)
		out = append(out, s)
	}
	return out, rows.Err()
}

// ListSideEffectsByStep returns all side effects for a Step.
func (r *Repository) ListSideEffectsByStep(ctx context.Context, stepID string) ([]SideEffect, error) {
	const q = `
		SELECT id, step_id, run_id, tenant_id, seq, target_system, operation_type,
		       idempotency_class, COALESCE(idempotency_key, ''), request_payload, response_payload,
		       state, COALESCE(policy_outcome, ''), executed_at, created_at
		FROM side_effects WHERE step_id = $1 ORDER BY seq ASC`
	rows, err := r.pool.Query(ctx, q, stepID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []SideEffect
	for rows.Next() {
		var se SideEffect
		var state, idempClass string
		if err := rows.Scan(
			&se.ID, &se.StepID, &se.RunID, &se.TenantID, &se.Seq,
			&se.TargetSystem, &se.OperationType,
			&idempClass, &se.IdempotencyKey, &se.RequestPayload, &se.ResponsePayload,
			&state, &se.PolicyOutcome, &se.ExecutedAt, &se.CreatedAt,
		); err != nil {
			return nil, err
		}
		se.State = SideEffectState(state)
		se.IdempotencyClass = IdempotencyClass(idempClass)
		out = append(out, se)
	}
	return out, rows.Err()
}

// ListPendingSteps returns up to `limit` steps in the pending state, ordered
// by creation time. Used by FlowScheduler's poll loop.
func (r *Repository) ListPendingSteps(ctx context.Context, tenantID string, limit int) ([]Step, error) {
	if limit <= 0 {
		limit = 50
	}
	const q = `
		SELECT id, flow_id, run_id, tenant_id, state, regime, workload_class,
		       COALESCE(agent_type, ''), COALESCE(provider, ''),
		       version, created_at, updated_at
		FROM steps
		WHERE state = 'pending' AND ($1 = '' OR tenant_id::TEXT = $1)
		ORDER BY created_at ASC
		LIMIT $2`
	rows, err := r.pool.Query(ctx, q, tenantID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []Step
	for rows.Next() {
		var s Step
		var state, regime string
		if err := rows.Scan(
			&s.ID, &s.FlowID, &s.RunID, &s.TenantID, &state, &regime, &s.WorkloadClass,
			&s.AgentType, &s.Provider,
			&s.Version, &s.CreatedAt, &s.UpdatedAt,
		); err != nil {
			return nil, err
		}
		s.State = StepState(state)
		s.Regime = StepRegime(regime)
		out = append(out, s)
	}
	return out, rows.Err()
}
