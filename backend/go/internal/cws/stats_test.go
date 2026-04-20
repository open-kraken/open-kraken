package cws

import (
	"context"
	"errors"
	"testing"
)

func TestMemoryStats_LoadAndRecord(t *testing.T) {
	ctx := context.Background()
	m := NewMemoryStats()

	key := ArmKey{
		AgentType:     "planner",
		Provider:      "anthropic",
		WorkloadClass: "chat",
		Regime:        RegimeOpaque,
	}

	// Load before any record: zero arm returned.
	arms, err := m.LoadArms(ctx, []Candidate{key})
	if err != nil {
		t.Fatalf("LoadArms: %v", err)
	}
	if len(arms) != 1 || arms[0].Pulls != 0 || arms[0].Key != key {
		t.Errorf("want zero arm for %+v, got %+v", key, arms)
	}

	// Record two rewards.
	if err := m.RecordReward(ctx, key, 1.0); err != nil {
		t.Fatalf("RecordReward 1: %v", err)
	}
	if err := m.RecordReward(ctx, key, 0.5); err != nil {
		t.Fatalf("RecordReward 2: %v", err)
	}

	arms, err = m.LoadArms(ctx, []Candidate{key})
	if err != nil {
		t.Fatalf("LoadArms after: %v", err)
	}
	if arms[0].Pulls != 2 {
		t.Errorf("pulls: want 2, got %d", arms[0].Pulls)
	}
	if arms[0].RewardSum != 1.5 {
		t.Errorf("reward sum: want 1.5, got %f", arms[0].RewardSum)
	}
	if arms[0].RewardSqSum != 1.0+0.25 {
		t.Errorf("reward sq sum: want 1.25, got %f", arms[0].RewardSqSum)
	}
}

func TestMemoryStats_RejectsInvalidReward(t *testing.T) {
	ctx := context.Background()
	m := NewMemoryStats()
	key := ArmKey{AgentType: "a", Provider: "p", WorkloadClass: "w", Regime: RegimeOpaque}

	if err := m.RecordReward(ctx, key, -0.1); !errors.Is(err, ErrInvalidReward) {
		t.Errorf("want ErrInvalidReward for -0.1, got %v", err)
	}
	if err := m.RecordReward(ctx, key, 1.1); !errors.Is(err, ErrInvalidReward) {
		t.Errorf("want ErrInvalidReward for 1.1, got %v", err)
	}
}

func TestMemoryStats_ZeroArmForMissingCandidate(t *testing.T) {
	ctx := context.Background()
	m := NewMemoryStats()
	present := ArmKey{AgentType: "p", Provider: "anthropic", WorkloadClass: "chat", Regime: RegimeOpaque}
	absent := ArmKey{AgentType: "p", Provider: "openai", WorkloadClass: "chat", Regime: RegimeOpaque}

	if err := m.RecordReward(ctx, present, 0.7); err != nil {
		t.Fatalf("seed: %v", err)
	}
	arms, err := m.LoadArms(ctx, []Candidate{present, absent})
	if err != nil {
		t.Fatalf("LoadArms: %v", err)
	}
	if len(arms) != 2 {
		t.Fatalf("want 2 arms, got %d", len(arms))
	}
	if arms[0].Pulls != 1 || arms[1].Pulls != 0 {
		t.Errorf("order/values wrong: %+v", arms)
	}
}

func TestMemoryStats_Dump(t *testing.T) {
	ctx := context.Background()
	m := NewMemoryStats()
	_ = m.RecordReward(ctx, ArmKey{AgentType: "a", Provider: "p1", WorkloadClass: "w", Regime: RegimeOpaque}, 0.8)
	_ = m.RecordReward(ctx, ArmKey{AgentType: "a", Provider: "p2", WorkloadClass: "w", Regime: RegimeOpaque}, 0.3)
	rows := m.Dump()
	if len(rows) != 2 {
		t.Errorf("want 2 rows, got %d", len(rows))
	}
}
