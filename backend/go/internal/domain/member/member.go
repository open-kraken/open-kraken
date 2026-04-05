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
