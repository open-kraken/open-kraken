package embedder

import (
	"context"
	"math"
	"testing"
)

func TestHashEmbedder_Dim(t *testing.T) {
	e := NewHashEmbedder(128)
	if e.Dim() != 128 {
		t.Errorf("Dim: want 128, got %d", e.Dim())
	}
}

func TestHashEmbedder_DefaultDim(t *testing.T) {
	if NewHashEmbedder(0).Dim() != 256 {
		t.Error("zero dim should default to 256")
	}
}

func TestHashEmbedder_ReturnsDeclaredDim(t *testing.T) {
	e := NewHashEmbedder(64)
	v, err := e.Embed(context.Background(), "hello world")
	if err != nil {
		t.Fatal(err)
	}
	if len(v) != 64 {
		t.Errorf("vector len: want 64, got %d", len(v))
	}
}

func TestHashEmbedder_UnitLength(t *testing.T) {
	e := NewHashEmbedder(128)
	v, _ := e.Embed(context.Background(), "the quick brown fox")
	var sum float64
	for _, x := range v {
		sum += float64(x) * float64(x)
	}
	if math.Abs(math.Sqrt(sum)-1) > 1e-6 {
		t.Errorf("expected unit vector, got L2=%f", math.Sqrt(sum))
	}
}

func TestHashEmbedder_Deterministic(t *testing.T) {
	e := NewHashEmbedder(64)
	a, _ := e.Embed(context.Background(), "golang is fun")
	b, _ := e.Embed(context.Background(), "golang is fun")
	for i := range a {
		if a[i] != b[i] {
			t.Fatalf("embeddings differ at %d: %f vs %f", i, a[i], b[i])
		}
	}
}

func TestHashEmbedder_SimilarTextsOverlap(t *testing.T) {
	e := NewHashEmbedder(256)
	a, _ := e.Embed(context.Background(), "refactor the payment service")
	b, _ := e.Embed(context.Background(), "refactor payment service tests")
	c, _ := e.Embed(context.Background(), "cooking recipe soup kitchen")

	dot := func(x, y []float32) float32 {
		var s float32
		for i := range x {
			s += x[i] * y[i]
		}
		return s
	}
	ab := dot(a, b) // similar
	ac := dot(a, c) // different
	if ab <= ac {
		t.Errorf("similar texts should have higher cosine: ab=%f ac=%f", ab, ac)
	}
}

func TestHashEmbedder_EmptyText(t *testing.T) {
	v, err := NewHashEmbedder(32).Embed(context.Background(), "")
	if err != nil {
		t.Fatal(err)
	}
	// Zero vector is acceptable — normalize leaves it zero.
	var sum float64
	for _, x := range v {
		sum += float64(x) * float64(x)
	}
	if sum != 0 {
		t.Errorf("empty text should produce zero vector, got L2=%f", math.Sqrt(sum))
	}
}

func TestHashEmbedder_TokenCaseAndPunctuationIgnored(t *testing.T) {
	e := NewHashEmbedder(64)
	a, _ := e.Embed(context.Background(), "Hello, World!")
	b, _ := e.Embed(context.Background(), "hello world")
	for i := range a {
		if a[i] != b[i] {
			t.Fatalf("case/punct should normalize; differ at %d", i)
		}
	}
}
