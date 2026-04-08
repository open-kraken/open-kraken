package message

import (
	"context"
	"database/sql"
	"fmt"
	"time"
)

// OutboxStatus tracks the delivery state of an outbox task.
type OutboxStatus string

const (
	OutboxPending OutboxStatus = "pending"
	OutboxSending OutboxStatus = "sending"
	OutboxSent    OutboxStatus = "sent"
	OutboxFailed  OutboxStatus = "failed"
	OutboxDead    OutboxStatus = "dead"
)

// OutboxTask represents a message dispatch that needs reliable delivery
// to a terminal session.
type OutboxTask struct {
	MessageID    string
	WorkspaceID  string
	ConversationID string
	TargetMemberID string
	Payload      string // JSON-encoded dispatch payload
	Status       OutboxStatus
	Attempts     int
	LeasedUntil  time.Time
	NextRetryAt  time.Time
	LastError    string
	CreatedAt    time.Time
	UpdatedAt    time.Time
}

// Outbox constants aligned with golutra's chat_outbox.rs.
const (
	OutboxPollInterval = 280 * time.Millisecond
	OutboxClaimLimit   = 8
	OutboxLeaseTimeout = 8 * time.Second
	OutboxMaxAttempts  = 6
	OutboxBackoffBase  = 800 * time.Millisecond
	OutboxBackoffMax   = 30 * time.Second
)

// OutboxBackoff computes the next retry delay using exponential backoff.
func OutboxBackoff(attempts int) time.Duration {
	if attempts <= 0 {
		return OutboxBackoffBase
	}
	factor := attempts - 1
	if factor > 6 {
		factor = 6
	}
	scale := int64(1) << factor
	d := time.Duration(scale) * OutboxBackoffBase
	if d > OutboxBackoffMax {
		d = OutboxBackoffMax
	}
	return d
}

// OutboxStore persists outbox tasks in SQLite alongside the message tables.
type OutboxStore struct {
	db  *sql.DB
	now func() time.Time
}

// NewOutboxStore creates the outbox tables if needed.
func NewOutboxStore(db *sql.DB) (*OutboxStore, error) {
	_, err := db.Exec(`
		CREATE TABLE IF NOT EXISTS chat_outbox (
			message_id       TEXT PRIMARY KEY,
			workspace_id     TEXT NOT NULL,
			conversation_id  TEXT NOT NULL,
			target_member_id TEXT NOT NULL,
			payload          TEXT NOT NULL,
			status           TEXT NOT NULL DEFAULT 'pending',
			attempts         INTEGER NOT NULL DEFAULT 0,
			leased_until     INTEGER NOT NULL DEFAULT 0,
			next_retry_at    INTEGER NOT NULL DEFAULT 0,
			last_error       TEXT NOT NULL DEFAULT '',
			created_at       INTEGER NOT NULL,
			updated_at       INTEGER NOT NULL
		);
		CREATE INDEX IF NOT EXISTS idx_outbox_status ON chat_outbox(status, next_retry_at);
	`)
	if err != nil {
		return nil, fmt.Errorf("outbox migrate: %w", err)
	}
	return &OutboxStore{db: db, now: time.Now}, nil
}

// Enqueue adds a new task to the outbox.
func (s *OutboxStore) Enqueue(ctx context.Context, t OutboxTask) error {
	now := s.now()
	if t.CreatedAt.IsZero() {
		t.CreatedAt = now
	}
	t.UpdatedAt = now
	t.Status = OutboxPending
	_, err := s.db.ExecContext(ctx, `
		INSERT OR IGNORE INTO chat_outbox
			(message_id, workspace_id, conversation_id, target_member_id, payload,
			 status, attempts, leased_until, next_retry_at, last_error, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, 0, 0, ?, '', ?, ?)`,
		t.MessageID, t.WorkspaceID, t.ConversationID, t.TargetMemberID,
		t.Payload, string(OutboxPending),
		now.UnixMilli(), t.CreatedAt.UnixMilli(), t.UpdatedAt.UnixMilli(),
	)
	return err
}

// ClaimDue claims up to `limit` tasks that are due for delivery.
// Tasks are leased for OutboxLeaseTimeout to prevent concurrent processing.
func (s *OutboxStore) ClaimDue(ctx context.Context, limit int) ([]OutboxTask, error) {
	now := s.now()
	nowMs := now.UnixMilli()
	rows, err := s.db.QueryContext(ctx, `
		SELECT message_id, workspace_id, conversation_id, target_member_id, payload,
		       status, attempts, leased_until, next_retry_at, last_error, created_at, updated_at
		FROM chat_outbox
		WHERE (status = ? OR (status = ? AND leased_until < ?))
		  AND next_retry_at <= ?
		ORDER BY next_retry_at ASC
		LIMIT ?`,
		string(OutboxPending), string(OutboxSending), nowMs, nowMs, limit,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var tasks []OutboxTask
	for rows.Next() {
		t, err := scanOutboxRow(rows)
		if err != nil {
			return nil, err
		}
		tasks = append(tasks, t)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	// Lease the claimed tasks.
	leaseUntil := now.Add(OutboxLeaseTimeout).UnixMilli()
	for _, t := range tasks {
		_, _ = s.db.ExecContext(ctx,
			`UPDATE chat_outbox SET status = ?, leased_until = ?, updated_at = ? WHERE message_id = ?`,
			string(OutboxSending), leaseUntil, nowMs, t.MessageID,
		)
	}
	return tasks, nil
}

// MarkSent marks a task as successfully delivered.
func (s *OutboxStore) MarkSent(ctx context.Context, messageID string) error {
	now := s.now().UnixMilli()
	_, err := s.db.ExecContext(ctx,
		`UPDATE chat_outbox SET status = ?, updated_at = ? WHERE message_id = ?`,
		string(OutboxSent), now, messageID,
	)
	return err
}

// MarkFailed records a delivery failure and schedules a retry or marks dead.
func (s *OutboxStore) MarkFailed(ctx context.Context, messageID string, attempts int, lastErr string) error {
	now := s.now()
	if attempts >= OutboxMaxAttempts {
		_, err := s.db.ExecContext(ctx,
			`UPDATE chat_outbox SET status = ?, attempts = ?, last_error = ?, updated_at = ? WHERE message_id = ?`,
			string(OutboxDead), attempts, lastErr, now.UnixMilli(), messageID,
		)
		return err
	}
	nextRetry := now.Add(OutboxBackoff(attempts))
	_, err := s.db.ExecContext(ctx,
		`UPDATE chat_outbox SET status = ?, attempts = ?, next_retry_at = ?, last_error = ?, updated_at = ? WHERE message_id = ?`,
		string(OutboxFailed), attempts, nextRetry.UnixMilli(), lastErr, now.UnixMilli(), messageID,
	)
	return err
}

func scanOutboxRow(rows *sql.Rows) (OutboxTask, error) {
	var t OutboxTask
	var statusStr string
	var leasedMs, retryMs, createdMs, updatedMs int64
	if err := rows.Scan(
		&t.MessageID, &t.WorkspaceID, &t.ConversationID, &t.TargetMemberID,
		&t.Payload, &statusStr, &t.Attempts,
		&leasedMs, &retryMs, &t.LastError,
		&createdMs, &updatedMs,
	); err != nil {
		return OutboxTask{}, err
	}
	t.Status = OutboxStatus(statusStr)
	t.LeasedUntil = time.UnixMilli(leasedMs).UTC()
	t.NextRetryAt = time.UnixMilli(retryMs).UTC()
	t.CreatedAt = time.UnixMilli(createdMs).UTC()
	t.UpdatedAt = time.UnixMilli(updatedMs).UTC()
	return t, nil
}
