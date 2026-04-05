package conversation

import (
	"errors"
	"strings"
	"time"
)

var (
	ErrInvalidID             = errors.New("conversation id is required")
	ErrInvalidWorkspace      = errors.New("conversation workspaceId is required")
	ErrInvalidKind           = errors.New("conversation kind is invalid")
	ErrInvalidMemberIDs      = errors.New("conversation memberIds must be unique and non-empty")
	ErrInvalidDirectMembers  = errors.New("direct conversation requires exactly 2 members")
	ErrInvalidChannelMembers = errors.New("channel conversation requires at least 1 member")
	ErrInvalidCreatedAt      = errors.New("conversation createdAt is required")
	ErrInvalidUpdatedAt      = errors.New("conversation updatedAt must be >= createdAt")
	ErrInvalidVersion        = errors.New("conversation version must be >= 1")
)

type Kind string

const (
	KindChannel Kind = "channel"
	KindDirect  Kind = "direct"
)

type Conversation struct {
	ID          string
	WorkspaceID string
	Kind        Kind
	Title       string
	MemberIDs   []string
	CreatedAt   time.Time
	UpdatedAt   time.Time
	Version     uint64
}

func (c Conversation) Validate() error {
	if strings.TrimSpace(c.ID) == "" {
		return ErrInvalidID
	}
	if strings.TrimSpace(c.WorkspaceID) == "" {
		return ErrInvalidWorkspace
	}
	if c.Kind != KindChannel && c.Kind != KindDirect {
		return ErrInvalidKind
	}
	seen := make(map[string]struct{}, len(c.MemberIDs))
	for _, memberID := range c.MemberIDs {
		memberID = strings.TrimSpace(memberID)
		if memberID == "" {
			return ErrInvalidMemberIDs
		}
		if _, ok := seen[memberID]; ok {
			return ErrInvalidMemberIDs
		}
		seen[memberID] = struct{}{}
	}
	if c.Kind == KindDirect && len(c.MemberIDs) != 2 {
		return ErrInvalidDirectMembers
	}
	if c.Kind == KindChannel && len(c.MemberIDs) < 1 {
		return ErrInvalidChannelMembers
	}
	if c.CreatedAt.IsZero() {
		return ErrInvalidCreatedAt
	}
	if c.UpdatedAt.IsZero() || c.UpdatedAt.Before(c.CreatedAt) {
		return ErrInvalidUpdatedAt
	}
	if c.Version < 1 {
		return ErrInvalidVersion
	}
	return nil
}

func (c Conversation) IncludesMember(memberID string) bool {
	for _, id := range c.MemberIDs {
		if id == memberID {
			return true
		}
	}
	return false
}
