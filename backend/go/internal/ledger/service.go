package ledger

import (
	"context"
	"errors"
	"fmt"
	"time"
)

// Service records and queries ledger events.
type Service struct {
	repo  Repository
	now   func() time.Time
	idGen func() string
}

// NewService creates a Service backed by repo.
func NewService(repo Repository) *Service {
	return &Service{
		repo:  repo,
		now:   time.Now,
		idGen: defaultIDGen,
	}
}

// Record validates and appends an event.
func (s *Service) Record(ctx context.Context, e LedgerEvent) (LedgerEvent, error) {
	if e.WorkspaceID == "" {
		return LedgerEvent{}, errors.New("workspaceId is required")
	}
	if e.MemberID == "" {
		return LedgerEvent{}, errors.New("memberId is required")
	}
	if e.EventType == "" {
		return LedgerEvent{}, errors.New("eventType is required")
	}
	if e.Summary == "" {
		return LedgerEvent{}, errors.New("summary is required")
	}
	if e.ID == "" {
		e.ID = s.idGen()
	}
	if e.Timestamp.IsZero() {
		e.Timestamp = s.now()
	}
	if e.ContextJSON == "" {
		e.ContextJSON = "{}"
	}
	if err := s.repo.Append(ctx, e); err != nil {
		return LedgerEvent{}, fmt.Errorf("ledger record: %w", err)
	}
	return e, nil
}

// List returns matching events (newest first).
func (s *Service) List(ctx context.Context, q Query) ([]LedgerEvent, error) {
	events, err := s.repo.Query(ctx, q)
	if err != nil {
		return nil, fmt.Errorf("ledger list: %w", err)
	}
	return events, nil
}

func defaultIDGen() string {
	return fmt.Sprintf("led_%d", time.Now().UnixNano())
}
