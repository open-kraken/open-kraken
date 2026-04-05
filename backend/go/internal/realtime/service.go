package realtime

import (
	"slices"
	"sync"
	"time"
)

type Hub struct {
	mu             sync.RWMutex
	replayCapacity int
	nextSequence   uint64
	history        []Event
	snapshots      map[string]Event
	subscribers    map[*Subscription]struct{}
}

type filter struct {
	workspaceID string
	channelIDs  map[string]struct{}
	terminalIDs map[string]struct{}
	memberIDs   map[string]struct{}
}

func NewHub(replayCapacity int) *Hub {
	if replayCapacity < 1 {
		replayCapacity = 1
	}
	return &Hub{
		replayCapacity: replayCapacity,
		snapshots:      make(map[string]Event),
		subscribers:    make(map[*Subscription]struct{}),
	}
}

func (h *Hub) Publish(event Event) Event {
	h.mu.Lock()
	defer h.mu.Unlock()

	h.nextSequence++
	if event.OccurredAt.IsZero() {
		event.OccurredAt = time.Now().UTC()
	}
	event.Cursor = NewCursor(h.nextSequence)

	if isSnapshotEvent(event.Name) {
		h.snapshots[snapshotKey(event)] = event
	}

	h.history = append(h.history, event)
	if len(h.history) > h.replayCapacity {
		h.history = slices.Clone(h.history[len(h.history)-h.replayCapacity:])
	}

	for sub := range h.subscribers {
		if matches(sub.filter, event) {
			sub.events <- event
			sub.state.lastDelivered = h.nextSequence
		}
	}

	return event
}

func (h *Hub) LatestCursor() string {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return NewCursor(h.nextSequence)
}

func (h *Hub) Subscribe(req SubscribeRequest) (*SubscribeResult, error) {
	h.mu.Lock()
	defer h.mu.Unlock()

	sub := &Subscription{
		events: make(chan Event, h.replayCapacity+4),
		filter: newFilter(req),
		hub:    h,
	}
	sub.Events = sub.events
	h.subscribers[sub] = struct{}{}

	var events []Event
	seq, err := ParseCursor(req.Cursor)
	if err != nil {
		delete(h.subscribers, sub)
		close(sub.events)
		return nil, err
	}

	result := &SubscribeResult{
		Mode:         "snapshot",
		LatestCursor: NewCursor(h.nextSequence),
		Subscription: sub,
	}

	if seq == 0 {
		events = h.snapshotEventsLocked(sub.filter)
	} else if replay, ok, replayErr := h.replayEventsLocked(seq, sub.filter); replayErr != nil {
		delete(h.subscribers, sub)
		close(sub.events)
		return nil, replayErr
	} else if ok {
		events = replay
		result.Mode = "replay"
	} else {
		events = h.snapshotEventsLocked(sub.filter)
		result.Mode = "snapshot"
		result.ResyncRequired = true
	}

	if len(events) > 0 {
		lastSeq, _ := ParseCursor(events[len(events)-1].Cursor)
		sub.state.lastDelivered = lastSeq
		result.LatestCursor = events[len(events)-1].Cursor
	}
	result.Events = events
	return result, nil
}

func (h *Hub) unsubscribe(sub *Subscription) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if _, ok := h.subscribers[sub]; ok {
		delete(h.subscribers, sub)
		close(sub.events)
	}
}

func (h *Hub) replayEventsLocked(after uint64, f filter) ([]Event, bool, error) {
	if len(h.history) == 0 {
		if after == 0 {
			return nil, true, nil
		}
		return nil, false, nil
	}
	oldest, _ := ParseCursor(h.history[0].Cursor)
	if after > h.nextSequence {
		return nil, false, ErrCursorAhead
	}
	if after < oldest-1 {
		return nil, false, nil
	}
	events := make([]Event, 0, len(h.history))
	for _, event := range h.history {
		seq, _ := ParseCursor(event.Cursor)
		if seq <= after {
			continue
		}
		if matches(f, event) {
			events = append(events, event)
		}
	}
	return events, true, nil
}

func (h *Hub) snapshotEventsLocked(f filter) []Event {
	events := make([]Event, 0, len(h.snapshots))
	for _, event := range h.snapshots {
		if matches(f, event) {
			events = append(events, event)
		}
	}
	slices.SortFunc(events, func(a, b Event) int {
		seqA, _ := ParseCursor(a.Cursor)
		seqB, _ := ParseCursor(b.Cursor)
		switch {
		case seqA < seqB:
			return -1
		case seqA > seqB:
			return 1
		default:
			return 0
		}
	})
	return events
}

func newFilter(req SubscribeRequest) filter {
	return filter{
		workspaceID: req.WorkspaceID,
		channelIDs:  toSet(req.ChannelIDs),
		terminalIDs: toSet(req.TerminalIDs),
		memberIDs:   toSet(req.MemberIDs),
	}
}

func toSet(values []string) map[string]struct{} {
	if len(values) == 0 {
		return nil
	}
	set := make(map[string]struct{}, len(values))
	for _, value := range values {
		if value == "" {
			continue
		}
		set[value] = struct{}{}
	}
	if len(set) == 0 {
		return nil
	}
	return set
}

func matches(f filter, event Event) bool {
	if f.workspaceID != "" && event.WorkspaceID != f.workspaceID {
		return false
	}
	if len(f.channelIDs) > 0 {
		if _, ok := f.channelIDs[event.ChannelID]; !ok {
			return false
		}
	}
	if len(f.terminalIDs) > 0 {
		if _, ok := f.terminalIDs[event.TerminalID]; !ok {
			return false
		}
	}
	if len(f.memberIDs) > 0 {
		if _, ok := f.memberIDs[event.MemberID]; !ok {
			return false
		}
	}
	return true
}

func isSnapshotEvent(name string) bool {
	switch name {
	case EventChatSnapshot, EventTerminalSnapshot, EventPresenceSnapshot, EventRoadmapSnapshot:
		return true
	default:
		return false
	}
}

func snapshotKey(event Event) string {
	switch event.Name {
	case EventChatSnapshot:
		return event.Name + ":" + event.WorkspaceID + ":" + event.ChannelID
	case EventTerminalSnapshot:
		return event.Name + ":" + event.WorkspaceID + ":" + event.TerminalID
	case EventPresenceSnapshot:
		return event.Name + ":" + event.WorkspaceID
	case EventRoadmapSnapshot:
		return event.Name + ":" + event.WorkspaceID
	default:
		return event.Name + ":" + event.WorkspaceID + ":" + event.MemberID + ":" + event.TerminalID + ":" + event.ChannelID
	}
}
