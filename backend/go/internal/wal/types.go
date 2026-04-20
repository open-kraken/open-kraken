package wal

import (
	"context"
	"errors"
	"fmt"
	"time"
)

// Op is the kind of change captured by a single WAL event.
type Op string

const (
	OpInsert   Op = "INSERT"
	OpUpdate   Op = "UPDATE"
	OpDelete   Op = "DELETE"
	OpTruncate Op = "TRUNCATE"
)

// LSN is the PostgreSQL Log Sequence Number — a monotone position in
// the WAL stream. Stored as a string so this package does not drag in
// pglogrepl's type just to hold a token; the PG source converts at the
// boundary. Empty LSN is a valid sentinel for "no position yet".
type LSN string

// Event is one WAL-committed change. OldRow is populated on UPDATE
// (the pre-image, when the publication was created with replica
// identity FULL) and DELETE. NewRow is populated on INSERT and UPDATE.
// Both are nil on TRUNCATE.
//
// Row values use the raw PostgreSQL text representation because
// downstream subscribers decode to their own domain types. Keeping
// this package type-agnostic is what lets sem/cws/flowscheduler all
// subscribe without pulling their types into wal.
type Event struct {
	LSN       LSN
	CommitAt  time.Time
	Table     string // "runs" | "flows" | "steps" | "side_effects"
	Op        Op
	OldRow    map[string]string
	NewRow    map[string]string
}

// String is a terse single-line representation useful for logs.
func (e Event) String() string {
	id := e.NewRow["id"]
	if id == "" {
		id = e.OldRow["id"]
	}
	return fmt.Sprintf("%s %s %s lsn=%s", e.Op, e.Table, id, e.LSN)
}

// EventSource produces WAL events in commit order and persists the
// consumer's ack position. Implementations must:
//
//   - Block in Read until an event is available or ctx is cancelled.
//   - Honour the ack: once Ack(lsn) returns, the source promises to
//     never replay events at or before that LSN on subsequent Opens.
//   - Be safe for a single Read/Ack goroutine pair; concurrent
//     consumers are NOT supported by this interface.
type EventSource interface {
	// Open establishes the streaming session. Safe to call multiple
	// times after Close.
	Open(ctx context.Context) error

	// Read blocks until an event is available. Returns (nil, ctx.Err)
	// when ctx is cancelled.
	Read(ctx context.Context) (*Event, error)

	// Ack informs the source that the consumer has durably processed
	// every event up to and including lsn. The source is free to
	// garbage-collect earlier entries.
	Ack(ctx context.Context, lsn LSN) error

	// Close releases backend resources. Safe to call multiple times.
	Close() error
}

// ErrSourceClosed is returned by Read / Ack after Close has been called.
var ErrSourceClosed = errors.New("wal: source closed")
