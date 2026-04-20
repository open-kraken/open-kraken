// Package verifier implements the VerificationCallback from paper
// §5.2.2. A Verifier examines a completed Step and returns a
// reward-shaped signal in [0, 1] that CWS uses to update the UCB arm
// statistics.
//
// The package is intentionally vocabulary-thin:
//
//   - No import of ael, flowscheduler, cws, or provider. A Verifier
//     sees only the Step's identifying fields and its executor output.
//   - Registry is keyed on (regime, workload_class) — the same tuple
//     CWS uses to pick an arm. Callers supply their own regime vocabulary
//     as plain strings; the package does not assert values.
//
// Dependency direction:
//
//	flowscheduler ─► verifier.Registry ─► Verifier (built-in or user-provided)
//
// No reverse imports. Consumers import only `internal/verifier`; the
// builtin helpers (Noop / Func) and any future concrete implementations
// (JSON schema match, regex, external HTTP probe) live as separate files
// inside this package.
//
// Scope today (v1, deliberately minimal):
//
//   - Synchronous Verify call, no streaming.
//   - Single signal per Step (no multi-criteria aggregation).
//   - No retry / backoff — the caller (FlowScheduler) decides whether to
//     re-verify. A failing Verify returns (_, error) to signal "no
//     signal available" so the caller can fall back to the OPAQUE reward.
//
// Reward-shaping convention: signals clamp to [0, 1]. A negative signal
// is the sentinel for "no signal available" and is carried as-is on
// `Result.Signal` (the selector's DefaultRewardModel collapses it back
// to the success indicator).
package verifier
