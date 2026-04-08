// Package polling implements the event-driven polling engine that periodically
// evaluates session state and triggers actions (status transitions, semantic
// flushes, post-ready steps).
package polling

// ActionType classifies what the polling engine should do.
type ActionType int

const (
	// ActionSessionUpdate triggers a status transition.
	ActionSessionUpdate ActionType = iota
	// ActionSemanticFlush triggers a chat output capture.
	ActionSemanticFlush
	// ActionPostReadyStart begins the post-ready sequence.
	ActionPostReadyStart
	// ActionPostReadyStep advances the post-ready queue.
	ActionPostReadyStep
)

// Action represents a single polling decision.
type Action struct {
	Type       ActionType
	TerminalID string

	// For ActionSessionUpdate: the new status to set.
	NewStatus string

	// For ActionSemanticFlush: metadata about the flush.
	FlushReason string
}
