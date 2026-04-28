package roster

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// PGStore persists workspace rosters in the cluster PostgreSQL database.
type PGStore struct {
	pool *pgxpool.Pool
}

func NewPGStore(pool *pgxpool.Pool) *PGStore {
	return &PGStore{pool: pool}
}

func (s *PGStore) Read(ctx context.Context, workspaceID string) (Document, bool, error) {
	if s == nil || s.pool == nil || strings.TrimSpace(workspaceID) == "" {
		return Document{}, false, nil
	}
	var version int64
	var updatedAt time.Time
	var membersJSON, teamsJSON []byte
	err := s.pool.QueryRow(ctx, `
		SELECT version, updated_at, members, teams
		FROM workspace_rosters
		WHERE workspace_id = $1`,
		workspaceID,
	).Scan(&version, &updatedAt, &membersJSON, &teamsJSON)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return Document{}, false, nil
		}
		return Document{}, false, err
	}
	var members []map[string]any
	if len(membersJSON) > 0 {
		if err := json.Unmarshal(membersJSON, &members); err != nil {
			return Document{}, false, err
		}
	}
	var teams []Team
	if len(teamsJSON) > 0 {
		if err := json.Unmarshal(teamsJSON, &teams); err != nil {
			return Document{}, false, err
		}
	}
	return Document{
		Meta: Meta{
			WorkspaceID: workspaceID,
			Version:     version,
			UpdatedAt:   updatedAt,
			Storage:     "postgres",
		},
		Members: members,
		Teams:   teams,
	}, true, nil
}

func (s *PGStore) Write(ctx context.Context, doc Document) error {
	if s == nil || s.pool == nil || strings.TrimSpace(doc.Meta.WorkspaceID) == "" {
		return nil
	}
	if doc.Meta.Version < 1 {
		doc.Meta.Version = 1
	}
	if doc.Meta.UpdatedAt.IsZero() {
		doc.Meta.UpdatedAt = time.Now().UTC()
	}
	membersJSON, err := json.Marshal(doc.Members)
	if err != nil {
		return err
	}
	teamsJSON, err := json.Marshal(doc.Teams)
	if err != nil {
		return err
	}
	_, err = s.pool.Exec(ctx, `
		INSERT INTO workspace_rosters (workspace_id, version, updated_at, members, teams)
		VALUES ($1, $2, $3, $4::jsonb, $5::jsonb)
		ON CONFLICT (workspace_id) DO UPDATE SET
			version = EXCLUDED.version,
			updated_at = EXCLUDED.updated_at,
			members = EXCLUDED.members,
			teams = EXCLUDED.teams`,
		doc.Meta.WorkspaceID, doc.Meta.Version, doc.Meta.UpdatedAt, string(membersJSON), string(teamsJSON),
	)
	return err
}
