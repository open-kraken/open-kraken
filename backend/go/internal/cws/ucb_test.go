package cws

import (
	"math"
	"testing"
)

func armWithStats(agentType, provider string, pulls int64, sumReward float64) Arm {
	return Arm{
		Key: ArmKey{
			AgentType:     agentType,
			Provider:      provider,
			WorkloadClass: "chat",
			Regime:        RegimeOpaque,
		},
		Pulls:     pulls,
		RewardSum: sumReward,
	}
}

func TestUCBScore_UnpulledIsInfinity(t *testing.T) {
	s := ucbScore(armWithStats("a", "p", 0, 0), 100, DefaultExplorationC)
	if !math.IsInf(s, 1) {
		t.Errorf("unpulled arm should be +Inf, got %f", s)
	}
}

func TestUCBScore_PureMeanWhenNoTotalPulls(t *testing.T) {
	// A freshly reset system: total = 0, arm has stats already recorded.
	// ucbScore should collapse to the arm mean.
	arm := armWithStats("a", "p", 3, 2.4) // mean = 0.8
	s := ucbScore(arm, 0, DefaultExplorationC)
	if math.Abs(s-0.8) > 1e-9 {
		t.Errorf("want 0.8, got %f", s)
	}
}

func TestUCBScore_FormulaMatchesHandCalc(t *testing.T) {
	arm := armWithStats("a", "p", 4, 3.0) // mean = 0.75
	// total pulls = 16, c = sqrt(2)
	// ucb = 0.75 + sqrt(2) * sqrt( ln(16) / 4 )
	//     = 0.75 + sqrt(2) * sqrt(2.7726 / 4)
	//     = 0.75 + sqrt(2) * sqrt(0.69315)
	//     ≈ 0.75 + 1.4142 * 0.83255
	//     ≈ 0.75 + 1.17741
	//     ≈ 1.92741
	got := ucbScore(arm, 16, math.Sqrt2)
	want := 0.75 + math.Sqrt2*math.Sqrt(math.Log(16)/4)
	if math.Abs(got-want) > 1e-9 {
		t.Errorf("want %f, got %f", want, got)
	}
}

func TestPickByUCB_PrefersUnpulledArm(t *testing.T) {
	arms := []Arm{
		armWithStats("a", "p1", 100, 80), // mean 0.8, many pulls
		armWithStats("a", "p2", 0, 0),    // never pulled → +Inf wins
	}
	winner, score, _ := pickByUCB(arms, DefaultExplorationC)
	if winner != 1 {
		t.Errorf("unpulled arm should win, got idx=%d score=%f", winner, score)
	}
}

func TestPickByUCB_ExploresLowCountArm(t *testing.T) {
	// Two arms: one pulled a lot with mean 0.7, one pulled once with
	// mean 0.6. UCB should still prefer the more-pulled one because the
	// exploration bonus on n=1 isn't enough to overtake 0.7.
	// But if we reduce pulls on the high-mean arm far enough, UCB
	// should flip. We test the canonical exploration behaviour.
	arms := []Arm{
		armWithStats("a", "high", 500, 350), // mean 0.7, n=500
		armWithStats("a", "low", 1, 0.6),    // mean 0.6, n=1
	}
	winner, _, ranked := pickByUCB(arms, DefaultExplorationC)
	if winner != 1 {
		// With only 1 pull and total ~501, exploration term ≈ sqrt(2) * sqrt(ln(501)/1)
		// ≈ 1.41 * 2.49 ≈ 3.52, so "low" arm score ≈ 0.6+3.52 = 4.12, which beats "high" ≈ 0.7+tiny.
		t.Errorf("expected exploration to pick low-n arm, got %d (ranks=%+v)", winner, ranked)
	}
}

func TestPickByUCB_StableWithNoPulls(t *testing.T) {
	arms := []Arm{
		armWithStats("a", "p1", 0, 0),
		armWithStats("a", "p2", 0, 0),
		armWithStats("a", "p3", 0, 0),
	}
	winner, _, _ := pickByUCB(arms, DefaultExplorationC)
	if winner != 0 {
		// All arms +Inf; max() picks the first encountered.
		t.Errorf("expected first arm to win deterministically, got %d", winner)
	}
}

func TestPickByUCB_EmptyReturnsSentinels(t *testing.T) {
	winner, score, ranked := pickByUCB(nil, DefaultExplorationC)
	if winner != -1 || score != 0 || ranked != nil {
		t.Errorf("empty input: got (%d, %f, %v)", winner, score, ranked)
	}
}

func TestArmMean_HandlesZeroDivision(t *testing.T) {
	if armWithStats("a", "p", 0, 10).Mean() != 0 {
		t.Errorf("unpulled mean should be 0")
	}
}

func TestArmVariance_ZeroBelowTwoPulls(t *testing.T) {
	a := Arm{Pulls: 1, RewardSum: 0.7, RewardSqSum: 0.49}
	if a.Variance() != 0 {
		t.Errorf("variance with n<2 should be 0, got %f", a.Variance())
	}
}

func TestArmVariance_BiasedEstimator(t *testing.T) {
	// Rewards {0.5, 0.7, 0.9}: mean = 0.7, E[x^2] = (0.25+0.49+0.81)/3 = 0.5167
	// Var = 0.5167 - 0.49 = 0.0267 (biased/population variance)
	a := Arm{Pulls: 3, RewardSum: 2.1, RewardSqSum: 1.55}
	got := a.Variance()
	want := 1.55/3 - (2.1/3)*(2.1/3)
	if math.Abs(got-want) > 1e-9 {
		t.Errorf("want %f, got %f", want, got)
	}
}
