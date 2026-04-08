// Package taskqueue provides a cross-node task scheduling primitive with
// state machine lifecycle, priority, retry policies, and idempotency keys.
package taskqueue

import (
	"errors"
	"time"
)

var (
	ErrNotFound        = errors.New("taskqueue: not found")
	ErrInvalidID       = errors.New("taskqueue: id is required")
	ErrInvalidType     = errors.New("taskqueue: type is required")
	ErrInvalidPayload  = errors.New("taskqueue: payload is required")
	ErrAlreadyExists   = errors.New("taskqueue: idempotency key already exists")
	ErrInvalidTransition = errors.New("taskqueue: invalid status transition")
	ErrAlreadyClaimed  = errors.New("taskqueue: task already claimed by another node")
)

// TaskStatus represents the lifecycle state of a task.
type TaskStatus string

const (
	TaskStatusPending   TaskStatus = "pending"
	TaskStatusClaimed   TaskStatus = "claimed"
	TaskStatusRunning   TaskStatus = "running"
	TaskStatusCompleted TaskStatus = "completed"
	TaskStatusFailed    TaskStatus = "failed"
	TaskStatusCancelled TaskStatus = "cancelled"
	TaskStatusRetrying  TaskStatus = "retrying"
)

// Priority determines scheduling order. Lower value = higher priority.
type Priority int

const (
	PriorityCritical Priority = 0
	PriorityHigh     Priority = 1
	PriorityNormal   Priority = 2
	PriorityLow      Priority = 3
)

// RetryPolicy defines how a failed task should be retried.
type RetryPolicy struct {
	MaxAttempts int           `json:"maxAttempts"`
	Backoff     time.Duration `json:"backoff"` // base backoff between retries
}

// DefaultRetryPolicy is used when no explicit policy is set.
var DefaultRetryPolicy = RetryPolicy{MaxAttempts: 3, Backoff: 5 * time.Second}

// Task is the core work unit for cross-node scheduling.
type Task struct {
	ID             string
	IdempotencyKey string // client-supplied dedup key; unique per workspace
	WorkspaceID    string
	Type           string // e.g. "code-review", "deploy", "test-run"
	Payload        string // JSON payload for the worker
	Priority       Priority
	Status         TaskStatus

	// Scheduling
	NodeID    string // node that claimed this task (empty if unclaimed)
	AgentID   string // agent executing this task
	QueueName string // logical queue (default: "default")

	// Retry
	Attempts    int
	MaxAttempts int
	LastError   string
	NextRunAt   time.Time // earliest time the task can be picked up

	// Result
	Result string // JSON result from worker

	// Timestamps
	CreatedAt   time.Time
	UpdatedAt   time.Time
	ClaimedAt   time.Time
	StartedAt   time.Time
	CompletedAt time.Time

	// Timeout
	Timeout time.Duration // max execution time; 0 = no timeout
}

// Validate checks required fields.
func (t Task) Validate() error {
	if t.ID == "" {
		return ErrInvalidID
	}
	if t.Type == "" {
		return ErrInvalidType
	}
	if t.Payload == "" {
		return ErrInvalidPayload
	}
	return nil
}

// CanTransitionTo reports whether moving from the current status to next is valid.
func (t Task) CanTransitionTo(next TaskStatus) bool {
	switch t.Status {
	case TaskStatusPending:
		return next == TaskStatusClaimed || next == TaskStatusCancelled
	case TaskStatusClaimed:
		return next == TaskStatusRunning || next == TaskStatusFailed || next == TaskStatusCancelled
	case TaskStatusRunning:
		return next == TaskStatusCompleted || next == TaskStatusFailed || next == TaskStatusCancelled
	case TaskStatusFailed:
		return next == TaskStatusRetrying || next == TaskStatusCancelled
	case TaskStatusRetrying:
		return next == TaskStatusPending || next == TaskStatusCancelled
	case TaskStatusCompleted, TaskStatusCancelled:
		return false // terminal states
	}
	return false
}

// IsTerminal reports whether the task is in a final state.
func (t Task) IsTerminal() bool {
	return t.Status == TaskStatusCompleted || t.Status == TaskStatusCancelled
}

// ShouldRetry reports whether the task can be retried after a failure.
func (t Task) ShouldRetry() bool {
	return t.Status == TaskStatusFailed && t.Attempts < t.MaxAttempts
}

// Query specifies filter criteria for listing tasks.
type Query struct {
	WorkspaceID string
	Status      TaskStatus
	QueueName   string
	NodeID      string
	Type        string
	Limit       int
}

// Stats holds queue-level aggregate metrics.
type Stats struct {
	TotalTasks    int            `json:"totalTasks"`
	ByStatus      map[string]int `json:"byStatus"`
	ByQueue       map[string]int `json:"byQueue"`
	ByNode        map[string]int `json:"byNode"`
	OldestPending *time.Time     `json:"oldestPending,omitempty"`
	AvgWaitMs     int64          `json:"avgWaitMs"`
}
