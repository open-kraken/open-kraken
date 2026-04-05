package tokentrack

import (
	"context"
	"database/sql"
	"fmt"
	"time"

	_ "modernc.org/sqlite"
)

// TokenEventRepository persists and queries TokenEvent records.
type TokenEventRepository interface {
	// Append adds a new event to the store. The event's Timestamp is set by
	// the caller.
	Append(ctx context.Context, event TokenEvent) error
	// Query returns events that match the given query parameters.
	// All filter fields are optional; an empty StatsQuery returns all events.
	Query(ctx context.Context, q StatsQuery) ([]TokenEvent, error)
}

// sqliteTokenStore is a SQLite-backed TokenEventRepository.
type sqliteTokenStore struct {
	db *sql.DB
}

// NewSQLiteTokenRepository creates a TokenEventRepository backed by a SQLite
// database file at dbPath. The schema is created on first use.
func NewSQLiteTokenRepository(dbPath string) (TokenEventRepository, error) {
	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		return nil, fmt.Errorf("open token db: %w", err)
	}
	if err := migrateTokenDB(db); err != nil {
		_ = db.Close()
		return nil, fmt.Errorf("token db migrate: %w", err)
	}
	return &sqliteTokenStore{db: db}, nil
}

func migrateTokenDB(db *sql.DB) error {
	_, err := db.Exec(`
		CREATE TABLE IF NOT EXISTS token_events (
			id            TEXT    PRIMARY KEY,
			member_id     TEXT    NOT NULL,
			node_id       TEXT    NOT NULL DEFAULT '',
			model         TEXT    NOT NULL,
			input_tokens  INTEGER NOT NULL DEFAULT 0,
			output_tokens INTEGER NOT NULL DEFAULT 0,
			cost          REAL    NOT NULL DEFAULT 0,
			timestamp     INTEGER NOT NULL
		);
		CREATE INDEX IF NOT EXISTS idx_token_member ON token_events(member_id);
		CREATE INDEX IF NOT EXISTS idx_token_node   ON token_events(node_id);
		CREATE INDEX IF NOT EXISTS idx_token_ts     ON token_events(timestamp);
	`)
	return err
}

func (s *sqliteTokenStore) Append(ctx context.Context, e TokenEvent) error {
	_, err := s.db.ExecContext(ctx,
		`INSERT INTO token_events
			(id, member_id, node_id, model, input_tokens, output_tokens, cost, timestamp)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
		e.ID, e.MemberID, e.NodeID, e.Model,
		e.InputTokens, e.OutputTokens, e.Cost,
		e.Timestamp.Unix(),
	)
	return err
}

func (s *sqliteTokenStore) Query(ctx context.Context, q StatsQuery) ([]TokenEvent, error) {
	qstr := `SELECT id, member_id, node_id, model, input_tokens, output_tokens, cost, timestamp
	         FROM token_events WHERE 1=1`
	args := []any{}

	if !q.Team {
		if q.MemberID != "" {
			qstr += " AND member_id = ?"
			args = append(args, q.MemberID)
		}
		if q.NodeID != "" {
			qstr += " AND node_id = ?"
			args = append(args, q.NodeID)
		}
	}
	if q.Since != nil {
		qstr += " AND timestamp >= ?"
		args = append(args, q.Since.Unix())
	}
	if q.Until != nil {
		qstr += " AND timestamp <= ?"
		args = append(args, q.Until.Unix())
	}
	qstr += " ORDER BY timestamp ASC"

	rows, err := s.db.QueryContext(ctx, qstr, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []TokenEvent
	for rows.Next() {
		var e TokenEvent
		var tsUnix int64
		if err := rows.Scan(
			&e.ID, &e.MemberID, &e.NodeID, &e.Model,
			&e.InputTokens, &e.OutputTokens, &e.Cost, &tsUnix,
		); err != nil {
			return nil, err
		}
		e.Timestamp = time.Unix(tsUnix, 0).UTC()
		out = append(out, e)
	}
	return out, rows.Err()
}

// tokenRecord and its helpers are kept for use by the in-memory test repository.
type tokenRecord struct {
	ID           string
	MemberID     string
	NodeID       string
	Model        string
	InputTokens  int64
	OutputTokens int64
	Cost         float64
	Timestamp    time.Time
}

func toRecord(e TokenEvent) tokenRecord {
	return tokenRecord{
		ID: e.ID, MemberID: e.MemberID, NodeID: e.NodeID, Model: e.Model,
		InputTokens: e.InputTokens, OutputTokens: e.OutputTokens,
		Cost: e.Cost, Timestamp: e.Timestamp,
	}
}

func matchesQuery(r tokenRecord, q StatsQuery) bool {
	if !q.Team {
		if q.MemberID != "" && r.MemberID != q.MemberID {
			return false
		}
		if q.NodeID != "" && r.NodeID != q.NodeID {
			return false
		}
	}
	if q.Since != nil && r.Timestamp.Before(*q.Since) {
		return false
	}
	if q.Until != nil && r.Timestamp.After(*q.Until) {
		return false
	}
	return true
}
