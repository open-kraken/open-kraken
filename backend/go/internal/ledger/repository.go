package ledger

import (
	"context"
	"database/sql"
	"fmt"
	"time"

	_ "modernc.org/sqlite"
)

// Repository persists and queries ledger events.
type Repository interface {
	Append(ctx context.Context, e LedgerEvent) error
	Query(ctx context.Context, q Query) ([]LedgerEvent, error)
}

type sqliteRepo struct {
	db *sql.DB
}

// NewSQLiteRepository opens dbPath and returns a Repository.
func NewSQLiteRepository(dbPath string) (Repository, error) {
	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		return nil, fmt.Errorf("open ledger db: %w", err)
	}
	if err := migrate(db); err != nil {
		_ = db.Close()
		return nil, fmt.Errorf("ledger migrate: %w", err)
	}
	return &sqliteRepo{db: db}, nil
}

func migrate(db *sql.DB) error {
	_, err := db.Exec(`
		CREATE TABLE IF NOT EXISTS ledger_events (
			id              TEXT    PRIMARY KEY,
			workspace_id    TEXT    NOT NULL DEFAULT '',
			team_id         TEXT    NOT NULL DEFAULT '',
			member_id       TEXT    NOT NULL DEFAULT '',
			node_id         TEXT    NOT NULL DEFAULT '',
			event_type      TEXT    NOT NULL DEFAULT '',
			summary         TEXT    NOT NULL DEFAULT '',
			correlation_id  TEXT    NOT NULL DEFAULT '',
			session_id      TEXT    NOT NULL DEFAULT '',
			context_json    TEXT    NOT NULL DEFAULT '{}',
			timestamp       INTEGER NOT NULL
		);
		CREATE INDEX IF NOT EXISTS idx_ledger_ws   ON ledger_events(workspace_id);
		CREATE INDEX IF NOT EXISTS idx_ledger_team ON ledger_events(team_id);
		CREATE INDEX IF NOT EXISTS idx_ledger_mem  ON ledger_events(member_id);
		CREATE INDEX IF NOT EXISTS idx_ledger_type ON ledger_events(event_type);
		CREATE INDEX IF NOT EXISTS idx_ledger_ts   ON ledger_events(timestamp);
	`)
	return err
}

func (s *sqliteRepo) Append(ctx context.Context, e LedgerEvent) error {
	if e.ContextJSON == "" {
		e.ContextJSON = "{}"
	}
	_, err := s.db.ExecContext(ctx,
		`INSERT INTO ledger_events
			(id, workspace_id, team_id, member_id, node_id, event_type, summary, correlation_id, session_id, context_json, timestamp)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		e.ID, e.WorkspaceID, e.TeamID, e.MemberID, e.NodeID, e.EventType, e.Summary,
		e.CorrelationID, e.SessionID, e.ContextJSON, e.Timestamp.Unix(),
	)
	return err
}

func (s *sqliteRepo) Query(ctx context.Context, q Query) ([]LedgerEvent, error) {
	qstr := `SELECT id, workspace_id, team_id, member_id, node_id, event_type, summary, correlation_id, session_id, context_json, timestamp
	         FROM ledger_events WHERE 1=1`
	args := []any{}

	if q.WorkspaceID != "" {
		qstr += " AND workspace_id = ?"
		args = append(args, q.WorkspaceID)
	}
	if q.TeamID != "" {
		qstr += " AND team_id = ?"
		args = append(args, q.TeamID)
	}
	if q.MemberID != "" {
		qstr += " AND member_id = ?"
		args = append(args, q.MemberID)
	}
	if q.NodeID != "" {
		qstr += " AND node_id = ?"
		args = append(args, q.NodeID)
	}
	if q.EventType != "" {
		qstr += " AND event_type = ?"
		args = append(args, q.EventType)
	}
	if q.Since != nil {
		qstr += " AND timestamp >= ?"
		args = append(args, q.Since.Unix())
	}
	if q.Until != nil {
		qstr += " AND timestamp <= ?"
		args = append(args, q.Until.Unix())
	}
	qstr += " ORDER BY timestamp DESC"

	limit := q.Limit
	if limit <= 0 {
		limit = 100
	}
	if limit > 500 {
		limit = 500
	}
	qstr += " LIMIT ?"
	args = append(args, limit)

	rows, err := s.db.QueryContext(ctx, qstr, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []LedgerEvent
	for rows.Next() {
		var e LedgerEvent
		var tsUnix int64
		if err := rows.Scan(
			&e.ID, &e.WorkspaceID, &e.TeamID, &e.MemberID, &e.NodeID,
			&e.EventType, &e.Summary, &e.CorrelationID, &e.SessionID, &e.ContextJSON, &tsUnix,
		); err != nil {
			return nil, err
		}
		e.Timestamp = time.Unix(tsUnix, 0).UTC()
		out = append(out, e)
	}
	return out, rows.Err()
}
