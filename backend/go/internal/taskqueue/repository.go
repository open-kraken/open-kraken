package taskqueue

import (
	"context"
	"database/sql"
	"fmt"
	"time"

	_ "modernc.org/sqlite"
)

// Repository persists and queries tasks.
type Repository interface {
	Insert(ctx context.Context, t Task) error
	Get(ctx context.Context, id string) (Task, error)
	Update(ctx context.Context, t Task) error
	List(ctx context.Context, q Query) ([]Task, error)
	// ClaimNext atomically finds the highest-priority pending task matching
	// the queue and sets it to claimed for the given nodeID.
	ClaimNext(ctx context.Context, queueName, nodeID string) (Task, error)
	// FindByIdempotencyKey returns the task with the given key, or ErrNotFound.
	FindByIdempotencyKey(ctx context.Context, workspaceID, key string) (Task, error)
	// Stats returns aggregate queue metrics.
	Stats(ctx context.Context, workspaceID string) (Stats, error)
	// RequeueTimedOut moves running tasks past their timeout back to pending.
	RequeueTimedOut(ctx context.Context, now time.Time) (int, error)
}

type sqliteRepo struct {
	db  *sql.DB
	now func() time.Time
}

// NewSQLiteRepository opens or creates a task queue database at dbPath.
func NewSQLiteRepository(dbPath string) (Repository, error) {
	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		return nil, fmt.Errorf("open taskqueue db: %w", err)
	}
	if err := migrateTaskDB(db); err != nil {
		_ = db.Close()
		return nil, fmt.Errorf("taskqueue db migrate: %w", err)
	}
	return &sqliteRepo{db: db, now: time.Now}, nil
}

func migrateTaskDB(db *sql.DB) error {
	_, err := db.Exec(`
		CREATE TABLE IF NOT EXISTS tasks (
			id               TEXT    PRIMARY KEY,
			idempotency_key  TEXT    NOT NULL DEFAULT '',
			workspace_id     TEXT    NOT NULL DEFAULT '',
			type             TEXT    NOT NULL,
			payload          TEXT    NOT NULL,
			priority         INTEGER NOT NULL DEFAULT 2,
			status           TEXT    NOT NULL DEFAULT 'pending',
			node_id          TEXT    NOT NULL DEFAULT '',
			agent_id         TEXT    NOT NULL DEFAULT '',
			queue_name       TEXT    NOT NULL DEFAULT 'default',
			attempts         INTEGER NOT NULL DEFAULT 0,
			max_attempts     INTEGER NOT NULL DEFAULT 3,
			last_error       TEXT    NOT NULL DEFAULT '',
			next_run_at      INTEGER NOT NULL DEFAULT 0,
			result           TEXT    NOT NULL DEFAULT '',
			timeout_ms       INTEGER NOT NULL DEFAULT 0,
			created_at       INTEGER NOT NULL,
			updated_at       INTEGER NOT NULL,
			claimed_at       INTEGER NOT NULL DEFAULT 0,
			started_at       INTEGER NOT NULL DEFAULT 0,
			completed_at     INTEGER NOT NULL DEFAULT 0
		);
		CREATE INDEX IF NOT EXISTS idx_task_status    ON tasks(status, priority, next_run_at);
		CREATE INDEX IF NOT EXISTS idx_task_queue     ON tasks(queue_name, status);
		CREATE INDEX IF NOT EXISTS idx_task_workspace ON tasks(workspace_id);
		CREATE INDEX IF NOT EXISTS idx_task_node      ON tasks(node_id);
		CREATE UNIQUE INDEX IF NOT EXISTS idx_task_idemp ON tasks(workspace_id, idempotency_key) WHERE idempotency_key != '';
	`)
	return err
}

func (r *sqliteRepo) Insert(ctx context.Context, t Task) error {
	_, err := r.db.ExecContext(ctx, `
		INSERT INTO tasks
			(id, idempotency_key, workspace_id, type, payload, priority, status,
			 node_id, agent_id, queue_name, attempts, max_attempts, last_error,
			 next_run_at, result, timeout_ms, created_at, updated_at,
			 claimed_at, started_at, completed_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		t.ID, t.IdempotencyKey, t.WorkspaceID, t.Type, t.Payload, int(t.Priority),
		string(t.Status), t.NodeID, t.AgentID, t.QueueName,
		t.Attempts, t.MaxAttempts, t.LastError,
		t.NextRunAt.UnixMilli(), t.Result, t.Timeout.Milliseconds(),
		t.CreatedAt.UnixMilli(), t.UpdatedAt.UnixMilli(),
		t.ClaimedAt.UnixMilli(), t.StartedAt.UnixMilli(), t.CompletedAt.UnixMilli(),
	)
	if err != nil && isUniqueViolation(err) {
		return ErrAlreadyExists
	}
	return err
}

func (r *sqliteRepo) Get(ctx context.Context, id string) (Task, error) {
	row := r.db.QueryRowContext(ctx, `SELECT `+taskColumns+` FROM tasks WHERE id = ?`, id)
	t, err := scanTask(row)
	if err == sql.ErrNoRows {
		return Task{}, ErrNotFound
	}
	return t, err
}

func (r *sqliteRepo) Update(ctx context.Context, t Task) error {
	res, err := r.db.ExecContext(ctx, `
		UPDATE tasks SET
			status = ?, node_id = ?, agent_id = ?, attempts = ?, last_error = ?,
			next_run_at = ?, result = ?, updated_at = ?,
			claimed_at = ?, started_at = ?, completed_at = ?
		WHERE id = ?`,
		string(t.Status), t.NodeID, t.AgentID, t.Attempts, t.LastError,
		t.NextRunAt.UnixMilli(), t.Result, t.UpdatedAt.UnixMilli(),
		t.ClaimedAt.UnixMilli(), t.StartedAt.UnixMilli(), t.CompletedAt.UnixMilli(),
		t.ID,
	)
	if err != nil {
		return err
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return ErrNotFound
	}
	return nil
}

func (r *sqliteRepo) List(ctx context.Context, q Query) ([]Task, error) {
	qstr := `SELECT ` + taskColumns + ` FROM tasks WHERE 1=1`
	args := []any{}

	if q.WorkspaceID != "" {
		qstr += " AND workspace_id = ?"
		args = append(args, q.WorkspaceID)
	}
	if q.Status != "" {
		qstr += " AND status = ?"
		args = append(args, string(q.Status))
	}
	if q.QueueName != "" {
		qstr += " AND queue_name = ?"
		args = append(args, q.QueueName)
	}
	if q.NodeID != "" {
		qstr += " AND node_id = ?"
		args = append(args, q.NodeID)
	}
	if q.Type != "" {
		qstr += " AND type = ?"
		args = append(args, q.Type)
	}
	qstr += " ORDER BY priority ASC, created_at ASC"

	limit := q.Limit
	if limit <= 0 {
		limit = 50
	}
	if limit > 200 {
		limit = 200
	}
	qstr += " LIMIT ?"
	args = append(args, limit)

	rows, err := r.db.QueryContext(ctx, qstr, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []Task
	for rows.Next() {
		t, err := scanTaskRow(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, t)
	}
	return out, rows.Err()
}

func (r *sqliteRepo) ClaimNext(ctx context.Context, queueName, nodeID string) (Task, error) {
	now := r.now()
	nowMs := now.UnixMilli()

	// Atomically find and claim the highest-priority pending task.
	row := r.db.QueryRowContext(ctx, `
		UPDATE tasks SET status = 'claimed', node_id = ?, claimed_at = ?, updated_at = ?
		WHERE id = (
			SELECT id FROM tasks
			WHERE status = 'pending'
			  AND queue_name = ?
			  AND next_run_at <= ?
			ORDER BY priority ASC, created_at ASC
			LIMIT 1
		)
		RETURNING `+taskColumns,
		nodeID, nowMs, nowMs, queueName, nowMs,
	)
	t, err := scanTask(row)
	if err == sql.ErrNoRows {
		return Task{}, ErrNotFound
	}
	return t, err
}

func (r *sqliteRepo) FindByIdempotencyKey(ctx context.Context, workspaceID, key string) (Task, error) {
	row := r.db.QueryRowContext(ctx,
		`SELECT `+taskColumns+` FROM tasks WHERE workspace_id = ? AND idempotency_key = ?`,
		workspaceID, key,
	)
	t, err := scanTask(row)
	if err == sql.ErrNoRows {
		return Task{}, ErrNotFound
	}
	return t, err
}

func (r *sqliteRepo) Stats(ctx context.Context, workspaceID string) (Stats, error) {
	s := Stats{
		ByStatus: make(map[string]int),
		ByQueue:  make(map[string]int),
		ByNode:   make(map[string]int),
	}

	wsFilter := ""
	var args []any
	if workspaceID != "" {
		wsFilter = " WHERE workspace_id = ?"
		args = append(args, workspaceID)
	}

	// Total + by status
	rows, err := r.db.QueryContext(ctx, `SELECT status, COUNT(*) FROM tasks`+wsFilter+` GROUP BY status`, args...)
	if err != nil {
		return s, err
	}
	defer rows.Close()
	for rows.Next() {
		var status string
		var count int
		if err := rows.Scan(&status, &count); err != nil {
			return s, err
		}
		s.ByStatus[status] = count
		s.TotalTasks += count
	}

	// By queue
	rows2, err := r.db.QueryContext(ctx, `SELECT queue_name, COUNT(*) FROM tasks`+wsFilter+` GROUP BY queue_name`, args...)
	if err != nil {
		return s, err
	}
	defer rows2.Close()
	for rows2.Next() {
		var q string
		var count int
		if err := rows2.Scan(&q, &count); err != nil {
			return s, err
		}
		s.ByQueue[q] = count
	}

	// By node (only active tasks)
	rows3, err := r.db.QueryContext(ctx,
		`SELECT node_id, COUNT(*) FROM tasks WHERE node_id != '' AND status IN ('claimed','running')`+
			func() string {
				if workspaceID != "" {
					return " AND workspace_id = ?"
				}
				return ""
			}()+` GROUP BY node_id`, args...)
	if err != nil {
		return s, err
	}
	defer rows3.Close()
	for rows3.Next() {
		var nid string
		var count int
		if err := rows3.Scan(&nid, &count); err != nil {
			return s, err
		}
		s.ByNode[nid] = count
	}

	// Oldest pending
	var oldestMs sql.NullInt64
	r.db.QueryRowContext(ctx,
		`SELECT MIN(created_at) FROM tasks WHERE status = 'pending'`+
			func() string {
				if workspaceID != "" {
					return " AND workspace_id = ?"
				}
				return ""
			}(), args...,
	).Scan(&oldestMs)
	if oldestMs.Valid {
		t := time.UnixMilli(oldestMs.Int64).UTC()
		s.OldestPending = &t
		s.AvgWaitMs = r.now().Sub(t).Milliseconds()
	}

	return s, nil
}

func (r *sqliteRepo) RequeueTimedOut(ctx context.Context, now time.Time) (int, error) {
	res, err := r.db.ExecContext(ctx, `
		UPDATE tasks SET status = 'failed', last_error = 'timeout', updated_at = ?
		WHERE status = 'running' AND timeout_ms > 0
		  AND (started_at + timeout_ms) < ?`,
		now.UnixMilli(), now.UnixMilli(),
	)
	if err != nil {
		return 0, err
	}
	n, _ := res.RowsAffected()
	return int(n), nil
}

// --- scan helpers ---

const taskColumns = `id, idempotency_key, workspace_id, type, payload, priority, status,
	node_id, agent_id, queue_name, attempts, max_attempts, last_error,
	next_run_at, result, timeout_ms, created_at, updated_at,
	claimed_at, started_at, completed_at`

type rowScanner interface {
	Scan(dest ...any) error
}

func scanT(s rowScanner) (Task, error) {
	var t Task
	var priority int
	var statusStr string
	var nextRunMs, timeoutMs, createdMs, updatedMs, claimedMs, startedMs, completedMs int64

	if err := s.Scan(
		&t.ID, &t.IdempotencyKey, &t.WorkspaceID, &t.Type, &t.Payload,
		&priority, &statusStr,
		&t.NodeID, &t.AgentID, &t.QueueName,
		&t.Attempts, &t.MaxAttempts, &t.LastError,
		&nextRunMs, &t.Result, &timeoutMs,
		&createdMs, &updatedMs, &claimedMs, &startedMs, &completedMs,
	); err != nil {
		return Task{}, err
	}

	t.Priority = Priority(priority)
	t.Status = TaskStatus(statusStr)
	t.Timeout = time.Duration(timeoutMs) * time.Millisecond
	t.NextRunAt = time.UnixMilli(nextRunMs).UTC()
	t.CreatedAt = time.UnixMilli(createdMs).UTC()
	t.UpdatedAt = time.UnixMilli(updatedMs).UTC()
	if claimedMs > 0 {
		t.ClaimedAt = time.UnixMilli(claimedMs).UTC()
	}
	if startedMs > 0 {
		t.StartedAt = time.UnixMilli(startedMs).UTC()
	}
	if completedMs > 0 {
		t.CompletedAt = time.UnixMilli(completedMs).UTC()
	}
	return t, nil
}

func scanTask(row *sql.Row) (Task, error)    { return scanT(row) }
func scanTaskRow(rows *sql.Rows) (Task, error) { return scanT(rows) }

func isUniqueViolation(err error) bool {
	return err != nil && (contains(err.Error(), "UNIQUE constraint failed") || contains(err.Error(), "unique constraint"))
}

func contains(s, substr string) bool {
	return len(s) >= len(substr) && searchString(s, substr)
}

func searchString(s, sub string) bool {
	for i := 0; i <= len(s)-len(sub); i++ {
		if s[i:i+len(sub)] == sub {
			return true
		}
	}
	return false
}
