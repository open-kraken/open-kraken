package repository

import (
	"context"

	"open-kraken/backend/go/internal/domain/conversation"
	"open-kraken/backend/go/internal/domain/member"
	"open-kraken/backend/go/internal/domain/message"
	"open-kraken/backend/go/internal/domain/projectdata"
	"open-kraken/backend/go/internal/domain/roadmap"
	"open-kraken/backend/go/internal/domain/workspace"
)

// Workspace, conversation, member, roadmap, and project data are aggregate roots
// that can be persisted independently. Message is persisted independently as an
// append-oriented record scoped by workspaceId + conversationId. Cross-aggregate
// links must use IDs only; aggregates do not own each other directly.

type WorkspaceQueryRepository interface {
	GetWorkspace(ctx context.Context, workspaceID string) (workspace.Workspace, error)
}

type WorkspaceStoreRepository interface {
	SaveWorkspace(ctx context.Context, item workspace.Workspace) error
}

type ConversationQueryRepository interface {
	GetConversation(ctx context.Context, workspaceID, conversationID string) (conversation.Conversation, error)
	ListConversationsByWorkspace(ctx context.Context, workspaceID string) ([]conversation.Conversation, error)
}

type ConversationStoreRepository interface {
	SaveConversation(ctx context.Context, item conversation.Conversation) error
}

type MemberQueryRepository interface {
	GetMember(ctx context.Context, workspaceID, memberID string) (member.Member, error)
	ListMembersByWorkspace(ctx context.Context, workspaceID string) ([]member.Member, error)
}

type MemberStoreRepository interface {
	SaveMember(ctx context.Context, item member.Member) error
}

type MessageQueryRepository interface {
	ListMessagesByConversation(ctx context.Context, workspaceID, conversationID string, limit int) ([]message.Message, error)
}

type MessageStoreRepository interface {
	SaveMessage(ctx context.Context, item message.Message) error
}

type RoadmapQueryRepository interface {
	GetWorkspaceRoadmap(ctx context.Context, workspaceID string) (roadmap.Roadmap, error)
	GetConversationRoadmap(ctx context.Context, workspaceID, conversationID string) (roadmap.Roadmap, error)
}

type RoadmapStoreRepository interface {
	SaveRoadmap(ctx context.Context, item roadmap.Roadmap) error
}

type ProjectDataQueryRepository interface {
	GetWorkspaceProjectData(ctx context.Context, workspaceID string) (projectdata.ProjectData, error)
	GetConversationProjectData(ctx context.Context, workspaceID, conversationID string) (projectdata.ProjectData, error)
}

type ProjectDataStoreRepository interface {
	SaveProjectData(ctx context.Context, item projectdata.ProjectData) error
}
