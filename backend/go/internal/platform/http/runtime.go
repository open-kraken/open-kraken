package http

import (
	"net/http"
	"strings"
	"time"

	"open-kraken/backend/go/internal/observability"
	runtimecfg "open-kraken/backend/go/internal/platform/runtime"
)

func NewRuntimeHandler(cfg runtimecfg.Config, apiHandler http.Handler) http.Handler {
	staticHandler := NewStaticHandler(cfg.WebDistDir)
	healthHandler := NewHealthHandler(cfg.ServiceName, staticHandler.AvailabilityChecker())
	metrics := NewMetrics()

	router := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.URL.Path == "/healthz":
			healthHandler.ServeHTTP(w, r)
		case r.URL.Path == "/metrics":
			MetricsHandler(metrics).ServeHTTP(w, r)
		case isAPIRequest(r.URL.Path, cfg.APIBasePath, cfg.WSPath):
			apiHandler.ServeHTTP(w, r)
		default:
			staticHandler.ServeHTTP(w, r)
		}
	})

	// Build the middleware chain (innermost to outermost).
	var handler http.Handler = router

	// Request validation (body size limits, Content-Type).
	handler = WithRequestValidation(handler)

	// JWT authentication (no-op when secret is empty).
	handler = WithAuth([]byte(cfg.JWTSecret), handler)

	// Per-IP rate limiting (disabled when RateLimitRPS is 0).
	if cfg.RateLimitRPS > 0 {
		limiter := NewRateLimiter(cfg.RateLimitRPS, cfg.RateLimitRPS*2, time.Second)
		handler = WithRateLimit(limiter, handler)
	}

	// Metrics collection.
	handler = WithMetrics(metrics, handler)

	// Access log + request ID (outermost).
	handler = WithRequestContext(WithAccessLog(cfg.ServiceName, handler))

	// OpenTelemetry HTTP spans (Langfuse OTLP) when InitTracer succeeded.
	handler = observability.WrapHTTP(handler, observability.HTTPTracingEnabled())

	return handler
}

func isAPIRequest(path, apiBasePath, wsPath string) bool {
	// All versioned HTTP APIs live under apiBasePath. WebSocket is wsPath; /realtime is a legacy alias.
	// /api covers unversioned T04-T07 routes (/api/nodes, /api/skills, /api/members, /api/tokens, /api/memory).
	for _, prefix := range []string{apiBasePath, wsPath, "/api", "/realtime"} {
		if prefix == "/" {
			continue
		}
		if path == prefix || strings.HasPrefix(path, prefix+"/") {
			return true
		}
	}
	return false
}
