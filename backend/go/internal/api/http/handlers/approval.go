package handlers

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"sync"
	"time"

	"open-kraken/backend/go/internal/authz"
	"open-kraken/backend/go/internal/ledger"
)

type ApprovalHandler struct {
	mu         sync.Mutex
	ledgerSvc  *ledger.Service
	pathPrefix string
	items      map[string]approvalRecord
}

type approvalRecord struct {
	ID              string         `json:"id"`
	Type            string         `json:"type"`
	Status          string         `json:"status"`
	Risk            string         `json:"risk"`
	Requester       string         `json:"requester"`
	RequesterTeam   string         `json:"requesterTeam"`
	RequestedAt     string         `json:"requestedAt"`
	ExpiresAt       string         `json:"expiresAt"`
	Title           string         `json:"title"`
	Description     string         `json:"description"`
	Context         map[string]any `json:"context"`
	ApprovedBy      string         `json:"approvedBy,omitempty"`
	ApprovedAt      string         `json:"approvedAt,omitempty"`
	RejectedBy      string         `json:"rejectedBy,omitempty"`
	RejectedAt      string         `json:"rejectedAt,omitempty"`
	RejectionReason string         `json:"rejectionReason,omitempty"`
}

func NewApprovalHandler(ledgerSvc *ledger.Service, pathPrefix string) *ApprovalHandler {
	items := defaultApprovalRecords()
	return &ApprovalHandler{ledgerSvc: ledgerSvc, pathPrefix: strings.TrimRight(pathPrefix, "/"), items: items}
}

func (h *ApprovalHandler) Handle(w http.ResponseWriter, r *http.Request) {
	path := strings.Trim(strings.TrimPrefix(r.URL.Path, h.pathPrefix), "/")
	if path == "" && r.Method == http.MethodGet {
		h.handleList(w, r)
		return
	}
	parts := strings.Split(path, "/")
	if len(parts) == 2 && parts[1] == "decision" && r.Method == http.MethodPost {
		h.handleDecision(w, r, parts[0])
		return
	}
	w.WriteHeader(http.StatusNotFound)
}

func (h *ApprovalHandler) handleList(w http.ResponseWriter, _ *http.Request) {
	h.mu.Lock()
	defer h.mu.Unlock()
	items := make([]approvalRecord, 0, len(h.items))
	for _, item := range h.items {
		items = append(items, item)
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": items})
}

func (h *ApprovalHandler) handleDecision(w http.ResponseWriter, r *http.Request, approvalID string) {
	authCtx, err := authContextFromRequest(r, authz.ActionApprovalDecide)
	if err != nil {
		writeAuthzError(w, err)
		return
	}
	if err := authz.NewService().Enforce(authCtx); err != nil {
		writeAuthzError(w, err)
		return
	}
	var body struct {
		Decision     string `json:"decision"`
		Confirmed    bool   `json:"confirmed"`
		Confirmation string `json:"confirmation"`
		Reason       string `json:"reason"`
	}
	if !decodeJSON(r, &body, w) {
		return
	}
	decision := strings.ToLower(strings.TrimSpace(body.Decision))
	if decision != "approve" && decision != "reject" {
		writeError(w, http.StatusBadRequest, errors.New("decision must be approve or reject"))
		return
	}
	if !body.Confirmed {
		writeError(w, http.StatusBadRequest, errors.New("decision requires explicit confirmation"))
		return
	}

	h.mu.Lock()
	defer h.mu.Unlock()
	item, ok := h.items[approvalID]
	if !ok {
		w.WriteHeader(http.StatusNotFound)
		return
	}
	if item.Status != "pending" {
		writeError(w, http.StatusConflict, errors.New("approval is no longer pending"))
		return
	}
	expectedPhrase := strings.ToUpper(decision) + " " + item.ID
	if item.Risk == "high" && strings.TrimSpace(body.Confirmation) != expectedPhrase {
		_ = h.recordApprovalAudit(r, authCtx.Actor, item, "approval.confirmation_failed", "High-risk approval blocked before execution", map[string]any{
			"decision":       decision,
			"expectedPhrase": expectedPhrase,
		})
		writeError(w, http.StatusBadRequest, errors.New("high-risk approval requires the exact confirmation phrase"))
		return
	}

	now := time.Now().UTC().Format(time.RFC3339)
	if decision == "approve" {
		item.Status = "approved"
		item.ApprovedBy = authCtx.Actor.MemberID
		item.ApprovedAt = now
	} else {
		item.Status = "rejected"
		item.RejectedBy = authCtx.Actor.MemberID
		item.RejectedAt = now
		item.RejectionReason = strings.TrimSpace(body.Reason)
	}
	if err := h.recordApprovalAudit(r, authCtx.Actor, item, "approval."+item.Status, "Approval "+item.Status+": "+item.Title, map[string]any{
		"decision":             decision,
		"reason":               strings.TrimSpace(body.Reason),
		"confirmationRequired": item.Risk == "high",
	}); err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	h.items[item.ID] = item
	writeJSON(w, http.StatusOK, map[string]any{"approval": item})
}

func (h *ApprovalHandler) recordApprovalAudit(r *http.Request, actor authz.Principal, item approvalRecord, eventType, summary string, extra map[string]any) error {
	if h.ledgerSvc == nil {
		return errors.New("approval audit ledger is not configured")
	}
	ctx := map[string]any{
		"approvalId": item.ID,
		"type":       item.Type,
		"risk":       item.Risk,
		"status":     item.Status,
		"title":      item.Title,
		"context":    item.Context,
	}
	for k, v := range extra {
		ctx[k] = v
	}
	raw, err := json.Marshal(ctx)
	if err != nil {
		return err
	}
	_, err = h.ledgerSvc.Record(r.Context(), ledger.LedgerEvent{
		WorkspaceID: actor.WorkspaceID,
		MemberID:    actor.MemberID,
		EventType:   eventType,
		Summary:     summary,
		ContextJSON: string(raw),
	})
	return err
}

func defaultApprovalRecords() map[string]approvalRecord {
	records := []approvalRecord{
		{ID: "appr_001", Type: "deploy", Status: "pending", Risk: "high", Requester: "Claude BE", RequesterTeam: "Backend Squad", RequestedAt: "5 min ago", ExpiresAt: "in 25 min", Title: "Deploy to production", Description: "Deploy backend-api v2.1.4 to production cluster", Context: map[string]any{"agent": "Claude BE", "task": "task_142", "command": "kubectl apply -f deploy/prod.yaml"}},
		{ID: "appr_002", Type: "git_push", Status: "pending", Risk: "medium", Requester: "Gemini FE", RequesterTeam: "Frontend Squad", RequestedAt: "12 min ago", ExpiresAt: "in 18 min", Title: "Push to main branch", Description: "Push dashboard redesign commits to main branch", Context: map[string]any{"agent": "Gemini FE", "task": "task_143", "command": "git push origin main", "file": "12 files changed, 384 insertions(+), 127 deletions(-)"}},
		{ID: "appr_003", Type: "secret_access", Status: "pending", Risk: "high", Requester: "Codex DevOps", RequesterTeam: "Workspace Team", RequestedAt: "18 min ago", ExpiresAt: "in 12 min", Title: "Access AWS credentials", Description: "Access production AWS credentials for deployment", Context: map[string]any{"agent": "Codex DevOps", "task": "task_144", "command": "Required for S3 deployment"}},
		{ID: "appr_004", Type: "file_write", Status: "approved", Risk: "medium", Requester: "Qwen API", RequesterTeam: "Backend Squad", RequestedAt: "1h ago", ExpiresAt: "-", Title: "Modify config file", Description: "Update database connection pool configuration", Context: map[string]any{"agent": "Qwen API", "task": "task_140", "file": "config/database.yaml"}, ApprovedBy: "Alex", ApprovedAt: "45 min ago"},
		{ID: "appr_005", Type: "budget", Status: "rejected", Risk: "low", Requester: "Claude Code", RequesterTeam: "Backend Squad", RequestedAt: "2h ago", ExpiresAt: "-", Title: "Exceed budget limit", Description: "Request to exceed $50 daily token budget", Context: map[string]any{"agent": "Claude Code", "amount": 62.5}, RejectedBy: "Alex", RejectedAt: "1h ago", RejectionReason: "Budget exceeded without justification"},
	}
	out := make(map[string]approvalRecord, len(records))
	for _, record := range records {
		out[record.ID] = record
	}
	return out
}
