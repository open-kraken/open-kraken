package handlers

import (
	"context"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"

	"open-kraken/backend/go/internal/authz"
	"open-kraken/backend/go/internal/ledger"
)

func newTestApprovalHandler(t *testing.T) (*ApprovalHandler, *ledger.Service) {
	t.Helper()
	repo, err := ledger.NewSQLiteRepository(filepath.Join(t.TempDir(), "ledger.db"))
	if err != nil {
		t.Fatalf("init ledger repo: %v", err)
	}
	svc := ledger.NewService(repo)
	return NewApprovalHandler(svc, "/api/v1/approvals"), svc
}

func TestApprovalDecisionRequiresHighRiskConfirmation(t *testing.T) {
	h, svc := newTestApprovalHandler(t)
	req := httptest.NewRequest(http.MethodPost, "/api/v1/approvals/appr_001/decision", strings.NewReader(`{
		"decision":"approve",
		"confirmed":true,
		"confirmation":"APPROVE WRONG"
	}`))
	req.Header.Set("Content-Type", "application/json")
	setApprovalActor(req, "owner_1", "ws_open_kraken", authz.RoleOwner)
	rec := httptest.NewRecorder()

	h.Handle(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d body=%s", rec.Code, rec.Body.String())
	}
	events, err := svc.List(context.Background(), ledger.Query{WorkspaceID: "ws_open_kraken", EventType: "approval.confirmation_failed"})
	if err != nil {
		t.Fatalf("list audit events: %v", err)
	}
	if len(events) != 1 {
		t.Fatalf("expected confirmation failure audit event, got %d", len(events))
	}
}

func TestApprovalDecisionRecordsAudit(t *testing.T) {
	h, svc := newTestApprovalHandler(t)
	req := httptest.NewRequest(http.MethodPost, "/api/v1/approvals/appr_001/decision", strings.NewReader(`{
		"decision":"approve",
		"confirmed":true,
		"confirmation":"APPROVE appr_001"
	}`))
	req.Header.Set("Content-Type", "application/json")
	setApprovalActor(req, "owner_1", "ws_open_kraken", authz.RoleOwner)
	rec := httptest.NewRecorder()

	h.Handle(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d body=%s", rec.Code, rec.Body.String())
	}
	events, err := svc.List(context.Background(), ledger.Query{WorkspaceID: "ws_open_kraken", EventType: "approval.approved"})
	if err != nil {
		t.Fatalf("list audit events: %v", err)
	}
	if len(events) != 1 {
		t.Fatalf("expected approval audit event, got %d", len(events))
	}
}

func TestApprovalDecisionRejectsMemberRole(t *testing.T) {
	h, _ := newTestApprovalHandler(t)
	req := httptest.NewRequest(http.MethodPost, "/api/v1/approvals/appr_002/decision", strings.NewReader(`{
		"decision":"approve",
		"confirmed":true
	}`))
	req.Header.Set("Content-Type", "application/json")
	setApprovalActor(req, "member_1", "ws_open_kraken", authz.RoleMember)
	rec := httptest.NewRecorder()

	h.Handle(rec, req)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("expected 403, got %d body=%s", rec.Code, rec.Body.String())
	}
}

func setApprovalActor(req *http.Request, memberID, workspaceID string, role authz.Role) {
	req.Header.Set(headerActorID, memberID)
	req.Header.Set(headerWorkspaceID, workspaceID)
	req.Header.Set(headerActorRole, string(role))
}
