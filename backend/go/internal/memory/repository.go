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
	// Upsert creates or replaces the entry identified by scope+owner+key.
	Upsert(ctx context.Context, e MemoryEntry) error
	// Get retrieves an entry by scope, owner, and key. Returns ErrNotFound
	// when absent or when the entry has expired.
	Get(ctx context.Context, scope Scope, ownerID, key string) (MemoryEntry, error)
	// Delete removes an entry by scope, owner, and key. Returns ErrNotFound
	// when absent.
	Delete(ctx context.Context, scope Scope, ownerID, key string) error
	// ListByScope returns all non-expired entries for the given scope and owner.
	ListByScope(ctx context.Context, scope Scope, ownerID string) ([]MemoryEntry, error)
}

// sqliteMemoryStore is a SQLite-backed MemoryRepository with TTL support.
// Entries are unique by (scope, owner_id, key). Agent-scope operations must
// pass ownerID so two actors can use the same key without overwriting each
// other.
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
	if _, err := db.Exec(`
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
			UNIQUE(scope, owner_id, key)
		);
		CREATE INDEX IF NOT EXISTS idx_memory_scope ON memory_entries(scope);
		CREATE INDEX IF NOT EXISTS idx_memory_scope_owner_key ON memory_entries(scope, owner_id, key);
	`); err != nil {
		return err
	}
	return migrateOldMemoryUniqueness(db)
}

func migrateOldMemoryUniqueness(db *sql.DB) error {
	ok, err := hasOwnerScopedMemoryIndex(db)
	if err != nil || ok {
		return err
	}
	tx, err := db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	if _, err := tx.Exec(`ALTER TABLE memory_entries RENAME TO memory_entries_old`); err != nil {
		return err
	}
	if _, err := tx.Exec(`
		CREATE TABLE memory_entries (
			id         TEXT    PRIMARY KEY,
			scope      TEXT    NOT NULL,
			key        TEXT    NOT NULL,
			value      TEXT    NOT NULL,
			owner_id   TEXT    NOT NULL DEFAULT '',
			node_id    TEXT    NOT NULL DEFAULT '',
			created_at INTEGER NOT NULL,
			updated_at INTEGER NOT NULL,
			ttl_nanos  INTEGER NOT NULL DEFAULT 0,
			UNIQUE(scope, owner_id, key)
		);
	`); err != nil {
		return err
	}
	if _, err := tx.Exec(`
		INSERT OR REPLACE INTO memory_entries
			(id, scope, key, value, owner_id, node_id, created_at, updated_at, ttl_nanos)
		SELECT id, scope, key, value,
			CASE WHEN scope = 'agent' THEN owner_id ELSE '' END,
			node_id, created_at, updated_at, ttl_nanos
		FROM memory_entries_old
		ORDER BY updated_at ASC
	`); err != nil {
		return err
	}
	if _, err := tx.Exec(`DROP TABLE memory_entries_old`); err != nil {
		return err
	}
	if _, err := tx.Exec(`
		CREATE INDEX IF NOT EXISTS idx_memory_scope ON memory_entries(scope);
		CREATE INDEX IF NOT EXISTS idx_memory_scope_owner_key ON memory_entries(scope, owner_id, key);
	`); err != nil {
		return err
	}
	return tx.Commit()
}

func hasOwnerScopedMemoryIndex(db *sql.DB) (bool, error) {
	rows, err := db.Query(`PRAGMA index_list(memory_entries)`)
	if err != nil {
		return false, err
	}
	defer rows.Close()
	for rows.Next() {
		var seq int
		var name, origin string
		var unique, partial int
		if err := rows.Scan(&seq, &name, &unique, &origin, &partial); err != nil {
			return false, err
		}
		if unique == 0 {
			continue
		}
		cols, err := indexColumns(db, name)
		if err != nil {
			return false, err
		}
		if len(cols) == 3 && cols[0] == "scope" && cols[1] == "owner_id" && cols[2] == "key" {
			return true, nil
		}
	}
	return false, rows.Err()
}

func indexColumns(db *sql.DB, name string) ([]string, error) {
	rows, err := db.Query(fmt.Sprintf("PRAGMA index_info(%q)", name))
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var cols []string
	for rows.Next() {
		var seqno, cid int
		var col string
		if err := rows.Scan(&seqno, &cid, &col); err != nil {
			return nil, err
		}
		cols = append(cols, col)
	}
	return cols, rows.Err()
}

func (s *sqliteMemoryStore) Upsert(ctx context.Context, e MemoryEntry) error {
	now := s.now()
	if e.CreatedAt.IsZero() {
		e.CreatedAt = now
	}
	e.UpdatedAt = now
	e.OwnerID = storageOwner(e.Scope, e.OwnerID)

	_, err := s.db.ExecContext(ctx, `
		INSERT INTO memory_entries (id, scope, key, value, owner_id, node_id, created_at, updated_at, ttl_nanos)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(scope, owner_id, key) DO UPDATE SET
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

func (s *sqliteMemoryStore) Get(ctx context.Context, scope Scope, ownerID, key string) (MemoryEntry, error) {
	ownerID = storageOwner(scope, ownerID)
	row := s.db.QueryRowContext(ctx, `
		SELECT id, scope, key, value, owner_id, node_id, created_at, updated_at, ttl_nanos
		FROM memory_entries
		WHERE scope = ? AND owner_id = ? AND key = ?`,
		string(scope), ownerID, key,
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
		_, _ = s.db.ExecContext(ctx, `DELETE FROM memory_entries WHERE scope = ? AND owner_id = ? AND key = ?`, string(scope), ownerID, key)
		return MemoryEntry{}, ErrNotFound
	}
	return e, nil
}

func (s *sqliteMemoryStore) Delete(ctx context.Context, scope Scope, ownerID, key string) error {
	ownerID = storageOwner(scope, ownerID)
	res, err := s.db.ExecContext(ctx,
		`DELETE FROM memory_entries WHERE scope = ? AND owner_id = ? AND key = ?`,
		string(scope), ownerID, key,
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

func (s *sqliteMemoryStore) ListByScope(ctx context.Context, scope Scope, ownerID string) ([]MemoryEntry, error) {
	ownerID = storageOwner(scope, ownerID)
	query := `
		SELECT id, scope, key, value, owner_id, node_id, created_at, updated_at, ttl_nanos
		FROM memory_entries
		WHERE scope = ?`
	args := []any{string(scope)}
	if scope == ScopeAgent {
		query += " AND owner_id = ?"
		args = append(args, ownerID)
	}
	query += " ORDER BY updated_at DESC"
	rows, err := s.db.QueryContext(ctx, query, args...)
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
		_, _ = s.db.ExecContext(ctx, `DELETE FROM memory_entries WHERE scope = ? AND owner_id = ? AND key = ?`, string(scope), ownerID, k)
	}
	return out, nil
}

func storageOwner(scope Scope, ownerID string) string {
	if scope == ScopeAgent {
		return ownerID
	}
	return ""
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
func entryKey(scope Scope, ownerID, key string) string {
	return string(scope) + ":" + storageOwner(scope, ownerID) + ":" + key
}
