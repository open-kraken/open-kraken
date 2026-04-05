package tokentrack

import (
	"context"
	"sync"
	"testing"
	"time"

	"open-kraken/backend/go/internal/realtime"
)

// inMemoryTokenRepo is a thread-safe in-memory TokenEventRepository for tests.
type inMemoryTokenRepo struct {
	mu     sync.Mutex
	events []TokenEvent
}

func (r *inMemoryTokenRepo) Append(_ context.Context, e TokenEvent) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.events = append(r.events, e)
	return nil
}

func (r *inMemoryTokenRepo) Query(_ context.Context, q StatsQuery) ([]TokenEvent, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	var out []TokenEvent
	for _, e := range r.events {
		rec := toRecord(e)
		if matchesQuery(rec, q) {
			out = append(out, e)
		}
	}
	return out, nil
}

func newTestTokenService() *Service {
	hub := realtime.NewHub(32)
	svc := NewService(&inMemoryTokenRepo{}, hub)
	return svc
}

func TestRecordEvent(t *testing.T) {
	ctx := context.Background()
	svc := newTestTokenService()

	e := TokenEvent{
		MemberID:     "m1",
		Model:        "claude-3",
		InputTokens:  100,
		OutputTokens: 50,
		Cost:         0.001,
	}
	got, err := svc.RecordEvent(ctx, e)
	if err != nil {
		t.Fatalf("record: %v", err)
	}
	if got.ID == "" {
		t.Error("expected ID to be generated")
	}
	if got.Timestamp.IsZero() {
		t.Error("expected Timestamp to be set")
	}
}

func TestGetStatsFilterByMember(t *testing.T) {
	ctx := context.Background()
	svc := newTestTokenService()

	fixedTime := time.Date(2024, 1, 1, 0, 0, 0, 0, time.UTC)
	svc.now = func() time.Time { return fixedTime }

	events := []TokenEvent{
		{MemberID: "m1", Model: "gpt-4", InputTokens: 100, OutputTokens: 50, Cost: 0.01},
		{MemberID: "m2", Model: "gpt-4", InputTokens: 200, OutputTokens: 80, Cost: 0.02},
		{MemberID: "m1", Model: "claude", InputTokens: 300, OutputTokens: 100, Cost: 0.03},
	}
	for _, e := range events {
		if _, err := svc.RecordEvent(ctx, e); err != nil {
			t.Fatalf("record: %v", err)
		}
	}

	stats, err := svc.GetStats(ctx, StatsQuery{MemberID: "m1"})
	if err != nil {
		t.Fatalf("stats: %v", err)
	}
	if stats.InputTokens != 400 {
		t.Errorf("expected input 400, got %d", stats.InputTokens)
	}
	if stats.OutputTokens != 150 {
		t.Errorf("expected output 150, got %d", stats.OutputTokens)
	}
	if stats.EventCount != 2 {
		t.Errorf("expected 2 events, got %d", stats.EventCount)
	}
	if stats.Scope != "member:m1" {
		t.Errorf("expected scope member:m1, got %q", stats.Scope)
	}
}

func TestGetStatsTeamScope(t *testing.T) {
	ctx := context.Background()
	svc := newTestTokenService()

	for i := 0; i < 3; i++ {
		_, _ = svc.RecordEvent(ctx, TokenEvent{
			MemberID:     "mX",
			Model:        "gpt",
			InputTokens:  10,
			OutputTokens: 5,
		})
	}

	stats, err := svc.GetStats(ctx, StatsQuery{Team: true})
	if err != nil {
		t.Fatalf("stats: %v", err)
	}
	if stats.EventCount != 3 {
		t.Errorf("expected 3 events for team, got %d", stats.EventCount)
	}
	if stats.Scope != "team" {
		t.Errorf("expected scope team, got %q", stats.Scope)
	}
}

func TestListActivityNewestFirst(t *testing.T) {
	ctx := context.Background()
	repo := &inMemoryTokenRepo{}
	hub := realtime.NewHub(32)
	svc := NewService(repo, hub)

	base := time.Date(2024, 3, 1, 0, 0, 0, 0, time.UTC)
	_ = repo.Append(ctx, TokenEvent{ID: "e1", MemberID: "m1", InputTokens: 10, Timestamp: base})
	_ = repo.Append(ctx, TokenEvent{ID: "e2", MemberID: "m1", InputTokens: 20, Timestamp: base.Add(time.Hour)})
	_ = repo.Append(ctx, TokenEvent{ID: "e3", MemberID: "m1", InputTokens: 30, Timestamp: base.Add(2 * time.Hour)})

	events, err := svc.ListActivity(ctx, StatsQuery{MemberID: "m1"})
	if err != nil {
		t.Fatalf("list activity: %v", err)
	}
	if len(events) != 3 {
		t.Fatalf("expected 3 events, got %d", len(events))
	}
	// Newest first: e3, e2, e1.
	if events[0].ID != "e3" {
		t.Errorf("expected e3 first, got %s", events[0].ID)
	}
	if events[2].ID != "e1" {
		t.Errorf("expected e1 last, got %s", events[2].ID)
	}
}

func TestGetStatsTimeWindow(t *testing.T) {
	ctx := context.Background()
	repo := &inMemoryTokenRepo{}
	hub := realtime.NewHub(32)
	svc := NewService(repo, hub)

	base := time.Date(2024, 6, 1, 0, 0, 0, 0, time.UTC)
	events := []TokenEvent{
		{ID: "e1", MemberID: "m1", InputTokens: 100, Timestamp: base},
		{ID: "e2", MemberID: "m1", InputTokens: 200, Timestamp: base.Add(2 * time.Hour)},
		{ID: "e3", MemberID: "m1", InputTokens: 300, Timestamp: base.Add(4 * time.Hour)},
	}
	for _, e := range events {
		_ = repo.Append(ctx, e)
	}

	since := base.Add(time.Hour)
	until := base.Add(3 * time.Hour)
	stats, err := svc.GetStats(ctx, StatsQuery{
		MemberID: "m1",
		Since:    &since,
		Until:    &until,
	})
	if err != nil {
		t.Fatalf("stats: %v", err)
	}
	// Only e2 is within [base+1h, base+3h].
	if stats.EventCount != 1 {
		t.Errorf("expected 1 event in window, got %d", stats.EventCount)
	}
	if stats.InputTokens != 200 {
		t.Errorf("expected 200 input tokens, got %d", stats.InputTokens)
	}
}
