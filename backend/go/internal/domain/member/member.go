package member

import (
	"errors"
	"strings"
	"time"

	"open-kraken/backend/go/internal/domain/role"
)

var (
	ErrInvalidID        = errors.New("member id is required")
	ErrInvalidWorkspace = errors.New("member workspaceId is required")
	ErrInvalidUserID    = errors.New("member userId is required")
	ErrInvalidStatus    = errors.New("member status is invalid")
	ErrInvalidCreatedAt = errors.New("member createdAt is required")
	ErrInvalidUpdatedAt = errors.New("member updatedAt must be >= createdAt")
	ErrInvalidVersion   = errors.New("member version must be >= 1")
)

type Status string

const (
	StatusInvited   Status = "invited"
	StatusActive    Status = "active"
	StatusSuspended Status = "suspended"
)

// PresenceStatus represents the user-set availability status.
type PresenceStatus string

const (
	PresenceOnline  PresenceStatus = "online"
	PresenceWorking PresenceStatus = "working"
	PresenceDND     PresenceStatus = "dnd"
	PresenceOffline PresenceStatus = "offline"
)

type Member struct {
	ID          string
	WorkspaceID string
	UserID      string
	DisplayName string
	Role        role.Name
	Status      Status
	CreatedAt   time.Time
	UpdatedAt   time.Time
	Version     uint64

	// Terminal-related fields (Phase 3 — provider integration).
	TerminalType    string `json:"terminalType,omitempty"`    // claude/gemini/codex/opencode/qwen/shell
	TerminalCommand string `json:"terminalCommand,omitempty"` // custom command override
	TerminalPath    string `json:"terminalPath,omitempty"`    // working directory for terminal
	Avatar          string `json:"avatar,omitempty"`          // display avatar identifier

	// Presence fields (Phase 5 — presence service).
	ManualStatus   PresenceStatus `json:"manualStatus,omitempty"` // user-set DND/online status
	TerminalStatus string         `json:"terminalStatus,omitempty"`
}

// IsDND returns true if the member has set Do-Not-Disturb.
func (m Member) IsDND() bool {
	return m.ManualStatus == PresenceDND
}

func (m Member) Validate() error {
	if strings.TrimSpace(m.ID) == "" {
		return ErrInvalidID
	}
	if strings.TrimSpace(m.WorkspaceID) == "" {
		return ErrInvalidWorkspace
	}
	if strings.TrimSpace(m.UserID) == "" {
		return ErrInvalidUserID
	}
	if err := m.Role.Validate(); err != nil {
		return err
	}
	if m.Status != StatusInvited && m.Status != StatusActive && m.Status != StatusSuspended {
		return ErrInvalidStatus
	}
	if m.CreatedAt.IsZero() {
		return ErrInvalidCreatedAt
	}
	if m.UpdatedAt.IsZero() || m.UpdatedAt.Before(m.CreatedAt) {
		return ErrInvalidUpdatedAt
	}
	if m.Version < 1 {
		return ErrInvalidVersion
	}
	return nil
}
