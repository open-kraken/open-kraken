package cws

import (
	"context"
	"errors"
	"testing"
)

func makeCandidates() []Candidate {
	return []Candidate{
		{AgentType: "assistant", Provider: "anthropic", WorkloadClass: "chat", Regime: RegimeOpaque},
		{AgentType: "assistant", Provider: "openai", WorkloadClass: "chat", Regime: RegimeOpaque},
	}
}

func TestUCBSelector_PickWithEmptyStatsReturnsFirstUnexplored(t *testing.T) {
	ctx := context.Background()
	cat := NewStaticCatalog(makeCandidates()...)
	stats := NewMemoryStats()
	sel := NewUCBSelector(cat, stats, Options{})

	res, err := sel.Pick(ctx, PickRequest{Regime: RegimeOpaque, WorkloadClass: "chat"})
	if err != nil {
		t.Fatalf("Pick: %v", err)
	}
	// With both arms unpulled, the first in catalog order wins.
	if res.Winner.Provider != "anthropic" {
		t.Errorf("want first unexplored (anthropic), got %+v", res.Winner)
	}
	if len(res.Ranked) != 2 {
		t.Errorf("want 2 ranked, got %d", len(res.Ranked))
	}
}

func TestUCBSelector_PickAfterRewardsSteersTowardHighMean(t *testing.T) {
	ctx := context.Background()
	cat := NewStaticCatalog(makeCandidates()...)
	stats := NewMemoryStats()
	sel := NewUCBSelector(cat, stats, Options{})

	// Seed anthropic with 50 pulls and reward ~0.9.
	anthropicKey := ArmKey{AgentType: "assistant", Provider: "anthropic", WorkloadClass: "chat", Regime: RegimeOpaque}
	for i := 0; i < 45; i++ {
		_ = stats.RecordReward(ctx, anthropicKey, 1.0)
	}
	for i := 0; i < 5; i++ {
		_ = stats.RecordReward(ctx, anthropicKey, 0.0)
	}
	// Seed openai with 50 pulls and reward ~0.3.
	openaiKey := ArmKey{AgentType: "assistant", Provider: "openai", WorkloadClass: "chat", Regime: RegimeOpaque}
	for i := 0; i < 15; i++ {
		_ = stats.RecordReward(ctx, openaiKey, 1.0)
	}
	for i := 0; i < 35; i++ {
		_ = stats.RecordReward(ctx, openaiKey, 0.0)
	}

	res, err := sel.Pick(ctx, PickRequest{Regime: RegimeOpaque, WorkloadClass: "chat"})
	if err != nil {
		t.Fatalf("Pick: %v", err)
	}
	if res.Winner.Provider != "anthropic" {
		t.Errorf("after learning, anthropic should win; got %+v", res.Winner)
	}
}

func TestUCBSelector_PickErrsOnInvalidRegime(t *testing.T) {
	ctx := context.Background()
	sel := NewUCBSelector(NewStaticCatalog(), NewMemoryStats(), Options{})
	_, err := sel.Pick(ctx, PickRequest{Regime: "UNKNOWN", WorkloadClass: "chat"})
	if !errors.Is(err, ErrInvalidRegime) {
		t.Errorf("want ErrInvalidRegime, got %v", err)
	}
}

func TestUCBSelector_PickErrsOnEmptyCatalog(t *testing.T) {
	ctx := context.Background()
	sel := NewUCBSelector(NewStaticCatalog(), NewMemoryStats(), Options{})
	_, err := sel.Pick(ctx, PickRequest{Regime: RegimeOpaque, WorkloadClass: "chat"})
	if !errors.Is(err, ErrNoCandidates) {
		t.Errorf("want ErrNoCandidates, got %v", err)
	}
}

func TestUCBSelector_RewardTranslatesOutcome(t *testing.T) {
	ctx := context.Background()
	stats := NewMemoryStats()
	sel := NewUCBSelector(NewStaticCatalog(), stats, Options{})

	key := ArmKey{AgentType: "a", Provider: "p", WorkloadClass: "w", Regime: RegimeOpaque}
	// Success → reward 1.
	if err := sel.Reward(ctx, RewardEvent{Arm: key, Outcome: Outcome{Succeeded: true}}); err != nil {
		t.Fatalf("Reward success: %v", err)
	}
	// Failure → reward 0.
	if err := sel.Reward(ctx, RewardEvent{Arm: key, Outcome: Outcome{Succeeded: false}}); err != nil {
		t.Fatalf("Reward failure: %v", err)
	}
	arms, _ := stats.LoadArms(ctx, []Candidate{key})
	if arms[0].Pulls != 2 {
		t.Errorf("pulls: want 2, got %d", arms[0].Pulls)
	}
	if arms[0].RewardSum != 1.0 {
		t.Errorf("reward sum: want 1.0, got %f", arms[0].RewardSum)
	}
}

func TestUCBSelector_RewardErrsOnInvalidRegime(t *testing.T) {
	ctx := context.Background()
	sel := NewUCBSelector(NewStaticCatalog(), NewMemoryStats(), Options{})
	err := sel.Reward(ctx, RewardEvent{Arm: ArmKey{Regime: ""}})
	if !errors.Is(err, ErrInvalidRegime) {
		t.Errorf("want ErrInvalidRegime, got %v", err)
	}
}

func TestStaticCatalog_WorkloadClassWildcard(t *testing.T) {
	ctx := context.Background()
	cat := NewStaticCatalog(
		Candidate{AgentType: "a", Provider: "p", WorkloadClass: "", Regime: RegimeOpaque},
	)
	cands, err := cat.Candidates(ctx, RegimeOpaque, "chat")
	if err != nil {
		t.Fatalf("Candidates: %v", err)
	}
	if len(cands) != 1 {
		t.Fatalf("want 1 candidate, got %d", len(cands))
	}
	if cands[0].WorkloadClass != "chat" {
		t.Errorf("wildcard should be expanded; got %q", cands[0].WorkloadClass)
	}
}

func TestDefaultRewardModel_OpaqueFailureIsZero(t *testing.T) {
	rm := DefaultRewardModel{}
	if rm.Reward(RegimeOpaque, Outcome{Succeeded: false}) != 0 {
		t.Error("OPAQUE failure must be 0")
	}
}

func TestDefaultRewardModel_VerifiableUsesSignal(t *testing.T) {
	rm := DefaultRewardModel{}
	if rm.Reward(RegimeVerifiable, Outcome{VerifierSignal: 0.42}) != 0.42 {
		t.Error("VERIFIABLE with signal should pass through")
	}
	if rm.Reward(RegimeVerifiable, Outcome{VerifierSignal: 1.5}) != 1 {
		t.Error("VERIFIABLE signal should clamp at 1")
	}
	if rm.Reward(RegimeVerifiable, Outcome{VerifierSignal: -1, Succeeded: true}) != 1 {
		t.Error("VERIFIABLE without signal falls back to success indicator")
	}
}

// End-to-end sanity: a selector driven in a short loop learns which arm
// is better and biases toward it.
func TestUCBSelector_ConvergesOnBetterArm(t *testing.T) {
	ctx := context.Background()
	good := Candidate{AgentType: "a", Provider: "good", WorkloadClass: "chat", Regime: RegimeOpaque}
	bad := Candidate{AgentType: "a", Provider: "bad", WorkloadClass: "chat", Regime: RegimeOpaque}
	cat := NewStaticCatalog(good, bad)
	stats := NewMemoryStats()
	sel := NewUCBSelector(cat, stats, Options{})

	rewards := map[string]float64{
		"good": 0.9,
		"bad":  0.1,
	}
	goodCount := 0
	const N = 200
	for i := 0; i < N; i++ {
		res, err := sel.Pick(ctx, PickRequest{Regime: RegimeOpaque, WorkloadClass: "chat"})
		if err != nil {
			t.Fatalf("Pick: %v", err)
		}
		if res.Winner.Provider == "good" {
			goodCount++
		}
		r := rewards[res.Winner.Provider]
		_ = sel.Reward(ctx, RewardEvent{Arm: res.Winner, Outcome: Outcome{Succeeded: r > 0.5}})
	}
	// Expect clear majority on the good arm (UCB converges quickly
	// when the gap is large). A conservative bound is > 60%.
	if float64(goodCount)/float64(N) < 0.6 {
		t.Errorf("expected > 60%% pulls on good arm, got %d/%d", goodCount, N)
	}
}
