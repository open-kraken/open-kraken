package repository

import (
	"context"
	"errors"
	"path/filepath"
	"testing"
	"time"

	"open-kraken/backend/go/internal/domain/conversation"
	"open-kraken/backend/go/internal/domain/member"
	"open-kraken/backend/go/internal/domain/message"
	"open-kraken/backend/go/internal/domain/projectdata"
	"open-kraken/backend/go/internal/domain/roadmap"
	"open-kraken/backend/go/internal/domain/role"
	"open-kraken/backend/go/internal/domain/workspace"
)

func TestFileStorePersistsWorkspaceConversationMemberAndMessages(t *testing.T) {
	now := time.Unix(1_700_000_000, 0).UTC()
	store := NewFileStore(t.TempDir())
	ctx := context.Background()

	ws := workspace.Workspace{ID: "ws-1", Name: "open-kraken", RootPath: "/repo", Status: workspace.StatusActive, CreatedAt: now, UpdatedAt: now, Version: 1}
	conv := conversation.Conversation{ID: "conv-1", WorkspaceID: "ws-1", Kind: conversation.KindChannel, Title: "General", MemberIDs: []string{"member-1"}, CreatedAt: now, UpdatedAt: now, Version: 1}
	mem := member.Member{ID: "member-1", WorkspaceID: "ws-1", UserID: "user-1", DisplayName: "Assistant", Role: role.Assistant, Status: member.StatusActive, CreatedAt: now, UpdatedAt: now, Version: 1}
	msg1 := message.Message{ID: "msg-1", WorkspaceID: "ws-1", ConversationID: "conv-1", SenderMemberID: "member-1", Body: "a", Status: message.StatusSending, CreatedAt: now, UpdatedAt: now, Version: 1}
	msg2 := message.Message{ID: "msg-2", WorkspaceID: "ws-1", ConversationID: "conv-1", SenderMemberID: "member-1", Body: "b", Status: message.StatusSent, CreatedAt: now.Add(time.Second), UpdatedAt: now.Add(time.Second), Version: 2}

	for _, save := range []func() error{
		func() error { return store.SaveWorkspace(ctx, ws) },
		func() error { return store.SaveConversation(ctx, conv) },
		func() error { return store.SaveMember(ctx, mem) },
		func() error { return store.SaveMessage(ctx, msg1) },
		func() error { return store.SaveMessage(ctx, msg2) },
	} {
		if err := save(); err != nil {
			t.Fatalf("save failed: %v", err)
		}
	}

	gotWS, err := store.GetWorkspace(ctx, "ws-1")
	if err != nil || gotWS.Name != ws.Name {
		t.Fatalf("workspace mismatch: %+v err=%v", gotWS, err)
	}
	gotConversations, err := store.ListConversationsByWorkspace(ctx, "ws-1")
	if err != nil || len(gotConversations) != 1 || gotConversations[0].ID != "conv-1" {
		t.Fatalf("conversations mismatch: %+v err=%v", gotConversations, err)
	}
	gotMembers, err := store.ListMembersByWorkspace(ctx, "ws-1")
	if err != nil || len(gotMembers) != 1 || gotMembers[0].ID != "member-1" {
		t.Fatalf("members mismatch: %+v err=%v", gotMembers, err)
	}
	gotMessages, err := store.ListMessagesByConversation(ctx, "ws-1", "conv-1", 1)
	if err != nil || len(gotMessages) != 1 || gotMessages[0].ID != "msg-2" {
		t.Fatalf("messages mismatch: %+v err=%v", gotMessages, err)
	}
}

func TestFileStorePersistsWorkspaceAndConversationScopedDocuments(t *testing.T) {
	now := time.Unix(1_700_000_000, 0).UTC()
	storeRoot := t.TempDir()
	store := NewFileStore(storeRoot)
	ctx := context.Background()
	conversationID := "conv-1"

	workspaceRoadmap := roadmap.Roadmap{
		ID: "rm-global", WorkspaceID: "ws-1", Items: []roadmap.Item{{ID: "item-1", Title: "setup", Status: roadmap.StatusTodo, Position: 1, CreatedAt: now, UpdatedAt: now, Version: 1}},
		CreatedAt: now, UpdatedAt: now, Version: 1,
	}
	conversationRoadmap := roadmap.Roadmap{
		ID: "rm-conv", WorkspaceID: "ws-1", ConversationID: &conversationID, Items: []roadmap.Item{{ID: "item-2", Title: "reply", Status: roadmap.StatusInProgress, Position: 1, CreatedAt: now, UpdatedAt: now, Version: 1}},
		CreatedAt: now, UpdatedAt: now, Version: 1,
	}
	workspaceData := projectdata.ProjectData{
		ID: "pd-global", WorkspaceID: "ws-1", Entries: []projectdata.Entry{{Key: "repo.name", Value: "open-kraken", CreatedAt: now, UpdatedAt: now, Version: 1}},
		CreatedAt: now, UpdatedAt: now, Version: 1,
	}
	conversationData := projectdata.ProjectData{
		ID: "pd-conv", WorkspaceID: "ws-1", ConversationID: &conversationID, Entries: []projectdata.Entry{{Key: "thread.topic", Value: "migration", CreatedAt: now, UpdatedAt: now, Version: 1}},
		CreatedAt: now, UpdatedAt: now, Version: 1,
	}

	for _, save := range []func() error{
		func() error { return store.SaveRoadmap(ctx, workspaceRoadmap) },
		func() error { return store.SaveRoadmap(ctx, conversationRoadmap) },
		func() error { return store.SaveProjectData(ctx, workspaceData) },
		func() error { return store.SaveProjectData(ctx, conversationData) },
	} {
		if err := save(); err != nil {
			t.Fatalf("save scoped document: %v", err)
		}
	}

	if _, err := store.GetWorkspaceRoadmap(ctx, "ws-1"); err != nil {
		t.Fatalf("workspace roadmap missing: %v", err)
	}
	if _, err := store.GetConversationRoadmap(ctx, "ws-1", "conv-1"); err != nil {
		t.Fatalf("conversation roadmap missing: %v", err)
	}
	if _, err := store.GetWorkspaceProjectData(ctx, "ws-1"); err != nil {
		t.Fatalf("workspace project data missing: %v", err)
	}
	if _, err := store.GetConversationProjectData(ctx, "ws-1", "conv-1"); err != nil {
		t.Fatalf("conversation project data missing: %v", err)
	}

	expected := filepath.Join(storeRoot, ".open-kraken", "domain", "project-data", "conversations", "ws-1", "conv-1.json")
	if _, err := store.GetConversationProjectData(ctx, "ws-1", "conv-1"); err != nil || expected == "" {
		t.Fatalf("conversation scoped path missing: %v", err)
	}
}

func TestFileStoreReturnsNotFoundForMissingDocuments(t *testing.T) {
	store := NewFileStore(t.TempDir())
	_, err := store.GetWorkspace(context.Background(), "missing")
	if !errors.Is(err, ErrNotFound) {
		t.Fatalf("expected ErrNotFound, got %v", err)
	}
}
