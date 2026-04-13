package handlers

import (
	"fmt"
	"net/http"
	"strings"
	"time"

	"open-kraken/backend/go/contracts"
	"open-kraken/backend/go/internal/ael"
)

// SkillLibraryHandler handles HTTP requests for the AEL Skill Library
// under /api/v2/skills.
type SkillLibraryHandler struct {
	svc        *ael.Service
	pathPrefix string // e.g. /api/v2/skills
}

// NewSkillLibraryHandler creates a SkillLibraryHandler.
func NewSkillLibraryHandler(svc *ael.Service, pathPrefix string) *SkillLibraryHandler {
	return &SkillLibraryHandler{svc: svc, pathPrefix: pathPrefix}
}

// Handle routes all requests under pathPrefix.
func (h *SkillLibraryHandler) Handle(w http.ResponseWriter, r *http.Request) {
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

func (h *SkillLibraryHandler) handleCreate(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Name              string   `json:"name"`
		Version           int      `json:"version"`
		Description       string   `json:"description"`
		PromptTemplate    string   `json:"prompt_template"`
		ToolRequirements  []string `json:"tool_requirements"`
		AgentTypeAffinity []string `json:"agent_type_affinity"`
		WorkloadClassTags []string `json:"workload_class_tags"`
		TenantID          string   `json:"tenant_id"`
		AuthoredBy        string   `json:"authored_by"`
	}
	if !decodeJSON(r, &body, w) {
		return
	}
	if body.Version == 0 {
		body.Version = 1
	}
	sk := &ael.SkillDefinition{
		Name:              body.Name,
		Version:           body.Version,
		Description:       body.Description,
		PromptTemplate:    body.PromptTemplate,
		ToolRequirements:  body.ToolRequirements,
		AgentTypeAffinity: body.AgentTypeAffinity,
		WorkloadClassTags: body.WorkloadClassTags,
		TenantID:          body.TenantID,
		AuthoredBy:        body.AuthoredBy,
	}
	if err := h.svc.CreateSkill(r.Context(), sk); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	writeJSON(w, http.StatusCreated, skillToDTO(sk))
}

func (h *SkillLibraryHandler) handleList(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	tenantID := q.Get("tenant_id")
	limit := 50
	if l := q.Get("limit"); l != "" {
		var n int
		if _, err := fmt.Sscanf(l, "%d", &n); err == nil && n > 0 {
			limit = n
		}
	}
	skills, err := h.svc.ListSkills(r.Context(), tenantID, limit)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	items := make([]contracts.SkillDefinitionDTO, 0, len(skills))
	for i := range skills {
		items = append(items, skillToDTO(&skills[i]))
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": items, "total": len(items)})
}

func (h *SkillLibraryHandler) handleGetByID(w http.ResponseWriter, r *http.Request, id string) {
	sk, err := h.svc.GetSkill(r.Context(), id)
	if err != nil {
		writeAELError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, skillToDTO(sk))
}

func skillToDTO(s *ael.SkillDefinition) contracts.SkillDefinitionDTO {
	toolReqs := s.ToolRequirements
	if toolReqs == nil {
		toolReqs = []string{}
	}
	affinity := s.AgentTypeAffinity
	if affinity == nil {
		affinity = []string{}
	}
	tags := s.WorkloadClassTags
	if tags == nil {
		tags = []string{}
	}
	return contracts.SkillDefinitionDTO{
		ID:                s.ID,
		Name:              s.Name,
		Version:           s.Version,
		Description:       s.Description,
		PromptTemplate:    s.PromptTemplate,
		ToolRequirements:  toolReqs,
		AgentTypeAffinity: affinity,
		WorkloadClassTags: tags,
		TenantID:          s.TenantID,
		AuthoredBy:        s.AuthoredBy,
		PublishedAt:       s.PublishedAt.Format(time.RFC3339),
		EmbeddingStatus:   s.EmbeddingStatus,
	}
}
