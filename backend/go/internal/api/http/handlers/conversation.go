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
		if r.Method != http.MethodGet {
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}
		h.HandleChatHome(w, r, workspaceID)
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
		for _, m := range msgs {
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
			"nextBefore":     nil,
		})
		return
	}
	// Fallback to fixture data.
	h.mu.RLock()
	defer h.mu.RUnlock()
	writeJSON(w, http.StatusOK, map[string]any{
		"conversationId": conversationID,
		"items":          h.state.Messages[conversationID],
		"nextBefore":     nil,
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
		writeJSON(w, http.StatusCreated, map[string]any{
			"message": map[string]any{
				"id":        saved.ID,
				"senderId":  saved.SenderID,
				"content":   map[string]string{"type": string(saved.ContentType), "text": saved.ContentText},
				"createdAt": saved.CreatedAt.UnixMilli(),
				"isAi":      saved.IsAI,
				"status":    string(saved.Status),
			},
		})
		return
	}

	// Fallback to fixture-based handling.
	h.mu.Lock()
	defer h.mu.Unlock()
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
