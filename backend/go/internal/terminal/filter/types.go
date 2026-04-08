// Package filter provides profile-based output filtering for terminal sessions.
// Different terminal types (Claude, Codex, Gemini, Shell) may produce output
// that should be filtered before being sent to the chat pipeline.
package filter

// Profile identifies which filter rules to apply.
type Profile string

const (
	ProfileGeneric Profile = "generic"
	ProfileClaude  Profile = "claude"
	ProfileCodex   Profile = "codex"
	ProfileGemini  Profile = "gemini"
	ProfileShell   Profile = "shell"
)

// Decision determines what to do with filtered output.
type Decision int

const (
	DecisionAllow Decision = iota
	DecisionDrop
	DecisionDefer
)

// Context provides information to filter rules.
type Context struct {
	TerminalID   string
	TerminalType string
	LastCommand  string
	LastInputLines []string
}

// Result is the outcome of applying filters.
type Result struct {
	Decision Decision
	Reason   string
	Profile  Profile
	Lines    []string // processed output lines (nil = unchanged)
}
