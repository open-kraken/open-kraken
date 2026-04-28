package handlers

import (
	"fmt"
	"net/http"
	"strings"
	"time"

	"open-kraken/backend/go/contracts"
	"open-kraken/backend/go/internal/ael"
)

// RunHandler handles HTTP requests for AEL Run objects under /api/v2/runs.
type RunHandler struct {
	svc        *ael.Service
	pathPrefix string // e.g. /api/v2/runs
}

// NewRunHandler creates a RunHandler.
func NewRunHandler(svc *ael.Service, pathPrefix string) *RunHandler {
	return &RunHandler{svc: svc, pathPrefix: pathPrefix}
}

// Handle routes all requests under pathPrefix.
func (h *RunHandler) Handle(w http.ResponseWriter, r *http.Request) {
	if h.svc == nil {
		writeError(w, http.StatusServiceUnavailable, fmt.Errorf("AEL not configured"))
		return
	}

	suffix := strings.TrimPrefix(r.URL.Path, h.pathPrefix)
	suffix = strings.Trim(suffix, "/")
	parts := []string{}
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
	case len(parts) == 2 && parts[1] == "state" && r.Method == http.MethodPut:
		h.handleTransitionState(w, r, parts[0])
	default:
		w.WriteHeader(http.StatusNotFound)
	}
}

func (h *RunHandler) handleCreate(w http.ResponseWriter, r *http.Request) {
	var body struct {
		TenantID    string `json:"tenant_id"`
		HiveID      string `json:"hive_id"`
		Objective   string `json:"objective"`
		TokenBudget int    `json:"token_budget"`
	}
	if !decodeJSON(r, &body, w) {
		return
	}
	run := &ael.Run{
		TenantID:    normalizeAELID(body.TenantID),
		HiveID:      normalizeAELID(body.HiveID),
		Objective:   body.Objective,
		TokenBudget: body.TokenBudget,
	}
	if err := h.svc.OpenRun(r.Context(), run); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	writeJSON(w, http.StatusCreated, runToDTO(run, nil))
}

func (h *RunHandler) handleList(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	tenantID := normalizeAELID(q.Get("tenant_id"))
	state := ael.RunState(q.Get("state"))
	limit := 50
	if l := q.Get("limit"); l != "" {
		var n int
		if _, err := fmt.Sscanf(l, "%d", &n); err == nil && n > 0 {
			limit = n
		}
	}
	runs, err := h.svc.ListRuns(r.Context(), tenantID, state, limit)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	items := make([]contracts.RunDTO, 0, len(runs))
	for i := range runs {
		items = append(items, runToDTO(&runs[i], nil))
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": items, "total": len(items)})
}

func (h *RunHandler) handleGetByID(w http.ResponseWriter, r *http.Request, id string) {
	run, err := h.svc.GetRun(r.Context(), id)
	if err != nil {
		writeAELError(w, err)
		return
	}
	flows, err := h.svc.ListFlowsByRun(r.Context(), id)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	flowDTOs := make([]contracts.FlowDTO, 0, len(flows))
	for i := range flows {
		flowDTOs = append(flowDTOs, flowToDTO(&flows[i]))
	}
	writeJSON(w, http.StatusOK, runToDTO(run, flowDTOs))
}

func (h *RunHandler) handleTransitionState(w http.ResponseWriter, r *http.Request, id string) {
	var body struct {
		State string `json:"state"`
	}
	if !decodeJSON(r, &body, w) {
		return
	}
	if err := h.svc.TransitionRun(r.Context(), id, ael.RunState(body.State)); err != nil {
		writeAELError(w, err)
		return
	}
	run, err := h.svc.GetRun(r.Context(), id)
	if err != nil {
		writeAELError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, runToDTO(run, nil))
}

// --- helpers ---

func runToDTO(r *ael.Run, flows []contracts.FlowDTO) contracts.RunDTO {
	dto := contracts.RunDTO{
		ID:          r.ID,
		TenantID:    r.TenantID,
		HiveID:      r.HiveID,
		State:       string(r.State),
		PolicySetID: r.PolicySetID,
		TokenBudget: r.TokenBudget,
		TokensUsed:  r.TokensUsed,
		CostUSD:     r.CostUSD,
		Objective:   r.Objective,
		Version:     r.Version,
		CreatedAt:   r.CreatedAt.Format(time.RFC3339),
		UpdatedAt:   r.UpdatedAt.Format(time.RFC3339),
		Flows:       flows,
	}
	return dto
}

func flowToDTO(f *ael.Flow) contracts.FlowDTO {
	return contracts.FlowDTO{
		ID:           f.ID,
		RunID:        f.RunID,
		TenantID:     f.TenantID,
		AgentRole:    f.AgentRole,
		AssignedNode: f.AssignedNode,
		State:        string(f.State),
		Version:      f.Version,
		CreatedAt:    f.CreatedAt.Format(time.RFC3339),
		UpdatedAt:    f.UpdatedAt.Format(time.RFC3339),
	}
}

func writeAELError(w http.ResponseWriter, err error) {
	if err == nil {
		return
	}
	if isNotFound(err) {
		writeError(w, http.StatusNotFound, err)
		return
	}
	if err == ael.ErrVersionConflict {
		writeError(w, http.StatusConflict, err)
		return
	}
	writeError(w, http.StatusBadRequest, err)
}
