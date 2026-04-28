# Team Roster Persistence

## Scope

Team management data is backend-owned. The React members page must call the workspace API and must not persist team/member roster state in browser storage.

Canonical routes:

- `GET /api/v1/workspaces/{workspaceId}/members`
- `POST /api/v1/workspaces/{workspaceId}/members`
- `PUT /api/v1/workspaces/{workspaceId}/members/{memberId}`
- `DELETE /api/v1/workspaces/{workspaceId}/members/{memberId}`
- `GET /api/v1/workspaces/{workspaceId}/teams`
- `POST /api/v1/workspaces/{workspaceId}/teams`
- `PUT /api/v1/workspaces/{workspaceId}/teams/{teamId}`
- `DELETE /api/v1/workspaces/{workspaceId}/teams/{teamId}`

## Storage

The roster payload is a single `roster.Document`:

- `members`: member rows used by roster, terminal, presence badges, and agent setup.
- `teams`: team rows referencing members by `memberIds`.
- `meta`: `workspaceId`, monotonic `version`, `updatedAt`, and `storage`.

Runtime storage selection:

1. If `OPEN_KRAKEN_POSTGRES_DSN` enables AEL/PostgreSQL, the server writes roster data to `workspace_rosters`.
2. If PostgreSQL is not configured, local development falls back to `<workspaceRoot>/.open-kraken/roster.json`.

Cluster deployments must use PostgreSQL. File fallback is only for single-process local development.

## PostgreSQL Table And Indexes

Migration: `backend/go/internal/ael/migrations/006_workspace_roster.sql`

Table:

- `workspace_id TEXT PRIMARY KEY`
- `version BIGINT`
- `updated_at TIMESTAMPTZ`
- `members JSONB`
- `teams JSONB`

Current query pattern:

- read one roster by `workspace_id`
- upsert one roster by `workspace_id`

The primary key is the only required hot-path index. Do not add JSONB GIN, member-id, team-id, or `updated_at` indexes until a backend query actually filters inside `members` or `teams`; those indexes would add write cost without serving current reads.

## Failure Semantics

Roster mutations must be durable before returning success:

- create/update/delete member
- create/update/delete team
- status updates that mutate roster fields

If the configured store write fails, the HTTP handler returns `500` and does not report a successful roster mutation to the browser.

## Verification

Relevant checks:

```bash
cd backend/go
GOWORK=off go test ./internal/roster ./internal/api/http/handlers ./internal/api/http ./cmd/server ./internal/ael
```
