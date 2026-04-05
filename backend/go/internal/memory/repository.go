package memory

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"

	_ "modernc.org/sqlite"
)

// MemoryRepository persists MemoryEntry records with TTL support.
type MemoryRepository interface {
	// Upsert creates or replaces the entry identified by scope+key.
	Upsert(ctx context.Context, e MemoryEntry) error
	// Get retrieves an entry by scope and key. Returns ErrNotFound when absent
	// or when the entry has expired.
	Get(ctx context.Context, scope Scope, key string) (MemoryEntry, error)
	// Delete removes an entry. Returns ErrNotFound when absent.
	Delete(ctx context.Context, scope Scope, key string) error
	// ListByScope returns all non-expired entries for the given scope.
	ListByScope(ctx context.Context, scope Scope) ([]MemoryEntry, error)
}

// sqliteMemoryStore is a SQLite-backed MemoryRepository with TTL support.
// Entries are unique by (scope, key). OwnerID is stored as metadata and
// enforced at the handler layer for agent-scope isolation (see Q5).
type sqliteMemoryStore struct {
	db  *sql.DB
	now func() time.Time
}

// NewSQLiteMemoryRepository creates a MemoryRepository backed by a SQLite
// database file at dbPath. The schema is created on first use.
func NewSQLiteMemoryRepository(dbPath string) (MemoryRepository, error) {
	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		return nil, fmt.Errorf("open memory db: %w", err)
	}
	if err := migrateMemoryDB(db); err != nil {
		_ = db.Close()
		return nil, fmt.Errorf("memory db migrate: %w", err)
	}
	return &sqliteMemoryStore{db: db, now: time.Now}, nil
}

func migrateMemoryDB(db *sql.DB) error {
	_, err := db.Exec(`
		CREATE TABLE IF NOT EXISTS memory_entries (
			id         TEXT    PRIMARY KEY,
			scope      TEXT    NOT NULL,
			key        TEXT    NOT NULL,
			value      TEXT    NOT NULL,
			owner_id   TEXT    NOT NULL DEFAULT '',
			node_id    TEXT    NOT NULL DEFAULT '',
			created_at INTEGER NOT NULL,
			updated_at INTEGER NOT NULL,
			ttl_nanos  INTEGER NOT NULL DEFAULT 0,
			UNIQUE(scope, key)
		);
		CREATE INDEX IF NOT EXISTS idx_memory_scope ON memory_entries(scope);
	`)
	return err
}

func (s *sqliteMemoryStore) Upsert(ctx context.Context, e MemoryEntry) error {
	now := s.now()
	if e.CreatedAt.IsZero() {
		e.CreatedAt = now
	}
	e.UpdatedAt = now

	_, err := s.db.ExecContext(ctx, `
		INSERT INTO memory_entries (id, scope, key, value, owner_id, node_id, created_at, updated_at, ttl_nanos)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(scope, key) DO UPDATE SET
			id         = excluded.id,
			value      = excluded.value,
			owner_id   = excluded.owner_id,
			node_id    = excluded.node_id,
			updated_at = excluded.updated_at,
			ttl_nanos  = excluded.ttl_nanos`,
		e.ID, string(e.Scope), e.Key, e.Value,
		e.OwnerID, e.NodeID,
		e.CreatedAt.Unix(), e.UpdatedAt.Unix(),
		int64(e.TTL),
	)
	return err
}

func (s *sqliteMemoryStore) Get(ctx context.Context, scope Scope, key string) (MemoryEntry, error) {
	row := s.db.QueryRowContext(ctx, `
		SELECT id, scope, key, value, owner_id, node_id, created_at, updated_at, ttl_nanos
		FROM memory_entries
		WHERE scope = ? AND key = ?`,
		string(scope), key,
	)
	e, err := scanMemoryEntry(row)
	if errors.Is(err, sql.ErrNoRows) {
		return MemoryEntry{}, ErrNotFound
	}
	if err != nil {
		return MemoryEntry{}, err
	}
	if e.IsExpired(s.now()) {
		// Lazy delete expired entry.
		_, _ = s.db.ExecContext(ctx, `DELETE FROM memory_entries WHERE scope = ? AND key = ?`, string(scope), key)
		return MemoryEntry{}, ErrNotFound
	}
	return e, nil
}

func (s *sqliteMemoryStore) Delete(ctx context.Context, scope Scope, key string) error {
	res, err := s.db.ExecContext(ctx,
		`DELETE FROM memory_entries WHERE scope = ? AND key = ?`,
		string(scope), key,
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

func (s *sqliteMemoryStore) ListByScope(ctx context.Context, scope Scope) ([]MemoryEntry, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT id, scope, key, value, owner_id, node_id, created_at, updated_at, ttl_nanos
		FROM memory_entries
		WHERE scope = ?
		ORDER BY updated_at DESC`,
		string(scope),
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	now := s.now()
	var out []MemoryEntry
	var expired []string
	for rows.Next() {
		e, err := scanMemoryEntryRow(rows)
		if err != nil {
			return nil, err
		}
		if e.IsExpired(now) {
			expired = append(expired, e.Key)
			continue
		}
		out = append(out, e)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	// Best-effort lazy cleanup of expired entries.
	for _, k := range expired {
		_, _ = s.db.ExecContext(ctx, `DELETE FROM memory_entries WHERE scope = ? AND key = ?`, string(scope), k)
	}
	return out, nil
}

// scanner is satisfied by both *sql.Row and *sql.Rows.
type scanner interface {
	Scan(dest ...any) error
}

func scanMemoryEntry(row *sql.Row) (MemoryEntry, error) {
	return scanEntry(row)
}

func scanMemoryEntryRow(rows *sql.Rows) (MemoryEntry, error) {
	return scanEntry(rows)
}

func scanEntry(s scanner) (MemoryEntry, error) {
	var e MemoryEntry
	var scopeStr string
	var createdAtUnix, updatedAtUnix, ttlNanos int64
	if err := s.Scan(
		&e.ID, &scopeStr, &e.Key, &e.Value,
		&e.OwnerID, &e.NodeID,
		&createdAtUnix, &updatedAtUnix, &ttlNanos,
	); err != nil {
		return MemoryEntry{}, fmt.Errorf("scan memory entry: %w", err)
	}
	e.Scope = Scope(scopeStr)
	e.CreatedAt = time.Unix(createdAtUnix, 0).UTC()
	e.UpdatedAt = time.Unix(updatedAtUnix, 0).UTC()
	e.TTL = time.Duration(ttlNanos)
	return e, nil
}

// entryKey returns the composite lookup key for a scope+key pair.
// Kept as a package-level helper for the in-memory test repository.
func entryKey(scope Scope, key string) string {
	return string(scope) + ":" + key
}
