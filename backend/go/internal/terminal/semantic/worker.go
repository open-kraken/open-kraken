// Package semantic provides per-session output analysis that extracts
// structured chat messages from raw terminal output.
package semantic

import (
	"context"
	"log"
	"time"

	"open-kraken/backend/go/internal/terminal/filter"
	"open-kraken/backend/go/internal/terminal/intelligence"
)

// EventType classifies events sent to the semantic worker.
type EventType int

const (
	EventOutput    EventType = iota // New PTY output bytes
	EventUserInput                  // User command (for chat context tracking)
	EventResize                     // Terminal resize
	EventFlush                      // Force snapshot extraction
	EventShutdown                   // Gracefully stop the worker
)

// Event is sent to the worker goroutine via channel.
type Event struct {
	Type EventType
	Data []byte // For EventOutput
	Text string // For EventUserInput

	// Chat context for EventUserInput.
	ConversationID   string
	ConversationType string
	SenderID         string
	SenderName       string
	SpanID           string

	// For EventResize.
	Rows, Cols uint16

	// For EventFlush.
	FlushReason string
}

// MessagePayload is the structured output sent to the message pipeline.
type MessagePayload struct {
	TerminalID     string
	MemberID       string
	WorkspaceID    string
	ConversationID string
	SenderID       string
	SenderName     string
	SpanID         string
	Content        string
	ContentType    string // "terminal"
	Source         string // "pty", "ai"
	Mode           string // "snapshot", "delta", "stream", "final"
	Command        string
	LineCount      int
	CursorRow      int
	CursorCol      int
	Seq            uint64
	Timestamp      time.Time
}

// MessageSink receives processed terminal messages.
type MessageSink interface {
	OnTerminalMessage(payload MessagePayload)
}

// Worker runs as a goroutine per session, processing semantic events.
type Worker struct {
	terminalID   string
	memberID     string
	workspaceID  string
	terminalType string
	eventCh      chan Event
	sink         MessageSink
	filterRT     *filter.Runtime

	// Chat context (set by UserInput events).
	chatConversationID string
	chatSenderID       string
	chatSenderName     string
	chatSpanID         string
	lastCommand        string

	// Output accumulator.
	lines     []string
	linesBuf  string
	chatSeq   uint64

	// Stream mode.
	streamEnabled    bool
	lastStreamAt     time.Time
	lastStreamContent string
}

// NewWorker creates a semantic Worker.
func NewWorker(terminalID, memberID, workspaceID, terminalType string, sink MessageSink) *Worker {
	profile := filter.ResolveProfile(terminalType)
	return &Worker{
		terminalID:   terminalID,
		memberID:     memberID,
		workspaceID:  workspaceID,
		terminalType: terminalType,
		eventCh:      make(chan Event, intelligence.OutputQueueCapacity),
		sink:         sink,
		filterRT:     filter.NewRuntime(profile),
	}
}

// Send sends an event to the worker. Non-blocking if channel is full (drops).
func (w *Worker) Send(e Event) {
	select {
	case w.eventCh <- e:
	default:
		log.Printf("semantic: event channel full for %s, dropping", w.terminalID)
	}
}

// Run processes events until shutdown or context cancellation.
func (w *Worker) Run(ctx context.Context) {
	for {
		select {
		case <-ctx.Done():
			return
		case e, ok := <-w.eventCh:
			if !ok {
				return
			}
			w.handleEvent(e)
			if e.Type == EventShutdown {
				return
			}
		}
	}
}

func (w *Worker) handleEvent(e Event) {
	switch e.Type {
	case EventOutput:
		w.handleOutput(e.Data)
	case EventUserInput:
		w.handleUserInput(e)
	case EventResize:
		// Resize just affects future snapshots; no action needed here.
	case EventFlush:
		w.handleFlush(e.FlushReason)
	case EventShutdown:
		// Flush any remaining content.
		if w.linesBuf != "" || len(w.lines) > 0 {
			w.handleFlush("shutdown")
		}
	}
}

func (w *Worker) handleOutput(data []byte) {
	text := string(data)
	w.linesBuf += text

	// Accumulate lines for snapshot extraction.
	for {
		idx := -1
		for i, c := range w.linesBuf {
			if c == '\n' {
				idx = i
				break
			}
		}
		if idx < 0 {
			break
		}
		line := w.linesBuf[:idx]
		w.linesBuf = w.linesBuf[idx+1:]
		w.lines = append(w.lines, line)

		// Keep within scrollback limit.
		if len(w.lines) > intelligence.SemanticScrollbackLines {
			w.lines = w.lines[len(w.lines)-intelligence.SemanticScrollbackLines:]
		}
	}

	// Stream mode: emit at throttled rate if enabled.
	if w.streamEnabled && w.sink != nil {
		now := time.Now()
		if now.Sub(w.lastStreamAt) >= intelligence.StreamEmitInterval {
			content := w.buildContent()
			if content != w.lastStreamContent {
				w.emitPayload(content, "stream")
				w.lastStreamContent = content
				w.lastStreamAt = now
			}
		}
	}
}

func (w *Worker) handleUserInput(e Event) {
	w.lastCommand = ExtractCommandFromInput(e.Text)
	w.chatConversationID = e.ConversationID
	w.chatSenderID = e.SenderID
	w.chatSenderName = e.SenderName
	w.chatSpanID = e.SpanID

	// Clear accumulated lines for new command output.
	w.lines = nil
	w.linesBuf = ""
}

func (w *Worker) handleFlush(reason string) {
	content := w.buildContent()
	if content == "" {
		return
	}

	// Apply filters.
	ctx := filter.Context{
		TerminalID:   w.terminalID,
		TerminalType: w.terminalType,
		LastCommand:  w.lastCommand,
	}
	result := w.filterRT.Apply(w.lines, ctx)
	if result.Decision == filter.DecisionDrop {
		return
	}
	if result.Lines != nil {
		content = joinLines(result.Lines)
	}

	mode := "final"
	if reason == "stream" {
		mode = "stream"
	}
	w.emitPayload(content, mode)

	// Reset after flush.
	w.lines = nil
	w.linesBuf = ""
}

func (w *Worker) buildContent() string {
	content := joinLines(w.lines)
	if w.linesBuf != "" {
		if content != "" {
			content += "\n"
		}
		content += w.linesBuf
	}
	return trimContent(content)
}

func (w *Worker) emitPayload(content, mode string) {
	if w.sink == nil || content == "" {
		return
	}
	w.chatSeq++
	w.sink.OnTerminalMessage(MessagePayload{
		TerminalID:     w.terminalID,
		MemberID:       w.memberID,
		WorkspaceID:    w.workspaceID,
		ConversationID: w.chatConversationID,
		SenderID:       w.chatSenderID,
		SenderName:     w.chatSenderName,
		SpanID:         w.chatSpanID,
		Content:        content,
		ContentType:    "terminal",
		Source:         "pty",
		Mode:           mode,
		Command:        w.lastCommand,
		LineCount:      len(w.lines),
		Seq:            w.chatSeq,
		Timestamp:      time.Now(),
	})
}

// SetStreamEnabled toggles stream mode.
func (w *Worker) SetStreamEnabled(enabled bool) {
	w.streamEnabled = enabled
}
