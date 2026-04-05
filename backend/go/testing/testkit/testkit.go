package testkit

import (
	"testing"
	"time"

	"open-kraken/backend/go/internal/authz"
	"open-kraken/backend/go/internal/domain/conversation"
	"open-kraken/backend/go/internal/domain/member"
	"open-kraken/backend/go/internal/domain/message"
	"open-kraken/backend/go/internal/domain/role"
)

var fixedTime = time.Unix(1_700_000_000, 0).UTC()

type WorkspaceConversationFixture struct {
	WorkspaceID  string
	Conversation conversation.Conversation
	Member       member.Member
	Message      message.Message
}

func FixedTime() time.Time {
	return fixedTime
}

func NewWorkspaceConversationFixture() WorkspaceConversationFixture {
	now := FixedTime()
	return WorkspaceConversationFixture{
		WorkspaceID: "ws-1",
		Conversation: conversation.Conversation{
			ID:          "conv-1",
			WorkspaceID: "ws-1",
			Kind:        conversation.KindChannel,
			Title:       "General",
			MemberIDs:   []string{"member-1"},
			CreatedAt:   now,
			UpdatedAt:   now,
			Version:     1,
		},
		Member: member.Member{
			ID:          "member-1",
			WorkspaceID: "ws-1",
			UserID:      "user-1",
			DisplayName: "Assistant Worker",
			Role:        role.Assistant,
			Status:      member.StatusActive,
			CreatedAt:   now,
			UpdatedAt:   now,
			Version:     1,
		},
		Message: message.Message{
			ID:             "msg-1",
			WorkspaceID:    "ws-1",
			ConversationID: "conv-1",
			SenderMemberID: "member-1",
			Body:           "hello from integration",
			Status:         message.StatusSent,
			CreatedAt:      now,
			UpdatedAt:      now,
			Version:        1,
		},
	}
}

func AssistantPrincipal(workspaceID string, memberID string) authz.Principal {
	return authz.Principal{
		MemberID:    memberID,
		WorkspaceID: workspaceID,
		Role:        authz.RoleAssistant,
	}
}

func RequireAllowed(t *testing.T, label string, decision authz.Decision) {
	t.Helper()
	if !decision.Allowed {
		t.Fatalf("%s should be allowed: %+v", label, decision)
	}
}

func RequireDenied(t *testing.T, label string, decision authz.Decision) {
	t.Helper()
	if decision.Allowed {
		t.Fatalf("%s should be denied: %+v", label, decision)
	}
}
