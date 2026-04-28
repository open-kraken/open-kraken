package handlers

import (
	"fmt"
	"net/http"
	"strings"

	"open-kraken/backend/go/contracts"
	"open-kraken/backend/go/internal/ael"
)

// FlowHandler handles HTTP requests for AEL Flow objects under /api/v2/flows
// and the nested /api/v2/runs/{id}/flows routes.
type FlowHandler struct {
	svc         *ael.Service
	flowsPrefix string // e.g. /api/v2/flows
	runsPrefix  string // e.g. /api/v2/runs
}

// NewFlowHandler creates a FlowHandler.
func NewFlowHandler(svc *ael.Service, flowsPrefix, runsPrefix string) *FlowHandler {
	return &FlowHandler{svc: svc, flowsPrefix: flowsPrefix, runsPrefix: runsPrefix}
}

// HandleFlows handles POST /api/v2/flows.
func (h *FlowHandler) HandleFlows(w http.ResponseWriter, r *http.Request) {
	if h.svc == nil {
		writeError(w, http.StatusServiceUnavailable, fmt.Errorf("AEL not configured"))
		return
	}
	switch r.Method {
	case http.MethodPost:
		h.handleCreate(w, r)
	default:
		w.WriteHeader(http.StatusMethodNotAllowed)
	}
}

// HandleRunFlows handles GET /api/v2/runs/{id}/flows.
// The full path is provided; the run ID is extracted from the URL.
func (h *FlowHandler) HandleRunFlows(w http.ResponseWriter, r *http.Request) {
	if h.svc == nil {
		writeError(w, http.StatusServiceUnavailable, fmt.Errorf("AEL not configured"))
		return
	}
	// Extract run ID from /api/v2/runs/{id}/flows
	suffix := strings.TrimPrefix(r.URL.Path, h.runsPrefix)
	suffix = strings.Trim(suffix, "/")
	parts := strings.Split(suffix, "/")
	if len(parts) < 2 || parts[1] != "flows" {
		w.WriteHeader(http.StatusNotFound)
		return
	}
	runID := parts[0]
	switch r.Method {
	case http.MethodGet:
		h.handleList(w, r, runID)
	default:
		w.WriteHeader(http.StatusMethodNotAllowed)
	}
}

func (h *FlowHandler) handleCreate(w http.ResponseWriter, r *http.Request) {
	var body struct {
		RunID        string `json:"run_id"`
		TenantID     string `json:"tenant_id"`
		AgentRole    string `json:"agent_role"`
		AssignedNode string `json:"assigned_node"`
	}
	if !decodeJSON(r, &body, w) {
		return
	}
	flow := &ael.Flow{
		RunID:        body.RunID,
		TenantID:     normalizeAELID(body.TenantID),
		AgentRole:    body.AgentRole,
		AssignedNode: body.AssignedNode,
	}
	if err := h.svc.AddFlow(r.Context(), flow); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	writeJSON(w, http.StatusCreated, flowToDTO(flow))
}

func (h *FlowHandler) handleList(w http.ResponseWriter, r *http.Request, runID string) {
	flows, err := h.svc.ListFlowsByRun(r.Context(), runID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	items := make([]contracts.FlowDTO, 0, len(flows))
	for i := range flows {
		items = append(items, flowToDTO(&flows[i]))
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": items, "total": len(items)})
}
