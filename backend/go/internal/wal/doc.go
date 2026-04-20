// Package wal is the AEL Write-Ahead Log consumer from paper §3.2.
// It streams PostgreSQL logical-replication events over AEL tables
// (runs, flows, steps, side_effects) to registered subscribers in
// commit order. WAL is the substrate of L4 Memory (paper §5.7):
//
//   - ordered: a subscriber sees events in the order the database
//     committed them.
//   - lossless: every committed change reaches the subscriber exactly
//     once, and the consumer acks its LSN position so restarts resume
//     from the last acknowledged point.
//   - external-to-writer: subscribers do NOT share the AEL transaction,
//     which means a subscriber crash never rolls back the ledger.
//
// Dependency direction:
//
//	wal.Consumer ─► wal.EventSource ─► pg / memory
//	             └─► wal.Subscriber  ─► logger / metrics / user
//
// The wal package deliberately does not import ael, flowscheduler, or
// cws: events are typed only by (table, op, row). Downstream
// subscribers parse row maps into their own domain models.
//
// Scope for Batch 1 (this cut):
//   - `EventSource` interface + `MemoryEventSource` test backend.
//   - `Consumer` with fan-out, per-subscriber error isolation, and
//     deterministic ack after every subscriber saw an event.
//   - Built-in LogSubscriber and MetricsSubscriber.
//
// Scope for Batch 2 (next):
//   - `PGEventSource` — pglogrepl + pgoutput decoding against a live
//     PG logical-replication slot.
//   - Migration 006 creating the `kraken_ael` PUBLICATION.
//   - Wiring into cmd/server so the Consumer starts alongside AEL.
//
// Why two batches: the PG source requires a specific schema-prepared
// database and pglogrepl's handshake/keepalive surface; isolating it
// keeps the core semantics (fan-out, acking, subscriber errors)
// testable without a live PG.
package wal
