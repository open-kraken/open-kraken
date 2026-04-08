# Product vision and architecture alignment (open-kraken)

This document describes the **target positioning** of **open-kraken**, its relationship to related engineering lineages, and **gaps between the current implementation and that vision**. Implementation details remain authoritative in `backend/go` and in contracts under `docs/`.

---

## 1. North star

**open-kraken** is intended to **converge** capabilities from the **claw-code**, **Golutra**, and **OpenClaw** lineages into **one shippable whole**:

- **Cross-server, multi-agent coordination**: orchestrate agents and tool use across processes and nodes—not only a pile of single-machine scripts.
- **Built-in management UI**: a **web console** in the same repository for operations and collaboration visibility, not only a headless API.
- **Core product capabilities**
  - **Cross-process / cross-node scheduling**: “what runs where” is queryable and evolvable state, not implicit convention.
  - **Centralized ledger**: auditable records of teams, members, commands, and context changes—supporting review, compliance, and incident response.
  - **Centralized memory**: store and retrieve agent / workspace memory inside one boundary, avoiding fragmented ad-hoc state.
- **Organizational model**
  - **Continuously formed AI teams**: long-lived **team** units.
  - **Team → multiple agents**: several agents per team (members/roles may map to agents or human–agent mixes, as defined by contract).
  - **Agent → skills**: each agent has an evolvable **skill** set.
  - **Dynamic expansion**: **join execution nodes at runtime** and **extend agent capabilities** (registration, discovery, binding, and versioning governed by backend and contracts).

> **Note:** In this document, claw-code / Golutra / OpenClaw denote **design and engineering lineage**. Trademarks and external product names are owned by their respective projects; **this repository** is the **single home** for the unified implementation and documentation.

---

## 1a. Baseline operating goal (agent teams)

The following **baseline target** guides platform and process work. It is **not** a guarantee by software alone; quality of shipped product also depends on **models, task breakdown, review, and testing** outside this repository.

| Pillar | Intent |
|--------|--------|
| **Cross-node scheduling** | Agent work can be **assigned and executed across multiple registered nodes**, with explicit **queues**, **retries**, and **failure handling**—not only node registration and simplified label-based assignment. |
| **Seven-day continuous operation** | The **control plane and worker path** are designed and operated so that an agent team workload can run **for seven days** within agreed **availability**, **recovery**, and **data-durability** bounds (see `docs/action-items-and-current-state.md` for acceptance examples and backlog). |
| **High-quality product output** | **Quality is gated** by engineering practice (tests, reviews, milestones), supported by ledger, memory, and observability—not implied by runtime length alone. |

### Suggested acceptance dimensions (examples — refine per release)

| Dimension | Example acceptance notes |
|-----------|---------------------------|
| **Scheduling** | Tasks can be dispatched to **≥2 nodes**; when a node fails, work is **re-queued or migrated** per policy; no silent task loss. |
| **Uptime / resilience** | Define **planned availability** (e.g. 99.5% over 7 days) or **max unplanned incidents**; define **RTO/RPO** for control-plane recovery. Absolute “zero restart for 168 hours” is unusually expensive; prefer **short failures + automated recovery + bounded data loss**. |
| **Quality** | Separate from uptime: **milestones**, **automated checks**, **human or strong-model review** at defined gates; memory/roadmap/ledger used to avoid unbounded context drift. |

Engineering backlog tied to this baseline lives in **`docs/action-items-and-current-state.md`**.

---

## 2. Frontend: observability plane

The frontend is **not** a secondary dashboard; it is a **first-class observability and operations surface**. It should cover at least:

| Dimension | Expected capability |
|-----------|---------------------|
| **Nodes** | Liveness, load or health summaries, and relationship to scheduling (server is source of truth). |
| **Teams** | Team list, membership, roles, and permission boundaries (aligned with backend `authz`). |
| **Team task map** | Roadmap / boards / project data as **team-level delivery views** showing progress and blockers. |
| **In-team agent status** | Session, terminal attachment, token/activity-style runtime signals (server is source of truth). |
| **Skills** | Catalog, member bindings, and **import/export** for reuse and backup. |

**Principle:** authorization and capability decisions live on the **server**; the UI shows **read models** and **clear failure/degradation**, and must not fake permissions in the client.

**Product polish:** several **observability-plane** gaps (Teams IA, skills policy beyond snapshots, task-map depth, unified agent status, shell vs demo routes) are **acknowledged backlog**—see **`docs/action-items-and-current-state.md` (§ P2)** and **`web/README.md` (Gaps vs product vision)**.

---

## 3. Backend: coordination and state

The backend provides **APIs, realtime channels, persistence, and authorization**, exposing **stable contracts** to the web UI and external agent runtimes:

- **Scheduling and orchestration**: terminal sessions, realtime, node registry, etc., form the basis of “who executes where”; long term this should align deeply with **cross-node scheduling policy**.
- **Ledger**: centralized event stream for audit and review.
- **Memory**: centralized keyed entries (including TTL), the current embodiment of “centralized memory.”
- **Nodes and skills**: node registry and skill load/bindings to support dynamic topology and capability growth.

Persistence evolves by phase: today the stack is mostly **embedded SQLite plus JSON/file stores**; stronger stores may replace them later **without changing observability semantics or contract boundaries** on the frontend.

### 3.1 External reference designs (LangGraph, Ray)

Industry frameworks that articulate **long-running LLM agents** (checkpointing, structured graphs, streaming, human-in-the-loop) and **distributed execution** (tasks, stateful actors, object store, placement) are summarized in **[architecture/langgraph-and-ray-design-references.md](architecture/langgraph-and-ray-design-references.md)**. They supply **vocabulary and tradeoff patterns** for scheduling and resilience; they are **not** mandated stack choices for this repository.

---

## 4. Documentation vs code boundaries

- **`docs/`**: contracts, runbooks, risk and acceptance matrices; **this file is the product-vision anchor**; detailed contracts live in sub-documents.
- **`backend/go/`**: sole backend implementation; does not depend on specific `web` components.
- **`web/`**: observability and operations UI plus API clients; depends on `docs` and backend contracts.

---

## 5. Current implementation vs vision: alignment and gaps

The following reflects the **current mainline** (Go monolith + React SPA + local/embedded storage) and will change as the repo evolves.

### 5.1 Aligned or partially aligned

- **Built-in UI**: React `AppShell` and multiple routes (Dashboard, Nodes, Ledger, Members, Roadmap, Terminal, etc.).
- **Centralized ledger**: `ledger` domain and UI align with an auditable event stream.
- **Centralized memory**: `memory` uses SQLite + APIs, aligned with a unified memory boundary (semantic/vector search is not a mainline requirement today).
- **Nodes and skills**: `node` and `skill` registration/bindings exist and support a meaningful degree of dynamic topology.
- **Realtime / terminal**: foundation for session and execution observability in multi-agent settings.
- **Authorization**: `authz` enforces server-side decisions, consistent with “no fake permissions in the UI.”

### 5.2 Gaps or areas to strengthen

- **Baseline 7-day + cross-node scheduling** (see **§1a**): requires **task/queue model**, **HA or clear single-instance limits**, **observability**, **backup/RPO**, and **verification** (soak/chaos)—tracked in `docs/action-items-and-current-state.md`.
- **Cross-server scheduling**: default deployment is still **monolith + node registry**; **strong cross-region scheduling, failover, and queued work** need roadmap-driven expansion.
- **Explicit “team → agents → skills” product model**: members/nodes/skills appear in UI and APIs; **end-to-end first-class teams** (including task maps and agent lifecycle) can be strengthened.
- **Observability completeness**: full loops and export formats for nodes/teams/task maps/agent state/skill import-export should be filled in per contract.
- **Advanced memory**: current memory is structured key–value + TTL; **semantic retrieval or vector tooling** would be additive, not required by embedded SQLite today.

### 5.3 Summary

| Area | Vision | Current mainline |
|------|--------|------------------|
| Product story | Multi-server agents + console + ledger + memory | Skeleton in place; converging toward full story |
| Frontend | Strong observability plane | Shell and pages exist; align item-by-item with vision |
| Backend | Scheduling + ledger + memory + dynamic nodes/skills | Modules exist; depth and scale of cross-node scheduling TBD |
| Data | Centralized, evolvable | SQLite/files today; replaceable |

---

## 6. Revision history

- When introduced: extended the repo narrative beyond “Golutra migration rewrite only” to the unified product vision above, with cross-links from directory READMEs.
- Added **§1a Baseline operating goal** (7-day runs, cross-node scheduling, quality gates) and linked detailed backlog to `docs/action-items-and-current-state.md`.
- Added **§3.1** and **`docs/architecture/langgraph-and-ray-design-references.md`**: LangGraph / Ray design references (external docs; not a stack commitment).
- Noted **§2** frontend product-polish backlog (cross-link to `action-items-and-current-state.md` § P2 and `web/README.md`).
