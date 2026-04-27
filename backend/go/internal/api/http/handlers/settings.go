package handlers

import (
	"net/http"
	"strings"

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
	writeJSON(w, http.StatusOK, publicSettings(us))
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
	existing, err := h.svc.Get(body.MemberID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	body.ProviderAuth = mergeProviderAuth(existing.ProviderAuth, body.ProviderAuth)
	saved, err := h.svc.Update(body.MemberID, body)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusOK, publicSettings(saved))
}

func mergeProviderAuth(existing, incoming map[string]settings.ProviderAuthSetting) map[string]settings.ProviderAuthSetting {
	if incoming == nil {
		return existing
	}
	out := make(map[string]settings.ProviderAuthSetting, len(incoming))
	for provider, next := range incoming {
		key := strings.TrimSpace(provider)
		if key == "" {
			continue
		}
		if next.Mode == "api_key" && next.APIKey == "" {
			if prev, ok := existing[key]; ok {
				next.APIKey = prev.APIKey
			}
		}
		next.HasAPIKey = next.APIKey != ""
		out[key] = next
	}
	return out
}

func publicSettings(us settings.UserSettings) settings.UserSettings {
	if us.ProviderAuth == nil {
		return us
	}
	publicAuth := make(map[string]settings.ProviderAuthSetting, len(us.ProviderAuth))
	for provider, auth := range us.ProviderAuth {
		auth.HasAPIKey = auth.APIKey != "" || auth.HasAPIKey
		auth.APIKey = ""
		publicAuth[provider] = auth
	}
	us.ProviderAuth = publicAuth
	return us
}
