// Package intelligence provides the terminal status engine with timing-based
// state transitions aligned with golutra's terminal_engine constants.
package intelligence

import "time"

// Status machine timeouts (aligned with golutra session/mod.rs).
const (
	// StatusWorkingSilenceTimeout is the duration of output silence after which
	// a Working session transitions back to Online.
	StatusWorkingSilenceTimeout = 4500 * time.Millisecond

	// StatusIdleDebounce prevents rapid Online/Working transitions.
	StatusIdleDebounce = 1 * time.Second

	// WorkingIntentWindow ignores layout output immediately after a command,
	// preventing false "Online" transitions from tab completion or resizes.
	WorkingIntentWindow = 1500 * time.Millisecond
)

// Chat flush gating controls when terminal output is captured as chat messages.
const (
	// ChatSilenceTimeout is the output stabilization gate before flushing
	// terminal output to the chat pipeline.
	ChatSilenceTimeout = 3 * time.Second

	// ChatIdleDebounce debounces the flush trigger.
	ChatIdleDebounce = 1 * time.Second

	// ChatPendingForceFlush is a hard timeout to prevent progress indicators
	// from blocking chat output indefinitely.
	ChatPendingForceFlush = 30 * time.Second
)

// PTY I/O tuning constants.
const (
	// OutputEmitInterval batches PTY output at ~60fps.
	OutputEmitInterval = 16 * time.Millisecond

	// OutputEmitMaxBytes is the maximum batch size before forcing an emit.
	OutputEmitMaxBytes = 64 * 1024

	// OutputQueueCapacity is the PTY read buffer channel size.
	OutputQueueCapacity = 256

	// FlowControlHighWatermark pauses PTY reads when unacked bytes exceed this.
	FlowControlHighWatermark = 200 * 1024

	// FlowControlLowWatermark resumes PTY reads when unacked bytes drop below this.
	FlowControlLowWatermark = 20 * 1024
)

// Shell readiness detection constants.
const (
	// ShellReadyTimeout is the maximum wait before allowing user input.
	ShellReadyTimeout = 3 * time.Second

	// ShellReadyActivityDuration is the minimum output observation window.
	ShellReadyActivityDuration = 500 * time.Millisecond

	// ShellReadyActivityBytes is the output threshold that signals readiness.
	ShellReadyActivityBytes = 1024
)

// Post-ready sequencing constants.
const (
	// PostReadyStableDuration is the stability gate for post-ready steps.
	PostReadyStableDuration = 1200 * time.Millisecond

	// PostReadyTickInterval is the lightweight trigger interval for post-ready.
	PostReadyTickInterval = 600 * time.Millisecond

	// RedrawSuppressionWindow suppresses Working status during layout events.
	RedrawSuppressionWindow = 400 * time.Millisecond
)

// Dispatch queue limits.
const (
	// DispatchQueueLimit is the max queued commands.
	DispatchQueueLimit = 32

	// DispatchRecentLimit is the dedup window size.
	DispatchRecentLimit = 128

	// DispatchBatchSeparator preserves message boundaries in batched dispatch.
	DispatchBatchSeparator = "\n\n"
)

// Scrollback limits.
const (
	// SessionScrollbackLines is the maximum lines retained in the snapshot buffer.
	SessionScrollbackLines = 2000

	// SemanticScrollbackLines is the semantic layer's history limit.
	SemanticScrollbackLines = 5000
)

// Stream mode constants.
const (
	// StreamEmitInterval throttles stream updates at ~6Hz.
	StreamEmitInterval = 160 * time.Millisecond
)

// Special terminal signals.
const (
	// ShimReadySignal is the OSC signal indicating shim readiness.
	ShimReadySignal = "\x1b]633;A"
)
