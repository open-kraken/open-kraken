package cws

import (
	"context"
	"fmt"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"
)

// PGStats implements StatsRepo against the scheduling_arm_stats table
// created by ael migration 002.
//
// The table's PRIMARY KEY is (agent_type, provider, workload_class,
// regime) so every row maps 1:1 to an ArmKey. RecordReward uses an
// ON CONFLICT upsert so a brand-new arm row is created atomically on
// its first pull.
type PGStats struct {
	pool *pgxpool.Pool
}

// NewPGStats wraps an existing pgx pool. Taking the pool (not the DSN)
// lets callers share the AEL pool and keeps connection budgets
// predictable.
func NewPGStats(pool *pgxpool.Pool) *PGStats {
	return &PGStats{pool: pool}
}

// LoadArms implements StatsRepo.
//
// Every candidate is returned with its current stats, or zeroed if the
// row doesn't exist yet (so the selector treats it as unexplored). A
// single IN query covers every candidate — no N+1.
func (p *PGStats) LoadArms(ctx context.Context, candidates []Candidate) ([]Arm, error) {
	if len(candidates) == 0 {
		return nil, nil
	}

	// Build a 4-tuple IN clause using unnest.
	agentTypes := make([]string, len(candidates))
	providers := make([]string, len(candidates))
	classes := make([]string, len(candidates))
	regimes := make([]string, len(candidates))
	for i, c := range candidates {
		agentTypes[i] = c.AgentType
		providers[i] = c.Provider
		classes[i] = c.WorkloadClass
		regimes[i] = string(c.Regime)
	}

	const q = `
		SELECT agent_type, provider, workload_class, regime,
		       pull_count, reward_sum, reward_sq_sum, last_updated
		FROM scheduling_arm_stats
		WHERE (agent_type, provider, workload_class, regime) IN (
			SELECT a, p, w, r::step_regime
			FROM unnest($1::text[], $2::text[], $3::text[], $4::text[])
			AS t(a, p, w, r)
		)`

	rows, err := p.pool.Query(ctx, q, agentTypes, providers, classes, regimes)
	if err != nil {
		return nil, fmt.Errorf("cws: load arms: %w", err)
	}
	defer rows.Close()

	found := make(map[ArmKey]Arm, len(candidates))
	for rows.Next() {
		var a Arm
		var regime string
		if err := rows.Scan(
			&a.Key.AgentType, &a.Key.Provider, &a.Key.WorkloadClass, &regime,
			&a.Pulls, &a.RewardSum, &a.RewardSqSum, &a.LastUpdated,
		); err != nil {
			return nil, fmt.Errorf("cws: scan arm: %w", err)
		}
		a.Key.Regime = Regime(regime)
		found[a.Key] = a
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	// Return one entry per candidate in input order. Missing rows
	// are returned as zero-value arms so the selector can treat them
	// as +∞ UCB.
	out := make([]Arm, 0, len(candidates))
	for _, c := range candidates {
		if a, ok := found[c]; ok {
			out = append(out, a)
		} else {
			out = append(out, Arm{Key: c})
		}
	}
	return out, nil
}

// RecordReward implements StatsRepo with an ON CONFLICT upsert. A single
// row-level UPDATE is sufficient because the table is keyed exactly on
// the ArmKey tuple.
func (p *PGStats) RecordReward(ctx context.Context, key ArmKey, reward float64) error {
	if reward < 0 || reward > 1 {
		return ErrInvalidReward
	}
	if strings.TrimSpace(string(key.Regime)) == "" {
		return ErrInvalidRegime
	}
	const q = `
		INSERT INTO scheduling_arm_stats (
			agent_type, provider, workload_class, regime,
			pull_count, reward_sum, reward_sq_sum, last_updated
		) VALUES ($1, $2, $3, $4::step_regime, 1, $5, $6, NOW())
		ON CONFLICT (agent_type, provider, workload_class, regime) DO UPDATE
		SET pull_count    = scheduling_arm_stats.pull_count + 1,
		    reward_sum    = scheduling_arm_stats.reward_sum + EXCLUDED.reward_sum,
		    reward_sq_sum = scheduling_arm_stats.reward_sq_sum + EXCLUDED.reward_sq_sum,
		    last_updated  = NOW()`
	_, err := p.pool.Exec(ctx, q,
		key.AgentType, key.Provider, key.WorkloadClass, string(key.Regime),
		reward, reward*reward)
	if err != nil {
		return fmt.Errorf("cws: record reward: %w", err)
	}
	return nil
}
