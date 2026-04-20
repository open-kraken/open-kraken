package vector

import (
	"context"
	"testing"
)

func TestMemoryVectorStore_UpsertAndSearch(t *testing.T) {
	store := NewMemoryVectorStore()
	ctx := context.Background()
	if err := store.EnsureCollection(ctx, "test", 3); err != nil {
		t.Fatal(err)
	}

	points := []Point{
		{ID: "a", Vector: []float32{1, 0, 0}, Payload: map[string]any{"scope": "run"}},
		{ID: "b", Vector: []float32{0, 1, 0}, Payload: map[string]any{"scope": "hive"}},
		{ID: "c", Vector: []float32{0.9, 0.1, 0}, Payload: map[string]any{"scope": "run"}},
	}
	if err := store.Upsert(ctx, "test", points); err != nil {
		t.Fatalf("Upsert: %v", err)
	}

	// Query close to "a"/"c".
	hits, err := store.Search(ctx, "test", []float32{1, 0, 0}, 3, nil)
	if err != nil {
		t.Fatalf("Search: %v", err)
	}
	if len(hits) != 3 {
		t.Fatalf("want 3 hits, got %d", len(hits))
	}
	if hits[0].ID != "a" {
		t.Errorf("top hit: want a, got %s (score=%f)", hits[0].ID, hits[0].Score)
	}
	if hits[1].ID != "c" {
		t.Errorf("second hit: want c, got %s", hits[1].ID)
	}
}

func TestMemoryVectorStore_Filter(t *testing.T) {
	store := NewMemoryVectorStore()
	ctx := context.Background()
	_ = store.EnsureCollection(ctx, "test", 2)
	_ = store.Upsert(ctx, "test", []Point{
		{ID: "r1", Vector: []float32{1, 0}, Payload: map[string]any{"scope": "run"}},
		{ID: "h1", Vector: []float32{1, 0}, Payload: map[string]any{"scope": "hive"}},
	})
	hits, err := store.Search(ctx, "test", []float32{1, 0}, 10, Filter{"scope": "run"})
	if err != nil {
		t.Fatalf("Search: %v", err)
	}
	if len(hits) != 1 || hits[0].ID != "r1" {
		t.Errorf("filter mismatch; got %+v", hits)
	}
}

func TestMemoryVectorStore_DimMismatch(t *testing.T) {
	store := NewMemoryVectorStore()
	ctx := context.Background()
	_ = store.EnsureCollection(ctx, "test", 3)
	err := store.Upsert(ctx, "test", []Point{{ID: "x", Vector: []float32{1, 2}}})
	if err != ErrDimMismatch {
		t.Errorf("want ErrDimMismatch, got %v", err)
	}
}

func TestMemoryVectorStore_UnknownCollection(t *testing.T) {
	store := NewMemoryVectorStore()
	ctx := context.Background()
	if _, err := store.Search(ctx, "missing", []float32{1, 2, 3}, 5, nil); err != ErrUnknownCollection {
		t.Errorf("want ErrUnknownCollection, got %v", err)
	}
}

func TestMemoryVectorStore_Upsert_OverwritesSameID(t *testing.T) {
	store := NewMemoryVectorStore()
	ctx := context.Background()
	_ = store.EnsureCollection(ctx, "t", 2)
	_ = store.Upsert(ctx, "t", []Point{{ID: "x", Vector: []float32{1, 0}, Payload: map[string]any{"v": 1}}})
	_ = store.Upsert(ctx, "t", []Point{{ID: "x", Vector: []float32{0, 1}, Payload: map[string]any{"v": 2}}})
	hits, _ := store.Search(ctx, "t", []float32{0, 1}, 5, nil)
	if len(hits) != 1 || hits[0].Payload["v"] != 2 {
		t.Errorf("overwrite failed: %+v", hits)
	}
}

func TestMemoryVectorStore_Delete(t *testing.T) {
	store := NewMemoryVectorStore()
	ctx := context.Background()
	_ = store.EnsureCollection(ctx, "t", 2)
	_ = store.Upsert(ctx, "t", []Point{
		{ID: "a", Vector: []float32{1, 0}},
		{ID: "b", Vector: []float32{0, 1}},
	})
	_ = store.Delete(ctx, "t", []string{"a"})
	hits, _ := store.Search(ctx, "t", []float32{1, 0}, 5, nil)
	if len(hits) != 1 || hits[0].ID != "b" {
		t.Errorf("delete did not remove 'a': %+v", hits)
	}
}
