package domain_test

import (
	"errors"
	"testing"
	"time"

	"open-kraken/backend/go/internal/domain/conversation"
	"open-kraken/backend/go/internal/domain/member"
	"open-kraken/backend/go/internal/domain/message"
	"open-kraken/backend/go/internal/domain/projectdata"
	"open-kraken/backend/go/internal/domain/roadmap"
	"open-kraken/backend/go/internal/domain/role"
)

func TestConversationRejectsIllegalState(t *testing.T) {
	now := time.Unix(1_700_000_000, 0)
	item := conversation.Conversation{
		ID:          "conv-1",
		WorkspaceID: "ws-1",
		Kind:        conversation.KindDirect,
		MemberIDs:   []string{"m-1", "m-1"},
		CreatedAt:   now,
		UpdatedAt:   now,
		Version:     1,
	}

	if err := item.Validate(); !errors.Is(err, conversation.ErrInvalidMemberIDs) {
		t.Fatalf("expected duplicate member rejection, got %v", err)
	}
}

func TestRoleAuthorizationSemantics(t *testing.T) {
	ownerPolicy, err := role.Owner.Policy()
	if err != nil {
		t.Fatalf("owner policy error: %v", err)
	}
	if !ownerPolicy.CanManageMembers || !role.Owner.CanAssign(role.Supervisor) || !role.Supervisor.CanAssign(role.Assistant) {
		t.Fatalf("expected elevated roles to expose assignment semantics")
	}
	if role.Assistant.CanAssign(role.Member) {
		t.Fatalf("assistant must not assign roles")
	}
	if role.Member.Includes(role.Assistant) {
		t.Fatalf("member must not include assistant capability")
	}
	if err := role.Name("admin").Validate(); !errors.Is(err, role.ErrInvalidRole) {
		t.Fatalf("expected invalid role rejection, got %v", err)
	}
}

func TestMessageRejectsCrossAggregateMismatch(t *testing.T) {
	now := time.Unix(1_700_000_000, 0)
	conv := conversation.Conversation{
		ID:          "conv-1",
		WorkspaceID: "ws-1",
		Kind:        conversation.KindChannel,
		MemberIDs:   []string{"m-1"},
		CreatedAt:   now,
		UpdatedAt:   now,
		Version:     1,
	}
	sender := member.Member{
		ID:          "m-1",
		WorkspaceID: "ws-2",
		UserID:      "user-1",
		Role:        role.Member,
		Status:      member.StatusActive,
		CreatedAt:   now,
		UpdatedAt:   now,
		Version:     1,
	}
	msg := message.Message{
		ID:             "msg-1",
		WorkspaceID:    "ws-1",
		ConversationID: "conv-1",
		SenderMemberID: "m-1",
		Body:           "hello",
		Status:         message.StatusSent,
		CreatedAt:      now,
		UpdatedAt:      now,
		Version:        1,
	}

	if err := msg.ValidateReferences(conv, sender); !errors.Is(err, message.ErrSenderWorkspaceLink) {
		t.Fatalf("expected sender workspace mismatch rejection, got %v", err)
	}
}

func TestRoadmapRejectsInvalidOrderingAndStatus(t *testing.T) {
	now := time.Unix(1_700_000_000, 0)
	rm := roadmap.Roadmap{
		ID:          "roadmap-1",
		WorkspaceID: "ws-1",
		Items: []roadmap.Item{
			{ID: "item-1", Title: "A", Status: roadmap.StatusTodo, Position: 2, CreatedAt: now, UpdatedAt: now, Version: 1},
			{ID: "item-2", Title: "B", Status: roadmap.Status("later"), Position: 1, CreatedAt: now, UpdatedAt: now, Version: 1},
		},
		CreatedAt: now,
		UpdatedAt: now,
		Version:   1,
	}

	if err := rm.Validate(); !errors.Is(err, roadmap.ErrInvalidItemStatus) {
		t.Fatalf("expected invalid status rejection before ordering is trusted, got %v", err)
	}

	rm.Items[1].Status = roadmap.StatusDone
	if err := rm.Validate(); !errors.Is(err, roadmap.ErrInvalidItemOrdering) {
		t.Fatalf("expected ordering rejection, got %v", err)
	}
}

func TestProjectDataRejectsDuplicateKeys(t *testing.T) {
	now := time.Unix(1_700_000_000, 0)
	data := projectdata.ProjectData{
		ID:          "pd-1",
		WorkspaceID: "ws-1",
		Entries: []projectdata.Entry{
			{Key: "build.target", Value: "linux", CreatedAt: now, UpdatedAt: now, Version: 1},
			{Key: "build.target", Value: "darwin", CreatedAt: now, UpdatedAt: now, Version: 2},
		},
		CreatedAt: now,
		UpdatedAt: now,
		Version:   1,
	}

	if err := data.Validate(); !errors.Is(err, projectdata.ErrDuplicateEntryKey) {
		t.Fatalf("expected duplicate key rejection, got %v", err)
	}
}
