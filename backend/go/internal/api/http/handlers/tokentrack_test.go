package handlers

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"open-kraken/backend/go/internal/realtime"
	"open-kraken/backend/go/internal/tokentrack"
)

func newTestTokenHandler(t *testing.T) *TokenHandler {
	t.Helper()
	repo, err := tokentrack.NewSQLiteTokenRepository(t.TempDir() + "/tokens.db")
	if err != nil {
		t.Fatalf("init token repo: %v", err)
	}
	hub := realtime.NewHub(16)
	svc := tokentrack.NewService(repo, hub)
	return NewTokenHandler(svc)
}

func TestTokenHandlerRecordEvent(t *testing.T) {
	h := newTestTokenHandler(t)

	body := `{
		"memberId": "m-1",
		"nodeId": "node-1",
		"model": "claude-3.5-sonnet",
		"inputTokens": 100,
		"outputTokens": 50,
		"cost": 0.0015
	}`
	req := httptest.NewRequest(http.MethodPost, "/api/v1/tokens/events", strings.NewReader(body))
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

func TestTokenHandlerStats(t *testing.T) {
	h := newTestTokenHandler(t)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/tokens/stats", nil)
	rec := httptest.NewRecorder()
	h.HandleStats(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), `"scope"`) {
		t.Error("expected scope in stats response")
	}
}

func TestTokenHandlerActivity(t *testing.T) {
	h := newTestTokenHandler(t)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/tokens/activity", nil)
	rec := httptest.NewRecorder()
	h.HandleActivity(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
}
