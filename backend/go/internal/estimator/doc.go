// Package estimator produces a conservative token-cost forecast for a
// Step so T1 can debit the Run's token budget before the executor runs.
//
// Paper alignment (§5.2.6, budget-aware CWS): the scheduler needs an
// ex-ante cost signal to (a) reject Steps that would overshoot the
// Run's token_budget and (b) supply Prompt.MaxTokens-style bounds to
// downstream executors. A cheap overestimate is strictly preferable to
// a cheap underestimate — budget exhaustion is recoverable (the Step
// simply cancels), budget violation is not.
//
// Dependency direction:
//
//	flowscheduler ─► estimator.Estimator
//	llmexec       ─► estimator.Estimator  (future: informs MaxTokens)
//
// The package imports nothing from ael / cws / flowscheduler /
// provider so verifiers, executors, and tests can all reuse the same
// Estimator without cycles.
//
// Scope today (v1):
//
//   - CharCountEstimator: character-length heuristic (~4 chars / token).
//     Accurate enough for dispatch-time gatekeeping; not accurate enough
//     for billing.
//   - Chained / fixed-value estimators land as extra files if a future
//     workload needs e.g. a length-proportional model per agent_type.
//
// Nothing here is probabilistic; the first cut trades accuracy for
// predictable plumbing. A per-arm learned estimator is a natural
// Phase-3 extension once CWS has enough completion data.
package estimator
