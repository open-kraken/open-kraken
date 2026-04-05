package handlers_test

import (
	"bytes"
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	apihttp "open-kraken/backend/go/internal/api/http"
	"open-kraken/backend/go/internal/authn"
	"open-kraken/backend/go/internal/authz"
	plathttp "open-kraken/backend/go/internal/platform/http"
	"open-kraken/backend/go/internal/projectdata"
	"open-kraken/backend/go/internal/pty"
	"open-kraken/backend/go/internal/realtime"
	"open-kraken/backend/go/internal/session"
	"open-kraken/backend/go/internal/terminal"
)

func TestWorkspaceRoadmapAndProjectDataAuthzViaBearerAdapter(t *testing.T) {
	workspaceRoot := t.TempDir()
	appRoot := t.TempDir()
	repo := projectdata.NewRepository(appRoot)
	service := terminal.NewService(session.NewRegistry(), pty.NewFakeLauncher(pty.NewFakeProcess()), realtime.NewHub(64))
	handler := apihttp.NewHandlerWithDependencies(service, realtime.NewHub(64), repo, workspaceRoot, "/api/v1", "/ws", apihttp.ExtendedServices{}, plathttp.PermissiveWebSocketUpgrader())

	roadmapGet := httptest.NewRequest(http.MethodGet, "/api/v1/workspaces/ws_open_kraken/roadmap", nil)
	roadmapGetRec := httptest.NewRecorder()
	handler.ServeHTTP(roadmapGetRec, roadmapGet)
	if roadmapGetRec.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401 for missing auth, got %d body=%s", roadmapGetRec.Code, roadmapGetRec.Body.String())
	}

	assistantToken := mustToken(t, authz.Principal{
		MemberID:    "assistant-1",
		WorkspaceID: "ws_open_kraken",
		Role:        authz.RoleAssistant,
	})
	roadmapPut := httptest.NewRequest(http.MethodPut, "/api/v1/workspaces/ws_open_kraken/roadmap", bytes.NewBufferString(`{"roadmap":{"objective":"Ship auth","tasks":[{"id":"task-1","title":"Lock bearer adapter","status":"in_progress","order":1,"pinned":true}]}}`))
	roadmapPut.Header.Set("Authorization", assistantToken)
	roadmapPutRec := httptest.NewRecorder()
	handler.ServeHTTP(roadmapPutRec, roadmapPut)
	if roadmapPutRec.Code != http.StatusOK {
		t.Fatalf("expected roadmap write 200, got %d body=%s", roadmapPutRec.Code, roadmapPutRec.Body.String())
	}

	projectPut := httptest.NewRequest(http.MethodPut, "/api/v1/workspaces/ws_open_kraken/project-data", bytes.NewBufferString(`{"payload":{"projectId":"project_open_kraken","projectName":"open-kraken","attributes":{"theme":"signal"}}}`))
	projectPut.Header.Set("Authorization", mustToken(t, authz.Principal{
		MemberID:    "member-1",
		WorkspaceID: "ws_open_kraken",
		Role:        authz.RoleMember,
	}))
	projectPutRec := httptest.NewRecorder()
	handler.ServeHTTP(projectPutRec, projectPut)
	if projectPutRec.Code != http.StatusForbidden {
		t.Fatalf("expected project data write 403, got %d body=%s", projectPutRec.Code, projectPutRec.Body.String())
	}

	ownerToken := mustToken(t, authz.Principal{
		MemberID:    "owner-1",
		WorkspaceID: "ws_open_kraken",
		Role:        authz.RoleOwner,
	})
	projectOwnerPut := httptest.NewRequest(http.MethodPut, "/api/v1/workspaces/ws_open_kraken/project-data", bytes.NewBufferString(`{"payload":{"projectId":"project_open_kraken","projectName":"open-kraken","attributes":{"theme":"signal","mode":"strict"}}}`))
	projectOwnerPut.Header.Set("Authorization", ownerToken)
	projectOwnerPutRec := httptest.NewRecorder()
	handler.ServeHTTP(projectOwnerPutRec, projectOwnerPut)
	if projectOwnerPutRec.Code != http.StatusOK {
		t.Fatalf("expected owner project data write 200, got %d body=%s", projectOwnerPutRec.Code, projectOwnerPutRec.Body.String())
	}

	projectGet := httptest.NewRequest(http.MethodGet, "/api/v1/workspaces/ws_open_kraken/project-data", nil)
	projectGet.Header.Set("Authorization", ownerToken)
	projectGetRec := httptest.NewRecorder()
	handler.ServeHTTP(projectGetRec, projectGet)
	if projectGetRec.Code != http.StatusOK {
		t.Fatalf("expected project data read 200, got %d body=%s", projectGetRec.Code, projectGetRec.Body.String())
	}

	result, err := repo.ReadGlobalRoadmap(projectdata.ReadRequest{
		WorkspaceID:   "ws_open_kraken",
		WorkspacePath: workspaceRoot,
	})
	if err != nil {
		t.Fatalf("ReadGlobalRoadmap: %v", err)
	}
	if !result.Found || result.Document.Objective != "Ship auth" {
		t.Fatalf("expected persisted roadmap objective, got %+v", result)
	}
}

func mustToken(t *testing.T, principal authz.Principal) string {
	t.Helper()
	token, err := authn.NewDevelopmentBearerToken(principal)
	if err != nil {
		t.Fatalf("NewDevelopmentBearerToken: %v", err)
	}
	return token
}

func TestWorkspaceHandlerStillAcceptsLegacyHeadersAsAdapterFallback(t *testing.T) {
	workspaceRoot := t.TempDir()
	appRoot := t.TempDir()
	repo := projectdata.NewRepository(appRoot)
	hub := realtime.NewHub(64)
	service := terminal.NewService(session.NewRegistry(), pty.NewFakeLauncher(pty.NewFakeProcess()), hub)
	_, err := service.CreateSession(context.Background(), session.CreateRequest{
		SessionID:   "session-1",
		WorkspaceID: "ws_open_kraken",
		MemberID:    "owner-1",
	})
	if err != nil {
		t.Fatalf("CreateSession: %v", err)
	}

	handler := apihttp.NewHandlerWithDependencies(service, hub, repo, workspaceRoot, "/api/v1", "/ws", apihttp.ExtendedServices{}, plathttp.PermissiveWebSocketUpgrader())
	req := httptest.NewRequest(http.MethodGet, "/api/v1/workspaces/ws_open_kraken/roadmap", nil)
	req.Header.Set("X-Open-Kraken-Actor-Id", "owner-1")
	req.Header.Set("X-Open-Kraken-Actor-Role", "owner")
	req.Header.Set("X-Open-Kraken-Workspace-Id", "ws_open_kraken")
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("expected legacy fallback 200, got %d body=%s", rec.Code, rec.Body.String())
	}
}
