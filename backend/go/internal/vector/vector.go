package vector

import (
	"context"
	"errors"
)

// Point is a single row stored in the index: the vector, an opaque
// string id (the SEM layer uses the ael.SEMRecord.ID), and a payload
// used for post-filter matching.
type Point struct {
	ID      string
	Vector  []float32
	Payload map[string]any
}

// SearchHit is a result from Search. Score is backend-specific (higher
// = closer for cosine backends like Qdrant's default and MemoryVectorStore).
type SearchHit struct {
	ID      string
	Score   float64
	Payload map[string]any
}

// Filter is a flat AND-of-equals condition set. Every key in the map
// must match the same key in the Point.Payload for the hit to return.
// Backends that support richer query DSLs can layer on top.
type Filter map[string]any

// VectorStore is the pluggable search index. Implementations must be
// safe for concurrent Upsert / Search / Delete; Close shuts down
// backend resources.
type VectorStore interface {
	// EnsureCollection creates the named collection at the given
	// dimensionality if it does not already exist. Safe to call on
	// every boot.
	EnsureCollection(ctx context.Context, name string, dim int) error

	// Upsert inserts or replaces points in the named collection. Points
	// with mismatched vector length return ErrDimMismatch.
	Upsert(ctx context.Context, collection string, points []Point) error

	// Search returns up to limit hits closest to query. Filter values
	// must match the point payload exactly. An empty Filter means
	// "no filter".
	Search(ctx context.Context, collection string, query []float32, limit int, filter Filter) ([]SearchHit, error)

	// Delete removes points by id. Unknown ids are silently ignored.
	Delete(ctx context.Context, collection string, ids []string) error

	// Close releases backend resources.
	Close() error
}

// ErrDimMismatch is returned when a point's vector length does not
// match the collection's declared dimension.
var ErrDimMismatch = errors.New("vector: dimension mismatch")

// ErrUnknownCollection is returned when a read reaches a collection
// the backend has never seen.
var ErrUnknownCollection = errors.New("vector: unknown collection")
