package memory

import (
	"context"
	"fmt"
	"time"
)

// Service provides CRUD operations over MemoryEntry records with scope-based
// access semantics and TTL enforcement.
type Service struct {
	repo MemoryRepository
	// now is injectable for deterministic testing.
	now   func() time.Time
	idGen func() string
}

// NewService creates a memory Service backed by repo.
func NewService(repo MemoryRepository) *Service {
	return &Service{
		repo:  repo,
		now:   time.Now,
		idGen: defaultMemIDGen,
	}
}

// Put creates or replaces the entry identified by scope+key. The ID is
// generated when empty.
func (s *Service) Put(ctx context.Context, e MemoryEntry) (MemoryEntry, error) {
	if err := ValidateScope(e.Scope); err != nil {
		return MemoryEntry{}, err
	}
	if e.Key == "" {
		return MemoryEntry{}, ErrInvalidKey
	}
	if e.ID == "" {
		e.ID = s.idGen()
	}
	if err := s.repo.Upsert(ctx, e); err != nil {
		return MemoryEntry{}, fmt.Errorf("memory put: %w", err)
	}
	// Reload to get timestamps set by the repository.
	stored, err := s.repo.Get(ctx, e.Scope, e.Key)
	if err != nil {
		return MemoryEntry{}, fmt.Errorf("memory put reload: %w", err)
	}
	return stored, nil
}

// Get retrieves the entry identified by scope and key.
// Returns ErrNotFound for absent or expired entries.
func (s *Service) Get(ctx context.Context, scope Scope, key string) (MemoryEntry, error) {
	if err := ValidateScope(scope); err != nil {
		return MemoryEntry{}, err
	}
	e, err := s.repo.Get(ctx, scope, key)
	if err != nil {
		return MemoryEntry{}, fmt.Errorf("memory get: %w", err)
	}
	return e, nil
}

// Delete removes the entry identified by scope and key.
func (s *Service) Delete(ctx context.Context, scope Scope, key string) error {
	if err := ValidateScope(scope); err != nil {
		return err
	}
	if err := s.repo.Delete(ctx, scope, key); err != nil {
		return fmt.Errorf("memory delete: %w", err)
	}
	return nil
}

// List returns all non-expired entries for the given scope.
func (s *Service) List(ctx context.Context, scope Scope) ([]MemoryEntry, error) {
	if err := ValidateScope(scope); err != nil {
		return nil, err
	}
	entries, err := s.repo.ListByScope(ctx, scope)
	if err != nil {
		return nil, fmt.Errorf("memory list: %w", err)
	}
	return entries, nil
}

func defaultMemIDGen() string {
	return fmt.Sprintf("mem_%d", time.Now().UnixNano())
}
