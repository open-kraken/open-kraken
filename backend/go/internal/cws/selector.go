package cws

import (
	"context"
	"fmt"
)

// PickRequest is the input to Selector.Pick.
type PickRequest struct {
	Regime        Regime
	WorkloadClass string
}

// PickResult is the selector's answer. Ranked is the full scored list in
// descending order — useful for logs and for Layer-3 "annotation
// priority" (paper §5.2.6) where a second arm with similar score may be
// sampled in the background for data quality.
type PickResult struct {
	Winner Candidate
	Score  float64
	Ranked []Scored
}

// RewardEvent is the input to Selector.Reward. Supplied once a Step has
// reached a terminal state.
type RewardEvent struct {
	Arm     ArmKey
	Outcome Outcome
}

// Selector is the public surface CWS exposes to the rest of the system.
// It combines Catalog, StatsRepo, and a RewardModel behind a stable
// interface so callers never touch those pieces directly.
type Selector interface {
	Pick(ctx context.Context, req PickRequest) (PickResult, error)
	Reward(ctx context.Context, evt RewardEvent) error
}

// UCBSelector is the canonical Selector using UCB-1 over Catalog rows
// scored from StatsRepo stats. It is safe for concurrent use so long as
// the underlying StatsRepo and Catalog are — the selector itself holds
// no state.
type UCBSelector struct {
	catalog     Catalog
	stats       StatsRepo
	rewardModel RewardModel

	// C is the UCB exploration coefficient. Default sqrt(2).
	C float64
}

// Options tunes a UCBSelector at construction time.
type Options struct {
	// C overrides the exploration coefficient. Zero means DefaultExplorationC.
	C float64

	// RewardModel overrides the default. Nil means DefaultRewardModel.
	RewardModel RewardModel
}

// NewUCBSelector constructs a UCBSelector with the given backends. Both
// catalog and stats must be non-nil.
func NewUCBSelector(catalog Catalog, stats StatsRepo, opts Options) *UCBSelector {
	c := opts.C
	if c <= 0 {
		c = DefaultExplorationC
	}
	rm := opts.RewardModel
	if rm == nil {
		rm = DefaultRewardModel{}
	}
	return &UCBSelector{
		catalog:     catalog,
		stats:       stats,
		rewardModel: rm,
		C:           c,
	}
}

// Pick implements Selector.
func (s *UCBSelector) Pick(ctx context.Context, req PickRequest) (PickResult, error) {
	if !req.Regime.IsValid() {
		return PickResult{}, fmt.Errorf("%w: %q", ErrInvalidRegime, req.Regime)
	}

	cands, err := s.catalog.Candidates(ctx, req.Regime, req.WorkloadClass)
	if err != nil {
		return PickResult{}, fmt.Errorf("cws: catalog candidates: %w", err)
	}
	if len(cands) == 0 {
		return PickResult{}, ErrNoCandidates
	}

	// Align every candidate's WorkloadClass with the request so the
	// stats-table key tuples the selector returns are self-consistent
	// even if the Catalog used a wildcard row.
	for i := range cands {
		cands[i].WorkloadClass = req.WorkloadClass
		cands[i].Regime = req.Regime
	}

	arms, err := s.stats.LoadArms(ctx, cands)
	if err != nil {
		return PickResult{}, fmt.Errorf("cws: load stats: %w", err)
	}

	idx, score, ranked := pickByUCB(arms, s.C)
	if idx < 0 {
		return PickResult{}, ErrNoCandidates
	}
	return PickResult{
		Winner: arms[idx].Key,
		Score:  score,
		Ranked: ranked,
	}, nil
}

// Reward implements Selector. The RewardModel translates the Outcome
// into a scalar reward first; StatsRepo persists it.
func (s *UCBSelector) Reward(ctx context.Context, evt RewardEvent) error {
	if !evt.Arm.Regime.IsValid() {
		return fmt.Errorf("%w: %q", ErrInvalidRegime, evt.Arm.Regime)
	}
	r := s.rewardModel.Reward(evt.Arm.Regime, evt.Outcome)
	return s.stats.RecordReward(ctx, evt.Arm, r)
}
