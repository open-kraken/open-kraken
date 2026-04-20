package cws

import (
	"math"
	"testing"
)

func nearly(t *testing.T, got, want float64) {
	t.Helper()
	if math.Abs(got-want) > 1e-9 {
		t.Errorf("want %f, got %f", want, got)
	}
}

func TestBudgetAware_AlphaZeroEqualsDefault(t *testing.T) {
	m := BudgetAwareRewardModel{Alpha: 0, CostBaseline: 0.01}
	d := DefaultRewardModel{}
	cases := []Outcome{
		{Succeeded: true, CostUSD: 0.005},
		{Succeeded: false, CostUSD: 0.005},
		{Succeeded: true, CostUSD: 0},
	}
	for i, o := range cases {
		if m.Reward(RegimeOpaque, o) != d.Reward(RegimeOpaque, o) {
			t.Errorf("case %d: Alpha=0 must match DefaultRewardModel", i)
		}
	}
}

func TestBudgetAware_FailureAlwaysZero(t *testing.T) {
	m := BudgetAwareRewardModel{Alpha: 0.5, CostBaseline: 0.01}
	r := m.Reward(RegimeOpaque, Outcome{Succeeded: false, CostUSD: 0.001})
	if r != 0 {
		t.Errorf("failure must yield 0 regardless of cost, got %f", r)
	}
}

func TestBudgetAware_NoCostNoPenalty(t *testing.T) {
	m := BudgetAwareRewardModel{Alpha: 0.5, CostBaseline: 0.01}
	r := m.Reward(RegimeOpaque, Outcome{Succeeded: true, CostUSD: 0})
	nearly(t, r, 1.0)
}

func TestBudgetAware_BaselineMissingNoPenalty(t *testing.T) {
	m := BudgetAwareRewardModel{Alpha: 0.5, CostBaseline: 0} // misconfig
	r := m.Reward(RegimeOpaque, Outcome{Succeeded: true, CostUSD: 0.005})
	nearly(t, r, 1.0)
}

func TestBudgetAware_LinearScaling(t *testing.T) {
	m := BudgetAwareRewardModel{Alpha: 0.5, CostBaseline: 0.01}
	// ratio = 0.5 → factor = 1 - 0.5*0.5 = 0.75
	nearly(t, m.Reward(RegimeOpaque, Outcome{Succeeded: true, CostUSD: 0.005}), 0.75)
	// ratio = 1 → factor = 1 - 0.5*1 = 0.5
	nearly(t, m.Reward(RegimeOpaque, Outcome{Succeeded: true, CostUSD: 0.01}), 0.5)
	// ratio > 1 → clamped to 1 → same 0.5
	nearly(t, m.Reward(RegimeOpaque, Outcome{Succeeded: true, CostUSD: 0.1}), 0.5)
}

func TestBudgetAware_AlphaOneFullyCostDriven(t *testing.T) {
	m := BudgetAwareRewardModel{Alpha: 1.0, CostBaseline: 0.01}
	// ratio 0.1 → factor 0.9 → reward 0.9
	nearly(t, m.Reward(RegimeOpaque, Outcome{Succeeded: true, CostUSD: 0.001}), 0.9)
	// ratio 1.0 → factor 0 → reward 0 (equal to a free provider's failure)
	nearly(t, m.Reward(RegimeOpaque, Outcome{Succeeded: true, CostUSD: 0.01}), 0)
}

func TestBudgetAware_VerifiableComposition(t *testing.T) {
	// VERIFIABLE signal 0.8 × cost factor (alpha 0.5, ratio 0.5, factor 0.75)
	// → 0.8 × 0.75 = 0.6
	m := BudgetAwareRewardModel{Alpha: 0.5, CostBaseline: 0.01}
	r := m.Reward(RegimeVerifiable, Outcome{Succeeded: true, CostUSD: 0.005, VerifierSignal: 0.8})
	nearly(t, r, 0.6)
}

func TestBudgetAware_ClampsToUnitInterval(t *testing.T) {
	// Baseline 0 + Alpha 0 case is already covered; this guards against
	// a future misconfiguration where base > 1.
	m := BudgetAwareRewardModel{Alpha: 0.1, CostBaseline: 0.01}
	r := m.Reward(RegimeVerifiable, Outcome{Succeeded: true, VerifierSignal: 2.0})
	// Verifier clamped to 1 by baseReward; no cost → factor 1 → 1.
	nearly(t, r, 1.0)
}
