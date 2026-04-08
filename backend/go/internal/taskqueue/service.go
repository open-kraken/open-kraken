package taskqueue

import (
	"context"
	"fmt"
	"time"

	"open-kraken/backend/go/internal/realtime"
)

// Service manages the task queue lifecycle: enqueue, claim, ack, nack, cancel.
type Service struct {
	repo Repository
	hub  *realtime.Hub
	now  func() time.Time
	idGen func() string
}

// NewService creates a task queue Service.
func NewService(repo Repository, hub *realtime.Hub) *Service {
	return &Service{
		repo:  repo,
		hub:   hub,
		now:   time.Now,
		idGen: defaultTaskIDGen,
	}
}

// Enqueue adds a new task to the queue. If an idempotency key is provided and
// a task with that key already exists, the existing task is returned.
func (s *Service) Enqueue(ctx context.Context, t Task) (Task, error) {
	if t.ID == "" {
		t.ID = s.idGen()
	}
	now := s.now()
	t.Status = TaskStatusPending
	t.CreatedAt = now
	t.UpdatedAt = now
	if t.QueueName == "" {
		t.QueueName = "default"
	}
	if t.MaxAttempts == 0 {
		t.MaxAttempts = DefaultRetryPolicy.MaxAttempts
	}
	if t.NextRunAt.IsZero() {
		t.NextRunAt = now
	}

	if err := t.Validate(); err != nil {
		return Task{}, err
	}

	// Idempotency check.
	if t.IdempotencyKey != "" {
		existing, err := s.repo.FindByIdempotencyKey(ctx, t.WorkspaceID, t.IdempotencyKey)
		if err == nil {
			return existing, nil // already exists, return it
		}
	}

	if err := s.repo.Insert(ctx, t); err != nil {
		return Task{}, fmt.Errorf("taskqueue enqueue: %w", err)
	}
	s.publishEvent("task.enqueued", t)
	return t, nil
}

// Claim finds the next available task in the given queue for the node.
// Returns ErrNotFound when the queue is empty.
func (s *Service) Claim(ctx context.Context, queueName, nodeID string) (Task, error) {
	if queueName == "" {
		queueName = "default"
	}
	t, err := s.repo.ClaimNext(ctx, queueName, nodeID)
	if err != nil {
		return Task{}, fmt.Errorf("taskqueue claim: %w", err)
	}
	s.publishEvent("task.claimed", t)
	return t, nil
}

// Start marks a claimed task as running. The node that claimed the task
// must provide its nodeID for verification.
func (s *Service) Start(ctx context.Context, taskID, nodeID string) (Task, error) {
	t, err := s.repo.Get(ctx, taskID)
	if err != nil {
		return Task{}, fmt.Errorf("taskqueue start: %w", err)
	}
	if t.NodeID != nodeID {
		return Task{}, ErrAlreadyClaimed
	}
	if !t.CanTransitionTo(TaskStatusRunning) {
		return Task{}, ErrInvalidTransition
	}
	now := s.now()
	t.Status = TaskStatusRunning
	t.StartedAt = now
	t.UpdatedAt = now
	if err := s.repo.Update(ctx, t); err != nil {
		return Task{}, fmt.Errorf("taskqueue start: %w", err)
	}
	s.publishEvent("task.started", t)
	return t, nil
}

// Ack marks a running task as completed with an optional result payload.
func (s *Service) Ack(ctx context.Context, taskID, nodeID, result string) (Task, error) {
	t, err := s.repo.Get(ctx, taskID)
	if err != nil {
		return Task{}, fmt.Errorf("taskqueue ack: %w", err)
	}
	if t.NodeID != nodeID {
		return Task{}, ErrAlreadyClaimed
	}
	if !t.CanTransitionTo(TaskStatusCompleted) {
		return Task{}, ErrInvalidTransition
	}
	now := s.now()
	t.Status = TaskStatusCompleted
	t.Result = result
	t.CompletedAt = now
	t.UpdatedAt = now
	if err := s.repo.Update(ctx, t); err != nil {
		return Task{}, fmt.Errorf("taskqueue ack: %w", err)
	}
	s.publishEvent("task.completed", t)
	return t, nil
}

// Nack marks a task as failed. If retries remain, the task is re-queued with
// backoff; otherwise it stays in failed state.
func (s *Service) Nack(ctx context.Context, taskID, nodeID, errMsg string) (Task, error) {
	t, err := s.repo.Get(ctx, taskID)
	if err != nil {
		return Task{}, fmt.Errorf("taskqueue nack: %w", err)
	}
	if t.NodeID != nodeID {
		return Task{}, ErrAlreadyClaimed
	}
	now := s.now()
	t.Attempts++
	t.LastError = errMsg
	t.UpdatedAt = now

	if t.ShouldRetry() || t.Attempts < t.MaxAttempts {
		// Re-queue with backoff.
		backoff := DefaultRetryPolicy.Backoff * time.Duration(t.Attempts)
		t.Status = TaskStatusPending
		t.NodeID = ""
		t.AgentID = ""
		t.NextRunAt = now.Add(backoff)
		s.publishEvent("task.retrying", t)
	} else {
		t.Status = TaskStatusFailed
		t.CompletedAt = now
		s.publishEvent("task.failed", t)
	}

	if err := s.repo.Update(ctx, t); err != nil {
		return Task{}, fmt.Errorf("taskqueue nack: %w", err)
	}
	return t, nil
}

// Cancel moves a non-terminal task to cancelled.
func (s *Service) Cancel(ctx context.Context, taskID string) (Task, error) {
	t, err := s.repo.Get(ctx, taskID)
	if err != nil {
		return Task{}, fmt.Errorf("taskqueue cancel: %w", err)
	}
	if !t.CanTransitionTo(TaskStatusCancelled) {
		return Task{}, ErrInvalidTransition
	}
	now := s.now()
	t.Status = TaskStatusCancelled
	t.CompletedAt = now
	t.UpdatedAt = now
	if err := s.repo.Update(ctx, t); err != nil {
		return Task{}, fmt.Errorf("taskqueue cancel: %w", err)
	}
	s.publishEvent("task.cancelled", t)
	return t, nil
}

// Get retrieves a single task.
func (s *Service) Get(ctx context.Context, id string) (Task, error) {
	return s.repo.Get(ctx, id)
}

// List returns tasks matching the query.
func (s *Service) List(ctx context.Context, q Query) ([]Task, error) {
	return s.repo.List(ctx, q)
}

// Stats returns queue aggregate metrics.
func (s *Service) Stats(ctx context.Context, workspaceID string) (Stats, error) {
	return s.repo.Stats(ctx, workspaceID)
}

// Start a background goroutine to requeue timed-out tasks.
func (s *Service) StartTimeoutScanner(ctx context.Context) {
	ticker := time.NewTicker(15 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			_, _ = s.repo.RequeueTimedOut(ctx, s.now())
		}
	}
}

func (s *Service) publishEvent(name string, t Task) {
	if s.hub == nil {
		return
	}
	s.hub.Publish(realtime.Event{
		Name:        name,
		WorkspaceID: t.WorkspaceID,
		Payload: map[string]any{
			"taskId":   t.ID,
			"type":     t.Type,
			"status":   string(t.Status),
			"nodeId":   t.NodeID,
			"agentId":  t.AgentID,
			"priority": int(t.Priority),
			"queue":    t.QueueName,
			"attempts": t.Attempts,
		},
	})
}

var taskCounter uint64

func defaultTaskIDGen() string {
	taskCounter++
	return fmt.Sprintf("task_%d_%d", time.Now().UnixNano(), taskCounter)
}
