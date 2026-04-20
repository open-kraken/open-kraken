package instance

import (
	"context"
	"testing"
	"time"
)

func TestManager_PersistsOnSpawnAndTransition(t *testing.T) {
	repo := NewMemoryRepository()
	mgr := NewManagerWithRepository(repo, nil)

	inst, err := mgr.Spawn("assistant", "anthropic", "t1", "h1")
	if err != nil {
		t.Fatalf("Spawn: %v", err)
	}

	// Spawn itself advances created → scheduled, so the repo should
	// already have the snapshot at StateScheduled.
	live, err := repo.LoadLive(context.Background())
	if err != nil {
		t.Fatalf("LoadLive: %v", err)
	}
	if len(live) != 1 {
		t.Fatalf("want 1 row after Spawn, got %d", len(live))
	}
	if live[0].State != StateScheduled {
		t.Errorf("row state: want scheduled, got %s", live[0].State)
	}

	// Advance to running + assign step; snapshot must follow.
	if err := inst.AssignStep("step-1"); err != nil {
		t.Fatalf("AssignStep: %v", err)
	}
	live, _ = repo.LoadLive(context.Background())
	if live[0].State != StateRunning || live[0].AssignedStep != "step-1" {
		t.Errorf("after AssignStep: got state=%s step=%s", live[0].State, live[0].AssignedStep)
	}

	// Terminate: must disappear from LoadLive but remain in DumpAll.
	if err := inst.CompleteStep(); err != nil {
		t.Fatalf("CompleteStep: %v", err)
	}
	if err := inst.Terminate(); err != nil {
		t.Fatalf("Terminate: %v", err)
	}
	live, _ = repo.LoadLive(context.Background())
	if len(live) != 0 {
		t.Errorf("expected 0 live after terminate, got %d", len(live))
	}
	if len(repo.DumpAll()) != 1 {
		t.Errorf("terminated row should stay in DumpAll for audit")
	}
}

func TestManager_RestoreIdleInstance(t *testing.T) {
	repo := NewMemoryRepository()
	ctx := context.Background()
	// Simulate a prior process that left an idle row behind.
	seed := Snapshot{
		ID:         "pre-existing",
		AgentType:  "assistant",
		Provider:   "anthropic",
		TenantID:   "t1",
		HiveID:     "h1",
		State:      StateIdle,
		SpawnedAt:  time.Now().Add(-time.Hour),
		LastActive: time.Now().Add(-time.Minute),
	}
	_ = repo.Upsert(ctx, seed)

	mgr := NewManagerWithRepository(repo, nil)
	stats, err := mgr.Restore(ctx)
	if err != nil {
		t.Fatalf("Restore: %v", err)
	}
	if stats.Restored != 1 || stats.Crashed != 0 {
		t.Errorf("stats: want restored=1 crashed=0, got %+v", stats)
	}
	inst, ok := mgr.Get("pre-existing")
	if !ok {
		t.Fatal("restored instance not in pool")
	}
	if inst.State() != StateIdle {
		t.Errorf("restored state: want idle, got %s", inst.State())
	}
	// AcquireIdle should see the rehydrated instance immediately.
	if got := mgr.AcquireIdle("assistant", "anthropic", "t1"); got == nil || got.ID() != "pre-existing" {
		t.Errorf("AcquireIdle missed the restored instance")
	}
}

func TestManager_RestoreRunningInstanceIsCrashed(t *testing.T) {
	repo := NewMemoryRepository()
	ctx := context.Background()
	seed := Snapshot{
		ID:           "mid-exec",
		AgentType:    "assistant",
		Provider:     "anthropic",
		TenantID:     "t1",
		HiveID:       "h1",
		State:        StateRunning,
		AssignedStep: "step-42",
		SpawnedAt:    time.Now().Add(-time.Hour),
		LastActive:   time.Now(),
	}
	_ = repo.Upsert(ctx, seed)

	mgr := NewManagerWithRepository(repo, nil)
	stats, err := mgr.Restore(ctx)
	if err != nil {
		t.Fatalf("Restore: %v", err)
	}
	if stats.Crashed != 1 || stats.Restored != 0 {
		t.Errorf("stats: want crashed=1 restored=0, got %+v", stats)
	}
	// Crashed row must NOT be in the pool.
	if _, ok := mgr.Get("mid-exec"); ok {
		t.Errorf("crashed instance should not be in the live pool")
	}
	// But the row is persisted as crashed now.
	all := repo.DumpAll()
	if len(all) != 1 || all[0].State != StateCrashed {
		t.Errorf("persisted state: want crashed, got %+v", all)
	}
	if all[0].CrashReason == "" {
		t.Errorf("crash reason should be populated")
	}
}

func TestManager_RestoreFailsWithoutRepo(t *testing.T) {
	mgr := NewManager()
	if _, err := mgr.Restore(context.Background()); err != ErrNoRepository {
		t.Errorf("want ErrNoRepository, got %v", err)
	}
}

func TestManager_ManagerWithoutRepositoryBehavesAsBefore(t *testing.T) {
	mgr := NewManager()
	inst, err := mgr.Spawn("assistant", "anthropic", "t1", "h1")
	if err != nil {
		t.Fatalf("Spawn: %v", err)
	}
	// Should not panic even though onChange is nil.
	if err := inst.AssignStep("s"); err != nil {
		t.Fatalf("AssignStep: %v", err)
	}
}
