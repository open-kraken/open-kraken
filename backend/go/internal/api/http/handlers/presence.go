package handlers

import (
	"net/http"

	"open-kraken/backend/go/internal/presence"
)

// PresenceHandler serves presence API endpoints.
type PresenceHandler struct {
	svc *presence.Service
}

// NewPresenceHandler creates a PresenceHandler.
func NewPresenceHandler(svc *presence.Service) *PresenceHandler {
	return &PresenceHandler{svc: svc}
}

// HandleStatus handles PUT /presence/status — set a member's status.
func (h *PresenceHandler) HandleStatus(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPut {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	var body struct {
		WorkspaceID string `json:"workspaceId"`
		MemberID    string `json:"memberId"`
		Status      string `json:"status"`
	}
	if !decodeJSON(r, &body, w) {
		return
	}
	h.svc.SetStatus(r.Context(), body.WorkspaceID, body.MemberID, presence.Status(body.Status))
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// HandleHeartbeat handles POST /presence/heartbeat — record a heartbeat.
func (h *PresenceHandler) HandleHeartbeat(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	var body struct {
		WorkspaceID string `json:"workspaceId"`
		MemberID    string `json:"memberId"`
	}
	if !decodeJSON(r, &body, w) {
		return
	}
	h.svc.Heartbeat(r.Context(), body.WorkspaceID, body.MemberID)
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// HandleListOnline handles GET /presence/online?workspaceId=...
func (h *PresenceHandler) HandleListOnline(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	wsID := r.URL.Query().Get("workspaceId")
	online := h.svc.ListOnline(wsID)
	items := make([]map[string]any, 0, len(online))
	for _, p := range online {
		items = append(items, map[string]any{
			"memberId":       p.MemberID,
			"status":         string(p.EffectiveStatus()),
			"terminalStatus": p.TerminalStatus,
			"lastSeenAt":     p.LastSeenAt.Format("2006-01-02T15:04:05Z07:00"),
		})
	}
	writeJSON(w, http.StatusOK, map[string]any{"members": items})
}
