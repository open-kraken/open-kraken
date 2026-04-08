# web

## Product role: observability plane

The frontend is a **first-class observability and operations surface**, not “a UI behind the API.” It should foreground:

- **Nodes**: topology, health, and execution/scheduling-related read models (server is source of truth).  
- **Teams**: membership, roles, and collaboration context.  
- **Team task map**: roadmap / project data / delivery progress views.  
- **In-team agent status**: sessions, terminal, activity, tokens, etc. (no fake authorization in the UI).  
- **Skills**: catalog, bindings, and **snapshot export/import** on **`/skills`** (JSON v1; contracts live under `docs/`).

Full product vision and architecture alignment: **[../docs/product-vision-and-architecture.md](../docs/product-vision-and-architecture.md)**.

---

## Feature inventory and user stories

This section lists **what exists in the shell today** (route → capabilities). It is the working inventory for planning; update it when routes or behaviors change.

### Application structure

| Layer | Behavior |
|-------|----------|
| **Auth gate** | Unauthenticated users see **Login** (`LoginPage`). After login, session is stored and validated via `/auth/me`. |
| **Shell** | **`AppShell`** wraps all product routes: left **navigation** (grouped), **workspace** context, **realtime** status, **notifications**, **health/latency** toolbar, **theme** and **locale**, **logout**. |
| **Routing** | **Path-based** SPA (`/` paths such as `/chat`, `/dashboard`). `AppProviders` syncs `window.location.pathname` to the active route; invalid paths fall back to the default route. |
| **API / realtime** | **`HttpClient`** + **`apiClient`** (merged legacy + typed helpers) with bearer token; **`RealtimeClient`** WebSocket for workspace/event streams. |
| **i18n** | **`I18nProvider`** — locale switching (see Settings). |

---

### Navigation map (shell)

Routes are defined in **`src/routes/index.tsx`**. Group labels in the sidebar:

| Group | Routes | Purpose (short) |
|-------|--------|-------------------|
| **Observability** | `/dashboard`, `/ledger` | Token/cost/activity views; audit ledger. |
| **Collaboration** | `/chat`, `/members`, `/skills` | Conversations; team roster and per-member skills/runtime; **skills** catalog + snapshot backup/restore. |
| **Delivery** | `/roadmap` | Roadmap + project data (kanban-style feature). |
| **Runtime & nodes** | `/terminal`, `/nodes` | PTY terminal attach; node registry and assignment. |
| **Workspace & ops** | `/system`, `/settings` | Health + memory explorer; preferences and diagnostics. |

---

### Route-by-route feature set

| Route | Primary UI | Key capabilities (current) | Main APIs / streams |
|-------|------------|------------------------------|---------------------|
| **`/dashboard`** | `DashboardPage` + dashboard feature modules | Token summary, charts, agent activity, node token breakdown; **refresh**; shortcuts to Ledger, Nodes, Team, System; subscribes to **`token.stats_updated`** for live refresh | `tokens/*` via dashboard store |
| **`/ledger`** | `LedgerPage` | Filter ledger events (time, team, member, node, event type, keyword); expandable JSON context; **create** audit event; **auto-refresh** toggle; counts | `ledger/events`, nodes (for filters) |
| **`/chat`** | `ChatPage` | Conversation list, message thread, composer; **realtime** status messaging for connect/degrade/reconnect; workspace-scoped | Conversations/messages via `apiClient` |
| **`/members`** | `MembersPage` → `MemberCollabPanel` | Team/member roster from API + roadmap tasks; **per-member** skill panel (`MemberSkillPanel`); **node binding** map from node registry; **realtime** reflected in model | `getMembers`, `getRoadmap`, `getSkills`, `getNodes` |
| **`/skills`** | `SkillsPage` → `SkillList` | **Catalog** from API; **export** snapshot JSON (catalog + member bindings); **import** preview and **Apply** to replace bindings server-side | `getSkills`, `bindSkills` (per member) |
| **`/roadmap`** | `RoadmapPage` → `RoadmapProjectDataRoute` | Global roadmap document **read/update**; **project data** panel; read-only / storage warnings when applicable | `getRoadmapDocument`, `updateRoadmapDocument`, project data APIs |
| **`/terminal`** | `TerminalPage` + `TerminalPanel` | Pick member **role**; attach to PTY session by terminal id (`#term_<memberId>` hash); **snapshot/delta/status** rules; **send** input; close session | `terminal` API, realtime terminal events |
| **`/nodes`** | `NodesPage` + `NodeList` / `NodeCard` / `NodeAgentAssign` | List + **topology** view; metrics (total/online/degraded/offline); **assign agent** to node (member picker); **WS**: `node.snapshot`, `node.updated`, `node.offline` | `GET /nodes`, assign/remove agent endpoints |
| **`/system`** | `SystemPage` | **`/healthz`** JSON view + latency; realtime + notification summary; **node summary**; **memory store** section (list / put / delete by scope) — operational surface | `fetch /healthz`, `memory`, `nodes` |
| **`/settings`** | `SettingsPage` | **Theme** toggle; **locale**; workspace label display; **API diagnostic** (ping `/healthz`, latency); optional **Langfuse** shortcut when `VITE_LANGFUSE_UI_URL` is set; links to routes; env snippet for `OPEN_KRAKEN_*` / `VITE_*` | `fetch /healthz` |

---

### Cross-cutting features

| Concern | Where implemented |
|---------|-------------------|
| **Authentication** | `AuthProvider`, `AuthGate`, `LoginPage`, `auth-api`, `auth-store` |
| **Authorization display** | Server-enforced; UI shows errors and read models only |
| **Realtime** | `RealtimeClient`, `AppShell` status bar, page-level subscriptions (dashboard, nodes, terminal, chat) |
| **Theming** | `ThemeProvider`, CSS variables, `ThemeToggle` |
| **Internationalization** | `I18nProvider`, `messages` / `messages.en`, locale storage |
| **Types** | `src/types/*` for node, skill, token, ledger, etc. |
| **State** | `app-shell-store`, `nodesStore`, `dashboardStore`, etc. |
| **LLM observability (Langfuse)** | Optional link in **Settings** (`VITE_LANGFUSE_UI_URL`); **ingestion** is OTLP from workers — see **`docs/observability/langfuse-integration.md`** |

---

### User stories (for planning and QA)

Stories are **as implemented or partially implemented**; gaps are noted.

#### Platform operator / SRE

- **As an operator**, I want to see **backend health** and **API latency** so I know the control plane is reachable. → **System**, **Settings** (`/healthz` diagnostics).  
- **As an operator**, I want to see **registered nodes** and **online/offline** counts so I know execution capacity. → **Nodes**, **Dashboard** shortcuts, **System** node summary.  
- **As an operator**, I want **audit events** filterable by time and actor so I can troubleshoot. → **Ledger**.  
- **As an operator**, I want **memory entries** visible and editable by scope for debugging. → **System** (memory section).

#### Team lead / coordinator

- **As a lead**, I want a **team roster** with roles and **roadmap tasks** context so I see who is working on what. → **Members**.  
- **As a lead**, I want to **assign skills to members** so capabilities match responsibilities. → **Members** (`MemberSkillPanel`).  
- **As a lead**, I want to **export or restore skill bindings** (backup / migration) without losing the catalog context. → **Skills** (`/skills` snapshot).  
- **As a lead**, I want to **edit roadmap and project data** so delivery is visible. → **Roadmap**.  
- **As a lead**, I want **token and activity** visibility so I can spot runaway cost or stuck agents. → **Dashboard**.

#### Developer / agent wrangler

- **As a developer**, I want to **attach to a terminal** for a member and stream output so I can debug agent sessions. → **Terminal** (`#term_<id>`).  
- **As a developer**, I want **chat** with conversations and reconnect behavior so I can work in degraded network. → **Chat**.  
- **As a developer**, I want to **assign a member to a node** so runtime placement is visible. → **Nodes** (`NodeAgentAssign`).

#### End user (authenticated)

- **As a user**, I want to **log in** and stay logged in until logout. → **Login** + session restore.  
- **As a user**, I want to **change theme and language** for readability. → **Settings**.

---

### Not in the main shell (secondary entrypoints)

| Artifact | Note |
|----------|------|
| **`pages/collaboration/CollaborationOverviewPage`** | Standalone **demo/visual** page (`entry.tsx`); used in **tests** (`role-card.render.test.tsx`). **Not** linked from `AppShell` nav. |

---

### Gaps vs product vision (frontend)

These are **confirmed product-polish backlog** items (the shell is usable; depth and IA are still thin). Tracked in **`docs/action-items-and-current-state.md` (§ P2)**.

| Vision item | Gap |
|-------------|-----|
| Skill **import/export** | **`/skills`** snapshots exist; **catalog merge / validation / conflict** policy and UX still need product + contract work. |
| **Team** as first-class nav | Sidebar **“Team”** points at **Members**; **no** dedicated Teams entity page or split IA. |
| **Full task map** | Roadmap / project data exist; **no** multi-team / program-level task map view (or explicit non-goal). |
| **Per-agent deep status** | Dashboard, Terminal, token **partially** cover runtime; **no** unified **agent lifecycle** surface. |
| **Shell-adjacent entrypoints** | `CollaborationOverviewPage` etc. remain **secondary** (`entry.tsx` / tests); not integrated into main nav. |

---

## Scope

- Own the React shell, routing, state, features, API clients, styling, and browser-facing tests.
- Keep all frontend implementation inside this directory; do not scatter components, styles, or ad-hoc scripts at the repository root.
- Take API contracts from `docs` and semantics from `backend/go`, not from one-off root-level definitions.

## Ownership

- Shell, chat, member collaboration, terminal, roadmap, Dashboard/Ledger/Nodes and other observability pages, visual system, HTTP/WebSocket integration against the Go backend (optional `OPEN_KRAKEN_API_MODE=mock` for offline fixtures), and frontend tests.

## Dependency direction

- Depends on contracts in `docs` and HTTP/WebSocket semantics from `backend/go`.
- May be exercised by `e2e` and `scripts`.
- Must not dictate backend directory layout or host generic run scripts outside owned entrypoints.

## Entrypoints

- Unit tests: `cd web && npm test`
- Route tree gate: `npm run test:web:routes`
- Smoke: `cd web && npm run test:e2e:smoke`
- Browser automation placeholder: `npm run test:e2e:browser`
- Unified dev stack (delegated): `scripts/dev-up.sh`
- Unified verification (delegated): `scripts/verify-all.sh`
