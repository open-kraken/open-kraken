package handlers

import (
	"context"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"

	"open-kraken/backend/go/internal/realtime"
	"open-kraken/backend/go/internal/taskqueue"
)

func newTestTaskQueueHandler(t *testing.T) *TaskQueueHandler {
	t.Helper()
	repo, err := taskqueue.NewSQLiteRepository(filepath.Join(t.TempDir(), "tasks.db"))
	if err != nil {
		t.Fatalf("NewSQLiteRepository: %v", err)
	}
	svc := taskqueue.NewService(repo, realtime.NewHub(16))
	svc.SetAgentResolver(func(context.Context, string, map[string]bool) (string, error) {
		return "", taskqueue.ErrNoAvailableAgent
	})
	if _, err := svc.Enqueue(context.Background(), taskqueue.Task{
		WorkspaceID: "ws1",
		Type:        "code-review",
		Payload:     `{}`,
	}); err != nil {
		t.Fatalf("Enqueue: %v", err)
	}
	return NewTaskQueueHandler(svc, "/api/v1/queue")
}

func TestTaskQueueClaimNoAvailableAgentReturnsConflict(t *testing.T) {
	h := newTestTaskQueueHandler(t)

	req := httptest.NewRequest(http.MethodPost, "/api/v1/queue/claim", strings.NewReader(`{"queue":"default","nodeId":"node-1"}`))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	h.Handle(rec, req)

	if rec.Code != http.StatusConflict {
		t.Fatalf("expected 409, got %d: %s", rec.Code, rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), "no available AI Assistant") {
		t.Fatalf("expected no available assistant error: %s", rec.Body.String())
	}
}
