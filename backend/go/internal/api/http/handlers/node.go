// Package handlers contains HTTP request handlers for the open-kraken API.
package handlers

import (
	"net/http"
	"strings"

	"open-kraken/backend/go/internal/node"
)

// NodeHandler handles HTTP requests for the node registry API.
type NodeHandler struct {
	svc        *node.Service
	pathPrefix string // e.g. /api/v1/nodes
}

// NewNodeHandler creates a NodeHandler backed by the given service.
func NewNodeHandler(svc *node.Service, pathPrefix string) *NodeHandler {
	return &NodeHandler{svc: svc, pathPrefix: pathPrefix}
}

// Handle routes all node-registry requests under pathPrefix.
func (h *NodeHandler) Handle(w http.ResponseWriter, r *http.Request) {
	// Strip prefix and split path into segments.
	path := strings.TrimPrefix(r.URL.Path, h.pathPrefix)
	path = strings.Trim(path, "/")
	parts := []string{}
	if path != "" {
		parts = strings.Split(path, "/")
	}

	switch {
	case len(parts) == 0 && r.Method == http.MethodGet:
		// GET {pathPrefix}
		h.handleList(w, r)
	case len(parts) == 1 && parts[0] == "register" && r.Method == http.MethodPost:
		// POST …/register
		h.handleRegister(w, r)
	case len(parts) == 1 && r.Method == http.MethodGet:
		// GET …/{id}
		h.handleGetByID(w, r, parts[0])
	case len(parts) == 1 && r.Method == http.MethodDelete:
		// DELETE …/{id}
		h.handleDelete(w, r, parts[0])
	case len(parts) == 2 && parts[1] == "heartbeat" && r.Method == http.MethodPost:
		// POST …/{id}/heartbeat
		h.handleHeartbeat(w, r, parts[0])
	case len(parts) == 2 && parts[1] == "agents" && r.Method == http.MethodPost:
		// POST …/{id}/agents
		h.handleAssignAgent(w, r, parts[0])
	case len(parts) == 3 && parts[1] == "agents" && r.Method == http.MethodDelete:
		// DELETE …/{id}/agents/{agentId}
		h.handleRemoveAgent(w, r, parts[0], parts[2])
	default:
		w.WriteHeader(http.StatusNotFound)
	}
}

func (h *NodeHandler) handleRegister(w http.ResponseWriter, r *http.Request) {
	var body struct {
		ID          string            `json:"id"`
		Hostname    string            `json:"hostname"`
		NodeType    string            `json:"nodeType"`
		Type        string            `json:"type"`
		Labels      map[string]string `json:"labels"`
		WorkspaceID string            `json:"workspaceId"`
		MaxAgents   int               `json:"maxAgents"`
		Capacity    struct {
			MaxAgents int `json:"maxAgents"`
		} `json:"capacity"`
	}
	if !decodeJSON(r, &body, w) {
		return
	}
	// Allow workspaceId override via request header; body value takes precedence.
	workspaceID := body.WorkspaceID
	if workspaceID == "" {
		workspaceID = r.Header.Get("X-Kraken-Workspace-Id")
	}
	if workspaceID == "" {
		workspaceID = r.Header.Get("X-Workspace-Id")
	}
	if workspaceID == "" {
		workspaceID = r.Header.Get(headerWorkspaceID)
	}
	if workspaceID == "" {
		workspaceID = "ws_open_kraken"
	}
	nodeType := body.NodeType
	if nodeType == "" {
		nodeType = body.Type
	}
	maxAgents := body.MaxAgents
	if maxAgents == 0 {
		maxAgents = body.Capacity.MaxAgents
	}
	n := node.Node{
		ID:          body.ID,
		Hostname:    body.Hostname,
		NodeType:    node.NodeType(nodeType),
		Labels:      body.Labels,
		WorkspaceID: workspaceID,
		MaxAgents:   maxAgents,
	}
	registered, err := h.svc.Register(r.Context(), n)
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	writeJSON(w, http.StatusCreated, toNodeResponse(registered))
}

func (h *NodeHandler) handleDelete(w http.ResponseWriter, r *http.Request, id string) {
	if err := h.svc.Deregister(r.Context(), id); err != nil {
		writeNodeError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *NodeHandler) handleHeartbeat(w http.ResponseWriter, r *http.Request, id string) {
	n, err := h.svc.Heartbeat(r.Context(), id)
	if err != nil {
		writeNodeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, toNodeResponse(n))
}

func (h *NodeHandler) handleList(w http.ResponseWriter, r *http.Request) {
	nodes, err := h.svc.List(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	items := make([]map[string]any, 0, len(nodes))
	for _, n := range nodes {
		items = append(items, toNodeResponse(n))
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": items})
}

func (h *NodeHandler) handleGetByID(w http.ResponseWriter, r *http.Request, id string) {
	n, err := h.svc.GetByID(r.Context(), id)
	if err != nil {
		writeNodeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, toNodeResponse(n))
}

func (h *NodeHandler) handleAssignAgent(w http.ResponseWriter, r *http.Request, nodeID string) {
	var body struct {
		AgentID  string `json:"agentId"`
		MemberID string `json:"memberId"`
	}
	if !decodeJSON(r, &body, w) {
		return
	}
	agentID := body.AgentID
	if agentID == "" {
		agentID = body.MemberID
	}
	n, err := h.svc.AssignAgent(r.Context(), nodeID, agentID)
	if err != nil {
		writeNodeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, toNodeResponse(n))
}

func (h *NodeHandler) handleRemoveAgent(w http.ResponseWriter, r *http.Request, nodeID, agentID string) {
	n, err := h.svc.RemoveAgent(r.Context(), nodeID, agentID)
	if err != nil {
		writeNodeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, toNodeResponse(n))
}

func toNodeResponse(n node.Node) map[string]any {
	return map[string]any{
		"id":         n.ID,
		"hostname":   n.Hostname,
		"nodeType":   string(n.NodeType),
		"type":       string(n.NodeType),
		"status":     string(n.Status),
		"labels":     n.Labels,
		"maxAgents":  n.MaxAgents,
		"agentCount": n.AgentCount(),
		"agents":     n.Agents,
		"agentIds":   n.Agents,
		"capacity": map[string]any{
			"maxAgents": n.MaxAgents,
		},
		"workspaceId":     n.WorkspaceID,
		"registeredAt":    n.RegisteredAt,
		"lastHeartbeatAt": n.LastHeartbeatAt,
	}
}

func writeNodeError(w http.ResponseWriter, err error) {
	if isNotFound(err) {
		writeError(w, http.StatusNotFound, err)
		return
	}
	if strings.Contains(err.Error(), "agent already assigned") {
		writeError(w, http.StatusConflict, err)
		return
	}
	if strings.Contains(err.Error(), "maximum agent capacity reached") {
		writeError(w, http.StatusUnprocessableEntity, err)
		return
	}
	writeError(w, http.StatusBadRequest, err)
}

// isNotFound detects ErrNotFound from node, memory, and tokentrack packages
// using string matching to avoid circular imports.
func isNotFound(err error) bool {
	if err == nil {
		return false
	}
	return strings.Contains(err.Error(), "not found")
}
