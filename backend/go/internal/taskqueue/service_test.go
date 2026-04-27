package taskqueue_test

import (
	"context"
	"path/filepath"
	"testing"

	"open-kraken/backend/go/internal/realtime"
	"open-kraken/backend/go/internal/taskqueue"
)

func setupService(t *testing.T) *taskqueue.Service {
	t.Helper()
	dbPath := filepath.Join(t.TempDir(), "tasks.db")
	repo, err := taskqueue.NewSQLiteRepository(dbPath)
	if err != nil {
		t.Fatalf("NewSQLiteRepository: %v", err)
	}
	return taskqueue.NewService(repo, realtime.NewHub(16))
}

func TestEnqueueAndClaim(t *testing.T) {
	svc := setupService(t)
	ctx := context.Background()

	task, err := svc.Enqueue(ctx, taskqueue.Task{
		WorkspaceID: "ws1",
		Type:        "test-run",
		Payload:     `{"suite":"unit"}`,
		Priority:    taskqueue.PriorityNormal,
	})
	if err != nil {
		t.Fatalf("Enqueue: %v", err)
	}
	if task.Status != taskqueue.TaskStatusPending {
		t.Fatalf("expected pending, got %s", task.Status)
	}

	claimed, err := svc.Claim(ctx, "default", "node-1")
	if err != nil {
		t.Fatalf("Claim: %v", err)
	}
	if claimed.ID != task.ID {
		t.Fatalf("claimed wrong task: got %s, want %s", claimed.ID, task.ID)
	}
	if claimed.NodeID != "node-1" {
		t.Fatalf("expected nodeID node-1, got %s", claimed.NodeID)
	}
}

func TestClaimAssignsAvailableAIAssistant(t *testing.T) {
	svc := setupService(t)
	ctx := context.Background()
	claimCalls := 0
	svc.SetAgentResolver(func(_ context.Context, nodeID string, busy map[string]bool) (string, error) {
		if nodeID != "node-1" {
			t.Fatalf("unexpected nodeID: %s", nodeID)
		}
		claimCalls++
		if claimCalls == 1 {
			return "agent-busy", nil
		}
		if !busy["agent-busy"] {
			t.Fatalf("expected busy agent map to include already claimed assistant")
		}
		return "agent-free", nil
	})

	_, _ = svc.Enqueue(ctx, taskqueue.Task{
		ID: "busy", WorkspaceID: "ws1", Type: "task", Payload: `{}`,
	})
	if _, err := svc.Claim(ctx, "default", "node-1"); err != nil {
		t.Fatalf("first Claim: %v", err)
	}

	_, _ = svc.Enqueue(ctx, taskqueue.Task{
		ID: "next", WorkspaceID: "ws1", Type: "task", Payload: `{}`,
	})
	claimed, err := svc.Claim(ctx, "default", "node-1")
	if err != nil {
		t.Fatalf("Claim: %v", err)
	}
	if claimed.AgentID != "agent-free" {
		t.Fatalf("expected claim to assign agent-free, got %q", claimed.AgentID)
	}
}

func TestClaimByIDClaimsSpecificTask(t *testing.T) {
	svc := setupService(t)
	ctx := context.Background()
	svc.SetAgentResolver(func(_ context.Context, nodeID string, busy map[string]bool) (string, error) {
		if nodeID != "node-2" {
			t.Fatalf("unexpected nodeID: %s", nodeID)
		}
		if len(busy) != 0 {
			t.Fatalf("expected no busy agents, got %v", busy)
		}
		return "agent-2", nil
	})

	_, _ = svc.Enqueue(ctx, taskqueue.Task{
		ID: "first", WorkspaceID: "ws1", Type: "task", Payload: `{}`, Priority: taskqueue.PriorityHigh,
	})
	_, _ = svc.Enqueue(ctx, taskqueue.Task{
		ID: "second", WorkspaceID: "ws1", Type: "task", Payload: `{}`, Priority: taskqueue.PriorityLow,
	})

	claimed, err := svc.ClaimByID(ctx, "second", "node-2", "")
	if err != nil {
		t.Fatalf("ClaimByID: %v", err)
	}
	if claimed.ID != "second" {
		t.Fatalf("claimed wrong task: %s", claimed.ID)
	}
	if claimed.Status != taskqueue.TaskStatusClaimed {
		t.Fatalf("expected claimed, got %s", claimed.Status)
	}
	if claimed.NodeID != "node-2" || claimed.AgentID != "agent-2" {
		t.Fatalf("unexpected placement: node=%q agent=%q", claimed.NodeID, claimed.AgentID)
	}

	first, err := svc.Get(ctx, "first")
	if err != nil {
		t.Fatalf("Get first: %v", err)
	}
	if first.Status != taskqueue.TaskStatusPending {
		t.Fatalf("expected first task to remain pending, got %s", first.Status)
	}
}

func TestClaimByIDCanUsePreferredAgent(t *testing.T) {
	svc := setupService(t)
	ctx := context.Background()
	svc.SetAgentResolver(func(context.Context, string, map[string]bool) (string, error) {
		t.Fatal("resolver should not be called when a preferred agent is supplied")
		return "", nil
	})

	_, _ = svc.Enqueue(ctx, taskqueue.Task{
		ID: "preferred", WorkspaceID: "ws1", Type: "task", Payload: `{}`,
	})

	claimed, err := svc.ClaimByID(ctx, "preferred", "node-3", "agent-preferred")
	if err != nil {
		t.Fatalf("ClaimByID: %v", err)
	}
	if claimed.AgentID != "agent-preferred" {
		t.Fatalf("expected preferred agent, got %q", claimed.AgentID)
	}
}

func TestClaimWithoutAvailableAIAssistantDoesNotTakeTask(t *testing.T) {
	svc := setupService(t)
	ctx := context.Background()
	svc.SetAgentResolver(func(context.Context, string, map[string]bool) (string, error) {
		return "", taskqueue.ErrNoAvailableAgent
	})

	task, _ := svc.Enqueue(ctx, taskqueue.Task{
		WorkspaceID: "ws1", Type: "task", Payload: `{}`,
	})
	_, err := svc.Claim(ctx, "default", "node-1")
	if err == nil {
		t.Fatal("expected no available agent error")
	}

	stored, err := svc.Get(ctx, task.ID)
	if err != nil {
		t.Fatalf("Get: %v", err)
	}
	if stored.Status != taskqueue.TaskStatusPending {
		t.Fatalf("expected task to remain pending, got %s", stored.Status)
	}
}

func TestIdempotencyKey(t *testing.T) {
	svc := setupService(t)
	ctx := context.Background()

	t1, err := svc.Enqueue(ctx, taskqueue.Task{
		WorkspaceID:    "ws1",
		Type:           "deploy",
		Payload:        `{"env":"prod"}`,
		IdempotencyKey: "deploy-v1.2.3",
	})
	if err != nil {
		t.Fatalf("Enqueue: %v", err)
	}

	// Same key returns existing task.
	t2, err := svc.Enqueue(ctx, taskqueue.Task{
		WorkspaceID:    "ws1",
		Type:           "deploy",
		Payload:        `{"env":"prod"}`,
		IdempotencyKey: "deploy-v1.2.3",
	})
	if err != nil {
		t.Fatalf("Enqueue duplicate: %v", err)
	}
	if t2.ID != t1.ID {
		t.Fatalf("expected same task ID, got %s vs %s", t2.ID, t1.ID)
	}
}

func TestAckNackCancel(t *testing.T) {
	svc := setupService(t)
	ctx := context.Background()

	_, _ = svc.Enqueue(ctx, taskqueue.Task{
		WorkspaceID: "ws1",
		Type:        "code-review",
		Payload:     `{"pr":42}`,
	})

	claimed, _ := svc.Claim(ctx, "default", "node-1")
	started, err := svc.Start(ctx, claimed.ID, "node-1")
	if err != nil {
		t.Fatalf("Start: %v", err)
	}
	if started.Status != taskqueue.TaskStatusRunning {
		t.Fatalf("expected running, got %s", started.Status)
	}

	acked, err := svc.Ack(ctx, started.ID, "node-1", `{"ok":true}`)
	if err != nil {
		t.Fatalf("Ack: %v", err)
	}
	if acked.Status != taskqueue.TaskStatusCompleted {
		t.Fatalf("expected completed, got %s", acked.Status)
	}
}

func TestNackWithRetry(t *testing.T) {
	svc := setupService(t)
	ctx := context.Background()

	_, _ = svc.Enqueue(ctx, taskqueue.Task{
		WorkspaceID: "ws1",
		Type:        "test-run",
		Payload:     `{"suite":"integration"}`,
		MaxAttempts: 3,
	})

	claimed, _ := svc.Claim(ctx, "default", "node-1")
	started, _ := svc.Start(ctx, claimed.ID, "node-1")

	// First nack → should enter retry delay (attempt 1 < maxAttempts 3).
	nacked, err := svc.Nack(ctx, started.ID, "node-1", "timeout")
	if err != nil {
		t.Fatalf("Nack: %v", err)
	}
	if nacked.Status != taskqueue.TaskStatusRetrying {
		t.Fatalf("expected retrying after nack, got %s", nacked.Status)
	}
	if nacked.Attempts != 1 {
		t.Fatalf("expected 1 attempt, got %d", nacked.Attempts)
	}
}

func TestCancelTask(t *testing.T) {
	svc := setupService(t)
	ctx := context.Background()

	task, _ := svc.Enqueue(ctx, taskqueue.Task{
		WorkspaceID: "ws1",
		Type:        "deploy",
		Payload:     `{"env":"staging"}`,
	})

	cancelled, err := svc.Cancel(ctx, task.ID)
	if err != nil {
		t.Fatalf("Cancel: %v", err)
	}
	if cancelled.Status != taskqueue.TaskStatusCancelled {
		t.Fatalf("expected cancelled, got %s", cancelled.Status)
	}

	// Cannot cancel again.
	_, err = svc.Cancel(ctx, task.ID)
	if err == nil {
		t.Fatal("expected error cancelling terminal task")
	}
}

func TestPriorityOrdering(t *testing.T) {
	svc := setupService(t)
	ctx := context.Background()

	// Enqueue low priority first, then high.
	_, _ = svc.Enqueue(ctx, taskqueue.Task{
		ID: "low", WorkspaceID: "ws1", Type: "task", Payload: `{}`, Priority: taskqueue.PriorityLow,
	})
	_, _ = svc.Enqueue(ctx, taskqueue.Task{
		ID: "high", WorkspaceID: "ws1", Type: "task", Payload: `{}`, Priority: taskqueue.PriorityHigh,
	})

	// Should claim the high-priority one first.
	claimed, err := svc.Claim(ctx, "default", "node-1")
	if err != nil {
		t.Fatalf("Claim: %v", err)
	}
	if claimed.ID != "high" {
		t.Fatalf("expected high-priority task first, got %s", claimed.ID)
	}
}

func TestStats(t *testing.T) {
	svc := setupService(t)
	ctx := context.Background()

	_, _ = svc.Enqueue(ctx, taskqueue.Task{WorkspaceID: "ws1", Type: "a", Payload: `{}`})
	_, _ = svc.Enqueue(ctx, taskqueue.Task{WorkspaceID: "ws1", Type: "b", Payload: `{}`})
	_, _ = svc.Claim(ctx, "default", "node-1")

	stats, err := svc.Stats(ctx, "ws1")
	if err != nil {
		t.Fatalf("Stats: %v", err)
	}
	if stats.TotalTasks != 2 {
		t.Fatalf("expected 2 total, got %d", stats.TotalTasks)
	}
	if stats.ByStatus["pending"] != 1 {
		t.Fatalf("expected 1 pending, got %d", stats.ByStatus["pending"])
	}
	if stats.ByStatus["claimed"] != 1 {
		t.Fatalf("expected 1 claimed, got %d", stats.ByStatus["claimed"])
	}
}
