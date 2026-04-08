package message

import (
	"context"
	"database/sql"
	"path/filepath"
	"testing"
	"time"
)

func tempDB(t *testing.T) (Repository, *sql.DB) {
	t.Helper()
	dir := t.TempDir()
	dbPath := filepath.Join(dir, "test_messages.db")
	repo, err := NewSQLiteRepository(dbPath)
	if err != nil {
		t.Fatalf("new sqlite repo: %v", err)
	}
	db := repo.(DBAccessor).DB()
	return repo, db
}

func TestServiceSendAndGet(t *testing.T) {
	repo, _ := tempDB(t)
	svc := NewService(repo, nil)

	ctx := context.Background()
	m, err := svc.Send(ctx, Message{
		WorkspaceID:    "ws1",
		ConversationID: "conv1",
		SenderID:       "user1",
		ContentType:    ContentTypeText,
		ContentText:    "hello world",
	})
	if err != nil {
		t.Fatalf("send: %v", err)
	}
	if m.ID == "" {
		t.Fatal("expected non-empty ID")
	}
	if m.Status != StatusSent {
		t.Fatalf("expected status sent, got %s", m.Status)
	}

	got, err := svc.Get(ctx, m.ID)
	if err != nil {
		t.Fatalf("get: %v", err)
	}
	if got.ContentText != "hello world" {
		t.Fatalf("expected 'hello world', got %q", got.ContentText)
	}
}

func TestServiceList(t *testing.T) {
	repo, _ := tempDB(t)
	svc := NewService(repo, nil)

	ctx := context.Background()
	for i := 0; i < 5; i++ {
		_, err := svc.Send(ctx, Message{
			WorkspaceID:    "ws1",
			ConversationID: "conv1",
			SenderID:       "user1",
			ContentType:    ContentTypeText,
			ContentText:    "msg",
			CreatedAt:      time.Now().Add(time.Duration(i) * time.Second),
		})
		if err != nil {
			t.Fatalf("send %d: %v", i, err)
		}
	}

	msgs, err := svc.List(ctx, Query{ConversationID: "conv1", Limit: 3})
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if len(msgs) != 3 {
		t.Fatalf("expected 3 messages, got %d", len(msgs))
	}
}

func TestServiceMarkReadAndUnreadCount(t *testing.T) {
	repo, _ := tempDB(t)
	svc := NewService(repo, nil)
	ctx := context.Background()

	// Send 3 messages.
	var lastMsg Message
	for i := 0; i < 3; i++ {
		m, err := svc.Send(ctx, Message{
			WorkspaceID:    "ws1",
			ConversationID: "conv1",
			SenderID:       "user1",
			ContentType:    ContentTypeText,
			ContentText:    "msg",
		})
		if err != nil {
			t.Fatalf("send: %v", err)
		}
		lastMsg = m
	}

	// Before reading, all should be unread for user2.
	count, err := svc.UnreadCount(ctx, "ws1", "conv1", "user2")
	if err != nil {
		t.Fatalf("unread count: %v", err)
	}
	if count != 3 {
		t.Fatalf("expected 3 unread, got %d", count)
	}

	// Mark read up to last message.
	remaining, err := svc.MarkRead(ctx, UnreadMark{
		WorkspaceID:    "ws1",
		ConversationID: "conv1",
		MemberID:       "user2",
		LastReadID:     lastMsg.ID,
		LastReadAt:     time.Now().Add(time.Second),
	})
	if err != nil {
		t.Fatalf("mark read: %v", err)
	}
	if remaining != 0 {
		t.Fatalf("expected 0 unread after marking, got %d", remaining)
	}
}

func TestServiceUpdateStatus(t *testing.T) {
	repo, _ := tempDB(t)
	svc := NewService(repo, nil)
	ctx := context.Background()

	m, _ := svc.Send(ctx, Message{
		WorkspaceID:    "ws1",
		ConversationID: "conv1",
		SenderID:       "user1",
		ContentType:    ContentTypeText,
		ContentText:    "hello",
	})

	if err := svc.UpdateStatus(ctx, m.ID, StatusFailed); err != nil {
		t.Fatalf("update status: %v", err)
	}

	updated, _ := svc.Get(ctx, m.ID)
	if updated.Status != StatusFailed {
		t.Fatalf("expected failed, got %s", updated.Status)
	}
}

func TestServiceTerminalMessage(t *testing.T) {
	repo, _ := tempDB(t)
	svc := NewService(repo, nil)
	ctx := context.Background()

	m, err := svc.SendTerminal(ctx, Message{
		WorkspaceID:    "ws1",
		ConversationID: "conv1",
		SenderID:       "assistant1",
		ContentText:    "command output",
		IsAI:           true,
		Terminal: &TerminalMeta{
			TerminalID: "term1",
			Source:     TerminalSourcePTY,
			Command:    "ls -la",
			LineCount:  10,
		},
	})
	if err != nil {
		t.Fatalf("send terminal: %v", err)
	}
	if m.ContentType != ContentTypeTerminal {
		t.Fatalf("expected terminal content type, got %s", m.ContentType)
	}
	if m.Terminal == nil || m.Terminal.TerminalID != "term1" {
		t.Fatal("terminal meta not persisted")
	}

	got, _ := svc.Get(ctx, m.ID)
	if got.Terminal == nil || got.Terminal.Command != "ls -la" {
		t.Fatal("terminal meta not round-tripped from DB")
	}
}

func TestOutboxBackoff(t *testing.T) {
	cases := []struct {
		attempts int
		expect   time.Duration
	}{
		{0, 800 * time.Millisecond},
		{1, 800 * time.Millisecond},
		{2, 1600 * time.Millisecond},
		{3, 3200 * time.Millisecond},
		{4, 6400 * time.Millisecond},
		{5, 12800 * time.Millisecond},
		{6, 25600 * time.Millisecond},
		{7, 30 * time.Second},
		{10, 30 * time.Second},
	}
	for _, tc := range cases {
		got := OutboxBackoff(tc.attempts)
		if got != tc.expect {
			t.Errorf("OutboxBackoff(%d) = %v, want %v", tc.attempts, got, tc.expect)
		}
	}
}

func TestOutboxEnqueueAndClaim(t *testing.T) {
	_, db := tempDB(t)
	store, err := NewOutboxStore(db)
	if err != nil {
		t.Fatalf("new outbox store: %v", err)
	}

	ctx := context.Background()
	err = store.Enqueue(ctx, OutboxTask{
		MessageID:      "msg1",
		WorkspaceID:    "ws1",
		ConversationID: "conv1",
		TargetMemberID: "user2",
		Payload:        `{"text":"hello"}`,
	})
	if err != nil {
		t.Fatalf("enqueue: %v", err)
	}

	tasks, err := store.ClaimDue(ctx, 10)
	if err != nil {
		t.Fatalf("claim: %v", err)
	}
	if len(tasks) != 1 {
		t.Fatalf("expected 1 task, got %d", len(tasks))
	}
	if tasks[0].MessageID != "msg1" {
		t.Fatalf("expected msg1, got %s", tasks[0].MessageID)
	}

	// Mark sent.
	if err := store.MarkSent(ctx, "msg1"); err != nil {
		t.Fatalf("mark sent: %v", err)
	}

	// Should not be claimable again.
	tasks2, _ := store.ClaimDue(ctx, 10)
	if len(tasks2) != 0 {
		t.Fatalf("expected 0 tasks after sent, got %d", len(tasks2))
	}
}

func TestOutboxMarkFailedAndRetry(t *testing.T) {
	_, db := tempDB(t)
	store, err := NewOutboxStore(db)
	if err != nil {
		t.Fatalf("new outbox store: %v", err)
	}

	ctx := context.Background()
	_ = store.Enqueue(ctx, OutboxTask{
		MessageID:      "msg2",
		WorkspaceID:    "ws1",
		ConversationID: "conv1",
		TargetMemberID: "user2",
		Payload:        `{"text":"retry me"}`,
	})

	// Claim and fail.
	tasks, _ := store.ClaimDue(ctx, 10)
	if len(tasks) != 1 {
		t.Fatalf("expected 1 task, got %d", len(tasks))
	}

	err = store.MarkFailed(ctx, "msg2", 1, "connection timeout")
	if err != nil {
		t.Fatalf("mark failed: %v", err)
	}

	// Should not be immediately claimable (backoff).
	tasks2, _ := store.ClaimDue(ctx, 10)
	if len(tasks2) != 0 {
		t.Fatalf("expected 0 tasks during backoff, got %d", len(tasks2))
	}
}

func TestOutboxMarkDead(t *testing.T) {
	_, db := tempDB(t)
	store, err := NewOutboxStore(db)
	if err != nil {
		t.Fatalf("new outbox store: %v", err)
	}

	ctx := context.Background()
	_ = store.Enqueue(ctx, OutboxTask{
		MessageID:      "msg3",
		WorkspaceID:    "ws1",
		ConversationID: "conv1",
		TargetMemberID: "user2",
		Payload:        `{"text":"dead letter"}`,
	})

	// Claim first.
	store.ClaimDue(ctx, 10)

	// Mark failed with max attempts (should become dead).
	err = store.MarkFailed(ctx, "msg3", OutboxMaxAttempts, "permanent failure")
	if err != nil {
		t.Fatalf("mark dead: %v", err)
	}

	// Should never be claimable again.
	tasks, _ := store.ClaimDue(ctx, 10)
	if len(tasks) != 0 {
		t.Fatalf("expected 0 tasks for dead message, got %d", len(tasks))
	}
}

func TestPipelineNormalize(t *testing.T) {
	repo, _ := tempDB(t)
	p := NewPipeline(repo, nil, nil)
	r := PipelineResult{Message: Message{
		ID:             "test1",
		WorkspaceID:    "ws1",
		ConversationID: "conv1",
		SenderID:       "user1",
		ContentText:    "  hello  ",
	}}
	p.normalize(&r)
	if r.Message.ContentText != "hello" {
		t.Fatalf("expected trimmed content, got %q", r.Message.ContentText)
	}
	if r.Message.ContentType != ContentTypeText {
		t.Fatalf("expected default text type, got %s", r.Message.ContentType)
	}
}

func TestPipelinePolicyFiltersDND(t *testing.T) {
	repo, _ := tempDB(t)
	dndMembers := map[string]bool{"user3": true}
	resolver := func(_ context.Context, _, _ string) ([]string, error) {
		return []string{"user1", "user2", "user3"}, nil
	}
	isDND := func(_ context.Context, memberID string) bool {
		return dndMembers[memberID]
	}
	p := NewPipeline(repo, resolver, isDND)

	ctx := context.Background()
	result, err := p.Process(ctx, Message{
		ID:             "test2",
		WorkspaceID:    "ws1",
		ConversationID: "conv1",
		SenderID:       "user1",
		ContentType:    ContentTypeText,
		ContentText:    "hello",
	})
	if err != nil {
		t.Fatalf("process: %v", err)
	}
	// user1 is sender (excluded), user3 is DND (excluded), only user2 remains.
	if len(result.Targets) != 1 || result.Targets[0] != "user2" {
		t.Fatalf("expected [user2], got %v", result.Targets)
	}
}
