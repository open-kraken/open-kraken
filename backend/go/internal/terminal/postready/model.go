// Package postready provides the post-launch setup automation system.
// When a terminal session starts, it may need to execute a sequence of
// actions (send input, wait for patterns, extract session IDs) before
// becoming fully ready for user interaction.
package postready

import "time"

// State tracks the post-ready sequence lifecycle.
type State string

const (
	StateIdle     State = "idle"
	StateStarting State = "starting"
	StateDone     State = "done"
)

// ActionType classifies a post-ready step.
type ActionType int

const (
	// ActionInput sends text to the terminal.
	ActionInput ActionType = iota
	// ActionDelay waits for a specified duration.
	ActionDelay
	// ActionExtractSessionID parses a session ID from terminal output.
	ActionExtractSessionID
	// ActionWaitForPattern waits for a regex pattern in output.
	ActionWaitForPattern
	// ActionIntroduction sends a context-specific prompt.
	ActionIntroduction
)

// Action is a single step in the post-ready sequence.
type Action struct {
	Type          ActionType
	Input         string        // For ActionInput
	Delay         time.Duration // For ActionDelay
	Keyword       string        // For ActionExtractSessionID
	Pattern       string        // For ActionWaitForPattern
	PromptType    string        // For ActionIntroduction
	RequireStable bool          // Wait for output stability before executing
}

// Plan is an ordered list of post-ready actions.
type Plan struct {
	Steps []Action
}
