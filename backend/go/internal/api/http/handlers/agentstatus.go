package handlers

import (
	"net/http"
	"time"

	"open-kraken/backend/go/internal/node"
	"open-kraken/backend/go/internal/presence"
	"open-kraken/backend/go/internal/runtime/instance"
	"open-kraken/backend/go/internal/taskqueue"
	"open-kraken/backend/go/internal/terminal"
	"open-kraken/backend/go/internal/tokentrack"
)

// AgentStatusHandler aggregates presence, terminal, token, node, and task data
// into a single per-agent view.
type AgentStatusHandler struct {
	termSvc     *terminal.Service
	nodeSvc     *node.Service
	presenceSvc *presence.Service
	tokenSvc    *tokentrack.Service
	taskSvc     *taskqueue.Service
	instanceMgr *instance.Manager
}

// NewAgentStatusHandler creates an AgentStatusHandler.
func NewAgentStatusHandler(
	termSvc *terminal.Service,
	nodeSvc *node.Service,
	presenceSvc *presence.Service,
	tokenSvc *tokentrack.Service,
	taskSvc *taskqueue.Service,
	instanceMgr *instance.Manager,
) *AgentStatusHandler {
	return &AgentStatusHandler{
		termSvc:     termSvc,
		nodeSvc:     nodeSvc,
		presenceSvc: presenceSvc,
		tokenSvc:    tokenSvc,
		taskSvc:     taskSvc,
		instanceMgr: instanceMgr,
	}
}

// HandleList returns GET /api/v1/agents/status — a unified view of all agents.
func (h *AgentStatusHandler) HandleList(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}

	ctx := r.Context()
	workspaceID := r.URL.Query().Get("workspaceId")

	agents := make([]map[string]any, 0)

	// Gather node → agent mapping.
	nodeAgentMap := map[string]string{} // agentID → nodeID
	nodeHostMap := map[string]string{}  // agentID → hostname
	if h.nodeSvc != nil {
		nodes, err := h.nodeSvc.List(ctx)
		if err == nil {
			for _, n := range nodes {
				for _, agentID := range n.Agents {
					nodeAgentMap[agentID] = n.ID
					nodeHostMap[agentID] = n.Hostname
				}
				// Legacy label fallback.
				if aid, ok := n.Labels["agent_id"]; ok && aid != "" {
					if _, exists := nodeAgentMap[aid]; !exists {
						nodeAgentMap[aid] = n.ID
						nodeHostMap[aid] = n.Hostname
					}
				}
			}
		}
	}

	// Gather presence data.
	presenceMap := map[string]presence.MemberPresence{}
	if h.presenceSvc != nil {
		online := h.presenceSvc.ListOnline(workspaceID)
		for _, m := range online {
			presenceMap[m.MemberID] = m
		}
	}

	// Gather terminal sessions.
	sessionMap := map[string]map[string]any{}
	if h.termSvc != nil {
		sessions := h.termSvc.ListSessions(workspaceID)
		for _, s := range sessions {
			sessionMap[s.MemberID] = map[string]any{
				"terminalId": s.SessionID,
				"status":     string(s.Status),
				"command":    s.Command,
			}
		}
	}

	// Gather active task counts per agent.
	taskCounts := map[string]int{}
	if h.taskSvc != nil {
		tasks, err := h.taskSvc.List(ctx, taskqueue.Query{
			WorkspaceID: workspaceID,
			Status:      taskqueue.TaskStatusRunning,
			Limit:       200,
		})
		if err == nil {
			for _, t := range tasks {
				taskCounts[t.AgentID]++
			}
		}
	}

	instanceMap := map[string]map[string]any{}
	if h.instanceMgr != nil {
		for _, inst := range h.instanceMgr.Snapshot() {
			ctx := inst.SnapshotContext()
			agentID, _ := ctx["memberId"].(string)
			if agentID == "" {
				continue
			}
			instanceMap[agentID] = map[string]any{
				"agentInstanceId": inst.ID(),
				"runtimeState":    string(inst.State()),
				"agentType":       inst.AgentType(),
				"provider":        inst.Provider(),
				"runtimeReady":    instance.IsIdleOrScheduled(inst.State()),
				"lastActive":      inst.LastActive().Format(time.RFC3339),
			}
		}
	}

	// Collect all known agent/member IDs from all sources.
	allIDs := map[string]bool{}
	for id := range nodeAgentMap {
		allIDs[id] = true
	}
	for id := range presenceMap {
		allIDs[id] = true
	}
	for id := range sessionMap {
		allIDs[id] = true
	}
	for id := range taskCounts {
		allIDs[id] = true
	}
	for id := range instanceMap {
		allIDs[id] = true
	}

	for id := range allIDs {
		entry := map[string]any{
			"agentId":      id,
			"nodeId":       nodeAgentMap[id],
			"nodeHostname": nodeHostMap[id],
		}

		// Presence.
		if p, ok := presenceMap[id]; ok {
			entry["presence"] = map[string]any{
				"status":        string(p.EffectiveStatus()),
				"lastHeartbeat": p.LastHeartbeat.Format(time.RFC3339),
			}
		} else {
			entry["presence"] = map[string]any{"status": "offline"}
		}

		// Terminal.
		if s, ok := sessionMap[id]; ok {
			entry["terminal"] = s
		}

		// Token stats.
		if h.tokenSvc != nil {
			stats, err := h.tokenSvc.GetStats(ctx, tokentrack.StatsQuery{MemberID: id})
			if err == nil {
				entry["tokens"] = map[string]any{
					"totalInput":  stats.InputTokens,
					"totalOutput": stats.OutputTokens,
					"totalCost":   stats.TotalCost,
				}
			}
		}

		// Active tasks.
		entry["activeTasks"] = taskCounts[id]
		if runtime, ok := instanceMap[id]; ok {
			for k, v := range runtime {
				entry[k] = v
			}
		}

		agents = append(agents, entry)
	}

	writeJSON(w, http.StatusOK, map[string]any{"agents": agents})
}

// handleAgentByID returns status for a single agent.
func (h *AgentStatusHandler) HandleByID(w http.ResponseWriter, r *http.Request, agentID string) {
	if r.Method != http.MethodGet {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}

	ctx := r.Context()
	entry := map[string]any{"agentId": agentID}

	// Node assignment.
	if h.nodeSvc != nil {
		nodes, _ := h.nodeSvc.List(ctx)
		for _, n := range nodes {
			if n.HasAgent(agentID) || n.Labels["agent_id"] == agentID {
				entry["nodeId"] = n.ID
				entry["nodeHostname"] = n.Hostname
				break
			}
		}
	}

	// Presence.
	if h.presenceSvc != nil {
		workspaceIDForPresence := r.URL.Query().Get("workspaceId")
		if p, ok := h.presenceSvc.GetPresence(workspaceIDForPresence, agentID); ok {
			entry["presence"] = map[string]any{
				"status":        string(p.EffectiveStatus()),
				"lastHeartbeat": p.LastHeartbeat.Format(time.RFC3339),
			}
		} else {
			entry["presence"] = map[string]any{"status": "offline"}
		}
	}

	// Terminal.
	if h.termSvc != nil {
		workspaceID := r.URL.Query().Get("workspaceId")
		sessions := h.termSvc.ListSessions(workspaceID)
		for _, s := range sessions {
			if s.MemberID == agentID {
				entry["terminal"] = map[string]any{
					"terminalId": s.SessionID,
					"status":     string(s.Status),
					"command":    s.Command,
				}
				break
			}
		}
	}

	// Tokens.
	if h.tokenSvc != nil {
		stats, err := h.tokenSvc.GetStats(ctx, tokentrack.StatsQuery{MemberID: agentID})
		if err == nil {
			entry["tokens"] = map[string]any{
				"totalInput":  stats.InputTokens,
				"totalOutput": stats.OutputTokens,
				"totalCost":   stats.TotalCost,
			}
		}
	}

	// Active tasks.
	if h.taskSvc != nil {
		tasks, err := h.taskSvc.List(r.Context(), taskqueue.Query{Status: taskqueue.TaskStatusRunning, Limit: 200})
		if err == nil {
			count := 0
			for _, t := range tasks {
				if t.AgentID == agentID {
					count++
				}
			}
			entry["activeTasks"] = count
		}
	}

	if h.instanceMgr != nil {
		for _, inst := range h.instanceMgr.Snapshot() {
			ctx := inst.SnapshotContext()
			if memberID, _ := ctx["memberId"].(string); memberID == agentID {
				entry["agentInstanceId"] = inst.ID()
				entry["runtimeState"] = string(inst.State())
				entry["agentType"] = inst.AgentType()
				entry["provider"] = inst.Provider()
				entry["runtimeReady"] = instance.IsIdleOrScheduled(inst.State())
				entry["lastActive"] = inst.LastActive().Format(time.RFC3339)
				break
			}
		}
	}

	writeJSON(w, http.StatusOK, entry)
}
