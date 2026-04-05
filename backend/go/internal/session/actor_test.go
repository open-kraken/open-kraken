package session

import (
	"context"
	"testing"
	"time"

	"open-kraken/backend/go/internal/pty"
	"open-kraken/backend/go/internal/realtime"
)

type capturePublisher struct {
	events []realtime.Event
}

func (c *capturePublisher) Publish(event realtime.Event) realtime.Event {
	c.events = append(c.events, event)
	return event
}

func TestActorDispatchPublishesUnifiedPayload(t *testing.T) {
	pub := &capturePublisher{}
	proc := pty.NewFakeProcess()
	actor := NewActor(context.Background(), CreateRequest{
		SessionID:   "session-1",
		WorkspaceID: "ws-1",
		MemberID:    "member-1",
		Cols:        80,
		Rows:        24,
	}, proc, pub)
	defer actor.Close()

	err := actor.Dispatch("hello", DispatchContext{
		ConversationID:   "conv-1",
		ConversationType: "channel",
		SenderID:         "user-1",
		SenderName:       "owner",
		MessageID:        "msg-1",
		ClientTraceID:    "trace-1",
		Timestamp:        123,
	})
	if err != nil {
		t.Fatalf("dispatch error: %v", err)
	}

	if len(pub.events) < 2 {
		t.Fatalf("expected status + dispatch events, got %d", len(pub.events))
	}
	var found bool
	for _, event := range pub.events {
		if event.Name != EventDispatch {
			continue
		}
		payload, ok := event.Payload.(DispatchPayload)
		if !ok {
			t.Fatalf("unexpected dispatch payload type: %#v", event.Payload)
		}
		if payload.SessionID != "session-1" || payload.Context.ConversationID != "conv-1" {
			t.Fatalf("payload mismatch: %+v", payload)
		}
		found = true
	}
	if !found {
		t.Fatalf("dispatch event not found: %+v", pub.events)
	}
}

func TestActorExitAndErrorFreezeTerminalStatus(t *testing.T) {
	pub := &capturePublisher{}
	proc := pty.NewFakeProcess()
	actor := NewActor(context.Background(), CreateRequest{SessionID: "session-freeze"}, proc, pub)

	exitCode := int32(7)
	proc.EmitExit(pty.Exit{Code: &exitCode})
	time.Sleep(20 * time.Millisecond)
	if actor.Info().Status != StatusExited {
		t.Fatalf("status = %s want %s", actor.Info().Status, StatusExited)
	}
	if err := actor.WriteInput("pwd\n"); err == nil {
		t.Fatalf("expected exited actor to reject writes")
	}
}
