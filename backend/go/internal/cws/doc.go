// Package cws implements the Cognitive Workload Scheduler from paper §5.2.
//
// CWS routes each Step to one of the registered "arms" — a (agent_type,
// provider, workload_class, regime) tuple — using UCB-1 (§5.2.6,
// Appendix A.3.5). The reward for each pull is computed from the Step's
// final outcome by a RewardModel, then upserted into
// scheduling_arm_stats so future pulls see updated mean and counts.
//
// Layering (single-direction):
//
//	flowscheduler ─► cws.Selector ─► cws.StatsRepo ─► PG (scheduling_arm_stats)
//	                              └► cws.Catalog   ─► static / dynamic arm list
//
// The cws package deliberately does not import ael or flowscheduler:
//
//   - Regime / state are carried as plain strings so schema and vocabulary
//     can evolve in AEL without rippling through CWS.
//   - Selector / StatsRepo / Catalog are interfaces so tests and
//     alternative backends (in-memory for dev, PG for prod, Redis-backed
//     in future) can plug in without touching the call sites.
//
// Reward convention (paper §5.2.2): reward ∈ [0, 1]. For the OPAQUE
// regime the default model maps succeeded→1, failed→0. VERIFIABLE /
// PROXIED regimes require a VerificationCallback which lands in a later
// slice.
//
// UCB-1 formula:
//
//	UCBᵢ(t) = r̄ᵢ + c · sqrt( ln(t) / nᵢ )
//
// where r̄ᵢ is the per-arm mean reward, nᵢ is the pull count, t is the
// total pulls across all arms in the candidate set, and c = sqrt(2) by
// default. An arm with nᵢ = 0 is assigned +∞ so every arm is tried at
// least once before exploitation begins (Lemma 5.1 precondition).
package cws
