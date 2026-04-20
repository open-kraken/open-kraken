package vector

import (
	"context"
	"math"
	"sort"
	"sync"
)

// MemoryVectorStore is an in-process, unindexed VectorStore: every
// Search does a linear cosine similarity scan over all points. Intended
// for tests and for single-process dev deployments. Do NOT use it in
// production — QdrantStore (HNSW) handles the production path.
type MemoryVectorStore struct {
	mu          sync.RWMutex
	collections map[string]*memCollection
}

type memCollection struct {
	dim    int
	points map[string]Point
}

// NewMemoryVectorStore constructs an empty store.
func NewMemoryVectorStore() *MemoryVectorStore {
	return &MemoryVectorStore{collections: make(map[string]*memCollection)}
}

// EnsureCollection implements VectorStore.
func (m *MemoryVectorStore) EnsureCollection(_ context.Context, name string, dim int) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if _, ok := m.collections[name]; ok {
		return nil
	}
	m.collections[name] = &memCollection{
		dim:    dim,
		points: make(map[string]Point),
	}
	return nil
}

// Upsert implements VectorStore.
func (m *MemoryVectorStore) Upsert(_ context.Context, name string, points []Point) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	col, ok := m.collections[name]
	if !ok {
		return ErrUnknownCollection
	}
	for _, p := range points {
		if len(p.Vector) != col.dim {
			return ErrDimMismatch
		}
		// Copy to detach from caller ownership.
		vec := make([]float32, len(p.Vector))
		copy(vec, p.Vector)
		payload := make(map[string]any, len(p.Payload))
		for k, v := range p.Payload {
			payload[k] = v
		}
		col.points[p.ID] = Point{ID: p.ID, Vector: vec, Payload: payload}
	}
	return nil
}

// Search implements VectorStore.
func (m *MemoryVectorStore) Search(_ context.Context, name string, query []float32, limit int, filter Filter) ([]SearchHit, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	col, ok := m.collections[name]
	if !ok {
		return nil, ErrUnknownCollection
	}
	if len(query) != col.dim {
		return nil, ErrDimMismatch
	}
	if limit <= 0 {
		limit = 10
	}

	hits := make([]SearchHit, 0, len(col.points))
	for _, p := range col.points {
		if !matchesFilter(p.Payload, filter) {
			continue
		}
		hits = append(hits, SearchHit{
			ID:      p.ID,
			Score:   cosine(query, p.Vector),
			Payload: p.Payload,
		})
	}
	sort.Slice(hits, func(i, j int) bool { return hits[i].Score > hits[j].Score })
	if len(hits) > limit {
		hits = hits[:limit]
	}
	return hits, nil
}

// Delete implements VectorStore.
func (m *MemoryVectorStore) Delete(_ context.Context, name string, ids []string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	col, ok := m.collections[name]
	if !ok {
		return ErrUnknownCollection
	}
	for _, id := range ids {
		delete(col.points, id)
	}
	return nil
}

// Close implements VectorStore. No-op for the in-memory backend.
func (m *MemoryVectorStore) Close() error { return nil }

// cosine similarity. Returns 0 for either zero vector (no implicit
// similarity to anything).
func cosine(a, b []float32) float64 {
	if len(a) != len(b) {
		return 0
	}
	var dot, na, nb float64
	for i := range a {
		af := float64(a[i])
		bf := float64(b[i])
		dot += af * bf
		na += af * af
		nb += bf * bf
	}
	if na == 0 || nb == 0 {
		return 0
	}
	return dot / (math.Sqrt(na) * math.Sqrt(nb))
}

// matchesFilter returns true iff every (k, v) in filter equals
// payload[k]. Missing keys or unequal values fail the match.
func matchesFilter(payload map[string]any, filter Filter) bool {
	if len(filter) == 0 {
		return true
	}
	for k, want := range filter {
		got, ok := payload[k]
		if !ok || got != want {
			return false
		}
	}
	return true
}

// Compile-time check.
var _ VectorStore = (*MemoryVectorStore)(nil)
