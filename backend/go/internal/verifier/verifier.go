package verifier

import (
	"context"
	"errors"
)

// NoSignal is the sentinel signal value meaning "the verifier produced
// no opinion for this Step". CWS's DefaultRewardModel treats it the
// same as a failed Verify call: fall back to the success indicator.
const NoSignal = -1.0

// Request is the vocabulary-neutral input handed to a Verifier. It
// carries just enough of the Step to make a routing decision and the
// executor's raw output so business-specific verifiers can inspect it.
type Request struct {
	// StepID identifies the Step for logging and correlation.
	StepID string

	// Regime and WorkloadClass come from the Step. They duplicate the
	// Registry lookup key so Verifiers that delegate internally can
	// branch without a second lookup.
	Regime        string
	WorkloadClass string

	// TenantID / RunID / FlowID let Verifiers that need tenant context
	// (e.g. schema-per-tenant validators) access it without a separate
	// lookup.
	TenantID string
	RunID    string
	FlowID   string

	// Succeeded reports whether the Step's executor reported success.
	// A Verifier is still permitted to return a low signal for a
	// "succeeded" Step when the output fails validation.
	Succeeded bool

	// Output is the executor's final artefact (usually the assistant
	// reply from llmexec, serialised into steps.event_stream). A nil
	// slice means no output was captured.
	Output []byte

	// OutputRef is an opaque pointer (URI, blob id, hash) to larger
	// output stored outside the row. Empty when the output lives fully
	// inline in Output.
	OutputRef string

	// FailureReason carries the executor's failure text when Succeeded
	// is false. Verifiers can use it to decide whether to still assign
	// partial credit (e.g. "provider rate limited" is not the arm's
	// fault — return 0.5).
	FailureReason string
}

// Result is a Verifier's report. Signal is the reward in [0, 1], or
// NoSignal (-1) when the verifier deliberately declines to rate this
// Step. Reason is a short human-readable string for audit / logs.
type Result struct {
	Signal float64
	Reason string
}

// Verifier is the single behaviour every concrete verifier satisfies.
// Implementations must honour ctx cancellation and return a non-nil
// error only for unrecoverable failures (bad configuration, upstream
// outage). Business-level "this Step didn't verify" is reported as
// Result{Signal: 0} with an explanatory Reason, not as err.
type Verifier interface {
	Verify(ctx context.Context, req Request) (Result, error)
}

// ErrNotApplicable is the sentinel a Verifier returns when it recognises
// the Request is outside its remit (e.g. a JSON-schema verifier asked
// to rate a code-generation Step). The Registry treats this the same as
// "no verifier found" so the caller falls back to the OPAQUE reward.
var ErrNotApplicable = errors.New("verifier: not applicable to this request")

// ClampSignal enforces the [0, 1] invariant. Out-of-range values are
// silently clipped so Verifier implementations never have to remember
// to bound their output manually.
func ClampSignal(s float64) float64 {
	switch {
	case s < 0:
		return 0
	case s > 1:
		return 1
	default:
		return s
	}
}
