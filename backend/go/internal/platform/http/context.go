package http

import (
	"bufio"
	"context"
	"errors"
	"log"
	"net"
	"net/http"
	"strconv"
	"sync/atomic"
	"time"
)

type contextKey string

const requestIDKey contextKey = "requestId"

var requestIDCounter atomic.Uint64

func RequestIDFromContext(ctx context.Context) string {
	if value, ok := ctx.Value(requestIDKey).(string); ok {
		return value
	}
	return ""
}

func WithRequestContext(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requestID := r.Header.Get("X-Request-Id")
		if requestID == "" {
			requestID = "req-" + strconv.FormatUint(requestIDCounter.Add(1), 10)
		}
		w.Header().Set("X-Request-Id", requestID)
		next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), requestIDKey, requestID)))
	})
}

func WithAccessLog(serviceName string, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		startedAt := time.Now().UTC()
		recorder := &statusRecorder{ResponseWriter: w, status: http.StatusOK}
		next.ServeHTTP(recorder, r)
		durationMS := time.Since(startedAt).Milliseconds()
		level := "info"
		if recorder.status >= http.StatusInternalServerError {
			level = "error"
		}
		log.Printf(
			`time=%s level=%s service=%s requestId=%s method=%s path=%s status=%d durationMs=%d message="request completed"`,
			startedAt.Format(time.RFC3339),
			level,
			serviceName,
			RequestIDFromContext(r.Context()),
			r.Method,
			r.URL.Path,
			recorder.status,
			durationMS,
		)
	})
}

type statusRecorder struct {
	http.ResponseWriter
	status int
}

func (r *statusRecorder) WriteHeader(status int) {
	r.status = status
	r.ResponseWriter.WriteHeader(status)
}

// Hijack delegates to the underlying ResponseWriter when it supports hijacking.
// Required for WebSocket upgrades — gorilla/websocket needs to hijack the
// underlying TCP connection out of the HTTP server.
func (r *statusRecorder) Hijack() (net.Conn, *bufio.ReadWriter, error) {
	hijacker, ok := r.ResponseWriter.(http.Hijacker)
	if !ok {
		return nil, nil, errors.New("response writer does not support hijacking")
	}
	// Treat hijacked connections as 101 Switching Protocols for access logging.
	r.status = http.StatusSwitchingProtocols
	return hijacker.Hijack()
}

// Flush delegates to the underlying ResponseWriter when it supports flushing.
func (r *statusRecorder) Flush() {
	if flusher, ok := r.ResponseWriter.(http.Flusher); ok {
		flusher.Flush()
	}
}
