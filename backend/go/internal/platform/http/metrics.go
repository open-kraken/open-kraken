package http

import (
	"fmt"
	"net/http"
	"runtime"
	"sync"
	"sync/atomic"
	"time"
)

// Metrics collects basic operational metrics in Prometheus exposition format.
type Metrics struct {
	requestsTotal   atomic.Int64
	requestsActive  atomic.Int64
	errorsTotal     atomic.Int64
	latencyTotalMs  atomic.Int64
	wsConnections   atomic.Int64
	startedAt       time.Time

	statusMu     sync.Mutex
	statusCounts map[int]*atomic.Int64
}

// NewMetrics creates a Metrics collector.
func NewMetrics() *Metrics {
	return &Metrics{
		startedAt:    time.Now(),
		statusCounts: make(map[int]*atomic.Int64),
	}
}

// WithMetrics wraps an http.Handler to collect request metrics.
func WithMetrics(m *Metrics, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		m.requestsTotal.Add(1)
		m.requestsActive.Add(1)
		start := time.Now()

		rec := &statusRecorderMetrics{ResponseWriter: w, status: http.StatusOK}
		next.ServeHTTP(rec, r)

		m.requestsActive.Add(-1)
		elapsed := time.Since(start).Milliseconds()
		m.latencyTotalMs.Add(elapsed)

		m.recordStatus(rec.status)
		if rec.status >= 500 {
			m.errorsTotal.Add(1)
		}
	})
}

func (m *Metrics) recordStatus(code int) {
	// Bucket by class: 2xx, 3xx, 4xx, 5xx.
	bucket := (code / 100) * 100
	m.statusMu.Lock()
	counter, ok := m.statusCounts[bucket]
	if !ok {
		counter = &atomic.Int64{}
		m.statusCounts[bucket] = counter
	}
	m.statusMu.Unlock()
	counter.Add(1)
}

// IncrWSConnections increments the WebSocket connection gauge.
func (m *Metrics) IncrWSConnections() { m.wsConnections.Add(1) }

// DecrWSConnections decrements the WebSocket connection gauge.
func (m *Metrics) DecrWSConnections() { m.wsConnections.Add(-1) }

// MetricsHandler returns an http.Handler that exposes /metrics in Prometheus text format.
func MetricsHandler(m *Metrics) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var memStats runtime.MemStats
		runtime.ReadMemStats(&memStats)

		uptimeSec := time.Since(m.startedAt).Seconds()
		total := m.requestsTotal.Load()
		var avgLatency float64
		if total > 0 {
			avgLatency = float64(m.latencyTotalMs.Load()) / float64(total)
		}

		w.Header().Set("Content-Type", "text/plain; version=0.0.4; charset=utf-8")

		fmt.Fprintf(w, "# HELP kraken_http_requests_total Total HTTP requests served.\n")
		fmt.Fprintf(w, "# TYPE kraken_http_requests_total counter\n")
		fmt.Fprintf(w, "kraken_http_requests_total %d\n\n", total)

		fmt.Fprintf(w, "# HELP kraken_http_requests_active Currently active HTTP requests.\n")
		fmt.Fprintf(w, "# TYPE kraken_http_requests_active gauge\n")
		fmt.Fprintf(w, "kraken_http_requests_active %d\n\n", m.requestsActive.Load())

		fmt.Fprintf(w, "# HELP kraken_http_errors_total Total 5xx HTTP responses.\n")
		fmt.Fprintf(w, "# TYPE kraken_http_errors_total counter\n")
		fmt.Fprintf(w, "kraken_http_errors_total %d\n\n", m.errorsTotal.Load())

		fmt.Fprintf(w, "# HELP kraken_http_latency_avg_ms Average request latency in milliseconds.\n")
		fmt.Fprintf(w, "# TYPE kraken_http_latency_avg_ms gauge\n")
		fmt.Fprintf(w, "kraken_http_latency_avg_ms %.2f\n\n", avgLatency)

		m.statusMu.Lock()
		for bucket, counter := range m.statusCounts {
			fmt.Fprintf(w, "kraken_http_responses{status_class=\"%dxx\"} %d\n", bucket/100, counter.Load())
		}
		m.statusMu.Unlock()
		fmt.Fprintln(w)

		fmt.Fprintf(w, "# HELP kraken_ws_connections_active Active WebSocket connections.\n")
		fmt.Fprintf(w, "# TYPE kraken_ws_connections_active gauge\n")
		fmt.Fprintf(w, "kraken_ws_connections_active %d\n\n", m.wsConnections.Load())

		fmt.Fprintf(w, "# HELP kraken_uptime_seconds Seconds since server start.\n")
		fmt.Fprintf(w, "# TYPE kraken_uptime_seconds gauge\n")
		fmt.Fprintf(w, "kraken_uptime_seconds %.0f\n\n", uptimeSec)

		fmt.Fprintf(w, "# HELP kraken_go_goroutines Current number of goroutines.\n")
		fmt.Fprintf(w, "# TYPE kraken_go_goroutines gauge\n")
		fmt.Fprintf(w, "kraken_go_goroutines %d\n\n", runtime.NumGoroutine())

		fmt.Fprintf(w, "# HELP kraken_go_heap_alloc_bytes Current heap allocation in bytes.\n")
		fmt.Fprintf(w, "# TYPE kraken_go_heap_alloc_bytes gauge\n")
		fmt.Fprintf(w, "kraken_go_heap_alloc_bytes %d\n\n", memStats.HeapAlloc)

		fmt.Fprintf(w, "# HELP kraken_go_heap_sys_bytes Total heap memory obtained from OS.\n")
		fmt.Fprintf(w, "# TYPE kraken_go_heap_sys_bytes gauge\n")
		fmt.Fprintf(w, "kraken_go_heap_sys_bytes %d\n\n", memStats.HeapSys)

		fmt.Fprintf(w, "# HELP kraken_go_gc_count Total GC cycles completed.\n")
		fmt.Fprintf(w, "# TYPE kraken_go_gc_count counter\n")
		fmt.Fprintf(w, "kraken_go_gc_count %d\n", memStats.NumGC)
	})
}

type statusRecorderMetrics struct {
	http.ResponseWriter
	status int
}

func (r *statusRecorderMetrics) WriteHeader(status int) {
	r.status = status
	r.ResponseWriter.WriteHeader(status)
}
