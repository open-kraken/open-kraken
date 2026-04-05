package http

import (
	"errors"
	stdhttp "net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	runtimecfg "open-kraken/backend/go/internal/platform/runtime"
)

func TestHealthHandlerReturnsWarningForOptionalDependency(t *testing.T) {
	handler := WithRequestContext(NewHealthHandler("open-kraken-backend", HealthChecker{
		Name:      "web-dist",
		Required:  false,
		CheckFunc: func() error { return errors.New("index.html missing") },
	}))

	req := httptest.NewRequest(stdhttp.MethodGet, "/healthz", nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != stdhttp.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	if got := rec.Header().Get("Content-Type"); !strings.Contains(got, "application/json") {
		t.Fatalf("expected json content type, got %q", got)
	}
	if !strings.Contains(rec.Body.String(), `"warnings"`) {
		t.Fatalf("expected warnings in body: %s", rec.Body.String())
	}
}

func TestHealthHandlerReturns503ForRequiredDependency(t *testing.T) {
	handler := WithRequestContext(NewHealthHandler("open-kraken-backend", HealthChecker{
		Name:      "app-data-root",
		Required:  true,
		CheckFunc: func() error { return errors.New("permission denied") },
	}))

	req := httptest.NewRequest(stdhttp.MethodGet, "/healthz", nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != stdhttp.StatusServiceUnavailable {
		t.Fatalf("expected 503, got %d", rec.Code)
	}
	if !strings.Contains(rec.Body.String(), `"status":"unhealthy"`) {
		t.Fatalf("unexpected body: %s", rec.Body.String())
	}
}

func TestRuntimeHandlerServesStaticAssetsAndPreservesAPIPaths(t *testing.T) {
	distDir := t.TempDir()
	if err := os.WriteFile(filepath.Join(distDir, "index.html"), []byte("index"), 0o644); err != nil {
		t.Fatalf("write index: %v", err)
	}
	assetDir := filepath.Join(distDir, "assets")
	if err := os.MkdirAll(assetDir, 0o755); err != nil {
		t.Fatalf("mkdir assets: %v", err)
	}
	if err := os.WriteFile(filepath.Join(assetDir, "app.js"), []byte("console.log('ok')"), 0o644); err != nil {
		t.Fatalf("write asset: %v", err)
	}

	cfg := runtimecfg.Config{
		ServiceName: "open-kraken-backend",
		APIBasePath: "/api/v1",
		WSPath:      "/ws",
		WebDistDir:  distDir,
	}
	apiHandler := stdhttp.HandlerFunc(func(w stdhttp.ResponseWriter, r *stdhttp.Request) {
		w.Header().Set("Content-Type", "text/plain")
		_, _ = w.Write([]byte("api:" + r.URL.Path))
	})
	handler := NewRuntimeHandler(cfg, apiHandler)

	staticReq := httptest.NewRequest(stdhttp.MethodGet, "/", nil)
	staticRec := httptest.NewRecorder()
	handler.ServeHTTP(staticRec, staticReq)
	if staticRec.Code != stdhttp.StatusOK || !strings.Contains(staticRec.Body.String(), "index") {
		t.Fatalf("unexpected static response: code=%d body=%s", staticRec.Code, staticRec.Body.String())
	}

	apiReq := httptest.NewRequest(stdhttp.MethodGet, "/api/v1/terminal/sessions", nil)
	apiRec := httptest.NewRecorder()
	handler.ServeHTTP(apiRec, apiReq)
	if apiRec.Code != stdhttp.StatusOK || apiRec.Body.String() != "api:/api/v1/terminal/sessions" {
		t.Fatalf("api route was shadowed: code=%d body=%s", apiRec.Code, apiRec.Body.String())
	}

	wsReq := httptest.NewRequest(stdhttp.MethodGet, "/ws", nil)
	wsRec := httptest.NewRecorder()
	handler.ServeHTTP(wsRec, wsReq)
	if wsRec.Code != stdhttp.StatusOK || wsRec.Body.String() != "api:/ws" {
		t.Fatalf("ws route was shadowed: code=%d body=%s", wsRec.Code, wsRec.Body.String())
	}
}

func TestRuntimeHandlerReturns503WhenStaticDistMissing(t *testing.T) {
	cfg := runtimecfg.Config{
		ServiceName: "open-kraken-backend",
		APIBasePath: "/api/v1",
		WSPath:      "/ws",
		WebDistDir:  filepath.Join(t.TempDir(), "missing"),
	}
	handler := NewRuntimeHandler(cfg, stdhttp.HandlerFunc(func(w stdhttp.ResponseWriter, _ *stdhttp.Request) {
		w.WriteHeader(stdhttp.StatusNoContent)
	}))

	req := httptest.NewRequest(stdhttp.MethodGet, "/", nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != stdhttp.StatusServiceUnavailable {
		t.Fatalf("expected 503, got %d", rec.Code)
	}
	if !strings.Contains(rec.Body.String(), "web_dist_unavailable") {
		t.Fatalf("unexpected body: %s", rec.Body.String())
	}
}
