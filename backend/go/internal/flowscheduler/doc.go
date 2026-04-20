// Package flowscheduler wires AEL + Step Lease + AgentInstance into the
// end-to-end execution loop described in paper §3.3 and §5.3.
//
// A single tick of the scheduler:
//
//  1. Read pending Steps from the AEL (Repository.ListPendingSteps).
//  2. For each step:
//     a. Acquire an exclusive Step Lease via stepLease.Lease.Acquire
//        (etcd in prod, in-memory in dev). Skip on ErrAlreadyHeld.
//     b. Obtain an AgentInstance from the in-process pool
//        (instance.Manager.AcquireIdle or Spawn).
//     c. Run T1LeaseMirror: mirrors the lease in PG and debits the Run's
//        token budget. On ErrBudgetExhausted the scheduler cancels the
//        Step and releases the lease immediately.
//     d. Mark the Step running (leased → running) and the AgentInstance
//        running (scheduled/idle → running).
//     e. Call StepExecutor.Execute. The executor is the CWS hook point —
//        Phase 2 will plug a UCB-1 arm selector in here. The Phase 1
//        default is NoopExecutor.
//     f. Run T2StepComplete to atomically transition the Step to its
//        terminal state, commit all SideEffects, and update Run.cost_usd.
//     g. Transition the AgentInstance back to idle (L1 context survives
//        for the next assignment).
//     h. Release the Step Lease.
//
// Concurrent background tasks:
//
//   - T4 expiry scanner (paper Appendix A.3.4): periodic backup path
//     that catches etcd-watch events lost to connection drops and moves
//     any Step whose mirrored lease_expires_at has passed back to
//     pending, making it eligible for re-assignment.
//
//   - Lease watch: records etcd_lease_expiry_total metrics and makes
//     expiry visible to the rest of the system.
//
// This package is intentionally small and stateless — all durable state
// lives in AEL (PostgreSQL) and etcd. The in-process AgentInstance pool
// is reconstructed from the `agent_instances` table on restart by a
// separate recovery loop (not implemented in Phase 1).
package flowscheduler
