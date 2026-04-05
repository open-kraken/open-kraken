package handlers

import (
	"fmt"
	"net/http"
	"time"

	"open-kraken/backend/go/internal/tokentrack"
)

// TokenHandler handles HTTP requests for token tracking events and statistics.
type TokenHandler struct {
	svc *tokentrack.Service
}

// NewTokenHandler creates a TokenHandler backed by the given service.
func NewTokenHandler(svc *tokentrack.Service) *TokenHandler {
	return &TokenHandler{svc: svc}
}

// HandleEvents handles POST {API base}/tokens/events.
func (h *TokenHandler) HandleEvents(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	var body struct {
		MemberID     string  `json:"memberId"`
		NodeID       string  `json:"nodeId"`
		Model        string  `json:"model"`
		InputTokens  int64   `json:"inputTokens"`
		OutputTokens int64   `json:"outputTokens"`
		Cost         float64 `json:"cost"`
	}
	if !decodeJSON(r, &body, w) {
		return
	}
	e := tokentrack.TokenEvent{
		MemberID:     body.MemberID,
		NodeID:       body.NodeID,
		Model:        body.Model,
		InputTokens:  body.InputTokens,
		OutputTokens: body.OutputTokens,
		Cost:         body.Cost,
	}
	saved, err := h.svc.RecordEvent(r.Context(), e)
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	writeJSON(w, http.StatusCreated, toTokenEventResponse(saved))
}

// HandleStats handles GET {API base}/tokens/stats.
// Query parameters: memberId, nodeId, team (bool), since (RFC3339), until (RFC3339).
func (h *TokenHandler) HandleStats(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	q := r.URL.Query()
	query := tokentrack.StatsQuery{
		MemberID: q.Get("memberId"),
		NodeID:   q.Get("nodeId"),
		Team:     q.Get("team") == "true" || q.Get("team") == "1",
	}
	if s := q.Get("since"); s != "" {
		if t, err := time.Parse(time.RFC3339, s); err == nil {
			query.Since = &t
		}
	}
	if u := q.Get("until"); u != "" {
		if t, err := time.Parse(time.RFC3339, u); err == nil {
			query.Until = &t
		}
	}
	stats, err := h.svc.GetStats(r.Context(), query)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusOK, toTokenStatsResponse(stats))
}

// HandleActivity handles GET {API base}/tokens/activity.
// Returns a time-ordered list of raw token events for the AgentActivityPanel.
// Supports the same query parameters as HandleStats: memberId, nodeId, team,
// since (RFC3339), until (RFC3339), and additionally limit (default 50).
func (h *TokenHandler) HandleActivity(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	q := r.URL.Query()
	query := tokentrack.StatsQuery{
		MemberID: q.Get("memberId"),
		NodeID:   q.Get("nodeId"),
		Team:     q.Get("team") == "true" || q.Get("team") == "1",
	}
	if s := q.Get("since"); s != "" {
		if t, err := time.Parse(time.RFC3339, s); err == nil {
			query.Since = &t
		}
	}
	if u := q.Get("until"); u != "" {
		if t, err := time.Parse(time.RFC3339, u); err == nil {
			query.Until = &t
		}
	}
	limit := 50
	if l := q.Get("limit"); l != "" {
		var n int
		if _, err := fmt.Sscanf(l, "%d", &n); err == nil && n > 0 {
			limit = n
		}
	}

	events, err := h.svc.ListActivity(r.Context(), query)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	// Apply limit after sorting (service returns newest-first).
	if len(events) > limit {
		events = events[:limit]
	}
	items := make([]map[string]any, 0, len(events))
	for _, e := range events {
		items = append(items, toTokenEventResponse(e))
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": items, "total": len(items)})
}

func toTokenEventResponse(e tokentrack.TokenEvent) map[string]any {
	return map[string]any{
		"id":           e.ID,
		"memberId":     e.MemberID,
		"nodeId":       e.NodeID,
		"model":        e.Model,
		"inputTokens":  e.InputTokens,
		"outputTokens": e.OutputTokens,
		"cost":         e.Cost,
		"timestamp":    e.Timestamp.Format(time.RFC3339),
	}
}

func toTokenStatsResponse(s tokentrack.TokenStats) map[string]any {
	return map[string]any{
		"scope":        s.Scope,
		"inputTokens":  s.InputTokens,
		"outputTokens": s.OutputTokens,
		"totalTokens":  s.TotalTokens,
		"totalCost":    s.TotalCost,
		"eventCount":   s.EventCount,
	}
}
