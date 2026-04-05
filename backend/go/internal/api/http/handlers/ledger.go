package handlers

import (
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"open-kraken/backend/go/internal/ledger"
)

// LedgerHandler serves the central audit ledger API.
type LedgerHandler struct {
	svc *ledger.Service
}

// NewLedgerHandler creates a LedgerHandler.
func NewLedgerHandler(svc *ledger.Service) *LedgerHandler {
	return &LedgerHandler{svc: svc}
}

// HandleEvents handles GET and POST {API base}/ledger/events.
// GET query: workspaceId, teamId, memberId, nodeId, eventType, since, until (RFC3339), limit.
// POST JSON: workspaceId, teamId, memberId, nodeId, eventType, summary, correlationId, sessionId, context (object).
func (h *LedgerHandler) HandleEvents(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		h.handleList(w, r)
	case http.MethodPost:
		h.handleAppend(w, r)
	default:
		w.WriteHeader(http.StatusMethodNotAllowed)
	}
}

func (h *LedgerHandler) handleList(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	query := ledger.Query{
		WorkspaceID: q.Get("workspaceId"),
		TeamID:      q.Get("teamId"),
		MemberID:    q.Get("memberId"),
		NodeID:      q.Get("nodeId"),
		EventType:   q.Get("eventType"),
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
	query.Limit = 100
	if l := q.Get("limit"); l != "" {
		var n int
		if _, err := fmt.Sscanf(l, "%d", &n); err == nil && n > 0 {
			query.Limit = n
		}
	}

	events, err := h.svc.List(r.Context(), query)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	items := make([]map[string]any, 0, len(events))
	for _, e := range events {
		items = append(items, ledgerEventToJSON(e))
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": items, "total": len(items)})
}

func (h *LedgerHandler) handleAppend(w http.ResponseWriter, r *http.Request) {
	var body struct {
		WorkspaceID   string         `json:"workspaceId"`
		TeamID        string         `json:"teamId"`
		MemberID      string         `json:"memberId"`
		NodeID        string         `json:"nodeId"`
		EventType     string         `json:"eventType"`
		Summary       string         `json:"summary"`
		CorrelationID string         `json:"correlationId"`
		SessionID     string         `json:"sessionId"`
		Context       map[string]any `json:"context"`
	}
	if !decodeJSON(r, &body, w) {
		return
	}
	ctxJSON := "{}"
	if len(body.Context) > 0 {
		b, err := json.Marshal(body.Context)
		if err != nil {
			writeError(w, http.StatusBadRequest, err)
			return
		}
		ctxJSON = string(b)
	}
	e := ledger.LedgerEvent{
		WorkspaceID:   body.WorkspaceID,
		TeamID:        body.TeamID,
		MemberID:      body.MemberID,
		NodeID:        body.NodeID,
		EventType:     body.EventType,
		Summary:       body.Summary,
		CorrelationID: body.CorrelationID,
		SessionID:     body.SessionID,
		ContextJSON:   ctxJSON,
	}
	saved, err := h.svc.Record(r.Context(), e)
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	writeJSON(w, http.StatusCreated, ledgerEventToJSON(saved))
}

func ledgerEventToJSON(e ledger.LedgerEvent) map[string]any {
	var ctx any = map[string]any{}
	if e.ContextJSON != "" {
		_ = json.Unmarshal([]byte(e.ContextJSON), &ctx)
	}
	return map[string]any{
		"id":            e.ID,
		"workspaceId":   e.WorkspaceID,
		"teamId":        e.TeamID,
		"memberId":      e.MemberID,
		"nodeId":        e.NodeID,
		"eventType":     e.EventType,
		"summary":       e.Summary,
		"correlationId": e.CorrelationID,
		"sessionId":     e.SessionID,
		"context":       ctx,
		"timestamp":     e.Timestamp.Format(time.RFC3339),
	}
}
