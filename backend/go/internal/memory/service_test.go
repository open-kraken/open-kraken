package memory

import (
	"context"
	"errors"
	"sync"
	"testing"
	"time"
)

// inMemoryMemRepo is a thread-safe in-memory MemoryRepository for tests.
type inMemoryMemRepo struct {
	mu      sync.RWMutex
	entries map[string]MemoryEntry
	now     func() time.Time
}

func newInMemoryMemRepo() *inMemoryMemRepo {
	return &inMemoryMemRepo{
		entries: make(map[string]MemoryEntry),
		now:     time.Now,
	}
}

func (r *inMemoryMemRepo) Upsert(_ context.Context, e MemoryEntry) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	k := entryKey(e.Scope, e.Key)
	now := r.now()
	if existing, ok := r.entries[k]; ok {
		e.CreatedAt = existing.CreatedAt
	} else {
		e.CreatedAt = now
	}
	e.UpdatedAt = now
	r.entries[k] = e
	return nil
}

func (r *inMemoryMemRepo) Get(_ context.Context, scope Scope, key string) (MemoryEntry, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	e, ok := r.entries[entryKey(scope, key)]
	if !ok {
		return MemoryEntry{}, ErrNotFound
	}
	if e.IsExpired(r.now()) {
		return MemoryEntry{}, ErrNotFound
	}
	return e, nil
}

func (r *inMemoryMemRepo) Delete(_ context.Context, scope Scope, key string) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	k := entryKey(scope, key)
	if _, ok := r.entries[k]; !ok {
		return ErrNotFound
	}
	delete(r.entries, k)
	return nil
}

func (r *inMemoryMemRepo) ListByScope(_ context.Context, scope Scope) ([]MemoryEntry, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	now := r.now()
	var out []MemoryEntry
	for _, e := range r.entries {
		if e.Scope != scope || e.IsExpired(now) {
			continue
		}
		out = append(out, e)
	}
	return out, nil
}

func newTestMemService() (*Service, *inMemoryMemRepo) {
	repo := newInMemoryMemRepo()
	svc := NewService(repo)
	svc.now = repo.now
	return svc, repo
}

func TestServicePutAndGet(t *testing.T) {
	ctx := context.Background()
	svc, _ := newTestMemService()

	e := MemoryEntry{Key: "build.target", Value: "linux", Scope: ScopeGlobal}
	stored, err := svc.Put(ctx, e)
	if err != nil {
		t.Fatalf("put: %v", err)
	}
	if stored.ID == "" {
		t.Error("expected ID to be generated")
	}

	got, err := svc.Get(ctx, ScopeGlobal, "build.target")
	if err != nil {
		t.Fatalf("get: %v", err)
	}
	if got.Value != "linux" {
		t.Errorf("expected value linux, got %q", got.Value)
	}
}

func TestServicePutUpdatesExisting(t *testing.T) {
	ctx := context.Background()
	svc, _ := newTestMemService()

	_, _ = svc.Put(ctx, MemoryEntry{Key: "k", Value: "v1", Scope: ScopeTeam})
	stored, err := svc.Put(ctx, MemoryEntry{Key: "k", Value: "v2", Scope: ScopeTeam})
	if err != nil {
		t.Fatalf("update: %v", err)
	}
	if stored.Value != "v2" {
		t.Errorf("expected updated value v2, got %q", stored.Value)
	}
}

func TestServiceGetNotFound(t *testing.T) {
	ctx := context.Background()
	svc, _ := newTestMemService()

	_, err := svc.Get(ctx, ScopeAgent, "missing")
	if !errors.Is(err, ErrNotFound) {
		t.Errorf("expected ErrNotFound, got %v", err)
	}
}

func TestServiceDelete(t *testing.T) {
	ctx := context.Background()
	svc, _ := newTestMemService()

	_, _ = svc.Put(ctx, MemoryEntry{Key: "to-delete", Value: "x", Scope: ScopeGlobal})
	if err := svc.Delete(ctx, ScopeGlobal, "to-delete"); err != nil {
		t.Fatalf("delete: %v", err)
	}
	_, err := svc.Get(ctx, ScopeGlobal, "to-delete")
	if !errors.Is(err, ErrNotFound) {
		t.Errorf("expected ErrNotFound after delete, got %v", err)
	}
}

func TestServiceDeleteNotFound(t *testing.T) {
	ctx := context.Background()
	svc, _ := newTestMemService()
	err := svc.Delete(ctx, ScopeGlobal, "ghost")
	if !errors.Is(err, ErrNotFound) {
		t.Errorf("expected ErrNotFound, got %v", err)
	}
}

func TestServiceList(t *testing.T) {
	ctx := context.Background()
	svc, _ := newTestMemService()

	_, _ = svc.Put(ctx, MemoryEntry{Key: "a", Value: "1", Scope: ScopeTeam})
	_, _ = svc.Put(ctx, MemoryEntry{Key: "b", Value: "2", Scope: ScopeTeam})
	_, _ = svc.Put(ctx, MemoryEntry{Key: "c", Value: "3", Scope: ScopeAgent})

	entries, err := svc.List(ctx, ScopeTeam)
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if len(entries) != 2 {
		t.Errorf("expected 2 team entries, got %d", len(entries))
	}
}

func TestServiceTTLExpiry(t *testing.T) {
	ctx := context.Background()
	svc, repo := newTestMemService()

	fixedNow := time.Date(2024, 1, 1, 12, 0, 0, 0, time.UTC)
	repo.now = func() time.Time { return fixedNow }
	svc.now = repo.now

	_, err := svc.Put(ctx, MemoryEntry{
		Key:   "ephemeral",
		Value: "x",
		Scope: ScopeGlobal,
		TTL:   1 * time.Hour,
	})
	if err != nil {
		t.Fatalf("put: %v", err)
	}

	// Advance clock past TTL.
	expired := fixedNow.Add(2 * time.Hour)
	repo.now = func() time.Time { return expired }

	_, err = svc.Get(ctx, ScopeGlobal, "ephemeral")
	if !errors.Is(err, ErrNotFound) {
		t.Errorf("expected ErrNotFound after TTL expiry, got %v", err)
	}
}

func TestServiceInvalidScope(t *testing.T) {
	ctx := context.Background()
	svc, _ := newTestMemService()

	if _, err := svc.Put(ctx, MemoryEntry{Key: "k", Scope: "bad"}); !errors.Is(err, ErrInvalidScope) {
		t.Errorf("expected ErrInvalidScope, got %v", err)
	}
	if _, err := svc.Get(ctx, "bad", "k"); !errors.Is(err, ErrInvalidScope) {
		t.Errorf("expected ErrInvalidScope on get, got %v", err)
	}
	if err := svc.Delete(ctx, "bad", "k"); !errors.Is(err, ErrInvalidScope) {
		t.Errorf("expected ErrInvalidScope on delete, got %v", err)
	}
	if _, err := svc.List(ctx, "bad"); !errors.Is(err, ErrInvalidScope) {
		t.Errorf("expected ErrInvalidScope on list, got %v", err)
	}
}

func TestServicePutMissingKey(t *testing.T) {
	ctx := context.Background()
	svc, _ := newTestMemService()
	if _, err := svc.Put(ctx, MemoryEntry{Scope: ScopeGlobal}); !errors.Is(err, ErrInvalidKey) {
		t.Errorf("expected ErrInvalidKey, got %v", err)
	}
}
