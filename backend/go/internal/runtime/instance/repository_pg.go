package instance

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// PGRepository persists AgentInstance snapshots to the `agent_instances`
// table created by AEL migration 003. It takes the pool (not a DSN) so
// callers can reuse the AEL connection budget and so tests can pass in
// a pre-configured pool.
type PGRepository struct {
	pool *pgxpool.Pool
}

// NewPGRepository wraps an existing pgx pool.
func NewPGRepository(pool *pgxpool.Pool) *PGRepository {
	return &PGRepository{pool: pool}
}

// Upsert implements Repository using INSERT ... ON CONFLICT (id) DO UPDATE.
// The snapshot is written whole; any fields the caller left zero stay
// zero on the row (callers should always pass a populated Snapshot).
func (p *PGRepository) Upsert(ctx context.Context, s Snapshot) error {
	if s.ID == "" {
		return errors.New("instance: Upsert requires non-empty Snapshot.ID")
	}
	var terminatedAt interface{}
	if s.TerminatedAt != nil {
		terminatedAt = s.TerminatedAt.UTC()
	}
	const q = `
		INSERT INTO agent_instances (
			id, agent_type, provider, tenant_id, hive_id,
			state, assigned_step,
			spawned_at, last_active, terminated_at, crash_reason, version
		) VALUES (
			$1, $2, $3, NULLIF($4, '')::UUID, NULLIF($5, '')::UUID,
			$6::agent_instance_state, NULLIF($7, '')::UUID,
			$8, $9, $10, NULLIF($11, ''), 0
		)
		ON CONFLICT (id) DO UPDATE SET
			state         = EXCLUDED.state,
			assigned_step = EXCLUDED.assigned_step,
			last_active   = EXCLUDED.last_active,
			terminated_at = EXCLUDED.terminated_at,
			crash_reason  = EXCLUDED.crash_reason,
			version       = agent_instances.version + 1`
	_, err := p.pool.Exec(ctx, q,
		s.ID, s.AgentType, s.Provider, s.TenantID, s.HiveID,
		string(s.State), s.AssignedStep,
		s.SpawnedAt.UTC(), s.LastActive.UTC(), terminatedAt, s.CrashReason,
	)
	if err != nil {
		return fmt.Errorf("instance: upsert: %w", err)
	}
	return nil
}

// LoadLive implements Repository — every non-terminal row.
func (p *PGRepository) LoadLive(ctx context.Context) ([]Snapshot, error) {
	const q = `
		SELECT id, agent_type, provider, tenant_id::TEXT, hive_id::TEXT,
		       state, COALESCE(assigned_step::TEXT, ''),
		       spawned_at, last_active, terminated_at, COALESCE(crash_reason, ''),
		       version
		FROM agent_instances
		WHERE state NOT IN ('terminated', 'crashed')`
	rows, err := p.pool.Query(ctx, q)
	if err != nil {
		return nil, fmt.Errorf("instance: load live: %w", err)
	}
	defer rows.Close()

	var out []Snapshot
	for rows.Next() {
		var s Snapshot
		var state string
		var terminated *time.Time
		if err := rows.Scan(
			&s.ID, &s.AgentType, &s.Provider, &s.TenantID, &s.HiveID,
			&state, &s.AssignedStep,
			&s.SpawnedAt, &s.LastActive, &terminated, &s.CrashReason,
			&s.Version,
		); err != nil {
			return nil, fmt.Errorf("instance: scan: %w", err)
		}
		s.State = State(state)
		s.TerminatedAt = terminated
		out = append(out, s)
	}
	return out, rows.Err()
}

// Delete implements Repository.
func (p *PGRepository) Delete(ctx context.Context, id string) error {
	tag, err := p.pool.Exec(ctx, `DELETE FROM agent_instances WHERE id = $1`, id)
	if err != nil {
		return fmt.Errorf("instance: delete: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// Close implements Repository. The pool is owned by the caller (AEL), so
// we deliberately do not close it here — closing the AEL pool from the
// instance layer would cascade-kill all AEL transactions.
func (p *PGRepository) Close() error { return nil }

// ensure pgx.ErrNoRows references stay imported even if a future refactor
// of LoadLive trims the scan path. No behaviour beyond the compile-time check.
var _ = pgx.ErrNoRows
