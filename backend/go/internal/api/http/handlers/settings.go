package handlers

import (
	"net/http"

	"open-kraken/backend/go/internal/settings"
)

// SettingsHandler serves user settings API.
type SettingsHandler struct {
	svc *settings.Service
}

// NewSettingsHandler creates a SettingsHandler.
func NewSettingsHandler(svc *settings.Service) *SettingsHandler {
	return &SettingsHandler{svc: svc}
}

// HandleGet handles GET /settings?memberId=...
func (h *SettingsHandler) HandleGet(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	memberID := r.URL.Query().Get("memberId")
	if memberID == "" {
		writeError(w, http.StatusBadRequest, http.ErrNotSupported)
		return
	}
	us, err := h.svc.Get(memberID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusOK, us)
}

// HandleUpdate handles PUT /settings
func (h *SettingsHandler) HandleUpdate(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPut {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	var body settings.UserSettings
	if !decodeJSON(r, &body, w) {
		return
	}
	if body.MemberID == "" {
		writeError(w, http.StatusBadRequest, http.ErrNotSupported)
		return
	}
	saved, err := h.svc.Update(body.MemberID, body)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusOK, saved)
}
