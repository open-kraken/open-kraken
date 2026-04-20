// Package sem is the write/search facade for Shared Execution Memory
// (paper §5.7, L2/L3). It joins three orthogonal concerns — PG metadata,
// a vector index, and an embedder — behind a narrow Service API so
// callers (FlowScheduler, HTTP handlers, future WAL consumer) never
// touch the pieces directly.
//
// Put pipeline (outbox pattern, §5.7.4):
//
//  1. Insert SEM row in PG with embedding_status='pending'.
//  2. Embed the record content.
//  3. Upsert the point into the vector index.
//  4. Flip embedding_status → 'indexed' (on success) or 'failed' (on error).
//     A failure leaves the PG row authoritative; OutboxWorker (Batch 2)
//     retries it asynchronously.
//
// Search pipeline:
//
//  1. Embed the query text.
//  2. vector.Search with a scope filter (L2=run, L3=hive).
//  3. Hydrate the hits from PG so callers get full SEMRecord structs.
//
// Dependency direction:
//
//	flowscheduler / handlers ─► sem.Service ─► ael.Service (PG)
//	                                        ├► vector.VectorStore
//	                                        └► embedder.Embedder
//
// No reverse imports. Concrete backends (Qdrant, OpenAI) plug in at the
// Store/Embedder interfaces without touching sem or its callers.
package sem
