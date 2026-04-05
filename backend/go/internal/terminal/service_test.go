package terminal

import (
	"context"
	"errors"
	"testing"
	"time"

	"open-kraken/backend/go/internal/authz"
	"open-kraken/backend/go/internal/pty"
	"open-kraken/backend/go/internal/realtime"
	"open-kraken/backend/go/internal/session"
)

func TestServiceAttachDuplicateSubscriberDeltaOrderAndReconnectReplay(t *testing.T) {
	proc := pty.NewFakeProcess()
	service := NewService(session.NewRegistry(), pty.NewFakeLauncher(proc), realtime.NewHub(256))

	_, err := service.CreateSession(context.Background(), session.CreateRequest{
		SessionID:   "session-1",
		WorkspaceID: "ws-1",
		MemberID:    "member-1",
		Command:     "echo hi",
		Cols:        120,
		Rows:        40,
	})
	if err != nil {
		t.Fatalf("create session: %v", err)
	}

	first, err := service.AttachSession(session.AttachRequest{SessionID: "session-1", SubscriberID: "sub-1"})
	if err != nil {
		t.Fatalf("attach session: %v", err)
	}
	if first.Snapshot.TerminalStatus != session.StatusAttached {
		t.Fatalf("snapshot status = %s want %s", first.Snapshot.TerminalStatus, session.StatusAttached)
	}
	if first.Snapshot.SessionID != "session-1" || first.Snapshot.SubscriberID != "sub-1" {
		t.Fatalf("unexpected snapshot: %+v", first.Snapshot)
	}

	proc.PushOutput("hello\n")
	proc.PushOutput("world")
	waitForSeq(t, func() uint64 {
		return service.ListSessions("ws-1")[0].Seq
	}, 2)

	replay, err := service.AttachSession(session.AttachRequest{SessionID: "session-1", SubscriberID: "sub-1", AfterSeq: 1})
	if err != nil {
		t.Fatalf("reattach session: %v", err)
	}
	if len(replay.Deltas) != 1 {
		t.Fatalf("replay deltas = %d want 1", len(replay.Deltas))
	}
	if replay.Deltas[0].Seq != 2 || replay.Deltas[0].Data != "world" {
		t.Fatalf("unexpected replay delta: %+v", replay.Deltas[0])
	}
	if replay.Status.TerminalStatus != session.StatusRunning {
		t.Fatalf("status = %s want %s", replay.Status.TerminalStatus, session.StatusRunning)
	}

	second, err := service.AttachSession(session.AttachRequest{SessionID: "session-1", SubscriberID: "sub-2", AfterSeq: 0})
	if err != nil {
		t.Fatalf("second subscriber attach: %v", err)
	}
	if len(second.Deltas) != 2 {
		t.Fatalf("second subscriber replay count = %d want 2", len(second.Deltas))
	}
	if second.Deltas[0].Seq != 1 || second.Deltas[1].Seq != 2 {
		t.Fatalf("delta order mismatch: %+v", second.Deltas)
	}
}

func TestServiceExitFreezesStatusAndRejectsUnknownOrExitedWrites(t *testing.T) {
	proc := pty.NewFakeProcess()
	service := NewService(session.NewRegistry(), pty.NewFakeLauncher(proc), realtime.NewHub(256))
	_, err := service.CreateSession(context.Background(), session.CreateRequest{
		SessionID:   "session-exit",
		WorkspaceID: "ws-1",
		MemberID:    "member-1",
	})
	if err != nil {
		t.Fatalf("create session: %v", err)
	}
	if _, err := service.AttachSession(session.AttachRequest{SessionID: "session-exit", SubscriberID: "sub-1"}); err != nil {
		t.Fatalf("attach session: %v", err)
	}
	proc.PushOutput("ready")
	waitForSeq(t, func() uint64 {
		return service.ListSessions("ws-1")[0].Seq
	}, 1)

	exitCode := int32(0)
	proc.EmitExit(pty.Exit{Code: &exitCode})
	waitForStatus(t, func() session.Status {
		return service.ListSessions("ws-1")[0].Status
	}, session.StatusExited)

	frozen, err := service.AttachSession(session.AttachRequest{SessionID: "session-exit", SubscriberID: "sub-2", AfterSeq: 1})
	if err != nil {
		t.Fatalf("attach exited session: %v", err)
	}
	if frozen.Status.TerminalStatus != session.StatusExited || frozen.Status.ProcessExit == nil {
		t.Fatalf("unexpected frozen status: %+v", frozen.Status)
	}
	if err := service.WriteInput("session-exit", "pwd\n"); err == nil {
		t.Fatalf("expected exited write rejection")
	}
	if _, err := service.AttachSession(session.AttachRequest{SessionID: "missing", SubscriberID: "sub-1"}); !errors.Is(err, session.ErrSessionNotFound) {
		t.Fatalf("attach unknown error = %v", err)
	}
}

func TestServiceDispatchAuthorizedRejectsAssistant(t *testing.T) {
	proc := pty.NewFakeProcess()
	service := NewService(session.NewRegistry(), pty.NewFakeLauncher(proc), realtime.NewHub(256))
	_, err := service.CreateSession(context.Background(), session.CreateRequest{
		SessionID:   "session-authz",
		WorkspaceID: "ws-1",
		MemberID:    "member-1",
	})
	if err != nil {
		t.Fatalf("create session: %v", err)
	}

	err = service.DispatchAuthorized("session-authz", "@assistant hi", session.DispatchContext{
		ConversationID: "conv-1",
	}, authz.AuthContext{
		Actor: authz.Principal{
			MemberID:    "assistant-1",
			WorkspaceID: "ws-1",
			Role:        authz.RoleAssistant,
		},
	}, authz.NewService())
	if !errors.Is(err, authz.ErrForbidden) {
		t.Fatalf("expected authz.ErrForbidden, got %v", err)
	}
}

func waitForSeq(t *testing.T, current func() uint64, want uint64) {
	t.Helper()
	deadline := time.After(2 * time.Second)
	for {
		select {
		case <-deadline:
			t.Fatalf("timeout waiting for seq %d", want)
		default:
			if current() == want {
				return
			}
			time.Sleep(10 * time.Millisecond)
		}
	}
}

func waitForStatus(t *testing.T, current func() session.Status, want session.Status) {
	t.Helper()
	deadline := time.After(2 * time.Second)
	for {
		select {
		case <-deadline:
			t.Fatalf("timeout waiting for status %s", want)
		default:
			if current() == want {
				return
			}
			time.Sleep(10 * time.Millisecond)
		}
	}
}
