package handlers

import (
	"context"
	"net/http"
	"strings"
	"time"

	"open-kraken/backend/go/internal/message"
	"open-kraken/backend/go/internal/realtime"
)

func (h *WorkspaceHandler) HandleChatHome(w http.ResponseWriter, r *http.Request, workspaceID string) {
	if r.Method != http.MethodGet {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	h.mu.RLock()
	defer h.mu.RUnlock()
	if workspaceID != h.state.Workspace.ID {
		w.WriteHeader(http.StatusNotFound)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"workspace":             h.state.Workspace,
		"conversations":         h.state.Conversations,
		"members":               h.state.Members.Members,
		"teams":                 h.expandTeamsResponse(),
		"defaultConversationId": firstConversationID(h.state.Conversations),
		"totalUnreadCount":      totalUnreadCount(h.state.Conversations),
	})
}

func (h *WorkspaceHandler) HandleConversations(w http.ResponseWriter, r *http.Request, workspaceID string, parts []string) {
	if workspaceID != h.state.Workspace.ID {
		w.WriteHeader(http.StatusNotFound)
		return
	}
	if len(parts) == 0 {
		switch r.Method {
		case http.MethodGet:
			h.HandleChatHome(w, r, workspaceID)
		case http.MethodPost:
			h.handleConversationCreate(w, r, workspaceID)
		default:
			w.WriteHeader(http.StatusMethodNotAllowed)
		}
		return
	}
	conversationID := parts[0]
	if len(parts) == 2 && parts[1] == "messages" {
		switch r.Method {
		case http.MethodGet:
			h.handleMessagesList(w, conversationID)
		case http.MethodPost:
			h.handleMessagesCreate(w, r, workspaceID, conversationID)
		default:
			w.WriteHeader(http.StatusMethodNotAllowed)
		}
		return
	}
	w.WriteHeader(http.StatusNotFound)
}

func (h *WorkspaceHandler) handleConversationCreate(w http.ResponseWriter, r *http.Request, workspaceID string) {
	var body struct {
		Type     string `json:"type"`
		MemberID string `json:"memberId"`
		TeamID   string `json:"teamId"`
	}
	if !decodeJSON(r, &body, w) {
		return
	}
	convType := strings.TrimSpace(body.Type)
	if convType == "" {
		convType = "direct"
	}
	if convType != "direct" && convType != "team" && convType != "channel" {
		writeJSON(w, http.StatusBadRequest, map[string]any{"message": "conversation type must be direct, team, or channel"})
		return
	}

	h.mu.Lock()
	defer h.mu.Unlock()

	var conversation map[string]any
	switch convType {
	case "direct":
		memberID := strings.TrimSpace(body.MemberID)
		if memberID == "" || !h.memberExistsLocked(memberID) {
			writeJSON(w, http.StatusBadRequest, map[string]any{"message": "memberId is required and must exist"})
			return
		}
		currentID := h.defaultHumanMemberIDLocked(memberID)
		ids := []string{currentID, memberID}
		if existing := findDirectConversation(h.state.Conversations, ids); existing != nil {
			conversation = existing
			break
		}
		conversation = map[string]any{
			"id":                 "conv_dm_" + sanitizeConversationID(currentID) + "_" + sanitizeConversationID(memberID),
			"type":               "direct",
			"memberIds":          ids,
			"lastMessagePreview": "",
			"lastMessageAt":      time.Now().UTC().UnixMilli(),
			"unreadCount":        0,
		}
	case "team":
		teamID := strings.TrimSpace(body.TeamID)
		if teamID == "" || !h.teamExistsLocked(teamID) {
			writeJSON(w, http.StatusBadRequest, map[string]any{"message": "teamId is required and must exist"})
			return
		}
		if existing := findTeamConversation(h.state.Conversations, teamID); existing != nil {
			conversation = existing
			break
		}
		conversation = map[string]any{
			"id":                 "conv_team_" + sanitizeConversationID(teamID),
			"type":               "team",
			"teamId":             teamID,
			"lastMessagePreview": "",
			"lastMessageAt":      time.Now().UTC().UnixMilli(),
			"unreadCount":        0,
		}
	default:
		conversation = map[string]any{
			"id":                 "conv_channel_" + time.Now().UTC().Format("20060102150405"),
			"type":               "channel",
			"customName":         "New Channel",
			"lastMessagePreview": "",
			"lastMessageAt":      time.Now().UTC().UnixMilli(),
			"unreadCount":        0,
		}
	}

	if !conversationExists(h.state.Conversations, asString(conversation["id"])) {
		h.state.Conversations = append([]map[string]any{conversation}, h.state.Conversations...)
		h.state.Messages[asString(conversation["id"])] = []map[string]any{}
	}
	h.hub.Publish(realtime.Event{
		Name:        realtime.EventChatUpdated,
		WorkspaceID: workspaceID,
		ChannelID:   asString(conversation["id"]),
		Payload: realtime.ChatUpdatedPayload{
			ConversationID: asString(conversation["id"]),
			Reason:         "conversation.created",
		},
	})
	writeJSON(w, http.StatusCreated, map[string]any{"conversation": conversation})
}

func (h *WorkspaceHandler) handleMessagesList(w http.ResponseWriter, conversationID string) {
	// Delegate to message service if available.
	if h.msgSvc != nil {
		ctx := context.Background()
		msgs, err := h.msgSvc.List(ctx, message.Query{ConversationID: conversationID, Limit: 50})
		if err != nil {
			writeError(w, http.StatusInternalServerError, err)
			return
		}
		items := make([]map[string]any, 0, len(msgs))
		for i := len(msgs) - 1; i >= 0; i-- {
			m := msgs[i]
			items = append(items, map[string]any{
				"id":        m.ID,
				"senderId":  m.SenderID,
				"content":   map[string]string{"type": string(m.ContentType), "text": m.ContentText},
				"createdAt": m.CreatedAt.UnixMilli(),
				"isAi":      m.IsAI,
				"status":    string(m.Status),
			})
		}
		writeJSON(w, http.StatusOK, map[string]any{
			"conversationId": conversationID,
			"items":          items,
			"nextBeforeId":   nil,
		})
		return
	}
	// Fallback to fixture data.
	h.mu.RLock()
	defer h.mu.RUnlock()
	writeJSON(w, http.StatusOK, map[string]any{
		"conversationId": conversationID,
		"items":          h.state.Messages[conversationID],
		"nextBeforeId":   nil,
	})
}

func (h *WorkspaceHandler) handleMessagesCreate(w http.ResponseWriter, r *http.Request, workspaceID, conversationID string) {
	var body map[string]any
	if !decodeJSON(r, &body, w) {
		return
	}

	// Delegate to message service if available.
	if h.msgSvc != nil {
		contentMap, _ := body["content"].(map[string]any)
		contentType := "text"
		contentText := ""
		if contentMap != nil {
			if ct, ok := contentMap["type"].(string); ok {
				contentType = ct
			}
			if ct, ok := contentMap["text"].(string); ok {
				contentText = ct
			}
		}
		senderID, _ := body["senderId"].(string)
		isAI, _ := body["isAi"].(bool)

		m := message.Message{
			WorkspaceID:    workspaceID,
			ConversationID: conversationID,
			SenderID:       senderID,
			ContentType:    message.ContentType(contentType),
			ContentText:    contentText,
			IsAI:           isAI,
		}
		saved, err := h.msgSvc.Send(r.Context(), m)
		if err != nil {
			writeError(w, http.StatusInternalServerError, err)
			return
		}
		messageJSON := map[string]any{
			"id":        saved.ID,
			"senderId":  saved.SenderID,
			"content":   map[string]string{"type": string(saved.ContentType), "text": saved.ContentText},
			"createdAt": saved.CreatedAt.UnixMilli(),
			"isAi":      saved.IsAI,
			"status":    string(saved.Status),
		}
		h.mu.Lock()
		updateConversationPreview(h.state.Conversations, conversationID, messageJSON)
		h.mu.Unlock()
		h.hub.Publish(realtime.Event{
			Name:        realtime.EventChatUpdated,
			WorkspaceID: workspaceID,
			ChannelID:   conversationID,
			Payload: realtime.ChatUpdatedPayload{
				ConversationID: conversationID,
				Reason:         "message.created",
			},
		})
		h.ingestRoadmapTasksFromChat(r.Context(), workspaceID, conversationID, saved.ID, saved.ContentText)
		writeJSON(w, http.StatusCreated, map[string]any{"message": messageJSON})
		return
	}

	// Fallback to fixture-based handling.
	h.mu.Lock()
	fixtureMsg := map[string]any{
		"id":        "msg_" + time.Now().UTC().Format("150405.000"),
		"senderId":  body["senderId"],
		"content":   body["content"],
		"createdAt": time.Now().UTC().UnixMilli(),
		"isAi":      false,
		"status":    "sent",
	}
	if atts, ok := body["attachments"].([]any); ok && len(atts) > 0 {
		fixtureMsg["attachments"] = atts
	} else if one, ok := body["attachment"].(map[string]any); ok {
		fixtureMsg["attachments"] = []any{one}
	}
	h.state.Messages[conversationID] = append(h.state.Messages[conversationID], fixtureMsg)
	updateConversationPreview(h.state.Conversations, conversationID, fixtureMsg)
	h.hub.Publish(realtime.Event{
		Name:        realtime.EventChatDelta,
		WorkspaceID: workspaceID,
		ChannelID:   conversationID,
		Payload: realtime.ChatDeltaPayload{
			ConversationID: conversationID,
			MessageID:      fixtureMsg["id"].(string),
			SenderID:       asString(fixtureMsg["senderId"]),
			Sequence:       uint64(len(h.state.Messages[conversationID])),
			Body:           readMessageText(fixtureMsg),
		},
	})
	h.hub.Publish(realtime.Event{
		Name:        realtime.EventChatStatus,
		WorkspaceID: workspaceID,
		ChannelID:   conversationID,
		Payload: realtime.ChatStatusPayload{
			ConversationID: conversationID,
			MessageID:      fixtureMsg["id"].(string),
			Status:         "sent",
		},
	})
	h.publishChatSnapshotLocked(conversationID)
	h.mu.Unlock()
	h.ingestRoadmapTasksFromChat(r.Context(), workspaceID, conversationID, asString(fixtureMsg["id"]), readMessageText(fixtureMsg))
	writeJSON(w, http.StatusCreated, map[string]any{"message": fixtureMsg})
}

func (h *WorkspaceHandler) publishChatSnapshotLocked(conversationID string) {
	items := h.state.Messages[conversationID]
	messageIDs := make([]string, 0, len(items))
	for _, item := range items {
		if id, _ := item["id"].(string); id != "" {
			messageIDs = append(messageIDs, id)
		}
	}
	h.hub.Publish(realtime.Event{
		Name:        realtime.EventChatSnapshot,
		WorkspaceID: h.state.Workspace.ID,
		ChannelID:   conversationID,
		Payload: realtime.ChatSnapshotPayload{
			ConversationID: conversationID,
			MessageIDs:     messageIDs,
		},
	})
}

func updateConversationPreview(conversations []map[string]any, conversationID string, message map[string]any) {
	for _, conversation := range conversations {
		if asString(conversation["id"]) == conversationID {
			conversation["lastMessageAt"] = message["createdAt"]
			conversation["lastMessagePreview"] = readMessageText(message)
		}
	}
}

func readMessageText(message map[string]any) string {
	content, _ := message["content"].(map[string]any)
	text := asString(content["text"])
	var names []string
	if atts, ok := message["attachments"].([]any); ok {
		for _, raw := range atts {
			if m, ok := raw.(map[string]any); ok {
				n := asString(m["name"])
				if n != "" {
					names = append(names, n)
				}
			}
		}
	}
	if len(names) > 0 {
		hint := "\U0001f4ce " + strings.Join(names, ", ")
		if text != "" {
			return text + " \u00b7 " + hint
		}
		return hint
	}
	return text
}

func firstConversationID(items []map[string]any) any {
	if len(items) == 0 {
		return nil
	}
	return items[0]["id"]
}

func totalUnreadCount(items []map[string]any) int {
	total := 0
	for _, item := range items {
		switch value := item["unreadCount"].(type) {
		case float64:
			total += int(value)
		case int:
			total += value
		}
	}
	return total
}

func (h *WorkspaceHandler) memberExistsLocked(memberID string) bool {
	for _, member := range h.state.Members.Members {
		if asString(member["memberId"]) == memberID {
			return true
		}
	}
	return false
}

func (h *WorkspaceHandler) teamExistsLocked(teamID string) bool {
	for _, team := range h.teams {
		if team.TeamID == teamID {
			return true
		}
	}
	for _, team := range h.state.Teams {
		if team.TeamID == teamID {
			return true
		}
	}
	return false
}

func (h *WorkspaceHandler) defaultHumanMemberIDLocked(exclude string) string {
	for _, member := range h.state.Members.Members {
		id := asString(member["memberId"])
		if id == "" || id == exclude {
			continue
		}
		if asString(member["roleType"]) != "assistant" {
			return id
		}
	}
	for _, member := range h.state.Members.Members {
		id := asString(member["memberId"])
		if id != "" && id != exclude {
			return id
		}
	}
	return "owner_1"
}

func findDirectConversation(conversations []map[string]any, memberIDs []string) map[string]any {
	for _, conversation := range conversations {
		if asString(conversation["type"]) != "direct" {
			continue
		}
		if sameStringSet(asStringSlice(conversation["memberIds"]), memberIDs) {
			return conversation
		}
	}
	return nil
}

func findTeamConversation(conversations []map[string]any, teamID string) map[string]any {
	for _, conversation := range conversations {
		if asString(conversation["type"]) == "team" && asString(conversation["teamId"]) == teamID {
			return conversation
		}
	}
	return nil
}

func conversationExists(conversations []map[string]any, id string) bool {
	for _, conversation := range conversations {
		if asString(conversation["id"]) == id {
			return true
		}
	}
	return false
}

func asStringSlice(value any) []string {
	var result []string
	switch raw := value.(type) {
	case []string:
		result = append(result, raw...)
	case []any:
		for _, item := range raw {
			if text := asString(item); text != "" {
				result = append(result, text)
			}
		}
	}
	return result
}

func sameStringSet(a, b []string) bool {
	if len(a) != len(b) {
		return false
	}
	seen := map[string]int{}
	for _, item := range a {
		seen[item]++
	}
	for _, item := range b {
		seen[item]--
		if seen[item] < 0 {
			return false
		}
	}
	return true
}

func sanitizeConversationID(value string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return "unknown"
	}
	var b strings.Builder
	for _, r := range value {
		if (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') || r == '_' || r == '-' {
			b.WriteRune(r)
		} else {
			b.WriteByte('_')
		}
	}
	return b.String()
}
