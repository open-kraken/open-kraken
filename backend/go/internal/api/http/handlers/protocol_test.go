package handlers

import (
	"context"
	"encoding/json"
	"testing"
	"time"

	"open-kraken/backend/go/internal/pty"
	"open-kraken/backend/go/internal/realtime"
	"open-kraken/backend/go/internal/session"
	"open-kraken/backend/go/internal/terminal"
)

func TestDispatchAndAttachPayloadShape(t *testing.T) {
	proc := pty.NewFakeProcess()
	hub := realtime.NewHub(256)
	service := terminal.NewService(session.NewRegistry(), pty.NewFakeLauncher(proc), hub)

	_, err := service.CreateSession(context.Background(), session.CreateRequest{
		SessionID:   "session-shape",
		WorkspaceID: "ws-shape",
		MemberID:    "member-shape",
		Command:     "echo hi",
	})
	if err != nil {
		t.Fatalf("create session: %v", err)
	}
	proc.PushOutput("hello")
	deadline := time.After(2 * time.Second)
	for {
		if len(service.ListSessions("ws-shape")) > 0 && service.ListSessions("ws-shape")[0].Seq == 1 {
			break
		}
		select {
		case <-deadline:
			t.Fatalf("timeout waiting for retained delta")
		default:
			time.Sleep(10 * time.Millisecond)
		}
	}
	attach, err := service.AttachSession(session.AttachRequest{
		SessionID:    "session-shape",
		SubscriberID: "sub-1",
		AfterSeq:     0,
	})
	if err != nil {
		t.Fatalf("attach session: %v", err)
	}
	if err := service.Dispatch("session-shape", "@assistant hi", session.DispatchContext{
		ConversationID:   "conv-1",
		ConversationType: "channel",
		SenderID:         "user-1",
		SenderName:       "Owner",
		MessageID:        "msg-1",
		ClientTraceID:    "trace-1",
		Timestamp:        123456789,
	}); err != nil {
		t.Fatalf("dispatch: %v", err)
	}

	assertJSONKeys(t, attach.Snapshot, "sessionId", "subscriberId", "seq", "rows", "cols", "cursor", "terminalStatus", "buffer")
	assertJSONKeys(t, attach.Status, "sessionId", "subscriberId", "seq", "terminalStatus")
	if len(attach.Deltas) == 0 {
		t.Fatalf("expected retained delta")
	}
	assertJSONKeys(t, attach.Deltas[0], "sessionId", "subscriberId", "seq", "data", "cursor", "terminalStatus")

	result, err := hub.Subscribe(realtime.SubscribeRequest{TerminalIDs: []string{"session-shape"}})
	if err != nil {
		t.Fatalf("subscribe: %v", err)
	}
	defer result.Subscription.Close()
	if err := service.Dispatch("session-shape", "again", session.DispatchContext{}); err != nil {
		t.Fatalf("second dispatch: %v", err)
	}
	event := <-result.Subscription.Events
	for event.Name != session.EventDispatch {
		event = <-result.Subscription.Events
	}
	assertJSONKeys(t, event.Payload, "sessionId", "seq", "data", "terminalStatus", "context")
}

func TestRealtimeTerminalPayloadShape(t *testing.T) {
	proc := pty.NewFakeProcess()
	hub := realtime.NewHub(256)
	service := terminal.NewService(session.NewRegistry(), pty.NewFakeLauncher(proc), hub)

	_, err := service.CreateSession(context.Background(), session.CreateRequest{
		SessionID:   "session-shape-rt",
		WorkspaceID: "ws-shape",
		MemberID:    "member-shape",
		Command:     "echo hi",
	})
	if err != nil {
		t.Fatalf("create session: %v", err)
	}
	if _, err := service.AttachSession(session.AttachRequest{
		SessionID:    "session-shape-rt",
		SubscriberID: "sub-1",
		AfterSeq:     0,
	}); err != nil {
		t.Fatalf("attach session: %v", err)
	}

	result, err := hub.Subscribe(realtime.SubscribeRequest{
		WorkspaceID: "ws-shape",
		TerminalIDs: []string{"session-shape-rt"},
	})
	if err != nil {
		t.Fatalf("subscribe: %v", err)
	}
	defer result.Subscription.Close()

	proc.PushOutput("hello")
	event := <-result.Subscription.Events
	for event.Name != realtime.EventTerminalDelta {
		event = <-result.Subscription.Events
	}
	assertJSONKeys(t, event.Payload, "terminalId", "sequence", "data")
}

func assertJSONKeys(t *testing.T, value interface{}, keys ...string) {
	t.Helper()
	bytes, err := json.Marshal(value)
	if err != nil {
		t.Fatalf("marshal payload: %v", err)
	}
	var payload map[string]any
	if err := json.Unmarshal(bytes, &payload); err != nil {
		t.Fatalf("unmarshal payload: %v", err)
	}
	for _, key := range keys {
		if _, ok := payload[key]; !ok {
			t.Fatalf("missing payload key %q in %+v", key, payload)
		}
	}
}
