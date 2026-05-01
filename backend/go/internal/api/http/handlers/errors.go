package handlers

import (
	"errors"
	"net/http"
	"strings"

	"open-kraken/backend/go/internal/authn"
	"open-kraken/backend/go/internal/authz"
	"open-kraken/backend/go/internal/projectdata"
)

func writeError(w http.ResponseWriter, status int, err error) {
	message := http.StatusText(status)
	if err != nil && strings.TrimSpace(err.Error()) != "" {
		message = err.Error()
	}
	body := map[string]any{
		"code":      errorCode(status, err),
		"message":   message,
		"status":    status,
		"requestId": requestIDFromWriter(w),
		"retryable": isRetryableStatus(status),
	}
	writeJSON(w, status, map[string]any{"error": body})
}

func errorCode(status int, err error) string {
	switch {
	case errors.Is(err, authn.ErrUnauthorized):
		return "auth.unauthorized"
	case errors.Is(err, authz.ErrForbidden):
		return "auth.capability_denied"
	case status == http.StatusUnauthorized:
		return "unauthorized"
	case status == http.StatusForbidden:
		return "forbidden"
	case errors.Is(err, projectdata.ErrVersionConflict):
		return "version_conflict"
	case status == http.StatusConflict:
		return "conflict"
	case status == http.StatusNotFound:
		return "not_found"
	case status == http.StatusMethodNotAllowed:
		return "method_not_allowed"
	case status == http.StatusUnprocessableEntity:
		return "unprocessable_entity"
	case status == http.StatusServiceUnavailable:
		return "service_unavailable"
	case status >= 500:
		return "server_error"
	case status >= 400:
		return "invalid_request"
	default:
		return "request_failed"
	}
}

func requestIDFromWriter(w http.ResponseWriter) string {
	if requestID := strings.TrimSpace(w.Header().Get("X-Request-Id")); requestID != "" {
		return requestID
	}
	return "req_unavailable"
}

func isRetryableStatus(status int) bool {
	return status == http.StatusRequestTimeout || status == http.StatusTooManyRequests || status >= 500
}
