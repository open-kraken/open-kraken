// Package dispatch provides a queued command execution system for routing
// chat messages to terminal sessions with dedup and batching.
package dispatch

import (
	"sync"
	"time"

	"open-kraken/backend/go/internal/terminal/intelligence"
)

// Entry represents a queued dispatch command.
type Entry struct {
	Data           string
	MessageID      string
	ConversationID string
	SenderID       string
	SenderName     string
	QueuedAt       time.Time
}

// Queue manages pending commands for a single terminal session.
// It enforces:
//   - Maximum queue depth (32)
//   - Message deduplication (128-entry window)
//   - Inflight tracking (only one dispatch at a time)
type Queue struct {
	mu        sync.Mutex
	entries   []Entry
	recentIDs []string // ring buffer for dedup
	inflight  bool
	inflightMessageIDs map[string]struct{}
}

// NewQueue creates a dispatch Queue.
func NewQueue() *Queue {
	return &Queue{
		inflightMessageIDs: make(map[string]struct{}),
	}
}

// Enqueue adds a command to the queue. Returns false if the queue is full
// or the message is a duplicate.
func (q *Queue) Enqueue(e Entry) bool {
	q.mu.Lock()
	defer q.mu.Unlock()

	// Check queue limit.
	if len(q.entries) >= intelligence.DispatchQueueLimit {
		return false
	}

	// Dedup check.
	if e.MessageID != "" {
		for _, id := range q.recentIDs {
			if id == e.MessageID {
				return false
			}
		}
		q.recentIDs = append(q.recentIDs, e.MessageID)
		if len(q.recentIDs) > intelligence.DispatchRecentLimit {
			q.recentIDs = q.recentIDs[1:]
		}
	}

	q.entries = append(q.entries, e)
	return true
}

// Dequeue returns the next entry if the queue is not empty and no dispatch
// is inflight. Returns nil if nothing is ready.
func (q *Queue) Dequeue() *Entry {
	q.mu.Lock()
	defer q.mu.Unlock()

	if q.inflight || len(q.entries) == 0 {
		return nil
	}

	e := q.entries[0]
	q.entries = q.entries[1:]
	q.inflight = true
	if e.MessageID != "" {
		q.inflightMessageIDs[e.MessageID] = struct{}{}
	}
	return &e
}

// DequeueBatch returns all pending entries merged with the batch separator.
// Used when multiple messages target the same terminal.
func (q *Queue) DequeueBatch() []Entry {
	q.mu.Lock()
	defer q.mu.Unlock()

	if q.inflight || len(q.entries) == 0 {
		return nil
	}

	batch := make([]Entry, len(q.entries))
	copy(batch, q.entries)
	q.entries = q.entries[:0]
	q.inflight = true
	for _, e := range batch {
		if e.MessageID != "" {
			q.inflightMessageIDs[e.MessageID] = struct{}{}
		}
	}
	return batch
}

// AckInflight marks the current inflight dispatch as completed.
func (q *Queue) AckInflight() {
	q.mu.Lock()
	defer q.mu.Unlock()
	q.inflight = false
	q.inflightMessageIDs = make(map[string]struct{})
}

// FailInflight marks the current inflight dispatch as failed, allowing
// the next dequeue.
func (q *Queue) FailInflight() {
	q.mu.Lock()
	defer q.mu.Unlock()
	q.inflight = false
	q.inflightMessageIDs = make(map[string]struct{})
}

// Len returns the current queue length.
func (q *Queue) Len() int {
	q.mu.Lock()
	defer q.mu.Unlock()
	return len(q.entries)
}

// IsInflight returns true if a dispatch is in progress.
func (q *Queue) IsInflight() bool {
	q.mu.Lock()
	defer q.mu.Unlock()
	return q.inflight
}

// MergeBatchData combines multiple entries into a single string with
// the standard batch separator.
func MergeBatchData(entries []Entry) string {
	if len(entries) == 0 {
		return ""
	}
	if len(entries) == 1 {
		return entries[0].Data
	}
	result := entries[0].Data
	for _, e := range entries[1:] {
		result += intelligence.DispatchBatchSeparator + e.Data
	}
	return result
}
