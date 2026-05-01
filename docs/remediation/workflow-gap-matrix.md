# Workflow Gap Matrix

**Author:** flow-inspector  
**Date:** 2026-04-29  
**Purpose:** Exhaustive map of every user-facing workflow — entry point, expected completion, current state, missing links, dependencies, and severity. Use this to prioritise implementation without repeated triage loops.

---

## Severity Legend

| Code | Meaning |
|------|---------|
| **SEC** | Security defect — auth bypass, data isolation failure, event leakage |
| **P0** | Hard runtime failure or confirmed test regression — user action broken today |
| **P1** | Silent degradation — wrong data, misleading UX, or data-loss risk |
| **P2** | Drift only — no current breakage, but hazardous for future work |
| **PROD** | Product-model decision required before implementation |
| **–** | Closed — no gap |

---

## Module: Authentication

| Workflow | Entry Point | Expected End State | Current State | Missing Link(s) | Dependencies | Severity |
|---|---|---|---|---|---|---|
| User login | `LoginPage.tsx` → `POST /auth/login` | JWT token in localStorage; `/auth/me` resolves principal | ✅ Closed | — | — | — |
| Session validation on load | App startup → `GET /auth/me` | Principal hydrated; unauthenticated redirect on 401 | ✅ Closed | Dev-format token not rejected when `JWT_SECRET` is set (A1) | A1 fix | SEC |
| Logout | `auth-store.ts` `logout()` | Token cleared; redirect to `/login` | ✅ Closed | — | — | — |

---

## Module: Chat / Messaging

| Workflow | Entry Point | Expected End State | Current State | Missing Link(s) | Dependencies | Severity |
|---|---|---|---|---|---|---|
| Load chat home | `ChatPage.tsx` → `GET /workspaces/{id}/chat` | Conversation list + latest messages rendered | Partial | Workspace handler has fixture fallback for conversation list | Remove fixture fallback path | P1 |
| Send message | Composer → `POST /messages` | Message persisted; `chat.delta` event fanned out via WS | ✅ Closed | — | — | — |
| Mark messages read | Chat scroll → `POST /messages/read` | Unread count decremented in sidebar | ✅ Closed | — | — | — |
| Realtime message delivery | `/ws` WS → `chat.delta` | Event delivered only to authorised subscriber | Partial | Member identity not enforced at WS handshake (A2); any subscriber can impersonate another | A1 (JWT) then A2 | SEC |
| Create new conversation | Chat header → `POST /workspaces/{id}/chat` | Conversation stored; appears in list | Partial | DM creation works; team-conv creation shares fixture path | Remove fixture fallback path | P1 |

---

## Module: Terminal / Agent Sessions

| Workflow | Entry Point | Expected End State | Current State | Missing Link(s) | Dependencies | Severity |
|---|---|---|---|---|---|---|
| Create session | `TerminalPage.tsx` → `POST /terminal/sessions` | PTY process started; `sessionId` returned | ✅ Closed | UI must use backend `sessionId`, not derive `term_{memberId}` | Consistent FE identity wiring | P1 |
| Stream terminal output | WS subscription | Live PTY output in terminal pane; audit trail written | Partial | Audit report IDs can collide (timestamp-based, A5) | A5 fix | P0 |
| Attach to existing session | `GET /terminal/member-session` | Retained delta queue replayed; live stream resumes | ✅ Closed | — | — | — |
| Close session | Component unmount / explicit close | PTY cancelled; exit event published | ✅ Closed | — | — | — |
| Audit report list | `GET /terminal/audit/sessions` | Unique report per session listed | Broken | ID collision causes dedupe loss (`TestListReports` fails) | A5 fix | P0 |

---

## Module: AEL — Runs / Flows / Steps

| Workflow | Entry Point | Expected End State | Current State | Missing Link(s) | Dependencies | Severity |
|---|---|---|---|---|---|---|
| Create Run | `RunsPage.tsx` → `POST /api/v2/runs` | Run persisted in PG; FSM at `running` | Blocked | Requires `OPEN_KRAKEN_POSTGRES_DSN`; no SQLite fallback; returns AEL-unavailable in dev default | SQLite AEL fallback or always-on PG in dev | P1 |
| Add Flow to Run | Orchestrator → `POST /api/v2/flows` | Flow linked to Run; `assigned` state | Blocked | Same PG dependency | — | P1 |
| Create + Lease Step | Runtime → `POST /api/v2/steps` | Step leased in etcd; T1 token debit | Blocked | etcd + PG both required | etcd + PG | P1 |
| Step completion (T2) | AEL service | Atomic state + side-effect recorded | ✅ Closed (when PG+etcd available) | — | — | — |
| Lease renewal (T3) | etcd KeepAlive | Lease extended before expiry | ✅ Closed | — | — | — |
| Expiry recovery (T4) | etcd watch | Expired step transitioned to `expired` | ✅ Closed | — | — | — |
| View runs in Task Map | `TaskMapPage.tsx` → `GET /api/v2/runs` | Existing runs rendered as graph nodes | Blocked | Same PG dependency; graph edits are non-durable | C2 decision + PG | PROD/P1 |
| Save Task Map graph | TaskMapPage node/edge edit | Graph persisted to backend; survives reload | Not implemented | No persist endpoint; local React Flow state only | C2 decision | PROD/P1 |

---

## Module: Node Management

| Workflow | Entry Point | Expected End State | Current State | Missing Link(s) | Dependencies | Severity |
|---|---|---|---|---|---|---|
| Register node | Node agent → `POST /nodes/register` | Node in registry with correct workspaceId | Partial | `workspace_id` not serialised to storage (A8) | A8 fix | P1 |
| List nodes | `NodesPage.tsx` → `GET /nodes` | Node list with status + assignments | ✅ Closed | workspace filter missing until A8 lands | A8 | P1 |
| Node heartbeat | Node agent → `POST /nodes/{id}/heartbeat` | `last_heartbeat_at` updated | ✅ Closed | — | — | — |
| Assign / remove agent | Orchestrator → `POST/DELETE /nodes/{id}/agents` | Agent↔node binding updated | ✅ Closed | — | — | — |

---

## Module: Task Queue

| Workflow | Entry Point | Expected End State | Current State | Missing Link(s) | Dependencies | Severity |
|---|---|---|---|---|---|---|
| Enqueue task | `POST /queue/tasks` | Task at `pending`; idempotency key enforced | ✅ Closed | — | — | — |
| Claim task | Node agent → `POST /queue/claim` | Task atomically assigned to node; `claimed` | ✅ Closed | — | — | — |
| Start / ack / nack | Node agent → task lifecycle endpoints | Task transitions through `running → completed|failed` | ✅ Closed | — | — | — |
| Cancel task | `DELETE /queue/tasks/{id}` | Task at `cancelled` from any state | ✅ Closed | — | — | — |
| Queue stats | `GET /queue/stats` | Counts by status, queue, node | ✅ Closed | — | — | — |

---

## Module: Skills

| Workflow | Entry Point | Expected End State | Current State | Missing Link(s) | Dependencies | Severity |
|---|---|---|---|---|---|---|
| List skills | `SkillsPage.tsx` → `GET /skills` | Catalog rendered | ✅ Closed | — | — | — |
| Assign skills to member | Member row → `PUT /members/{id}/skills` | Skills bound; empty-array clears | Broken | Empty-array body returns 400 (`TestTC_S03_05` fails) | A6 fix | P0 |
| Reload skills | Reload button → `POST /skills/reload` | Catalog refreshed from disk | Broken | Endpoint not registered; returns 404/405 | A4 fix | P0 |
| Import skills with conflict | Import modal → validate → commit | Conflict previewed; user chooses merge/replace | Partial | No pre-flight validate UI; backend `/skills/import?mode=validate` exists but not called | B5 FE work | P1 |

---

## Module: Members / Teams

| Workflow | Entry Point | Expected End State | Current State | Missing Link(s) | Dependencies | Severity |
|---|---|---|---|---|---|---|
| List members | `MembersPage.tsx` → roster API | Member list with roles + skills rendered | ✅ Closed | — | — | — |
| Create / update member | MembersPage form → roster handler | Member persisted with roleType | ✅ Closed | — | — | — |
| Create team | MembersPage (expected) | Team persisted; team CRUD API exists in roster handler | Partial | No `/teams` route; no FE create-team flow; team CRUD methods exist but are unreachable | C3 decision | PROD |
| Rename / delete team | (expected) | Team updated in roster | Not implemented in FE | Same gap | C3 decision | PROD |

---

## Module: Roadmap / Project Data

| Workflow | Entry Point | Expected End State | Current State | Missing Link(s) | Dependencies | Severity |
|---|---|---|---|---|---|---|
| Load roadmap | `RoadmapPage.tsx` → `GET /roadmap` | Roadmap document rendered | ✅ Closed | — | — | — |
| Save roadmap (single editor) | Edit → `PUT /roadmap` | Document persisted | ✅ Closed | — | — | — |
| Save roadmap (concurrent editors) | Two editors → `PUT /roadmap` simultaneously | Second writer gets 409 with current version | Broken | `expectedVersion` not wired in HTTP handler (A7) | A7 fix | P1 |
| Observability traces display | RoadmapPage metrics panel | Real trace data from Langfuse | Mock | Trace/metric panel is mock data; no Langfuse query wired | OTEL + Langfuse config | P2 |

---

## Module: Agent Memory

| Workflow | Entry Point | Expected End State | Current State | Missing Link(s) | Dependencies | Severity |
|---|---|---|---|---|---|---|
| Write memory key | Agent → memory API `PUT` | Key stored under agent's owner scope | ✅ Closed (write path) | — | — | — |
| Read memory key | Agent → memory API `GET` | Returns only keys owned by requesting agent | Broken | `WHERE owner_id = ?` predicate missing; any agent can read any key (A3) | A1 (principal) then A3 | SEC/P0 |
| List memory keys (scoped) | `GET /memory?scope=...` | Filtered to current agent's owner_id | Broken | Same A3 gap | A3 | SEC/P0 |

---

## Module: Approvals

| Workflow | Entry Point | Expected End State | Current State | Missing Link(s) | Dependencies | Severity |
|---|---|---|---|---|---|---|
| View approval queue | `ApprovalsPage.tsx` → `GET /approvals` | Real pending approvals from backend store | Mock | Backend returns 5 hardcoded in-memory records; no durable store | New approval resource (BE) | PROD |
| Approve / reject action | Approve button → `POST /approvals/{id}/approve` | Decision persisted; approving agent notified | Mock | Decision stored in-memory only; lost on restart | New approval resource (BE) | PROD |

---

## Module: Dashboard

| Workflow | Entry Point | Expected End State | Current State | Missing Link(s) | Dependencies | Severity |
|---|---|---|---|---|---|---|
| Token usage stats | `DashboardPage.tsx` → `/tokens/*` | Live token counts and cost | ✅ Closed | — | — | — |
| Agent status overview | DashboardPage agents panel | Live agent status from `/agents/status` | Partial | Panel uses mock data; `GET /api/v1/agents/status` exists but is not wired to dashboard store | Wire `dashboardStore` to `/agents/status` | P1 |
| Node overview | DashboardPage nodes panel | Live node list from `/nodes` | Partial | Panel uses mock data | Wire to `/nodes` | P1 |
| Recent activity feed | DashboardPage activity | Real ledger/chat events | Partial | Activity is mock; ledger events endpoint exists | Wire to `/ledger/events` | P2 |

---

## Module: Mock-Only Routes (No Backend)

| Workflow | Entry Point | Expected End State | Current State | Missing Link(s) | Dependencies | Severity |
|---|---|---|---|---|---|---|
| Workspace registry | `WorkspacesPage.tsx` | Real workspace list + file tree | Mock | No backend API; hardcoded 3-workspace array | C1 decision | PROD |
| Repository + CI status | `RepositoriesPage.tsx` | Real repos + CI runs from git connector | Mock | No backend API; hardcoded repos | C1 decision | PROD |
| Namespace tenancy | `NamespacesPage.tsx` | Namespace list from tenancy API | Mock | No backend API; hardcoded 4 namespaces | C1 decision | PROD |
| Artifact storage / search | `ArtifactsPage.tsx` | Real artifacts, downloadable | Mock | No backend API; hardcoded artifact array | C1 decision | PROD |

---

## Module: System / Plugins / Settings

| Workflow | Entry Point | Expected End State | Current State | Missing Link(s) | Dependencies | Severity |
|---|---|---|---|---|---|---|
| Health check | `SystemPage.tsx` → `/healthz` | Backend status displayed | ✅ Closed | — | — | — |
| List / install plugins | `PluginsPage.tsx` → `/plugins` | Local plugin catalog | ✅ Closed | Remote marketplace not backed | — | P2 |
| Workspace settings | `SettingsPage.tsx` → `/settings` | Persisted workspace config | ✅ Closed | — | — | — |
| Account profile update | `AccountPage.tsx` | Profile changes persisted | Partial | Page is read-only auth projection; no update endpoint | New account update endpoint | P1 |

---

## Summary Counts

| State | Count |
|---|---|
| ✅ Closed | 27 |
| Partial (fixable) | 14 |
| Broken / P0 | 5 |
| Security (SEC) | 4 |
| Mock / PROD-gated | 9 |
| Blocked (infra dep) | 4 |
