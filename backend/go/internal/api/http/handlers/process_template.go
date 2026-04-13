package handlers

import (
	"fmt"
	"net/http"
	"strings"
	"time"

	"open-kraken/backend/go/contracts"
	"open-kraken/backend/go/internal/ael"
)

// ProcessTemplateHandler handles HTTP requests for the AEL Process Template
// Library under /api/v2/process-templates.
type ProcessTemplateHandler struct {
	svc        *ael.Service
	pathPrefix string // e.g. /api/v2/process-templates
}

// NewProcessTemplateHandler creates a ProcessTemplateHandler.
func NewProcessTemplateHandler(svc *ael.Service, pathPrefix string) *ProcessTemplateHandler {
	return &ProcessTemplateHandler{svc: svc, pathPrefix: pathPrefix}
}

// Handle routes all requests under pathPrefix.
func (h *ProcessTemplateHandler) Handle(w http.ResponseWriter, r *http.Request) {
	if h.svc == nil {
		writeError(w, http.StatusServiceUnavailable, fmt.Errorf("AEL not configured"))
		return
	}

	suffix := strings.TrimPrefix(r.URL.Path, h.pathPrefix)
	suffix = strings.Trim(suffix, "/")
	var parts []string
	if suffix != "" {
		parts = strings.Split(suffix, "/")
	}

	switch {
	case len(parts) == 0 && r.Method == http.MethodGet:
		h.handleList(w, r)
	case len(parts) == 0 && r.Method == http.MethodPost:
		h.handleCreate(w, r)
	case len(parts) == 1 && r.Method == http.MethodGet:
		h.handleGetByID(w, r, parts[0])
	default:
		w.WriteHeader(http.StatusNotFound)
	}
}

func (h *ProcessTemplateHandler) handleCreate(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Name               string   `json:"name"`
		Version            int      `json:"version"`
		TriggerDescription string   `json:"trigger_description"`
		DAGTemplate        string   `json:"dag_template"` // JSON string
		ApplicableDomains  []string `json:"applicable_domains"`
		EstimatedStepsMin  int      `json:"estimated_steps_min"`
		EstimatedStepsMax  int      `json:"estimated_steps_max"`
		AuthoredBy         string   `json:"authored_by"`
	}
	if !decodeJSON(r, &body, w) {
		return
	}
	if body.Version == 0 {
		body.Version = 1
	}
	dagBytes := []byte(body.DAGTemplate)
	if len(dagBytes) == 0 {
		dagBytes = []byte("{}")
	}
	p := &ael.ProcessTemplate{
		Name:               body.Name,
		Version:            body.Version,
		TriggerDescription: body.TriggerDescription,
		DAGTemplate:        dagBytes,
		ApplicableDomains:  body.ApplicableDomains,
		EstimatedStepsMin:  body.EstimatedStepsMin,
		EstimatedStepsMax:  body.EstimatedStepsMax,
		AuthoredBy:         body.AuthoredBy,
	}
	if err := h.svc.CreateProcessTemplate(r.Context(), p); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	writeJSON(w, http.StatusCreated, processTemplateToDTO(p))
}

func (h *ProcessTemplateHandler) handleList(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	limit := 50
	if l := q.Get("limit"); l != "" {
		var n int
		if _, err := fmt.Sscanf(l, "%d", &n); err == nil && n > 0 {
			limit = n
		}
	}
	templates, err := h.svc.ListProcessTemplates(r.Context(), limit)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	items := make([]contracts.ProcessTemplateDTO, 0, len(templates))
	for i := range templates {
		items = append(items, processTemplateToDTO(&templates[i]))
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": items, "total": len(items)})
}

func (h *ProcessTemplateHandler) handleGetByID(w http.ResponseWriter, r *http.Request, id string) {
	p, err := h.svc.GetProcessTemplate(r.Context(), id)
	if err != nil {
		writeAELError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, processTemplateToDTO(p))
}

func processTemplateToDTO(p *ael.ProcessTemplate) contracts.ProcessTemplateDTO {
	domains := p.ApplicableDomains
	if domains == nil {
		domains = []string{}
	}
	return contracts.ProcessTemplateDTO{
		ID:                 p.ID,
		Name:               p.Name,
		Version:            p.Version,
		TriggerDescription: p.TriggerDescription,
		DAGTemplate:        string(p.DAGTemplate),
		ApplicableDomains:  domains,
		EstimatedStepsMin:  p.EstimatedStepsMin,
		EstimatedStepsMax:  p.EstimatedStepsMax,
		AuthoredBy:         p.AuthoredBy,
		PublishedAt:        p.PublishedAt.Format(time.RFC3339),
		EmbeddingStatus:    p.EmbeddingStatus,
	}
}
