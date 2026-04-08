package handlers

import (
	"net/http"
	"strings"
	"time"

	"open-kraken/backend/go/internal/authz"
	"open-kraken/backend/go/internal/realtime"
	"open-kraken/backend/go/internal/roster"
)

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

func (h *WorkspaceHandler) membersAndTeamsPayload() map[string]any {
	return map[string]any{
		"members": h.state.Members.Members,
		"teams":   h.expandTeamsResponse(),
		"meta": map[string]any{
			"version":     h.rosterVersion,
			"workspaceId": h.state.Workspace.ID,
			"storage":     "workspace",
		},
	}
}

func (h *WorkspaceHandler) expandTeamsResponse() []map[string]any {
	byID := map[string]map[string]any{}
	for _, m := range h.state.Members.Members {
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
			defer h.mu.Unlock()
			for _, m := range h.state.Members.Members {
				if asString(m["memberId"]) == memberID {
					writeJSON(w, http.StatusConflict, map[string]any{"message": "member already exists"})
					return
				}
			}
			row := map[string]any{
				"workspaceId":    h.state.Workspace.ID,
				"memberId":      memberID,
				"displayName":   strings.TrimSpace(asString(body["displayName"])),
				"avatar":        strings.TrimSpace(asString(body["avatar"])),
				"roleType":      strings.TrimSpace(asString(body["roleType"])),
				"manualStatus":  strings.TrimSpace(asString(body["manualStatus"])),
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
			h.state.Members.Members = append(h.state.Members.Members, row)
			h.addMemberToDefaultTeam(memberID)
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

func (h *WorkspaceHandler) addMemberToDefaultTeam(memberID string) {
	for i := range h.teams {
		if h.teams[i].TeamID != "team_default" {
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
			writeJSON(w, http.StatusOK, map[string]any{"teams": h.expandTeamsResponse()})
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
