package handlers

import (
	"errors"
	"net/http"
	"strings"
	"time"

	"open-kraken/backend/go/internal/taskqueue"
)

// TaskQueueHandler serves task queue API endpoints.
type TaskQueueHandler struct {
	svc        *taskqueue.Service
	pathPrefix string // e.g. "/api/v1/queue"
}

// NewTaskQueueHandler creates a TaskQueueHandler.
func NewTaskQueueHandler(svc *taskqueue.Service, pathPrefix string) *TaskQueueHandler {
	return &TaskQueueHandler{svc: svc, pathPrefix: strings.TrimRight(pathPrefix, "/")}
}

// Handle dispatches /queue, /queue/tasks, /queue/tasks/{id}, /queue/claim, /queue/stats.
func (h *TaskQueueHandler) Handle(w http.ResponseWriter, r *http.Request) {
	sub := strings.TrimPrefix(r.URL.Path, h.pathPrefix)
	sub = strings.TrimPrefix(sub, "/")

	switch {
	case sub == "tasks" || sub == "":
		h.handleTasks(w, r)
	case sub == "claim":
		h.handleClaim(w, r)
	case sub == "stats":
		h.handleStats(w, r)
	case strings.HasPrefix(sub, "tasks/"):
		taskID := strings.TrimPrefix(sub, "tasks/")
		parts := strings.SplitN(taskID, "/", 2)
		if len(parts) == 2 {
			h.handleTaskAction(w, r, parts[0], parts[1])
		} else {
			h.handleTaskByID(w, r, parts[0])
		}
	default:
		w.WriteHeader(http.StatusNotFound)
	}
}

func (h *TaskQueueHandler) handleTasks(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		q := taskqueue.Query{
			WorkspaceID: r.URL.Query().Get("workspaceId"),
			Status:      taskqueue.TaskStatus(r.URL.Query().Get("status")),
			QueueName:   r.URL.Query().Get("queue"),
			NodeID:      r.URL.Query().Get("nodeId"),
			Type:        r.URL.Query().Get("type"),
		}
		tasks, err := h.svc.List(r.Context(), q)
		if err != nil {
			writeError(w, http.StatusInternalServerError, err)
			return
		}
		if tasks == nil {
			tasks = []taskqueue.Task{}
		}
		writeJSON(w, http.StatusOK, map[string]any{"items": marshalTasks(tasks)})

	case http.MethodPost:
		var body struct {
			IdempotencyKey string `json:"idempotencyKey"`
			WorkspaceID    string `json:"workspaceId"`
			Type           string `json:"type"`
			Payload        string `json:"payload"`
			Priority       int    `json:"priority"`
			QueueName      string `json:"queue"`
			MaxAttempts    int    `json:"maxAttempts"`
			TimeoutMs      int64  `json:"timeoutMs"`
		}
		if !decodeJSON(r, &body, w) {
			return
		}
		t := taskqueue.Task{
			IdempotencyKey: body.IdempotencyKey,
			WorkspaceID:    body.WorkspaceID,
			Type:           body.Type,
			Payload:        body.Payload,
			Priority:       taskqueue.Priority(body.Priority),
			QueueName:      body.QueueName,
			MaxAttempts:    body.MaxAttempts,
			Timeout:        time.Duration(body.TimeoutMs) * time.Millisecond,
		}
		created, err := h.svc.Enqueue(r.Context(), t)
		if err != nil {
			writeError(w, http.StatusBadRequest, err)
			return
		}
		writeJSON(w, http.StatusCreated, map[string]any{"task": marshalTask(created)})

	default:
		w.WriteHeader(http.StatusMethodNotAllowed)
	}
}

func (h *TaskQueueHandler) handleTaskByID(w http.ResponseWriter, r *http.Request, id string) {
	switch r.Method {
	case http.MethodGet:
		t, err := h.svc.Get(r.Context(), id)
		if err != nil {
			writeTaskError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, marshalTask(t))

	case http.MethodDelete:
		t, err := h.svc.Cancel(r.Context(), id)
		if err != nil {
			writeTaskError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, marshalTask(t))

	default:
		w.WriteHeader(http.StatusMethodNotAllowed)
	}
}

// handleTaskAction handles /queue/tasks/{id}/{action} (claim, start, ack, nack).
func (h *TaskQueueHandler) handleTaskAction(w http.ResponseWriter, r *http.Request, id, action string) {
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	var body struct {
		NodeID  string `json:"nodeId"`
		AgentID string `json:"agentId"`
		Result  string `json:"result"`
		Error   string `json:"error"`
	}
	if !decodeJSON(r, &body, w) {
		return
	}

	ctx := r.Context()
	var t taskqueue.Task
	var err error

	switch action {
	case "claim":
		t, err = h.svc.ClaimByID(ctx, id, body.NodeID, body.AgentID)
	case "start":
		t, err = h.svc.Start(ctx, id, body.NodeID)
	case "ack":
		t, err = h.svc.Ack(ctx, id, body.NodeID, body.Result)
	case "nack":
		t, err = h.svc.Nack(ctx, id, body.NodeID, body.Error)
	default:
		w.WriteHeader(http.StatusNotFound)
		return
	}

	if err != nil {
		writeTaskError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, marshalTask(t))
}

func (h *TaskQueueHandler) handleClaim(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	var body struct {
		QueueName string `json:"queue"`
		NodeID    string `json:"nodeId"`
	}
	if !decodeJSON(r, &body, w) {
		return
	}
	t, err := h.svc.Claim(r.Context(), body.QueueName, body.NodeID)
	if err != nil {
		writeTaskError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, marshalTask(t))
}

func (h *TaskQueueHandler) handleStats(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	stats, err := h.svc.Stats(r.Context(), r.URL.Query().Get("workspaceId"))
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusOK, stats)
}

func marshalTask(t taskqueue.Task) map[string]any {
	m := map[string]any{
		"id":             t.ID,
		"idempotencyKey": t.IdempotencyKey,
		"workspaceId":    t.WorkspaceID,
		"type":           t.Type,
		"payload":        t.Payload,
		"priority":       int(t.Priority),
		"status":         string(t.Status),
		"nodeId":         t.NodeID,
		"agentId":        t.AgentID,
		"queue":          t.QueueName,
		"attempts":       t.Attempts,
		"maxAttempts":    t.MaxAttempts,
		"lastError":      t.LastError,
		"result":         t.Result,
		"timeoutMs":      t.Timeout.Milliseconds(),
		"createdAt":      t.CreatedAt.UnixMilli(),
		"updatedAt":      t.UpdatedAt.UnixMilli(),
	}
	if !t.ClaimedAt.IsZero() {
		m["claimedAt"] = t.ClaimedAt.UnixMilli()
	}
	if !t.StartedAt.IsZero() {
		m["startedAt"] = t.StartedAt.UnixMilli()
	}
	if !t.CompletedAt.IsZero() {
		m["completedAt"] = t.CompletedAt.UnixMilli()
	}
	return m
}

func marshalTasks(tasks []taskqueue.Task) []map[string]any {
	out := make([]map[string]any, 0, len(tasks))
	for _, t := range tasks {
		out = append(out, marshalTask(t))
	}
	return out
}

func writeTaskError(w http.ResponseWriter, err error) {
	switch err {
	case nil:
		return
	}
	switch {
	case errors.Is(err, taskqueue.ErrNotFound):
		writeError(w, http.StatusNotFound, err)
	case errors.Is(err, taskqueue.ErrInvalidTransition), errors.Is(err, taskqueue.ErrAlreadyClaimed), errors.Is(err, taskqueue.ErrNoAvailableAgent):
		writeError(w, http.StatusConflict, err)
	case errors.Is(err, taskqueue.ErrAlreadyExists):
		writeError(w, http.StatusConflict, err)
	default:
		writeError(w, http.StatusBadRequest, err)
	}
}
