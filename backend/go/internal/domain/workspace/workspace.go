package workspace

import (
	"errors"
	"strings"
	"time"
)

var (
	ErrInvalidID        = errors.New("workspace id is required")
	ErrInvalidName      = errors.New("workspace name is required")
	ErrInvalidRootPath  = errors.New("workspace root path is required")
	ErrInvalidStatus    = errors.New("workspace status is invalid")
	ErrInvalidCreatedAt = errors.New("workspace createdAt is required")
	ErrInvalidUpdatedAt = errors.New("workspace updatedAt must be >= createdAt")
	ErrInvalidVersion   = errors.New("workspace version must be >= 1")
)

type Status string

const (
	StatusActive   Status = "active"
	StatusArchived Status = "archived"
)

type Workspace struct {
	ID        string
	Name      string
	RootPath  string
	Status    Status
	CreatedAt time.Time
	UpdatedAt time.Time
	Version   uint64
}

func (w Workspace) Validate() error {
	if strings.TrimSpace(w.ID) == "" {
		return ErrInvalidID
	}
	if strings.TrimSpace(w.Name) == "" {
		return ErrInvalidName
	}
	if strings.TrimSpace(w.RootPath) == "" {
		return ErrInvalidRootPath
	}
	if w.Status != StatusActive && w.Status != StatusArchived {
		return ErrInvalidStatus
	}
	if w.CreatedAt.IsZero() {
		return ErrInvalidCreatedAt
	}
	if w.UpdatedAt.IsZero() || w.UpdatedAt.Before(w.CreatedAt) {
		return ErrInvalidUpdatedAt
	}
	if w.Version < 1 {
		return ErrInvalidVersion
	}
	return nil
}
