package verifier

import (
	"context"
	"errors"
	"testing"
)

func TestStaticRegistry_PreciseKeyWins(t *testing.T) {
	r := NewStaticRegistry()

	precise := FuncVerifier(func(ctx context.Context, req Request) (Result, error) {
		return Result{Signal: 0.9, Reason: "precise"}, nil
	})
	regimeDefault := FuncVerifier(func(ctx context.Context, req Request) (Result, error) {
		return Result{Signal: 0.5, Reason: "regime"}, nil
	})

	r.Register("VERIFIABLE", "chat", precise)
	r.RegisterDefault("VERIFIABLE", regimeDefault)

	v, ok := r.Lookup("VERIFIABLE", "chat")
	if !ok {
		t.Fatal("want hit")
	}
	got, _ := v.Verify(context.Background(), Request{})
	if got.Reason != "precise" {
		t.Errorf("precise key should win, got reason=%s", got.Reason)
	}
}

func TestStaticRegistry_RegimeDefaultIsFallback(t *testing.T) {
	r := NewStaticRegistry()
	regimeDefault := FuncVerifier(func(ctx context.Context, req Request) (Result, error) {
		return Result{Signal: 0.5, Reason: "regime"}, nil
	})
	r.RegisterDefault("VERIFIABLE", regimeDefault)

	v, ok := r.Lookup("VERIFIABLE", "unknown-class")
	if !ok {
		t.Fatal("want regime default to match")
	}
	got, _ := v.Verify(context.Background(), Request{})
	if got.Reason != "regime" {
		t.Errorf("want regime default, got reason=%s", got.Reason)
	}
}

func TestStaticRegistry_GlobalDefault(t *testing.T) {
	r := NewStaticRegistry()
	r.RegisterGlobalDefault(FuncVerifier(func(ctx context.Context, req Request) (Result, error) {
		return Result{Signal: 0.1, Reason: "global"}, nil
	}))
	v, ok := r.Lookup("any", "any")
	if !ok || v == nil {
		t.Fatal("global default should match everything")
	}
}

func TestStaticRegistry_MissReturnsFalse(t *testing.T) {
	r := NewStaticRegistry()
	if v, ok := r.Lookup("X", "Y"); ok || v != nil {
		t.Errorf("expected miss, got (%v, %v)", v, ok)
	}
}

func TestNilRegistry_AlwaysMisses(t *testing.T) {
	if v, ok := (NilRegistry{}).Lookup("V", "w"); ok || v != nil {
		t.Errorf("NilRegistry should always miss")
	}
}

func TestFuncVerifier_ClampsSignal(t *testing.T) {
	high := FuncVerifier(func(ctx context.Context, req Request) (Result, error) {
		return Result{Signal: 1.5, Reason: "over"}, nil
	})
	r, _ := high.Verify(context.Background(), Request{})
	if r.Signal != 1 {
		t.Errorf("want clamp to 1, got %f", r.Signal)
	}

	low := FuncVerifier(func(ctx context.Context, req Request) (Result, error) {
		return Result{Signal: -0.3, Reason: "under"}, nil
	})
	r, _ = low.Verify(context.Background(), Request{})
	if r.Signal != 0 {
		t.Errorf("want clamp to 0, got %f", r.Signal)
	}
}

func TestFuncVerifier_PropagatesError(t *testing.T) {
	boom := errors.New("upstream down")
	bad := FuncVerifier(func(ctx context.Context, req Request) (Result, error) {
		return Result{}, boom
	})
	_, err := bad.Verify(context.Background(), Request{})
	if !errors.Is(err, boom) {
		t.Errorf("want errors.Is(boom), got %v", err)
	}
}

func TestNoopVerifier_ReturnsNoSignal(t *testing.T) {
	r, err := (NoopVerifier{}).Verify(context.Background(), Request{})
	if err != nil {
		t.Fatal(err)
	}
	if r.Signal != NoSignal {
		t.Errorf("want NoSignal, got %f", r.Signal)
	}
}

func TestClampSignal(t *testing.T) {
	cases := []struct {
		in, want float64
	}{
		{-1, 0},
		{0, 0},
		{0.5, 0.5},
		{1, 1},
		{2, 1},
	}
	for _, c := range cases {
		if got := ClampSignal(c.in); got != c.want {
			t.Errorf("ClampSignal(%f) = %f, want %f", c.in, got, c.want)
		}
	}
}
