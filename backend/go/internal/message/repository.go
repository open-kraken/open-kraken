package message

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"time"

	_ "modernc.org/sqlite"
)

// Repository persists and queries messages.
type Repository interface {
	// Append inserts a new message. Returns an error if the ID already exists.
	Append(ctx context.Context, m Message) error
	// Get retrieves a single message by ID.
	Get(ctx context.Context, id string) (Message, error)
	// List returns messages matching the query, newest first.
	List(ctx context.Context, q Query) ([]Message, error)
	// UpdateStatus changes the status of an existing message.
	UpdateStatus(ctx context.Context, id string, status Status) error
	// MarkRead records that a member has read up to a given message.
	MarkRead(ctx context.Context, mark UnreadMark) error
	// UnreadCount returns the number of unread messages for a member in a conversation.
	UnreadCount(ctx context.Context, workspaceID, conversationID, memberID string) (int, error)
}

type sqliteRepo struct {
	db  *sql.DB
	now func() time.Time
}

// NewSQLiteRepository opens (or creates) the database at dbPath.
func NewSQLiteRepository(dbPath string) (Repository, error) {
	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		return nil, fmt.Errorf("open message db: %w", err)
	}
	if err := migrateMessageDB(db); err != nil {
		_ = db.Close()
		return nil, fmt.Errorf("message db migrate: %w", err)
	}
	return &sqliteRepo{db: db, now: time.Now}, nil
}

func migrateMessageDB(db *sql.DB) error {
	_, err := db.Exec(`
		CREATE TABLE IF NOT EXISTS messages (
			id              TEXT    PRIMARY KEY,
			workspace_id    TEXT    NOT NULL,
			conversation_id TEXT    NOT NULL,
			sender_id       TEXT    NOT NULL,
			content_type    TEXT    NOT NULL DEFAULT 'text',
			content_text    TEXT    NOT NULL,
			status          TEXT    NOT NULL DEFAULT 'sending',
			is_ai           INTEGER NOT NULL DEFAULT 0,
			span_id         TEXT    NOT NULL DEFAULT '',
			seq             INTEGER NOT NULL DEFAULT 0,
			terminal_json   TEXT    NOT NULL DEFAULT '',
			created_at      INTEGER NOT NULL,
			updated_at      INTEGER NOT NULL
		);
		CREATE INDEX IF NOT EXISTS idx_msg_conv    ON messages(conversation_id, created_at DESC);
		CREATE INDEX IF NOT EXISTS idx_msg_ws      ON messages(workspace_id);
		CREATE INDEX IF NOT EXISTS idx_msg_sender  ON messages(sender_id);

		CREATE TABLE IF NOT EXISTS unread_marks (
			workspace_id    TEXT NOT NULL,
			conversation_id TEXT NOT NULL,
			member_id       TEXT NOT NULL,
			last_read_id    TEXT NOT NULL DEFAULT '',
			last_read_at    INTEGER NOT NULL,
			PRIMARY KEY (workspace_id, conversation_id, member_id)
		);
	`)
	return err
}

func (r *sqliteRepo) Append(ctx context.Context, m Message) error {
	termJSON := ""
	if m.Terminal != nil {
		b, _ := json.Marshal(m.Terminal)
		termJSON = string(b)
	}
	isAI := 0
	if m.IsAI {
		isAI = 1
	}
	_, err := r.db.ExecContext(ctx, `
		INSERT INTO messages
			(id, workspace_id, conversation_id, sender_id, content_type, content_text,
			 status, is_ai, span_id, seq, terminal_json, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		m.ID, m.WorkspaceID, m.ConversationID, m.SenderID,
		string(m.ContentType), m.ContentText, string(m.Status),
		isAI, m.SpanID, m.Seq, termJSON,
		m.CreatedAt.UnixMilli(), m.UpdatedAt.UnixMilli(),
	)
	return err
}

func (r *sqliteRepo) Get(ctx context.Context, id string) (Message, error) {
	row := r.db.QueryRowContext(ctx, `
		SELECT id, workspace_id, conversation_id, sender_id, content_type, content_text,
		       status, is_ai, span_id, seq, terminal_json, created_at, updated_at
		FROM messages WHERE id = ?`, id)
	m, err := scanMessage(row)
	if err == sql.ErrNoRows {
		return Message{}, ErrNotFound
	}
	return m, err
}

func (r *sqliteRepo) List(ctx context.Context, q Query) ([]Message, error) {
	qstr := `SELECT id, workspace_id, conversation_id, sender_id, content_type, content_text,
	                status, is_ai, span_id, seq, terminal_json, created_at, updated_at
	         FROM messages WHERE 1=1`
	args := []any{}

	if q.WorkspaceID != "" {
		qstr += " AND workspace_id = ?"
		args = append(args, q.WorkspaceID)
	}
	if q.ConversationID != "" {
		qstr += " AND conversation_id = ?"
		args = append(args, q.ConversationID)
	}
	if q.SenderID != "" {
		qstr += " AND sender_id = ?"
		args = append(args, q.SenderID)
	}
	if q.BeforeID != "" {
		qstr += " AND created_at < (SELECT created_at FROM messages WHERE id = ?)"
		args = append(args, q.BeforeID)
	}
	qstr += " ORDER BY created_at DESC"

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

	var out []Message
	for rows.Next() {
		m, err := scanMessageRow(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, m)
	}
	return out, rows.Err()
}

func (r *sqliteRepo) UpdateStatus(ctx context.Context, id string, status Status) error {
	res, err := r.db.ExecContext(ctx,
		`UPDATE messages SET status = ?, updated_at = ? WHERE id = ?`,
		string(status), r.now().UnixMilli(), id,
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

func (r *sqliteRepo) MarkRead(ctx context.Context, mark UnreadMark) error {
	if mark.LastReadAt.IsZero() {
		mark.LastReadAt = r.now()
	}
	_, err := r.db.ExecContext(ctx, `
		INSERT INTO unread_marks (workspace_id, conversation_id, member_id, last_read_id, last_read_at)
		VALUES (?, ?, ?, ?, ?)
		ON CONFLICT(workspace_id, conversation_id, member_id) DO UPDATE SET
			last_read_id = excluded.last_read_id,
			last_read_at = excluded.last_read_at`,
		mark.WorkspaceID, mark.ConversationID, mark.MemberID,
		mark.LastReadID, mark.LastReadAt.UnixMilli(),
	)
	return err
}

func (r *sqliteRepo) UnreadCount(ctx context.Context, workspaceID, conversationID, memberID string) (int, error) {
	// Count messages created after the member's last-read position.
	row := r.db.QueryRowContext(ctx, `
		SELECT COUNT(*) FROM messages m
		WHERE m.workspace_id = ? AND m.conversation_id = ?
		  AND m.created_at > COALESCE(
			(SELECT last_read_at FROM unread_marks
			 WHERE workspace_id = ? AND conversation_id = ? AND member_id = ?), 0)`,
		workspaceID, conversationID, workspaceID, conversationID, memberID,
	)
	var count int
	err := row.Scan(&count)
	return count, err
}

// DBAccessor is implemented by repositories that expose their underlying database
// connection, allowing the outbox store to share the same database.
type DBAccessor interface {
	DB() *sql.DB
}

// DB returns the underlying *sql.DB so that the outbox store can share the
// same database connection.
func (r *sqliteRepo) DB() *sql.DB { return r.db }

// --- scan helpers ---

type rowScanner interface {
	Scan(dest ...any) error
}

func scanMsg(s rowScanner) (Message, error) {
	var m Message
	var ctStr, stStr, termJSON string
	var isAI int
	var createdMs, updatedMs int64
	if err := s.Scan(
		&m.ID, &m.WorkspaceID, &m.ConversationID, &m.SenderID,
		&ctStr, &m.ContentText, &stStr,
		&isAI, &m.SpanID, &m.Seq, &termJSON,
		&createdMs, &updatedMs,
	); err != nil {
		return Message{}, err
	}
	m.ContentType = ContentType(ctStr)
	m.Status = Status(stStr)
	m.IsAI = isAI != 0
	m.CreatedAt = time.UnixMilli(createdMs).UTC()
	m.UpdatedAt = time.UnixMilli(updatedMs).UTC()
	if termJSON != "" {
		var tm TerminalMeta
		if json.Unmarshal([]byte(termJSON), &tm) == nil {
			m.Terminal = &tm
		}
	}
	return m, nil
}

func scanMessage(row *sql.Row) (Message, error)    { return scanMsg(row) }
func scanMessageRow(rows *sql.Rows) (Message, error) { return scanMsg(rows) }
