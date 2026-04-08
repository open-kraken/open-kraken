package handlers

import (
	"net/http"

	"open-kraken/backend/go/internal/terminal/provider"
)

// ProviderHandler serves the AI provider registry API.
type ProviderHandler struct {
	registry *provider.Registry
}

// NewProviderHandler creates a ProviderHandler.
func NewProviderHandler(registry *provider.Registry) *ProviderHandler {
	return &ProviderHandler{registry: registry}
}

// HandleList handles GET /providers — returns all available AI providers.
func (h *ProviderHandler) HandleList(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	all := h.registry.List()
	items := make([]map[string]any, 0, len(all))
	for _, p := range all {
		items = append(items, map[string]any{
			"id":             p.ID,
			"terminalType":   p.TerminalType,
			"displayName":    p.DisplayName,
			"defaultCommand": p.DefaultCommand,
			"icon":           p.Icon,
			"hasPostReady":   len(p.PostReadyPlan.Steps) > 0,
		})
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": items})
}
