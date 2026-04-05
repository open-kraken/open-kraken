package projectdata

import (
	"errors"
	"testing"

	"open-kraken/backend/go/internal/authz"
)

func TestGuardedServiceRejectsMemberProjectDataWrite(t *testing.T) {
	repo := NewRepository(t.TempDir())
	service := NewGuardedService(repo)

	_, err := service.WriteProjectData(authz.AuthContext{
		Actor: authz.Principal{
			MemberID:    "member-1",
			WorkspaceID: "ws-1",
			Role:        authz.RoleMember,
		},
	}, ReadRequest{
		WorkspaceID:   "ws-1",
		WorkspacePath: t.TempDir(),
	}, ProjectDataDocument{
		ProjectID:   "proj-1",
		ProjectName: "open-kraken",
	}, WriteOptions{})
	if !errors.Is(err, authz.ErrForbidden) {
		t.Fatalf("expected authz.ErrForbidden, got %v", err)
	}
}

func TestGuardedServiceRejectsCrossWorkspaceRoadmapWrite(t *testing.T) {
	repo := NewRepository(t.TempDir())
	service := NewGuardedService(repo)

	_, err := service.WriteGlobalRoadmap(authz.AuthContext{
		Actor: authz.Principal{
			MemberID:    "assistant-1",
			WorkspaceID: "ws-1",
			Role:        authz.RoleAssistant,
		},
	}, ReadRequest{
		WorkspaceID:   "ws-2",
		WorkspacePath: t.TempDir(),
	}, GlobalRoadmapDocument{
		Objective: "Denied",
	}, WriteOptions{})
	if !errors.Is(err, authz.ErrForbidden) {
		t.Fatalf("expected authz.ErrForbidden, got %v", err)
	}
}

func TestGuardedServiceAllowsAssistantRoadmapWrite(t *testing.T) {
	repo := NewRepository(t.TempDir())
	service := NewGuardedService(repo)

	result, err := service.WriteConversationRoadmap(authz.AuthContext{
		Actor: authz.Principal{
			MemberID:    "assistant-1",
			WorkspaceID: "ws-1",
			Role:        authz.RoleAssistant,
		},
	}, ReadRequest{
		WorkspaceID:    "ws-1",
		WorkspacePath:  t.TempDir(),
		ConversationID: "conv-1",
	}, ConversationRoadmapDocument{
		Objective: "Ship",
		Tasks: []RoadmapTask{
			{ID: "task-1", Title: "First", Status: "todo", Order: 1},
		},
	}, WriteOptions{})
	if err != nil {
		t.Fatalf("expected assistant roadmap write allowed, got %v", err)
	}
	if result.Document.Meta.Version != 1 {
		t.Fatalf("expected version 1, got %d", result.Document.Meta.Version)
	}
}
