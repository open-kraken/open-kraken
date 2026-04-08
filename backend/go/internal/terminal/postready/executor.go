package postready

import (
	"strings"
	"sync"
	"time"

	"open-kraken/backend/go/internal/terminal/intelligence"
)

// InputSink receives text to be written to the terminal PTY.
type InputSink interface {
	WriteInput(data string) error
}

// Executor manages the post-ready action queue for a session.
type Executor struct {
	mu    sync.Mutex
	state State
	queue []Action
	sink  InputSink

	// Extracted values.
	remoteSessionID string

	// Timing.
	lastStepAt time.Time
	startedAt  time.Time
	now        func() time.Time
}

// NewExecutor creates an Executor with the given plan.
func NewExecutor(plan Plan, sink InputSink) *Executor {
	queue := make([]Action, len(plan.Steps))
	copy(queue, plan.Steps)
	return &Executor{
		state: StateIdle,
		queue: queue,
		sink:  sink,
		now:   time.Now,
	}
}

// State returns the current post-ready state.
func (e *Executor) State() State {
	e.mu.Lock()
	defer e.mu.Unlock()
	return e.state
}

// QueueLen returns remaining steps.
func (e *Executor) QueueLen() int {
	e.mu.Lock()
	defer e.mu.Unlock()
	return len(e.queue)
}

// RemoteSessionID returns the extracted session ID (if any).
func (e *Executor) RemoteSessionID() string {
	e.mu.Lock()
	defer e.mu.Unlock()
	return e.remoteSessionID
}

// Start begins the post-ready sequence.
func (e *Executor) Start() {
	e.mu.Lock()
	defer e.mu.Unlock()
	if e.state != StateIdle {
		return
	}
	now := e.now()
	e.state = StateStarting
	e.startedAt = now
	e.lastStepAt = now
}

// Step attempts to execute the next action in the queue.
// Returns true if an action was executed, false if waiting or done.
func (e *Executor) Step(outputLines []string) bool {
	e.mu.Lock()
	defer e.mu.Unlock()

	if e.state != StateStarting || len(e.queue) == 0 {
		if e.state == StateStarting && len(e.queue) == 0 {
			e.state = StateDone
		}
		return false
	}

	action := e.queue[0]
	now := e.now()

	// Stability gate: wait for output to settle.
	if action.RequireStable && now.Sub(e.lastStepAt) < intelligence.PostReadyStableDuration {
		return false
	}

	switch action.Type {
	case ActionInput:
		if e.sink != nil {
			_ = e.sink.WriteInput(action.Input + "\n")
		}
		e.advance(now)
		return true

	case ActionDelay:
		if now.Sub(e.lastStepAt) < action.Delay {
			return false
		}
		e.advance(now)
		return true

	case ActionExtractSessionID:
		id := extractSessionID(outputLines, action.Keyword)
		if id != "" {
			e.remoteSessionID = id
			e.advance(now)
			return true
		}
		return false

	case ActionWaitForPattern:
		if matchPattern(outputLines, action.Pattern) {
			e.advance(now)
			return true
		}
		return false

	case ActionIntroduction:
		if e.sink != nil {
			prompt := buildIntroductionPrompt(action.PromptType)
			if prompt != "" {
				_ = e.sink.WriteInput(prompt + "\n")
			}
		}
		e.advance(now)
		return true
	}

	return false
}

func (e *Executor) advance(now time.Time) {
	e.queue = e.queue[1:]
	e.lastStepAt = now
	if len(e.queue) == 0 {
		e.state = StateDone
	}
}

// extractSessionID searches output lines for a keyword and extracts
// the value that follows it (e.g., "Session ID: abc123").
func extractSessionID(lines []string, keyword string) string {
	for _, line := range lines {
		idx := strings.Index(line, keyword)
		if idx >= 0 {
			rest := strings.TrimSpace(line[idx+len(keyword):])
			// Take the first word.
			if parts := strings.Fields(rest); len(parts) > 0 {
				return parts[0]
			}
		}
	}
	return ""
}

// matchPattern checks if any output line contains the pattern.
func matchPattern(lines []string, pattern string) bool {
	for _, line := range lines {
		if strings.Contains(line, pattern) {
			return true
		}
	}
	return false
}

// buildIntroductionPrompt generates a context-specific prompt.
func buildIntroductionPrompt(promptType string) string {
	switch promptType {
	case "ai_onboarding":
		return "You are now connected to the Kraken workspace. Please introduce yourself briefly."
	case "status_check":
		return "/status"
	default:
		return ""
	}
}
