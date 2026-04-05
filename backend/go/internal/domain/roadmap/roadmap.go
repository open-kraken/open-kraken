package roadmap

import (
	"errors"
	"strings"
	"time"

	"open-kraken/backend/go/internal/domain/conversation"
)

var (
	ErrInvalidID             = errors.New("roadmap id is required")
	ErrInvalidWorkspace      = errors.New("roadmap workspaceId is required")
	ErrInvalidConversationID = errors.New("roadmap conversationId must be non-empty when provided")
	ErrInvalidCreatedAt      = errors.New("roadmap createdAt is required")
	ErrInvalidUpdatedAt      = errors.New("roadmap updatedAt must be >= createdAt")
	ErrInvalidVersion        = errors.New("roadmap version must be >= 1")
	ErrInvalidItemID         = errors.New("roadmap item id is required")
	ErrInvalidItemTitle      = errors.New("roadmap item title is required")
	ErrInvalidItemStatus     = errors.New("roadmap item status is invalid")
	ErrInvalidItemOrdering   = errors.New("roadmap items must be strictly ordered by position")
	ErrInvalidItemVersion    = errors.New("roadmap item version must be >= 1")
	ErrDuplicateItemID       = errors.New("roadmap item id must be unique")
	ErrConversationScopeLink = errors.New("roadmap conversation must belong to the same workspace and id")
)

type Status string

const (
	StatusTodo       Status = "todo"
	StatusInProgress Status = "in_progress"
	StatusBlocked    Status = "blocked"
	StatusDone       Status = "done"
)

type Item struct {
	ID        string
	Title     string
	Status    Status
	Position  int
	CreatedAt time.Time
	UpdatedAt time.Time
	Version   uint64
}

type Roadmap struct {
	ID             string
	WorkspaceID    string
	ConversationID *string
	Items          []Item
	CreatedAt      time.Time
	UpdatedAt      time.Time
	Version        uint64
}

func (r Roadmap) Validate() error {
	if strings.TrimSpace(r.ID) == "" {
		return ErrInvalidID
	}
	if strings.TrimSpace(r.WorkspaceID) == "" {
		return ErrInvalidWorkspace
	}
	if r.ConversationID != nil && strings.TrimSpace(*r.ConversationID) == "" {
		return ErrInvalidConversationID
	}
	if r.CreatedAt.IsZero() {
		return ErrInvalidCreatedAt
	}
	if r.UpdatedAt.IsZero() || r.UpdatedAt.Before(r.CreatedAt) {
		return ErrInvalidUpdatedAt
	}
	if r.Version < 1 {
		return ErrInvalidVersion
	}
	seen := make(map[string]struct{}, len(r.Items))
	lastPosition := -1
	for _, item := range r.Items {
		if strings.TrimSpace(item.ID) == "" {
			return ErrInvalidItemID
		}
		if strings.TrimSpace(item.Title) == "" {
			return ErrInvalidItemTitle
		}
		if item.Status != StatusTodo && item.Status != StatusInProgress && item.Status != StatusBlocked && item.Status != StatusDone {
			return ErrInvalidItemStatus
		}
		if item.Position <= lastPosition {
			return ErrInvalidItemOrdering
		}
		if item.CreatedAt.IsZero() || item.UpdatedAt.IsZero() || item.UpdatedAt.Before(item.CreatedAt) {
			return ErrInvalidUpdatedAt
		}
		if item.Version < 1 {
			return ErrInvalidItemVersion
		}
		if _, ok := seen[item.ID]; ok {
			return ErrDuplicateItemID
		}
		seen[item.ID] = struct{}{}
		lastPosition = item.Position
	}
	return nil
}

func (r Roadmap) ValidateConversationScope(conv conversation.Conversation) error {
	if err := r.Validate(); err != nil {
		return err
	}
	if r.ConversationID == nil {
		return nil
	}
	if err := conv.Validate(); err != nil {
		return err
	}
	if conv.WorkspaceID != r.WorkspaceID || conv.ID != *r.ConversationID {
		return ErrConversationScopeLink
	}
	return nil
}
