package polling

import (
	"open-kraken/backend/go/internal/terminal/intelligence"
)

// SessionSnapshot is a read-only view of a session's state for rule evaluation.
// Collected from the session registry without holding long locks.
type SessionSnapshot struct {
	TerminalID   string
	TerminalType string
	MemberID     string
	WorkspaceID  string
	Status       intelligence.StatusSnapshot
	ShellReady   bool
	UIActive     bool
	PostReady    PostReadySnapshot
}

// PostReadySnapshot captures the post-ready queue state.
type PostReadySnapshot struct {
	State    string // "idle", "starting", "done"
	QueueLen int
}
