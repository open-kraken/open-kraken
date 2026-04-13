package instance

import (
	"testing"
)

func TestFSM_HappyPath(t *testing.T) {
	// created → scheduled → running → idle → running → idle → terminated
	path := []State{
		StateCreated,
		StateScheduled,
		StateRunning,
		StateIdle,
		StateRunning,
		StateIdle,
		StateTerminated,
	}
	for i := 0; i < len(path)-1; i++ {
		if err := Validate(path[i], path[i+1]); err != nil {
			t.Errorf("want nil for %s → %s, got %v", path[i], path[i+1], err)
		}
	}
}

func TestFSM_SuspendResume(t *testing.T) {
	cases := [][2]State{
		{StateRunning, StateSuspended},
		{StateSuspended, StateResumed},
		{StateResumed, StateRunning},
	}
	for _, c := range cases {
		if err := Validate(c[0], c[1]); err != nil {
			t.Errorf("want nil for %s → %s, got %v", c[0], c[1], err)
		}
	}
}

func TestFSM_TerminalAbsorbing(t *testing.T) {
	terminals := []State{StateTerminated, StateCrashed}
	allStates := []State{
		StateCreated, StateScheduled, StateRunning, StateIdle,
		StateSuspended, StateResumed, StateTerminated, StateCrashed,
	}
	for _, from := range terminals {
		for _, to := range allStates {
			if from == to {
				continue
			}
			if err := Validate(from, to); err == nil {
				t.Errorf("want error for terminal %s → %s, got nil", from, to)
			}
		}
	}
}

func TestFSM_CannotSkipScheduled(t *testing.T) {
	// created → running must go through scheduled.
	if err := Validate(StateCreated, StateRunning); err == nil {
		t.Errorf("want error for created → running, got nil")
	}
}

func TestAgentInstance_L1PersistAcrossSteps(t *testing.T) {
	inst := New("inst-1", "researcher", "claude", "tenant-a", "hive-1")
	if err := inst.Schedule(); err != nil {
		t.Fatalf("Schedule: %v", err)
	}

	// First Step
	if err := inst.AssignStep("step-1"); err != nil {
		t.Fatalf("AssignStep 1: %v", err)
	}
	inst.SetContext("recent_facts", []string{"fact1", "fact2"})
	if err := inst.CompleteStep(); err != nil {
		t.Fatalf("CompleteStep 1: %v", err)
	}

	// Second Step — identity and context must persist.
	if err := inst.AssignStep("step-2"); err != nil {
		t.Fatalf("AssignStep 2: %v", err)
	}
	v, ok := inst.GetContext("recent_facts")
	if !ok {
		t.Error("context lost between steps")
	}
	if facts, _ := v.([]string); len(facts) != 2 {
		t.Errorf("want 2 facts, got %v", v)
	}
}

func TestManager_SpawnAcquireReap(t *testing.T) {
	mgr := NewManager()
	defer mgr.Close()

	inst, err := mgr.Spawn("researcher", "claude", "tenant-a", "hive-1")
	if err != nil {
		t.Fatalf("Spawn: %v", err)
	}
	if inst.State() != StateScheduled {
		t.Errorf("want scheduled, got %s", inst.State())
	}

	// AcquireIdle should return the scheduled instance (idle-or-scheduled).
	got := mgr.AcquireIdle("researcher", "claude", "tenant-a")
	if got == nil || got.ID() != inst.ID() {
		t.Errorf("want %s from AcquireIdle, got %v", inst.ID(), got)
	}

	// Reap refuses to remove a live instance.
	mgr.Reap(inst.ID())
	if _, ok := mgr.Get(inst.ID()); !ok {
		t.Error("Reap removed live instance (should refuse)")
	}

	// After terminate + reap, the instance is gone.
	if err := inst.Terminate(); err != nil {
		t.Fatalf("Terminate: %v", err)
	}
	mgr.Reap(inst.ID())
	if _, ok := mgr.Get(inst.ID()); ok {
		t.Error("Reap did not remove terminated instance")
	}
}

func TestAgentInstance_CrashRecordsReason(t *testing.T) {
	inst := New("inst-2", "r", "p", "t", "h")
	_ = inst.Schedule()
	_ = inst.AssignStep("s1")
	if err := inst.Crash("provider timeout"); err != nil {
		t.Fatalf("Crash: %v", err)
	}
	if inst.State() != StateCrashed {
		t.Errorf("want crashed, got %s", inst.State())
	}
	if inst.CrashReason() != "provider timeout" {
		t.Errorf("want 'provider timeout', got %q", inst.CrashReason())
	}
}
