# Implementation-Ready Brief: Remaining Product-Surface Gaps

**Author:** flow-inspector  
**Date:** 2026-04-29  
**Context:** Feeds Wave 4 implementation in `contract-gap-remediation-plan-v2.md`. Resolves C1–C4 and Q4 so engineering can move without further decision loops.

---

## Q4 — Canonical Message Status Values

### Decision

The canonical wire values for message delivery state are exactly **three**:

```
pending  →  sent  |  failed
```

**Rationale:** `model.go:26-31` already defines exactly these three distinct string values. `StatusSending`, `StatusQueued`, and `StatusDelivered` are Go aliases that resolve to `pending` or `sent` — they are **not** wire values. The docs (`domain-mainline-contract.md`) incorrectly list `sending` as a canonical value; this is the Go alias, not the emitted string.

### Acceptance Criteria

- [ ] `docs/backend/domain-mainline-contract.md` — update canonical state list to `pending | sent | failed`; remove `sending`, `queued`, `delivered` from the wire vocabulary table
- [ ] `docs/api/http-websocket-contract.md` §Messages — same update; add note that Go alias constants exist for back-compat but only the three values appear on the wire
- [ ] `web/src/api/messages.ts` — change `status: string` in `MessageDTO` to `status: "pending" | "sent" | "failed"`
- [ ] Any FE component switching on status strings: replace bare string comparisons with the typed union; add an exhaustive `never` guard
- [ ] `contracts/contracts.go` — add `MessageStatusPending`, `MessageStatusSent`, `MessageStatusFailed` string constants if not present; remove or deprecate any `StatusSending`/`StatusDelivered` constants exposed in the wire contract package
- [ ] No backend code change required — `model.go` is already correct

**Owner:** BE+DOCS (doc + contracts), then FE  
**Wave:** 2 (DOCS + contracts), 3 (FE type)

---

## C1 — Mock Routes Product Posture

### Decision

**Posture: preview-badge stop-gap now; phased backend wiring later.**

The four mock-only routes (`/workspaces`, `/repositories`, `/namespaces`, `/artifacts`) stay in AppShell navigation because they signal product intent. They must not silently render fake data as if it were real.

**Immediate action (Wave 2 stop-gap):** Mark all four routes with a `preview` badge in the nav and render an in-page "Coming Soon" banner instead of the mock data arrays.

**Phased backend wiring (Wave 4+):**

| Route | Priority | Backend scope |
|---|---|---|
| `/workspaces` | Medium | New `workspace_registry` resource; CRUD for named workspace entries (not the same as the existing `workspaceId` scalar); store in SQLite by default |
| `/namespaces` | Medium | New `namespace` resource as tenant boundary wrapper over workspaces; required for multi-tenant mode |
| `/repositories` | Low | Thin connector model: register a git remote URL + provider type; CI status is a read-only webhook sink; no git proxy required |
| `/artifacts` | Low | Blob reference index (path, size, mime, created_at, run_id FK); actual blob storage is external; backend stores metadata only |

**Approvals** (`/approvals`) is the highest-priority mock to fix: it has a backend handler that returns hardcoded data — replace the in-memory `defaultApprovalRecords()` map with a real SQLite-backed store using the same schema as the existing mock.

### Acceptance Criteria

**Stop-gap (Wave 2):**
- [ ] `web/src/routes/index.tsx` — add `preview: true` flag to `/workspaces`, `/repositories`, `/namespaces`, `/artifacts` nav entries
- [ ] Nav component renders a "Preview" badge for `preview: true` entries
- [ ] Each mock page renders a non-dismissable `<ComingSoonBanner />` instead of (or above) mock array content
- [ ] Mock data arrays remain in place (no code deletion) — they become the UI skeleton for when the backend lands

**Approvals backend (Wave 2):**
- [ ] `internal/api/http/handlers/approval.go` — replace `defaultApprovalRecords()` in-memory map with a `approvalRepository` backed by SQLite (same pattern as `tokentrack`/`ledger`)
- [ ] Approval records survive server restart
- [ ] `POST /approvals/{id}/approve` and `POST /approvals/{id}/reject` write decisions to the store
- [ ] Existing mock shape is preserved as the DTO contract (no frontend change required)

**Owner:** FE (nav badge), BE (approvals store)

---

## C2 — Task Map Durable Persistence Scope

### Decision

**Persist as a standalone `task_graph` blob in the existing `projectdata` package.**

Do not link Task Map topology to AEL Run entities — they are different concerns (AEL Runs are execution records; Task Map is a planning surface). Do not introduce a new package.

**Implementation scope:**
1. Reuse `internal/projectdata` — add a `task_graph` document type alongside `workspace_doc`. Store the React Flow JSON blob (nodes + edges array) keyed by `workspaceId`.
2. Add two endpoints to the existing projectdata HTTP handler:
   - `GET /api/v1/taskmap` — returns the stored graph JSON (empty graph `{"nodes":[],"edges":[]}` on first load)
   - `PUT /api/v1/taskmap` — saves the full graph blob; wire `expectedVersion` / 409 (same as roadmap, A7 pattern)
3. Frontend: replace the local `useNodesState`/`useEdgesState` initial state with a load from `GET /api/v1/taskmap`; wire the "Save" / auto-save path to `PUT /api/v1/taskmap`.
4. Until the endpoint lands: add an **"Unsaved changes — this map is not persisted"** warning banner to the Task Map page (immediate FE stop-gap).

**Out of scope:** graph versioning history, conflict merge UI, real-time collaborative editing.

### Acceptance Criteria

**Stop-gap (Wave 2):**
- [ ] `TaskMapPage.tsx` — render an `<UnsavedChangesWarner />` banner when local state diverges from last loaded state

**Backend (Wave 4):**
- [ ] `GET /api/v1/taskmap?workspaceId={id}` returns `{"nodes":[], "edges":[], "version": 0}` on first load
- [ ] `PUT /api/v1/taskmap` accepts `{"workspaceId":"...","nodes":[...],"edges":[...],"expectedVersion":N}`; returns 200 with updated version or 409 on conflict
- [ ] Document stored in `projectdata` SQLite file; same `ErrVersionConflict` path as roadmap
- [ ] Unit test: load → mutate → save → reload returns same graph

**Frontend (Wave 4, after backend):**
- [ ] On mount: fetch `GET /api/v1/taskmap`; initialise React Flow state from response
- [ ] Auto-save or explicit Save button calls `PUT /api/v1/taskmap` with current `nodes`, `edges`, and `version`
- [ ] On 409: show "Someone else saved a newer version — reload?" prompt; do not silently overwrite

**Owner:** BE then FE

---

## C3 — Teams IA: First-Class Model or Not

### Decision

**Teams remain subordinate to the roster for now. Do not introduce a `/teams` route in this wave.**

**Rationale:** The backend already has team CRUD methods in `internal/api/http/handlers/roster.go`, and the roster service stores teams alongside members. The gap is not model depth — it is UX reachability. A dedicated `/teams` route would require a new page, new API surface, and a decision about the policy boundary between member identity and team membership. That is Wave 5+ work.

**What to do now:** Make the existing team CRUD reachable from the Members page so the surface is not dead.

**Specific changes:**
1. `/members` page — add a "Teams" tab or expandable section that lists existing teams and exposes Create / Rename / Delete team actions. These call the existing roster team endpoints.
2. Team membership editing (add/remove members from a team) must go through the existing `PUT /workspaces/{id}/teams/{teamId}/members` endpoint if it exists, or be added as a minimal roster extension.
3. Do **not** add a `/teams` route to AppShell nav until a dedicated Teams page with its own feature set (team-level skills, team-level token budgets, team conversations) is scoped.

### Acceptance Criteria

- [ ] `MembersPage.tsx` — "Teams" section is interactive: lists teams, allows create (name input → POST), rename (inline edit → PUT), delete (confirm modal → DELETE)
- [ ] All team mutations use existing roster API endpoints — no new backend routes required
- [ ] If a required roster endpoint (e.g. `POST /workspaces/{id}/teams`) is not yet registered, register it in `handler.go` wiring the existing `roster.go` handler method — no new business logic
- [ ] No `/teams` route added to `routes/index.tsx` in this wave
- [ ] `web/README.md` updated to document the teams surface location

**Owner:** FE (Members page teams section), BE (register any missing roster routes)

---

## C4 — Unified Agent Lifecycle / Status Hub

### Decision

**Introduce a `/agents` route backed by the existing read-only aggregation endpoint. Defer write transitions.**

**Rationale:** `GET /api/v1/agents/status` already aggregates node assignment, presence, terminal session, token usage, and instance FSM state from 5 subsystems. The gap is that this data is not surfaced as a first-class UI surface — it is only accessible through scattered panels (Dashboard, Nodes page, Members page). A unified `/agents` route fixes the UX gap without any backend changes.

**Write path decision:** Agent lifecycle state transitions (schedule, run, terminate) continue to flow through their native endpoints (`taskqueue`, `session`, `instance`). The status hub is read-only. This is the correct architecture until the AgentInstance FSM in `internal/runtime/instance/` is promoted to the authoritative lifecycle controller; that promotion is separate work (see paper §5.4.2).

**Implementation scope:**
1. Add `/agents` route to `routes/index.tsx` and AppShell nav.
2. New page `web/src/pages/agents/AgentsPage.tsx` — fetches `GET /api/v1/agents/status` (list) and renders per-agent cards with: name, FSM state, node assignment, presence (online/offline), terminal session link, token usage.
3. Per-agent detail: `GET /api/v1/agents/status/{agentId}` → drill-down view with full status breakdown and links to the agent's sessions, tasks, and ledger events.
4. No write actions on this page in Wave 4. Action buttons (schedule, terminate) are placeholders with "Coming in next release" tooltips.

### Acceptance Criteria

- [ ] `/agents` added to `routes/index.tsx` and AppShell nav (between `/members` and `/nodes` is the natural slot)
- [ ] `AgentsPage.tsx` calls `GET /api/v1/agents/status` on mount; renders agent cards with: memberId, instance FSM state, presence, sessionId (linked to `/terminal`), token total
- [ ] Empty state: "No agents registered" when the list is empty
- [ ] Agent detail drawer/page: calls `GET /api/v1/agents/status/{agentId}`; shows all 5 aggregated subsystem slices
- [ ] Dashboard agents panel is refactored to call the same `GET /api/v1/agents/status` endpoint instead of using mock data
- [ ] No backend changes required — endpoints already exist
- [ ] `web/README.md` updated with `/agents` route entry

**Owner:** FE only

---

## Cross-Gap Dependencies

```
Q4  → B2 (message status doc/contract update is B2 in remediation plan)
C1-approvals  → no dependency; can ship in Wave 2
C1-nav-badge  → no dependency; can ship in Wave 2
C2-banner     → no dependency; can ship in Wave 2
C2-backend    → A7 pattern (roadmap concurrency) should land first to reuse the 409 pattern
C3            → no blocking dependency; FE work only after confirming roster route registration
C4            → no blocking dependency; FE work only
```
