package handlers

import (
	"context"
	"path/filepath"
	"testing"

	"open-kraken/backend/go/internal/message"
	"open-kraken/backend/go/internal/terminal/semantic"
)

func TestChatTerminalSinkPersistsAIReply(t *testing.T) {
	repo, err := message.NewSQLiteRepository(filepath.Join(t.TempDir(), "messages.db"))
	if err != nil {
		t.Fatalf("new message repo: %v", err)
	}
	svc := message.NewService(repo, nil)
	sink := chatTerminalSink{svc: svc}

	sink.OnTerminalMessage(semantic.MessagePayload{
		TerminalID:     "session-agent-1",
		MemberID:       "agent_1",
		WorkspaceID:    "ws1",
		ConversationID: "conv1",
		Content:        "done from terminal",
		Command:        "inspect",
		LineCount:      1,
	})

	msgs, err := svc.List(context.Background(), message.Query{WorkspaceID: "ws1", ConversationID: "conv1"})
	if err != nil {
		t.Fatalf("list messages: %v", err)
	}
	if len(msgs) != 1 {
		t.Fatalf("expected one message, got %d", len(msgs))
	}
	got := msgs[0]
	if got.SenderID != "agent_1" || !got.IsAI || got.ContentText != "done from terminal" {
		t.Fatalf("unexpected saved reply: %+v", got)
	}
	if got.Terminal == nil || got.Terminal.TerminalID != "session-agent-1" || got.Terminal.Source != message.TerminalSourceAI {
		t.Fatalf("terminal metadata missing: %+v", got.Terminal)
	}
}
