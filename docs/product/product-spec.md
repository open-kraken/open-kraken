# Open Kraken — Product Specification Document

> **Version**: 1.1  
> **Date**: 2026-04-07  
> **Purpose**: Product prototype design reference — covers all user stories, functional specifications, page layouts, interaction flows, and component inventory.

---

## 1. Product Overview

### 1.1 What is Open Kraken?

Open Kraken is a **distributed multi-agent production platform** where humans and AI agents collaborate in real-time. It transforms multiple AI CLI tools (Claude Code, Gemini CLI, Codex, etc.) into a unified orchestration hub with multi-team coordination, team chat, terminal sessions, token tracking, approval controls, audit capabilities, and long-running production process management across K8s pods and bare-metal nodes.

### 1.2 Core Value Proposition

> "One Person. One AI Squad."

A single operator can manage multiple AI agents simultaneously across multiple teams, repositories, and distributed nodes — assigning tasks via chat, monitoring terminal output, tracking token costs, routing approvals, coordinating Git workspaces, and auditing all actions through a centralized web console.

### 1.3 Target Users

| Persona | Description | Primary Workflows |
|---------|-------------|-------------------|
| **Squad Lead** | Tech lead managing 2-5 AI agents | Chat dispatch, token monitoring, roadmap tracking |
| **Workspace Manager** | Oversees multiple squads across one workspace | Team portfolio, approvals, budget controls, cross-team routing |
| **Platform Engineer** | Manages infrastructure and node topology | Node management, system health, audit trail |
| **AI Operator** | Runs agents for specific tasks | Terminal sessions, skill assignment, plugin management |

### 1.4 Organizational Scope

- A single workspace can contain **multiple teams** such as Backend, Frontend, QA, DevOps, Product, and Research.
- Teams are first-class operational units for membership, memory, cost attribution, routing policy, failover, approvals, and reporting.
- Cross-team work is supported through shared workflows, shared knowledge sources, team handoff, and workspace-level governance.
- The platform is designed for **persistent, long-running agent operations** rather than one-off chats: task queues, plan tracking, workflow lineage, runtime health, and Git state are all durable control-plane objects.

### 1.5 Design Language

- **Style**: Lark/Feishu-inspired for chat, Vercel Dashboard for metrics, Linear for data tables
- **Theme**: Light (default) + Dark mode, accent color: teal-cyan (#3ecfae)
- **Typography**: Inter (UI), JetBrains Mono (code), compact sizing (13px body)
- **Spacing**: 4px base unit, consistent across all components
- **Motion**: 120ms fast, 180ms medium, 300ms slow — expo easing

---

## 2. System Architecture & Design Philosophy

> This section describes the **technical architecture** that drives the product experience. These concepts are essential context for prototype design — they explain WHY the UI behaves the way it does.

### 2.1 Architecture Overview

```
┌─ Frontend (React + TypeScript) ──────────────────────────────────────┐
│  AppShell → Pages → Features → API Client → HttpClient              │
│                                    ↕                                 │
│                           RealtimeClient (WebSocket)                 │
└──────────────────────────────────────────────────────────────────────┘
              │ HTTP REST                    │ WebSocket
              ▼                              ▼
┌─ Backend (Go) ───────────────────────────────────────────────────────┐
│                                                                       │
│  ┌─ HTTP Layer ─────────────────────┐  ┌─ Realtime Hub ────────────┐│
│  │ Auth Middleware (JWT)            │  │ 256 subscribers           ││
│  │ Rate Limiter                     │  │ chat/terminal/presence/   ││
│  │ Route Handlers                   │  │ node events broadcast     ││
│  └──────────────┬───────────────────┘  └────────────┬──────────────┘│
│                  │                                    │               │
│  ┌─ Service Layer ───────────────────────────────────────────────┐  │
│  │                                                                │  │
│  │  Message Service ──→ Pipeline (5 stages) ──→ Outbox Worker   │  │
│  │       │                                          │            │  │
│  │       ▼                                          ▼            │  │
│  │  Task Control Plane ──→ Orchestrator ──→ Terminal Dispatch    │  │
│  │       │                            │            Queue          │  │
│  │       │                            │              │            │  │
│  │       │                            ▼              ▼            │  │
│  │       │                     Git Workspace Manager → PTY Session│  │
│  │       │                                          │            │  │
│  │  Terminal Intelligence Engine:                    │            │  │
│  │    ├─ Status Engine (4-state machine)            │            │  │
│  │    ├─ Semantic Worker (output → chat)            │            │  │
│  │    ├─ Filter System (per-provider rules)         │            │  │
│  │    ├─ Polling Engine (event-driven + tick)       │            │  │
│  │    ├─ Post-Ready Executor (setup automation)     │            │  │
│  │    └─ Flow Control (200KB watermark)             │            │  │
│  │                                                                │  │
│  │  Provider Registry: Claude|Gemini|Codex|OpenCode|Qwen|Shell  │  │
│  │  Presence Service: online/working/dnd/offline (60s timeout)  │  │
│  │  Node Registry: register/heartbeat/sweep (90s timeout)       │  │
│  │  Cluster Scheduler: pod|bare-metal placement + drain         │  │
│  │  Repo Sync Service: clone/fetch/branch/worktree/commit       │  │
│  │  Auth/Authz: JWT + RBAC (4 roles, 11 capabilities)          │  │
│  └────────────────────────────────────────────────────────────────┘  │
│                                                                       │
│  ┌─ Storage Layer ─────────────────────────────────────────────────┐│
│  │  SQLite: messages.db | tokens.db | memory.db | ledger.db       ││
│  │  JSON:   nodes/ | skills/ | settings/ | projectdata/           ││
│  └─────────────────────────────────────────────────────────────────┘│
└───────────────────────────────────────────────────────────────────────┘
```

### 2.2 Core Design Principles

| # | Principle | Description | UX Impact |
|---|-----------|-------------|-----------|
| 1 | **Realtime-First** | All significant events broadcast instantly via WebSocket Hub; persistence is secondary | Users see messages, terminal output, presence changes in real-time without polling |
| 2 | **Eventual Delivery** | Outbox pattern guarantees messages reach AI agents even after crashes/restarts | "Sending..." status eventually resolves to "Sent" or "Failed" — never stuck |
| 3 | **Provider Abstraction** | 6 AI tools + shell unified under one dispatch interface | Users select an AI provider and the system handles all technical differences |
| 4 | **Process-First Management** | Tasks, plans, approvals, Git state, and artifacts are first-class durable records | Operators manage agent production, not just transient chat messages |
| 5 | **Per-Session Intelligence** | Each terminal has its own status engine, semantic worker, filter, dispatch queue | Every agent independently tracked — "Working" on one doesn't affect another |
| 6 | **Distributed Runtime** | Agents can run on K8s pods or bare-metal nodes under one scheduler | Teams can scale horizontally across nodes without changing UX |
| 7 | **Git-Native Execution** | Cross-node work happens in managed Git workspaces with explicit branch and commit lineage | Operators can inspect branch state, diffs, worktrees, and merge readiness |
| 8 | **Timing-Driven UX** | Carefully calibrated timeouts drive visible state transitions | Status changes feel responsive but stable (no flickering) |
| 9 | **Workspace Isolation** | All resources scoped to workspace ID | Multi-tenant safe — teams can't see each other's data |
| 10 | **Hierarchical RBAC** | 4 roles with escalation protection | UI hides actions users can't perform; supervisors can't self-promote |

### 2.3 Terminal Intelligence Engine

The intelligence engine is the **core differentiator** — it converts raw PTY sessions into a collaborative experience:

```
                   PTY Output (raw bytes)
                          │
            ┌─────────────┼─────────────┐
            ▼             ▼             ▼
     Status Engine   Semantic Worker  Flow Control
     (4 states)      (per-session)    (backpressure)
            │             │             │
            │    ┌────────┘             │
            │    ▼                      │
            │  Filter (per-provider)    │
            │    │                      │
            │    ▼                      │
            │  Chat Message             │
            │  (auto-captured)          │
            │    │                      │
            ▼    ▼                      ▼
     ┌───────────────────────────┐
     │   Realtime Hub            │
     │   → chat.delta            │
     │   → terminal.delta        │
     │   → terminal.status       │
     └───────────────────────────┘
            │
            ▼
     All connected clients
     see output in real-time
```

**Status State Machine:**
```
                     shell ready (1024 bytes or 3s)
  ┌────────────┐  ──────────────────────────────────▶  ┌────────┐
  │ Connecting  │                                       │ Online │
  └────────────┘                                       └───┬────┘
                                                           │
                                  user sends input         │
                              ◀────────────────────────────┘
                              │
                              ▼
                        ┌───────────┐
                        │  Working  │ ← pulsing yellow indicator
                        └─────┬─────┘
                              │
                    4.5s output silence
                              │
                              ▼
                        ┌────────┐
                        │ Online │ ← solid green indicator
                        └────────┘
```

**Key Timing Constants (affect visible UX):**

| Parameter | Value | What the user sees |
|-----------|-------|--------------------|
| Working → Online silence | 4.5s | Agent stops "Working" animation 4.5s after last output |
| Intent window | 1.5s | Ignores brief output right after sending command (prevents false "idle") |
| Chat flush gate | 3.0s | Terminal output appears in chat 3s after output stabilizes |
| Force flush | 30s | Long-running commands still produce chat messages every 30s |
| Shell ready | 3.0s / 1KB | Terminal becomes interactive after first significant output |
| Stream throttle | 160ms | Live terminal preview in chat updates at ~6 fps |
| Output batching | 16ms | Terminal renders at ~60 fps (smooth scrolling) |
| Redraw suppression | 400ms | Tab switch / resize won't trigger false "Working" state |

### 2.4 Message Delivery Pipeline

Messages flow through **5 ordered stages** before reaching AI agents:

```
  User types message in Chat
          │
          ▼
  ┌─ Stage 1: Normalize ─────────────┐
  │ Trim whitespace, set timestamps,  │
  │ default content type to "text"    │
  └───────────────┬───────────────────┘
                  │
  ┌─ Stage 2: Plan ──────────────────┐
  │ Resolve all members in the       │
  │ conversation, exclude the sender │
  └───────────────┬──────────────────┘
                  │
  ┌─ Stage 3: Policy ────────────────┐
  │ Filter out DND members (they     │
  │ won't receive terminal dispatch) │
  │ Check @mention scope             │
  └───────────────┬──────────────────┘
                  │
  ┌─ Stage 4: Throttle ─────────────┐
  │ Rate limiting per conversation   │
  │ (reserved for future use)        │
  └───────────────┬──────────────────┘
                  │
  ┌─ Stage 5: Deliver ──────────────┐
  │ Persist to SQLite (messages.db)  │
  │ Mark status: "sent"              │
  │ Publish chat.delta to Hub        │
  └───────────────┬──────────────────┘
                  │
          ▼ (async, decoupled)
  ┌─ Outbox Worker ──────────────────┐
  │ Poll 280ms · Claim 8 · Lease 8s │
  │ Retry: 800ms → 1.6s → ... → 30s │
  │ Max 6 attempts → dead letter     │
  └───────────────┬──────────────────┘
                  │
  ┌─ Dispatch Queue (per terminal) ──┐
  │ Max 32 queued · Dedup 128 window │
  │ Wait for Online status           │
  │ One inflight at a time           │
  └───────────────┬──────────────────┘
                  │
          ▼
  PTY stdin → Agent processes command
```

### 2.5 Authorization Model

| Role | Members | Dispatch | Manage Team | Change Roles | Delete |
|------|---------|----------|-------------|--------------|--------|
| **Owner** | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Supervisor** | ✅ | ✅ | ✅ | ✅ (can't self-promote) | ✅ |
| **Assistant** | ✅ (read) | ❌ | ❌ | ❌ | ❌ |
| **Member** | ✅ (read) | ❌ | ❌ | ❌ | ❌ |

> **Design rule**: UI buttons are hidden (not just disabled) for actions the current role cannot perform. The API enforces authorization independently.

### 2.6 Provider System

| Provider | ID | Command | Unlimited Flag | Post-Ready |
|----------|----|---------|----------------|------------|
| Claude Code | claude-code | `claude` | `--dangerously-skip-permissions` | AI onboarding |
| Gemini CLI | gemini-cli | `gemini` | — | AI onboarding |
| Codex CLI | codex-cli | `codex` | — | AI onboarding |
| OpenCode | opencode | `opencode` | — | AI onboarding |
| Qwen Code | qwen-code | `qwen` | — | AI onboarding |
| Shell | shell | `$SHELL` | — | (none) |

> Users select a provider when inviting an AI assistant. The system auto-applies the default command, flags, and post-ready automation. Custom commands override the default.

### 2.6.1 Git-Native Agent Execution

- Every production agent runs inside a **managed Git workspace** that records repo, branch, remote, commit HEAD, dirty state, and worktree path.
- Cross-node scheduling must preserve Git state through one of: shared repo volume, detached worktree sync, or fresh clone + branch checkout.
- All high-value actions can be tied to Git primitives: `clone`, `fetch`, `checkout`, `worktree`, `status`, `diff`, `commit`, `push`, `merge/rebase`, `stash`.
- The system should distinguish between:
  - `read-only Git operations`: status, diff, log, show
  - `mutable Git operations`: checkout, branch, commit, stash, reset, push
  - `integration Git operations`: PR open/update, merge gate, conflict resolution
- Git context is part of the task state and trace state, not just terminal text output.

### 2.7 Node Monitoring Model

```
Node registers → Status: Online → Heartbeat every 30s
                                       │
                         ┌──────────────┴──────────────┐
                         │                              │
                    heartbeat OK                   90s no heartbeat
                    → stays Online                → sweep marks Offline
                                                  → hub.Publish(node.offline)
                                                  → UI shows red status
```

**Node types**: K8s Pod (circle glyph in topology), Bare Metal (double-ring glyph)

**Labels**: Key-value pairs (region, pool, agent_id) used for region clustering in topology view and scheduling constraints.

### 2.7.1 Distributed Cluster Membership

- Nodes join the cluster using a registration token and publish capabilities: OS, architecture, available CLIs, Git version, provider binaries, disk, CPU, memory, and network traits.
- K8s nodes may be represented by agent-runner pods; bare-metal nodes connect through the same control plane and heartbeat protocol.
- Scheduling constraints can target labels such as `region`, `pool`, `provider.codex=true`, `git>=2.45`, `storage=ssd`, `runtime=k8s`, `runtime=bare-metal`.
- A node is not schedulable until health checks pass for:
  - control-plane connectivity
  - PTY spawn
  - Git executable availability
  - required provider CLI availability
  - writable workspace root

---

## 3. Information Architecture

### 2.1 Navigation Structure

```
┌─ Sidebar (persistent, left)
│
├─ Observability
│  ├─ Dashboard (/dashboard)     — Token metrics, cost breakdown, agent activity
│  └─ Ledger (/ledger)           — Central audit trail, event filtering
│
├─ Collaboration
│  ├─ Chat (/chat)               — Conversations, messaging, file sharing
│  ├─ Team (/members)            — Member roster, roles, org structure
│  └─ Skills (/skills)           — Skill catalog, export/import
│
├─ Delivery
│  └─ Roadmap (/roadmap)         — Task kanban, project data
│
├─ Runtime & Delivery Ops
│  ├─ Sessions (/terminal)       — PTY terminal, session management
│  └─ Nodes (/nodes)             — Execution topology, agent assignment
│  ├─ Repositories (/repos)      — Repo bindings, branches, PR context
│  └─ Approvals (/approvals)     — Pending approvals, policy decisions
│
└─ Workspace & Ops
   ├─ System (/system)           — Health probes, memory store
   ├─ Settings (/settings)       — Preferences, diagnostics
   ├─ Artifacts (/artifacts)     — Reports, patches, exports, generated outputs
   └─ Plugins (/plugins)         — Marketplace, install/remove
```

### 2.2 Global Shell Layout

```
┌─────────────────────────────────────────────────────────────┐
│ [Logo] Open Kraken Console                                  │
├────────┬────────────────────────────────────────────────────┤
│        │ Header: [Workspace Label]     [🔔 Badge] [👤] [⛶] │
│  Nav   ├────────────────────────────────────────────────────┤
│  Side  │                                                    │
│  bar   │              Active Page Content                   │
│        │                                                    │
│  ····  │                                                    │
│  ····  │                                                    │
│        ├────────────────────────────────────────────────────┤
│        │ Status: [workspace] · [cluster 1/0/0] · [▂▃▅▇ 45ms] │
└────────┴────────────────────────────────────────────────────┘
```

---

## 4. User Stories (Complete Feature Map)

> 190+ user stories, continuously numbered in grouped ranges, organized by functional domains. Each story tagged with role and priority.
>
> **Roles**: 👤 user (all roles) · 🔑 admin (owner/supervisor) · 🤖 agent (AI perspective) · 🌐 system (automated)
>
> **Priority**: P0 = MVP · P1 = Core · P2 = Enhancement · P3 = Advanced

### 4.1 Authentication & Onboarding (US-001 ~ US-008)

| ID | Pri | Role | Story | Acceptance Criteria |
|----|-----|------|-------|-------------------|
| US-001 | P0 | 👤 | Log in with credentials | Login page: member ID + password → JWT token → redirect to /chat |
| US-002 | P1 | 👤 | First-time onboarding guide | 3-step overlay (Welcome → Chat → Monitor), skippable, localStorage persist |
| US-003 | P0 | 👤 | See my identity in the header | Avatar + display name + role badge in toolbar, sign-out button |
| US-004 | P2 | 🔑 | Invite new user via link | Generate invite URL with role preset, link expires in 7 days |
| US-005 | P3 | 🔑 | SSO / LDAP authentication | Enterprise login flow, auto-provision workspace member on first SSO login |
| US-006 | P1 | 👤 | Session persistence across tabs | JWT stored in secure cookie or localStorage, auto-restore on page reload |
| US-007 | P2 | 👤 | Logout from all devices | "Sign out everywhere" button in Settings, invalidates all JWT tokens |
| US-008 | P1 | 🌐 | Auto-redirect unauthenticated users | Any protected route → redirect to /login with return URL |

### 4.2 Chat & Messaging (US-010 ~ US-035)

| ID | Pri | Role | Story | Acceptance Criteria |
|----|-----|------|-------|-------------------|
| US-010 | P0 | 👤 | See all conversations in sidebar | Scrollable list: name, preview, timestamp, unread badge, avatar |
| US-011 | P0 | 👤 | Open a conversation and see messages | Bubble messages: avatar, sender, timestamp, status indicator |
| US-012 | P0 | 👤 | Send a text message | Composer + send button, optimistic rendering, Cmd+Enter shortcut |
| US-013 | P1 | 👤 | @mention team members/agents | Type @, dropdown with roster, arrow key navigation, Enter to insert |
| US-014 | P1 | 👤 | Share files and images | Attachment button → file picker, image thumbnail inline, file card link |
| US-015 | P1 | 👤 | Markdown rendering in messages | **bold**, *italic*, `code`, ```code blocks```, [links](url), auto-link URLs |
| US-016 | P1 | 👤 | Messages grouped by sender | Consecutive same-sender: hide avatar/name, reduce spacing |
| US-017 | P1 | 👤 | Date separators between days | Centered line with date label (e.g., "Monday, Apr 7") |
| US-018 | P1 | 👤 | See who is online (friends sidebar) | Right panel: member list with status dot, role, quick actions |
| US-019 | P1 | 👤 | Change my online status | Dropdown: Online / Working / DND / Offline, persisted |
| US-020 | P0 | 👤 | Create a new conversation | "New Chat" button → type picker (DM/Group/Channel/Squad) → member selector |
| US-021 | P0 | 👤 | Real-time message delivery status | "Sending..." → "Sent ✓" → "Failed ✗" with retry button |
| US-022 | P1 | 👤 | Unread counts per conversation | Badge on conversation item, total in notification bell |
| US-023 | P1 | 👤 | Search messages across conversations | Global search bar: keyword → results with conversation context, click to jump |
| US-024 | P1 | 👤 | Search within a conversation | In-conversation search: Cmd+F → highlight matches, prev/next arrows |
| US-025 | P2 | 👤 | Edit a sent message | Hover message → "Edit" option, inline editor, "edited" label after save |
| US-026 | P2 | 👤 | Delete a sent message | Hover → "Delete" → confirm dialog → message removed with "deleted" placeholder |
| US-027 | P2 | 👤 | Recall (unsend) a message within 2 minutes | Hover → "Recall" → message disappears for all participants |
| US-028 | P2 | 👤 | Emoji reactions on messages | Click reaction button → emoji picker → reaction badge below message |
| US-029 | P2 | 👤 | Reply in thread (quote) | Hover → "Reply" → quoted block + composer, threaded view |
| US-030 | P2 | 👤 | Forward a message to another conversation | Hover → "Forward" → conversation picker → forwarded card in target |
| US-031 | P1 | 👤 | Pin/unpin a conversation | Right-click → "Pin", pinned items float to top with pin icon |
| US-032 | P1 | 👤 | Mute a conversation | Right-click → "Mute", no notifications for this conversation |
| US-033 | P2 | 👤 | Archive a conversation | Right-click → "Archive", hidden from sidebar, searchable |
| US-034 | P2 | 👤 | Typing indicator | "Alex is typing..." with animated dots, multiple typers: "Alex and 2 others..." |
| US-035 | P1 | 👤 | See terminal output in chat | AI agent output auto-captured as dark code block in conversation |
| US-036 | P0 | 👤 | Click an agent avatar in chat to open its CLI console | Clicking agent avatar/name in message bubble or friends panel jumps directly to that agent's terminal session |
| US-037 | P1 | 👤 | Peek agent runtime card from chat | Hover or click avatar shows mini card: team, node, status, current task, branch, quick actions |
| US-038 | P1 | 👤 | Jump from conversation to team context | Chat header and member cards show team badge; clicking opens team detail / org context |
| US-039 | P1 | 👤 | See team knowledge context in chat | Squad/channel header can show linked team knowledge snippets, pinned docs, and shared memory summary |

### 4.3 Terminal Sessions (US-040 ~ US-055)

| ID | Pri | Role | Story | Acceptance Criteria |
|----|-----|------|-------|-------------------|
| US-040 | P0 | 👤 | See all active terminal sessions | Left sidebar: list with member name, provider icon, status dot |
| US-041 | P0 | 👤 | Attach to a terminal session | Click session → xterm.js renders ANSI output, cursor, colors |
| US-042 | P0 | 👤 | Type commands into the terminal | xterm captures keystrokes → API → PTY stdin → output rendered |
| US-043 | P0 | 👤 | See terminal intelligence status | Badge: Connecting / Online (green) / Working (pulsing yellow) / Offline (gray) |
| US-044 | P1 | 👤 | Auto-scroll following output | Toggle: "Following" / "Paused", auto-scroll on new output |
| US-045 | P1 | 👤 | Close a terminal session | Close button → confirm dialog → session marked exited |
| US-046 | P1 | 👤 | Resize the terminal | xterm.js FitAddon auto-adapts to container, resize events sent to backend |
| US-047 | P2 | 👤 | Split view: multiple terminals side-by-side | Tab bar + split button → 2-pane or 4-pane terminal grid |
| US-048 | P2 | 👤 | Export terminal output to file | "Export" button → download as .txt or .ansi with timestamps |
| US-049 | P2 | 👤 | Search within terminal output | Cmd+F in terminal → highlight matches in scrollback buffer |
| US-050 | P1 | 🔑 | Create a new terminal session for an agent | "New Session" → select agent → create session with provider defaults |
| US-051 | P2 | 👤 | View terminal session history (closed sessions) | "History" tab: past sessions with start/end time, output size, exit code |
| US-052 | P1 | 🌐 | Post-ready automation on session start | After shell ready: execute provider's post-ready plan (AI onboarding, etc.) |
| US-053 | P1 | 🌐 | Semantic output capture → chat | Semantic worker filters output, extracts chat-ready content, publishes to conversation |
| US-054 | P2 | 👤 | Terminal snapshot audit | Compare frontend/backend/reopen snapshots for state consistency |
| US-055 | P1 | 🌐 | Flow control backpressure | High watermark (200KB) pauses reads, low watermark (20KB) resumes |

### 4.4 Team & Members (US-060 ~ US-078, US-393 ~ US-402)

| ID | Pri | Role | Story | Acceptance Criteria |
|----|-----|------|-------|-------------------|
| US-060 | P0 | 👤 | See all workspace members | Grid of cards: avatar, name, role badge, terminal status, team tag |
| US-061 | P0 | 👤 | Filter members by team | Team tabs, click to filter roster, "All Teams" overview tab |
| US-062 | P0 | 🔑 | Create a new team | Modal: team name + description + initial member selection |
| US-063 | P0 | 🔑 | Invite a human member | Modal: display name, role dropdown (member/supervisor), team assignment |
| US-064 | P0 | 🔑 | Invite an AI assistant (agent) | 3-step flow: select provider → configure command/path/team → create |
| US-065 | P1 | 🔑 | Manage member details (edit/remove) | ManageMemberModal: rename, view role, remove with confirmation |
| US-066 | P1 | 🔑 | Change a member's role | Dropdown in member detail: owner/supervisor/assistant/member, save |
| US-067 | P1 | 🔑 | Move agent between teams | "Reassign Team" dropdown in agent detail, or drag-drop in org chart |
| US-068 | P1 | 👤 | See org chart (tree view) | Toggle: Grid / Org Chart, tree: Owner → Teams → Members/Agents with status |
| US-069 | P1 | 👤 | See cross-team overview | "All Teams" tab: table with team name, agent count, online/working/offline, cost |
| US-070 | P2 | 🔑 | Batch operations on agents | Select multiple → batch actions: start, stop, reassign team, assign skill |
| US-071 | P1 | 🔑 | Pause an agent | "Pause" button: agent stops accepting dispatches, status → "Paused" |
| US-072 | P1 | 🔑 | Resume a paused agent | "Resume" button: agent accepts dispatches again, status → "Online" |
| US-073 | P2 | 🔑 | Create agent from template/preset | "Use Template" → predefined configs (e.g., "Code Reviewer", "Test Runner") |
| US-074 | P1 | 🔑 | Delete a team | Team settings → "Delete Team" → confirm, members unassigned |
| US-075 | P1 | 🔑 | Edit team name/description | Team settings → inline edit, save |
| US-076 | P2 | 👤 | See agent uptime/work duration | Member card: "Working 4h 23m / Active 6h 10m" |
| US-077 | P1 | 👤 | See which skills each agent has | Skill chip badges on card, click to expand management panel |
| US-078 | P1 | 👤 | See which node hosts each agent | Node name + status indicator on member card |
| US-393 | P0 | 👤 | Model multiple departments inside one workspace | Teams such as Product, Backend, Frontend, QA, PM, and DevOps can coexist with their own lead, members, agents, and policies |
| US-394 | P1 | 👤 | See organizational hierarchy within and across teams | Org view supports workspace → department/team → subteam/role group → human members and agents |
| US-395 | P1 | 🔑 | Define role groups inside a team | Team can define groups such as product, backend, frontend, test, PM, design, operations for filtering and routing |
| US-396 | P1 | 👤 | See team lead, PM, and functional owners clearly | Team detail shows lead, PM, tech lead, owners, and linked service/repo scope |
| US-397 | P1 | 👤 | Browse a team detail page | Team page shows roster, active agents, repos, workflows, knowledge base, shared memory, and KPIs |
| US-398 | P1 | 👤 | See cross-functional delivery chain | Team detail can show Product → PM → R&D → Frontend → QA → Release flow with current blockers |
| US-399 | P2 | 🔑 | Create subteams or pods inside a team | Example: Backend Squad A / Backend Squad B under R&D with independent agents and policies |
| US-400 | P1 | 👤 | Open an agent console from the member roster | Clicking agent avatar/name on Members page jumps to the active terminal session or session history |
| US-401 | P1 | 👤 | Filter members by functional role | Filters support Product, Backend, Frontend, QA, PM, DevOps, shared services, and custom groups |
| US-402 | P2 | 👤 | See reporting line and collaboration line separately | Org chart can switch between management hierarchy and execution/collaboration graph |

### 4.5 Skills Management (US-080 ~ US-090)

| ID | Pri | Role | Story | Acceptance Criteria |
|----|-----|------|-------|-------------------|
| US-080 | P0 | 👤 | Browse the skill catalog | Grid of skill cards: name, description, category, usage count |
| US-081 | P1 | 👤 | Export skill snapshots | Export button → JSON file download with all member-skill bindings |
| US-082 | P1 | 👤 | Import skill snapshots | Import → file picker → preview table → apply button |
| US-083 | P1 | 🔑 | Create a new skill | Modal: skill name, description, category, markdown content editor |
| US-084 | P1 | 🔑 | Edit an existing skill | Click skill card → editor, markdown preview, save |
| US-085 | P2 | 🔑 | Version history for skills | Skill detail: list of versions, diff view, rollback button |
| US-086 | P0 | 🔑 | Assign skills to an agent | Skill panel: current skills (remove) + available skills (add), save |
| US-087 | P1 | 👤 | See skill usage statistics | Per-skill: how many agents use it, last used time, total invocations |
| US-088 | P2 | 🔑 | Bulk assign skills to multiple agents | Multi-select agents → "Assign Skill" → skill picker, apply to all |
| US-089 | P2 | 👤 | Skill dependency graph | Visual: which skills are commonly paired, recommendation engine |
| US-090 | P2 | 🔑 | Skill marketplace (community) | Browse community-shared skills, import with one click |

### 4.6 Node Topology & Monitoring (US-100 ~ US-124, US-361 ~ US-366)

| ID | Pri | Role | Story | Acceptance Criteria |
|----|-----|------|-------|-------------------|
| US-100 | P0 | 👤 | See all registered nodes | Metrics bar: total / online / degraded / offline counts |
| US-101 | P0 | 👤 | Toggle list vs. topology view | Two buttons: List (table) / Topology (canvas graph) |
| US-102 | P0 | 👤 | See visual network topology | Canvas: region clusters, status glow, connection lines, hover tooltips |
| US-103 | P1 | 🔑 | Assign agents to nodes | Modal: current assignments + available agents, assign/unassign |
| US-104 | P1 | 🌐 | Node status real-time updates | WebSocket: node.updated / node.offline → auto-refresh UI |
| US-105 | P1 | 👤 | See node CPU usage over time | Node detail: CPU timeline chart (1h), percentage + core count |
| US-106 | P1 | 👤 | See node memory usage over time | Node detail: memory timeline chart (1h), current GB / total GB |
| US-107 | P1 | 👤 | See node network I/O | Node detail: upload/download speed MB/s |
| US-108 | P0 | 👤 | See all agents hosted on a node | Agent table in node detail: name, team, status, CPU%, memory |
| US-109 | P1 | 👤 | Node capacity indicators | "2/4 capacity" with progress bar, warning at >80% |
| US-110 | P1 | 🌐 | Health alerts on high resource usage | Alert banner: "CPU > 85% for 5m" with recommendation + ack button |
| US-111 | P2 | 🔑 | Drain a node (migrate agents away) | "Drain" button → agents gradually reassigned → node marked cordoned |
| US-112 | P2 | 🔑 | Cordon a node (prevent new assignments) | "Cordon" toggle: no new agents, existing continue |
| US-113 | P1 | 👤 | See node labels and K8s metadata | Labels section: region, pool, namespace, pod name, image tag |
| US-114 | P2 | 🔑 | Register a new node | "Register Node" form: hostname, type (K8s/Bare Metal), region, labels |
| US-115 | P1 | 🔑 | Deregister (remove) a node | "Deregister" button → confirm → node removed, agents unassigned |
| US-116 | P2 | 🔑 | Configure alert rules | Rule editor: metric > threshold for duration → severity level |
| US-117 | P3 | 🌐 | Auto-scaling recommendations | System suggests adding/removing nodes based on agent load |
| US-118 | P2 | 👤 | Node fleet overview with resource columns | Table: node, type, region, status, agents, CPU%, Mem%, Net |
| US-361 | P0 | 🔑 | Join a K8s pod or bare-metal runner to the cluster | Node registration token + capability probe + heartbeat → node becomes schedulable only after validation |
| US-362 | P1 | 👤 | See node runtime capabilities | Node detail shows available provider CLIs, Git version, workspace root, disk, and schedulable labels |
| US-363 | P1 | 🔑 | Set node scheduling constraints | Admin can mark node pools by provider, repo affinity, team affinity, region, or storage class |
| US-364 | P1 | 🌐 | Reject unschedulable nodes automatically | Missing CLI/Git/workspace permissions cause node status `unschedulable` with clear remediation reason |
| US-365 | P2 | 🔑 | Drain and evacuate Git workspaces safely | Draining a node migrates or rehydrates worktrees before agent reassignment |
| US-366 | P2 | 👤 | See workspace residency per node | Node detail lists cloned repos/worktrees, branch heads, and which agents currently hold them |

### 4.7 Dashboard & Metrics (US-120 ~ US-130)

| ID | Pri | Role | Story | Acceptance Criteria |
|----|-----|------|-------|-------------------|
| US-120 | P0 | 👤 | Token usage summary | Total tokens, cost, per-member and per-node breakdown tables |
| US-121 | P0 | 👤 | Agent activity timeline | Recent actions: timestamp, agent, action type, status |
| US-122 | P1 | 👤 | Spark charts for trends | Inline SVG sparklines on token cards |
| US-123 | P1 | 👤 | Quick navigation to related pages | Shortcut buttons: Ledger, Nodes, Team |
| US-124 | P1 | 👤 | Cost breakdown by team | Table: team, agent count, tokens, cost, percentage bar |
| US-125 | P1 | 👤 | Cost timeline chart | Stacked area chart over selected period, legend by team |
| US-126 | P1 | 👤 | Agent token consumption leaderboard | Ranked list: #1-#N with tokens, cost, efficiency, sparkline |
| US-127 | P1 | 👤 | Agent work duration leaderboard | Ranked: work time, active time, idle%, sessions, weekly heatmap |
| US-128 | P2 | 👤 | Export billing reports | CSV export with period/team/agent filters |
| US-129 | P2 | 👤 | Per-agent cost by model breakdown | Agent detail: model name, call count, cost table |
| US-130 | P3 | 🔑 | Custom dashboard widgets | Add/remove/reorder dashboard cards, save layout |

### 4.8 Audit Ledger (US-131 ~ US-140)

| ID | Pri | Role | Story | Acceptance Criteria |
|----|-----|------|-------|-------------------|
| US-131 | P0 | 👤 | Filter audit events | Dropdowns: time range, team, member, node, event type + keyword search |
| US-132 | P0 | 👤 | See event details (expandable rows) | Click arrow → session ID, correlation ID, JSON context |
| US-133 | P1 | 🔑 | Record manual audit events | Form: event type, member, summary → POST → table refresh |
| US-134 | P1 | 👤 | Auto-refresh for live auditing | Toggle: 10s interval, visual indicator |
| US-135 | P1 | 👤 | Event type color coding | Colored pills: terminal/llm/tool/deploy/git/memory/skill |
| US-136 | P2 | 👤 | Export audit log (compliance) | CSV/JSON export with date range + filter, includes full context |
| US-137 | P2 | 👤 | Link from audit event to trace | Click event → navigate to Agent Trace waterfall view |
| US-138 | P2 | 🔑 | Audit log retention policy | Settings: auto-delete events older than N days |
| US-139 | P3 | 🌐 | Anomaly detection alerts | System flags unusual patterns: spike in errors, abnormal token usage |
| US-140 | P2 | 👤 | Audit event correlation (group related events) | Correlation ID links: click → see all events in same workflow |

### 4.9 Roadmap & Project Data (US-141 ~ US-150)

| ID | Pri | Role | Story | Acceptance Criteria |
|----|-----|------|-------|-------------------|
| US-141 | P0 | 👤 | View project roadmap (kanban) | Columns: To Do / In Progress / Done, draggable task cards |
| US-142 | P0 | 👤 | Edit roadmap tasks | Click card → edit title, status, description, priority |
| US-143 | P1 | 👤 | Roadmap progress summary | Completion bar, per-column counts, trend arrow |
| US-144 | P1 | 🔑 | Assign task to agent | Task card → assignee dropdown (humans + AI agents), save |
| US-145 | P2 | 👤 | Task dependencies | Drag link between tasks → blocked/blocking indicators |
| US-146 | P2 | 👤 | Gantt chart view | Toggle: Kanban / Gantt, timeline bars with dependencies |
| US-147 | P2 | 🔑 | Create task from chat | Chat message → "Create Task" action → pre-fill from message text |
| US-148 | P1 | 👤 | Project data key-value store | Custom metadata: key-value entries, edit, export |
| US-149 | P2 | 🌐 | Auto-update task status from agent output | Agent completes task → status → "Done", linked to trace |
| US-150 | P3 | 👤 | Sprint planning view | Group tasks by sprint/milestone, velocity chart |

### 4.10 Memory System (US-151 ~ US-162)

| ID | Pri | Role | Story | Acceptance Criteria |
|----|-----|------|-------|-------------------|
| US-151 | P0 | 👤 | Browse memory at three scopes | Tabs: Global / Team / Agent, each shows filtered KV entries |
| US-152 | P0 | 👤 | Add a memory entry | Key + value + optional TTL, save → appears in table |
| US-153 | P0 | 👤 | Delete a memory entry | Delete button per row → confirm → entry removed |
| US-154 | P1 | 👤 | Set TTL on memory entries | TTL picker: ∞ / 1h / 1d / 7d / 30d / custom |
| US-155 | P1 | 👤 | See which agents share team memory | Team memory header shows team name + member count |
| US-156 | P1 | 👤 | See agent's private memory | Agent detail → Memory section, scope: agent |
| US-157 | P2 | 👤 | Export/import memory entries per scope | JSON export/import buttons, preview before apply |
| US-158 | P2 | 👤 | Memory entry edit history | Expand entry → created_at, updated_at, owner_id |
| US-159 | P2 | 🌐 | Auto-expire entries by TTL | Background sweep removes expired entries, lazy delete on read |
| US-160 | P3 | 🌐 | Memory usage analytics | Dashboard widget: entries by scope, growth trend, top keys |
| US-161 | P1 | 👤 | Global memory visible to all agents | Entries at "global" scope available in every agent's context |
| US-162 | P1 | 👤 | Team memory shared within team only | Entries at "team" scope available only to that team's agents |

### 4.11 System & Health (US-163 ~ US-170)

| ID | Pri | Role | Story | Acceptance Criteria |
|----|-----|------|-------|-------------------|
| US-163 | P0 | 👤 | Check backend health | Panel: HTTP status, service name, request ID, warnings/errors |
| US-164 | P0 | 👤 | See node summary | Inline counts: total / online / degraded / offline |
| US-165 | P1 | 👤 | View system logs (recent) | Log panel: last 100 log lines, auto-scroll, level filter |
| US-166 | P2 | 🔑 | Configure system alert rules | Rule editor: conditions + thresholds + notification channels |
| US-167 | P2 | 👤 | System self-diagnostic | "Run Diagnostic" → checks all services, reports status matrix |
| US-168 | P2 | 👤 | WebSocket connection health | Panel: connection state, last cursor, reconnect count, latency |
| US-169 | P3 | 🌐 | Automated health check scheduling | Cron: run diagnostics every 5m, alert on degradation |
| US-170 | P2 | 👤 | System contracts checklist | Compliance items: message size limits, rate limits, token caps |

### 4.12 Settings (US-171 ~ US-180)

| ID | Pri | Role | Story | Acceptance Criteria |
|----|-----|------|-------|-------------------|
| US-171 | P0 | 👤 | Edit my profile (name, avatar, timezone) | Form → save to backend → toast confirmation |
| US-172 | P1 | 👤 | Configure notification preferences | Browser notifications, sound, DND hours → persisted |
| US-173 | P1 | 👤 | See keyboard shortcuts | Keybinds list: combo + description + scope |
| US-174 | P0 | 👤 | Switch light/dark theme | Toggle button, instant switch, persisted |
| US-175 | P1 | 👤 | Change language | Locale dropdown (en/zh/ja), instant switch |
| US-176 | P1 | 👤 | API connection diagnostics | Ping /healthz → latency + status display |
| US-177 | P2 | 🔑 | Workspace settings (name, defaults) | Workspace name, default team, auto-join rules |
| US-178 | P2 | 🔑 | Manage API keys | Create/revoke API keys for external integrations |
| US-179 | P3 | 🔑 | Webhook configuration | Add webhook URLs for events (new message, agent error, etc.) |
| US-180 | P2 | 👤 | Data export (GDPR) | "Export My Data" → download all personal data as JSON |

### 4.13 Plugins (US-181 ~ US-188)

| ID | Pri | Role | Story | Acceptance Criteria |
|----|-----|------|-------|-------------------|
| US-181 | P1 | 👤 | Browse available plugins | Grid: icon, name, description, version, rating, category |
| US-182 | P1 | 👤 | Filter plugins by category | Category pills: All, Development, Productivity, Design, etc. |
| US-183 | P1 | 👤 | Search plugins by name | Search input, real-time filtering |
| US-184 | P1 | 👤 | Install a plugin | Install button → toast "Installed", card updates to "Remove" |
| US-185 | P1 | 👤 | Remove a plugin | Remove button → confirm → toast "Removed" |
| US-186 | P1 | 👤 | See my installed plugins | "My Plugins" tab with installed count |
| US-187 | P3 | 👤 | Plugin detail page | Full description, screenshots, changelog, reviews |
| US-188 | P3 | 🔑 | Plugin auto-update | Check for updates, one-click upgrade |

### 4.14 Agent Tracing & Observability (US-190 ~ US-210)

| ID | Pri | Role | Story | Acceptance Criteria |
|----|-----|------|-------|-------------------|
| US-190 | P1 | 👤 | See all traces for an agent session | Session view: trace list with task, duration, tokens, cost, score |
| US-191 | P1 | 👤 | Waterfall timeline of trace execution | Proportional bars per observation, nested, TTFT shading for LLM calls |
| US-192 | P1 | 👤 | Tree view of trace steps | Hierarchical: collapsible nodes, type icons, input/output, metrics |
| US-193 | P1 | 👤 | See LLM generation details | Model, tokens (in/out), cost, TTFT, prompt/completion content |
| US-194 | P1 | 👤 | See tool execution details | Command, output, duration, exit status, file paths |
| US-195 | P2 | 👤 | Score traces manually | Star rating (1-5) × 4 dimensions + free-text comment |
| US-196 | P2 | 🌐 | Automated trace evaluation | LLM-as-judge, checklist coverage, test pass rate, token efficiency |
| US-197 | P2 | 👤 | Score trends over time | Line chart: avg score per day/week, trend arrow |
| US-198 | P1 | 👤 | Compare agent efficiency | Side-by-side: tokens/trace, cost/trace, avg score, success rate |
| US-199 | P2 | 👤 | Export trace data | JSON export per trace or per session, with observations and scores |
| US-200 | P1 | 👤 | Token usage leaderboard | Ranked: total tokens, cost, calls, efficiency, sparkline |
| US-201 | P1 | 👤 | Work duration leaderboard | Ranked: work time, active time, idle%, sessions, weekly heatmap |
| US-202 | P1 | 👤 | Search traces by keyword | Search input → filters by task summary, command, output content |
| US-203 | P1 | 👤 | Filter traces by status | Status filter: completed, failed, in-progress, timeout |
| US-204 | P1 | 👤 | See generation latency (TTFT) | Shaded area before execution bar in waterfall, value in ms |
| US-205 | P2 | 👤 | Trace comparison (A/B) | Select 2 traces → side-by-side diff: steps, tokens, cost, score |
| US-206 | P3 | 🌐 | Trace-based regression detection | Alert when agent performance degrades vs. baseline |
| US-207 | P2 | 👤 | Link from chat message to trace | "View Trace" button on AI message → opens trace detail |
| US-208 | P2 | 👤 | Observation type breakdown | Pie chart: % time in generation vs. tool vs. reasoning |
| US-209 | P3 | 🌐 | Trace replay (step-by-step playback) | Playback controls: play/pause/step through observations chronologically |
| US-210 | P2 | 👤 | Trace cost attribution | Per-observation cost + cumulative cost in tree view |
| US-211 | P0 | 👤 | See the agent's current intent and live step | Active trace shows current stage, current command/tool, current file set, and elapsed runtime |
| US-212 | P1 | 👤 | See the agent's explicit plan route | Trace detail includes ordered plan nodes with status: pending, active, completed, blocked, skipped |
| US-213 | P1 | 👤 | See upstream and downstream task dependencies | Trace/task graph shows parent task, child tasks, prerequisite edges, handoffs, and blocked-by relations |
| US-214 | P1 | 👤 | See why the agent chose a step | Observation detail can capture rationale, selected strategy, and evidence references when available |
| US-215 | P1 | 👤 | See file-level work focus over time | Trace timeline highlights touched files/directories and maps them to observations and task phases |
| US-216 | P1 | 👤 | See cross-agent dependency graph | If one agent hands work to another, graph shows source trace, target trace, dependency type, and result |
| US-217 | P2 | 👤 | Compare planned route vs executed route | Trace view shows plan drift: skipped steps, retries, unexpected tools, or reordered execution |
| US-218 | P2 | 🌐 | Detect stalled or looping plans | System flags repeated tool loops, no-progress retries, or plan nodes stuck beyond threshold |
| US-219 | P2 | 👤 | Replay an agent run as a narrative timeline | Narrative mode reconstructs intent → tool use → outputs → handoffs → final artifact in one readable stream |

### 4.15 Global UX (US-220 ~ US-232)

| ID | Pri | Role | Story | Acceptance Criteria |
|----|-----|------|-------|-------------------|
| US-220 | P0 | 👤 | Command palette (Cmd+K) | Modal: search, grouped results, keyboard navigation, Execute/Escape |
| US-221 | P1 | 👤 | Keyboard shortcuts | Cmd+1 Chat, Cmd+2 Terminal, Cmd+, Settings, Cmd+Shift+L theme |
| US-222 | P1 | 🌐 | Offline detection | Red banner: "Connection lost — retrying...", auto-dismiss on reconnect |
| US-223 | P0 | 👤 | Loading states (skeleton) | Shimmer placeholders on every page during data fetch |
| US-224 | P0 | 👤 | Empty states | Icon + title + description + CTA button when no data |
| US-225 | P0 | 👤 | Operation feedback (toast) | info/warning/error toasts, auto-dismiss 5s, progress bar |
| US-226 | P1 | 👤 | Confirmation before destructive actions | ConfirmDialog: title, description, Cancel + Confirm (danger tone) |
| US-227 | P1 | 👤 | Page transition animations | Fade + slide-up on route change (220ms) |
| US-228 | P1 | 👤 | Responsive layout (mobile) | 640/768/1024 breakpoints, sidebar collapse, single-column |
| US-229 | P1 | 👤 | Dark mode across all components | All CSS uses theme variables, smooth toggle |
| US-230 | P2 | 👤 | Keyboard shortcut cheat sheet | Long-press Cmd → overlay showing all available shortcuts |
| US-231 | P2 | 👤 | Notification center (panel) | Dropdown: recent unread conversations (max 6), mark all read |
| US-232 | P1 | 👤 | Accessibility (WCAG AA) | aria-labels, focus management, skip-to-content, reduced motion |

### 4.16 Multi-Agent Orchestration & Scheduling (US-240 ~ US-265)

| ID | Pri | Role | Story | Acceptance Criteria |
|----|-----|------|-------|-------------------|
| US-240 | P0 | 👤 | Dispatch a task to a specific agent via chat | @mention agent in message → message pipeline → outbox → dispatch queue → PTY stdin |
| US-241 | P0 | 👤 | Dispatch a task to multiple agents simultaneously | @mention multiple agents in one message → parallel dispatch to each agent's terminal |
| US-242 | P1 | 🔑 | Set task priority (urgent / normal / low) | Priority tag on message → dispatch queue sorts by priority → urgent processed first |
| US-243 | P1 | 🌐 | Auto-assign tasks to idle agents (round-robin) | Unaddressed message in squad thread → system picks least-busy online agent → dispatch |
| US-244 | P1 | 🌐 | Load-balanced task distribution | System routes to agent with lowest queue depth + lowest Working time in last 10 min |
| US-245 | P1 | 👤 | See dispatch queue status per agent | Agent detail → Queue panel: depth (x/32), inflight, pending items, dedup window |
| US-246 | P1 | 🌐 | Agent task timeout | If agent doesn't produce output within configurable timeout (default 5 min), mark task failed |
| US-247 | P2 | 🌐 | Agent circuit breaker (auto-pause on repeated failures) | 3 consecutive failures in 10 min → auto-pause agent → alert admin → require manual resume |
| US-248 | P1 | 🌐 | Agent failover to backup | Primary agent fails/offline → system re-routes to backup agent in same team |
| US-249 | P2 | 🔑 | Configure failover pairs | Settings: primary → backup mapping per team (e.g., Claude BE → Qwen API) |
| US-250 | P1 | 👤 | Task retry on failure | Failed dispatch → toast with "Retry" button → re-enqueue with same priority |
| US-251 | P2 | 🌐 | Dead letter queue | After max retries (6), task moved to dead letter → visible in System page → manual re-queue |
| US-252 | P1 | 🔑 | Set per-agent concurrency limit | Agent settings: max parallel tasks (default 1), queue overflow → wait or reject |
| US-253 | P2 | 👤 | See global task queue dashboard | Dashboard widget: total queued / inflight / completed / failed, throughput chart |
| US-254 | P2 | 🌐 | Task deduplication across agents | Same message dispatched to multiple agents → dedup by message ID within 128-entry window |

### 4.17 Agent Workflow Orchestration (US-260 ~ US-280)

| ID | Pri | Role | Story | Acceptance Criteria |
|----|-----|------|-------|-------------------|
| US-260 | P1 | 🔑 | Create a sequential workflow (Agent A → Agent B) | Workflow editor: chain steps, output of step N feeds input of step N+1 |
| US-261 | P1 | 🔑 | Create a parallel workflow (Agent A + Agent B simultaneously) | Workflow editor: fan-out step, all branches execute in parallel, fan-in collects results |
| US-262 | P1 | 🔑 | Create a conditional workflow (if/else branching) | Workflow editor: condition node evaluates output → routes to branch A or branch B |
| US-263 | P1 | 👤 | See workflow execution in real-time | Workflow view: step nodes light up green/yellow/red as they execute, progress line |
| US-264 | P2 | 🔑 | Define workflow from template | Preset templates: "Code Review Pipeline", "Test & Deploy", "Research & Report" |
| US-265 | P2 | 🔑 | Schedule a workflow (cron) | Scheduler: run workflow daily at 09:00, or every 2 hours, or on git push webhook |
| US-266 | P1 | 🔑 | Abort a running workflow | "Abort" button → all in-progress steps cancelled, agents return to Online |
| US-267 | P2 | 🌐 | Workflow step timeout | Per-step timeout (default 10 min), exceeded → step marked failed, workflow continues or halts based on config |
| US-268 | P1 | 👤 | See workflow execution history | List: workflow name, trigger, start/end time, status, steps completed, total cost |
| US-269 | P2 | 🔑 | Workflow rollback on failure | Config: "rollback on failure" → system sends undo commands to completed steps |
| US-270 | P1 | 👤 | Link workflow execution to traces | Each workflow step creates a trace → click step → opens trace waterfall |

#### 4.17.1 Workflow Editor Wireframe

```
┌─ Workflow: Code Review Pipeline ─────────────────────────────────────────┐
│                                                                           │
│  Trigger: [On Chat Command ✓] [On Schedule] [On Webhook] [Manual]       │
│                                                                           │
│  ┌─────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐        │
│  │ START   │────▶│ Step 1   │────▶│ Step 2   │────▶│ Step 3   │        │
│  │ (trigger)│     │          │     │          │     │          │        │
│  └─────────┘     │ Claude BE│     │ Claude QA│     │ Claude PM│        │
│                   │ "Review  │     │ "Run     │     │ "Write   │        │
│                   │  code"   │     │  tests"  │     │  summary"│        │
│                   │          │     │          │     │          │        │
│                   │ Timeout: │     │ Timeout: │     │ Timeout: │        │
│                   │ 10 min   │     │ 5 min    │     │ 3 min    │        │
│                   └──────────┘     └──────────┘     └────┬─────┘        │
│                                                          │               │
│                                                     ┌────▼─────┐        │
│                                                     │ END      │        │
│                                                     │ (notify) │        │
│                                                     └──────────┘        │
│                                                                           │
│  ── Execution Config ──                                                  │
│  On step failure: [Halt workflow ✓] [Skip and continue] [Rollback all]  │
│  Notification: [Toast ✓] [Chat message ✓] [Webhook]                    │
│  Max retries per step: [1]                                               │
│                                                                           │
│  [Save Draft]  [Test Run]  [Activate]                                   │
└───────────────────────────────────────────────────────────────────────────┘
```

#### 4.17.2 Workflow Execution View

```
┌─ Execution: Code Review Pipeline #42 ───────────────────────────────────┐
│                                                                           │
│  Status: 🟡 Running  ·  Started: 10:12:00  ·  Elapsed: 3m 24s          │
│  Trigger: Chat command by Alex  ·  Thread: "Backend Squad"              │
│                                                                           │
│  ┌─────────┐  ✅  ┌──────────┐  🟡  ┌──────────┐  ⏳  ┌──────────┐   │
│  │ START   │─────▶│ Step 1   │─────▶│ Step 2   │─────▶│ Step 3   │   │
│  │ ✓ 0s    │      │ ✓ 1m 12s │      │ ◉ 2m 12s │      │ ○ pending│   │
│  └─────────┘      │ Claude BE│      │ Claude QA│      │ Claude PM│   │
│                    │ $0.89    │      │ $0.45... │      │ —        │   │
│                    │ 12,456t  │      │ 8,200t..│      │          │   │
│                    └──────────┘      └──────────┘      └──────────┘   │
│                                                                           │
│  ── Step 2 Output (live) ──────────────────────────────────────────────  │
│  ┌─ Claude QA terminal ──────────────────────────────────────────────┐  │
│  │ $ go test ./internal/auth/... -v                                  │  │
│  │ === RUN   TestJWTExpiry                                           │  │
│  │ --- PASS: TestJWTExpiry (0.02s)                                   │  │
│  │ === RUN   TestJWTMalformed                                        │  │
│  │ --- PASS: TestJWTMalformed (0.01s)                                │  │
│  │ ◉ running...                                                      │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                                                                           │
│  [Abort Workflow]  [View Full Trace]                                     │
└───────────────────────────────────────────────────────────────────────────┘
```

### 4.18 Agent Conflict & Safety (US-275 ~ US-290)

| ID | Pri | Role | Story | Acceptance Criteria |
|----|-----|------|-------|-------------------|
| US-275 | P1 | 🌐 | Detect file conflict between agents | Two agents editing same file → system flags conflict → alert in chat + dashboard |
| US-276 | P1 | 👤 | See conflict notification | Toast: "⚠️ Claude BE and Gemini FE both modified src/auth.ts" with diff link |
| US-277 | P2 | 👤 | Resolve conflict manually | Conflict view: side-by-side diff, pick version A / B / merge, apply |
| US-278 | P2 | 🌐 | Auto-resolve by priority | Config: higher-priority agent's changes win, lower auto-reverts |
| US-279 | P1 | 🔑 | Set agent permissions scope | Per-agent: allowed directories/files, denied patterns (e.g., "no deploy/*") |
| US-280 | P2 | 🔑 | Agent sandbox mode | Toggle: agent can only read (no write/execute), useful for auditing |
| US-281 | P1 | 🌐 | Agent output safety check | Auto-scan output for secrets/tokens/PII before posting to chat |
| US-282 | P2 | 🌐 | Agent rate limiting | Max LLM calls per hour per agent (prevent runaway cost) |
| US-283 | P2 | 🔑 | Agent spending cap | Per-agent daily/weekly cost limit, exceeded → auto-pause + alert |
| US-284 | P1 | 👤 | See agent error log | Agent detail → Errors tab: recent failures with timestamp, error type, stack |
| US-285 | P2 | 🌐 | Task rollback on agent failure | Agent fails mid-task → auto git stash/revert changes made in this session |

### 4.19 Agent Communication & Collaboration (US-290 ~ US-302)

| ID | Pri | Role | Story | Acceptance Criteria |
|----|-----|------|-------|-------------------|
| US-290 | P1 | 🤖 | Agent-to-agent message passing | Agent A sends structured message to Agent B via internal channel (not visible in human chat unless opted in) |
| US-291 | P1 | 👤 | See agent-to-agent communications | "Agent Comms" tab in conversation: shows inter-agent messages with sender/receiver |
| US-292 | P2 | 🤖 | Agent requests help from another agent | Agent stuck → sends help request → routed to agent with matching skill |
| US-293 | P2 | 🤖 | Agent delegates subtask to another agent | Agent A breaks task into subtasks → dispatches subtask to Agent B → waits for result |
| US-294 | P1 | 👤 | See agent delegation chain | Trace view: shows delegation arrows between agents within a workflow |
| US-295 | P2 | 🤖 | Agent shares context with another agent | Agent A writes to team memory → Agent B reads from team memory → shared understanding |
| US-296 | P2 | 🤖 | Agent votes on a decision | Multi-agent consensus: 3 agents review code → majority vote → proceed/reject |
| US-297 | P3 | 🔑 | Configure agent communication policies | Rules: which agents can talk to which, message size limits, rate limits |
| US-298 | P2 | 👤 | See agent collaboration graph | Visual: nodes = agents, edges = messages exchanged, thickness = frequency |
| US-299 | P1 | 👤 | Agent handoff (transfer task to another agent) | Agent A → "Handoff to Gemini FE" → full context transferred → Gemini continues |
| US-300 | P2 | 🌐 | Agent swarm mode (all agents work on same task) | Broadcast task → all agents in team work independently → results merged |
| US-301 | P2 | 👤 | See swarm results comparison | Side-by-side: each agent's output, select best, discard others |
| US-302 | P3 | 🌐 | Agent reputation scoring | System tracks success rate per agent per skill → influences auto-assignment |

### 4.20 Multi-Team Workspace Governance (US-310 ~ US-320)

| ID | Pri | Role | Story | Acceptance Criteria |
|----|-----|------|-------|-------------------|
| US-310 | P0 | 🔑 | Create and manage multiple teams in one workspace | Workspace supports 2-N teams with independent roster, agents, memory, and cost attribution |
| US-311 | P1 | 👤 | See workspace portfolio by team | Portfolio view: team, lead, agents, active tasks, spend, health, pending approvals |
| US-312 | P1 | 🔑 | Assign team leads / supervisors per team | Team settings: lead/supervisor assignment, visible in org view and approval routing |
| US-313 | P1 | 🔑 | Set team-level routing policy | Team settings: default providers, fallback order, max queue depth, allowed workflow templates |
| US-314 | P1 | 👤 | See cross-team dependencies | Team overview graph: blocked teams, upstream/downstream task links, shared workflows |
| US-315 | P2 | 🔑 | Create shared service teams | Special teams such as Platform or DevOps can be marked shared and serve multiple product squads |
| US-316 | P1 | 🔑 | Restrict cross-team visibility | Policy: private team, visible team, or workspace-visible; affects chat, memory, traces, and artifacts |
| US-317 | P2 | 👤 | Handoff work between teams | Task / workflow handoff preserves context, artifacts, trace link, and ownership change history |
| US-318 | P1 | 🔑 | See team SLA / health summary | Team card shows queue depth, failed tasks, avg turnaround, budget burn, and approval backlog |
| US-319 | P2 | 🔑 | Clone team setup from template | Copy team defaults: roles, skills, routing policy, approval policy, and budget rules |
| US-320 | P2 | 👤 | Filter all major pages by team | Dashboard, Ledger, Traces, Artifacts, and Approvals support team-scoped filtering |

### 4.21 Approval, Secrets & Policy Controls (US-321 ~ US-334)

| ID | Pri | Role | Story | Acceptance Criteria |
|----|-----|------|-------|-------------------|
| US-321 | P0 | 🔑 | Require approval before high-risk actions | Policy rules can gate deploy, file write, shell exec, git push, plugin install, and secret access |
| US-322 | P0 | 👤 | Review and approve pending actions | Approvals page lists pending requests with actor, team, risk reason, diff/command preview, approve/reject |
| US-323 | P1 | 👤 | See approval chain and audit log | Each approval records requester, approver, timestamps, decision, comment, and linked task/trace |
| US-324 | P1 | 🔑 | Configure approval policies by team or workflow | Rules can scope by team, provider, workflow template, command pattern, file path, or cost threshold |
| US-325 | P1 | 🌐 | Pause workflow at approval gate | Workflow step enters `waiting_approval` state, notifies approvers, and resumes or aborts on decision |
| US-326 | P0 | 🔑 | Store secrets in a dedicated vault | Secrets are stored separately from memory with encryption, scope, owner, and rotation metadata |
| US-327 | P1 | 🔑 | Inject secrets into agents securely | Agent/session receives scoped secret at runtime without exposing full value in chat, trace, or logs |
| US-328 | P1 | 👤 | See secret usage audit | Secret detail shows last accessed time, accessor, team, workflow, and access result |
| US-329 | P1 | 🔑 | Rotate and revoke secrets | Manual rotate/revoke action invalidates old revision and updates consumers |
| US-330 | P1 | 🌐 | Redact secrets automatically from output | Output scanner masks matching secret values and emits safety event in Ledger |
| US-331 | P2 | 🔑 | Enforce just-in-time secret access | Secrets can require approval or temporary lease before agent/session can use them |
| US-332 | P2 | 🔑 | Define policy bundles | Reusable policies such as "read-only reviewer", "deploy operator", "production approver" |
| US-333 | P2 | 👤 | See why an action was blocked | Blocked task/command shows matched policy, missing approval, or denied capability |
| US-334 | P2 | 🌐 | Expire stale approvals automatically | Approval requests can expire after N minutes and move task/workflow to failed or retry state |

### 4.22 Repository, Artifacts & Knowledge Sources (US-335 ~ US-348)

| ID | Pri | Role | Story | Acceptance Criteria |
|----|-----|------|-------|-------------------|
| US-335 | P0 | 🔑 | Connect one or more code repositories to a workspace | Repositories page supports adding multiple repos with default branch, provider, visibility, and team ownership |
| US-336 | P1 | 👤 | See repository status in the workspace | Repo card shows branch, latest commit, open PRs, CI status, linked teams, and recent agent activity |
| US-337 | P1 | 👤 | Link tasks, traces, and workflows to PRs | Task or trace detail can reference repo, branch, commit, and PR URL with jump links |
| US-338 | P1 | 👤 | Preview code diffs produced by agents | Artifact/diff panel shows changed files, summary, additions/deletions, and inline preview before merge |
| US-339 | P1 | 🔑 | Create PR-ready output from agent work | System can group commits, generate PR title/body draft, and attach related artifacts and traces |
| US-340 | P1 | 👤 | Browse generated artifacts | Artifacts page lists reports, plans, patches, test results, exports, and generated docs with version history |
| US-341 | P1 | 👤 | Mark an artifact as canonical output | One artifact version can be marked final for a task, workflow, or conversation |
| US-342 | P2 | 👤 | Compare artifact versions | Diff viewer supports text, markdown, JSON, and patch outputs |
| US-343 | P1 | 🔑 | Connect external knowledge sources | Add docs, wiki, repo docs, runbooks, or URLs as indexed knowledge sources with ownership and refresh rules |
| US-344 | P1 | 👤 | Cite knowledge source provenance | AI output can show source title, location, chunk, and retrieved time for referenced material |
| US-345 | P2 | 🔑 | Control knowledge visibility by team | Knowledge source can be global, team-scoped, or workflow-scoped |
| US-346 | P2 | 🌐 | Re-index knowledge sources automatically | Background job refreshes changed sources on schedule or webhook |
| US-347 | P2 | 👤 | Search across knowledge and artifacts | Global search returns chat, trace, artifact, and source matches in one result set |
| US-348 | P2 | 🌐 | Detect stale knowledge | System flags sources that failed refresh, moved, or exceeded freshness SLA |
| US-403 | P0 | 👤 | Maintain a knowledge base per team | Each team has its own curated knowledge space for docs, specs, contracts, and operating rules |
| US-404 | P1 | 👤 | Organize team knowledge by domain | Knowledge spaces support sections such as product, backend, frontend, QA, PM, release, and onboarding |
| US-405 | P1 | 👤 | Share selected knowledge across teams | Team can publish a knowledge item to workspace-wide, selected teams, or workflow scope |
| US-406 | P1 | 👤 | See linked knowledge in team detail and chat | Team page and squad chat can surface pinned docs, latest updates, and suggested context |
| US-407 | P1 | 🔑 | Control edit and publish permissions for knowledge | Teams can restrict who edits drafts, who approves publication, and who can share externally |
| US-408 | P2 | 👤 | Track knowledge freshness and ownership | Each document shows owner, last review date, stale warning, and review SLA |

### 4.23 Notifications, Budgeting & Escalation (US-349 ~ US-360)

| ID | Pri | Role | Story | Acceptance Criteria |
|----|-----|------|-------|-------------------|
| US-349 | P1 | 🔑 | Set budget by workspace, team, or workflow | Budget rules support daily/weekly/monthly spend caps and warning thresholds |
| US-350 | P1 | 👤 | See budget burn in real time | Dashboard shows actual vs budget, burn rate, projected overrun, and threshold markers |
| US-351 | P1 | 🌐 | Trigger alerts on budget threshold breach | 50/80/100% thresholds can create alert, toast, webhook, or auto-pause action |
| US-352 | P1 | 🔑 | Route notifications to external channels | Slack, Feishu, email, webhook, or PagerDuty-style endpoint can be configured per rule |
| US-353 | P1 | 👤 | Acknowledge and close incidents | Alert detail supports ack, owner assignment, notes, and resolved timestamp |
| US-354 | P2 | 🔑 | Escalate unacknowledged incidents | If alert is not acknowledged within SLA, notify next responder group or team lead |
| US-355 | P2 | 👤 | Create quiet hours and severity rules | Notification policy supports team quiet hours, severity overrides, and channel fallback |
| US-356 | P1 | 👤 | See an incident timeline | Incident detail aggregates node alerts, failed workflows, approval stalls, budget breaches, and recovery actions |
| US-357 | P2 | 🔑 | Auto-degrade operation mode when budget is tight | System can switch to cheaper provider fallback, disable non-critical workflows, or cap concurrency |
| US-358 | P2 | 🌐 | Detect approval backlog risk | If approvals pile up beyond threshold, surface team health warning and route escalation |
| US-359 | P2 | 👤 | Subscribe to team-level notifications | User can follow one or more teams and receive only relevant approvals, incidents, and workflow outcomes |
| US-360 | P2 | 🔑 | Report chargeback by team or project | Exportable report maps spend to team, workflow, repository, and project tag |

### 4.24 Agent Production Process Management (US-370 ~ US-380)

| ID | Pri | Role | Story | Acceptance Criteria |
|----|-----|------|-------|-------------------|
| US-370 | P0 | 👤 | Manage a task as a first-class production object | Every task has durable ID, source, owner team, assigned agent, repo, branch, plan, status, SLA, and linked traces/artifacts |
| US-371 | P0 | 👤 | See full task lifecycle state | Task moves through queued, planned, running, waiting_approval, blocked, handed_off, done, failed, canceled |
| US-372 | P1 | 👤 | Require structured plan before execution for selected task types | Policy can force agents to emit plan nodes before mutable actions begin |
| US-373 | P1 | 👤 | Track plan changes over time | Task detail shows original plan, revised plan, drift reason, approver if required, and execution delta |
| US-374 | P1 | 👤 | See current blocking reason | Task detail can show blocked on approval, dependency, missing Git workspace, unschedulable node, or failed prerequisite |
| US-375 | P1 | 🔑 | Define task classes and operating policies | Classes such as bugfix, code review, deploy, migration, incident, research can set SLA, approval, Git, and provider rules |
| US-376 | P1 | 👤 | Reassign a running task safely across agents or nodes | Handoff preserves plan, Git context, partial artifacts, and lineage graph |
| US-377 | P2 | 🌐 | Resume interrupted production tasks after node failure | System restores task from durable state, reconciles Git workspace, and restarts from last safe checkpoint |
| US-378 | P2 | 👤 | Inspect checkpoints for long-running tasks | Task timeline records checkpoints such as plan accepted, tests passed, artifact emitted, approval granted |
| US-379 | P2 | 🔑 | Set retention by task class | Different task classes can keep traces, outputs, and artifacts for different durations |
| US-380 | P2 | 👤 | Search and filter the global task registry | Users can query by team, repo, branch, agent, state, blocker, node, and workflow |

### 4.25 Team Task Map & Execution Topology (US-381 ~ US-392)

| ID | Pri | Role | Story | Acceptance Criteria |
|----|-----|------|-------|-------------------|
| US-381 | P0 | 👤 | See a full task topology for a team | Team Task Map renders tasks as nodes and dependencies as edges, scoped to one team or one cross-team delivery chain |
| US-382 | P0 | 👤 | See upstream and downstream counts for each task | Task node shows number of upstream dependencies and downstream dependent tasks |
| US-383 | P0 | 👤 | Identify the core path and core tasks | System highlights critical path and marks tasks with highest dependency or blocker impact |
| US-384 | P1 | 👤 | See overall progress for the task map | Header shows total tasks, completed, running, blocked, failed, percent complete, and ETA trend |
| US-385 | P1 | 👤 | See which agents are responsible for each task | Each task node lists assigned human owner, assigned agents, current node, and current runtime status |
| US-386 | P1 | 👤 | See outputs attached to each task | Task node and detail show artifacts, changed files, PR link, branch, and latest emitted output |
| US-387 | P1 | 👤 | Expand a task node into detail side panel | Side panel shows plan route, upstream/downstream tasks, trace summary, blockers, artifacts, and assigned agents |
| US-388 | P1 | 👤 | Filter the task map by status or role | Filters support Product, Backend, Frontend, QA, PM, DevOps, agent, repo, status, and critical path |
| US-389 | P1 | 👤 | See task health directly on the graph | Node color/style indicates queued, running, blocked, waiting approval, failed, done, or stale |
| US-390 | P2 | 👤 | Switch between topology, timeline, and lane views | Team Task Map supports graph, swimlane by function, and timeline/critical-path views |
| US-391 | P2 | 🌐 | Detect orphaned or overloaded tasks | System flags tasks with no owner, too many downstream dependents, or repeated failures |
| US-392 | P2 | 👤 | Compare planned dependency map vs actual execution map | View shows where extra tasks, skipped tasks, unexpected handoffs, or execution drift occurred |
| US-421 | P1 | 👤 | See why a task is marked core | Task node/detail shows score breakdown: downstream impact, blocker count, SLA risk, task class, and output importance |
| US-422 | P1 | 🌐 | Rebuild task topology automatically from system evidence | Workflow edges, handoffs, artifacts, approvals, Git links, and trace signals can update the graph without manual redraw |

### 4.26 Git Workspace & Cross-Node Repository Operations (US-409 ~ US-420)

| ID | Pri | Role | Story | Acceptance Criteria |
|----|-----|------|-------|-------------------|
| US-409 | P0 | 🔑 | Provision a managed Git workspace for an agent task | Task gets repo clone/worktree, branch, remote, credentials scope, and writable path before execution |
| US-410 | P0 | 👤 | See Git state for a running task | Task/trace detail shows repo, branch, HEAD, dirty files, untracked files, ahead/behind, and worktree path |
| US-411 | P1 | 👤 | See which Git commands the agent executed | Trace captures Git operations as typed tool observations rather than opaque terminal text only |
| US-412 | P1 | 🔑 | Enforce Git policy by task type | Example: code review may allow diff/log only; fix task may allow commit; deploy task may require clean tree |
| US-413 | P1 | 🌐 | Rehydrate a Git workspace on another node | On failover or reschedule, system restores clone/worktree and validates commit/branch parity before resuming |
| US-414 | P1 | 👤 | Detect Git divergence and merge risk | System flags local drift, rebase requirement, merge conflicts, or remote branch movement |
| US-415 | P1 | 👤 | Compare work produced on multiple nodes | Users can compare branch heads, patch sets, and artifacts across agents or nodes for the same task |
| US-416 | P2 | 🔑 | Pin a repository or branch to a node pool | Scheduling can prefer nodes with warm clones, repo cache, or regulated network access |
| US-417 | P2 | 🌐 | Warm and recycle repo caches in the cluster | Frequently used repos can be prefetched or cached to reduce task startup latency |
| US-418 | P2 | 👤 | Open PR or merge request from managed workspace | System generates branch summary, commits, artifacts, and approval evidence into PR-ready output |
| US-419 | P2 | 🔑 | Recover from dirty worktree safely | Users can checkpoint, stash, clone a rescue branch, or quarantine a failed workspace |
| US-420 | P2 | 👤 | Audit Git lineage for a task | Users can see command history, commits, branch changes, handoff nodes, and final PR linkage |

### 4.27 End-to-End Journeys (J-01 ~ J-07)

> These are **cross-functional journeys** that span multiple features. Each journey validates that the system works as a complete workflow.

#### J-01: Onboard an AI Agent and Dispatch First Task

```
1. Admin logs in (US-001)
2. Navigate to Members page (US-060)
3. Create "Backend Squad" team (US-062)
4. Click "Invite AI Assistant" (US-064)
   → Select Claude Code provider
   → Configure: name "Claude BE", command "claude", team "Backend Squad"
   → Create → session starts, post-ready runs
5. Assign skills: code-review, test-gen (US-086)
6. Navigate to Chat → Create Squad Thread with Claude BE (US-020)
7. Send message: "Review the auth middleware code" (US-012)
   → Message pipeline: normalize → plan → policy → deliver (US-053)
   → Outbox worker picks up → dispatch queue → PTY stdin
8. Terminal shows Claude working (US-043 status: Working)
9. Claude's output captured by semantic worker → appears in chat (US-035)
10. Open Trace view → see waterfall: reasoning → grep → analyze → respond (US-191)
11. Score the trace: 4/5 correctness (US-195)
12. Check Dashboard → Claude BE shows in token leaderboard (US-200)
```

#### J-02: Node Alert → Investigate → Migrate Agent

```
1. Node beta-01 CPU exceeds 85% for 5 minutes (US-110)
2. Alert banner appears in Nodes page (US-110)
3. User clicks alert → navigates to node detail (US-105, US-106, US-107)
4. See: Gemini FE using 4.1GB RAM, Codex UI using 2.8GB (US-108)
5. Check gamma-02 has 0 agents, 5% CPU (US-118)
6. Open assignment modal on beta-01 → unassign Codex UI (US-103)
7. Open assignment modal on gamma-02 → assign Codex UI (US-103)
8. Verify: beta-01 CPU drops, gamma-02 picks up load (US-105)
9. Acknowledge alert (US-110)
10. Record audit event: "Migrated Codex UI from beta-01 to gamma-02 due to high CPU" (US-133)
```

#### J-03: Audit Trail → Trace Investigation → Quality Improvement

```
1. User notices high error rate in Ledger page (US-131)
2. Filter: event type = "llm.call", status = "error", member = "Claude QA" (US-131)
3. Find: 5 failed LLM calls in last hour (US-132)
4. Click event → "View Trace" (US-207, US-137)
5. Trace waterfall shows: generation failed at "analyze_test_results" step (US-191)
6. Expand generation: context window exceeded (US-193)
7. Check agent memory → "context.current_task" is 50KB (US-156)
8. Action: clear stale memory entries (US-153)
9. Resume agent (US-072)
10. Monitor: next traces succeed (US-190)
11. Score improvement: 2.1/5 → 4.3/5 over next 10 traces (US-197)
12. Update team memory: "max context for QA tasks: 20KB" (US-152, US-162)
```

#### J-04: Multi-Agent Parallel Task → Conflict Detection → Resolution

```
1. Alex opens Squad Thread "Backend Squad" (US-020)
2. Sends: "Everyone fix lint errors in your assigned modules" (US-241)
   → Claude BE dispatched: "fix lint in src/auth/"
   → Qwen API dispatched: "fix lint in src/api/"
   → Both agents start working in parallel (US-043 status: Working)
3. Claude BE edits src/shared/utils.ts (shared file)
4. Qwen API also edits src/shared/utils.ts (same file!)
5. System detects conflict (US-275)
   → Alert: "⚠️ Claude BE and Qwen API both modified src/shared/utils.ts"
6. Alex opens conflict view (US-277)
   → Side-by-side diff of both versions
   → Picks Claude BE's version (more complete)
   → Qwen API's change reverted (US-285)
7. Both agents complete their remaining lint fixes
8. Results appear in chat (US-035):
   Claude BE: "Fixed 12 lint errors in auth module"
   Qwen API: "Fixed 8 lint errors in api module (utils.ts reverted per conflict resolution)"
9. Audit trail: conflict event logged with resolution (US-132, US-140)
```

#### J-05: Workflow Pipeline — Code Review → Test → Deploy

```
1. Admin creates workflow "PR Review Pipeline" (US-260)
   → Step 1: Claude BE → "Review code changes" (sequential)
   → Step 2: Claude QA → "Run test suite" (sequential, depends on Step 1 pass)
   → Step 3: Shell Ops → "Deploy to staging" (conditional: only if tests pass)
   → On failure: halt + notify
2. Developer pushes PR → webhook triggers workflow (US-265)
3. Workflow execution starts (US-263):
   → Step 1 activates, Claude BE status → Working
   → Claude BE reviews code, outputs: "LGTM, 2 minor suggestions"
   → Step 1 completes (✅), trace created (US-270)
4. Step 2 auto-starts (US-260):
   → Claude QA runs tests → "PASS 142/142, coverage 87%"
   → Step 2 completes (✅)
5. Condition evaluates: tests passed → Step 3 starts (US-262)
   → Shell Ops: "Deployed to staging-pr-42.kraken.dev"
6. Workflow completes → notification: "PR Review Pipeline #42 completed" (US-263)
7. Alex reviews workflow history (US-268):
   → 3 steps, 4m 23s total, $1.34 cost
   → All steps linked to traces (US-270)
8. Score overall workflow: 4.5/5 (US-195)
```

#### J-06: Agent Failover → Auto-Recovery → Cost Alert

```
1. Claude BE is processing a large refactoring task (US-240)
2. Node alpha-01 runs out of memory → Claude BE crashes (US-110)
3. System detects: Claude BE status → Offline (US-043, US-104)
4. Failover configured: Claude BE backup = Qwen API (US-249)
5. System auto-routes pending dispatch to Qwen API (US-248)
   → Qwen API receives task context from team memory (US-295)
   → Qwen API continues the refactoring (US-299 handoff)
6. Alert: "Claude BE failed on node-alpha-01, failover to Qwen API" (US-225)
7. Admin checks node detail: OOM at 8/8 GB (US-106)
8. Meanwhile, Qwen API completes the task
9. Billing alert: Qwen API has hit 80% of daily spending cap (US-283)
   → Toast: "⚠️ Qwen API approaching spending limit ($18.40 / $20.00)"
10. Admin drains node-alpha-01 (US-111)
11. Admin restarts Claude BE on node-gamma-02 (US-050, US-103)
12. System resumes normal routing (US-248 failover deactivated)
13. Full incident recorded in Ledger (US-132):
    → OOM event → failover activation → task completion → node drain → recovery
```

#### J-07: Multi-Team Release Workflow → Approval Gate → Artifact Handoff

```
1. Workspace contains Backend, Frontend, QA, DevOps, and Product teams (US-310)
2. Product creates a release workflow spanning multiple teams (US-260, US-314)
   → Backend generates patch set
   → Frontend updates release notes UI
   → QA runs regression pack
   → DevOps deploys after approval gate
3. Workflow links to repository "open-kraken/web" and related PR branch (US-335, US-337)
4. Backend agent produces patch artifact and marks it PR-ready (US-338, US-339)
5. QA publishes test report artifact and marks it canonical for this release run (US-340, US-341)
6. Deploy step reaches production policy gate and pauses in `waiting_approval` (US-321, US-325)
7. Workspace Manager opens Approvals page, reviews command preview, artifact diff, and spend impact (US-322, US-350)
8. Approval granted → deploy step resumes → staging succeeds → production rollout starts (US-323)
9. Slack/Feishu incident channel receives release status notifications for subscribed teams (US-352, US-359)
10. Final release bundle contains PR link, deployment log, QA report, and trace set under one artifact group (US-337, US-340)
11. Dashboard chargeback report attributes spend across Backend, QA, and DevOps teams (US-311, US-360)
```

---

## 5. Feature Set (Functional Specification)

### 5.1 Login & Entry

```
Flow: Login Page → POST /auth/login → JWT token → Redirect to /dashboard or last route
Components: LoginPage, org/workspace picker (optional), onboarding overlay
States: Loading, Invalid credentials, Success redirect, First-time onboarding
```

**Login Page Layout**:
- Centered auth card over animated network canvas
- Member ID / password or enterprise sign-in entry
- Workspace hint and last-used workspace recovery
- First-use onboarding entry point

### 5.2 Global Shell

The application now uses a production-control shell rather than page-isolated layouts.

```
┌─ App Shell ──────────────────────────────────────────────────────────────┐
│ [Logo] Open Kraken    Workspace: ws_open_kraken    [Cmd+K] [Alerts]     │
├──────────────┬───────────────────────────────────────────────────────────┤
│ Primary Nav  │ Page Toolbar                                              │
│ Dashboard    ├───────────────────────────────────────────────────────────┤
│ Chat         │                                                           │
│ Teams        │                  Active Page Content                      │
│ Task Map     │                                                           │
│ Terminal     │                                                           │
│ Nodes        │                                                           │
│ Repos        │                                                           │
│ Approvals    │                                                           │
│ Artifacts    │                                                           │
│ Ledger       │                                                           │
│ Settings     │                                                           │
├──────────────┴───────────────────────────────────────────────────────────┤
│ Status Bar: workspace · region(s) · queue · ws latency · ws connection  │
└──────────────────────────────────────────────────────────────────────────┘
```

**Shell Rules**:
- Left nav is stable across desktop pages
- Top toolbar is page-specific
- Global filters can scope by workspace, team, repo, agent, and time range
- Right-side drawers are used for detail drilldown instead of full route changes when possible

### 5.3 Chat Workspace

Chat is now a collaboration and dispatch surface, not just messaging.

**Four-zone layout**:
- Conversation rail
- Active conversation thread
- Runtime context rail
- Bottom composer / task actions

```
┌──────────┬──────────────────────────────┬─────────────────────┐
│ Convos   │ Conversation                 │ Runtime Context     │
│          │                              │                     │
│ Squad A  │ Header: Backend Squad        │ Team: Backend Squad │
│ PM Sync  │ Tabs: Chat | Agent Comms     │ Active agents: 3    │
│ Release  │                              │ Linked knowledge    │
│ ...      │ Alex: @Claude check auth     │ Current tasks       │
│          │ Claude: terminal output      │ Quick links         │
│          │ Claude: summary + patch      │                     │
│          │                              │                     │
│          │ Composer + Attach + Dispatch │                     │
└──────────┴──────────────────────────────┴─────────────────────┘
```

**Chat Behaviors**:
- Clicking an agent avatar or display name opens its CLI console directly
- Hovering an agent avatar opens runtime card: team, node, provider, branch, task, quick actions
- Team badge in header opens Team Detail
- Squad/channel header can surface pinned knowledge and shared memory
- Composer supports send message, create task, dispatch to agents, and link artifact

### 5.4 Terminal Control Console

Terminal is now an operations console for active agent sessions.

**Three-pane layout**:
- Session list
- Active terminal
- Session metadata / task / Git context

```
┌───────────────┬──────────────────────────────────────┬──────────────────┐
│ Sessions      │ Terminal                             │ Context          │
│ Claude BE     │ xterm.js                             │ Task: auth-fix   │
│ Gemini FE     │                                      │ Plan node        │
│ Qwen API      │                                      │ Repo / branch    │
│ ...           │                                      │ Files touched    │
│               │                                      │ Trace / outputs  │
└───────────────┴──────────────────────────────────────┴──────────────────┘
```

**Terminal Behaviors**:
- Session row shows status, provider, team, node, task
- Right panel shows current intent, active plan node, branch, changed files, outputs, and quick links
- Session can be attached from Chat, Task Map, Team Detail, or Members
- Split view remains available but secondary to task-aware console context

### 5.5 Teams & Organization

The old Members page is replaced by a team-centric workspace.

**Primary tabs**:
- Portfolio
- Org View
- Team Detail
- Roster

```
┌─ Teams Workspace ────────────────────────────────────────────────────────┐
│ Portfolio: Product | PM | Backend | Frontend | QA | DevOps             │
├──────────────────────────────────────────────────────────────────────────┤
│ Org View / Execution Graph / Team Detail                                │
│                                                                          │
│ Team cards show: lead, PM, humans, agents, repos, health, spend, tasks │
│ Clicking a team opens Team Detail with tabs for Overview, Tasks,        │
│ Knowledge, Memory, Repos, Workflows, Artifacts, Metrics                 │
└──────────────────────────────────────────────────────────────────────────┘
```

**Key Behaviors**:
- Agent avatar/name opens console directly
- Org view switches between management hierarchy and execution graph
- Functional filters: Product, PM, Backend, Frontend, QA, DevOps
- Team Detail is the canonical entry for team-specific operations

### 5.6 Team Task Map

Task Map is a first-class page, not a sub-widget.

**Modes**:
- Topology
- Swimlane
- Timeline
- Critical Path

```
┌─ Team Task Map ──────────────────────────────────────────────────────────┐
│ Summary: total / running / blocked / done / failed / core / completion │
├──────────────────────────────────────────────────────────────────────────┤
│ Graph Canvas                                                            │
│ Product Req ─▶ PM Breakdown ─▶ Backend Auth Fix ─▶ QA ─▶ Release       │
│                  └────────────▶ Frontend Sync                            │
├──────────────────────────────────────────────────────────────────────────┤
│ Selected Task Panel: owner, agents, upstream/downstream, status, files, │
│ outputs, branch, trace, artifacts, blockers, Open Console               │
└──────────────────────────────────────────────────────────────────────────┘
```

**Key Behaviors**:
- Shows core tasks and critical path visually
- Each node shows upstream/downstream counts, progress, owners, agents, status
- Side panel links to console, trace, branch, artifacts
- Realtime updates on topology, criticality, and blockers

### 5.7 Nodes & Cluster Runtime

Nodes page is now both a fleet view and cluster runtime capability surface.

**Modes**:
- Fleet Table
- Topology
- Pool / Capability View

**Key Layout**:
- Fleet summary cards
- Node list or region topology canvas
- Selected node side panel with agents, workspaces, capabilities, labels, schedulability

**Key Behaviors**:
- K8s pod and bare-metal nodes share one model
- Node detail shows provider CLIs, Git version, workspace roots, repo residency
- Drain, cordon, rehydrate workspace, assign agent, and capability diagnostics live in side panel

### 5.8 Repositories & Git Workspaces

Repositories page is the Git control surface for cross-node agent work.

**Layout**:
- Repository list with team ownership, branch status, PR state, CI state
- Right-side detail for workspaces, worktrees, branch heads, cached nodes
- Task-linked branch and output drilldowns

**Key Behaviors**:
- Show which tasks and agents are working on which branch
- Show managed workspaces by node
- Open PR-ready outputs and compare branch results across agents/nodes

### 5.9 Approvals Center

Approvals page is the queue for human control points.

**Layout**:
- Pending / Approved / Rejected / Expired tabs
- Main table with actor, team, risk type, task, repo, command/diff preview
- Side panel for decision detail, evidence, and related trace/artifacts

**Key Behaviors**:
- Approve or reject with comment
- Resume blocked workflow/task
- Jump to task, trace, console, or artifact from approval row

### 5.10 Artifacts Workspace

Artifacts page aggregates outputs from agents, tasks, and workflows.

**Layout**:
- Artifact list by type: patch, report, plan, test result, export, doc
- Filters by team, task, workflow, repo, status
- Diff / preview panel

**Key Behaviors**:
- Mark canonical output
- Compare versions
- Jump to source task, branch, trace, or team

### 5.11 Dashboard & Operations Overview

Dashboard is an operations summary, not just token charts.

**Primary zones**:
- Spend and token summary
- Team health portfolio
- Queue / task throughput
- Incident and approval backlog
- Agent efficiency and work duration

**Key Behaviors**:
- Global filters by team, repo, time, provider
- Fast jumps into Ledger, Task Map, Nodes, Approvals, Teams
- Chargeback and burn-rate visibility

### 5.12 Ledger & Audit

Ledger remains the compliance and retrospection surface.

**Layout**:
- Dense filter bar
- Event table
- Expandable detail rows
- Linked navigation to trace, task, approval, incident, artifact

**Key Behaviors**:
- Cross-filter by team, node, agent, repo, workflow, event type
- Correlation chains and task lineage
- Export with context

### 5.13 Knowledge & Memory

Knowledge and Memory should no longer be implied under System only.

**Knowledge Page**:
- Global knowledge sources
- Team knowledge spaces
- Ownership / freshness / visibility controls

**Memory Surface**:
- Global / Team / Agent scoped KV runtime context
- Kept lightweight, task-oriented, and runtime-injectable

### 5.14 Settings & Configuration

Settings is split into:
- User preferences
- Workspace settings
- Team policies
- Notification routing
- API diagnostics
- Secrets / keys / integrations

### 5.15 Plugins & Extensions

Plugins page remains a marketplace and install/remove surface, but secondary to runtime control pages.

---

## 6. Core Business Workflows (Detailed Prototypes)

> This section describes the **core business flows** in full prototype-level detail. Each workflow includes: entry points, step-by-step interactions, state transitions, all modals/panels, error handling, and ASCII wireframes.

### 5.1 Team Management

#### 5.1.0 Multi-Team Organizational Design

Open Kraken assumes a real delivery organization, not a flat contact list.

Recommended workspace structure:
- `Product`: product strategy, requirement intake, release goals
- `PM`: planning, coordination, milestone tracking, acceptance
- `R&D`: backend, platform, shared services
- `Frontend`: web / app UI implementation
- `QA / Testing`: verification, regression, release readiness
- `DevOps / Release`: environments, deployment, runtime operations

Each team can have:
- human roles: lead, PM, IC, reviewer, approver
- AI agents: specialist agents aligned to team function
- repos and services it owns
- knowledge base and shared memory
- routing, approval, budget, and notification policies

Each team may also contain sub-groups or pods, for example:
- `R&D / Backend API`
- `R&D / Platform`
- `Frontend / Web`
- `QA / Automation`

The organization view must support two lenses:
- `Management hierarchy`: who belongs to which team, subteam, and owner chain
- `Execution graph`: which teams collaborate in delivery flow and which agents support them

#### 5.1.1 Concept Model

```
Workspace
 └── Team (1:N)
      ├── Human Members (owner, supervisor, member)
      └── AI Agents (assistant role, bound to a Provider)
           ├── Provider: Claude Code / Gemini CLI / Codex / etc.
           ├── Terminal Session: PTY process
           └── Skills: markdown-based capability files
```

#### 5.1.2 Create Team Flow

**Entry**: Members page → "+" button next to team tabs, or Admin Section → "Create Team"

```
┌─ Create Team Modal ─────────────────────────────┐
│                                                   │
│  Team Name *                                      │
│  ┌─────────────────────────────────────────────┐ │
│  │ Backend Squad                                │ │
│  └─────────────────────────────────────────────┘ │
│                                                   │
│  Description                                      │
│  ┌─────────────────────────────────────────────┐ │
│  │ Backend service development and deployment   │ │
│  └─────────────────────────────────────────────┘ │
│                                                   │
│  Initial Members (optional)                       │
│  ┌─────────────────────────────────────────────┐ │
│  │ 🔍 Search members...                        │ │
│  ├─────────────────────────────────────────────┤ │
│  │ ☑ Alex (owner)                            │ │
│  │ ☐ Planner (assistant)                       │ │
│  │ ☐ Runner (member)                           │ │
│  └─────────────────────────────────────────────┘ │
│                                                   │
│            [Cancel]  [Create Team]                │
└───────────────────────────────────────────────────┘
```

**States**:
- Empty name → Create button disabled
- Submit → Loading spinner on button → Success toast "Team created" → Team tab appears
- Error → Inline error below form: "Team name already exists"

**Post-create**: New team tab appears in Members page, auto-selected.

#### 5.1.3 Team Settings

**Entry**: Click gear icon on team tab, or right-click team tab → "Team Settings"

```
┌─ Team Settings: Backend Squad ──────────────────┐
│                                                   │
│  Team Name                                        │
│  ┌──────────────────────────────────────┐        │
│  │ Backend Squad                        │ [Save] │
│  └──────────────────────────────────────┘        │
│                                                   │
│  Members (3)                                      │
│  ┌──────────────────────────────────────────────┐│
│  │ 🔵 Alex      owner       [×]               ││
│  │ 🟣 Planner     assistant   [×]               ││
│  │ 🟢 Runner      member      [×]               ││
│  └──────────────────────────────────────────────┘│
│  [+ Add Member]                                   │
│                                                   │
│  ─── Danger Zone ──────────────────────────────── │
│  [Delete Team] (requires confirmation)            │
└───────────────────────────────────────────────────┘
```

#### 5.1.4 Team Detail Workspace

**Entry**: Members page → click a team name, or Chat header → click team badge

```
┌─ Team Detail: Backend Squad ─────────────────────────────────────────────┐
│                                                                           │
│  Team Type: R&D / Backend       Lead: Alex       PM: Iris                │
│  Repos: 3                       Agents: 4        Humans: 6               │
│                                                                           │
│  Tabs: [Overview ✓] [Roster] [Agents] [Knowledge] [Memory] [Repos]      │
│        [Workflows] [Artifacts] [Metrics]                                 │
│                                                                           │
│  ┌─ Delivery Chain ────────────────────────────────────────────────────┐ │
│  │ Product → PM → Backend → Frontend → QA → Release                   │ │
│  │ Current blocker: waiting on QA regression for auth module          │ │
│  └─────────────────────────────────────────────────────────────────────┘ │
│                                                                           │
│  ┌─ Team Knowledge Highlights ─────────────────────────────────────────┐ │
│  │ auth.architecture         "JWT → middleware → gateway → services"  │ │
│  │ backend.review_rules      "security, migrations, perf"             │ │
│  │ release.contracts         "all auth tests green before merge"      │ │
│  └─────────────────────────────────────────────────────────────────────┘ │
│                                                                           │
│  ┌─ Active Agents ─────────────────────────────────────────────────────┐ │
│  │ Claude BE    Online    node alpha-01   task: auth-fix              │ │
│  │ Qwen API     Working   node gamma-01   task: API review            │ │
│  └─────────────────────────────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────────────────────────────┘
```

### 5.2 Agent Lifecycle Management

#### 5.2.1 Invite AI Agent Flow

**Entry**: Members page → "Invite AI Assistant" button

This is the **core workflow** — adding an AI agent to the workspace.

```
Step 1: Select Provider
┌─ Invite AI Assistant ───────────────────────────┐
│                                                   │
│  Select AI Provider *                             │
│  ┌──────────────────────────────────────────────┐│
│  │                                              ││
│  │  ┌──────┐  ┌──────┐  ┌──────┐  ┌──────┐    ││
│  │  │  CC  │  │  GE  │  │  CX  │  │  QW  │    ││
│  │  │Claude│  │Gemini│  │Codex │  │ Qwen │    ││
│  │  │Code  │  │ CLI  │  │ CLI  │  │ Code │    ││
│  │  │  ✓   │  │      │  │      │  │      │    ││
│  │  └──────┘  └──────┘  └──────┘  └──────┘    ││
│  │                                              ││
│  │  ┌──────┐  ┌──────┐                         ││
│  │  │  OC  │  │  SH  │                         ││
│  │  │Open  │  │Shell │                         ││
│  │  │Code  │  │      │                         ││
│  │  └──────┘  └──────┘                         ││
│  └──────────────────────────────────────────────┘│
│                                                   │
│  Selected: Claude Code                            │
│  Default command: claude                          │
│  Post-ready: AI onboarding (auto)                │
│                                                   │
│            [Cancel]  [Next →]                    │
└───────────────────────────────────────────────────┘

Step 2: Configure Agent
┌─ Configure Agent ───────────────────────────────┐
│                                                   │
│  Display Name *                                   │
│  ┌─────────────────────────────────────────────┐ │
│  │ Claude Backend                               │ │
│  └─────────────────────────────────────────────┘ │
│                                                   │
│  Custom Command (optional)                        │
│  ┌─────────────────────────────────────────────┐ │
│  │ claude --dangerously-skip-permissions        │ │
│  └─────────────────────────────────────────────┘ │
│  ℹ️ Leave empty to use provider default           │
│                                                   │
│  Working Directory                                │
│  ┌─────────────────────────────────────────────┐ │
│  │ /home/user/project                           │ │
│  └─────────────────────────────────────────────┘ │
│                                                   │
│  Assign to Team                                   │
│  ┌─────────────────────────────────────────────┐ │
│  │ Backend Squad                            ▾   │ │
│  └─────────────────────────────────────────────┘ │
│                                                   │
│  ☑ Auto-start terminal session                   │
│  ☑ Enable unlimited access flag                  │
│                                                   │
│       [← Back]  [Cancel]  [Create Agent]         │
└───────────────────────────────────────────────────┘

Step 3: Agent Created (Success)
┌─ Agent Ready ───────────────────────────────────┐
│                                                   │
│  ✅ Agent "Claude Backend" created successfully   │
│                                                   │
│  Terminal session: term_claude_backend_1          │
│  Status: Connecting → Online                      │
│  Provider: Claude Code                            │
│  Team: Backend Squad                              │
│                                                   │
│  The agent is running its post-ready sequence:    │
│  ▓▓▓▓▓▓▓▓▓▓░░░░░ 65% — AI onboarding            │
│                                                   │
│       [Open Terminal]  [Close]                    │
└───────────────────────────────────────────────────┘
```

**Backend flow**:
```
POST /workspaces/{id}/members → create member (role: assistant, terminalType: claude)
  → orchestrator.InviteMember() 
    → provider.Resolve("claude") → get command + flags + postReady plan
    → terminal.CreateSessionForMember() → launch PTY
    → actor.EnableIntelligence() → status engine + semantic worker
    → postReady.Start() → execute onboarding steps
    → presence.SetStatus(online)
  → hub.Publish(presence.status) → all clients see agent appear
```

#### 5.2.2 Agent States

```
┌──────────┐    create     ┌───────────┐   shell ready   ┌────────┐
│ Not      │──────────────▶│Connecting │────────────────▶│ Online │
│ Created  │               └───────────┘                  └────┬───┘
└──────────┘                     │                             │
                                 │ timeout                     │ user input
                                 ▼                             ▼
                           ┌───────────┐               ┌───────────┐
                           │  Offline  │◀──── silence ──│  Working  │
                           └───────────┘   (4.5s)       └───────────┘
                                 ▲                             │
                                 │ close/error                 │
                                 └─────────────────────────────┘
```

#### 5.2.3 Agent Detail Panel

**Entry**: Click agent card in Members page

```
┌─ Agent Detail: Claude Backend ──────────────────────────────────┐
│                                                                   │
│  ┌─────────────┐  Claude Backend                                 │
│  │     CC      │  Role: Assistant · Status: 🟢 Online            │
│  │   (avatar)  │  Provider: Claude Code · Terminal: term_cb_1    │
│  └─────────────┘  Team: Backend Squad · Node: node-local         │
│                                                                   │
│  ── Assigned Skills ───────────────────────────────────────────── │
│  [Code Review ×] [Test Gen ×] [Doc Writer ×]  [+ Assign Skill]  │
│                                                                   │
│  ── Terminal Preview ──────────────────────────────────────────── │
│  ┌──────────────────────────────────────────────────────────────┐│
│  │ $ claude                                                      ││
│  │ > Hello! I'm Claude Code.                                     ││
│  │ > I have access to: code review, test generation              ││
│  │ █                                                             ││
│  └──────────────────────────────────────────────────────────────┘│
│  [Open Full Terminal]                                             │
│                                                                   │
│  ── Token Usage (7d) ──────────────────────────────────────────── │
│  Input: 45,231 · Output: 12,456 · Cost: $2.34                   │
│  [∿∿∿∿∿∿∿∿∿∿∿∿∿∿• spark chart]                                 │
│                                                                   │
│  ── Recent Activity ───────────────────────────────────────────── │
│  10:23  terminal.command  "ls -la src/"                          │
│  10:21  llm.call          "Generate unit tests for auth module"  │
│  10:18  tool.run          "npm test -- --coverage"               │
│                                                                   │
│  ─── Actions ──────────────────────────────────────────────────── │
│  [Restart Terminal] [Reassign Node] [Remove Agent]               │
└───────────────────────────────────────────────────────────────────┘
```

### 5.3 Agent Skill Management

#### 5.3.1 Skill Assignment Flow

**Entry**: Agent Detail → "+ Assign Skill", or Members card → Skill chips → expand

```
┌─ Assign Skills: Claude Backend ─────────────────┐
│                                                   │
│  Current Skills                                   │
│  ┌──────────────────────────────────────────────┐│
│  │ ✅ Code Review      [Remove]                 ││
│  │ ✅ Test Generator   [Remove]                 ││
│  └──────────────────────────────────────────────┘│
│                                                   │
│  Available Skills                                 │
│  🔍 Search skills...                              │
│  ┌──────────────────────────────────────────────┐│
│  │ ☐ Doc Writer        development              ││
│  │ ☐ Perf Monitor      observability            ││
│  │ ☐ Diagram Gen       design                   ││
│  │ ☐ Slack Bridge      communication            ││
│  └──────────────────────────────────────────────┘│
│                                                   │
│  ℹ️ Skills are markdown files that define agent    │
│     capabilities. Agents use skills as context    │
│     for task execution.                           │
│                                                   │
│            [Cancel]  [Save Changes]              │
└───────────────────────────────────────────────────┘
```

**Backend flow**:
```
PUT /members/{memberId}/skills → { skills: ["code-review", "test-gen"] }
  → skill.Service.BindToMember()
  → hub.Publish(presence.updated) → other clients see skill change
```

#### 5.3.2 Skill Catalog Page

```
┌─ Skill Catalog ─────────────────────────────────────────────────┐
│                                                                   │
│  [Export Snapshot]  [Import Snapshot]  [+ Create Skill]          │
│                                                                   │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐ │
│  │ 📝 Code Review  │  │ 🧪 Test Gen     │  │ 📄 Doc Writer   │ │
│  │ development     │  │ development     │  │ productivity   │ │
│  │                 │  │                 │  │                 │ │
│  │ Reviews code    │  │ Auto-generates  │  │ Creates docs   │ │
│  │ changes and     │  │ test cases from │  │ from code      │ │
│  │ suggests fixes  │  │ source code     │  │ and comments   │ │
│  │                 │  │                 │  │                 │ │
│  │ Used by: 2      │  │ Used by: 1      │  │ Used by: 0      │ │
│  │ agents          │  │ agent           │  │ agents          │ │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘ │
│                                                                   │
│  Import Preview (shown after file upload):                       │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ Member          Skills                                     │  │
│  │ claude_be_1     code-review, test-gen, doc-writer         │  │
│  │ gemini_fe_1     code-review, diagram-gen                  │  │
│  └───────────────────────────────────────────────────────────┘  │
│  [Apply Import]                                                  │
└──────────────────────────────────────────────────────────────────┘
```

### 5.4 Distributed Agent Scheduling

#### 5.4.1 Concept: Chat-to-Terminal Dispatch

The **core scheduling mechanism** routes chat messages to AI agent terminal sessions:

```
Human sends message in Chat
  │
  ▼
Message Pipeline (5 stages)
  ├─ Normalize: trim, set defaults
  ├─ Plan: resolve target members in conversation
  ├─ Policy: check DND status, mention scope
  ├─ Throttle: rate limiting per member/conversation
  └─ Deliver: persist to SQLite + publish realtime event
  │
  ▼
Outbox Worker (reliable delivery)
  ├─ Poll every 280ms for pending dispatch tasks
  ├─ Claim up to 8 tasks with 8-second lease
  └─ For each task:
       │
       ▼
  Orchestrator.DispatchChatToTerminal()
    ├─ Find member's terminal session
    ├─ Enqueue in Dispatch Queue (max 32, dedup 128)
    ├─ Wait for Online status (not while Working)
    └─ Write to PTY stdin
       │
       ▼
  Agent processes command
    ├─ PTY output captured by Semantic Worker
    ├─ Output filtered (profile: Claude/Gemini/etc.)
    ├─ Chat-ready content published as chat.delta
    └─ Terminal status transitions: Online → Working → Online
```

#### 5.4.2 Dispatch Queue Visualization

**Entry**: Terminal page → Session detail, or System page → Queue monitor

```
┌─ Dispatch Queue: Claude Backend ────────────────────────────────┐
│                                                                   │
│  Queue Depth: 3 / 32                 Inflight: 1                │
│  Dedup Window: 45 / 128             Status: ◉ Working           │
│                                                                   │
│  ── Inflight ──────────────────────────────────────────────────── │
│  │ msg_001 │ Alex → "Run the test suite"  │ dispatched 2s ago │
│                                                                   │
│  ── Queued ────────────────────────────────────────────────────── │
│  │ msg_002 │ Alex → "Also check coverage" │ waiting           │
│  │ msg_003 │ Bob    → "Review PR #42"       │ waiting           │
│  │ msg_004 │ Alex → "Deploy to staging"   │ waiting           │
│                                                                   │
│  ── Recently Completed ────────────────────────────────────────── │
│  │ msg_000 │ Alex → "Initialize project"  │ ✓ 30s ago        │
└──────────────────────────────────────────────────────────────────┘
```

#### 5.4.3 Multi-Agent Chat Dispatch

**Scenario**: Human sends message in a group conversation with 3 AI agents

```
┌─ Group: "Backend Squad" ────────────────────────────────────────┐
│                                                                   │
│  Alex (human):                                                 │
│  "Everyone, we need to fix the auth bug. @Claude check the       │
│   backend, @Gemini check the frontend, @Codex write tests."     │
│                                                                   │
│  ── Dispatch routing ──                                          │
│                                                                   │
│  @Claude  → term_claude_be_1  → "check the backend"   [queued]  │
│  @Gemini  → term_gemini_fe_1  → "check the frontend"  [queued]  │
│  @Codex   → term_codex_test_1 → "write tests"         [queued]  │
│                                                                   │
│  ── Terminal responses (async, parallel) ──                      │
│                                                                   │
│  Claude Backend (AI):                     10:23                  │
│  "I found the issue in auth middleware. The JWT validation       │
│   skips expiry check when..."                                    │
│                                                                   │
│  Gemini Frontend (AI):                    10:24                  │
│  "Frontend auth flow looks correct. The login component          │
│   properly sends credentials to /auth/login..."                  │
│                                                                   │
│  Codex Tests (AI):                        10:25                  │
│  "I've generated 12 test cases covering the auth module:         │
│   ```                                                            │
│   PASS  src/auth.test.ts (12 tests, 0 failures)                │
│   ```"                                                           │
└──────────────────────────────────────────────────────────────────┘
```

### 5.5 Distributed Node Monitoring

#### 5.5.1 Node Lifecycle

```
Register (POST /nodes)
  │
  ▼
┌────────┐  heartbeat  ┌────────┐  no heartbeat  ┌─────────┐
│ Online │◀────────────│ Online │───── >90s ────▶│ Offline │
└────────┘  (30s loop)  └────────┘                └─────────┘
                             │
                             │ partial failure
                             ▼
                        ┌──────────┐
                        │ Degraded │
                        └──────────┘
```

#### 5.5.2 Node Dashboard (Enhanced Topology View)

```
┌─ Node Monitoring ───────────────────────────────────────────────┐
│                                                                   │
│  ┌─ Summary Cards ──────────────────────────────────────────┐   │
│  │ 🟢 Online: 3   🟡 Degraded: 1   🔴 Offline: 0   Total: 4│   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                   │
│  [List] [Topology ✓] [Map]                     [Refresh] [⚙]  │
│                                                                   │
│  ┌─ Canvas Topology ───────────────────────────────────────────┐│
│  │                                                              ││
│  │          ┌─ us-east ─────────────┐                          ││
│  │          │                       │                          ││
│  │          │  (🟢 alpha-01)        │     ┌─ eu-west ─┐       ││
│  │          │       │               │     │           │       ││
│  │          │  (🟢 alpha-02)        │     │ (🟡 beta) │       ││
│  │          │                       │     └───────────┘       ││
│  │          └───────────────────────┘                          ││
│  │                    ╲                                        ││
│  │                     ╲ shared agent                          ││
│  │                      ╲                                      ││
│  │          ┌─ ap-south ────────────┐                          ││
│  │          │                       │                          ││
│  │          │  (🟢 gamma-01)        │                          ││
│  │          │       │               │                          ││
│  │          │  (🟢 gamma-02)        │                          ││
│  │          │                       │                          ││
│  │          └───────────────────────┘                          ││
│  └──────────────────────────────────────────────────────────────┘│
│                                                                   │
│  ┌─ Selected: alpha-01.kraken.local ────────────────────────┐   │
│  │ Type: K8s Pod · Region: us-east · Pool: gpu              │   │
│  │ Status: 🟢 Online · Last heartbeat: 12s ago              │   │
│  │ Agents: Claude Backend, Gemini Frontend                   │   │
│  │ Capacity: 2/4 slots                                       │   │
│  │                                                           │   │
│  │ [Assign Agent] [View Metrics] [Deregister]               │   │
│  └───────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────┘
```

#### 5.5.3 Agent-to-Node Assignment

```
┌─ Assign Agent to: alpha-01.kraken.local ────────┐
│                                                   │
│  Current Assignments (2/4 capacity)               │
│  ┌──────────────────────────────────────────────┐│
│  │ 🟢 Claude Backend     assistant   [Remove]   ││
│  │ 🟡 Gemini Frontend    assistant   [Remove]   ││
│  └──────────────────────────────────────────────┘│
│                                                   │
│  Available Agents                                 │
│  ┌──────────────────────────────────────────────┐│
│  │ ⚪ Codex Tests        unassigned  [Assign]   ││
│  │ ⚪ Qwen Docs          unassigned  [Assign]   ││
│  └──────────────────────────────────────────────┘│
│                                                   │
│  Node Constraints:                                │
│  • Pool: gpu (prefer GPU-intensive agents)       │
│  • Region: us-east (latency < 50ms)             │
│  • Remaining capacity: 2 slots                   │
│                                                   │
│                              [Done]              │
└───────────────────────────────────────────────────┘
```

### 5.6 Chat — Detailed Interaction Specifications

#### 5.6.1 Conversation Types

| Type | Icon | Description | Members |
|------|------|-------------|---------|
| **Channel** | # | Team-wide topic thread | All team members |
| **Direct Message** | 👤 | 1-on-1 conversation | 2 members |
| **Group** | 👥 | Multi-party thread | Selected members |
| **Agent Thread** | 🤖 | Human ↔ single AI agent | 1 human + 1 agent |
| **Squad Thread** | 🎯 | Human ↔ multiple agents | 1 human + N agents |

#### 5.6.2 Create Conversation Flow

```
┌─ New Conversation ──────────────────────────────┐
│                                                   │
│  Conversation Type                                │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐           │
│  │  #   │ │  👤  │ │  👥  │ │  🎯  │           │
│  │Chan- │ │Direct│ │Group │ │Squad │           │
│  │ nel  │ │  ✓   │ │      │ │      │           │
│  └──────┘ └──────┘ └──────┘ └──────┘           │
│                                                   │
│  Select Member                                    │
│  🔍 Search...                                     │
│  ┌──────────────────────────────────────────────┐│
│  │ 🟢 Alex        owner        (human)       ││
│  │ 🟢 Claude BE     assistant    (AI) ✓        ││
│  │ 🟡 Gemini FE     assistant    (AI)          ││
│  │ ⚪ Runner         member       (human)       ││
│  └──────────────────────────────────────────────┘│
│                                                   │
│  Conversation Name (optional)                     │
│  ┌─────────────────────────────────────────────┐ │
│  │ Auth Bug Investigation                       │ │
│  └─────────────────────────────────────────────┘ │
│                                                   │
│            [Cancel]  [Create]                    │
└───────────────────────────────────────────────────┘
```

#### 5.6.3 Message Types

| Type | Visual | Source |
|------|--------|--------|
| **Text** | Standard bubble | Human typed |
| **Markdown** | Rich: bold, code blocks, links | Human or AI |
| **Terminal Output** | Dark code block with ANSI colors | AI agent (auto-captured) |
| **System** | Centered gray text | System events |
| **File** | Attachment card with icon + name | Human shared |
| **Image** | Inline thumbnail (click to expand) | Human shared |

#### 5.6.4 Terminal Output in Chat

When an AI agent produces output in its terminal session, the Semantic Worker captures it and routes it to the conversation as a terminal message:

```
┌─ Chat: Backend Squad ───────────────────────────────────────────┐
│                                                                   │
│  Alex                                    10:23                 │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ @Claude check the auth middleware for the JWT bug       │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                   │
│  Claude Backend (AI) · terminal output     10:24                 │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ ┌─ terminal ──────────────────────────────────────────┐ │    │
│  │ │ $ grep -r "jwt" src/auth/                           │ │    │
│  │ │ src/auth/middleware.ts:  const decoded = jwt.verify( │ │    │
│  │ │ src/auth/middleware.ts:  // BUG: no expiry check     │ │    │
│  │ │                                                     │ │    │
│  │ │ Found the issue: line 42 in middleware.ts skips     │ │    │
│  │ │ token expiration validation.                         │ │    │
│  │ └─────────────────────────────────────────────────────┘ │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                   │
│  ── system: Claude Backend status → Working ──                   │
│                                                                   │
│  Claude Backend (AI)                       10:25                 │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ I've fixed the bug. Here's the patch:                    │    │
│  │                                                         │    │
│  │ ```typescript                                           │    │
│  │ // Before:                                              │    │
│  │ const decoded = jwt.verify(token, secret);              │    │
│  │                                                         │    │
│  │ // After:                                               │    │
│  │ const decoded = jwt.verify(token, secret, {             │    │
│  │   maxAge: '24h',                                        │    │
│  │   algorithms: ['HS256']                                 │    │
│  │ });                                                     │    │
│  │ ```                                                     │    │
│  └─────────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────────┘
```

### 5.7 Organization Structure View

#### 5.7.1 Org Chart (Members Page — Expanded View)

**Entry**: Members page → View toggle: "Grid" / "Org Chart"

```
┌─ Organization Structure ────────────────────────────────────────┐
│                                                                   │
│  [Grid View] [Org Chart ✓]                      [Invite +]     │
│                                                                   │
│                        ┌──────────┐                              │
│                        │ 🔵 Alex │                              │
│                        │  Owner    │                              │
│                        └────┬─────┘                              │
│                             │                                    │
│              ┌──────────────┼──────────────┐                    │
│              │              │              │                    │
│         ┌────┴─────┐  ┌────┴─────┐  ┌────┴─────┐              │
│         │Backend   │  │Frontend  │  │Testing   │              │
│         │Squad     │  │Squad     │  │Squad     │              │
│         └────┬─────┘  └────┬─────┘  └────┬─────┘              │
│              │              │              │                    │
│         ┌────┴─────┐  ┌────┴─────┐  ┌────┴─────┐              │
│         │🟣 Claude │  │🟣 Gemini │  │🟣 Codex  │              │
│         │Backend   │  │Frontend  │  │Tests     │              │
│         │assistant │  │assistant │  │assistant │              │
│         │🟢 online │  │🟡working│  │⚪offline │              │
│         └──────────┘  └──────────┘  └──────────┘              │
│              │                                                  │
│         ┌────┴─────┐                                           │
│         │🟢 Runner │                                           │
│         │member    │                                           │
│         │🟢 online │                                           │
│         └──────────┘                                           │
│                                                                   │
│  Legend: 🔵 Owner  🟣 Assistant  🟢 Member                      │
│          Status: 🟢 Online  🟡 Working  🔴 DND  ⚪ Offline      │
└──────────────────────────────────────────────────────────────────┘
```

### 5.8 Multi-Team Organization & Agent Roster

#### 5.8.1 Team Structure Model

一个 Workspace 下可以创建**多个团队**，每个团队按职能划分，内部包含人类成员和 AI Agent：

```
Workspace: ws_open_kraken
│
├── 🏢 Backend Squad (Team)
│   ├── 👤 Alex          (owner, human)
│   ├── 🤖 Claude BE     (assistant, Claude Code)     → node-alpha-01
│   │   └── Skills: [code-review, test-gen, debug]
│   ├── 🤖 Qwen API      (assistant, Qwen Code)       → node-alpha-02
│   │   └── Skills: [api-design, doc-writer]
│   └── 👤 DevOps-1      (member, human)
│
├── 🏢 Frontend Squad (Team)
│   ├── 👤 FE-Lead       (supervisor, human)
│   ├── 🤖 Gemini FE     (assistant, Gemini CLI)      → node-beta-01
│   │   └── Skills: [react-component, css-layout, a11y]
│   └── 🤖 Codex UI      (assistant, Codex CLI)       → node-beta-01
│       └── Skills: [ui-test, storybook, responsive]
│
├── 🏢 Testing Squad (Team)
│   ├── 🤖 Claude QA     (assistant, Claude Code)     → node-gamma-01
│   │   └── Skills: [e2e-test, integration-test, coverage]
│   └── 🤖 Codex Test    (assistant, Codex CLI)       → node-gamma-01
│       └── Skills: [unit-test, snapshot-test, perf-test]
│
├── 🏢 Product & PM (Team)
│   ├── 👤 PM-Lead       (supervisor, human)
│   └── 🤖 Claude PM     (assistant, Claude Code)     → node-delta-01
│       └── Skills: [prd-writer, user-story, roadmap-plan]
│
└── 🏢 DevOps (Team)
    ├── 👤 SRE-1         (member, human)
    └── 🤖 Shell Ops     (assistant, Shell)            → node-local
        └── Skills: [deploy, monitoring, log-analysis]
```

#### 5.8.2 Team Overview Dashboard

**Entry**: Members page → 选择某个 Team tab

```
┌─ Team: Backend Squad ───────────────────────────────────────────────────┐
│                                                                          │
│  ┌─ Team Summary ──────────────────────────────────────────────────┐   │
│  │ Members: 4  │  Agents: 2 (AI)  │  Humans: 2  │  Status: Active │   │
│  │ Skills: 5   │  Nodes: 2        │  Token/7d: $18.42             │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│  ┌─ Agent Roster ───────────────────────────────────────────────────┐  │
│  │                                                                   │  │
│  │  ┌─ Claude BE ─────────────────────────────────────────────────┐ │  │
│  │  │  🤖 Claude Code  ·  🟢 Online  ·  node-alpha-01            │ │  │
│  │  │  Skills: [code-review] [test-gen] [debug]                   │ │  │
│  │  │  Token 7d: ▁▂▃▅▇▆▄ 45,231 input · 12,456 output · $8.23  │ │  │
│  │  │  Last activity: 2m ago — "Review PR #142 auth changes"     │ │  │
│  │  │  [Open Terminal] [View Metrics] [Manage Skills]             │ │  │
│  │  └─────────────────────────────────────────────────────────────┘ │  │
│  │                                                                   │  │
│  │  ┌─ Qwen API ──────────────────────────────────────────────────┐ │  │
│  │  │  🤖 Qwen Code   ·  🟡 Working  ·  node-alpha-02            │ │  │
│  │  │  Skills: [api-design] [doc-writer]                          │ │  │
│  │  │  Token 7d: ▁▁▂▂▃▅▇ 23,100 input · 8,900 output · $4.56   │ │  │
│  │  │  Last activity: now — "Generating OpenAPI spec for /users" │ │  │
│  │  │  [Open Terminal] [View Metrics] [Manage Skills]             │ │  │
│  │  └─────────────────────────────────────────────────────────────┘ │  │
│  │                                                                   │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                                                                          │
│  ┌─ Human Members ──────────────────────────────────────────────────┐  │
│  │  👤 Alex (owner) · 🟢 Online    👤 DevOps-1 (member) · ⚪ Offline│  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                                                                          │
│  ┌─ Team Memory (Shared Context) ───────────────────────────────────┐  │
│  │  Scope: team · Entries: 12                                       │  │
│  │  ┌──────────────────────────────────────────────────────────┐   │  │
│  │  │ Key                    Value              Updated        │   │  │
│  │  │ project.stack          Go + React + SQLite 2h ago        │   │  │
│  │  │ coding.convention      camelCase, 4-space  1d ago        │   │  │
│  │  │ current.sprint.goal    Auth v2 migration   3h ago        │   │  │
│  │  └──────────────────────────────────────────────────────────┘   │  │
│  │  [Add Entry] [Export] [Clear All]                                │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                                                                          │
│  ┌─ Team Billing (7d) ──────────────────────────────────────────────┐  │
│  │  Total: $12.79                                                    │  │
│  │  ┌────────────────────────────────────────────────────────────┐  │  │
│  │  │ Claude BE   ████████████████████ $8.23  (64%)              │  │  │
│  │  │ Qwen API    ██████████           $4.56  (36%)              │  │  │
│  │  └────────────────────────────────────────────────────────────┘  │  │
│  │  [View Full Breakdown] [Export CSV]                               │  │
│  └───────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────┘
```

#### 5.8.3 Cross-Team Agent Summary

**Entry**: Members page → "All Teams" 总览 tab

```
┌─ All Teams Overview ─────────────────────────────────────────────────────┐
│                                                                           │
│  Teams: 5  │  Total Agents: 8  │  Online: 6  │  Working: 2  │  Cost: $42│
│                                                                           │
│  ┌─ By Department ─────────────────────────────────────────────────────┐ │
│  │                                                                      │ │
│  │  Team             Agents  Online  Working  Offline  Cost/7d  Nodes  │ │
│  │  ─────────────────────────────────────────────────────────────────  │ │
│  │  Backend Squad    2       1       1        0        $12.79   2     │ │
│  │  Frontend Squad   2       2       0        0        $9.34    1     │ │
│  │  Testing Squad    2       1       1        0        $8.21    1     │ │
│  │  Product & PM     1       1       0        0        $6.45    1     │ │
│  │  DevOps           1       0       0        1        $5.67    1     │ │
│  │  ─────────────────────────────────────────────────────────────────  │ │
│  │  Total            8       5       2        1        $42.46   6     │ │
│  │                                                                      │ │
│  └──────────────────────────────────────────────────────────────────────┘ │
│                                                                           │
│  ┌─ Agent Heat Map ────────────────────────────────────────────────────┐ │
│  │                                                                      │ │
│  │  Backend    [🟢 Claude BE] [🟡 Qwen API]                           │ │
│  │  Frontend   [🟢 Gemini FE] [🟢 Codex UI]                           │ │
│  │  Testing    [🟢 Claude QA] [🟡 Codex Test]                         │ │
│  │  Product    [🟢 Claude PM]                                          │ │
│  │  DevOps     [⚪ Shell Ops]                                          │ │
│  │                                                                      │ │
│  └──────────────────────────────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────────────────────────────┘
```

### 5.9 Team Task Map (LangSmith-inspired Topology)

> Design inspiration: LangSmith-style run graph and execution drilldown. For Open Kraken, the graph object is the **team task map** rather than only a single trace. This is an inference from LangSmith's public graph-oriented run inspection patterns, adapted to multi-team agent production management.

#### 5.9.1 Purpose

Team Task Map is the operational topology for one team or one delivery stream. It answers:
- how many tasks exist in the team right now
- which tasks are upstream and downstream of each other
- which tasks are core tasks on the critical path
- which humans and agents are assigned to each task
- what progress, blockers, outputs, and changed files exist per task

#### 5.9.2 Layout

**Entry**: Team Detail → `Tasks` tab, or global nav → `Task Map`

```
┌─ Team Task Map: Backend Squad ───────────────────────────────────────────┐
│                                                                           │
│  View: [Topology ✓] [Swimlane] [Timeline] [Critical Path]               │
│  Filters: [All Status ▾] [All Roles ▾] [All Agents ▾] [Core Only ☐]     │
│                                                                           │
│  ┌─ Summary Bar ───────────────────────────────────────────────────────┐ │
│  │ Total: 18  Running: 4  Blocked: 2  Done: 9  Failed: 1  Pending: 2  │ │
│  │ Core Tasks: 5  Critical Path Length: 7  Completion: 61%            │ │
│  │ Upstream Open: 6  Downstream Waiting: 4                             │ │
│  └─────────────────────────────────────────────────────────────────────┘ │
│                                                                           │
│  ┌─ Topology Canvas ────────────────────────────────────────────────────┐ │
│  │ [Product Req] ─▶ [PM Breakdown] ─▶ [Backend Auth Fix] ─▶ [QA]      │ │
│  │      done            done               running           blocked    │ │
│  │                                        ★ core                       │ │
│  │                              └───────▶ [Frontend Sync]              │ │
│  │                                            running                  │ │
│  │ [Schema Update] ────────────────────▶ [Deploy Prep] ─▶ [Release]    │ │
│  │      pending                              waiting        pending     │ │
│  └─────────────────────────────────────────────────────────────────────┘ │
│                                                                           │
│  ┌─ Selected Task: Backend Auth Fix ────────────────────────────────────┐ │
│  │ Status: 🟡 Running    Core Task: Yes    Progress: 70%               │ │
│  │ Upstream: 2          Downstream: 3     Blockers: 0                  │ │
│  │ Human Owner: Alex    Agents: Claude BE, Qwen API                    │ │
│  │ Node: alpha-01       Branch: fix/auth-expiry                        │ │
│  │ Outputs: patch_auth_fix.diff, auth_test_report.json                 │ │
│  │ Files: src/auth/middleware.ts, internal/auth/jwt_test.go            │ │
│  │ [Open Trace] [Open Console] [Open Branch] [View Artifacts]          │ │
│  └─────────────────────────────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────────────────────────────┘
```

#### 5.9.3 Task Node Design

Each task node displays:
- task title
- task class: product, PM, backend, frontend, QA, release, ops
- state color: queued, running, blocked, waiting approval, failed, done
- upstream count and downstream count
- core-task badge / critical-path badge
- assigned humans and assigned agents
- progress percent
- latest output badge: files, artifacts, PR

#### 5.9.4 Side Panel Drilldown

Selecting a node opens a detail panel with:
- task summary and task class
- planned route and executed route
- upstream dependencies and downstream dependents
- assigned humans, assigned agents, current node, current provider
- current status, blocker, SLA, approval state
- changed files and current outputs
- linked trace, artifact set, branch, PR, workflow run

#### 5.9.5 Swimlane View

Swimlane view groups tasks by organizational function:
- Product
- PM
- Backend / R&D
- Frontend
- QA / Testing
- DevOps / Release

This helps teams see delivery handoff flow from requirement to release.

#### 5.9.6 Critical Path View

Critical Path mode highlights:
- tasks with the highest downstream dependency count
- tasks currently blocking the most other tasks
- tasks on the longest completion path
- tasks with no assigned owner or agent despite being on the critical path

#### 5.9.7 Required Data per Task Node

Each task node should carry:
- `task_id`, `team_id`, `task_class`, `status`
- `upstream_count`, `downstream_count`, `criticality_score`
- `progress_percent`, `eta`, `sla_state`
- `owner_ids`, `agent_ids`, `node_ids`
- `trace_ids`, `artifact_ids`, `repo_id`, `branch`
- `latest_output_summary`, `changed_files`, `blocked_reason`

#### 5.9.8 Core Task / Criticality Scoring

The system should compute a `criticality_score` for every task node so the graph can explain why a task is considered core.

Recommended inputs:
- downstream dependency count
- whether the task sits on the longest incomplete path
- blocker impact: how many tasks are waiting on it right now
- SLA urgency: due soon or overdue
- task class weight: release / deploy / migration / incident may score higher
- approval gate presence
- artifact importance: whether the task produces a canonical output consumed by others

Example scoring model:

```
criticality_score =
  (downstream_count * 3)
  + (blocked_tasks_count * 4)
  + (critical_path_flag ? 10 : 0)
  + (sla_breach_risk * 5)
  + (task_class_weight * 2)
  + (canonical_output_flag ? 3 : 0)
```

Display rules:
- `core task`: top-scoring tasks above a configurable threshold
- `critical path`: tasks on the longest unresolved dependency path
- `high-risk blocker`: blocked or failed task with many downstream dependents

The UI must allow users to inspect the score breakdown instead of showing only a badge.

#### 5.9.9 Topology Generation Rules

Task edges should not rely on manual drawing alone. The system builds the graph from multiple sources in this order:

1. Explicit workflow edges
2. Manual task dependency links
3. Handoff edges between agents or teams
4. Artifact producer/consumer links
5. Approval-gated continuation edges
6. Git / PR linkage inference
7. Trace-derived inferred edges

Edge precedence rules:
- Explicit workflow edges always win over inferred edges.
- Manual edits can override inferred edges but should retain an audit trail.
- Inferred edges must be labeled as inferred and show the evidence source.

Supported inferred edge sources:
- Task B starts from artifact emitted by Task A
- Task B uses the same branch or PR created by Task A
- Task B references Task A in plan, handoff, or approval context
- Trace shows a handoff or delegation event from one task to another
- Team delivery lane suggests stage progression such as Product → PM → Backend → QA → Release

#### 5.9.10 Edge Types

Each edge in the topology should have a typed meaning:
- `depends_on`
- `blocked_by`
- `handoff_to`
- `produces_for`
- `validates`
- `approves`
- `deploys_after`
- `follows_stage`

Edge metadata should include:
- `edge_id`
- `source_task_id`
- `target_task_id`
- `edge_type`
- `confidence`
- `source_of_truth`: workflow, manual, inferred_trace, inferred_git, inferred_artifact
- `created_at`, `updated_at`

#### 5.9.11 Topology Freshness and Rebuild

The Team Task Map should update when any of the following changes:
- task status changes
- plan changes
- handoff occurs
- artifact is emitted or marked canonical
- approval state changes
- branch / PR linkage changes
- workflow step state changes

Rebuild modes:
- incremental realtime update for active teams
- full graph recompute on demand
- scheduled reconciliation for stale or inconsistent maps

### 5.10 Agent Monitoring Detail

#### 5.9.1 Agent Metrics Page

**Entry**: Agent card → "View Metrics" 或 Dashboard → click agent name

```
┌─ Agent Monitoring: Claude BE ────────────────────────────────────────────┐
│                                                                           │
│  ┌─ Identity ─────────────────────────────────────────────────────────┐ │
│  │  🤖 Claude BE  ·  Claude Code  ·  Team: Backend Squad             │ │
│  │  Status: 🟢 Online  ·  Node: node-alpha-01  ·  Uptime: 4h 23m   │ │
│  │  Session: term_claude_be_1  ·  PID: 12345  ·  Command: claude    │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                                                           │
│  ┌─ Token Usage (Real-time) ──────────────────────────────────────────┐ │
│  │                                                                     │ │
│  │  Total (24h): 89,432 tokens  ·  Cost: $3.21                       │ │
│  │  Input:  67,231  ·  Output: 22,201  ·  Ratio: 3:1                 │ │
│  │                                                                     │ │
│  │  ┌─ Token consumption timeline (24h) ──────────────────────────┐  │ │
│  │  │ tokens                                                       │  │ │
│  │  │ 5k ┤                         ╭─╮                             │  │ │
│  │  │ 4k ┤              ╭──╮      │  │    ╭╮                      │  │ │
│  │  │ 3k ┤         ╭───╮│  │╭─╮  │  ╰───╮││                      │  │ │
│  │  │ 2k ┤    ╭───╮│   ││  ││ │╭╮│      │╰╯                      │  │ │
│  │  │ 1k ┤╭──╮│   ╰╯   ╰╯  ╰╯ ╰╯╰╯      ╰───                   │  │ │
│  │  │  0 ┤╯                                                        │  │ │
│  │  │    └──┬───┬───┬───┬───┬───┬───┬───┬───┬───┬───┬───┬──      │  │ │
│  │  │    0h  2h  4h  6h  8h  10h 12h 14h 16h 18h 20h 22h 24h     │  │ │
│  │  └──────────────────────────────────────────────────────────────┘  │ │
│  │                                                                     │ │
│  │  ┌─ Cost breakdown ──────────────────┐                             │ │
│  │  │ Model          Calls  Cost        │                             │ │
│  │  │ claude-4-opus  23     $2.45       │                             │ │
│  │  │ claude-4-sonnet 156   $0.76       │                             │ │
│  │  └───────────────────────────────────┘                             │ │
│  └─────────────────────────────────────────────────────────────────────┘ │
│                                                                           │
│  ┌─ Skills Inventory ─────────────────────────────────────────────────┐ │
│  │  3 skills assigned                                                  │ │
│  │                                                                     │ │
│  │  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐               │ │
│  │  │ 📝 Code      │ │ 🧪 Test      │ │ 🔍 Debug     │               │ │
│  │  │ Review       │ │ Generator    │ │ Assistant    │               │ │
│  │  │              │ │              │ │              │               │ │
│  │  │ Used: 42x    │ │ Used: 18x    │ │ Used: 7x     │               │ │
│  │  │ Last: 2m ago │ │ Last: 1h ago │ │ Last: 3h ago │               │ │
│  │  └──────────────┘ └──────────────┘ └──────────────┘               │ │
│  │  [+ Assign Skill] [Manage]                                         │ │
│  └─────────────────────────────────────────────────────────────────────┘ │
│                                                                           │
│  ┌─ Agent Memory (Private Context) ───────────────────────────────────┐ │
│  │  Scope: agent · Entries: 8                                          │ │
│  │                                                                     │ │
│  │  Key                      Value                        Updated     │ │
│  │  project.context          "Go backend for Kraken"      5m ago      │ │
│  │  last.reviewed.pr         "#142 auth middleware"        2m ago      │ │
│  │  coding.preference        "prefer table-driven tests"  1d ago      │ │
│  │  known.bugs               "JWT expiry not checked"     30m ago     │ │
│  │                                                                     │ │
│  │  [Add] [Export] [Clear]                                             │ │
│  └─────────────────────────────────────────────────────────────────────┘ │
│                                                                           │
│  ┌─ Activity Timeline ────────────────────────────────────────────────┐ │
│  │  ● 10:23  terminal.command   "grep -r jwt src/auth/"               │ │
│  │  ● 10:22  llm.call           claude-4-opus · 2,341 tokens          │ │
│  │  ● 10:21  tool.run           "go test ./internal/auth/..."         │ │
│  │  ● 10:18  llm.call           claude-4-sonnet · 891 tokens          │ │
│  │  ● 10:15  terminal.command   "git diff HEAD~1"                     │ │
│  │  ● 10:12  chat.received      "Check the auth middleware" from Alex │ │
│  │  [Load More]                                                        │ │
│  └─────────────────────────────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────────────────────────────┘
```

### 5.11 Node & Pod Level Monitoring

#### 5.10.1 Node Detail Dashboard

**Entry**: Nodes page → click node in list/topology → Node Detail panel

```
┌─ Node: node-alpha-01 ────────────────────────────────────────────────────┐
│                                                                           │
│  ┌─ Node Identity ────────────────────────────────────────────────────┐ │
│  │  Hostname: alpha-01.kraken.local                                    │ │
│  │  Type: K8s Pod  ·  Region: us-east  ·  Pool: gpu                   │ │
│  │  Status: 🟢 Online  ·  Registered: 2026-04-07 08:00                │ │
│  │  Last Heartbeat: 12s ago  ·  Uptime: 9h 23m                       │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                                                           │
│  ┌─ Resource Metrics (Real-time) ─────────────────────────────────────┐ │
│  │                                                                     │ │
│  │  CPU Usage          Memory Usage        Network I/O                │ │
│  │  ┌────────────┐   ┌────────────┐       ┌────────────┐             │ │
│  │  │ ▓▓▓▓▓▓░░░░ │   │ ▓▓▓▓▓▓▓░░ │       │ ↑ 2.3 MB/s │             │ │
│  │  │   62%      │   │   78%      │       │ ↓ 0.8 MB/s │             │ │
│  │  │ 4/8 cores  │   │ 6.2/8 GB   │       │            │             │ │
│  │  └────────────┘   └────────────┘       └────────────┘             │ │
│  │                                                                     │ │
│  │  ┌─ CPU Timeline (1h) ─────────────────────────────────────────┐  │ │
│  │  │ 100%┤                                                        │  │ │
│  │  │  80%┤      ╭──╮         ╭─╮                                  │  │ │
│  │  │  60%┤──╮╭─╮│  │╭────╮╭─╯ ╰──╮╭───────                      │  │ │
│  │  │  40%┤  ╰╯ ╰╯  ╰╯    ╰╯      ╰╯                             │  │ │
│  │  │  20%┤                                                        │  │ │
│  │  │   0%└─────────────────────────────────────────────────────── │  │ │
│  │  │     -60m       -45m       -30m       -15m        now         │  │ │
│  │  └──────────────────────────────────────────────────────────────┘  │ │
│  │                                                                     │ │
│  │  ┌─ Memory Timeline (1h) ──────────────────────────────────────┐  │ │
│  │  │ 8GB ┤                      ╭────────────────────────         │  │ │
│  │  │ 6GB ┤╭─────────╮╭────────╮╯                                 │  │ │
│  │  │ 4GB ┤╯         ╰╯                                           │  │ │
│  │  │ 2GB ┤                                                        │  │ │
│  │  │  0  └─────────────────────────────────────────────────────── │  │ │
│  │  └──────────────────────────────────────────────────────────────┘  │ │
│  └─────────────────────────────────────────────────────────────────────┘ │
│                                                                           │
│  ┌─ Hosted Agents (2/4 capacity) ─────────────────────────────────────┐ │
│  │                                                                     │ │
│  │  Agent           Team            Status    Token/24h  CPU%  Mem    │ │
│  │  ──────────────────────────────────────────────────────────────── │ │
│  │  🤖 Claude BE    Backend Squad   🟢 Online  45,231    32%   1.2G  │ │
│  │  🤖 Qwen API     Backend Squad   🟡 Working 23,100    28%   0.9G  │ │
│  │  ── (2 slots available) ──                                        │ │
│  │                                                                     │ │
│  │  [+ Assign Agent]  [Rebalance]                                     │ │
│  └─────────────────────────────────────────────────────────────────────┘ │
│                                                                           │
│  ┌─ Node Labels & Metadata ───────────────────────────────────────────┐ │
│  │  region: us-east  ·  pool: gpu  ·  k8s.namespace: kraken-prod     │ │
│  │  k8s.pod: kraken-agent-alpha-01-7b9f4  ·  image: kraken:1.2.3    │ │
│  └─────────────────────────────────────────────────────────────────────┘ │
│                                                                           │
│  ── Actions ──                                                            │
│  [Drain Node] [Cordon] [View Pod Logs] [Deregister]                     │
└───────────────────────────────────────────────────────────────────────────┘
```

#### 5.10.2 Node Fleet Overview

**Entry**: Nodes page → List view (enhanced)

```
┌─ Node Fleet ─────────────────────────────────────────────────────────────┐
│                                                                           │
│  ┌─ Fleet Summary ────────────────────────────────────────────────────┐ │
│  │ Total: 6 │ Online: 5 │ Degraded: 1 │ Offline: 0                   │ │
│  │ Total Agents: 8 │ Capacity: 8/24 (33%)                            │ │
│  │ Avg CPU: 45% │ Avg Mem: 62% │ Total Cost/7d: $42.46              │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                                                           │
│  Node            Type       Region    Status   Agents  CPU   Mem  Net  │
│  ─────────────────────────────────────────────────────────────────────  │
│  alpha-01        K8s Pod    us-east   🟢 Online  2/4   62%   78%  2.3M │
│  alpha-02        K8s Pod    us-east   🟢 Online  1/4   35%   42%  0.9M │
│  beta-01         K8s Pod    eu-west   🟡 Degraded 2/4  89%   91%  4.1M │
│  gamma-01        Bare Metal ap-south  🟢 Online  2/6   28%   35%  1.2M │
│  gamma-02        Bare Metal ap-south  🟢 Online  0/6   5%    12%  0.1M │
│  delta-01        K8s Pod    us-west   🟢 Online  1/4   41%   56%  1.8M │
│  ─────────────────────────────────────────────────────────────────────  │
│                                                                           │
│  [Expand] each row shows hosted agents:                                  │
│  ▾ alpha-01                                                              │
│    ├─ 🤖 Claude BE (Backend Squad) · 🟢 Online · 32% CPU · 1.2G Mem   │
│    └─ 🤖 Qwen API  (Backend Squad) · 🟡 Working · 28% CPU · 0.9G Mem  │
│                                                                           │
│  ▸ alpha-02                                                              │
│  ▸ beta-01 ⚠️ High resource usage                                       │
│  ▸ gamma-01                                                              │
└───────────────────────────────────────────────────────────────────────────┘
```

#### 5.10.3 Node Alerts & Health Rules

```
┌─ Node Alerts ────────────────────────────────────────────────────────────┐
│                                                                           │
│  Active Alerts: 2                                                        │
│                                                                           │
│  ⚠️  beta-01 CPU > 85% for 5 minutes                           [Ack]   │
│      Region: eu-west · Agents: Gemini FE, Codex UI                      │
│      Recommendation: Migrate one agent to gamma-02 (idle)               │
│                                                                           │
│  ⚠️  beta-01 Memory > 90% for 3 minutes                        [Ack]   │
│      Current: 7.3/8 GB · Agents consuming: Gemini FE 4.1G, Codex 2.8G │
│      Recommendation: Restart Codex UI or increase node memory           │
│                                                                           │
│  ── Alert Rules ──────────────────────────────────────────────────────── │
│  ✅ CPU > 85% for 5m       → Warning                                    │
│  ✅ Memory > 90% for 3m    → Warning                                    │
│  ✅ No heartbeat > 60s     → Critical (auto-mark offline)               │
│  ✅ Agent crash detected    → Critical                                   │
│  ☐ Network latency > 200ms → Warning (disabled)                         │
│                                                                           │
│  [Configure Rules]                                                       │
└───────────────────────────────────────────────────────────────────────────┘
```

### 5.12 Memory System (Three-Layer Shared Context)

#### 5.11.1 Memory Hierarchy

```
┌─ Memory Hierarchy ──────────────────────────────────────────┐
│                                                               │
│  ┌─ Global Memory ────────────────────────────────────────┐ │
│  │  Visible to: ALL agents & ALL teams                     │ │
│  │  Examples: workspace coding conventions, project stack, │ │
│  │           deployment targets, repo conventions          │ │
│  └─────────────────────────────────────────────────────────┘ │
│          │                                                    │
│  ┌─ Team Memory (per team) ───────────────────────────────┐ │
│  │  Visible to: all members of THIS team                   │ │
│  │  Examples: team sprint goal, team conventions,           │ │
│  │           shared research notes, team decisions          │ │
│  └─────────────────────────────────────────────────────────┘ │
│          │                                                    │
│  ┌─ Agent Memory (per agent) ─────────────────────────────┐ │
│  │  Visible to: THIS agent only                            │ │
│  │  Examples: current task context, reviewed PRs,           │ │
│  │           learned preferences, personal notes            │ │
│  └─────────────────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────────────────┘
```

> **Security rule**: Secrets and API keys must live in the dedicated Secrets Vault, not in memory entries. Memory is for reusable context, not credential storage.

#### 5.11.0 Memory vs Team Knowledge Base

Open Kraken should distinguish clearly between:

- `Memory`: concise operational context, key-value oriented, short to medium lifecycle, directly injected into agent runtime
- `Knowledge Base`: team-level knowledge assets, document-oriented, curated, versioned, searchable, and citation-friendly

Examples:
- Memory: `current_task`, `team.review_checklist`, `release.target_env`
- Knowledge Base: architecture docs, product requirements, API contracts, test strategy, onboarding guides, release playbooks

Team knowledge base is the durable shared brain for departments like Product, Backend, Frontend, QA, and PM.

#### 5.11.2 Memory Browser UI

**Entry**: System page → Memory Store, or Agent Detail → Agent Memory

```
┌─ Memory Browser ─────────────────────────────────────────────────────────┐
│                                                                           │
│  Scope: [Global ✓] [Team: Backend Squad] [Agent: Claude BE]             │
│                                                                           │
│  ┌─ Global Memory (18 entries) ───────────────────────────────────────┐ │
│  │                                                                     │ │
│  │  Key                        Value                  TTL    Updated  │ │
│  │  ───────────────────────────────────────────────────────────────── │ │
│  │  workspace.stack            Go 1.25 + React 19     ∞      2h ago  │ │
│  │  workspace.style_guide      camelCase, BEM CSS     ∞      1d ago  │ │
│  │  workspace.deploy_target    k8s/kraken-prod        ∞      3d ago  │ │
│  │  workspace.ci_pipeline      GitHub Actions          ∞      5d ago  │ │
│  │  shared.api_docs_url        https://docs.kraken/v1 ∞      1w ago  │ │
│  │                                                                     │ │
│  │  [+ Add Entry]  [Export JSON]  [Import]                            │ │
│  └─────────────────────────────────────────────────────────────────────┘ │
│                                                                           │
│  ┌─ Team Memory: Backend Squad (12 entries) ──────────────────────────┐ │
│  │                                                                     │ │
│  │  Key                        Value                  TTL    Updated  │ │
│  │  ───────────────────────────────────────────────────────────────── │ │
│  │  sprint.goal                Auth v2 migration      7d     3h ago  │ │
│  │  sprint.blockers            JWT expiry bug #142    7d     2h ago  │ │
│  │  team.review_checklist      security,perf,a11y     ∞      2d ago  │ │
│  │  team.db_migration_status   pending: 3 tables      1d     6h ago  │ │
│  │                                                                     │ │
│  └─────────────────────────────────────────────────────────────────────┘ │
│                                                                           │
│  ┌─ Agent Memory: Claude BE (8 entries) ──────────────────────────────┐ │
│  │                                                                     │ │
│  │  Key                        Value                  TTL    Updated  │ │
│  │  ───────────────────────────────────────────────────────────────── │ │
│  │  context.current_task       "Fix JWT expiry check"  1h    5m ago  │ │
│  │  context.last_pr            "#142 auth middleware"   ∞     2m ago  │ │
│  │  pref.test_style            "table-driven"           ∞     1d ago  │ │
│  │  knowledge.auth_flow        "JWT → middleware → ..." ∞     30m ago │ │
│  │                                                                     │ │
│  └─────────────────────────────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────────────────────────────┘
```

#### 5.11.3 Team Knowledge Base Workspace

**Entry**: Team Detail → `Knowledge` tab, or sidebar → `Knowledge`

```
┌─ Team Knowledge: Backend Squad ──────────────────────────────────────────┐
│                                                                           │
│  Sections: [Overview ✓] [Product] [Backend] [Frontend] [QA] [PM]        │
│            [Release] [Onboarding]                                        │
│                                                                           │
│  ┌─ Pinned Docs ───────────────────────────────────────────────────────┐ │
│  │ Auth Architecture v3         owner: Alex      reviewed: 3d ago      │ │
│  │ API Error Contract           owner: Iris      reviewed: 1w ago      │ │
│  │ Regression Checklist         owner: QA Team   reviewed: yesterday   │ │
│  └─────────────────────────────────────────────────────────────────────┘ │
│                                                                           │
│  ┌─ Shared Across Teams ────────────────────────────────────────────────┐ │
│  │ Visible to: Frontend, QA, PM                                         │ │
│  │ Release Contract: "all auth tests pass before staging deployment"    │ │
│  └─────────────────────────────────────────────────────────────────────┘ │
│                                                                           │
│  ┌─ Knowledge Feed ─────────────────────────────────────────────────────┐ │
│  │ 2026-04-08  Updated: Auth Architecture v3                           │ │
│  │ 2026-04-07  Published: Backend Review Rules                         │ │
│  │ 2026-04-05  Stale Warning: Payment retry design doc                 │ │
│  └─────────────────────────────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────────────────────────────┘
```

### 5.12 Billing & Cost Tracking

#### 5.12.1 Cost Dashboard

**Entry**: Dashboard page → Token Summary section, or Members page → Team billing

```
┌─ Cost Dashboard ─────────────────────────────────────────────────────────┐
│                                                                           │
│  Period: [24h] [7d ✓] [30d] [Custom...]          [Export Report]        │
│                                                                           │
│  ┌─ Total Cost ─┐  ┌─ By Team ────────────────────────────────────────┐│
│  │               │  │                                                   ││
│  │   $42.46      │  │  Team             Agents  Tokens      Cost       ││
│  │   7-day total │  │  Backend Squad    2       158,331     $12.79     ││
│  │               │  │  Frontend Squad   2       112,450     $9.34      ││
│  │  vs last 7d:  │  │  Testing Squad    2       98,200      $8.21     ││
│  │  ↑ 12%        │  │  Product & PM     1       78,900      $6.45     ││
│  │               │  │  DevOps           1       65,100      $5.67     ││
│  └───────────────┘  │  ──────────────────────────────────────────────  ││
│                      │  Total            8       512,981     $42.46    ││
│                      └───────────────────────────────────────────────────┘│
│                                                                           │
│  ┌─ Cost Timeline ────────────────────────────────────────────────────┐ │
│  │  $                                                                  │ │
│  │  $10┤                              ╭─╮                              │ │
│  │   $8┤                    ╭───╮    │  │   ╭─╮                       │ │
│  │   $6┤         ╭───╮╭───╮│   │╭──╮│  ╰──╮│ │                       │ │
│  │   $4┤    ╭───╮│   ╰╯   ╰╯   ╰╯  ╰╯     ╰─╯                      │ │
│  │   $2┤╭──╮│                                                          │ │
│  │    0┤╯  ╰╯                                                          │ │
│  │     └─ Mon ── Tue ── Wed ── Thu ── Fri ── Sat ── Sun ──            │ │
│  │                                                                      │ │
│  │  Legend: ■ Backend  ■ Frontend  ■ Testing  ■ PM  ■ DevOps          │ │
│  └──────────────────────────────────────────────────────────────────────┘ │
│                                                                           │
│  ┌─ Top Consumers ────────────────────────────────────────────────────┐ │
│  │                                                                     │ │
│  │  #1  Claude BE   (Backend)   $8.23   ████████████████████ 19.4%   │ │
│  │  #2  Claude PM   (Product)   $6.45   ████████████████     15.2%   │ │
│  │  #3  Gemini FE   (Frontend)  $5.12   █████████████        12.1%   │ │
│  │  #4  Claude QA   (Testing)   $4.89   ████████████         11.5%   │ │
│  │  #5  Qwen API    (Backend)   $4.56   ███████████          10.7%   │ │
│  │                                                                     │ │
│  └─────────────────────────────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────────────────────────────┘
```

### 5.13 Supplementary User Stories (Consolidated into Chapter 4)

> All user stories have been consolidated into **Chapter 4** with continuous numbering (US-001 ~ US-232 + Journeys J-01 ~ J-03). The section below is retained for wireframe reference only.

#### Team & Org Structure

| ID | Story | Acceptance Criteria |
|----|-------|-------------------|
| US-200 | As an admin, I want to create multiple teams by department (Backend, Frontend, Testing, PM, DevOps) | Create Team modal with name + description + initial members, team appears as tab |
| US-201 | As a user, I want to see all teams and their agent counts in one view | "All Teams" overview tab with table: team name, agent count, online/working/offline, cost |
| US-202 | As a user, I want to see an org chart of the workspace | Tree view: Owner → Teams → Agents/Members with status dots and role colors |
| US-203 | As a user, I want to see which team each agent belongs to | Agent card shows team badge, team name in agent detail panel |
| US-204 | As an admin, I want to move an agent between teams | Drag-and-drop in org chart, or "Reassign Team" dropdown in agent detail |

#### Agent Monitoring

| ID | Story | Acceptance Criteria |
|----|-------|-------------------|
| US-210 | As a user, I want to see each agent's real-time token consumption | Agent card: mini sparkline + total tokens + cost, click for detailed timeline chart |
| US-211 | As a user, I want to see each agent's current activity | Agent card: "Last activity: X ago — summary", detail panel: full activity timeline |
| US-212 | As a user, I want to see which skills each agent has | Skill chip badges on agent card, expandable skill list with usage count |
| US-213 | As a user, I want to see which node hosts each agent | Node name + status shown on agent card, click to navigate to node detail |
| US-214 | As a user, I want to see an agent's private memory entries | Agent detail → Memory section with key-value table, scope: agent |
| US-215 | As a user, I want to restart an agent's terminal session | Agent detail → "Restart Terminal" button with confirmation dialog |

#### Node Monitoring

| ID | Story | Acceptance Criteria |
|----|-------|-------------------|
| US-220 | As a user, I want to see node CPU usage over time | Node detail: CPU timeline chart (1h), current percentage with core count |
| US-221 | As a user, I want to see node memory usage over time | Node detail: Memory timeline chart (1h), current GB / total GB |
| US-222 | As a user, I want to see node network I/O | Node detail: upload/download speed in MB/s |
| US-223 | As a user, I want to see all agents hosted on a node | Node detail: agent table with name, team, status, CPU%, memory |
| US-224 | As a user, I want node capacity indicators | Node card: "2/4 capacity", progress bar, warning at >80% |
| US-225 | As a user, I want health alerts when node resources are high | Alert banner: "CPU > 85% for 5m" with recommendation and ack button |
| US-226 | As a user, I want to drain/cordon a node | Node detail → "Drain" button: migrates agents away, "Cordon" prevents new assignments |
| US-227 | As a user, I want to see node labels and K8s metadata | Node detail → labels section: region, pool, namespace, pod name, image |

#### Memory System

| ID | Story | Acceptance Criteria |
|----|-------|-------------------|
| US-230 | As a user, I want to browse memory at three scopes: global, team, agent | Scope tabs in memory browser, each shows filtered entries |
| US-231 | As a user, I want to set TTL on memory entries | TTL field when creating entry: "∞" (permanent), "1h", "1d", "7d", or custom |
| US-232 | As a user, I want to see which agents share team memory | Team memory section shows team name + member count |
| US-233 | As a user, I want to export/import memory entries | Export JSON button per scope, Import button with preview |
| US-234 | As a user, I want to see memory entry history | Expand entry → shows created_at, updated_at, owner_id |

#### Billing & Cost

| ID | Story | Acceptance Criteria |
|----|-------|-------------------|
| US-240 | As a user, I want to see total workspace cost by period | Cost dashboard: period selector (24h/7d/30d), total with trend arrow |
| US-241 | As a user, I want to see cost breakdown by team | Table: team name, agent count, total tokens, cost, percentage bar |
| US-242 | As a user, I want to see cost timeline chart | Stacked area chart by team over selected period |
| US-243 | As a user, I want to see top consuming agents | Ranked list: agent name, team, cost, percentage bar |
| US-244 | As a user, I want per-agent cost breakdown by model | Agent detail → model table: model name, call count, cost |
| US-245 | As a user, I want to export billing reports | CSV export button with period + team + agent filters |

### 5.14 Agent Leaderboard & Rankings

#### 5.14.1 Token Usage Leaderboard

**Entry**: Dashboard page → "Leaderboard" tab, or sidebar nav shortcut

```
┌─ Agent Leaderboard — Token Usage ────────────────────────────────────────┐
│                                                                           │
│  Period: [24h] [7d ✓] [30d] [All Time]                                  │
│  Sort by: [Tokens ✓] [Cost] [Calls] [Efficiency]                       │
│                                                                           │
│  ┌─ Rankings ──────────────────────────────────────────────────────────┐ │
│  │                                                                     │ │
│  │  #   Agent           Team            Tokens     Cost    Calls  Eff │ │
│  │  ──────────────────────────────────────────────────────────────── │ │
│  │  🥇  Claude BE       Backend Squad   158,331    $8.23   234   3.2 │ │
│  │      ██████████████████████████████████████░░░░░░░░  38.2%        │ │
│  │      ▁▂▃▅▇▆▅▃▂▃▅▇▆▄▃ (7d sparkline)                             │ │
│  │                                                                     │ │
│  │  🥈  Claude PM       Product & PM    98,200     $6.45   156   2.8 │ │
│  │      █████████████████████████░░░░░░░░░░░░░░░░░░░░  23.7%        │ │
│  │      ▁▁▂▃▃▅▇▇▆▅▃▂▁▁▂ (7d sparkline)                             │ │
│  │                                                                     │ │
│  │  🥉  Gemini FE       Frontend Squad  72,450     $5.12   189   4.1 │ │
│  │      ██████████████████░░░░░░░░░░░░░░░░░░░░░░░░░░  17.5%        │ │
│  │      ▁▂▂▃▃▃▅▅▅▇▇▆▅▃▂ (7d sparkline)                             │ │
│  │                                                                     │ │
│  │  4   Claude QA       Testing Squad   65,100     $4.89   98   1.9 │ │
│  │      ████████████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░  15.7%        │ │
│  │                                                                     │ │
│  │  5   Qwen API        Backend Squad   45,200     $4.56   112   3.8 │ │
│  │      ███████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  10.9%        │ │
│  │                                                                     │ │
│  │  6   Codex UI        Frontend Squad  38,100     $3.21   87   2.4 │ │
│  │  7   Codex Test      Testing Squad   32,400     $2.89   76   2.1 │ │
│  │  8   Shell Ops       DevOps          12,800     $1.12   45   4.5 │ │
│  │                                                                     │ │
│  └─────────────────────────────────────────────────────────────────────┘ │
│                                                                           │
│  Efficiency = output tokens / input tokens (higher = more productive)   │
│  [Export CSV]  [Share Link]                                              │
└───────────────────────────────────────────────────────────────────────────┘
```

#### 5.14.2 Uptime & Work Duration Leaderboard

**Entry**: Dashboard → "Work Duration" tab

```
┌─ Agent Leaderboard — Work Duration ──────────────────────────────────────┐
│                                                                           │
│  Period: [24h] [7d ✓] [30d]                                             │
│  Sort by: [Work Time ✓] [Active Time] [Idle Ratio] [Sessions]          │
│                                                                           │
│  ┌─ Rankings ──────────────────────────────────────────────────────────┐ │
│  │                                                                     │ │
│  │  #   Agent          Team           Work     Active   Idle%  Sess  │ │
│  │  ──────────────────────────────────────────────────────────────── │ │
│  │  🥇  Claude BE      Backend Squad  38h 12m  42h 05m  9.2%  156   │ │
│  │      Working ████████████████████████████████████████ 90.8%       │ │
│  │      Idle    ████                                      9.2%       │ │
│  │      Timeline: ▓▓▓▓░▓▓▓▓▓░▓▓▓▓▓▓░░▓▓▓▓▓▓▓░▓▓▓▓░▓▓▓            │ │
│  │                Mon  Tue  Wed  Thu  Fri  Sat  Sun                  │ │
│  │                                                                     │ │
│  │  🥈  Claude QA      Testing Squad  31h 45m  36h 20m  12.6% 98   │ │
│  │      Working ████████████████████████████████████  87.4%          │ │
│  │      Timeline: ▓▓▓░░▓▓▓▓░▓▓▓▓▓░░░▓▓▓▓▓░░▓▓▓░▓▓▓               │ │
│  │                                                                     │ │
│  │  🥉  Gemini FE      Frontend Squad 28h 33m  34h 10m  16.4% 189  │ │
│  │      Working ██████████████████████████████  83.6%                │ │
│  │      Timeline: ▓▓░░▓▓▓▓░▓▓▓░░▓▓▓▓▓░░▓▓▓▓░░▓▓░░░               │ │
│  │                                                                     │ │
│  │  4   Claude PM      Product & PM   24h 18m  28h 40m  15.2% 78   │ │
│  │  5   Codex Test     Testing Squad  22h 05m  26h 15m  15.9% 76   │ │
│  │  6   Qwen API       Backend Squad  19h 42m  24h 30m  19.6% 112  │ │
│  │  7   Codex UI       Frontend Squad 16h 33m  22h 10m  25.4% 87   │ │
│  │  8   Shell Ops      DevOps         8h 12m   12h 45m  35.6% 45   │ │
│  │                                                                     │ │
│  └─────────────────────────────────────────────────────────────────────┘ │
│                                                                           │
│  Work Time = total time in "Working" state (executing commands)          │
│  Active Time = total uptime (Online + Working, excludes Offline)        │
│  Idle% = (Active - Work) / Active × 100                                 │
│  Sessions = number of distinct task dispatches received                  │
└───────────────────────────────────────────────────────────────────────────┘
```

### 5.15 Agent Tracing System (Langfuse-style)

> Reference design: [Langfuse](https://github.com/langfuse/langfuse) and its public docs on traces, sessions, graph view, and observation-centric tracing. Open Kraken implements equivalent observability natively for each agent, then extends it with multi-agent routing lineage, execution plans, and task dependency graphs.

#### 5.15.0 Observability Design Principles

- Use an **observation-first** model inspired by Langfuse: traces are built from nested observations with typed metadata.
- Separate `session`, `trace`, and `observation` clearly so users can inspect one agent across a day, one task within a session, or one step inside a task.
- Every trace must show three things at once: `what is happening now`, `what the agent planned to do`, and `what this task depends on / produces next`.
- Multi-agent systems require **lineage**, not just logs. Each trace should preserve parent task, child task, handoff target, blocker, artifact output, and workflow step linkage.
- Observability is not read-only reporting; it is an operational surface for debugging, approvals, replay, and incident response.

#### 5.15.1 Tracing Data Model

```
┌─ Agent Session ─────────────────────────────────────────────┐
│  session_id: "sess_claude_be_20260408"                       │
│  agent_id: "claude_be_1"                                     │
│  workspace: "ws_open_kraken"                                 │
│  team: "Backend Squad"                                       │
│  started_at: 2026-04-08 08:00                                │
│                                                               │
│  └─ Trace (1 per dispatched task) ──────────────────────────┐│
│     │  trace_id: "tr_a1b2c3"                                ││
│     │  task_id: "task_auth_fix_142"                         ││
│     │  input: "Fix the JWT expiry bug in auth middleware"    ││
│     │  user: "Alex" (dispatcher)                             ││
│     │  conversation: "conv_backend_squad"                    ││
│     │  workflow_run: "wf_pr_review_42"                       ││
│     │  started_at: 10:12:00  ended_at: 10:25:34             ││
│     │  status: completed  total_tokens: 12,456  cost: $0.89 ││
│     │  current_intent: "Validate JWT expiry and patch code"  ││
│     │  score: 4.2/5 (human eval)                             ││
│     │                                                        ││
│     │  ├─ Plan Route ───────────────────────────────────────┐││
│     │  │  1. inspect auth flow            completed         │││
│     │  │  2. identify failing condition   completed         │││
│     │  │  3. patch middleware             completed         │││
│     │  │  4. run auth tests               completed         │││
│     │  │  5. summarize result             completed         │││
│     │  └────────────────────────────────────────────────────┘││
│     │                                                        ││
│     │  ├─ Dependency Edges ─────────────────────────────────┐││
│     │  │  upstream: issue_142                               │││
│     │  │  upstream: wf_pr_review_42.step_backend_fix        │││
│     │  │  downstream: artifact_patch_auth_fix               │││
│     │  │  downstream: trace_qa_validation_09                │││
│     │  └────────────────────────────────────────────────────┘││
│     │                                                        ││
│     │  └─ Observations (nested steps) ──────────────────────┐││
│     │     │                                                  │││
│     │     │  ┌─ Span: "understand_task" ─────────────────┐  │││
│     │     │  │  10:12:00 → 10:12:03 (3s)                 │  │││
│     │     │  │  type: agent_reasoning                     │  │││
│     │     │  │  intent: inspect auth flow                  │  │││
│     │     │  │  output: "Need to find JWT validation code"│  │││
│     │     │  └────────────────────────────────────────────┘  │││
│     │     │                                                  │││
│     │     │  ┌─ Generation: "plan_approach" ──────────────┐  │││
│     │     │  │  10:12:03 → 10:12:08 (5s)                 │  │││
│     │     │  │  model: claude-4-opus                      │  │││
│     │     │  │  input_tokens: 2,341  output_tokens: 891  │  │││
│     │     │  │  cost: $0.23                               │  │││
│     │     │  │  ⏱ time_to_first_token: 1.2s              │  │││
│     │     │  │  plan_nodes: inspect → patch → test        │  │││
│     │     │  └────────────────────────────────────────────┘  │││
│     │     │                                                  │││
│     │     │  ┌─ Tool: "terminal.grep" ────────────────────┐  │││
│     │     │  │  10:12:08 → 10:12:10 (2s)                 │  │││
│     │     │  │  command: grep -r "jwt" src/auth/          │  │││
│     │     │  │  output: 3 matches found                   │  │││
│     │     │  │  file_scope: src/auth/*                    │  │││
│     │     │  └────────────────────────────────────────────┘  │││
│     │     │                                                  │││
│     │     │  ┌─ Generation: "analyze_code" ───────────────┐  │││
│     │     │  │  10:12:10 → 10:12:18 (8s)                 │  │││
│     │     │  │  model: claude-4-opus                      │  │││
│     │     │  │  input_tokens: 3,456  output_tokens: 1,234│  │││
│     │     │  │  cost: $0.34                               │  │││
│     │     │  │  rationale: missing strict expiry options  │  │││
│     │     │  └────────────────────────────────────────────┘  │││
│     │     │                                                  │││
│     │     │  ┌─ Tool: "terminal.edit" ────────────────────┐  │││
│     │     │  │  10:12:18 → 10:12:22 (4s)                 │  │││
│     │     │  │  file: src/auth/middleware.ts:42            │  │││
│     │     │  │  action: add expiry check                  │  │││
│     │     │  │  plan_node: patch middleware               │  │││
│     │     │  └────────────────────────────────────────────┘  │││
│     │     │                                                  │││
│     │     │  ┌─ Tool: "terminal.test" ────────────────────┐  │││
│     │     │  │  10:12:22 → 10:13:05 (43s)                │  │││
│     │     │  │  command: go test ./internal/auth/...      │  │││
│     │     │  │  result: PASS (12 tests, 0 failures)      │  │││
│     │     │  └────────────────────────────────────────────┘  │││
│     │     │                                                  │││
│     │     │  ┌─ Generation: "summarize_result" ───────────┐  │││
│     │     │  │  10:13:05 → 10:13:12 (7s)                 │  │││
│     │     │  │  model: claude-4-sonnet                    │  │││
│     │     │  │  input_tokens: 1,890  output_tokens: 644  │  │││
│     │     │  │  cost: $0.12                               │  │││
│     │     │  │  output: "Fixed JWT expiry. Added maxAge   │  │││
│     │     │  │  and algorithms params. All tests pass."   │  │││
│     │     │  └────────────────────────────────────────────┘  │││
│     │     └──────────────────────────────────────────────────┘││
│     └────────────────────────────────────────────────────────┘│
└───────────────────────────────────────────────────────────────┘
```

#### 5.15.2 Trace Timeline View (Waterfall + Live Intent)

**Entry**: Agent Detail → Activity Timeline → click a trace, or Ledger → click event → "View Trace"

```
┌─ Trace: tr_a1b2c3 — "Fix the JWT expiry bug" ───────────────────────────┐
│                                                                           │
│  Agent: Claude BE · Team: Backend Squad · Dispatcher: Alex               │
│  Started: 10:12:00 · Duration: 1m 12s · Status: ✅ Completed            │
│  Tokens: 12,456 (in: 9,577 / out: 2,879) · Cost: $0.89                 │
│  Score: ⭐ 4.2/5 (human) · 0.91 (auto-eval)                            │
│  Current / Final Intent: "Validate JWT expiry and patch middleware"     │
│  Active Plan Node: "run auth tests" → completed                         │
│                                                                           │
│  View: [Timeline ✓] [Tree] [Graph] [Narrative] [JSON] [Score ▾] [Share]│
│                                                                           │
│  ┌─ Waterfall Timeline ───────────────────────────────────────────────┐ │
│  │                                                                     │ │
│  │  0s        10s       20s       30s       40s       50s    1m 12s  │ │
│  │  │─────────│─────────│─────────│─────────│─────────│──────│      │ │
│  │                                                                     │ │
│  │  understand_task (span)                                             │ │
│  │  ██ 3s                                                              │ │
│  │                                                                     │ │
│  │  plan_approach (generation · claude-4-opus)                         │ │
│  │    ░░████ 5s (1.2s TTFT)          $0.23 · 3,232 tokens             │ │
│  │                                                                     │ │
│  │  terminal.grep (tool)                                               │ │
│  │        ██ 2s                       3 matches                        │ │
│  │                                                                     │ │
│  │  analyze_code (generation · claude-4-opus)                          │ │
│  │          ░░██████ 8s (0.8s TTFT)   $0.34 · 4,690 tokens            │ │
│  │                                                                     │ │
│  │  terminal.edit (tool)                                               │ │
│  │                  ████ 4s            middleware.ts:42                 │ │
│  │                                                                     │ │
│  │  terminal.test (tool)                                               │ │
│  │                      ████████████████████████████ 43s               │ │
│  │                      go test → PASS (12/12)                         │ │
│  │                                                                     │ │
│  │  summarize_result (generation · claude-4-sonnet)                    │ │
│  │                                                    ░░████ 7s       │ │
│  │                                                    $0.12 · 2,534t  │ │
│  │                                                                     │ │
│  │  Legend: ██ execution  ░░ time-to-first-token (LLM latency)        │ │
│  └─────────────────────────────────────────────────────────────────────┘ │
│                                                                           │
│  ┌─ Plan Route ────────────────────────────────────────────────────────┐ │
│  │  ✅ inspect auth flow → ✅ identify failing condition              │ │
│  │     → ✅ patch middleware → ✅ run auth tests → ✅ summarize      │ │
│  │  Planned: 58s · Actual: 72s · Plan drift: +14s                     │ │
│  └─────────────────────────────────────────────────────────────────────┘ │
│                                                                           │
│  ┌─ Cost Breakdown ───────┐  ┌─ Token Distribution ──────────────────┐ │
│  │                         │  │                                       │ │
│  │  plan_approach   $0.23  │  │  Input:  ████████████████████ 9,577  │ │
│  │  analyze_code    $0.34  │  │  Output: ██████              2,879  │ │
│  │  summarize       $0.12  │  │  Ratio:  3.3 : 1                    │ │
│  │  ──────────────────── │  │                                       │ │
│  │  Total           $0.69  │  │  By model:                           │ │
│  │  (tools: $0.20 est.)   │  │  claude-4-opus:    8,022 tokens      │ │
│  │                         │  │  claude-4-sonnet:  2,534 tokens      │ │
│  └─────────────────────────┘  └───────────────────────────────────────┘ │
└───────────────────────────────────────────────────────────────────────────┘
```

#### 5.15.3 Trace Tree View (Hierarchical + Rationale)

```
┌─ Trace Tree: tr_a1b2c3 ─────────────────────────────────────────────────┐
│                                                                           │
│  ▾ 🎯 Fix JWT expiry bug                    1m 12s  $0.89  12,456 tok  │
│    │                                                                     │
│    ├─ 📋 understand_task (span)              3s      —      —           │
│    │   Input: "Fix the JWT expiry bug in auth middleware"                │
│    │   Output: "Need to find JWT validation code in src/auth/"          │
│    │                                                                     │
│    ├─ 🧠 plan_approach (generation)          5s      $0.23  3,232 tok  │
│    │   Model: claude-4-opus · TTFT: 1.2s                                │
│    │   ▸ Input: [system prompt + task context] (2,341 tokens)           │
│    │   ▸ Output: "Step 1: Search for jwt references..." (891 tokens)    │
│    │   ▸ Planned route: inspect → patch → test → summarize              │
│    │                                                                     │
│    ├─ 🔧 terminal.grep (tool)                2s      —      —           │
│    │   Command: grep -r "jwt" src/auth/                                 │
│    │   Result: 3 files matched                                          │
│    │                                                                     │
│    ├─ 🧠 analyze_code (generation)           8s      $0.34  4,690 tok  │
│    │   Model: claude-4-opus · TTFT: 0.8s                                │
│    │   ▸ Input: [code context + grep results] (3,456 tokens)            │
│    │   ▸ Output: "Found bug at line 42..." (1,234 tokens)              │
│    │   ▸ Reasoning note: "expiry validation lacks strict options"        │
│    │                                                                     │
│    ├─ 🔧 terminal.edit (tool)                4s      —      —           │
│    │   File: src/auth/middleware.ts:42                                   │
│    │   Action: Added maxAge and algorithms to jwt.verify()              │
│    │                                                                     │
│    ├─ 🔧 terminal.test (tool)                43s     —      —           │
│    │   Command: go test ./internal/auth/...                             │
│    │   Result: PASS — 12 tests, 0 failures                             │
│    │                                                                     │
│    └─ 🧠 summarize_result (generation)       7s      $0.12  2,534 tok  │
│        Model: claude-4-sonnet · TTFT: 0.9s                              │
│        ▸ Output: "Fixed JWT expiry check. All 12 tests passing."        │
│                                                                           │
│  ── Scoring ──────────────────────────────────────────────────────────── │
│  Human eval:  ⭐⭐⭐⭐☆  4.2/5  "Correct fix, good test coverage"      │
│  Auto eval:   Correctness: 0.95  Completeness: 0.88  Efficiency: 0.91  │
│  [Add Score]  [Edit]                                                     │
└───────────────────────────────────────────────────────────────────────────┘
```

#### 5.15.4 Agent Session View (Grouped Traces)

**Entry**: Agent Detail → "Session History"

```
┌─ Agent Sessions: Claude BE ──────────────────────────────────────────────┐
│                                                                           │
│  ┌─ Session: sess_20260408_morning ────────────── 08:00 → 12:30 ──────┐│
│  │  Duration: 4h 30m · Traces: 12 · Tokens: 89,432 · Cost: $3.21     ││
│  │  Score avg: 4.1/5                                                   ││
│  │                                                                     ││
│  │  Trace    Time   Task                        Dur   Tokens   Cost   ││
│  │  ──────────────────────────────────────────────────────────────── ││
│  │  tr_001   08:05  "Set up project structure"  2m    3,200    $0.18  ││
│  │  tr_002   08:15  "Implement user model"      5m    8,900    $0.45  ││
│  │  tr_003   08:32  "Add auth middleware"        8m    12,100   $0.67  ││
│  │  tr_004   09:01  "Write auth tests"           4m    6,700    $0.34  ││
│  │  tr_005   09:15  "Fix JWT expiry bug"         1m    12,456   $0.89  ││
│  │  tr_006   09:25  "Code review PR #141"        3m    5,600    $0.28  ││
│  │  ...                                                                ││
│  │  tr_012   12:15  "Deploy to staging"          2m    4,200    $0.21  ││
│  │                                                                     ││
│  │  [View All Traces]  [Export Session]                                ││
│  └─────────────────────────────────────────────────────────────────────┘│
│                                                                           │
│  ┌─ Session: sess_20260407_afternoon ──────────── 13:00 → 18:00 ──────┐│
│  │  Duration: 5h · Traces: 18 · Tokens: 124,800 · Cost: $5.12        ││
│  │  Score avg: 3.9/5                                                   ││
│  │  [Expand]                                                           ││
│  └─────────────────────────────────────────────────────────────────────┘│
│                                                                           │
│  ── Session Statistics ──                                                │
│  Total sessions (7d): 14                                                 │
│  Avg traces/session: 15.2                                                │
│  Avg cost/session: $4.38                                                 │
│  Avg score: 4.0/5                                                        │
└───────────────────────────────────────────────────────────────────────────┘
```

#### 5.15.5 Agent Graph View (Upstream / Downstream / Handoff)

```
┌─ Agent Graph: tr_a1b2c3 ─────────────────────────────────────────────────┐
│                                                                           │
│  [Upstream]                   [Current Trace]                 [Downstream]│
│                                                                           │
│  Issue #142 ────────────▶  Claude BE: auth fix  ─────────▶  QA validate  │
│  bug report/task             completed trace                  child trace  │
│                                                                           │
│  PR Review Workflow ────▶  plan node: patch middleware ──▶  Patch Artif. │
│  workflow step               execution stage                  produced     │
│                                                                           │
│  Edge Types: blocked-by · depends-on · handoff · produces · validates    │
│                                                                           │
│  Handoff Detail                                                           │
│  If present: source agent, target agent, reason, payload summary, result  │
└───────────────────────────────────────────────────────────────────────────┘
```

#### 5.15.6 Observation Types (Icons & Colors)

| Type | Icon | Color | Description |
|------|------|-------|-------------|
| **Span** | 📋 | Gray | Generic duration-based operation (reasoning, planning) |
| **Generation** | 🧠 | Purple | LLM API call (includes token/cost/TTFT) |
| **Tool** | 🔧 | Blue | Terminal command, file edit, API call |
| **Retrieval** | 📚 | Orange | Memory lookup, context retrieval, RAG |
| **Evaluation** | ✅ | Green | Output quality check, test execution |
| **Guardrail** | 🛡️ | Red | Safety check, permission validation |
| **Handoff** | 🔀 | Cyan | Delegation to another agent or team |
| **Artifact** | 📦 | Amber | Output produced for downstream use |

#### 5.15.7 Narrative Replay View

```
┌─ Narrative Replay ────────────────────────────────────────────────────────┐
│  10:12:00  Claude BE received task from Alex: fix JWT expiry bug         │
│  10:12:03  Agent formed plan: inspect auth flow → patch → test           │
│  10:12:08  Searched auth codebase for JWT references                     │
│  10:12:18  Identified missing expiry validation at middleware.ts:42      │
│  10:12:22  Applied patch to middleware                                   │
│  10:13:05  Ran auth tests, all 12 passed                                 │
│  10:13:12  Published summary to chat and emitted patch artifact          │
└───────────────────────────────────────────────────────────────────────────┘
```

#### 5.15.8 Observation Schema

Every observation stores:
- `observation_id`, `trace_id`, `session_id`, `parent_observation_id`
- `type`, `name`, `status`, `started_at`, `ended_at`, `duration_ms`
- `intent`, `plan_node_id`, `rationale`, `evidence_refs`
- `input`, `output`, `metadata`, `tags`
- `repo_refs`, `file_refs`, `command`, `exit_code`
- `token_usage`, `cost`, `ttft_ms`
- `upstream_edge_ids`, `downstream_edge_ids`

#### 5.15.9 Scoring & Evaluation

```
┌─ Trace Scoring ──────────────────────────────────────────────────────────┐
│                                                                           │
│  ┌─ Human Evaluation ─────────────────────────────────────────────────┐ │
│  │                                                                     │ │
│  │  Correctness    ⭐⭐⭐⭐⭐  5/5   "Solution is correct"             │ │
│  │  Completeness   ⭐⭐⭐⭐☆  4/5   "Could add more edge cases"       │ │
│  │  Efficiency     ⭐⭐⭐☆☆  3/5   "Took 43s on tests, could batch"  │ │
│  │  Code Quality   ⭐⭐⭐⭐☆  4/5   "Clean, follows conventions"      │ │
│  │                                                                     │ │
│  │  Overall: 4.0/5                                                     │ │
│  │  Comment: "Good fix. Tests are comprehensive. Consider adding       │ │
│  │           error message for expired tokens."                        │ │
│  │                                                                     │ │
│  │  [Edit Scores]                                                      │ │
│  └─────────────────────────────────────────────────────────────────────┘ │
│                                                                           │
│  ┌─ Auto Evaluation (LLM-as-Judge) ───────────────────────────────────┐ │
│  │                                                                     │ │
│  │  Metric           Score    Method                                   │ │
│  │  correctness      0.95     GPT-4 judge                             │ │
│  │  completeness     0.88     Checklist coverage                      │ │
│  │  test_coverage    1.00     12/12 tests pass                        │ │
│  │  token_efficiency 0.76     output/input ratio vs baseline          │ │
│  │  latency_score    0.82     p50 vs target SLA                       │ │
│  │                                                                     │ │
│  │  [Configure Auto-Eval Rules]                                        │ │
│  └─────────────────────────────────────────────────────────────────────┘ │
│                                                                           │
│  ┌─ Score Trend (30d) ────────────────────────────────────────────────┐ │
│  │  5 ┤               •   •       •   •                               │ │
│  │  4 ┤ •   • • •   •   •   • •   • •   • •   •                     │ │
│  │  3 ┤   •             •               •       •                     │ │
│  │  2 ┤                                                               │ │
│  │  1 ┤                                                               │ │
│  │    └───────────────────────────────────────────────────────────    │ │
│  │    Week 1      Week 2      Week 3      Week 4                     │ │
│  │    Avg: 4.0    Avg: 4.2    Avg: 3.9    Avg: 4.1                  │ │
│  └────────────────────────────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────────────────────────────┘
```

#### 5.15.7 Tracing User Stories (See Chapter 4, Section 4.14 for consolidated list)

| ID | Story | Acceptance Criteria |
|----|-------|-------------------|
| US-300 | As a user, I want to see all traces for an agent session | Session view: list of traces with task, duration, tokens, cost, score |
| US-301 | As a user, I want a waterfall timeline of trace execution | Timeline view: proportional bars for each observation, nested, with latency |
| US-302 | As a user, I want a tree view of trace steps | Hierarchical view: collapsible nodes with type icons, input/output, metrics |
| US-303 | As a user, I want to see LLM generation details | Generation observation: model, tokens (in/out), cost, TTFT, prompt/completion |
| US-304 | As a user, I want to see tool execution details | Tool observation: command, output, duration, exit status |
| US-305 | As a user, I want to score traces manually | Star rating (1-5) for multiple dimensions + free-text comment |
| US-306 | As a user, I want automated trace evaluation | Auto-eval rules: LLM-as-judge, checklist coverage, test pass rate |
| US-307 | As a user, I want to see score trends over time | Line chart: average score per week/day, trend arrow |
| US-308 | As a user, I want to compare agent efficiency | Leaderboard: token efficiency ratio, cost/trace, avg score side-by-side |
| US-309 | As a user, I want to export trace data | JSON export per trace or per session, with all observations and scores |
| US-310 | As a user, I want to see which agent used the most tokens | Token leaderboard: ranked by total tokens, with sparkline and cost |
| US-311 | As a user, I want to see which agent worked the longest | Duration leaderboard: ranked by total Working time, with idle ratio |
| US-312 | As a user, I want to search traces by keyword | Search input: filters traces by task summary, command, output content |
| US-313 | As a user, I want to filter traces by status | Status filter: completed, failed, in-progress, timeout |
| US-314 | As a user, I want to see generation latency (time-to-first-token) | TTFT shown as shaded area before the solid execution bar in waterfall |

---

## 7. Component Library

### 6.1 UI Primitives

| Component | Props | Usage |
|-----------|-------|-------|
| `Skeleton` | width, height, radius | Shimmer loading placeholder |
| `SkeletonBlock` | lines, gap | Multi-line text placeholder |
| `SkeletonCard` | — | Card-shaped placeholder |
| `SkeletonTable` | rows, cols | Table placeholder |
| `SkeletonPage` | — | Full page loading state |
| `EmptyState` | icon, title, description, actionLabel, onAction | Empty data placeholder |
| `ConfirmDialog` | title, description, tone, onConfirm, onCancel | Destructive action confirmation |
| `LoadingButton` | loading, tone, children | Button with spinner |
| `SparkChart` | data[], width, height, color | Inline SVG sparkline |
| `CommandPalette` | items[], open, onClose | Cmd+K search panel |
| `OnboardingOverlay` | — | First-time user guide |

### 5.2 Feature Components

| Component | Location | Purpose |
|-----------|----------|---------|
| `FriendsPanel` | Chat right sidebar | Member presence list |
| `NotificationBadge` | Shell header | Unread count indicator |
| `NotificationPanel` | Dropdown | Recent unread conversations |
| `PluginMarketplace` | Plugins page | Browse/install/remove |
| `InviteAssistantModal` | Members page | Add AI provider agent |
| `InviteFriendModal` | Members page | Add human member |
| `ManageMemberModal` | Members page | Edit/remove member |
| `ContextMenuHost` | Global | Right-click menus |
| `XtermRenderer` | Terminal page | ANSI terminal output |
| `MessageMarkdown` | Chat page | Rich text rendering |
| `TypingIndicator` | Chat page | "xxx is typing..." |
| `NodeTopology` | Nodes page | Canvas network graph |

### 5.3 Interactive States (All Components)

| State | Visual Treatment |
|-------|-----------------|
| **Default** | Normal appearance |
| **Hover** | Subtle background shift, border color change |
| **Active/Selected** | Accent border/background, bold text |
| **Loading** | Skeleton shimmer or spinner icon |
| **Empty** | EmptyState component with icon + CTA |
| **Error** | Red alert banner with message |
| **Disabled** | 60% opacity, cursor: not-allowed |
| **Focused** | 2px accent ring (accessibility) |

---

## 8. Interaction Flows

### 6.1 Send Message Flow

```
User types in composer
  → (if @detected) Show mention dropdown
    → Arrow keys to select → Enter to insert
  → Click Send (or Cmd+Enter)
  → Optimistic: message appears with "Sending..." status
  → POST /workspaces/{id}/conversations/{convId}/messages
  → Success: status → "Sent" ✓
  → Failure: status → "Failed" ✗ with retry button
  → Backend publishes chat.delta event via WebSocket
  → Other clients receive and display the message
```

### 6.2 Terminal Attach Flow

```
User clicks session in sidebar
  → Terminal panel shows "Connecting..."
  → POST /terminal/sessions/{id}/attach
  → Backend returns snapshot (full buffer)
  → xterm.js renders snapshot
  → WebSocket: terminal.delta events stream output
  → User types → keystrokes sent via API
  → Backend writes to PTY → output → delta event → xterm renders
```

### 6.3 Node Assignment Flow

```
User double-clicks node in topology (or clicks Assign in list)
  → NodeAgentAssign modal opens (Portal to body)
  → Shows current assignments + available members
  → Click "Assign" on a member
    → POST /nodes/{id}/agents
    → Button shows spinner (pending)
    → Success: member appears in assigned list
  → Click "Unassign"
    → DELETE /nodes/{id}/agents/{memberId}
    → Member moves back to available list
  → Click "Done" → modal closes
```

### 6.4 Plugin Install Flow

```
User clicks "Install" on a plugin card
  → POST /plugins/{id}/install
  → Card updates: "Install" → "Remove"
  → Toast: "Plugin installed"
  → "My Plugins" tab count increments
```

---

## 9. API Endpoints

### 7.1 Authentication
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/auth/login` | Login with credentials |
| GET | `/api/v1/auth/me` | Current user info |

### 7.2 Workspace
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/workspaces/{id}/chat/home` | Workspace summary |
| GET | `/api/v1/workspaces/{id}/portfolio` | Multi-team workspace portfolio |
| GET | `/api/v1/workspaces/{id}/conversations` | List conversations |
| POST | `/api/v1/workspaces/{id}/conversations` | Create conversation |
| GET | `/api/v1/workspaces/{id}/conversations/{convId}/messages` | List messages |
| POST | `/api/v1/workspaces/{id}/conversations/{convId}/messages` | Send message |
| GET | `/api/v1/workspaces/{id}/teams` | List teams |
| POST | `/api/v1/workspaces/{id}/teams` | Create team |
| PUT | `/api/v1/workspaces/{id}/teams/{teamId}` | Update team |
| GET | `/api/v1/workspaces/{id}/teams/{teamId}/policy` | Get team routing / approval policy |
| PUT | `/api/v1/workspaces/{id}/teams/{teamId}/policy` | Update team routing / approval policy |
| GET | `/api/v1/workspaces/{id}/members` | List members |
| POST | `/api/v1/workspaces/{id}/members` | Create member |
| PUT | `/api/v1/workspaces/{id}/members/{id}` | Update member |
| DELETE | `/api/v1/workspaces/{id}/members/{id}` | Delete member |
| GET | `/api/v1/workspaces/{id}/roadmap` | Get roadmap |
| PUT | `/api/v1/workspaces/{id}/roadmap` | Update roadmap |
| GET | `/api/v1/workspaces/{id}/repos` | List bound repositories |
| POST | `/api/v1/workspaces/{id}/repos` | Connect repository |
| GET | `/api/v1/workspaces/{id}/artifacts` | List artifacts |
| GET | `/api/v1/workspaces/{id}/approvals` | List approval requests |
| GET | `/api/v1/workspaces/{id}/budgets` | List workspace and team budgets |
| GET | `/api/v1/workspaces/{id}/tasks` | Global task registry |
| GET | `/api/v1/workspaces/{id}/nodes/capabilities` | Cluster runtime capability view |
| GET | `/api/v1/workspaces/{id}/teams/{teamId}/task-map` | Team task topology graph |
| GET | `/api/v1/workspaces/{id}/teams/{teamId}/task-map/critical-path` | Team critical path view |
| POST | `/api/v1/workspaces/{id}/teams/{teamId}/task-map/rebuild` | Recompute team task topology |

### 7.3 Messages (Pipeline)
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/messages` | Send via pipeline |
| GET | `/api/v1/messages` | Query messages |
| GET | `/api/v1/messages/{id}` | Get single message |
| PUT | `/api/v1/messages/{id}/status` | Update status |
| POST | `/api/v1/messages/read` | Mark read |

### 7.4 Terminal
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/terminal/sessions` | List sessions |
| POST | `/api/v1/terminal/sessions/{id}/attach` | Attach |
| POST | `/api/v1/terminal/sessions/{id}/input` | Send input |
| DELETE | `/api/v1/terminal/sessions/{id}` | Close session |
| POST | `/api/v1/terminal/sessions/{id}/checkpoint` | Create resumable checkpoint |

### 7.5 Nodes
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/nodes` | List nodes |
| POST | `/api/v1/nodes` | Register node |
| POST | `/api/v1/nodes/{id}/heartbeat` | Heartbeat |
| POST | `/api/v1/nodes/{id}/agents` | Assign agent |
| DELETE | `/api/v1/nodes/{id}/agents/{agentId}` | Unassign |
| POST | `/api/v1/nodes/{id}/join` | Join cluster with capability probe |
| PUT | `/api/v1/nodes/{id}/schedulability` | Update schedulable / unschedulable state |
| GET | `/api/v1/nodes/{id}/workspaces` | List repo workspaces on node |

### 7.6 Other Services
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/skills` | Skill catalog |
| PUT | `/api/v1/members/{id}/skills` | Update member skills |
| POST | `/api/v1/tokens/events` | Report token event |
| GET | `/api/v1/tokens/stats` | Token statistics |
| GET/POST | `/api/v1/ledger/events` | Audit events |
| GET/PUT/DELETE | `/api/v1/memory/{scope}/{key}` | Memory store |
| GET | `/api/v1/providers` | AI providers |
| GET/PUT | `/api/v1/settings` | User settings |
| GET | `/api/v1/plugins` | Plugin catalog |
| POST | `/api/v1/plugins/{id}/install` | Install plugin |
| DELETE | `/api/v1/plugins/{id}` | Remove plugin |
| GET/POST | `/api/v1/approvals` | Create / query approval requests |
| POST | `/api/v1/approvals/{id}/approve` | Approve request |
| POST | `/api/v1/approvals/{id}/reject` | Reject request |
| GET/POST | `/api/v1/secrets` | List / create secrets |
| POST | `/api/v1/secrets/{id}/rotate` | Rotate secret |
| POST | `/api/v1/secrets/{id}/revoke` | Revoke secret |
| GET | `/api/v1/secrets/{id}/access-log` | Secret usage audit |
| GET/POST | `/api/v1/repos` | List / connect repositories |
| GET | `/api/v1/repos/{id}/pull-requests` | Repository PR context |
| GET | `/api/v1/repos/{id}/workspaces` | Query managed Git workspaces |
| POST | `/api/v1/repos/{id}/workspaces` | Provision Git workspace or worktree |
| POST | `/api/v1/repos/{id}/sync` | Fetch / reconcile remote state |
| GET | `/api/v1/artifacts` | Query artifacts |
| POST | `/api/v1/artifacts` | Create artifact record |
| GET | `/api/v1/tasks` | Query tasks |
| POST | `/api/v1/tasks` | Create task |
| GET | `/api/v1/tasks/{id}` | Get task detail |
| POST | `/api/v1/tasks/{id}/plan` | Save or revise task plan |
| POST | `/api/v1/tasks/{id}/handoff` | Handoff task to agent / node / team |
| POST | `/api/v1/tasks/{id}/resume` | Resume from checkpoint or failover state |
| GET | `/api/v1/tasks/{id}/topology` | Get single task upstream/downstream topology |
| GET | `/api/v1/tasks/{id}/outputs` | Get current outputs and changed files |
| GET | `/api/v1/tasks/{id}/criticality` | Get criticality score and breakdown |
| GET | `/api/v1/traces` | Query traces across workspace/team/agent/task |
| GET | `/api/v1/traces/{id}` | Get trace detail |
| GET | `/api/v1/traces/{id}/observations` | Get nested observations |
| GET | `/api/v1/traces/{id}/graph` | Get upstream/downstream dependency graph |
| GET | `/api/v1/traces/{id}/narrative` | Get narrative replay |
| GET | `/api/v1/sessions/{id}/traces` | Get traces for an agent session |
| GET | `/api/v1/knowledge/sources` | List knowledge sources |
| POST | `/api/v1/knowledge/sources` | Add knowledge source |
| POST | `/api/v1/knowledge/sources/{id}/reindex` | Reindex knowledge source |
| GET/PUT | `/api/v1/budgets/{scope}` | Get / update budget rule |
| GET/POST | `/api/v1/incidents` | Query / create incidents |
| POST | `/api/v1/incidents/{id}/ack` | Acknowledge incident |
| POST | `/api/v1/incidents/{id}/resolve` | Resolve incident |
| PUT | `/api/v1/presence/status` | Set presence |
| POST | `/api/v1/presence/heartbeat` | Heartbeat |
| GET | `/api/v1/presence/online` | Online members |

### 7.7 WebSocket Events
| Event | Direction | Description |
|-------|-----------|-------------|
| `chat.snapshot` | Server → Client | Full conversation state |
| `chat.delta` | Server → Client | New message |
| `chat.status` | Server → Client | Message status change |
| `presence.status` | Server → Client | Member online/offline |
| `terminal.attach` | Server → Client | Session attached |
| `terminal.snapshot` | Server → Client | Full terminal buffer |
| `terminal.delta` | Server → Client | Incremental output |
| `terminal.status` | Server → Client | Session status change |
| `node.updated` | Server → Client | Node state change |
| `node.offline` | Server → Client | Node went offline |
| `token.stats_updated` | Server → Client | Token metrics changed |
| `approval.created` | Server → Client | Approval request created |
| `approval.updated` | Server → Client | Approval approved, rejected, or expired |
| `artifact.created` | Server → Client | Artifact recorded or updated |
| `trace.updated` | Server → Client | Trace status, cost, or plan route changed |
| `trace.intent` | Server → Client | Agent current intent / active plan node changed |
| `trace.observation` | Server → Client | New observation appended to a trace |
| `trace.handoff` | Server → Client | Work handed off to another agent or team |
| `task.updated` | Server → Client | Task state, blocker, or assignment changed |
| `task.plan_updated` | Server → Client | Task plan created or revised |
| `task.topology_updated` | Server → Client | Team task graph changed due to dependency, state, or assignment updates |
| `task.criticality_updated` | Server → Client | Task criticality/core-task score changed |
| `git.workspace_updated` | Server → Client | Git workspace hydrated, drifted, checkpointed, or migrated |
| `node.schedulability` | Server → Client | Node capability or schedulability changed |
| `incident.updated` | Server → Client | Incident ack/resolution/escalation changed |
| `budget.threshold` | Server → Client | Budget threshold crossed |
| `repo.updated` | Server → Client | Repository or PR context changed |
| `knowledge.updated` | Server → Client | Knowledge source indexed or stale |
| `team.updated` | Server → Client | Team policy, membership, or health changed |
| `roadmap.updated` | Server → Client | Roadmap document changed |

---

## 10. Design Tokens

### 8.1 Colors

| Token | Light | Dark | Usage |
|-------|-------|------|-------|
| `--app-accent` | hsl(170 60% 38%) | #3ecfae | Primary action, links, active states |
| `--app-text-strong` | hsl(222 47% 11%) | #f1f5f9 | Headings, labels |
| `--app-text-muted` | hsl(218 15% 46%) | #a8b5c4 | Secondary text |
| `--app-text-faint` | hsl(216 12% 61%) | #7b8a9c | Metadata, placeholders |
| `--app-bg-canvas` | hsl(220 16% 96%) | #0a0f18 | Page background |
| `--app-bg-elevated` | hsl(220 20% 98%) | #121a2a | Card backgrounds |
| `--app-surface-strong` | #ffffff | #151e30 | Modal/panel surfaces |
| `--app-border-subtle` | hsl(220 13% 91%) | rgba(186,198,214,0.12) | Light borders |
| `--app-health-ok` | #22c55e | #22c55e | Online, success |
| `--app-health-warn` | #eab308 | #eab308 | Degraded, warning |
| `--app-health-bad` | #ef4444 | #ef4444 | Offline, error |

### 8.2 Spacing

| Token | Value |
|-------|-------|
| `--app-space-1` | 0.25rem (4px) |
| `--app-space-2` | 0.5rem (8px) |
| `--app-space-3` | 0.75rem (12px) |
| `--app-space-4` | 1rem (16px) |
| `--app-space-5` | 1.25rem (20px) |
| `--app-space-6` | 1.5rem (24px) |
| `--app-space-8` | 2rem (32px) |
| `--app-space-10` | 2.5rem (40px) |

### 8.3 Typography

| Usage | Font | Size | Weight |
|-------|------|------|--------|
| Body | Inter | 13px | 400 |
| Label | Inter | 12px | 500 |
| Heading | Inter | 15px | 700 |
| Code | JetBrains Mono | 12px | 400 |
| Eyebrow | Inter | 10px | 700 |
| Metadata | Inter | 10.5px | 400 |

### 8.4 Radius

| Token | Value | Usage |
|-------|-------|-------|
| `--app-radius-panel` | 10px | Large containers |
| `--app-radius-card` | 8px | Cards, messages |
| `--app-radius-control` | 6px | Buttons, inputs |
| `--app-radius-pill` | 999px | Badges, tags |

### 8.5 Motion

| Token | Value | Usage |
|-------|-------|-------|
| `--app-motion-fast` | 120ms ease | Button hover, focus |
| `--app-motion-medium` | 180ms expo | Panel open/close |
| `--app-transition-slow` | 300ms expo | Page transition, modal |

---

## 11. Responsive Breakpoints

| Breakpoint | Behavior |
|------------|----------|
| > 1024px | Full 3-column layouts, all sidebars visible |
| 768px – 1024px | 2-column layouts, friends panel hidden in chat |
| 640px – 768px | Single column, session sidebar becomes horizontal tabs |
| < 640px | Mobile: sidebar off-screen (hamburger menu), modals full-width |

---

## 12. Accessibility Requirements

| Requirement | Implementation |
|-------------|---------------|
| Keyboard navigation | Tab through all interactive elements, Enter to activate |
| Screen reader | aria-label on all buttons/links, aria-live for dynamic updates |
| Focus management | Focus moves to main content on route change |
| Color contrast | WCAG AA minimum (4.5:1 text, 3:1 UI components) |
| Reduced motion | `prefers-reduced-motion` disables all animations |
| Skip to content | Skip link for keyboard users (to be added) |

---

*End of Product Specification*
