package instance

import (
	"context"
	"errors"
	"time"
)

// Snapshot is the durable projection of an AgentInstance. It captures
// the identity and lifecycle fields the `agent_instances` table mirrors
// but deliberately omits L1 context — live context is kept in memory
// (`AgentInstance.contextL1`) and is lost on crash. A future slice can
// promote L1 to its own store via `context_l1_ref`; v1 leaves that
// pointer NULL.
type Snapshot struct {
	ID            string
	AgentType     string
	Provider      string
	TenantID      string
	HiveID        string
	State         State
	AssignedStep  string
	SpawnedAt     time.Time
	LastActive    time.Time
	TerminatedAt  *time.Time
	CrashReason   string
	Version       int
}

// Repository is the persistence boundary for AgentInstance state. It is
// declared here (consumer-side) so the Manager depends on an interface,
// not on a concrete PG type. Alternative backends (Redis, etcd, sqlite)
// can plug in without touching the runtime.
//
// Implementations must be safe for concurrent use — Upsert fires from
// AgentInstance state transitions, which can interleave across goroutines.
type Repository interface {
	// Upsert writes the current Snapshot, creating the row on the
	// first call and updating on subsequent ones. The caller supplies
	// the full snapshot; implementations SHOULD NOT derive values
	// from older rows so a single write fully reflects the Go state.
	Upsert(ctx context.Context, s Snapshot) error

	// LoadLive returns every row whose state is not terminal. Used at
	// startup to restore or reap the in-memory pool after a restart.
	// Terminal rows are preserved in the database for audit but do not
	// need to be handed back.
	LoadLive(ctx context.Context) ([]Snapshot, error)

	// Delete removes a Snapshot permanently. Rarely used — most callers
	// prefer to leave terminated/crashed rows in place as an audit
	// trail and call Delete only when reaping for space.
	Delete(ctx context.Context, id string) error

	// Close releases backend resources. Safe to call multiple times.
	Close() error
}

// ErrNoRepository signals that a persistence-requiring operation was
// invoked on a Manager constructed without a Repository. Callers that
// opt into persistence explicitly should never see this; dev-mode
// Managers (no Repository) surface it so the caller can decide whether
// to degrade or fail.
var ErrNoRepository = errors.New("instance: no persistence repository configured")

// ErrNotFound is returned when a Snapshot lookup misses in the backing store.
var ErrNotFound = errors.New("instance: snapshot not found")

// snapshotFromInstance builds a Snapshot from an in-memory *AgentInstance.
// Kept as a package-private helper so Repository callers never have to
// know AgentInstance internals.
func snapshotFromInstance(a *AgentInstance) Snapshot {
	a.mu.RLock()
	defer a.mu.RUnlock()
	var terminatedAt *time.Time
	if !a.terminatedAt.IsZero() {
		tt := a.terminatedAt
		terminatedAt = &tt
	}
	return Snapshot{
		ID:           a.id,
		AgentType:    a.agentType,
		Provider:     a.provider,
		TenantID:     a.tenantID,
		HiveID:       a.hiveID,
		State:        a.state,
		AssignedStep: a.assignedStep,
		SpawnedAt:    a.spawnedAt,
		LastActive:   a.lastActive,
		TerminatedAt: terminatedAt,
		CrashReason:  a.crashReason,
	}
}
