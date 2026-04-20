// Package vector is the abstraction the SEM layer uses to store and
// search embedded artefacts (paper §5.7).
//
// The interface is tiny on purpose — concrete indexes (Qdrant today,
// pgvector or local HNSW tomorrow) differ wildly in client surface but
// the SEM code only needs:
//
//   - Upsert a batch of (id, vector, payload) points
//   - Search a query vector with filters → top-k hits
//   - Delete a handful of points (tombstone paths)
//
// Dependency direction:
//
//	sem.Service ─► vector.VectorStore ─► memory / qdrant / pgvector
//
// No package in this tree imports ael / cws / flowscheduler from the
// vector package. MemoryVectorStore lives here (test-only / dev);
// Qdrant and pgvector implementations are separate files added without
// touching the interface.
//
// Scope today:
//   - Point / SearchHit types + VectorStore interface
//   - MemoryVectorStore with exact cosine similarity — exists so sem
//     has a real backend to exercise end-to-end without Qdrant.
//
// Scope for Batch 2:
//   - QdrantStore: HTTP client against the REST API (filtered HNSW).
//   - Optional pgvector backend for small deployments.
package vector
