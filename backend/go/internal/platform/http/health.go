package http

import (
	"encoding/json"
	"net/http"
)

type HealthChecker struct {
	Name      string
	Required  bool
	CheckFunc func() error
}

type healthResponse struct {
	Status    string         `json:"status"`
	Service   string         `json:"service"`
	RequestID string         `json:"requestId"`
	Warnings  []healthDetail `json:"warnings,omitempty"`
	Errors    []healthDetail `json:"errors,omitempty"`
}

type healthDetail struct {
	Name   string `json:"name"`
	Reason string `json:"reason"`
}

func NewHealthHandler(serviceName string, checkers ...HealthChecker) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		response := healthResponse{
			Status:    "ok",
			Service:   serviceName,
			RequestID: RequestIDFromContext(r.Context()),
		}
		statusCode := http.StatusOK
		for _, checker := range checkers {
			if checker.CheckFunc == nil {
				continue
			}
			if err := checker.CheckFunc(); err != nil {
				detail := healthDetail{Name: checker.Name, Reason: err.Error()}
				if checker.Required {
					response.Status = "unhealthy"
					response.Errors = append(response.Errors, detail)
					statusCode = http.StatusServiceUnavailable
					continue
				}
				response.Warnings = append(response.Warnings, detail)
			}
		}
		writeJSON(w, statusCode, response)
	})
}

func writeJSON(w http.ResponseWriter, statusCode int, value any) {
	encoded, err := json.Marshal(value)
	if err != nil {
		http.Error(w, `{"status":"unhealthy","service":"open-kraken-backend","errors":[{"name":"json","reason":"marshal failure"}]}`, http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(statusCode)
	_, _ = w.Write(encoded)
}
