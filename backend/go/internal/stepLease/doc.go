// Package stepLease implements the Step Lease coordination primitive from
// paper §5.3. Step Leases grant exclusive execution rights to a specific
// node for a specific Step for a bounded TTL.
//
// The authoritative implementation is etcd-native:
//
//   - Exclusive assignment is enforced by an etcd compare-and-swap transaction
//     (txn If Version(key) == 0 Then Put Else fail).
//   - Lease expiry is driven by etcd's server-side TTL enforcement, which
//     survives the crash of a holder without requiring any cleanup logic.
//   - Expiry events are delivered via etcd Watch on the /leases/step/ prefix.
//     The FlowScheduler reacts by reassigning the Step.
//
// An in-memory fallback implementation is provided for single-process dev/test
// deployments where starting etcd is inconvenient. It has identical semantics
// but no cross-process coordination — using it in production is incorrect.
//
// Relationship to the AEL:
//
//   - etcd is the authorization source: "does this node currently hold the lease?"
//   - PostgreSQL (via ael.T1LeaseMirror) is the durable audit mirror: "at some
//     point, node N was granted step S with a lease that expires at T."
//
// Every successful Acquire mirrors to PG via AEL T1, which also debits the
// Run's estimated token budget. If the mirror fails (e.g. budget exhausted),
// the etcd lease is immediately revoked so the Step returns to the pool.
package stepLease
