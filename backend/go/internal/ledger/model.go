// Package ledger provides an append-only audit trail of workspace actions
// (commands, tool runs, etc.) for retrospective review.
package ledger

import "time"

// LedgerEvent is one immutable record in the central ledger.
type LedgerEvent struct {
	ID            string
	WorkspaceID   string
	TeamID        string
	MemberID      string
	NodeID        string
	EventType     string
	Summary       string
	CorrelationID string
	SessionID     string
	// ContextJSON is opaque JSON (cwd, exitCode, tool args metadata, etc.).
	ContextJSON string
	Timestamp   time.Time
}

// Query filters list operations.
type Query struct {
	WorkspaceID string
	TeamID      string
	MemberID    string
	NodeID      string
	EventType   string
	Since       *time.Time
	Until       *time.Time
	Limit       int
}
