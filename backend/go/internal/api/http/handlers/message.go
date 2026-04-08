package handlers

import (
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"open-kraken/backend/go/internal/message"
)

// MessageHandler serves the message API endpoints.
type MessageHandler struct {
	svc        *message.Service
	pathPrefix string // e.g. /api/v1/messages
}

// NewMessageHandler creates a MessageHandler.
func NewMessageHandler(svc *message.Service, pathPrefix string) *MessageHandler {
	return &MessageHandler{svc: svc, pathPrefix: pathPrefix}
}

// Handle routes requests under the messages path prefix.
//
//	GET  /messages?conversationId=...&workspaceId=...&limit=...&beforeId=...
//	POST /messages
//	GET  /messages/{id}
//	PUT  /messages/{id}/status
//	POST /messages/read
func (h *MessageHandler) Handle(w http.ResponseWriter, r *http.Request) {
	path := strings.TrimPrefix(r.URL.Path, h.pathPrefix)
	path = strings.Trim(path, "/")
	parts := strings.Split(path, "/")

	switch {
	// POST /messages — send a new message
	case path == "" && r.Method == http.MethodPost:
		h.handleSend(w, r)
	// GET /messages — list messages
	case path == "" && r.Method == http.MethodGet:
		h.handleList(w, r)
	// POST /messages/read — mark messages as read
	case path == "read" && r.Method == http.MethodPost:
		h.handleMarkRead(w, r)
	// GET /messages/{id}
	case len(parts) == 1 && r.Method == http.MethodGet:
		h.handleGet(w, r, parts[0])
	// PUT /messages/{id}/status
	case len(parts) == 2 && parts[1] == "status" && r.Method == http.MethodPut:
		h.handleUpdateStatus(w, r, parts[0])
	default:
		w.WriteHeader(http.StatusMethodNotAllowed)
	}
}

func (h *MessageHandler) handleSend(w http.ResponseWriter, r *http.Request) {
	var body struct {
		WorkspaceID    string `json:"workspaceId"`
		ConversationID string `json:"conversationId"`
		SenderID       string `json:"senderId"`
		Content        struct {
			Type string `json:"type"`
			Text string `json:"text"`
		} `json:"content"`
		IsAI     bool `json:"isAi"`
		Terminal *struct {
			TerminalID string `json:"terminalId,omitempty"`
			Source     string `json:"source,omitempty"`
			Command    string `json:"command,omitempty"`
			LineCount  int    `json:"lineCount,omitempty"`
		} `json:"terminal,omitempty"`
	}
	if !decodeJSON(r, &body, w) {
		return
	}

	m := message.Message{
		WorkspaceID:    body.WorkspaceID,
		ConversationID: body.ConversationID,
		SenderID:       body.SenderID,
		ContentType:    message.ContentType(body.Content.Type),
		ContentText:    body.Content.Text,
		IsAI:           body.IsAI,
	}
	if body.Terminal != nil {
		m.Terminal = &message.TerminalMeta{
			TerminalID: body.Terminal.TerminalID,
			Source:     message.TerminalSource(body.Terminal.Source),
			Command:    body.Terminal.Command,
			LineCount:  body.Terminal.LineCount,
		}
	}

	saved, err := h.svc.Send(r.Context(), m)
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	writeJSON(w, http.StatusCreated, messageToJSON(saved))
}

func (h *MessageHandler) handleList(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	query := message.Query{
		WorkspaceID:    q.Get("workspaceId"),
		ConversationID: q.Get("conversationId"),
		SenderID:       q.Get("senderId"),
		BeforeID:       q.Get("beforeId"),
	}
	query.Limit = 50
	if l := q.Get("limit"); l != "" {
		var n int
		if _, err := fmt.Sscanf(l, "%d", &n); err == nil && n > 0 {
			query.Limit = n
		}
	}

	msgs, err := h.svc.List(r.Context(), query)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	items := make([]map[string]any, 0, len(msgs))
	for _, m := range msgs {
		items = append(items, messageToJSON(m))
	}
	// Determine nextBeforeId for pagination.
	var nextBefore *string
	if len(msgs) == query.Limit {
		last := msgs[len(msgs)-1].ID
		nextBefore = &last
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"items":        items,
		"nextBeforeId": nextBefore,
	})
}

func (h *MessageHandler) handleGet(w http.ResponseWriter, r *http.Request, id string) {
	m, err := h.svc.Get(r.Context(), id)
	if err != nil {
		if errors.Is(err, message.ErrNotFound) {
			writeError(w, http.StatusNotFound, err)
			return
		}
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusOK, messageToJSON(m))
}

func (h *MessageHandler) handleUpdateStatus(w http.ResponseWriter, r *http.Request, id string) {
	var body struct {
		Status string `json:"status"`
	}
	if !decodeJSON(r, &body, w) {
		return
	}
	if err := h.svc.UpdateStatus(r.Context(), id, message.Status(body.Status)); err != nil {
		if errors.Is(err, message.ErrNotFound) {
			writeError(w, http.StatusNotFound, err)
			return
		}
		writeError(w, http.StatusBadRequest, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (h *MessageHandler) handleMarkRead(w http.ResponseWriter, r *http.Request) {
	var body struct {
		WorkspaceID    string `json:"workspaceId"`
		ConversationID string `json:"conversationId"`
		MemberID       string `json:"memberId"`
		LastReadID     string `json:"lastReadId"`
	}
	if !decodeJSON(r, &body, w) {
		return
	}
	mark := message.UnreadMark{
		WorkspaceID:    body.WorkspaceID,
		ConversationID: body.ConversationID,
		MemberID:       body.MemberID,
		LastReadID:     body.LastReadID,
	}
	unread, err := h.svc.MarkRead(r.Context(), mark)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"unreadCount": unread})
}

func messageToJSON(m message.Message) map[string]any {
	result := map[string]any{
		"id":             m.ID,
		"workspaceId":    m.WorkspaceID,
		"conversationId": m.ConversationID,
		"senderId":       m.SenderID,
		"content": map[string]string{
			"type": string(m.ContentType),
			"text": m.ContentText,
		},
		"status":    string(m.Status),
		"isAi":      m.IsAI,
		"seq":       m.Seq,
		"createdAt": m.CreatedAt.Format(time.RFC3339Nano),
	}
	if m.Terminal != nil {
		result["terminal"] = map[string]any{
			"terminalId": m.Terminal.TerminalID,
			"source":     string(m.Terminal.Source),
			"command":    m.Terminal.Command,
			"lineCount":  m.Terminal.LineCount,
		}
	}
	return result
}
