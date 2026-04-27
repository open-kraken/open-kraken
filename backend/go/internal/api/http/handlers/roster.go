package handlers

import (
	"errors"
	"net/http"
	"strings"
	"time"

	"open-kraken/backend/go/internal/authn"
	"open-kraken/backend/go/internal/authz"
	"open-kraken/backend/go/internal/node"
	"open-kraken/backend/go/internal/realtime"
	"open-kraken/backend/go/internal/roster"
	"open-kraken/backend/go/internal/settings"
)

var errAgentRuntimeUnavailable = errors.New("agent runtime is not configured")

func teamsFromFixtureTeams(rows []teamFixtureRow) []roster.Team {
	out := make([]roster.Team, 0, len(rows))
	for _, row := range rows {
		ids := make([]string, 0, len(row.Members))
		for _, m := range row.Members {
			ids = append(ids, asString(m["memberId"]))
		}
		out = append(out, roster.Team{TeamID: row.TeamID, Name: row.Name, MemberIDs: ids})
	}
	return out
}

func (h *WorkspaceHandler) ensureDefaultTeam() {
	if len(h.teams) > 0 {
		return
	}
	ids := make([]string, 0, len(h.state.Members.Members))
	for _, m := range h.state.Members.Members {
		ids = append(ids, asString(m["memberId"]))
	}
	if len(ids) == 0 {
		return
	}
	h.teams = []roster.Team{{TeamID: "team_default", Name: "Workspace team", MemberIDs: ids}}
}

func (h *WorkspaceHandler) initRosterFromDisk() {
	if h.workspaceRoot == "" {
		return
	}
	doc, found, err := roster.Read(h.workspaceRoot)
	if err != nil || !found {
		if err == nil && !found {
			_ = h.persistRosterLocked()
		}
		return
	}
	h.state.Members.Members = doc.Members
	h.teams = doc.Teams
	h.ensureDefaultTeam()
	h.rosterVersion = doc.Meta.Version
	if h.rosterVersion < 1 {
		h.rosterVersion = 1
	}
}

func (h *WorkspaceHandler) membersWithTerminalStatusLocked() []map[string]any {
	members := make([]map[string]any, 0, len(h.state.Members.Members))
	statusBySession := map[string]string{}
	if h.service != nil {
		for _, info := range h.service.ListSessions(h.state.Workspace.ID) {
			statusBySession[info.SessionID] = string(info.Status)
		}
	}
	for _, member := range h.state.Members.Members {
		row := cloneMap(member)
		if terminalID := strings.TrimSpace(asString(row["terminalId"])); terminalID != "" {
			if status := statusBySession[terminalID]; status != "" {
				row["terminalStatus"] = status
			}
		}
		members = append(members, row)
	}
	return members
}

func (h *WorkspaceHandler) membersAndTeamsPayload() map[string]any {
	members := h.membersWithTerminalStatusLocked()
	return map[string]any{
		"members": members,
		"teams":   h.expandTeamsResponse(members),
		"meta": map[string]any{
			"version":     h.rosterVersion,
			"workspaceId": h.state.Workspace.ID,
			"storage":     "workspace",
		},
	}
}

func (h *WorkspaceHandler) MemberCanUseSkills(memberID string) bool {
	memberID = strings.TrimSpace(memberID)
	if memberID == "" {
		return false
	}
	h.mu.RLock()
	defer h.mu.RUnlock()
	for _, member := range h.state.Members.Members {
		if asString(member["memberId"]) != memberID {
			continue
		}
		roleType := strings.TrimSpace(asString(member["roleType"]))
		return roleType == "assistant" ||
			strings.TrimSpace(asString(member["agentInstanceId"])) != "" ||
			strings.TrimSpace(asString(member["agentRuntimeState"])) != "" ||
			asBool(member["runtimeReady"])
	}
	return false
}

func (h *WorkspaceHandler) expandTeamsResponse(sourceMembers []map[string]any) []map[string]any {
	byID := map[string]map[string]any{}
	for _, m := range sourceMembers {
		id := asString(m["memberId"])
		if id != "" {
			byID[id] = cloneMap(m)
		}
	}
	out := make([]map[string]any, 0, len(h.teams))
	for _, t := range h.teams {
		members := make([]map[string]any, 0, len(t.MemberIDs))
		for _, id := range t.MemberIDs {
			if row, ok := byID[id]; ok {
				members = append(members, row)
			}
		}
		out = append(out, map[string]any{
			"teamId":  t.TeamID,
			"name":    t.Name,
			"members": members,
		})
	}
	return out
}

func (h *WorkspaceHandler) persistRosterLocked() error {
	if h.workspaceRoot == "" {
		return nil
	}
	h.rosterVersion++
	doc := roster.Document{
		Meta: roster.Meta{
			WorkspaceID: h.state.Workspace.ID,
			Version:     h.rosterVersion,
			UpdatedAt:   time.Now().UTC(),
			Storage:     "workspace",
		},
		Members: append([]map[string]any(nil), h.state.Members.Members...),
		Teams:   append([]roster.Team(nil), h.teams...),
	}
	return roster.Write(h.workspaceRoot, doc)
}

func (h *WorkspaceHandler) enforceMemberManage(w http.ResponseWriter, r *http.Request) bool {
	ctx, err := authContextFromRequest(r, authz.ActionMemberManage)
	if err != nil {
		writeAuthzError(w, err)
		return false
	}
	if err := h.authorizer.Enforce(ctx); err != nil {
		writeAuthzError(w, err)
		return false
	}
	return true
}

func (h *WorkspaceHandler) HandleMembers(w http.ResponseWriter, r *http.Request, workspaceID string, parts []string) {
	if workspaceID != h.state.Workspace.ID {
		w.WriteHeader(http.StatusNotFound)
		return
	}
	if len(parts) == 0 {
		switch r.Method {
		case http.MethodGet:
			h.mu.RLock()
			defer h.mu.RUnlock()
			writeJSON(w, http.StatusOK, h.membersAndTeamsPayload())
		case http.MethodPost:
			if !h.enforceMemberManage(w, r) {
				return
			}
			var body map[string]any
			if !decodeJSON(r, &body, w) {
				return
			}
			memberID := strings.TrimSpace(asString(body["memberId"]))
			if memberID == "" {
				writeJSON(w, http.StatusBadRequest, map[string]any{"message": "memberId is required"})
				return
			}
			h.mu.Lock()
			for _, m := range h.state.Members.Members {
				if asString(m["memberId"]) == memberID {
					h.mu.Unlock()
					writeJSON(w, http.StatusConflict, map[string]any{"message": "member already exists"})
					return
				}
			}
			h.mu.Unlock()
			row := map[string]any{
				"workspaceId":    h.state.Workspace.ID,
				"memberId":       memberID,
				"displayName":    strings.TrimSpace(asString(body["displayName"])),
				"avatar":         strings.TrimSpace(asString(body["avatar"])),
				"roleType":       strings.TrimSpace(asString(body["roleType"])),
				"manualStatus":   strings.TrimSpace(asString(body["manualStatus"])),
				"terminalStatus": strings.TrimSpace(asString(body["terminalStatus"])),
			}
			if row["displayName"] == "" {
				row["displayName"] = memberID
			}
			if row["avatar"] == "" {
				n := len(memberID)
				if n > 2 {
					n = 2
				}
				row["avatar"] = strings.ToUpper(memberID[:n])
			}
			if row["roleType"] == "" {
				row["roleType"] = "member"
			}
			if row["manualStatus"] == "" {
				row["manualStatus"] = "offline"
			}
			if row["terminalStatus"] == "" {
				row["terminalStatus"] = "offline"
			}
			targetTeamID := h.resolveTargetTeamID(body)
			if targetTeamID == "" {
				writeJSON(w, http.StatusBadRequest, map[string]any{"message": "teamId does not exist"})
				return
			}
			if targetTeamID != "team_default" {
				row["teamId"] = targetTeamID
			}
			if asBool(body["createRuntime"]) {
				runtimeFields, err := h.initializeAgentRuntime(r, memberID, row, body)
				if err != nil {
					writeError(w, http.StatusBadRequest, err)
					return
				}
				for k, v := range runtimeFields {
					row[k] = v
				}
			}
			h.mu.Lock()
			defer h.mu.Unlock()
			for _, m := range h.state.Members.Members {
				if asString(m["memberId"]) == memberID {
					h.cleanupInitializedAgent(row)
					writeJSON(w, http.StatusConflict, map[string]any{"message": "member already exists"})
					return
				}
			}
			h.state.Members.Members = append(h.state.Members.Members, row)
			h.addMemberToTeam(targetTeamID, memberID)
			_ = h.persistRosterLocked()
			h.publishPresenceLocked()
			writeJSON(w, http.StatusCreated, h.membersAndTeamsPayload())
		default:
			w.WriteHeader(http.StatusMethodNotAllowed)
		}
		return
	}
	if len(parts) == 1 && parts[0] == "status" && r.Method == http.MethodPatch {
		var body map[string]any
		if !decodeJSON(r, &body, w) {
			return
		}
		memberID, _ := body["memberId"].(string)
		h.mu.Lock()
		defer h.mu.Unlock()
		for _, member := range h.state.Members.Members {
			if member["memberId"] == memberID {
				if manual, ok := body["manualStatus"].(string); ok {
					member["manualStatus"] = manual
				}
				if terminalStatus, ok := body["terminalStatus"].(string); ok {
					member["terminalStatus"] = terminalStatus
				}
				_ = h.persistRosterLocked()
				h.publishPresenceLocked()
				writeJSON(w, http.StatusOK, h.membersAndTeamsPayload())
				return
			}
		}
		w.WriteHeader(http.StatusNotFound)
		return
	}
	if len(parts) == 1 {
		memberID := parts[0]
		switch r.Method {
		case http.MethodPut:
			if !h.enforceMemberManage(w, r) {
				return
			}
			var body map[string]any
			if !decodeJSON(r, &body, w) {
				return
			}
			h.mu.Lock()
			defer h.mu.Unlock()
			for _, member := range h.state.Members.Members {
				if asString(member["memberId"]) != memberID {
					continue
				}
				if v, ok := body["displayName"].(string); ok {
					member["displayName"] = v
				}
				if v, ok := body["avatar"].(string); ok {
					member["avatar"] = v
				}
				if v, ok := body["roleType"].(string); ok {
					member["roleType"] = v
				}
				if v, ok := body["manualStatus"].(string); ok {
					member["manualStatus"] = v
				}
				if v, ok := body["terminalStatus"].(string); ok {
					member["terminalStatus"] = v
				}
				_ = h.persistRosterLocked()
				h.publishPresenceLocked()
				writeJSON(w, http.StatusOK, h.membersAndTeamsPayload())
				return
			}
			w.WriteHeader(http.StatusNotFound)
		case http.MethodDelete:
			if !h.enforceMemberManage(w, r) {
				return
			}
			h.mu.Lock()
			defer h.mu.Unlock()
			for i, member := range h.state.Members.Members {
				if asString(member["memberId"]) != memberID {
					continue
				}
				h.state.Members.Members = append(h.state.Members.Members[:i], h.state.Members.Members[i+1:]...)
				h.stripMemberFromTeams(memberID)
				_ = h.persistRosterLocked()
				h.publishPresenceLocked()
				writeJSON(w, http.StatusOK, h.membersAndTeamsPayload())
				return
			}
			w.WriteHeader(http.StatusNotFound)
		default:
			w.WriteHeader(http.StatusMethodNotAllowed)
		}
		return
	}
	w.WriteHeader(http.StatusNotFound)
}

func (h *WorkspaceHandler) cleanupInitializedAgent(row map[string]any) {
	if terminalID := strings.TrimSpace(asString(row["terminalId"])); terminalID != "" && h.service != nil {
		_ = h.service.Close(terminalID)
	}
	if instanceID := strings.TrimSpace(asString(row["agentInstanceId"])); instanceID != "" && h.instanceMgr != nil {
		if inst, ok := h.instanceMgr.Get(instanceID); ok {
			_ = inst.Terminate()
			h.instanceMgr.Reap(instanceID)
		}
	}
}

func requesterMemberID(r *http.Request) string {
	if principal, err := authn.ResolvePrincipal(r); err == nil && strings.TrimSpace(principal.MemberID) != "" {
		return principal.MemberID
	}
	return actorID(r)
}

func providerAuthLookupKeys(providerID, terminalType string) []string {
	keys := []string{}
	add := func(value string) {
		value = strings.TrimSpace(value)
		if value == "" {
			return
		}
		for _, existing := range keys {
			if existing == value {
				return
			}
		}
		keys = append(keys, value)
	}
	add(providerID)
	switch strings.TrimSpace(terminalType) {
	case "codex":
		add("codex-cli")
	case "claude":
		add("claude-code")
	case "gemini":
		add("gemini-cli")
	case "qwen":
		add("qwen-code")
	}
	add(terminalType)
	return keys
}

func providerEnvFromAuth(providerID, terminalType string, providerAuth map[string]settings.ProviderAuthSetting) map[string]string {
	if len(providerAuth) == 0 {
		return nil
	}
	var auth settings.ProviderAuthSetting
	for _, key := range providerAuthLookupKeys(providerID, terminalType) {
		if row, ok := providerAuth[key]; ok {
			auth = row
			break
		}
	}
	if strings.TrimSpace(auth.APIKey) == "" || strings.TrimSpace(auth.Mode) != "api_key" {
		return nil
	}
	env := map[string]string{}
	switch strings.TrimSpace(terminalType) {
	case "codex":
		env["OPENAI_API_KEY"] = auth.APIKey
	case "claude":
		env["ANTHROPIC_API_KEY"] = auth.APIKey
	case "gemini":
		env["GEMINI_API_KEY"] = auth.APIKey
	case "qwen":
		env["DASHSCOPE_API_KEY"] = auth.APIKey
		env["QWEN_API_KEY"] = auth.APIKey
	}
	if len(env) == 0 {
		return nil
	}
	return env
}

func (h *WorkspaceHandler) initializeAgentRuntime(r *http.Request, memberID string, row map[string]any, body map[string]any) (map[string]any, error) {
	if h.instanceMgr == nil || h.providerReg == nil {
		return nil, errAgentRuntimeUnavailable
	}

	workspaceID := h.state.Workspace.ID
	providerID := strings.TrimSpace(asString(body["providerId"]))
	terminalType := strings.TrimSpace(asString(body["terminalType"]))
	if terminalType == "" {
		terminalType = providerID
	}
	if terminalType == "" {
		terminalType = "shell"
	}
	agentType := strings.TrimSpace(asString(body["agentType"]))
	if agentType == "" {
		agentType = strings.TrimSpace(asString(row["roleType"]))
	}
	if agentType == "" {
		agentType = "assistant"
	}
	hiveID := strings.TrimSpace(asString(body["teamId"]))
	if hiveID == "" {
		hiveID = strings.TrimSpace(asString(body["team"]))
	}
	if rowTeamID := strings.TrimSpace(asString(row["teamId"])); rowTeamID != "" {
		hiveID = rowTeamID
	}
	if hiveID == "" {
		hiveID = "team_default"
	}

	inst, err := h.instanceMgr.Spawn(agentType, terminalType, workspaceID, hiveID)
	if err != nil {
		return nil, err
	}
	inst.SetContext("memberId", memberID)
	inst.SetContext("workspaceId", workspaceID)
	inst.SetContext("displayName", asString(row["displayName"]))
	inst.SetContext("providerId", providerID)
	inst.SetContext("terminalType", terminalType)
	inst.SetContext("createdBy", actorID(r))
	inst.SetContext("readyForInstructions", true)

	command := strings.TrimSpace(asString(body["command"]))
	cwd := strings.TrimSpace(asString(body["workingDir"]))
	if cwd == "" {
		cwd = strings.TrimSpace(asString(body["cwd"]))
	}
	var env map[string]string
	if h.settingsSvc != nil {
		us, err := h.settingsSvc.Get(requesterMemberID(r))
		if err == nil {
			env = providerEnvFromAuth(providerID, terminalType, us.ProviderAuth)
		}
	}
	info, err := h.service.CreateSessionForMemberWithEnv(
		r.Context(),
		memberID,
		workspaceID,
		terminalType,
		command,
		cwd,
		env,
		h.providerReg,
		nil,
	)
	if err != nil {
		_ = inst.Crash("terminal init failed: " + err.Error())
		return nil, err
	}
	inst.SetContext("terminalId", info.SessionID)
	inst.SetContext("command", info.Command)
	inst.SetContext("cwd", cwd)
	placement := map[string]any{
		"agentPlacementState": "pending",
	}
	if h.nodeSvc != nil {
		placed, err := h.nodeSvc.AutoAssignAgent(r.Context(), memberID)
		if err == nil {
			inst.SetContext("nodeId", placed.ID)
			inst.SetContext("nodeHostname", placed.Hostname)
			placement["nodeId"] = placed.ID
			placement["nodeHostname"] = placed.Hostname
			placement["agentPlacementState"] = "placed"
		} else if !errors.Is(err, node.ErrNoAvailableNode) {
			_ = inst.Crash("node placement failed: " + err.Error())
			_ = h.service.Close(info.SessionID)
			return nil, err
		}
	}
	_ = inst.CompleteStep()

	fields := map[string]any{
		"agentInstanceId":   inst.ID(),
		"agentRuntimeState": string(inst.State()),
		"agentType":         inst.AgentType(),
		"agentProvider":     inst.Provider(),
		"runtimeReady":      true,
		"terminalId":        info.SessionID,
		"terminalType":      info.TerminalType,
		"terminalStatus":    string(info.Status),
		"command":           info.Command,
	}
	for k, v := range placement {
		fields[k] = v
	}
	return fields, nil
}

func (h *WorkspaceHandler) addMemberToDefaultTeam(memberID string) {
	h.addMemberToTeam("team_default", memberID)
}

func (h *WorkspaceHandler) addMemberToTeam(teamID, memberID string) {
	if strings.TrimSpace(teamID) == "" {
		teamID = "team_default"
	}
	for i := range h.teams {
		if h.teams[i].TeamID != teamID {
			continue
		}
		for _, id := range h.teams[i].MemberIDs {
			if id == memberID {
				return
			}
		}
		h.teams[i].MemberIDs = append(h.teams[i].MemberIDs, memberID)
		return
	}
	if len(h.teams) > 0 {
		h.teams[0].MemberIDs = append(h.teams[0].MemberIDs, memberID)
	}
}

func (h *WorkspaceHandler) resolveTargetTeamID(body map[string]any) string {
	requested := strings.TrimSpace(asString(body["teamId"]))
	if requested == "" {
		requested = strings.TrimSpace(asString(body["team"]))
	}
	if requested == "" {
		return "team_default"
	}
	h.mu.RLock()
	defer h.mu.RUnlock()
	for _, team := range h.teams {
		if team.TeamID == requested {
			return team.TeamID
		}
	}
	return ""
}

func (h *WorkspaceHandler) stripMemberFromTeams(memberID string) {
	for i := range h.teams {
		ids := make([]string, 0, len(h.teams[i].MemberIDs))
		for _, id := range h.teams[i].MemberIDs {
			if id != memberID {
				ids = append(ids, id)
			}
		}
		h.teams[i].MemberIDs = ids
	}
}

func asBool(value any) bool {
	switch v := value.(type) {
	case bool:
		return v
	case string:
		return strings.EqualFold(v, "true") || v == "1" || strings.EqualFold(v, "yes")
	default:
		return false
	}
}

func (h *WorkspaceHandler) HandleTeams(w http.ResponseWriter, r *http.Request, workspaceID string, parts []string) {
	if workspaceID != h.state.Workspace.ID {
		w.WriteHeader(http.StatusNotFound)
		return
	}
	if len(parts) == 0 {
		switch r.Method {
		case http.MethodGet:
			h.mu.RLock()
			defer h.mu.RUnlock()
			writeJSON(w, http.StatusOK, map[string]any{"teams": h.expandTeamsResponse(h.membersWithTerminalStatusLocked())})
		case http.MethodPost:
			if !h.enforceMemberManage(w, r) {
				return
			}
			var body struct {
				TeamID    string   `json:"teamId"`
				Name      string   `json:"name"`
				MemberIDs []string `json:"memberIds"`
			}
			if !decodeJSON(r, &body, w) {
				return
			}
			teamID := strings.TrimSpace(body.TeamID)
			if teamID == "" {
				writeJSON(w, http.StatusBadRequest, map[string]any{"message": "teamId is required"})
				return
			}
			h.mu.Lock()
			defer h.mu.Unlock()
			for _, t := range h.teams {
				if t.TeamID == teamID {
					writeJSON(w, http.StatusConflict, map[string]any{"message": "team already exists"})
					return
				}
			}
			h.teams = append(h.teams, roster.Team{TeamID: teamID, Name: strings.TrimSpace(body.Name), MemberIDs: append([]string(nil), body.MemberIDs...)})
			_ = h.persistRosterLocked()
			writeJSON(w, http.StatusCreated, h.membersAndTeamsPayload())
		default:
			w.WriteHeader(http.StatusMethodNotAllowed)
		}
		return
	}
	if len(parts) == 1 {
		teamID := parts[0]
		switch r.Method {
		case http.MethodPut:
			if !h.enforceMemberManage(w, r) {
				return
			}
			var body struct {
				Name      string   `json:"name"`
				MemberIDs []string `json:"memberIds"`
			}
			if !decodeJSON(r, &body, w) {
				return
			}
			h.mu.Lock()
			defer h.mu.Unlock()
			for i := range h.teams {
				if h.teams[i].TeamID != teamID {
					continue
				}
				if body.Name != "" {
					h.teams[i].Name = body.Name
				}
				if body.MemberIDs != nil {
					h.teams[i].MemberIDs = append([]string(nil), body.MemberIDs...)
				}
				_ = h.persistRosterLocked()
				writeJSON(w, http.StatusOK, h.membersAndTeamsPayload())
				return
			}
			w.WriteHeader(http.StatusNotFound)
		case http.MethodDelete:
			if !h.enforceMemberManage(w, r) {
				return
			}
			h.mu.Lock()
			defer h.mu.Unlock()
			for i, t := range h.teams {
				if t.TeamID != teamID {
					continue
				}
				h.teams = append(h.teams[:i], h.teams[i+1:]...)
				_ = h.persistRosterLocked()
				writeJSON(w, http.StatusOK, h.membersAndTeamsPayload())
				return
			}
			w.WriteHeader(http.StatusNotFound)
		default:
			w.WriteHeader(http.StatusMethodNotAllowed)
		}
		return
	}
	w.WriteHeader(http.StatusNotFound)
}

func (h *WorkspaceHandler) publishPresenceLocked() {
	members := make([]realtime.PresenceMember, 0, len(h.state.Members.Members))
	for _, member := range h.state.Members.Members {
		members = append(members, realtime.PresenceMember{
			MemberID:       asString(member["memberId"]),
			PresenceState:  asString(member["manualStatus"]),
			TerminalStatus: asString(member["terminalStatus"]),
			LastHeartbeat:  time.Now().UTC(),
		})
	}
	h.hub.Publish(realtime.Event{
		Name:        realtime.EventPresenceSnapshot,
		WorkspaceID: h.state.Workspace.ID,
		Payload:     realtime.PresenceSnapshotPayload{Members: members},
	})
}
