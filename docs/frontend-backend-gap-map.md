# Frontend / Backend Gap Map

This map tracks whether each visible route is backed by real backend behavior, fixture fallback, or static mock data. Keep it current when adding routes, APIs, or storage.

## Status Legend

- **Live**: route uses persisted or service-backed backend APIs in normal dev startup.
- **Partial**: route has backend APIs, but key panels still use fixtures, fallback data, or optional services.
- **Mock**: route is primarily static frontend data and should be treated as preview UI.
- **Blocked**: route depends on services not enabled by default.

## Route Matrix

| Route | Frontend entry | Backend/API surface | Status | Main gap |
| --- | --- | --- | --- | --- |
| `/chat` | `web/src/pages/chat/ChatPage.tsx` | `/api/v1/workspaces/{id}/conversations`, `/messages` | Partial | Conversation list is workspace fixture shaped; message persistence exists, but legacy workspace handler still has fixture fallback. |
| `/members` | `web/src/pages/members/MembersPage.tsx` | `/api/v1/workspaces/{id}/members`, `/teams`, `/skills`, `/nodes` | Partial | Roster persists, but runtime/skill/node composition is assembled client-side. |
| `/terminal` | `web/src/pages/terminal/TerminalPage.tsx` | `/api/v1/terminal/*`, `/ws` | Partial | Session lifecycle exists; UI must consistently use backend `sessionId` as terminal identity. |
| `/nodes` | `web/src/pages/nodes/NodesPage.tsx` | `/api/v1/nodes` | Live | Node metrics/actions beyond assignment are mostly UI-only. |
| `/skills` | `web/src/pages/skills/SkillsPage.tsx` | `/api/v1/skills`, `/members/{id}/skills`, `/api/v2/skills` | Partial | v1 bindings work; v2 skill library requires AEL/Postgres. |
| `/ledger` | `web/src/pages/ledger/LedgerPage.tsx` | `/api/v1/ledger/events` | Live | Needs stronger cross-links from terminal/chat actions. |
| `/dashboard` | `web/src/pages/dashboard/DashboardPage.tsx` | `/api/v1/tokens/*` | Partial | Token stats are live; agents, nodes, and recent activity still fall back to mock data. |
| `/system` | `web/src/pages/system/SystemPage.tsx` | `/healthz`, `/api/v1/memory`, `/nodes` | Live | Memory tools are operational but should be guarded by role/capability UI. |
| `/plugins` | `web/src/pages/plugins/PluginsPage.tsx` | `/api/v1/plugins` | Live | Marketplace is local-service backed, not remote registry backed. |
| `/runs` | `web/src/pages/runs/RunsPage.tsx` | `/api/v2/runs`, `/flows`, `/steps` | Blocked | Requires `OPEN_KRAKEN_POSTGRES_DSN`; default dev returns AEL unavailable. |
| `/taskmap` | `web/src/pages/taskmap/TaskMapPage.tsx` | `/api/v2/runs` | Blocked | Depends on AEL run data and has local graph behavior. |
| `/roadmap` | `web/src/pages/roadmap/RoadmapPage.tsx` | mixed roadmap/project-data plus mock traces | Partial | Product roadmap persistence exists elsewhere; observability traces/metrics are mock. |
| `/approvals` | `web/src/pages/approvals/ApprovalsPage.tsx` | none | Mock | Needs approval/escalation backend contract. |
| `/workspaces` | `web/src/pages/workspaces/WorkspacesPage.tsx` | none | Mock | Needs workspace registry and repository/file tree APIs. |
| `/repositories` | `web/src/pages/repositories/RepositoriesPage.tsx` | none | Mock | Needs repository connector and CI status APIs. |
| `/namespaces` | `web/src/pages/namespaces/NamespacesPage.tsx` | none | Mock | Needs namespace tenancy API. |
| `/artifacts` | `web/src/pages/artifacts/ArtifactsPage.tsx` | none | Mock | Needs artifact storage/index API. |

## Priority Fixes

1. Make terminal identity explicit: use backend `sessionId` for HTTP operations and only derive `term_{memberId}` for UI targeting.
2. Add a dev-safe AEL mode or route-level unavailable state for `/runs` and `/taskmap`.
3. Replace dashboard mock nodes/agents with `/nodes`, `/agents/status`, and token activity aggregation.
4. Move mock-only pages behind preview labels until backend contracts exist.
5. Add integration tests that start the dev handler and exercise each non-preview route's first API load.
