package handlers

import (
	"errors"
	"net/http"
	"strings"

	"open-kraken/backend/go/internal/plugin"
)

// PluginHandler serves the plugin marketplace API.
type PluginHandler struct {
	svc        *plugin.Service
	pathPrefix string
}

// NewPluginHandler creates a PluginHandler.
func NewPluginHandler(svc *plugin.Service, pathPrefix string) *PluginHandler {
	return &PluginHandler{svc: svc, pathPrefix: pathPrefix}
}

// Handle routes plugin requests.
//
//	GET    /plugins            → list available
//	GET    /plugins/installed  → list installed
//	POST   /plugins/{id}/install
//	DELETE /plugins/{id}
func (h *PluginHandler) Handle(w http.ResponseWriter, r *http.Request) {
	path := strings.TrimPrefix(r.URL.Path, h.pathPrefix)
	path = strings.Trim(path, "/")
	parts := strings.Split(path, "/")

	switch {
	case path == "" && r.Method == http.MethodGet:
		h.handleList(w, r)
	case path == "installed" && r.Method == http.MethodGet:
		h.handleListInstalled(w, r)
	case len(parts) == 2 && parts[1] == "install" && r.Method == http.MethodPost:
		h.handleInstall(w, r, parts[0])
	case len(parts) == 1 && r.Method == http.MethodDelete:
		h.handleRemove(w, r, parts[0])
	default:
		w.WriteHeader(http.StatusMethodNotAllowed)
	}
}

func (h *PluginHandler) handleList(w http.ResponseWriter, r *http.Request) {
	plugins := h.svc.ListAvailable(r.Context())
	items := make([]map[string]any, 0, len(plugins))
	for _, p := range plugins {
		items = append(items, pluginToJSON(p))
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": items})
}

func (h *PluginHandler) handleListInstalled(w http.ResponseWriter, r *http.Request) {
	plugins := h.svc.ListInstalled(r.Context())
	items := make([]map[string]any, 0, len(plugins))
	for _, p := range plugins {
		items = append(items, pluginToJSON(p))
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": items})
}

func (h *PluginHandler) handleInstall(w http.ResponseWriter, r *http.Request, id string) {
	p, err := h.svc.Install(r.Context(), id)
	if err != nil {
		if errors.Is(err, plugin.ErrNotFound) {
			writeError(w, http.StatusNotFound, err)
			return
		}
		if errors.Is(err, plugin.ErrAlreadyExists) {
			writeError(w, http.StatusConflict, err)
			return
		}
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusOK, pluginToJSON(p))
}

func (h *PluginHandler) handleRemove(w http.ResponseWriter, r *http.Request, id string) {
	if err := h.svc.Remove(r.Context(), id); err != nil {
		if errors.Is(err, plugin.ErrNotFound) {
			writeError(w, http.StatusNotFound, err)
			return
		}
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "removed"})
}

func pluginToJSON(p plugin.Plugin) map[string]any {
	m := map[string]any{
		"id":          p.ID,
		"name":        p.Name,
		"description": p.Description,
		"category":    string(p.Category),
		"version":     p.Version,
		"rating":      p.Rating,
		"icon":        p.Icon,
		"installed":   p.Installed,
	}
	if p.InstalledAt != nil {
		m["installedAt"] = p.InstalledAt.Format("2006-01-02T15:04:05Z07:00")
	}
	return m
}
