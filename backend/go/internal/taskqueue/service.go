package taskqueue

import (
	"context"
	"fmt"
	"time"

	"open-kraken/backend/go/internal/realtime"
)

// Service manages the task queue lifecycle: enqueue, claim, ack, nack, cancel.
type Service struct {
	repo          Repository
	hub           *realtime.Hub
	agentResolver func(ctx context.Context, nodeID string, busyAgents map[string]bool) (string, error)
	now           func() time.Time
	idGen         func() string
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

// SetAgentResolver wires queue claims to the node/agent registry. When set,
// Claim refuses to take a task for a node that has no free AI Assistant and
// stores the selected assistant id on the claimed task.
func (s *Service) SetAgentResolver(fn func(ctx context.Context, nodeID string, busyAgents map[string]bool) (string, error)) {
	s.agentResolver = fn
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
	agentID := ""
	if s.agentResolver != nil {
		busy, err := s.busyAgents(ctx, nodeID)
		if err != nil {
			return Task{}, fmt.Errorf("taskqueue claim: %w", err)
		}
		agentID, err = s.agentResolver(ctx, nodeID, busy)
		if err != nil {
			return Task{}, fmt.Errorf("taskqueue claim: %w", err)
		}
		if agentID == "" {
			return Task{}, ErrNoAvailableAgent
		}
	}
	t, err := s.repo.ClaimNext(ctx, queueName, nodeID)
	if err != nil {
		return Task{}, fmt.Errorf("taskqueue claim: %w", err)
	}
	if agentID != "" {
		t.AgentID = agentID
		t.UpdatedAt = s.now()
		if err := s.repo.Update(ctx, t); err != nil {
			return Task{}, fmt.Errorf("taskqueue claim assign agent: %w", err)
		}
	}
	s.publishEvent("task.claimed", t)
	return t, nil
}

// ClaimByID claims a specific pending task for the node. It is used by control
// surfaces that operate on an explicit task rather than worker queue polling.
func (s *Service) ClaimByID(ctx context.Context, taskID, nodeID, preferredAgentID string) (Task, error) {
	t, err := s.repo.Get(ctx, taskID)
	if err != nil {
		return Task{}, fmt.Errorf("taskqueue claim by id: %w", err)
	}
	if !t.CanTransitionTo(TaskStatusClaimed) {
		return Task{}, ErrInvalidTransition
	}
	agentID := preferredAgentID
	if agentID != "" {
		busy, err := s.busyAgents(ctx, nodeID)
		if err != nil {
			return Task{}, fmt.Errorf("taskqueue claim by id: %w", err)
		}
		if busy[agentID] {
			return Task{}, ErrNoAvailableAgent
		}
	} else if s.agentResolver != nil {
		busy, err := s.busyAgents(ctx, nodeID)
		if err != nil {
			return Task{}, fmt.Errorf("taskqueue claim by id: %w", err)
		}
		agentID, err = s.agentResolver(ctx, nodeID, busy)
		if err != nil {
			return Task{}, fmt.Errorf("taskqueue claim by id: %w", err)
		}
		if agentID == "" {
			return Task{}, ErrNoAvailableAgent
		}
	}
	now := s.now()
	t.Status = TaskStatusClaimed
	t.NodeID = nodeID
	t.AgentID = agentID
	t.ClaimedAt = now
	t.UpdatedAt = now
	if err := s.repo.Update(ctx, t); err != nil {
		return Task{}, fmt.Errorf("taskqueue claim by id: %w", err)
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
		t.Status = TaskStatusRetrying
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

// PromoteRetries moves retry-delayed tasks whose NextRunAt has elapsed back to
// pending so workers can claim them again.
func (s *Service) PromoteRetries(ctx context.Context) (int, error) {
	tasks, err := s.repo.List(ctx, Query{Status: TaskStatusRetrying, Limit: 200})
	if err != nil {
		return 0, fmt.Errorf("taskqueue promote retries: %w", err)
	}
	now := s.now()
	promoted := 0
	for _, t := range tasks {
		if t.NextRunAt.After(now) {
			continue
		}
		if !t.CanTransitionTo(TaskStatusPending) {
			continue
		}
		t.Status = TaskStatusPending
		t.UpdatedAt = now
		if err := s.repo.Update(ctx, t); err != nil {
			return promoted, fmt.Errorf("taskqueue promote retry: %w", err)
		}
		promoted++
		s.publishEvent("task.pending", t)
	}
	return promoted, nil
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
			_ = s.scanTimeouts(ctx)
			_, _ = s.PromoteRetries(ctx)
		}
	}
}

func (s *Service) busyAgents(ctx context.Context, nodeID string) (map[string]bool, error) {
	busy := map[string]bool{}
	for _, status := range []TaskStatus{TaskStatusClaimed, TaskStatusRunning} {
		tasks, err := s.repo.List(ctx, Query{NodeID: nodeID, Status: status, Limit: 200})
		if err != nil {
			return nil, err
		}
		for _, task := range tasks {
			if task.AgentID != "" {
				busy[task.AgentID] = true
			}
		}
	}
	return busy, nil
}

func (s *Service) scanTimeouts(ctx context.Context) error {
	running, err := s.repo.List(ctx, Query{Status: TaskStatusRunning, Limit: 200})
	if err != nil {
		return fmt.Errorf("taskqueue timeout scan: %w", err)
	}
	now := s.now()
	for _, t := range running {
		if t.Timeout <= 0 || t.StartedAt.IsZero() || !t.StartedAt.Add(t.Timeout).Before(now) {
			continue
		}
		t.Attempts++
		t.LastError = "timeout"
		t.UpdatedAt = now
		if t.Attempts < t.MaxAttempts {
			t.Status = TaskStatusRetrying
			t.NodeID = ""
			t.AgentID = ""
			t.NextRunAt = now.Add(DefaultRetryPolicy.Backoff * time.Duration(t.Attempts))
			s.publishEvent("task.retrying", t)
		} else {
			t.Status = TaskStatusFailed
			t.CompletedAt = now
			s.publishEvent("task.failed", t)
		}
		if err := s.repo.Update(ctx, t); err != nil {
			return fmt.Errorf("taskqueue timeout update: %w", err)
		}
	}
	return nil
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
