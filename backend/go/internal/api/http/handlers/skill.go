package handlers

import (
	"net/http"
	"strings"

	"open-kraken/backend/go/internal/skill"
)

// SkillHandler handles HTTP requests for skill catalog and member binding APIs.
type SkillHandler struct {
	svc           *skill.Service
	membersPrefix string // e.g. /api/v1/members/
}

// NewSkillHandler creates a SkillHandler backed by the given service.
func NewSkillHandler(svc *skill.Service, membersPrefix string) *SkillHandler {
	return &SkillHandler{svc: svc, membersPrefix: membersPrefix}
}

// HandleSkills handles GET /api/skills.
func (h *SkillHandler) HandleSkills(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	entries, err := h.svc.ListSkills()
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	items := make([]map[string]any, 0, len(entries))
	for _, e := range entries {
		items = append(items, toSkillResponse(e))
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": items})
}

// HandleMemberSkills routes PUT and GET requests for /api/members/{id}/skills.
func (h *SkillHandler) HandleMemberSkills(w http.ResponseWriter, r *http.Request) {
	path := strings.TrimPrefix(r.URL.Path, h.membersPrefix)
	path = strings.TrimSuffix(path, "/skills")
	memberID := strings.Trim(path, "/")
	if memberID == "" {
		w.WriteHeader(http.StatusBadRequest)
		return
	}

	switch r.Method {
	case http.MethodPut:
		h.handleBindSkills(w, r, memberID)
	case http.MethodGet:
		h.handleListMemberSkills(w, r, memberID)
	default:
		w.WriteHeader(http.StatusMethodNotAllowed)
	}
}

func (h *SkillHandler) handleBindSkills(w http.ResponseWriter, r *http.Request, memberID string) {
	var body struct {
		Skills []string `json:"skills"`
	}
	if !decodeJSON(r, &body, w) {
		return
	}
	ctx := r.Context()
	for _, name := range body.Skills {
		if err := h.svc.BindSkill(ctx, memberID, name); err != nil {
			writeError(w, http.StatusBadRequest, err)
			return
		}
	}
	entries, err := h.svc.ListMemberSkills(ctx, memberID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusOK, toMemberSkillsResponse(memberID, entries))
}

func (h *SkillHandler) handleListMemberSkills(w http.ResponseWriter, r *http.Request, memberID string) {
	entries, err := h.svc.ListMemberSkills(r.Context(), memberID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusOK, toMemberSkillsResponse(memberID, entries))
}

func toSkillResponse(e skill.SkillEntry) map[string]any {
	return map[string]any{
		"name":           e.Name,
		"description":    e.Description,
		"path":           e.Path,
		"category":       e.Category,
		"contentSummary": e.ContentSummary,
	}
}

func toMemberSkillsResponse(memberID string, entries []skill.SkillEntry) map[string]any {
	skills := make([]map[string]any, 0, len(entries))
	for _, e := range entries {
		skills = append(skills, toSkillResponse(e))
	}
	return map[string]any{
		"memberId": memberID,
		"skills":   skills,
	}
}
