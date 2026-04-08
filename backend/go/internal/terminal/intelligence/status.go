package intelligence

import (
	"sync"
	"time"
)

// TerminalStatus represents the high-level terminal state visible to users.
type TerminalStatus string

const (
	StatusConnecting TerminalStatus = "connecting"
	StatusOnline     TerminalStatus = "online"
	StatusWorking    TerminalStatus = "working"
	StatusOffline    TerminalStatus = "offline"
)

// StatusEngine tracks timing-based state transitions for a single terminal
// session. It determines whether the terminal is Online (idle) or Working
// (executing a command) based on output activity patterns.
//
// Thread-safe — all methods acquire the internal mutex.
type StatusEngine struct {
	mu sync.Mutex

	status TerminalStatus

	// Timestamps for transition logic.
	lastOutputAt       time.Time
	lastInputAt        time.Time
	idleCandidateAt    time.Time
	chatCandidateAt    time.Time
	workingIntentUntil time.Time
	redrawSuppressUntil time.Time

	// Chat flush state.
	chatPending      bool
	chatPendingSince time.Time

	// Semantic state.
	semanticActive bool

	// Shell readiness.
	shellReady       bool
	shellReadySince  time.Time
	outputBytesTotal int64

	// Status lock prevents transitions during certain operations.
	statusLocked bool

	now func() time.Time
}

// NewStatusEngine creates a StatusEngine starting in Connecting state.
func NewStatusEngine() *StatusEngine {
	return &StatusEngine{
		status: StatusConnecting,
		now:    time.Now,
	}
}

// Status returns the current terminal status.
func (e *StatusEngine) Status() TerminalStatus {
	e.mu.Lock()
	defer e.mu.Unlock()
	return e.status
}

// IsWorking returns true if the terminal is currently executing a command.
func (e *StatusEngine) IsWorking() bool {
	e.mu.Lock()
	defer e.mu.Unlock()
	return e.status == StatusWorking
}

// ShellReady returns true if the terminal has completed initial setup.
func (e *StatusEngine) ShellReady() bool {
	e.mu.Lock()
	defer e.mu.Unlock()
	return e.shellReady
}

// ChatPending returns true if there's output waiting to be flushed to chat.
func (e *StatusEngine) ChatPending() bool {
	e.mu.Lock()
	defer e.mu.Unlock()
	return e.chatPending
}

// OnOutput is called when new PTY output arrives. It updates timing state
// and may transition from Online to Working.
func (e *StatusEngine) OnOutput(bytesLen int) {
	e.mu.Lock()
	defer e.mu.Unlock()

	now := e.now()
	e.lastOutputAt = now
	e.outputBytesTotal += int64(bytesLen)

	// Shell readiness detection.
	if !e.shellReady {
		if e.shellReadySince.IsZero() {
			e.shellReadySince = now
		}
		if e.outputBytesTotal >= ShellReadyActivityBytes ||
			now.Sub(e.shellReadySince) >= ShellReadyTimeout {
			e.shellReady = true
		}
	}

	if e.statusLocked || e.status == StatusOffline {
		return
	}

	// During redraw suppression, don't transition to Working.
	if now.Before(e.redrawSuppressUntil) {
		return
	}

	// Transition to Online once connecting and output arrives.
	if e.status == StatusConnecting {
		e.status = StatusOnline
	}

	// Mark chat pending if not already.
	if !e.chatPending {
		e.chatPending = true
		e.chatPendingSince = now
	}

	// Update idle candidate (non-progress-indicator output).
	e.idleCandidateAt = now
}

// OnInput is called when user input is sent to the terminal.
// Transitions Online → Working.
func (e *StatusEngine) OnInput() {
	e.mu.Lock()
	defer e.mu.Unlock()

	now := e.now()
	e.lastInputAt = now
	e.workingIntentUntil = now.Add(WorkingIntentWindow)

	if e.statusLocked || e.status == StatusOffline {
		return
	}

	if e.status == StatusOnline || e.status == StatusConnecting {
		e.status = StatusWorking
		e.semanticActive = true
	}
}

// Evaluate is called periodically by the polling engine. It checks timeouts
// and returns any status change that occurred.
func (e *StatusEngine) Evaluate() (changed bool, newStatus TerminalStatus) {
	e.mu.Lock()
	defer e.mu.Unlock()

	if e.statusLocked || e.status == StatusOffline {
		return false, e.status
	}

	now := e.now()
	prev := e.status

	switch e.status {
	case StatusWorking:
		// Working → Online after silence timeout.
		if !e.lastOutputAt.IsZero() &&
			now.Sub(e.lastOutputAt) >= StatusWorkingSilenceTimeout &&
			now.After(e.workingIntentUntil) {
			e.status = StatusOnline
			e.semanticActive = false
		}
	case StatusConnecting:
		// Connecting → Online after shell ready or timeout.
		if e.shellReady {
			e.status = StatusOnline
		}
	}

	return e.status != prev, e.status
}

// EvaluateChat checks chat flush conditions and returns true when output
// should be flushed to the chat pipeline.
func (e *StatusEngine) EvaluateChat() (shouldFlush bool) {
	e.mu.Lock()
	defer e.mu.Unlock()

	if !e.chatPending {
		return false
	}

	now := e.now()

	// Force flush if pending too long (progress indicator protection).
	if now.Sub(e.chatPendingSince) >= ChatPendingForceFlush {
		return true
	}

	// Flush when output has stabilized (silence timeout).
	if !e.lastOutputAt.IsZero() && now.Sub(e.lastOutputAt) >= ChatSilenceTimeout {
		return true
	}

	// Flush when transitioning from Working to Online.
	if e.status == StatusOnline && e.semanticActive {
		return true
	}

	return false
}

// AckChatFlush resets the chat pending state after a successful flush.
func (e *StatusEngine) AckChatFlush() {
	e.mu.Lock()
	defer e.mu.Unlock()
	e.chatPending = false
	e.chatPendingSince = time.Time{}
	e.chatCandidateAt = e.now()
}

// SetOffline transitions to the Offline state.
func (e *StatusEngine) SetOffline() {
	e.mu.Lock()
	defer e.mu.Unlock()
	e.status = StatusOffline
}

// SuppressRedraw temporarily prevents Working transitions during resize/tab switch.
func (e *StatusEngine) SuppressRedraw() {
	e.mu.Lock()
	defer e.mu.Unlock()
	e.redrawSuppressUntil = e.now().Add(RedrawSuppressionWindow)
}

// Lock prevents any status transitions until Unlock is called.
func (e *StatusEngine) Lock() {
	e.mu.Lock()
	defer e.mu.Unlock()
	e.statusLocked = true
}

// Unlock re-enables status transitions.
func (e *StatusEngine) Unlock() {
	e.mu.Lock()
	defer e.mu.Unlock()
	e.statusLocked = false
}

// Snapshot returns a read-only copy of the engine's timing state for the
// polling engine to evaluate without holding the lock.
func (e *StatusEngine) Snapshot() StatusSnapshot {
	e.mu.Lock()
	defer e.mu.Unlock()
	return StatusSnapshot{
		Status:           e.status,
		LastOutputAt:     e.lastOutputAt,
		LastInputAt:      e.lastInputAt,
		IdleCandidateAt:  e.idleCandidateAt,
		ChatPending:      e.chatPending,
		ChatPendingSince: e.chatPendingSince,
		SemanticActive:   e.semanticActive,
		ShellReady:       e.shellReady,
	}
}

// StatusSnapshot is a read-only copy of status engine state.
type StatusSnapshot struct {
	Status           TerminalStatus
	LastOutputAt     time.Time
	LastInputAt      time.Time
	IdleCandidateAt  time.Time
	ChatPending      bool
	ChatPendingSince time.Time
	SemanticActive   bool
	ShellReady       bool
}
