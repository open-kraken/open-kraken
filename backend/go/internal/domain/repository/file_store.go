package repository

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"

	"open-kraken/backend/go/internal/domain/conversation"
	"open-kraken/backend/go/internal/domain/member"
	"open-kraken/backend/go/internal/domain/message"
	"open-kraken/backend/go/internal/domain/projectdata"
	"open-kraken/backend/go/internal/domain/roadmap"
	"open-kraken/backend/go/internal/domain/workspace"
)

var ErrNotFound = errors.New("domain repository: not found")

// FileStore is the current baseline persistence implementation for domain
// aggregates. It persists JSON documents under <workspaceRoot>/.open-kraken/domain
// and keeps the query dimensions fixed to workspaceId and conversationId so the
// repository interfaces can later be swapped to SQLite/Postgres without changing
// callers.
type FileStore struct {
	root string
	mu   sync.RWMutex
}

func NewFileStore(workspaceRoot string) *FileStore {
	return &FileStore{root: filepath.Join(strings.TrimSpace(workspaceRoot), ".open-kraken", "domain")}
}

func (s *FileStore) GetWorkspace(_ context.Context, workspaceID string) (workspace.Workspace, error) {
	var item workspace.Workspace
	err := s.readJSON(s.workspacePath(workspaceID), &item)
	return item, err
}

func (s *FileStore) SaveWorkspace(_ context.Context, item workspace.Workspace) error {
	if err := item.Validate(); err != nil {
		return err
	}
	return s.writeJSON(s.workspacePath(item.ID), item)
}

func (s *FileStore) GetConversation(_ context.Context, workspaceID, conversationID string) (conversation.Conversation, error) {
	var item conversation.Conversation
	err := s.readJSON(s.conversationPath(workspaceID, conversationID), &item)
	return item, err
}

func (s *FileStore) ListConversationsByWorkspace(_ context.Context, workspaceID string) ([]conversation.Conversation, error) {
	items, err := listJSON[conversation.Conversation](s.conversationDir(workspaceID))
	if err != nil {
		return nil, err
	}
	sort.Slice(items, func(i, j int) bool {
		if items[i].UpdatedAt.Equal(items[j].UpdatedAt) {
			return items[i].ID < items[j].ID
		}
		return items[i].UpdatedAt.Before(items[j].UpdatedAt)
	})
	return items, nil
}

func (s *FileStore) SaveConversation(_ context.Context, item conversation.Conversation) error {
	if err := item.Validate(); err != nil {
		return err
	}
	return s.writeJSON(s.conversationPath(item.WorkspaceID, item.ID), item)
}

func (s *FileStore) GetMember(_ context.Context, workspaceID, memberID string) (member.Member, error) {
	var item member.Member
	err := s.readJSON(s.memberPath(workspaceID, memberID), &item)
	return item, err
}

func (s *FileStore) ListMembersByWorkspace(_ context.Context, workspaceID string) ([]member.Member, error) {
	items, err := listJSON[member.Member](s.memberDir(workspaceID))
	if err != nil {
		return nil, err
	}
	sort.Slice(items, func(i, j int) bool {
		if items[i].Role.Rank() == items[j].Role.Rank() {
			return items[i].ID < items[j].ID
		}
		return items[i].Role.Rank() > items[j].Role.Rank()
	})
	return items, nil
}

func (s *FileStore) SaveMember(_ context.Context, item member.Member) error {
	if err := item.Validate(); err != nil {
		return err
	}
	return s.writeJSON(s.memberPath(item.WorkspaceID, item.ID), item)
}

func (s *FileStore) ListMessagesByConversation(_ context.Context, workspaceID, conversationID string, limit int) ([]message.Message, error) {
	items, err := listJSON[message.Message](s.messageDir(workspaceID, conversationID))
	if err != nil {
		return nil, err
	}
	sort.Slice(items, func(i, j int) bool {
		if items[i].CreatedAt.Equal(items[j].CreatedAt) {
			return items[i].ID < items[j].ID
		}
		return items[i].CreatedAt.Before(items[j].CreatedAt)
	})
	if limit > 0 && len(items) > limit {
		items = items[len(items)-limit:]
	}
	return items, nil
}

func (s *FileStore) SaveMessage(_ context.Context, item message.Message) error {
	if err := item.Validate(); err != nil {
		return err
	}
	return s.writeJSON(s.messagePath(item.WorkspaceID, item.ConversationID, item.ID), item)
}

func (s *FileStore) GetWorkspaceRoadmap(_ context.Context, workspaceID string) (roadmap.Roadmap, error) {
	var item roadmap.Roadmap
	err := s.readJSON(s.workspaceRoadmapPath(workspaceID), &item)
	return item, err
}

func (s *FileStore) GetConversationRoadmap(_ context.Context, workspaceID, conversationID string) (roadmap.Roadmap, error) {
	var item roadmap.Roadmap
	err := s.readJSON(s.conversationRoadmapPath(workspaceID, conversationID), &item)
	return item, err
}

func (s *FileStore) SaveRoadmap(_ context.Context, item roadmap.Roadmap) error {
	if err := item.Validate(); err != nil {
		return err
	}
	target := s.workspaceRoadmapPath(item.WorkspaceID)
	if item.ConversationID != nil {
		target = s.conversationRoadmapPath(item.WorkspaceID, *item.ConversationID)
	}
	return s.writeJSON(target, item)
}

func (s *FileStore) GetWorkspaceProjectData(_ context.Context, workspaceID string) (projectdata.ProjectData, error) {
	var item projectdata.ProjectData
	err := s.readJSON(s.workspaceProjectDataPath(workspaceID), &item)
	return item, err
}

func (s *FileStore) GetConversationProjectData(_ context.Context, workspaceID, conversationID string) (projectdata.ProjectData, error) {
	var item projectdata.ProjectData
	err := s.readJSON(s.conversationProjectDataPath(workspaceID, conversationID), &item)
	return item, err
}

func (s *FileStore) SaveProjectData(_ context.Context, item projectdata.ProjectData) error {
	if err := item.Validate(); err != nil {
		return err
	}
	target := s.workspaceProjectDataPath(item.WorkspaceID)
	if item.ConversationID != nil {
		target = s.conversationProjectDataPath(item.WorkspaceID, *item.ConversationID)
	}
	return s.writeJSON(target, item)
}

func (s *FileStore) workspacePath(workspaceID string) string {
	return filepath.Join(s.root, "workspaces", workspaceID+".json")
}

func (s *FileStore) conversationDir(workspaceID string) string {
	return filepath.Join(s.root, "conversations", workspaceID)
}

func (s *FileStore) conversationPath(workspaceID, conversationID string) string {
	return filepath.Join(s.conversationDir(workspaceID), conversationID+".json")
}

func (s *FileStore) memberDir(workspaceID string) string {
	return filepath.Join(s.root, "members", workspaceID)
}

func (s *FileStore) memberPath(workspaceID, memberID string) string {
	return filepath.Join(s.memberDir(workspaceID), memberID+".json")
}

func (s *FileStore) messageDir(workspaceID, conversationID string) string {
	return filepath.Join(s.root, "messages", workspaceID, conversationID)
}

func (s *FileStore) messagePath(workspaceID, conversationID, messageID string) string {
	return filepath.Join(s.messageDir(workspaceID, conversationID), messageID+".json")
}

func (s *FileStore) workspaceRoadmapPath(workspaceID string) string {
	return filepath.Join(s.root, "roadmaps", "workspaces", workspaceID+".json")
}

func (s *FileStore) conversationRoadmapPath(workspaceID, conversationID string) string {
	return filepath.Join(s.root, "roadmaps", "conversations", workspaceID, conversationID+".json")
}

func (s *FileStore) workspaceProjectDataPath(workspaceID string) string {
	return filepath.Join(s.root, "project-data", "workspaces", workspaceID+".json")
}

func (s *FileStore) conversationProjectDataPath(workspaceID, conversationID string) string {
	return filepath.Join(s.root, "project-data", "conversations", workspaceID, conversationID+".json")
}

func (s *FileStore) writeJSON(target string, value any) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if err := os.MkdirAll(filepath.Dir(target), 0o755); err != nil {
		return err
	}
	data, err := json.MarshalIndent(value, "", "  ")
	if err != nil {
		return err
	}
	data = append(data, '\n')
	return os.WriteFile(target, data, 0o644)
}

func (s *FileStore) readJSON(path string, target any) error {
	s.mu.RLock()
	defer s.mu.RUnlock()
	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return ErrNotFound
		}
		return err
	}
	return json.Unmarshal(data, target)
}

func listJSON[T any](dir string) ([]T, error) {
	entries, err := os.ReadDir(dir)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, err
	}
	items := make([]T, 0, len(entries))
	for _, entry := range entries {
		if entry.IsDir() || filepath.Ext(entry.Name()) != ".json" {
			continue
		}
		data, err := os.ReadFile(filepath.Join(dir, entry.Name()))
		if err != nil {
			return nil, err
		}
		var item T
		if err := json.Unmarshal(data, &item); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, nil
}
