package handlers_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"
	"time"

	"github.com/gorilla/websocket"
	apihttp "open-kraken/backend/go/internal/api/http"
	"open-kraken/backend/go/internal/pty"
	"open-kraken/backend/go/internal/realtime"
	"open-kraken/backend/go/internal/session"
	"open-kraken/backend/go/internal/terminal"
)

func TestRealtimeHandlerAttachSnapshotDeltaStatusFlow(t *testing.T) {
	proc := pty.NewFakeProcess()
	hub := realtime.NewHub(256)
	service := terminal.NewService(session.NewRegistry(), pty.NewFakeLauncher(proc), hub)
	_, err := service.CreateSession(context.Background(), session.CreateRequest{
		SessionID:   "session-ws",
		WorkspaceID: "ws-1",
		MemberID:    "member-1",
		Rows:        24,
		Cols:        80,
	})
	if err != nil {
		t.Fatalf("create session: %v", err)
	}
	proc.PushOutput("snapshot")
	time.Sleep(20 * time.Millisecond)

	server := httptest.NewServer(apihttp.NewHandler(service, hub))
	defer server.Close()

	wsURL, err := url.Parse(server.URL)
	if err != nil {
		t.Fatalf("parse server url: %v", err)
	}
	wsURL.Scheme = "ws"
	wsURL.Path = "/realtime"
	query := wsURL.Query()
	query.Set("workspaceId", "ws-1")
	query.Set("memberId", "owner-1")
	wsURL.RawQuery = query.Encode()

	headers := http.Header{
		"X-Open-Kraken-Actor-Id":     {"owner-1"},
		"X-Open-Kraken-Actor-Role":   {"owner"},
		"X-Open-Kraken-Workspace-Id": {"ws-1"},
	}
	conn, _, err := websocket.DefaultDialer.Dial(wsURL.String(), headers)
	if err != nil {
		t.Fatalf("dial websocket: %v", err)
	}
	defer conn.Close()
	_ = conn.SetReadDeadline(time.Now().Add(2 * time.Second))

	var handshake map[string]any
	if err := conn.ReadJSON(&handshake); err != nil {
		t.Fatalf("read handshake: %v", err)
	}
	if handshake["type"] != "handshake.accepted" {
		t.Fatalf("unexpected handshake: %+v", handshake)
	}

	if err := conn.WriteJSON(map[string]any{
		"type": session.EventAttach,
		"payload": map[string]any{
			"sessionId":    "session-ws",
			"subscriberId": "sub-1",
			"afterSeq":     0,
		},
	}); err != nil {
		t.Fatalf("attach over websocket: %v", err)
	}

	names := make([]string, 0, 4)
	for i := 0; i < 4; i++ {
		var event realtime.Event
		if err := conn.ReadJSON(&event); err != nil {
			t.Fatalf("read event %d: %v", i, err)
		}
		names = append(names, event.Name)
	}
	expected := []string{
		realtime.EventTerminalAttach,
		realtime.EventTerminalSnapshot,
		realtime.EventTerminalDelta,
		realtime.EventTerminalStatus,
	}
	for i, name := range expected {
		if names[i] != name {
			t.Fatalf("event[%d]=%s want %s", i, names[i], name)
		}
	}
}

func TestRealtimeHandlerRejectsMismatchedMemberID(t *testing.T) {
	hub := realtime.NewHub(256)
	service := terminal.NewService(session.NewRegistry(), pty.NewFakeLauncher(pty.NewFakeProcess()), hub)
	server := httptest.NewServer(apihttp.NewHandler(service, hub))
	defer server.Close()

	wsURL, err := url.Parse(server.URL)
	if err != nil {
		t.Fatalf("parse server url: %v", err)
	}
	wsURL.Scheme = "ws"
	wsURL.Path = "/realtime"
	query := wsURL.Query()
	query.Set("workspaceId", "ws-1")
	query.Set("memberId", "member-2")
	wsURL.RawQuery = query.Encode()

	headers := http.Header{
		"X-Open-Kraken-Actor-Id":     {"owner-1"},
		"X-Open-Kraken-Actor-Role":   {"owner"},
		"X-Open-Kraken-Workspace-Id": {"ws-1"},
	}
	conn, _, err := websocket.DefaultDialer.Dial(wsURL.String(), headers)
	if err != nil {
		t.Fatalf("dial websocket: %v", err)
	}
	defer conn.Close()

	var frame map[string]any
	if err := conn.ReadJSON(&frame); err != nil {
		t.Fatalf("read rejected handshake: %v", err)
	}
	if frame["type"] != "handshake.rejected" {
		t.Fatalf("expected handshake rejection, got %+v", frame)
	}
	errorBody, _ := frame["error"].(map[string]any)
	if errorBody["code"] != "auth.workspace_mismatch" {
		t.Fatalf("expected auth.workspace_mismatch, got %+v", frame)
	}
}

func TestRealtimeHandlerMembersSubscriptionDoesNotReplayTerminalEvents(t *testing.T) {
	hub := realtime.NewHub(256)
	service := terminal.NewService(session.NewRegistry(), pty.NewFakeLauncher(pty.NewFakeProcess()), hub)
	hub.Publish(realtime.Event{
		Name:        realtime.EventTerminalSnapshot,
		WorkspaceID: "ws-1",
		TerminalID:  "term-1",
		Payload: realtime.TerminalSnapshotPayload{
			TerminalID:      "term-1",
			ConnectionState: "attached",
			ProcessState:    "online",
		},
	})
	hub.Publish(realtime.Event{
		Name:        realtime.EventPresenceSnapshot,
		WorkspaceID: "ws-1",
		Payload: realtime.PresenceSnapshotPayload{
			Members: []realtime.PresenceMember{{
				MemberID:      "owner-1",
				PresenceState: "online",
			}},
		},
	})
	server := httptest.NewServer(apihttp.NewHandler(service, hub))
	defer server.Close()

	wsURL, err := url.Parse(server.URL)
	if err != nil {
		t.Fatalf("parse server url: %v", err)
	}
	wsURL.Scheme = "ws"
	wsURL.Path = "/realtime"
	query := wsURL.Query()
	query.Set("workspaceId", "ws-1")
	query.Set("memberId", "owner-1")
	query.Set("subscriptions", "members")
	wsURL.RawQuery = query.Encode()

	headers := http.Header{
		"X-Open-Kraken-Actor-Id":     {"owner-1"},
		"X-Open-Kraken-Actor-Role":   {"owner"},
		"X-Open-Kraken-Workspace-Id": {"ws-1"},
	}
	conn, _, err := websocket.DefaultDialer.Dial(wsURL.String(), headers)
	if err != nil {
		t.Fatalf("dial websocket: %v", err)
	}
	defer conn.Close()
	_ = conn.SetReadDeadline(time.Now().Add(2 * time.Second))

	var handshake map[string]any
	if err := conn.ReadJSON(&handshake); err != nil {
		t.Fatalf("read handshake: %v", err)
	}
	if handshake["type"] != "handshake.accepted" {
		t.Fatalf("unexpected handshake: %+v", handshake)
	}
	scope, _ := handshake["subscriptionScope"].(map[string]any)
	if scope["terminal"] != false {
		t.Fatalf("expected terminal scope disabled, got %+v", scope)
	}

	var event realtime.Event
	if err := conn.ReadJSON(&event); err != nil {
		t.Fatalf("read replay event: %v", err)
	}
	if event.Name != realtime.EventPresenceSnapshot {
		t.Fatalf("expected only presence snapshot, got %+v", event)
	}

	_ = conn.SetReadDeadline(time.Now().Add(150 * time.Millisecond))
	hub.Publish(realtime.Event{
		Name:        realtime.EventTerminalStatus,
		WorkspaceID: "ws-1",
		TerminalID:  "term-1",
		Payload: realtime.TerminalStatusPayload{
			TerminalID:      "term-1",
			ConnectionState: "attached",
			ProcessState:    "online",
		},
	})
	var leaked realtime.Event
	if err := conn.ReadJSON(&leaked); err == nil {
		t.Fatalf("unexpected terminal event leaked through members subscription: %+v", leaked)
	}
}

func TestRealtimeHandlerRejectsUnauthorizedAttach(t *testing.T) {
	proc := pty.NewFakeProcess()
	hub := realtime.NewHub(256)
	service := terminal.NewService(session.NewRegistry(), pty.NewFakeLauncher(proc), hub)
	_, err := service.CreateSession(context.Background(), session.CreateRequest{
		SessionID:   "session-ws-deny",
		WorkspaceID: "ws-1",
		MemberID:    "member-1",
	})
	if err != nil {
		t.Fatalf("create session: %v", err)
	}

	server := httptest.NewServer(apihttp.NewHandler(service, hub))
	defer server.Close()

	wsURL, err := url.Parse(server.URL)
	if err != nil {
		t.Fatalf("parse server url: %v", err)
	}
	wsURL.Scheme = "ws"
	wsURL.Path = "/realtime"
	query := wsURL.Query()
	query.Set("workspaceId", "ws-2")
	query.Set("memberId", "assistant-1")
	wsURL.RawQuery = query.Encode()

	headers := http.Header{
		"X-Open-Kraken-Actor-Id":     {"assistant-1"},
		"X-Open-Kraken-Actor-Role":   {"assistant"},
		"X-Open-Kraken-Workspace-Id": {"ws-2"},
	}
	conn, _, err := websocket.DefaultDialer.Dial(wsURL.String(), headers)
	if err != nil {
		t.Fatalf("dial websocket: %v", err)
	}
	defer conn.Close()
	_ = conn.SetReadDeadline(time.Now().Add(2 * time.Second))

	var handshake map[string]any
	if err := conn.ReadJSON(&handshake); err != nil {
		t.Fatalf("read handshake: %v", err)
	}
	if handshake["type"] != "handshake.accepted" {
		t.Fatalf("unexpected handshake: %+v", handshake)
	}

	if err := conn.WriteJSON(map[string]any{
		"type": session.EventAttach,
		"payload": map[string]any{
			"sessionId":    "session-ws-deny",
			"subscriberId": "sub-1",
			"afterSeq":     0,
		},
	}); err != nil {
		t.Fatalf("attach over websocket: %v", err)
	}

	var denied realtime.Event
	if err := conn.ReadJSON(&denied); err != nil {
		t.Fatalf("read denied event: %v", err)
	}
	if denied.Name != realtime.EventTerminalStatus {
		t.Fatalf("expected status event, got %+v", denied)
	}
	payload, err := json.Marshal(denied.Payload)
	if err != nil {
		t.Fatalf("marshal payload: %v", err)
	}
	if string(payload) == "{}" {
		t.Fatalf("expected error payload, got %s", payload)
	}
}

func TestRealtimeHandlerReconnectAfterRestartForcesSnapshotResync(t *testing.T) {
	hub := realtime.NewHub(256)
	service := terminal.NewService(session.NewRegistry(), pty.NewFakeLauncher(pty.NewFakeProcess()), hub)
	server := httptest.NewServer(apihttp.NewHandler(service, hub))
	defer server.Close()

	wsURL, err := url.Parse(server.URL)
	if err != nil {
		t.Fatalf("parse server url: %v", err)
	}
	wsURL.Scheme = "ws"
	wsURL.Path = "/realtime"
	query := wsURL.Query()
	query.Set("workspaceId", "ws-1")
	query.Set("memberId", "owner-1")
	query.Set("cursor", realtime.NewCursor(7))
	wsURL.RawQuery = query.Encode()

	headers := http.Header{
		"X-Open-Kraken-Actor-Id":     {"owner-1"},
		"X-Open-Kraken-Actor-Role":   {"owner"},
		"X-Open-Kraken-Workspace-Id": {"ws-1"},
	}
	conn, _, err := websocket.DefaultDialer.Dial(wsURL.String(), headers)
	if err != nil {
		t.Fatalf("dial websocket: %v", err)
	}
	defer conn.Close()

	var handshake map[string]any
	if err := conn.ReadJSON(&handshake); err != nil {
		t.Fatalf("read handshake: %v", err)
	}
	if handshake["type"] != "handshake.accepted" {
		t.Fatalf("unexpected handshake: %+v", handshake)
	}
	if handshake["mode"] != "snapshot" || handshake["resyncRequired"] != true {
		t.Fatalf("unexpected restart handshake: %+v", handshake)
	}
}

func TestRealtimeHandlerRejectsFutureCursor(t *testing.T) {
	hub := realtime.NewHub(256)
	service := terminal.NewService(session.NewRegistry(), pty.NewFakeLauncher(pty.NewFakeProcess()), hub)
	hub.Publish(realtime.Event{
		Name:        realtime.EventPresenceSnapshot,
		WorkspaceID: "ws-1",
		Payload: realtime.PresenceSnapshotPayload{
			Members: []realtime.PresenceMember{{
				MemberID:      "owner-1",
				PresenceState: "online",
			}},
		},
	})
	server := httptest.NewServer(apihttp.NewHandler(service, hub))
	defer server.Close()

	wsURL, err := url.Parse(server.URL)
	if err != nil {
		t.Fatalf("parse server url: %v", err)
	}
	wsURL.Scheme = "ws"
	wsURL.Path = "/realtime"
	query := wsURL.Query()
	query.Set("workspaceId", "ws-1")
	query.Set("memberId", "owner-1")
	query.Set("cursor", realtime.NewCursor(99))
	wsURL.RawQuery = query.Encode()

	headers := http.Header{
		"X-Open-Kraken-Actor-Id":     {"owner-1"},
		"X-Open-Kraken-Actor-Role":   {"owner"},
		"X-Open-Kraken-Workspace-Id": {"ws-1"},
	}
	conn, _, err := websocket.DefaultDialer.Dial(wsURL.String(), headers)
	if err != nil {
		t.Fatalf("dial websocket: %v", err)
	}
	defer conn.Close()

	var frame map[string]any
	if err := conn.ReadJSON(&frame); err != nil {
		t.Fatalf("read rejected handshake: %v", err)
	}
	if frame["type"] != "handshake.rejected" {
		t.Fatalf("unexpected frame: %+v", frame)
	}
}

func TestRealtimeHandlerSwitchesActiveSessionOnSameConnection(t *testing.T) {
	firstProc := pty.NewFakeProcess()
	secondProc := pty.NewFakeProcess()
	hub := realtime.NewHub(256)
	service := terminal.NewService(session.NewRegistry(), &sequenceLauncher{
		processes: []pty.Process{firstProc, secondProc},
	}, hub)

	for _, sessionID := range []string{"session-a", "session-b"} {
		_, err := service.CreateSession(context.Background(), session.CreateRequest{
			SessionID:   sessionID,
			WorkspaceID: "ws-1",
			MemberID:    "member-1",
		})
		if err != nil {
			t.Fatalf("create session %s: %v", sessionID, err)
		}
	}

	server := httptest.NewServer(apihttp.NewHandler(service, hub))
	defer server.Close()

	wsURL, err := url.Parse(server.URL)
	if err != nil {
		t.Fatalf("parse server url: %v", err)
	}
	wsURL.Scheme = "ws"
	wsURL.Path = "/realtime"
	query := wsURL.Query()
	query.Set("workspaceId", "ws-1")
	query.Set("memberId", "owner-1")
	wsURL.RawQuery = query.Encode()

	headers := http.Header{
		"X-Open-Kraken-Actor-Id":     {"owner-1"},
		"X-Open-Kraken-Actor-Role":   {"owner"},
		"X-Open-Kraken-Workspace-Id": {"ws-1"},
	}
	conn, _, err := websocket.DefaultDialer.Dial(wsURL.String(), headers)
	if err != nil {
		t.Fatalf("dial websocket: %v", err)
	}
	defer conn.Close()
	_ = conn.SetReadDeadline(time.Now().Add(2 * time.Second))

	var handshake map[string]any
	if err := conn.ReadJSON(&handshake); err != nil {
		t.Fatalf("read handshake: %v", err)
	}
	if handshake["type"] != "handshake.accepted" {
		t.Fatalf("unexpected handshake: %+v", handshake)
	}

	attachTerminal(t, conn, "session-a")
	readAttachSequence(t, conn, "session-a", false)

	attachTerminal(t, conn, "session-b")
	readAttachSequence(t, conn, "session-b", false)

	firstProc.PushOutput("stale\n")
	secondProc.PushOutput("fresh\n")

	var delta realtime.Event
	if err := conn.ReadJSON(&delta); err != nil {
		t.Fatalf("read switched delta: %v", err)
	}
	if delta.Name != realtime.EventTerminalDelta || delta.TerminalID != "session-b" {
		t.Fatalf("expected delta for session-b, got %+v", delta)
	}
}

type sequenceLauncher struct {
	processes []pty.Process
	index     int
}

func (l *sequenceLauncher) Launch(_ context.Context, _ pty.LaunchRequest) (pty.Process, error) {
	process := l.processes[l.index]
	l.index++
	return process, nil
}

func attachTerminal(t *testing.T, conn *websocket.Conn, sessionID string) {
	t.Helper()
	if err := conn.WriteJSON(map[string]any{
		"type": session.EventAttach,
		"payload": map[string]any{
			"sessionId":    sessionID,
			"subscriberId": "sub-1",
			"afterSeq":     0,
		},
	}); err != nil {
		t.Fatalf("attach %s over websocket: %v", sessionID, err)
	}
}

func readAttachSequence(t *testing.T, conn *websocket.Conn, sessionID string, expectDelta bool) {
	t.Helper()
	var attached realtime.Event
	if err := conn.ReadJSON(&attached); err != nil {
		t.Fatalf("read attach event for %s: %v", sessionID, err)
	}
	if attached.Name != realtime.EventTerminalAttach || attached.TerminalID != sessionID {
		t.Fatalf("unexpected attach event for %s: %+v", sessionID, attached)
	}

	var snapshot realtime.Event
	if err := conn.ReadJSON(&snapshot); err != nil {
		t.Fatalf("read snapshot event for %s: %v", sessionID, err)
	}
	if snapshot.Name != realtime.EventTerminalSnapshot || snapshot.TerminalID != sessionID {
		t.Fatalf("unexpected snapshot event for %s: %+v", sessionID, snapshot)
	}

	if expectDelta {
		var delta realtime.Event
		if err := conn.ReadJSON(&delta); err != nil {
			t.Fatalf("read delta event for %s: %v", sessionID, err)
		}
		if delta.Name != realtime.EventTerminalDelta || delta.TerminalID != sessionID {
			t.Fatalf("unexpected delta event for %s: %+v", sessionID, delta)
		}
	}

	var status realtime.Event
	if err := conn.ReadJSON(&status); err != nil {
		t.Fatalf("read status event for %s: %v", sessionID, err)
	}
	if status.Name != realtime.EventTerminalStatus || status.TerminalID != sessionID {
		t.Fatalf("unexpected status event for %s: %+v", sessionID, status)
	}
}
