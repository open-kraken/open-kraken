package http

import (
	"net/http"
	"strings"
)

// maxRequestBodySize limits request body to 1 MB to prevent abuse.
const maxRequestBodySize = 1 << 20 // 1 MB

// WithRequestValidation returns middleware that enforces request body size limits
// and validates Content-Type on mutation methods.
func WithRequestValidation(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Enforce body size limit for all requests.
		r.Body = http.MaxBytesReader(w, r.Body, maxRequestBodySize)

		// Require JSON Content-Type for mutation methods with a body.
		if isMutation(r.Method) && r.ContentLength > 0 {
			ct := r.Header.Get("Content-Type")
			if ct != "" && !strings.HasPrefix(ct, "application/json") {
				w.Header().Set("Content-Type", "application/json; charset=utf-8")
				w.WriteHeader(http.StatusUnsupportedMediaType)
				_, _ = w.Write([]byte(`{"error":"Content-Type must be application/json"}`))
				return
			}
		}

		next.ServeHTTP(w, r)
	})
}

func isMutation(method string) bool {
	return method == http.MethodPost || method == http.MethodPut || method == http.MethodPatch
}
