package ledger

import (
	"context"
	"testing"
)

func TestServiceRecordAndList(t *testing.T) {
	repo, err := NewSQLiteRepository(t.TempDir() + "/ledger.db")
	if err != nil {
		t.Fatalf("init repo: %v", err)
	}
	svc := NewService(repo)
	ctx := context.Background()

	e := LedgerEvent{
		WorkspaceID: "ws-1",
		MemberID:    "m-1",
		EventType:   "command.execute",
		Summary:     "deployed to staging",
	}
	saved, err := svc.Record(ctx, e)
	if err != nil {
		t.Fatalf("record: %v", err)
	}
	if saved.ID == "" {
		t.Fatal("expected non-empty ID")
	}
	if saved.Timestamp.IsZero() {
		t.Fatal("expected non-zero timestamp")
	}
	if saved.ContextJSON != "{}" {
		t.Fatalf("expected default context {}, got %s", saved.ContextJSON)
	}

	events, err := svc.List(ctx, Query{WorkspaceID: "ws-1"})
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if len(events) != 1 {
		t.Fatalf("expected 1 event, got %d", len(events))
	}
	if events[0].Summary != "deployed to staging" {
		t.Errorf("expected summary, got %s", events[0].Summary)
	}
}

func TestServiceRecordValidation(t *testing.T) {
	repo, err := NewSQLiteRepository(t.TempDir() + "/ledger.db")
	if err != nil {
		t.Fatalf("init repo: %v", err)
	}
	svc := NewService(repo)
	ctx := context.Background()

	tests := []struct {
		name  string
		event LedgerEvent
	}{
		{"missing workspace", LedgerEvent{MemberID: "m", EventType: "t", Summary: "s"}},
		{"missing member", LedgerEvent{WorkspaceID: "w", EventType: "t", Summary: "s"}},
		{"missing eventType", LedgerEvent{WorkspaceID: "w", MemberID: "m", Summary: "s"}},
		{"missing summary", LedgerEvent{WorkspaceID: "w", MemberID: "m", EventType: "t"}},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			_, err := svc.Record(ctx, tc.event)
			if err == nil {
				t.Fatal("expected validation error")
			}
		})
	}
}

func TestServiceListFiltersByMember(t *testing.T) {
	repo, err := NewSQLiteRepository(t.TempDir() + "/ledger.db")
	if err != nil {
		t.Fatalf("init repo: %v", err)
	}
	svc := NewService(repo)
	ctx := context.Background()

	for _, mid := range []string{"m-1", "m-2", "m-1"} {
		_, err := svc.Record(ctx, LedgerEvent{
			WorkspaceID: "ws-1",
			MemberID:    mid,
			EventType:   "test",
			Summary:     "action by " + mid,
		})
		if err != nil {
			t.Fatalf("record: %v", err)
		}
	}

	events, err := svc.List(ctx, Query{WorkspaceID: "ws-1", MemberID: "m-1"})
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if len(events) != 2 {
		t.Fatalf("expected 2 events for m-1, got %d", len(events))
	}
}
