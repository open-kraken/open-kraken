package intelligence

import (
	"testing"
	"time"
)

func TestStatusEngineInitialState(t *testing.T) {
	e := NewStatusEngine()
	if e.Status() != StatusConnecting {
		t.Fatalf("expected connecting, got %s", e.Status())
	}
	if e.ShellReady() {
		t.Fatal("expected shell not ready")
	}
}

func TestStatusEngineOnOutputTransitions(t *testing.T) {
	e := NewStatusEngine()
	now := time.Now()
	e.now = func() time.Time { return now }

	// Output arrives → transitions to Online.
	e.OnOutput(100)
	changed, status := e.Evaluate()
	// After OnOutput, status should be Online (from Connecting).
	if e.Status() != StatusOnline {
		t.Fatalf("expected online after output, got %s", e.Status())
	}
	_ = changed
	_ = status
}

func TestStatusEngineWorkingTransition(t *testing.T) {
	e := NewStatusEngine()
	now := time.Now()
	e.now = func() time.Time { return now }

	// Make it online first.
	e.OnOutput(1024)

	// User input → Working.
	e.OnInput()
	if e.Status() != StatusWorking {
		t.Fatalf("expected working after input, got %s", e.Status())
	}
}

func TestStatusEngineWorkingSilenceTimeout(t *testing.T) {
	e := NewStatusEngine()
	now := time.Now()
	e.now = func() time.Time { return now }

	e.OnOutput(1024) // → Online
	e.OnInput()       // → Working

	// Advance past silence timeout.
	now = now.Add(StatusWorkingSilenceTimeout + WorkingIntentWindow + time.Second)
	e.now = func() time.Time { return now }

	// Set lastOutputAt to an old time.
	e.mu.Lock()
	e.lastOutputAt = now.Add(-StatusWorkingSilenceTimeout - time.Second)
	e.mu.Unlock()

	changed, status := e.Evaluate()
	if !changed {
		t.Fatal("expected status change")
	}
	if status != StatusOnline {
		t.Fatalf("expected online after silence, got %s", status)
	}
}

func TestStatusEngineChatPending(t *testing.T) {
	e := NewStatusEngine()
	now := time.Now()
	e.now = func() time.Time { return now }

	e.OnOutput(100)
	if !e.ChatPending() {
		t.Fatal("expected chat pending after output")
	}

	// Not yet ready to flush (silence timeout not met).
	if e.EvaluateChat() {
		t.Fatal("should not flush immediately")
	}

	// Advance past silence timeout.
	now = now.Add(ChatSilenceTimeout + time.Second)
	e.now = func() time.Time { return now }

	if !e.EvaluateChat() {
		t.Fatal("should flush after silence timeout")
	}

	e.AckChatFlush()
	if e.ChatPending() {
		t.Fatal("expected chat not pending after ack")
	}
}

func TestStatusEngineChatForceFlush(t *testing.T) {
	e := NewStatusEngine()
	now := time.Now()
	e.now = func() time.Time { return now }

	e.OnOutput(100)

	// Keep output coming to prevent silence flush.
	for i := 0; i < 10; i++ {
		now = now.Add(1 * time.Second)
		e.now = func() time.Time { return now }
		e.OnOutput(10)
	}

	// Not yet force flush.
	if e.EvaluateChat() {
		t.Fatal("should not force flush yet")
	}

	// Advance past force flush timeout.
	now = now.Add(ChatPendingForceFlush)
	e.now = func() time.Time { return now }

	if !e.EvaluateChat() {
		t.Fatal("should force flush after pending timeout")
	}
}

func TestFlowControl(t *testing.T) {
	fc := NewFlowControl()

	fc.Add(100 * 1024)
	if fc.ShouldPause() {
		t.Fatal("should not pause at 100KB")
	}

	fc.Add(150 * 1024)
	if !fc.ShouldPause() {
		t.Fatal("should pause at 250KB")
	}

	fc.Ack(240 * 1024)
	if !fc.ShouldResume() {
		t.Fatal("should resume at 10KB")
	}
}

func TestStatusEngineRedrawSuppression(t *testing.T) {
	e := NewStatusEngine()
	now := time.Now()
	e.now = func() time.Time { return now }

	e.OnOutput(1024) // → Online
	e.SuppressRedraw()

	// Output during suppression should not change to Working.
	e.OnOutput(100)
	if e.Status() != StatusOnline {
		t.Fatalf("expected online during redraw suppression, got %s", e.Status())
	}
}
