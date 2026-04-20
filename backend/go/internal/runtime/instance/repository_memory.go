package instance

import (
	"context"
	"sync"
)

// MemoryRepository is an in-process Repository used by tests and by
// single-process dev deployments that do not need durability across
// restarts. Thread-safe.
type MemoryRepository struct {
	mu   sync.Mutex
	rows map[string]Snapshot
}

// NewMemoryRepository constructs an empty MemoryRepository.
func NewMemoryRepository() *MemoryRepository {
	return &MemoryRepository{rows: make(map[string]Snapshot)}
}

// Upsert implements Repository.
func (m *MemoryRepository) Upsert(_ context.Context, s Snapshot) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	existing, ok := m.rows[s.ID]
	if ok {
		s.Version = existing.Version + 1
	}
	m.rows[s.ID] = s
	return nil
}

// LoadLive implements Repository — returns every non-terminal row.
func (m *MemoryRepository) LoadLive(_ context.Context) ([]Snapshot, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	out := make([]Snapshot, 0, len(m.rows))
	for _, s := range m.rows {
		if !IsTerminal(s.State) {
			out = append(out, s)
		}
	}
	return out, nil
}

// Delete implements Repository.
func (m *MemoryRepository) Delete(_ context.Context, id string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if _, ok := m.rows[id]; !ok {
		return ErrNotFound
	}
	delete(m.rows, id)
	return nil
}

// Close implements Repository. No-op for the in-memory backend.
func (m *MemoryRepository) Close() error { return nil }

// DumpAll returns every row (terminal ones included). Intended for
// tests and for the `/api/v2/agent-instances?include=terminal=true`
// operator endpoint.
func (m *MemoryRepository) DumpAll() []Snapshot {
	m.mu.Lock()
	defer m.mu.Unlock()
	out := make([]Snapshot, 0, len(m.rows))
	for _, s := range m.rows {
		out = append(out, s)
	}
	return out
}
