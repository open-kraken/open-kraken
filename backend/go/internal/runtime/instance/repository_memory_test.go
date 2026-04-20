package instance

import (
	"context"
	"testing"
	"time"
)

func TestMemoryRepository_UpsertAndLoad(t *testing.T) {
	repo := NewMemoryRepository()
	ctx := context.Background()

	s := Snapshot{
		ID:         "a1",
		AgentType:  "assistant",
		Provider:   "anthropic",
		TenantID:   "t1",
		HiveID:     "h1",
		State:      StateIdle,
		SpawnedAt:  time.Now().Add(-time.Hour),
		LastActive: time.Now(),
	}
	if err := repo.Upsert(ctx, s); err != nil {
		t.Fatalf("Upsert: %v", err)
	}

	live, err := repo.LoadLive(ctx)
	if err != nil {
		t.Fatalf("LoadLive: %v", err)
	}
	if len(live) != 1 || live[0].ID != "a1" {
		t.Errorf("LoadLive: want [a1], got %+v", live)
	}
}

func TestMemoryRepository_UpsertIncrementsVersion(t *testing.T) {
	repo := NewMemoryRepository()
	ctx := context.Background()
	s := Snapshot{ID: "a2", State: StateIdle}
	_ = repo.Upsert(ctx, s)
	_ = repo.Upsert(ctx, s)
	_ = repo.Upsert(ctx, s)
	live, _ := repo.LoadLive(ctx)
	if live[0].Version != 2 {
		t.Errorf("expected version 2 after 3 upserts, got %d", live[0].Version)
	}
}

func TestMemoryRepository_LoadLiveSkipsTerminal(t *testing.T) {
	repo := NewMemoryRepository()
	ctx := context.Background()
	_ = repo.Upsert(ctx, Snapshot{ID: "live", State: StateRunning})
	_ = repo.Upsert(ctx, Snapshot{ID: "term", State: StateTerminated})
	_ = repo.Upsert(ctx, Snapshot{ID: "crash", State: StateCrashed})

	live, err := repo.LoadLive(ctx)
	if err != nil {
		t.Fatalf("LoadLive: %v", err)
	}
	if len(live) != 1 || live[0].ID != "live" {
		t.Errorf("want only [live], got %+v", live)
	}

	// DumpAll still returns all rows, including terminal ones.
	all := repo.DumpAll()
	if len(all) != 3 {
		t.Errorf("DumpAll: want 3, got %d", len(all))
	}
}

func TestMemoryRepository_Delete(t *testing.T) {
	repo := NewMemoryRepository()
	ctx := context.Background()
	_ = repo.Upsert(ctx, Snapshot{ID: "x", State: StateIdle})
	if err := repo.Delete(ctx, "x"); err != nil {
		t.Fatalf("Delete: %v", err)
	}
	if err := repo.Delete(ctx, "x"); err == nil {
		t.Errorf("second delete should return ErrNotFound")
	}
}
