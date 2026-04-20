package embedder

import "context"

// Embedder produces a dense vector from text input. Implementations must
// be deterministic across calls within a single process so a record
// embedded at write time can be re-found at search time.
type Embedder interface {
	// Embed returns a fixed-length vector for text. The length must
	// equal Dim() for every call; implementations that cannot honour
	// the declared dimension must return an error.
	Embed(ctx context.Context, text string) ([]float32, error)

	// Dim reports the vector dimensionality. Used by the vector store
	// to size collections.
	Dim() int

	// Name is a short, stable identifier for logs and collection
	// naming (e.g. "hash", "openai-3-small"). Changing Name invalidates
	// previously stored vectors, so prefer versioned names for real
	// embedders.
	Name() string
}
