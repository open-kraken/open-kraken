package postready

import (
	"testing"
	"time"
)

type mockSink struct {
	inputs []string
}

func (m *mockSink) WriteInput(data string) error {
	m.inputs = append(m.inputs, data)
	return nil
}

func TestExecutorLifecycle(t *testing.T) {
	sink := &mockSink{}
	plan := Plan{Steps: []Action{
		{Type: ActionInput, Input: "hello"},
		{Type: ActionInput, Input: "world"},
	}}
	e := NewExecutor(plan, sink)

	if e.State() != StateIdle {
		t.Fatalf("expected idle, got %s", e.State())
	}
	if e.QueueLen() != 2 {
		t.Fatalf("expected 2 steps, got %d", e.QueueLen())
	}

	e.Start()
	if e.State() != StateStarting {
		t.Fatalf("expected starting, got %s", e.State())
	}

	e.Step(nil)
	if len(sink.inputs) != 1 || sink.inputs[0] != "hello\n" {
		t.Fatalf("expected hello input, got %v", sink.inputs)
	}

	e.Step(nil)
	if len(sink.inputs) != 2 || sink.inputs[1] != "world\n" {
		t.Fatalf("expected world input, got %v", sink.inputs)
	}

	if e.State() != StateDone {
		t.Fatalf("expected done, got %s", e.State())
	}
}

func TestExecutorWaitForPattern(t *testing.T) {
	sink := &mockSink{}
	plan := Plan{Steps: []Action{
		{Type: ActionWaitForPattern, Pattern: "ready>"},
	}}
	e := NewExecutor(plan, sink)
	e.Start()

	// No matching output.
	executed := e.Step([]string{"loading...", "still loading"})
	if executed {
		t.Fatal("should not execute without pattern match")
	}

	// Matching output.
	executed = e.Step([]string{"loading...", "ready> "})
	if !executed {
		t.Fatal("should execute with pattern match")
	}
	if e.State() != StateDone {
		t.Fatalf("expected done, got %s", e.State())
	}
}

func TestExecutorExtractSessionID(t *testing.T) {
	sink := &mockSink{}
	plan := Plan{Steps: []Action{
		{Type: ActionExtractSessionID, Keyword: "Session:"},
	}}
	e := NewExecutor(plan, sink)
	e.Start()

	e.Step([]string{"Welcome", "Session: abc123 active"})
	if e.RemoteSessionID() != "abc123" {
		t.Fatalf("expected abc123, got %s", e.RemoteSessionID())
	}
}

func TestExecutorDelay(t *testing.T) {
	sink := &mockSink{}
	plan := Plan{Steps: []Action{
		{Type: ActionDelay, Delay: 100 * time.Millisecond},
		{Type: ActionInput, Input: "after delay"},
	}}
	e := NewExecutor(plan, sink)
	now := time.Now()
	e.now = func() time.Time { return now }

	e.Start()

	// Delay not met yet.
	executed := e.Step(nil)
	if executed {
		t.Fatal("should not execute before delay")
	}

	// Advance past delay.
	now = now.Add(200 * time.Millisecond)
	e.now = func() time.Time { return now }

	executed = e.Step(nil)
	if !executed {
		t.Fatal("should execute after delay")
	}

	// Next step should execute.
	e.Step(nil)
	if len(sink.inputs) != 1 || sink.inputs[0] != "after delay\n" {
		t.Fatalf("unexpected inputs: %v", sink.inputs)
	}
}
