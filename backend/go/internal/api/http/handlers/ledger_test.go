package handlers

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"open-kraken/backend/go/internal/ledger"
)

func newTestLedgerHandler(t *testing.T) *LedgerHandler {
	t.Helper()
	repo, err := ledger.NewSQLiteRepository(t.TempDir() + "/ledger.db")
	if err != nil {
		t.Fatalf("init ledger repo: %v", err)
	}
	svc := ledger.NewService(repo)
	return NewLedgerHandler(svc)
}

func TestLedgerHandleEventsPost(t *testing.T) {
	h := newTestLedgerHandler(t)
	body := `{
		"workspaceId": "ws-1",
		"memberId": "m-1",
		"eventType": "command.execute",
		"summary": "ran deploy"
	}`
	req := httptest.NewRequest(http.MethodPost, "/api/v1/ledger/events", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()

	h.HandleEvents(rec, req)
	if rec.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d: %s", rec.Code, rec.Body.String())
	}

	if !strings.Contains(rec.Body.String(), `"id"`) {
		t.Error("expected id in response")
	}
}

func TestLedgerHandleEventsPostValidation(t *testing.T) {
	h := newTestLedgerHandler(t)
	body := `{"summary": "missing required fields"}`
	req := httptest.NewRequest(http.MethodPost, "/api/v1/ledger/events", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()

	h.HandleEvents(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for missing fields, got %d", rec.Code)
	}
}

func TestLedgerHandleEventsGet(t *testing.T) {
	h := newTestLedgerHandler(t)

	// First, append an event.
	e := ledger.LedgerEvent{
		WorkspaceID: "ws-1",
		MemberID:    "m-1",
		EventType:   "test.event",
		Summary:     "test summary",
	}
	_, err := h.svc.Record(context.Background(), e)
	if err != nil {
		t.Fatalf("record: %v", err)
	}

	req := httptest.NewRequest(http.MethodGet, "/api/v1/ledger/events?workspaceId=ws-1", nil)
	rec := httptest.NewRecorder()
	h.HandleEvents(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	if !strings.Contains(rec.Body.String(), `"total":1`) {
		t.Errorf("expected 1 event, got: %s", rec.Body.String())
	}
}

func TestLedgerHandleEventsMethodNotAllowed(t *testing.T) {
	h := newTestLedgerHandler(t)
	req := httptest.NewRequest(http.MethodDelete, "/api/v1/ledger/events", nil)
	rec := httptest.NewRecorder()
	h.HandleEvents(rec, req)

	if rec.Code != http.StatusMethodNotAllowed {
		t.Fatalf("expected 405, got %d", rec.Code)
	}
}
