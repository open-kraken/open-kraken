package cws

import (
	"context"
	"sync"
	"time"
)

// StatsRepo is the persistence boundary for scheduling_arm_stats.
//
// Implementations must preserve the paper's mutability invariant
// (Proposition 5.1): rows are monotonically updated (pull_count and
// reward_sum only increase). Deleting or rewriting history is not
// permitted — if you need to re-evaluate a historical reward, add a
// correcting pull rather than overwriting.
type StatsRepo interface {
	// LoadArms fetches the current stats for every (AgentType, Provider)
	// pair in `candidates`, all sharing the same (WorkloadClass, Regime).
	// Arms with no row yet are returned with Pulls=0 so the selector
	// sees them as unexplored (+∞ UCB).
	LoadArms(ctx context.Context, candidates []Candidate) ([]Arm, error)

	// RecordReward upserts a pull result onto the matching row. The
	// implementation is responsible for atomicity of the +=1 / +=r.
	RecordReward(ctx context.Context, key ArmKey, reward float64) error
}

// --- Memory implementation ---

// MemoryStats is an in-process StatsRepo. Intended for tests and single-
// process development; production uses the PG implementation.
type MemoryStats struct {
	mu   sync.Mutex
	rows map[ArmKey]*Arm
}

// NewMemoryStats constructs an empty MemoryStats.
func NewMemoryStats() *MemoryStats {
	return &MemoryStats{rows: make(map[ArmKey]*Arm)}
}

// LoadArms implements StatsRepo.
func (m *MemoryStats) LoadArms(ctx context.Context, candidates []Candidate) ([]Arm, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	out := make([]Arm, 0, len(candidates))
	for _, c := range candidates {
		if row, ok := m.rows[c]; ok {
			copy := *row
			out = append(out, copy)
		} else {
			out = append(out, Arm{Key: c})
		}
	}
	return out, nil
}

// RecordReward implements StatsRepo.
func (m *MemoryStats) RecordReward(ctx context.Context, key ArmKey, reward float64) error {
	if reward < 0 || reward > 1 {
		return ErrInvalidReward
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	row, ok := m.rows[key]
	if !ok {
		row = &Arm{Key: key}
		m.rows[key] = row
	}
	row.Pulls++
	row.RewardSum += reward
	row.RewardSqSum += reward * reward
	row.LastUpdated = time.Now().UTC()
	return nil
}

// Dump returns a snapshot of all rows. Intended for debugging only.
func (m *MemoryStats) Dump() []Arm {
	m.mu.Lock()
	defer m.mu.Unlock()
	out := make([]Arm, 0, len(m.rows))
	for _, r := range m.rows {
		out = append(out, *r)
	}
	return out
}
