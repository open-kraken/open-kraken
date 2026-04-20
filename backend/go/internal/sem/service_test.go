package sem

import (
	"context"
	"errors"
	"sync"
	"testing"

	"open-kraken/backend/go/internal/ael"
	"open-kraken/backend/go/internal/embedder"
	"open-kraken/backend/go/internal/vector"
)

// fakeLedger is an in-memory Ledger used by tests to avoid standing up PG.
type fakeLedger struct {
	mu       sync.Mutex
	rows     map[string]*ael.SEMRecord
	nextID   int
	created  int
	indexed  int
	failed   int
	createFn func(r *ael.SEMRecord) error
}

func newFakeLedger() *fakeLedger {
	return &fakeLedger{rows: make(map[string]*ael.SEMRecord)}
}

func (l *fakeLedger) CreateSEMRecord(_ context.Context, r *ael.SEMRecord) error {
	l.mu.Lock()
	defer l.mu.Unlock()
	if l.createFn != nil {
		if err := l.createFn(r); err != nil {
			return err
		}
	}
	l.nextID++
	if r.ID == "" {
		r.ID = "sem-" + itoa(l.nextID)
	}
	r.EmbeddingStatus = "pending"
	l.rows[r.ID] = r
	l.created++
	return nil
}

func (l *fakeLedger) GetSEMRecord(_ context.Context, id string) (*ael.SEMRecord, error) {
	l.mu.Lock()
	defer l.mu.Unlock()
	r, ok := l.rows[id]
	if !ok {
		return nil, ael.ErrNotFound
	}
	return r, nil
}

func (l *fakeLedger) MarkSEMEmbedded(_ context.Context, id string, _ int64) error {
	l.mu.Lock()
	defer l.mu.Unlock()
	r, ok := l.rows[id]
	if !ok {
		return ael.ErrNotFound
	}
	r.EmbeddingStatus = "indexed"
	l.indexed++
	return nil
}

func (l *fakeLedger) MarkSEMEmbeddingFailed(_ context.Context, id string) error {
	l.mu.Lock()
	defer l.mu.Unlock()
	r, ok := l.rows[id]
	if !ok {
		return nil
	}
	r.EmbeddingStatus = "failed"
	l.failed++
	return nil
}

func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	var digits []byte
	for n > 0 {
		digits = append([]byte{byte('0' + n%10)}, digits...)
		n /= 10
	}
	return string(digits)
}

func newTestService(t *testing.T) (*Service, *fakeLedger, *vector.MemoryVectorStore) {
	t.Helper()
	ledger := newFakeLedger()
	vec := vector.NewMemoryVectorStore()
	svc, err := New(ledger, vec, embedder.NewHashEmbedder(64), Config{})
	if err != nil {
		t.Fatal(err)
	}
	return svc, ledger, vec
}

func TestService_PutAndSearch(t *testing.T) {
	ctx := context.Background()
	svc, ledger, _ := newTestService(t)

	recs := []*ael.SEMRecord{
		{Type: ael.SEMArtifact, Scope: ael.SEMScopeRun, HiveID: "h1", RunID: "r1", Key: "k1",
			Content: []byte(`refactor payment service to use credit card v2`)},
		{Type: ael.SEMArtifact, Scope: ael.SEMScopeHive, HiveID: "h1", Key: "k2",
			Content: []byte(`soup recipe broth vegetables`)},
	}
	for _, r := range recs {
		if err := svc.Put(ctx, PutRequest{Record: r, Text: string(r.Content)}); err != nil {
			t.Fatalf("Put: %v", err)
		}
	}
	if ledger.indexed != 2 {
		t.Errorf("expected 2 indexed rows, got %d", ledger.indexed)
	}

	hits, err := svc.Search(ctx, SearchRequest{Query: "refactor payment credit card"})
	if err != nil {
		t.Fatalf("Search: %v", err)
	}
	if len(hits) == 0 || hits[0].Record.Key != "k1" {
		t.Errorf("expected payment record first; got %+v", hits)
	}
}

func TestService_SearchScopeFilter(t *testing.T) {
	ctx := context.Background()
	svc, _, _ := newTestService(t)
	_ = svc.Put(ctx, PutRequest{
		Record: &ael.SEMRecord{Type: ael.SEMArtifact, Scope: ael.SEMScopeRun, HiveID: "h1", RunID: "r1", Key: "run-only",
			Content: []byte(`shared text ABC`)},
		Text: "shared text ABC",
	})
	_ = svc.Put(ctx, PutRequest{
		Record: &ael.SEMRecord{Type: ael.SEMArtifact, Scope: ael.SEMScopeHive, HiveID: "h1", Key: "hive-only",
			Content: []byte(`shared text ABC`)},
		Text: "shared text ABC",
	})
	hits, err := svc.Search(ctx, SearchRequest{Query: "shared text ABC", Scope: ael.SEMScopeRun})
	if err != nil {
		t.Fatalf("Search: %v", err)
	}
	if len(hits) != 1 || hits[0].Record.Key != "run-only" {
		t.Errorf("scope filter failed: %+v", hits)
	}
}

func TestService_PutMarksFailedWhenVectorUpsertFails(t *testing.T) {
	ctx := context.Background()
	ledger := newFakeLedger()
	broken := brokenVectorStore{}
	svc, err := New(ledger, broken, embedder.NewHashEmbedder(16), Config{})
	if err != nil {
		t.Fatal(err)
	}
	err = svc.Put(ctx, PutRequest{
		Record: &ael.SEMRecord{Type: ael.SEMArtifact, Scope: ael.SEMScopeRun, HiveID: "h1", Key: "k",
			Content: []byte(`payload`)},
	})
	if err == nil {
		t.Fatal("expected error")
	}
	if ledger.failed != 1 {
		t.Errorf("expected embedding_status=failed, got failed=%d", ledger.failed)
	}
	if ledger.indexed != 0 {
		t.Errorf("indexed should not have incremented")
	}
}

func TestService_RequiresDependencies(t *testing.T) {
	emb := embedder.NewHashEmbedder(16)
	vec := vector.NewMemoryVectorStore()
	if _, err := New(nil, vec, emb, Config{}); err == nil {
		t.Error("nil ledger should error")
	}
	if _, err := New(newFakeLedger(), nil, emb, Config{}); err == nil {
		t.Error("nil vec should error")
	}
	if _, err := New(newFakeLedger(), vec, nil, Config{}); err == nil {
		t.Error("nil embedder should error")
	}
}

func TestService_EmptyQueryRejected(t *testing.T) {
	ctx := context.Background()
	svc, _, _ := newTestService(t)
	if _, err := svc.Search(ctx, SearchRequest{Query: "  "}); err == nil {
		t.Error("want error on empty query")
	}
}

// brokenVectorStore makes Upsert fail so we can verify the outbox fallback.
type brokenVectorStore struct{}

func (brokenVectorStore) EnsureCollection(_ context.Context, _ string, _ int) error { return nil }
func (brokenVectorStore) Upsert(_ context.Context, _ string, _ []vector.Point) error {
	return errors.New("vector down")
}
func (brokenVectorStore) Search(_ context.Context, _ string, _ []float32, _ int, _ vector.Filter) ([]vector.SearchHit, error) {
	return nil, errors.New("vector down")
}
func (brokenVectorStore) Delete(_ context.Context, _ string, _ []string) error { return nil }
func (brokenVectorStore) Close() error                                         { return nil }
