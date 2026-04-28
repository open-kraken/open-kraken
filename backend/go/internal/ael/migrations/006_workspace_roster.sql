-- Workspace team/member roster persisted in the cluster database.
--
-- The HTTP workspace handler owns the roster document shape; this table makes
-- that document durable across API replicas without requiring callers to know
-- about the storage backend.
--
-- Access pattern:
--   - read one roster document by workspace_id
--   - upsert one roster document by workspace_id after a team/member mutation
--
-- The PRIMARY KEY is therefore the only required hot-path index. Do not add
-- JSONB GIN or member/team secondary indexes until code actually queries inside
-- the document; unnecessary indexes would only slow roster writes.

CREATE TABLE IF NOT EXISTS workspace_rosters (
    workspace_id TEXT        PRIMARY KEY,
    version      BIGINT      NOT NULL DEFAULT 1,
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    members      JSONB       NOT NULL DEFAULT '[]'::jsonb,
    teams        JSONB       NOT NULL DEFAULT '[]'::jsonb
);
