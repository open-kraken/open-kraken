package handlers

import (
	"fmt"
	"net/http"
	"strings"
	"time"

	"open-kraken/backend/go/contracts"
	"open-kraken/backend/go/internal/ael"
)

// StepHandler handles HTTP requests for AEL Step objects.
// Routes served:
//
//	POST   /api/v2/steps
//	GET    /api/v2/steps/pending
//	GET    /api/v2/steps/{id}
//	GET    /api/v2/flows/{id}/steps
type StepHandler struct {
	svc         *ael.Service
	stepsPrefix string // e.g. /api/v2/steps
	flowsPrefix string // e.g. /api/v2/flows
}

// NewStepHandler creates a StepHandler.
func NewStepHandler(svc *ael.Service, stepsPrefix, flowsPrefix string) *StepHandler {
	return &StepHandler{svc: svc, stepsPrefix: stepsPrefix, flowsPrefix: flowsPrefix}
}

// HandleSteps handles requests under /api/v2/steps and /api/v2/steps/.
func (h *StepHandler) HandleSteps(w http.ResponseWriter, r *http.Request) {
	if h.svc == nil {
		writeError(w, http.StatusServiceUnavailable, fmt.Errorf("AEL not configured"))
		return
	}

	suffix := strings.TrimPrefix(r.URL.Path, h.stepsPrefix)
	suffix = strings.Trim(suffix, "/")
	parts := []string{}
	if suffix != "" {
		parts = strings.Split(suffix, "/")
	}

	switch {
	case len(parts) == 0 && r.Method == http.MethodPost:
		h.handleCreate(w, r)
	case len(parts) == 1 && parts[0] == "pending" && r.Method == http.MethodGet:
		h.handlePending(w, r)
	case len(parts) == 1 && r.Method == http.MethodGet:
		h.handleGetByID(w, r, parts[0])
	default:
		w.WriteHeader(http.StatusNotFound)
	}
}

// HandleFlowSteps handles GET /api/v2/flows/{id}/steps.
func (h *StepHandler) HandleFlowSteps(w http.ResponseWriter, r *http.Request) {
	if h.svc == nil {
		writeError(w, http.StatusServiceUnavailable, fmt.Errorf("AEL not configured"))
		return
	}
	// Extract flow ID from /api/v2/flows/{id}/steps
	suffix := strings.TrimPrefix(r.URL.Path, h.flowsPrefix)
	suffix = strings.Trim(suffix, "/")
	parts := strings.Split(suffix, "/")
	if len(parts) < 2 || parts[1] != "steps" {
		w.WriteHeader(http.StatusNotFound)
		return
	}
	flowID := parts[0]
	switch r.Method {
	case http.MethodGet:
		h.handleListByFlow(w, r, flowID)
	default:
		w.WriteHeader(http.StatusMethodNotAllowed)
	}
}

func (h *StepHandler) handleCreate(w http.ResponseWriter, r *http.Request) {
	var body struct {
		FlowID        string `json:"flow_id"`
		RunID         string `json:"run_id"`
		TenantID      string `json:"tenant_id"`
		Regime        string `json:"regime"`
		WorkloadClass string `json:"workload_class"`
		AgentType     string `json:"agent_type"`
		Provider      string `json:"provider"`
	}
	if !decodeJSON(r, &body, w) {
		return
	}
	step := &ael.Step{
		FlowID:        body.FlowID,
		RunID:         body.RunID,
		TenantID:      normalizeAELID(body.TenantID),
		Regime:        ael.StepRegime(body.Regime),
		WorkloadClass: body.WorkloadClass,
		AgentType:     body.AgentType,
		Provider:      body.Provider,
	}
	if err := h.svc.AddStep(r.Context(), step); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	writeJSON(w, http.StatusCreated, stepToDTO(step, nil))
}

func (h *StepHandler) handleGetByID(w http.ResponseWriter, r *http.Request, id string) {
	step, err := h.svc.GetStep(r.Context(), id)
	if err != nil {
		writeAELError(w, err)
		return
	}
	ses, err := h.svc.ListSideEffectsByStep(r.Context(), id)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	seDTOs := make([]contracts.SideEffectDTO, 0, len(ses))
	for i := range ses {
		seDTOs = append(seDTOs, sideEffectToDTO(&ses[i]))
	}
	writeJSON(w, http.StatusOK, stepToDTO(step, seDTOs))
}

func (h *StepHandler) handleListByFlow(w http.ResponseWriter, r *http.Request, flowID string) {
	steps, err := h.svc.ListStepsByFlow(r.Context(), flowID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	items := make([]contracts.StepDTO, 0, len(steps))
	for i := range steps {
		items = append(items, stepToDTO(&steps[i], nil))
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": items, "total": len(items)})
}

func (h *StepHandler) handlePending(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	tenantID := normalizeAELID(q.Get("tenant_id"))
	limit := 50
	if l := q.Get("limit"); l != "" {
		var n int
		if _, err := fmt.Sscanf(l, "%d", &n); err == nil && n > 0 {
			limit = n
		}
	}
	steps, err := h.svc.PendingSteps(r.Context(), tenantID, limit)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	items := make([]contracts.StepDTO, 0, len(steps))
	for i := range steps {
		items = append(items, stepToDTO(&steps[i], nil))
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": items, "total": len(items)})
}

// --- helpers ---

func stepToDTO(s *ael.Step, sideEffects []contracts.SideEffectDTO) contracts.StepDTO {
	return contracts.StepDTO{
		ID:            s.ID,
		FlowID:        s.FlowID,
		RunID:         s.RunID,
		TenantID:      s.TenantID,
		State:         string(s.State),
		Regime:        string(s.Regime),
		WorkloadClass: s.WorkloadClass,
		AgentType:     s.AgentType,
		Provider:      s.Provider,
		TokensUsed:    s.TokensUsed,
		CostUSD:       s.CostUSD,
		DurationMS:    s.DurationMS,
		FailureReason: s.FailureReason,
		Version:       s.Version,
		CreatedAt:     s.CreatedAt.Format(time.RFC3339),
		UpdatedAt:     s.UpdatedAt.Format(time.RFC3339),
		SideEffects:   sideEffects,
	}
}

func sideEffectToDTO(se *ael.SideEffect) contracts.SideEffectDTO {
	dto := contracts.SideEffectDTO{
		ID:               se.ID,
		StepID:           se.StepID,
		RunID:            se.RunID,
		TenantID:         se.TenantID,
		Seq:              se.Seq,
		TargetSystem:     se.TargetSystem,
		OperationType:    se.OperationType,
		IdempotencyClass: string(se.IdempotencyClass),
		IdempotencyKey:   se.IdempotencyKey,
		State:            string(se.State),
		PolicyOutcome:    se.PolicyOutcome,
		CreatedAt:        se.CreatedAt.Format(time.RFC3339),
	}
	if se.ExecutedAt != nil {
		dto.ExecutedAt = se.ExecutedAt.Format(time.RFC3339)
	}
	return dto
}
