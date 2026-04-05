package tokentrack

import (
	"context"
	"fmt"
	"time"

	"open-kraken/backend/go/internal/realtime"
)

// Service handles token event ingestion and aggregated statistics queries.
type Service struct {
	repo TokenEventRepository
	hub  *realtime.Hub
	// now is injectable for deterministic testing.
	now func() time.Time
	// idGen generates unique event IDs.
	idGen func() string
}

// NewService creates a tokentrack Service backed by repo and hub.
func NewService(repo TokenEventRepository, hub *realtime.Hub) *Service {
	return &Service{
		repo:  repo,
		hub:   hub,
		now:   time.Now,
		idGen: defaultIDGen,
	}
}

// RecordEvent persists a token usage event and broadcasts token.stats_updated.
// The event's Timestamp is set to now when zero.
func (s *Service) RecordEvent(ctx context.Context, e TokenEvent) (TokenEvent, error) {
	if e.ID == "" {
		e.ID = s.idGen()
	}
	if e.Timestamp.IsZero() {
		e.Timestamp = s.now()
	}
	if err := s.repo.Append(ctx, e); err != nil {
		return TokenEvent{}, fmt.Errorf("tokentrack record: %w", err)
	}
	s.publishStatsUpdated(e.MemberID, e.NodeID)
	return e, nil
}

// ListActivity returns a time-ordered slice of raw token events matching the
// query. This powers the AgentActivityPanel timeline view.
// Events are returned in descending timestamp order (newest first).
func (s *Service) ListActivity(ctx context.Context, q StatsQuery) ([]TokenEvent, error) {
	events, err := s.repo.Query(ctx, q)
	if err != nil {
		return nil, fmt.Errorf("tokentrack activity: %w", err)
	}
	// Sort newest-first so callers receive the most recent activity at index 0.
	sortDescByTimestamp(events)
	return events, nil
}

// GetStats computes aggregated token statistics for the given query.
func (s *Service) GetStats(ctx context.Context, q StatsQuery) (TokenStats, error) {
	events, err := s.repo.Query(ctx, q)
	if err != nil {
		return TokenStats{}, fmt.Errorf("tokentrack stats: %w", err)
	}
	return aggregate(events, q), nil
}

// aggregate reduces a slice of events into a single TokenStats value.
func aggregate(events []TokenEvent, q StatsQuery) TokenStats {
	var stats TokenStats
	switch {
	case q.Team:
		stats.Scope = "team"
	case q.MemberID != "":
		stats.Scope = "member:" + q.MemberID
	case q.NodeID != "":
		stats.Scope = "node:" + q.NodeID
	default:
		stats.Scope = "all"
	}

	for _, e := range events {
		stats.InputTokens += e.InputTokens
		stats.OutputTokens += e.OutputTokens
		stats.TotalCost += e.Cost
		stats.EventCount++
	}
	stats.TotalTokens = stats.InputTokens + stats.OutputTokens
	return stats
}

func (s *Service) publishStatsUpdated(memberID, nodeID string) {
	s.hub.Publish(realtime.Event{
		Name: realtime.EventTokenStatsUpdated,
		Payload: realtime.TokenStatsUpdatedPayload{
			MemberID: memberID,
			NodeID:   nodeID,
		},
	})
}

// defaultIDGen generates a simple time-based ID for token events.
// In production, use a proper UUID library.
func defaultIDGen() string {
	return fmt.Sprintf("tok_%d", time.Now().UnixNano())
}

// sortDescByTimestamp sorts events newest-first (descending Timestamp).
func sortDescByTimestamp(events []TokenEvent) {
	for i := 0; i < len(events); i++ {
		for j := i + 1; j < len(events); j++ {
			if events[j].Timestamp.After(events[i].Timestamp) {
				events[i], events[j] = events[j], events[i]
			}
		}
	}
}
