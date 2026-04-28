package handlers

import (
	"context"

	"open-kraken/backend/go/internal/message"
	"open-kraken/backend/go/internal/terminal/semantic"
)

type chatTerminalSink struct {
	svc *message.Service
}

func (s chatTerminalSink) OnTerminalMessage(payload semantic.MessagePayload) {
	if s.svc == nil || payload.WorkspaceID == "" || payload.ConversationID == "" || payload.MemberID == "" || payload.Content == "" {
		return
	}
	_, _ = s.svc.SendTerminal(context.Background(), message.Message{
		WorkspaceID:    payload.WorkspaceID,
		ConversationID: payload.ConversationID,
		SenderID:       payload.MemberID,
		ContentType:    message.ContentTypeText,
		ContentText:    payload.Content,
		IsAI:           true,
		SpanID:         payload.SpanID,
		Terminal: &message.TerminalMeta{
			TerminalID: payload.TerminalID,
			Source:     message.TerminalSourceAI,
			Command:    payload.Command,
			LineCount:  payload.LineCount,
			CursorRow:  payload.CursorRow,
			CursorCol:  payload.CursorCol,
		},
	})
}
