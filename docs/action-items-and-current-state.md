# Action items and current state

This file tracks **what the open-kraken codebase does today** versus **documented product intent**, and lists **follow-up work** so contributors can prioritize. It is not a release checklist; update it when scope or reality changes.

**Last updated:** 2026-04-06 — extended **§ P2** with explicit **frontend product polish** backlog (Teams IA, skills policy, task map, agent lifecycle, shell vs demo routes).

**Companion:** high-level framing is in **`docs/product-vision-and-architecture.md` (§1a Baseline operating goal)**.

---

## Baseline target (agent teams)

**Goal:** Agent teams using this framework must support **(1) cross-node scheduling**, **(2) end-to-end operation on the order of seven continuous days** within agreed resilience bounds, and **(3) high-quality product output** via explicit quality gates—not by runtime length alone.

### What “success” means (refine per release)

| Pillar | Engineering meaning |
|--------|------------------------|
| **Cross-node scheduling** | Move from **registry + simplified assignment** to a **task/queue model**: dispatch to **≥2 online nodes**, **retries**, **timeouts**, **cancellation**, **idempotency**, and **no silent loss** when a node fails. |
| **~7-day continuous operation** | **Control plane + workers** meet defined **availability / RTO / RPO**; **resource growth** (disk, memory, connections) is bounded; **soak** and **failure** scenarios are tested. “168h zero restart” is **not** assumed unless explicitly required—prefer **short failures + recovery**. |
| **High-quality product** | **Separate acceptance** from uptime: milestones, **automated tests**, **reviews**, **memory/ledger discipline** to limit context drift; framework **supports** but does **not guarantee** quality. |

### Suggested acceptance examples (set real numbers per deployment)

| Dimension | Example criteria (customize) |
|-----------|------------------------------|
| Scheduling | Tasks run on **≥2** nodes; failed node → tasks **re-queued or migrated** per policy. |
| Availability | e.g. **99.5%** API availability over 7 days **or** ≤**N** unplanned incidents; document **RTO** (time to restore service) and **RPO** (max acceptable data loss window). |
| Quality | Release gates: CI green, required reviews, E2E/smoke as defined; product milestones frozen—not “longest runtime wins.” |

---

## Current state (summary)

### Architecture model

- **Control plane topology:** **Hub-and-spoke** — execution nodes **do not** form a P2P mesh. Each node registers and heartbeats against the **same** open-kraken HTTP API (`POST /api/v1/nodes/register`, `POST /api/v1/nodes/{id}/heartbeat`). Mutual visibility is **via the backend** (`GET /api/v1/nodes`, WebSocket `node.*` events), not node-to-node discovery.
- **Backend:** Go monolith; optional JWT middleware; dev bearer tokens for development login.
- **Persistence:** Embedded **SQLite** (tokens, memory, ledger) plus **JSON/file** stores (nodes, skills bindings, project data). Application root: `OPEN_KRAKEN_APP_DATA_ROOT`.
- **Frontend:** React SPA as **observability and operations plane** — `AppShell`, routes for Dashboard, Ledger, Nodes, Members, Roadmap, Terminal, Chat, System, Settings.

### What is implemented and usable

| Area | Status (short) |
|------|----------------|
| Auth / `authz` | Login, `/auth/me`, role-based enforcement on protected routes; server-authoritative. |
| Node registry | Register, list, get, delete, heartbeat, background offline sweep (~90s), WS events (`node.snapshot`, `node.updated`, `node.offline`). |
| Agent assignment on node | `POST/DELETE …/nodes/{id}/agents` — **simplified** (agent id stored via node `labels`); **not** a production-grade multi-node scheduler. |
| Skills | Catalog from skill root; member skill bindings via API; UI (`MemberSkillPanel`, etc.). |
| Token tracking | Events, stats, activity APIs; dashboard-oriented UI. |
| Memory | Keyed entries, scopes, TTL (SQLite); **not** semantic / vector retrieval. |
| Ledger | Append/query events for audit-style trails; UI exists. |
| Terminal / Realtime | Sessions, WebSocket streams, hub events. |
| Project data / roadmap | Workspace routes and persistence per contracts. |

### Known limitations vs baseline target

- **No full task queue / scheduler** — cannot yet claim cross-node scheduling at the level of § Baseline target.
- **Single-process control plane + local SQLite/files** — **not** HA by default; **7-day production SLO** needs design (replicas, shared state, backups).
- **Quality** — not a platform-only property; requires **process + gates** alongside open-kraken features.

---

## Action items (backlog)

Priorities are **suggested**. Reorder per roadmap.

### P0 — Baseline foundations (scheduling clarity + ops truth)

- [ ] **Task and queue model** — task identity, state machine, priority, dependencies (if any), **idempotency keys**, timeout, cancel, retry policy; worker **claim/ack/nack** contract aligned with ledger/token/terminal where applicable.
- [ ] **Node-aware dispatch** — assign work only to **online** nodes matching labels/capacity; **re-queue** on heartbeat loss or explicit failure (no silent drop).
- [ ] **Document deployment + RTO/RPO** — in `docs/runtime/`: single vs replicated backend, where state lives, backup/restore, **expected RPO** for SQLite/files (or path to external DB).
- [ ] **Clarify node↔agent assignment** — replace or formalize `labels`-based storage for production; align API docs and `docs/backend/node-registry-contract.md`.
- [ ] **Observability minimum** — metrics/logs for API errors, **queue depth**, task age, node count, heartbeat failures, disk usage; alerts for threshold breaches.
- [ ] **Keep vision + this file in sync** when major milestones land.

### P1 — Resilience and 7-day-class operation

- [ ] **Control plane HA (if required by SLO)** — multiple replicas + **shared durable state** (SQLite/file **multi-writer** is problematic; plan migration to external DB or strictly partitioned roles); WebSocket/session strategy (sticky vs shared pub/sub).
- [ ] **Resource governance** — log rotation, disk quotas, connection limits, **backpressure** on task ingestion; memory leak checks on long runs.
- [ ] **Backup and drill** — automated backup schedule; **restore drill** documented; RPO validated.
- [ ] **Soak testing** — progressive runs (24h → 72h → 7d) under load; track memory, fds, DB size, error rate.
- [ ] **Chaos / failure drills** — kill node, restart control plane, network partition scenarios; assert **no unbounded task loss** per policy.

### P2 — Product model, observability depth, and frontend polish (vision alignment)

These items are **acknowledged product gaps**: the shell is usable, but **IA, depth, and polish** remain incomplete versus the observability-plane vision.

- [ ] **Team model (first-class)** — decide and implement first-class `Team` (or equivalent) vs workspace + **Members** only; APIs, navigation labels, and copy must match the chosen model (**today:** sidebar “Team” = Members route; **no** dedicated Teams entity page).
- [ ] **Skills beyond `/skills` snapshots** — define **catalog merge / replace / validation** policy and UX; snapshot JSON is a floor, not the full import story; align with `docs/backend/skill-token-contract.md` and backend behavior.
- [ ] **Task map depth** — Roadmap + project data exist; add a **multi-team or program-level** task map view **or** document an explicit non-goal with rationale.
- [ ] **Unified agent lifecycle / status** — compose Dashboard, Terminal, token, and realtime signals into **one coherent agent status surface** (new route or hub); avoid scattering “deep status” across four pages only.
- [ ] **Shell vs secondary entrypoints** — `CollaborationOverviewPage` and similar routes: **promote into `AppShell` nav**, merge into an existing route, or **retire**; remove permanent “demo-only” ambiguity.
- [ ] **General observability drill-down** — node health summaries, ledger/memory deep links, and other gaps as contracts mature.
- [ ] **Langfuse / LLM traces** — wire **OTLP** from agent/worker runtimes to Langfuse (see `docs/observability/langfuse-integration.md`); optional **`VITE_LANGFUSE_UI_URL`** for Settings link; dual-write or reconcile with **tokentrack** per product policy.

### P3 — Optional advanced memory

- [ ] **Semantic / RAG / vector index** — only if product bets on semantic long-term memory; choose embeddings, store, retention, cost; **not** required for KV-style centralized memory.

### Product / process (parallel to engineering — required for “high quality”)

- [ ] **Milestones and specs** — freeze interfaces and scope per milestone to limit drift.
- [ ] **Quality gates** — required tests, lint, optional human or model review before merge/release.
- [ ] **Long-context strategy** — summarize, structured memory, ledger references; avoid unbounded single-thread context.

### Non-goals (unless strategy changes)

- [ ] **P2P node mesh / gossip discovery** — inconsistent with hub-and-spoke control plane unless requirements change.

---

## Verification (recommended)

| Activity | Purpose |
|----------|---------|
| **Soak tests** | Validate stability over 24h → 72h → 7d; watch memory, disk, error rate. |
| **Chaos / failure injection** | Validate re-queue, recovery, and bounded loss under policy. |
| **Quality gates** | Separate from soak — release criteria tied to tests and reviews, not duration alone. |

---

## How to use this file

- **Engineering:** drive P0 → P1 for baseline scheduling and resilience; link PRs to bullets.
- **Product:** own acceptance numbers (availability, RTO/RPO) and quality gates; adjust priorities when scope changes.
- **Done items:** move to a dated “Recently completed” section or remove.

---

## Related documents

- `docs/product-vision-and-architecture.md` — north star, **§1a baseline goal**, alignment table.
- `docs/backend/node-registry-contract.md` — node API contract.
- `docs/runtime/deployment-and-operations.md` — runtime and ops context.
