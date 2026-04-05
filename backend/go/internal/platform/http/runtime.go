package http

import (
	"net/http"
	"strings"

	runtimecfg "open-kraken/backend/go/internal/platform/runtime"
)

func NewRuntimeHandler(cfg runtimecfg.Config, apiHandler http.Handler) http.Handler {
	staticHandler := NewStaticHandler(cfg.WebDistDir)
	healthHandler := NewHealthHandler(cfg.ServiceName, staticHandler.AvailabilityChecker())

	router := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.URL.Path == "/healthz":
			healthHandler.ServeHTTP(w, r)
		case isAPIRequest(r.URL.Path, cfg.APIBasePath, cfg.WSPath):
			apiHandler.ServeHTTP(w, r)
		default:
			staticHandler.ServeHTTP(w, r)
		}
	})

	return WithRequestContext(WithAccessLog(cfg.ServiceName, router))
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
