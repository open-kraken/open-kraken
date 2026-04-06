package handlers

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"open-kraken/backend/go/internal/memory"
)

func newTestMemoryHandler(t *testing.T) *MemoryHandler {
	t.Helper()
	repo, err := memory.NewSQLiteMemoryRepository(t.TempDir() + "/memory.db")
	if err != nil {
		t.Fatalf("init memory repo: %v", err)
	}
	svc := memory.NewService(repo)
	return NewMemoryHandler(svc, "/api/v1/memory")
}

func TestMemoryHandlePutAndGet(t *testing.T) {
	h := newTestMemoryHandler(t)

	// PUT a value.
	body := `{"value": "hello world"}`
	req := httptest.NewRequest(http.MethodPut, "/api/v1/memory/global/greeting", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	h.Handle(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("PUT expected 200, got %d: %s", rec.Code, rec.Body.String())
	}

	// GET it back.
	req = httptest.NewRequest(http.MethodGet, "/api/v1/memory/global/greeting", nil)
	rec = httptest.NewRecorder()
	h.Handle(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("GET expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), "hello world") {
		t.Errorf("expected value in response: %s", rec.Body.String())
	}
}

func TestMemoryHandleGetNotFound(t *testing.T) {
	h := newTestMemoryHandler(t)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/memory/global/missing", nil)
	rec := httptest.NewRecorder()
	h.Handle(rec, req)

	if rec.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d", rec.Code)
	}
}

func TestMemoryHandleDelete(t *testing.T) {
	h := newTestMemoryHandler(t)

	// PUT first.
	body := `{"value": "to delete"}`
	req := httptest.NewRequest(http.MethodPut, "/api/v1/memory/global/temp", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	h.Handle(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("PUT expected 200, got %d", rec.Code)
	}

	// DELETE.
	req = httptest.NewRequest(http.MethodDelete, "/api/v1/memory/global/temp", nil)
	rec = httptest.NewRecorder()
	h.Handle(rec, req)

	if rec.Code != http.StatusNoContent {
		t.Fatalf("DELETE expected 204, got %d", rec.Code)
	}

	// Confirm gone.
	req = httptest.NewRequest(http.MethodGet, "/api/v1/memory/global/temp", nil)
	rec = httptest.NewRecorder()
	h.Handle(rec, req)
	if rec.Code != http.StatusNotFound {
		t.Fatalf("expected 404 after delete, got %d", rec.Code)
	}
}
