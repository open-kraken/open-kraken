// Package ael is the Authoritative Execution Ledger described in the paper
// "Agents as Execution Resources", Section 5.1 and Appendix A.
//
// AEL is the immutable, FSM-enforced, PostgreSQL-backed record of what the
// distributed agent runtime did. It is simultaneously:
//
//   - the operational state store (FlowScheduler reads pending steps from it),
//   - the append-only audit trail (FSM enforces state monotonicity at terminal
//     states — see Lemma 5.1), and
//   - the reward history on which the Cognitive Workload Scheduler's UCB
//     estimator depends (Proposition 5.1: mutable history degrades regret to
//     linear).
//
// AEL has four hierarchy levels:
//
//	Run → Flow → Step → SideEffect
//
// and four transactions (Appendix A.3):
//
//	T1: Lease issuance.      PG mirror only; authoritative lease is in etcd
//	                         (see backend/go/internal/stepLease/). T1 debits
//	                         the Run's token budget and writes the lease mirror
//	                         fields on the Step.
//	T2: Step completion.     Serializable transaction that atomically:
//	                         - transitions Step to succeeded/failed,
//	                         - commits all SideEffect records for that Step,
//	                         - updates Run.tokens_used / cost_usd,
//	                         - (VERIFIABLE/PROXIED) updates scheduling_arm_stats.
//	T3: Lease renewal.       etcd KeepAlive is authoritative; AEL only updates
//	                         the lease_expires_at mirror opportunistically.
//	T4: Expiry recovery.     etcd watch on /leases/step/ is authoritative;
//	                         AEL's T4 scanner is a backup path that catches
//	                         events lost during watch disconnects.
//
// Package layout:
//
//	model.go       — Go types for Run/Flow/Step/SideEffect and state enums.
//	fsm.go         — Finite-state-machine transition validator.
//	repository.go  — pgx-based CRUD and query primitives.
//	tx.go          — Transaction primitives (T1–T4).
//	service.go     — Public service layer consumed by handlers/runtime.
//	migrations/    — Embedded SQL migrations applied at service startup.
//
// This package intentionally does not depend on the legacy internal/ledger
// package. The old LedgerEvent append-only log is preserved elsewhere for v1
// API compatibility; AEL Step commits project a summary row into ledger_events
// so the existing audit UI keeps working.
package ael
