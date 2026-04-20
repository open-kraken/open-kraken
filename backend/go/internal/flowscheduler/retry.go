package flowscheduler

import (
	"strings"

	"open-kraken/backend/go/internal/ael"
)

// RetryDecision is the outcome of RetryPolicy.ShouldRetry. The zero
// value means "do not retry".
type RetryDecision struct {
	// Retry is true when the scheduler should create a new Step
	// chained to this one via retry_of (paper §5.3). False leaves the
	// failed Step to propagate into Flow/Run finalization as before.
	Retry bool

	// Reason is a short tag stored on the new retry Step's
	// failure_reason field of the **parent** row so operators can see
	// why the retry was scheduled. Defaults to the original
	// failure_reason when empty.
	Reason string
}

// RetryPolicy decides whether a failed Step should be reattempted.
// Implementations must be pure — no I/O, no random — so the scheduler
// stays deterministic on the dispatch hot path.
type RetryPolicy interface {
	ShouldRetry(step ael.Step, failureReason string) RetryDecision
}

// DefaultRetryPolicy retries most failures up to MaxRetries times but
// refuses permanent-configuration failures (auth, unknown model,
// unknown provider, missing schedule target) that no amount of retries
// will fix. Rate limits DO retry — the scheduler's executor-timeout +
// lease-keepalive pair generally cover transient provider blips.
type DefaultRetryPolicy struct {
	// MaxRetries is the ceiling on retry_count for any chain. Zero is
	// treated as "retries disabled". Negative means "unbounded" and
	// is rejected by the constructor; callers that really want that
	// should implement their own RetryPolicy.
	MaxRetries int
}

// NewDefaultRetryPolicy constructs a DefaultRetryPolicy with the given
// ceiling. Values < 0 collapse to 0 (disabled).
func NewDefaultRetryPolicy(maxRetries int) DefaultRetryPolicy {
	if maxRetries < 0 {
		maxRetries = 0
	}
	return DefaultRetryPolicy{MaxRetries: maxRetries}
}

// ShouldRetry implements RetryPolicy.
func (p DefaultRetryPolicy) ShouldRetry(step ael.Step, reason string) RetryDecision {
	if p.MaxRetries <= 0 {
		return RetryDecision{}
	}
	if step.RetryCount >= p.MaxRetries {
		return RetryDecision{}
	}
	if isPermanentFailure(reason) {
		return RetryDecision{}
	}
	return RetryDecision{Retry: true, Reason: reason}
}

// isPermanentFailure reports whether the failure_reason text names a
// class of error that retrying cannot fix. The match is a simple
// substring search on llmexec's structured reasons
// ("provider auth:", "provider unknown model:", etc.) so new failure
// kinds are opt-in — unknown reasons default to "retryable".
func isPermanentFailure(reason string) bool {
	r := strings.ToLower(reason)
	switch {
	case strings.Contains(r, "provider auth"):
		return true
	case strings.Contains(r, "unknown provider"):
		return true
	case strings.Contains(r, "unknown model"):
		return true
	case strings.Contains(r, "no provider on step"):
		// Raised when CWS has no catalog entry. Retrying would
		// loop until the operator edits the catalog.
		return true
	case strings.Contains(r, "invalid event_stream"):
		// Malformed input — retrying won't help.
		return true
	}
	return false
}

// noRetryPolicy is the silent zero-valued policy used when Config
// leaves Retry unset. Keeps the scheduler call-site uniform so every
// terminal path asks "should we retry?" unconditionally.
type noRetryPolicy struct{}

func (noRetryPolicy) ShouldRetry(_ ael.Step, _ string) RetryDecision {
	return RetryDecision{}
}

// Compile-time interface checks.
var (
	_ RetryPolicy = DefaultRetryPolicy{}
	_ RetryPolicy = noRetryPolicy{}
)
