package handlers

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"open-kraken/backend/go/internal/authz"
	"open-kraken/backend/go/internal/pty"
	"open-kraken/backend/go/internal/realtime"
	"open-kraken/backend/go/internal/session"
	"open-kraken/backend/go/internal/terminal"
)

func TestTerminalHandlerLifecycleAndErrors(t *testing.T) {
	proc := pty.NewFakeProcess()
	service := terminal.NewService(session.NewRegistry(), pty.NewFakeLauncher(proc), realtime.NewHub(256))
	handler := NewTerminalHandler(service)

	createReq := httptest.NewRequest(http.MethodPost, "/api/terminal/sessions", bytes.NewBufferString(`{"sessionId":"session-1","memberId":"member-1","workspaceId":"ws-1","command":"echo hi","cols":120,"rows":40}`))
	createRec := httptest.NewRecorder()
	handler.HandleSessions(createRec, createReq)
	if createRec.Code != http.StatusCreated {
		t.Fatalf("create status = %d", createRec.Code)
	}

	proc.PushOutput("hello\n")
	time.Sleep(20 * time.Millisecond)

	attachReq := httptest.NewRequest(http.MethodPost, "/api/terminal/sessions/session-1/attach", bytes.NewBufferString(`{"subscriberId":"sub-1","afterSeq":0}`))
	attachReq.Header.Set(headerActorID, "owner-1")
	attachReq.Header.Set(headerActorRole, "owner")
	attachReq.Header.Set(headerWorkspaceID, "ws-1")
	attachRec := httptest.NewRecorder()
	handler.HandleSessionByID(attachRec, attachReq)
	if attachRec.Code != http.StatusOK {
		t.Fatalf("attach status = %d body=%s", attachRec.Code, attachRec.Body.String())
	}
	var attach session.AttachEnvelope
	if err := json.NewDecoder(attachRec.Body).Decode(&attach); err != nil {
		t.Fatalf("decode attach: %v", err)
	}
	if attach.Snapshot.Rows != 40 || attach.Snapshot.Cols != 120 {
		t.Fatalf("unexpected snapshot size: %+v", attach.Snapshot)
	}
	if attach.Snapshot.Buffer == "" {
		t.Fatalf("expected snapshot buffer")
	}

	inputReq := httptest.NewRequest(http.MethodPost, "/api/terminal/sessions/session-1/input", bytes.NewBufferString(`{"data":"pwd\n"}`))
	inputRec := httptest.NewRecorder()
	handler.HandleSessionByID(inputRec, inputReq)
	if inputRec.Code != http.StatusNoContent {
		t.Fatalf("input status = %d", inputRec.Code)
	}

	dispatchReq := httptest.NewRequest(http.MethodPost, "/api/terminal/sessions/session-1/dispatch", bytes.NewBufferString(`{"data":"@assistant hi","context":{"conversationId":"conv-1","conversationType":"channel","senderId":"user-1","senderName":"Owner","messageId":"msg-1","clientTraceId":"trace-1","timestamp":123}}`))
	dispatchReq.Header.Set(headerActorID, "owner-1")
	dispatchReq.Header.Set(headerActorRole, "owner")
	dispatchReq.Header.Set(headerWorkspaceID, "ws-1")
	dispatchRec := httptest.NewRecorder()
	handler.HandleSessionByID(dispatchRec, dispatchReq)
	if dispatchRec.Code != http.StatusNoContent {
		t.Fatalf("dispatch status = %d", dispatchRec.Code)
	}

	resizeReq := httptest.NewRequest(http.MethodPost, "/api/terminal/sessions/session-1/resize", bytes.NewBufferString(`{"cols":90,"rows":33}`))
	resizeRec := httptest.NewRecorder()
	handler.HandleSessionByID(resizeRec, resizeReq)
	if resizeRec.Code != http.StatusNoContent {
		t.Fatalf("resize status = %d", resizeRec.Code)
	}
	cols, rows := proc.ResizeSnapshot()
	if cols != 90 || rows != 33 {
		t.Fatalf("resize not forwarded: cols=%d rows=%d", cols, rows)
	}

	memberReq := httptest.NewRequest(http.MethodGet, "/api/terminal/member-session?workspaceId=ws-1&memberId=member-1", nil)
	memberRec := httptest.NewRecorder()
	handler.HandleMemberSession(memberRec, memberReq)
	if memberRec.Code != http.StatusOK {
		t.Fatalf("member session status = %d", memberRec.Code)
	}

	unknownReq := httptest.NewRequest(http.MethodPost, "/api/terminal/sessions/missing/attach", bytes.NewBufferString(`{"subscriberId":"sub-9"}`))
	unknownReq.Header.Set(headerActorID, "owner-1")
	unknownReq.Header.Set(headerActorRole, "owner")
	unknownReq.Header.Set(headerWorkspaceID, "ws-1")
	unknownRec := httptest.NewRecorder()
	handler.HandleSessionByID(unknownRec, unknownReq)
	if unknownRec.Code != http.StatusNotFound {
		t.Fatalf("unknown attach status = %d", unknownRec.Code)
	}
}

func TestTerminalHandlerRejectsUnauthorizedDispatch(t *testing.T) {
	proc := pty.NewFakeProcess()
	service := terminal.NewService(session.NewRegistry(), pty.NewFakeLauncher(proc), realtime.NewHub(256))
	handler := NewTerminalHandler(service)

	_, err := service.CreateSession(context.Background(), session.CreateRequest{
		SessionID:   "session-authz",
		MemberID:    "member-1",
		WorkspaceID: "ws-1",
	})
	if err != nil {
		t.Fatalf("create session: %v", err)
	}

	req := httptest.NewRequest(http.MethodPost, "/api/terminal/sessions/session-authz/dispatch", bytes.NewBufferString(`{"data":"@assistant hi","context":{"conversationId":"conv-1"}}`))
	req.Header.Set(headerActorID, "assistant-1")
	req.Header.Set(headerActorRole, string(authz.RoleAssistant))
	req.Header.Set(headerWorkspaceID, "ws-1")
	rec := httptest.NewRecorder()
	handler.HandleSessionByID(rec, req)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("expected 403, got %d body=%s", rec.Code, rec.Body.String())
	}
}
