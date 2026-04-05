package projectdata

import (
	"errors"
	"strings"
	"time"

	"open-kraken/backend/go/internal/domain/conversation"
)

var (
	ErrInvalidID             = errors.New("project data id is required")
	ErrInvalidWorkspace      = errors.New("project data workspaceId is required")
	ErrInvalidConversationID = errors.New("project data conversationId must be non-empty when provided")
	ErrInvalidCreatedAt      = errors.New("project data createdAt is required")
	ErrInvalidUpdatedAt      = errors.New("project data updatedAt must be >= createdAt")
	ErrInvalidVersion        = errors.New("project data version must be >= 1")
	ErrInvalidEntryKey       = errors.New("project data entry key is required")
	ErrDuplicateEntryKey     = errors.New("project data entry key must be unique")
	ErrInvalidEntryUpdatedAt = errors.New("project data entry updatedAt must be >= createdAt")
	ErrInvalidEntryVersion   = errors.New("project data entry version must be >= 1")
	ErrConversationScopeLink = errors.New("project data conversation must belong to the same workspace and id")
)

type Entry struct {
	Key       string
	Value     string
	CreatedAt time.Time
	UpdatedAt time.Time
	Version   uint64
}

type ProjectData struct {
	ID             string
	WorkspaceID    string
	ConversationID *string
	Entries        []Entry
	CreatedAt      time.Time
	UpdatedAt      time.Time
	Version        uint64
}

func (p ProjectData) Validate() error {
	if strings.TrimSpace(p.ID) == "" {
		return ErrInvalidID
	}
	if strings.TrimSpace(p.WorkspaceID) == "" {
		return ErrInvalidWorkspace
	}
	if p.ConversationID != nil && strings.TrimSpace(*p.ConversationID) == "" {
		return ErrInvalidConversationID
	}
	if p.CreatedAt.IsZero() {
		return ErrInvalidCreatedAt
	}
	if p.UpdatedAt.IsZero() || p.UpdatedAt.Before(p.CreatedAt) {
		return ErrInvalidUpdatedAt
	}
	if p.Version < 1 {
		return ErrInvalidVersion
	}
	seen := make(map[string]struct{}, len(p.Entries))
	for _, entry := range p.Entries {
		if strings.TrimSpace(entry.Key) == "" {
			return ErrInvalidEntryKey
		}
		if entry.CreatedAt.IsZero() || entry.UpdatedAt.IsZero() || entry.UpdatedAt.Before(entry.CreatedAt) {
			return ErrInvalidEntryUpdatedAt
		}
		if entry.Version < 1 {
			return ErrInvalidEntryVersion
		}
		if _, ok := seen[entry.Key]; ok {
			return ErrDuplicateEntryKey
		}
		seen[entry.Key] = struct{}{}
	}
	return nil
}

func (p ProjectData) ValidateConversationScope(conv conversation.Conversation) error {
	if err := p.Validate(); err != nil {
		return err
	}
	if p.ConversationID == nil {
		return nil
	}
	if err := conv.Validate(); err != nil {
		return err
	}
	if conv.WorkspaceID != p.WorkspaceID || conv.ID != *p.ConversationID {
		return ErrConversationScopeLink
	}
	return nil
}
