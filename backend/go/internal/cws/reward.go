package cws

// Outcome is the minimum information the RewardModel needs to assign a
// reward to a terminated Step. Keeping it narrow (no ael types) lets
// external integrations plug in domain-specific signals — e.g. a code
// execution harness can translate "tests passed" into Outcome.Success
// without knowing about AEL schemas.
type Outcome struct {
	// Succeeded mirrors ael.StepSucceeded; a terminal failure sets this
	// to false and carries a reason forward via the caller's logs.
	Succeeded bool

	// TokensUsed and CostUSD are the actual provider-reported usage.
	TokensUsed int
	CostUSD    float64

	// DurationMS is the executor wall-clock duration.
	DurationMS int

	// VerifierSignal is populated for VERIFIABLE regime outcomes —
	// values in [0, 1] directly override the default success indicator.
	// Negative means "no signal"; the OPAQUE default path ignores it.
	VerifierSignal float64
}

// RewardModel maps a terminal Step outcome into a reward in [0, 1]. The
// interface is intentionally Regime-aware so a future VERIFIABLE model
// can consume VerifierSignal while OPAQUE ignores it.
type RewardModel interface {
	Reward(regime Regime, o Outcome) float64
}

// DefaultRewardModel implements RewardModel for all three regimes in the
// simplest defensible way:
//
//   - OPAQUE: 1 if succeeded, 0 otherwise. The fallback when no verifier
//     exists — matches the paper's conservative baseline (§5.2.2).
//   - VERIFIABLE: VerifierSignal when ≥ 0, else succeeded-as-OPAQUE.
//   - PROXIED: same as OPAQUE for now. Proxied reward requires a DAG
//     attribution step that lands in a later slice (paper §5.2.4); this
//     placeholder at least keeps the stats table monotonic.
type DefaultRewardModel struct{}

// Reward implements RewardModel.
func (DefaultRewardModel) Reward(regime Regime, o Outcome) float64 {
	return baseReward(regime, o)
}

// baseReward is the success/verifier-signal mapping shared by
// DefaultRewardModel and BudgetAwareRewardModel. Keeping it in one
// place means VERIFIABLE-regime behaviour is identical across all
// reward models — cost-awareness is layered on top, not substituted.
func baseReward(regime Regime, o Outcome) float64 {
	switch regime {
	case RegimeVerifiable:
		if o.VerifierSignal >= 0 {
			if o.VerifierSignal > 1 {
				return 1
			}
			return o.VerifierSignal
		}
		if o.Succeeded {
			return 1
		}
		return 0
	case RegimeProxied, RegimeOpaque:
		if o.Succeeded {
			return 1
		}
		return 0
	default:
		if o.Succeeded {
			return 1
		}
		return 0
	}
}

// BudgetAwareRewardModel wraps the default success/verifier logic with a
// cost-sensitive multiplier so CWS's UCB arm selection tilts toward
// cheaper arms at equal quality (paper §5.2.6 budget-aware tail).
//
// Formula:
//
//	base = baseReward(regime, o)               // 0, 1, or verifier signal
//	ratio = min(1, CostUSD / CostBaseline)
//	cost_factor = 1 - Alpha × ratio
//	reward = base × cost_factor
//
// Degenerate cases:
//
//   - Alpha = 0 → reward == baseReward (pure success-driven; same as
//     DefaultRewardModel).
//   - CostUSD = 0 → cost_factor = 1 (no observation; keep base reward).
//     This is the common path when providers don't expose pricing
//     (e.g. self-hosted models) or when a Step is free.
//   - CostBaseline ≤ 0 → treated as "no baseline configured" and the
//     model collapses to baseReward to avoid division-by-zero.
//
// Never returns a negative value. Clamps to [0, 1] on output.
type BudgetAwareRewardModel struct {
	// Alpha is the cost-sensitivity weight, in [0, 1]. 0 disables
	// cost influence; 1 makes reward scale linearly with 1 - ratio.
	Alpha float64

	// CostBaseline is the dollar cost at which the cost penalty fully
	// applies (ratio = 1). Steps cheaper than this get a mild penalty;
	// steps more expensive than this are clamped at the full penalty.
	// A reasonable default is "median cost per Step for the workload,"
	// tuned per deployment.
	CostBaseline float64
}

// Reward implements RewardModel.
func (m BudgetAwareRewardModel) Reward(regime Regime, o Outcome) float64 {
	base := baseReward(regime, o)
	if base == 0 {
		return 0
	}
	if m.Alpha <= 0 || m.CostBaseline <= 0 || o.CostUSD <= 0 {
		return clamp01(base)
	}
	ratio := o.CostUSD / m.CostBaseline
	if ratio > 1 {
		ratio = 1
	}
	factor := 1 - m.Alpha*ratio
	if factor < 0 {
		factor = 0
	}
	return clamp01(base * factor)
}

func clamp01(v float64) float64 {
	switch {
	case v < 0:
		return 0
	case v > 1:
		return 1
	default:
		return v
	}
}
