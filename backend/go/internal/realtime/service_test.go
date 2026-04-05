package realtime

import (
	"errors"
	"testing"
	"time"
)

func TestSubscribeInitialSnapshot(t *testing.T) {
	hub := NewHub(8)
	hub.Publish(Event{
		Name:        EventChatSnapshot,
		WorkspaceID: "ws-1",
		ChannelID:   "conv-1",
		Payload: ChatSnapshotPayload{
			ConversationID: "conv-1",
			MessageIDs:     []string{"m-1", "m-2"},
		},
	})
	hub.Publish(Event{
		Name:        EventPresenceSnapshot,
		WorkspaceID: "ws-1",
		Payload: PresenceSnapshotPayload{
			Members: []PresenceMember{{
				MemberID:       "member-1",
				PresenceState:  "online",
				TerminalStatus: "attached",
				LastHeartbeat:  time.Unix(10, 0).UTC(),
			}},
		},
	})

	result, err := hub.Subscribe(SubscribeRequest{WorkspaceID: "ws-1"})
	if err != nil {
		t.Fatalf("subscribe: %v", err)
	}
	defer result.Subscription.Close()

	if result.Mode != "snapshot" || result.ResyncRequired {
		t.Fatalf("unexpected subscribe mode: %+v", result)
	}
	if len(result.Events) != 2 {
		t.Fatalf("expected 2 snapshot events, got %d", len(result.Events))
	}
	if result.Events[0].Name != EventChatSnapshot || result.Events[1].Name != EventPresenceSnapshot {
		t.Fatalf("unexpected snapshot order: %+v", result.Events)
	}
}

func TestReconnectReplaysBufferedEvents(t *testing.T) {
	hub := NewHub(8)
	first := hub.Publish(Event{
		Name:        EventTerminalSnapshot,
		WorkspaceID: "ws-1",
		TerminalID:  "term-1",
		Payload: TerminalSnapshotPayload{
			TerminalID:      "term-1",
			ConnectionState: "attached",
			ProcessState:    "running",
			Rows:            24,
			Cols:            80,
			Buffer:          "boot",
		},
	})
	second := hub.Publish(Event{
		Name:        EventTerminalDelta,
		WorkspaceID: "ws-1",
		TerminalID:  "term-1",
		Payload: TerminalDeltaPayload{
			TerminalID: "term-1",
			Sequence:   2,
			Data:       "ls\n",
		},
	})
	third := hub.Publish(Event{
		Name:        EventTerminalStatus,
		WorkspaceID: "ws-1",
		TerminalID:  "term-1",
		Payload: TerminalStatusPayload{
			TerminalID:      "term-1",
			ConnectionState: "detached",
			ProcessState:    "running",
			Reason:          "network_disconnect",
		},
	})

	result, err := hub.Subscribe(SubscribeRequest{
		WorkspaceID: "ws-1",
		TerminalIDs: []string{"term-1"},
		Cursor:      first.Cursor,
	})
	if err != nil {
		t.Fatalf("subscribe replay: %v", err)
	}
	defer result.Subscription.Close()

	if result.Mode != "replay" || result.ResyncRequired {
		t.Fatalf("unexpected replay result: %+v", result)
	}
	if len(result.Events) != 2 {
		t.Fatalf("expected 2 replay events, got %d", len(result.Events))
	}
	if result.Events[0].Cursor != second.Cursor || result.Events[1].Cursor != third.Cursor {
		t.Fatalf("unexpected replay events: %+v", result.Events)
	}
}

func TestUnknownCursorFallsBackToSnapshot(t *testing.T) {
	hub := NewHub(2)
	hub.Publish(Event{
		Name:        EventRoadmapSnapshot,
		WorkspaceID: "ws-1",
		Payload: RoadmapSnapshotPayload{
			WorkspaceID: "ws-1",
			ItemIDs:     []string{"rm-1"},
			Version:     1,
		},
	})
	hub.Publish(Event{
		Name:        EventRoadmapUpdated,
		WorkspaceID: "ws-1",
		Payload: RoadmapUpdatedPayload{
			WorkspaceID: "ws-1",
			Version:     2,
			Reason:      "edit",
		},
	})
	hub.Publish(Event{
		Name:        EventRoadmapDelta,
		WorkspaceID: "ws-1",
		Payload: RoadmapDeltaPayload{
			WorkspaceID: "ws-1",
			ItemID:      "rm-2",
			Operation:   "insert",
			Version:     2,
		},
	})
	hub.Publish(Event{
		Name:        EventRoadmapUpdated,
		WorkspaceID: "ws-1",
		Payload: RoadmapUpdatedPayload{
			WorkspaceID: "ws-1",
			Version:     3,
			Reason:      "second_edit",
		},
	})

	result, err := hub.Subscribe(SubscribeRequest{
		WorkspaceID: "ws-1",
		Cursor:      "rt_00000000000000000001",
	})
	if err != nil {
		t.Fatalf("subscribe expired cursor: %v", err)
	}
	defer result.Subscription.Close()

	if result.Mode != "snapshot" || !result.ResyncRequired {
		t.Fatalf("expected resync snapshot result, got %+v", result)
	}
	if len(result.Events) != 1 || result.Events[0].Name != EventRoadmapSnapshot {
		t.Fatalf("unexpected resync events: %+v", result.Events)
	}
}

func TestFutureCursorIsRejected(t *testing.T) {
	hub := NewHub(2)
	hub.Publish(Event{
		Name:        EventRoadmapSnapshot,
		WorkspaceID: "ws-1",
		Payload: RoadmapSnapshotPayload{
			WorkspaceID: "ws-1",
			ItemIDs:     []string{"rm-1"},
			Version:     1,
		},
	})

	_, err := hub.Subscribe(SubscribeRequest{
		WorkspaceID: "ws-1",
		Cursor:      NewCursor(99),
	})
	if !errors.Is(err, ErrCursorAhead) {
		t.Fatalf("expected ErrCursorAhead, got %v", err)
	}
}

func TestTerminalDeltaPreservesOrderForLiveSubscribers(t *testing.T) {
	hub := NewHub(8)
	result, err := hub.Subscribe(SubscribeRequest{
		WorkspaceID: "ws-1",
		TerminalIDs: []string{"term-1"},
	})
	if err != nil {
		t.Fatalf("subscribe live: %v", err)
	}
	defer result.Subscription.Close()

	first := hub.Publish(Event{
		Name:        EventTerminalDelta,
		WorkspaceID: "ws-1",
		TerminalID:  "term-1",
		Payload:     TerminalDeltaPayload{TerminalID: "term-1", Sequence: 1, Data: "a"},
	})
	second := hub.Publish(Event{
		Name:        EventTerminalDelta,
		WorkspaceID: "ws-1",
		TerminalID:  "term-1",
		Payload:     TerminalDeltaPayload{TerminalID: "term-1", Sequence: 2, Data: "b"},
	})

	gotFirst := <-result.Subscription.Events
	gotSecond := <-result.Subscription.Events
	if gotFirst.Cursor != first.Cursor || gotSecond.Cursor != second.Cursor {
		t.Fatalf("delta order mismatch: first=%+v second=%+v", gotFirst, gotSecond)
	}
}

func TestPresenceSnapshotAndHeartbeatStayDistinctFromTerminalStatus(t *testing.T) {
	hub := NewHub(8)
	snap := hub.Publish(Event{
		Name:        EventPresenceSnapshot,
		WorkspaceID: "ws-1",
		Payload: PresenceSnapshotPayload{
			Members: []PresenceMember{{
				MemberID:       "member-1",
				PresenceState:  "online",
				TerminalStatus: "attached",
				LastHeartbeat:  time.Unix(20, 0).UTC(),
			}},
		},
	})

	result, err := hub.Subscribe(SubscribeRequest{
		WorkspaceID: "ws-1",
		MemberIDs:   []string{"member-1"},
		Cursor:      snap.Cursor,
	})
	if err != nil {
		t.Fatalf("subscribe heartbeat: %v", err)
	}
	defer result.Subscription.Close()

	hub.Publish(Event{
		Name:        EventPresenceHeartbeat,
		WorkspaceID: "ws-1",
		MemberID:    "member-1",
		Payload: PresenceHeartbeatPayload{
			MemberID:      "member-1",
			PresenceState: "online",
			SentAt:        time.Unix(21, 0).UTC(),
		},
	})
	hub.Publish(Event{
		Name:        EventTerminalStatus,
		WorkspaceID: "ws-1",
		MemberID:    "member-1",
		TerminalID:  "term-1",
		Payload: TerminalStatusPayload{
			TerminalID:      "term-1",
			ConnectionState: "detached",
			ProcessState:    "running",
			Reason:          "viewer_left",
		},
	})

	gotHeartbeat := <-result.Subscription.Events
	gotTerminal := <-result.Subscription.Events
	if gotHeartbeat.Name != EventPresenceHeartbeat {
		t.Fatalf("expected heartbeat event, got %+v", gotHeartbeat)
	}
	if gotTerminal.Name != EventTerminalStatus {
		t.Fatalf("expected terminal status event, got %+v", gotTerminal)
	}
}

func TestAckRejectsFutureCursor(t *testing.T) {
	hub := NewHub(4)
	result, err := hub.Subscribe(SubscribeRequest{WorkspaceID: "ws-1"})
	if err != nil {
		t.Fatalf("subscribe: %v", err)
	}
	defer result.Subscription.Close()

	if err := result.Subscription.Ack(NewCursor(1)); err == nil {
		t.Fatal("expected ack to reject undelivered cursor")
	}
}
