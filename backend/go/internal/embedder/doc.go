// Package embedder produces fixed-length numeric vectors from text.
// It is the abstraction the SEM layer (paper §5.7) consumes to turn
// arbitrary artefacts into a form the vector index can search.
//
// The interface is intentionally narrow:
//
//   - Embed(ctx, text) → []float32   — dense vector
//   - Dim() → int                    — declared dimensionality (constant per embedder)
//   - Name() → string                — short id for logs and collection naming
//
// Dependency direction:
//
//	sem.Service ─► embedder.Embedder ─► hash / openai / local
//
// No package in this tree imports ael / cws / flowscheduler / vector
// from embedder. Concrete implementations (hash here, OpenAI / local
// models later) live in separate files.
//
// Scope today:
//   - HashEmbedder — deterministic FNV-based pseudo-vector. Useful for
//     tests and for dev deployments that want to exercise the SEM
//     pipeline without a live embedding provider.
//
// Scope for Batch 2:
//   - OpenAIEmbedder — text-embedding-3-small etc. via HTTP.
//   - LocalEmbedder  — e.g. bge / all-MiniLM via a sidecar process.
package embedder
