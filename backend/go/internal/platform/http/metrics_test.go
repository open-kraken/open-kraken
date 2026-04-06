package http

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestMetricsHandler(t *testing.T) {
	m := NewMetrics()

	// Simulate some requests.
	handler := WithMetrics(m, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	for i := 0; i < 5; i++ {
		req := httptest.NewRequest(http.MethodGet, "/api/v1/nodes", nil)
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)
	}

	// Check metrics endpoint.
	req := httptest.NewRequest(http.MethodGet, "/metrics", nil)
	rec := httptest.NewRecorder()
	MetricsHandler(m).ServeHTTP(rec, req)

	body := rec.Body.String()
	if !strings.Contains(body, "kraken_http_requests_total 5") {
		t.Errorf("expected 5 total requests in metrics, got:\n%s", body)
	}
	if !strings.Contains(body, "kraken_go_goroutines") {
		t.Error("expected goroutine metric")
	}
	if !strings.Contains(body, "kraken_uptime_seconds") {
		t.Error("expected uptime metric")
	}
	if !strings.Contains(body, "kraken_go_heap_alloc_bytes") {
		t.Error("expected heap alloc metric")
	}
}

func TestMetricsRecordsErrors(t *testing.T) {
	m := NewMetrics()
	handler := WithMetrics(m, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
	}))

	req := httptest.NewRequest(http.MethodGet, "/test", nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	metricsReq := httptest.NewRequest(http.MethodGet, "/metrics", nil)
	metricsRec := httptest.NewRecorder()
	MetricsHandler(m).ServeHTTP(metricsRec, metricsReq)

	body := metricsRec.Body.String()
	if !strings.Contains(body, "kraken_http_errors_total 1") {
		t.Errorf("expected 1 error in metrics, got:\n%s", body)
	}
}
