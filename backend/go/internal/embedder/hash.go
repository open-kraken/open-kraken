package embedder

import (
	"context"
	"hash/fnv"
	"math"
	"strings"
	"unicode"
)

// HashEmbedder produces a deterministic pseudo-vector by hashing word
// shingles into a fixed-length feature space. Two texts sharing many
// tokens will share buckets and therefore yield similar vectors
// (useful enough for tests and a sanity baseline for SEM in dev).
//
// Not a substitute for a real embedding model: synonyms, word order,
// and multi-lingual equivalence are all ignored. Real deployments
// should swap in OpenAIEmbedder or a local sentence-transformer.
type HashEmbedder struct {
	dim int
}

// NewHashEmbedder returns an embedder of the given dimensionality.
// dim ≤ 0 is treated as 256 to match common small-model sizes.
func NewHashEmbedder(dim int) *HashEmbedder {
	if dim <= 0 {
		dim = 256
	}
	return &HashEmbedder{dim: dim}
}

// Name implements Embedder.
func (h *HashEmbedder) Name() string { return "hash" }

// Dim implements Embedder.
func (h *HashEmbedder) Dim() int { return h.dim }

// Embed implements Embedder. Returns a unit-length vector so the
// vector store's cosine similarity comparisons are invariant to text
// length.
func (h *HashEmbedder) Embed(_ context.Context, text string) ([]float32, error) {
	vec := make([]float32, h.dim)
	for _, tok := range tokenize(text) {
		idx := int(fnv32(tok) % uint32(h.dim))
		vec[idx] += 1
	}
	normalize(vec)
	return vec, nil
}

// tokenize splits text on Unicode whitespace / punctuation and
// lower-cases each token. Empty tokens are dropped. Deterministic.
func tokenize(text string) []string {
	text = strings.ToLower(text)
	toks := strings.FieldsFunc(text, func(r rune) bool {
		return unicode.IsSpace(r) || unicode.IsPunct(r)
	})
	return toks
}

func fnv32(s string) uint32 {
	h := fnv.New32a()
	_, _ = h.Write([]byte(s))
	return h.Sum32()
}

// normalize in place to unit length (L2). A zero vector stays zero.
func normalize(v []float32) {
	var sum float64
	for _, x := range v {
		sum += float64(x) * float64(x)
	}
	if sum == 0 {
		return
	}
	norm := float32(math.Sqrt(sum))
	for i := range v {
		v[i] /= norm
	}
}

// Compile-time check.
var _ Embedder = (*HashEmbedder)(nil)
