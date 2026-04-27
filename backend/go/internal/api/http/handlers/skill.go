package handlers

import (
	"net/http"
	"strings"

	"open-kraken/backend/go/internal/skill"
)

// SkillHandler handles HTTP requests for skill catalog and member binding APIs.
type SkillHandler struct {
	svc                     *skill.Service
	membersPrefix           string // e.g. /api/v1/members/
	canAssignSkillsToMember func(memberID string) bool
}

// NewSkillHandler creates a SkillHandler backed by the given service.
func NewSkillHandler(svc *skill.Service, membersPrefix string) *SkillHandler {
	return &SkillHandler{svc: svc, membersPrefix: membersPrefix}
}

// SetMemberSkillEligibility configures the production roster check for member
// skill writes. Tests and legacy callers can omit it to preserve standalone
// skill-service behavior.
func (h *SkillHandler) SetMemberSkillEligibility(resolver func(memberID string) bool) {
	h.canAssignSkillsToMember = resolver
}

// HandleSkillImport handles POST /api/skills/import with conflict resolution.
func (h *SkillHandler) HandleSkillImport(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	var body struct {
		Strategy string              `json:"strategy"` // "merge", "replace", "validate"
		Entries  []skill.ImportEntry `json:"entries"`
	}
	if !decodeJSON(r, &body, w) {
		return
	}
	strategy := skill.ImportStrategy(body.Strategy)
	if strategy == "" {
		strategy = skill.ImportStrategyValidate
	}
	switch strategy {
	case skill.ImportStrategyMerge, skill.ImportStrategyReplace, skill.ImportStrategyValidate:
	default:
		writeJSON(w, http.StatusBadRequest, map[string]any{"message": "strategy must be merge, replace, or validate"})
		return
	}
	result, err := h.svc.ImportSkills(r.Context(), body.Entries, strategy)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"applied":   result.Applied,
		"skipped":   result.Skipped,
		"conflicts": result.Conflicts,
		"dryRun":    result.DryRun,
	})
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
	if h.canAssignSkillsToMember != nil && !h.canAssignSkillsToMember(memberID) {
		writeJSON(w, http.StatusBadRequest, map[string]any{"message": "skills can only be assigned to AI Assistant members"})
		return
	}

	var body struct {
		Skills []string `json:"skills"`
	}
	if !decodeJSON(r, &body, w) {
		return
	}
	ctx := r.Context()
	if body.Skills == nil {
		body.Skills = []string{}
	}
	if err := h.svc.ReplaceMemberSkills(ctx, memberID, body.Skills); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
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
