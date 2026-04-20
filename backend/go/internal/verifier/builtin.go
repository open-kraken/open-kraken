package verifier

import "context"

// NoopVerifier always declines (Signal = NoSignal). Use it as an
// explicit placeholder when a row must exist in the Registry but you
// want the DefaultRewardModel to fall back to the success indicator.
type NoopVerifier struct{}

// Verify implements Verifier.
func (NoopVerifier) Verify(_ context.Context, _ Request) (Result, error) {
	return NoSignalResult, nil
}

// FuncVerifier adapts a plain function into the Verifier interface. The
// function's result is clamped to [0, 1] automatically.
//
// Intended for tests and for short policy-layer rules that do not
// warrant their own concrete type (e.g. "output must contain 'PASS'").
type FuncVerifier func(ctx context.Context, req Request) (Result, error)

// Verify implements Verifier.
func (f FuncVerifier) Verify(ctx context.Context, req Request) (Result, error) {
	r, err := f(ctx, req)
	if err != nil {
		return r, err
	}
	r.Signal = ClampSignal(r.Signal)
	return r, nil
}

// Compile-time check.
var (
	_ Verifier = NoopVerifier{}
	_ Verifier = (FuncVerifier)(nil)
)
