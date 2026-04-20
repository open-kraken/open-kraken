package instance

import (
	"context"
	"fmt"
)

// RestoreStats reports the outcome of a Restore call. Returned to the
// server boot path so it can log a concise summary.
type RestoreStats struct {
	// Restored is the count of snapshots re-materialised into the
	// in-memory pool (state in idle / scheduled / suspended / resumed
	// / created).
	Restored int

	// Crashed is the count of snapshots whose state was `running`
	// before the process died — we cannot recover mid-execution L1
	// context so they are marked crashed and their Steps are left for
	// T4 recovery.
	Crashed int

	// Skipped is the count of snapshots already terminal (should be
	// zero because LoadLive filters them, but kept for defensiveness).
	Skipped int
}

// Restore re-materialises a Manager's pool from its Repository. Intended
// to be called once at server startup, BEFORE the FlowScheduler is
// started, so the scheduler never sees a ghost pool.
//
// Policy:
//
//   - running / leased-analog states → mark crashed in place. Any
//     assigned Step is left alone (the Step's FSM, not this table, owns
//     recovery; T4's expiry scanner will drag orphaned leases back to
//     pending).
//   - idle / scheduled / suspended / resumed / created → reinstate the
//     in-memory AgentInstance so subsequent Spawn calls can pick it up.
//     L1 context is empty on restore (paper §5.4.2 — L1 is ephemeral).
//
// Errors from Repository operations are propagated; the Manager's
// in-memory state only reflects rows that restored cleanly.
func (m *Manager) Restore(ctx context.Context) (RestoreStats, error) {
	if m.repo == nil {
		return RestoreStats{}, ErrNoRepository
	}
	rows, err := m.repo.LoadLive(ctx)
	if err != nil {
		return RestoreStats{}, fmt.Errorf("instance restore: %w", err)
	}

	var stats RestoreStats
	for _, s := range rows {
		if IsTerminal(s.State) {
			stats.Skipped++
			continue
		}
		switch s.State {
		case StateRunning:
			// Mid-execution crash. Mark crashed and persist. We create
			// a transient AgentInstance so fireChange writes a correct
			// row; we do NOT add it to the pool.
			inst := rehydrate(s)
			m.wirePersistence(inst)
			if err := inst.Crash("process restart: instance was running"); err != nil {
				// The running→crashed transition is legal; a failure
				// here is a bug rather than a policy issue. Return.
				return stats, fmt.Errorf("instance restore: crash transition: %w", err)
			}
			stats.Crashed++
		default:
			inst := rehydrate(s)
			m.wirePersistence(inst)
			m.registerRestored(inst)
			stats.Restored++
		}
	}
	return stats, nil
}

// rehydrate constructs an AgentInstance at the state captured in s.
// Exported fields are fixed; L1 context is an empty map (paper
// §5.4.2 — "context_l1_ref is NULL for cold instances").
func rehydrate(s Snapshot) *AgentInstance {
	a := &AgentInstance{
		id:           s.ID,
		agentType:    s.AgentType,
		provider:     s.Provider,
		tenantID:     s.TenantID,
		hiveID:       s.HiveID,
		state:        s.State,
		assignedStep: s.AssignedStep,
		contextL1:    make(map[string]any),
		spawnedAt:    s.SpawnedAt,
		lastActive:   s.LastActive,
		crashReason:  s.CrashReason,
	}
	if s.TerminatedAt != nil {
		a.terminatedAt = *s.TerminatedAt
	}
	return a
}

// registerRestored inserts a rehydrated AgentInstance into the pool
// without emitting the "created" FSM transition (it's already at some
// non-terminal state).
func (m *Manager) registerRestored(inst *AgentInstance) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.byID[inst.id] = inst
	key := poolKey{AgentType: inst.agentType, Provider: inst.provider, TenantID: inst.tenantID}
	bucket, ok := m.byPool[key]
	if !ok {
		bucket = make(map[string]*AgentInstance)
		m.byPool[key] = bucket
	}
	bucket[inst.id] = inst
}
