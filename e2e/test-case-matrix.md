# Open-Kraken T11 Test Case Matrix

> Aligned with the frontend API contract (commit `45c4f9c`), covering T04–T07 backend routes.  
> Status: pending execution (unlocked when T04–T07 are complete).

---

## API contract coverage

| Route | Method | T11 coverage |
|-------|--------|--------------|
| `/api/v1/nodes` | GET | TC-N01 |
| `/api/v1/nodes/{id}` | GET | TC-N02 |
| `/api/v1/nodes/{id}/agents` | POST | TC-N03 |
| `/api/v1/nodes/{id}/agents` | DELETE | TC-N04 |
| `/api/v1/tokens/stats` | GET | TC-T01 |
| `/api/v1/tokens/activity` | GET | TC-T02 |
| `/api/v1/tokens/events` | POST | TC-T03 |
| `/api/v1/skills` | GET | TC-S01 |
| `/api/v1/members/{id}/skills` | GET | TC-S02 |
| `/api/v1/members/{id}/skills` | PUT | TC-S03 |
| WebSocket `/ws` — `node.snapshot` | SUB | TC-W01 |
| WebSocket `/ws` — `node.updated` | SUB | TC-W02 |
| WebSocket `/ws` — `node.offline` | SUB | TC-W03 |
| WebSocket `/ws` — `token.stats_updated` | SUB | TC-W04 |

---

## 1. Node registry (`GET /api/v1/nodes`, `GET /api/v1/nodes/{id}`)

### TC-N01 `GET /api/v1/nodes` — list nodes

| ID | Case | Preconditions | Expected | Priority |
|----|------|---------------|----------|----------|
| TC-N01-01 | Empty list when no nodes | DB cleared | `200 { nodes: [] }` | P1 |
| TC-N01-02 | Returns all registered nodes | 2 nodes registered | `200 { nodes: [n1, n2] }` with id/status/capabilities | P1 |
| TC-N01-03 | Filter by online status | 1 online + 1 offline | `?status=online` returns only online | P2 |
| TC-N01-04 | Response field completeness | 1 online node | Each node has `id, status, last_seen, capabilities, agent_count` | P1 |

### TC-N02 `GET /api/v1/nodes/{id}` — node detail

| ID | Case | Preconditions | Expected | Priority |
|----|------|---------------|----------|----------|
| TC-N02-01 | Existing node | Node registered | `200`, full node payload | P1 |
| TC-N02-02 | Node missing | id not registered | `404 { error: "node not found" }` | P1 |
| TC-N02-03 | Detail includes agents | Node has 2 running agents | `agents[]` non-empty | P2 |

### TC-N03 `POST /api/v1/nodes/{id}/agents` — assign agent

| ID | Case | Preconditions | Expected | Priority |
|----|------|---------------|----------|----------|
| TC-N03-01 | Assign to online node | Node online | `201`, returns `agent_id` | P1 |
| TC-N03-02 | Assign to offline node | Node offline | `409` or `422`, reject | P1 |
| TC-N03-03 | Node missing | Invalid id | `404` | P1 |
| TC-N03-04 | Missing required body field | Omit `skill_id` | `400 { error: ... }` | P2 |
| TC-N03-05 | `agent_count` increments | Was 0 agents | After assign, `GET /api/v1/nodes/{id}` has `agent_count=1` | P2 |

### TC-N04 `DELETE /api/v1/nodes/{id}/agents` — remove agent

| ID | Case | Preconditions | Expected | Priority |
|----|------|---------------|----------|----------|
| TC-N04-01 | Remove existing agent | Node has agent | `200` or `204` | P1 |
| TC-N04-02 | Remove missing agent | Invalid `agent_id` | `404` | P1 |
| TC-N04-03 | `agent_count` decrements | Had 1 agent | After remove, `agent_count=0` | P2 |

---

## 2. Token tracking (`GET /api/v1/tokens/stats`, `/api/v1/tokens/activity`, `POST /api/v1/tokens/events`)

### TC-T01 `GET /api/v1/tokens/stats` — token statistics

| ID | Case | Preconditions | Expected | Priority |
|----|------|---------------|----------|----------|
| TC-T01-01 | Zero when empty | DB cleared | `200 { prompt_tokens: 0, completion_tokens: 0, total: 0 }` | P1 |
| TC-T01-02 | Stats after reports | POST 2 events (100+200 tokens) | `total=300`, breakdown correct | P1 |
| TC-T01-03 | Time range filter | Data for yesterday and today | `?from=today` returns today only | P2 |
| TC-T01-04 | Aggregate by `node_id` | Reports from two nodes | `?node_id=node-1` only that node | P2 |

### TC-T02 `GET /api/v1/tokens/activity` — activity feed

| ID | Case | Preconditions | Expected | Priority |
|----|------|---------------|----------|----------|
| TC-T02-01 | List activity | 3 events posted | `200 { events: [...] }` with 3 rows | P1 |
| TC-T02-02 | Pagination | 10 events | `?limit=5` returns 5 + next cursor | P2 |
| TC-T02-03 | Field completeness | 1 event | Includes `timestamp, node_id, agent_id, prompt_tokens, completion_tokens` | P1 |
| TC-T02-04 | Filter by `agent_id` | Two agents | `?agent_id=x` only that agent | P2 |

### TC-T03 `POST /api/v1/tokens/events` — ingest events

| ID | Case | Preconditions | Expected | Priority |
|----|------|---------------|----------|----------|
| TC-T03-01 | Happy path | — | `201`, persisted | P1 |
| TC-T03-02 | Stats update | total was 0 | After POST, `GET /stats` increases | P1 |
| TC-T03-03 | Missing field | Omit `node_id` | `400` | P1 |
| TC-T03-04 | Negative tokens | `prompt_tokens=-1` | `422` | P2 |
| TC-T03-05 | Persistence | POST then restart | `GET /activity` still shows data | P2 |

---

## 3. Skill system (`GET /api/v1/skills`, `GET/PUT /api/v1/members/{id}/skills`)

### TC-S01 `GET /api/v1/skills` — skill catalog

| ID | Case | Preconditions | Expected | Priority |
|----|------|---------------|----------|----------|
| TC-S01-01 | All skills | 3 skills in `SKILLS_DIR` | `200 { skills: [s1,s2,s3] }` | P1 |
| TC-S01-02 | Empty catalog | `SKILLS_DIR` empty | `200 { skills: [] }` | P1 |
| TC-S01-03 | Field completeness | 1 skill | Includes `id, name, version, description, parameters_schema` | P1 |

### TC-S02 `GET /api/v1/members/{id}/skills` — member skills

| ID | Case | Preconditions | Expected | Priority |
|----|------|---------------|----------|----------|
| TC-S02-01 | Bound skills | Member has 2 skills | `200 { skills: [s1, s2] }` | P1 |
| TC-S02-02 | No bindings | New member | `200 { skills: [] }` | P1 |
| TC-S02-03 | Member missing | Invalid id | `404` | P1 |

### TC-S03 `PUT /api/v1/members/{id}/skills` — replace bindings

| ID | Case | Preconditions | Expected | Priority |
|----|------|---------------|----------|----------|
| TC-S03-01 | Bind new skill | Member had none | `200`, GET confirms | P1 |
| TC-S03-02 | Full replace | Had `s1`, `PUT [s2]` | Only `s2` bound | P1 |
| TC-S03-03 | Unknown skill | Invalid `skill_id` | `404` | P1 |
| TC-S03-04 | Member missing | Invalid id | `404` | P1 |
| TC-S03-05 | Clear with `[]` | Had 2 skills | `PUT []` then GET empty | P2 |

---

## 4. WebSocket events (`/ws`)

### TC-W01 `node.snapshot` — initial snapshot

| ID | Case | Expected | Priority |
|----|------|----------|----------|
| TC-W01-01 | Snapshot right after connect | `{ type: "node.snapshot", nodes: [...] }` | P1 |
| TC-W01-02 | Snapshot lists all nodes | 2 registered nodes, `snapshot.nodes.length === 2` | P1 |

### TC-W02 `node.updated` — node change events

| ID | Case | Expected | Priority |
|----|------|----------|----------|
| TC-W02-01 | Heartbeat updates fire event | `{ type: "node.updated", node: { id, last_seen } }` | P1 |
| TC-W02-02 | Agent assign fires event | After POST agent, `node.updated` reflects `agent_count` | P2 |

### TC-W03 `node.offline` — offline events

| ID | Case | Expected | Priority |
|----|------|----------|----------|
| TC-W03-01 | Timeout triggers offline | `{ type: "node.offline", nodeId: "..." }` | P1 |
| TC-W03-02 | Fan-out | Both WS clients receive offline | P2 |

### TC-W04 `token.stats_updated` — token stats push

| ID | Case | Expected | Priority |
|----|------|----------|----------|
| TC-W04-01 | Push after POST `/events` | `{ type: "token.stats_updated", stats: {...} }` | P1 |
| TC-W04-02 | Matches REST | WS values = `GET /tokens/stats` | P1 |
| TC-W04-03 | After reconnect | Latest stats on reconnect | P2 |

---

## 5. Cross-node integration

| ID | Scenario | Steps | Expected | Priority |
|----|----------|-------|----------|----------|
| TC-X01 | Parallel agents | POST agents to `node-1` and `node-2` | Both complete independently | P1 |
| TC-X02 | Reroute on failure | Take `node-1` offline, POST agent | Routes to `node-2` | P1 |
| TC-X03 | Cross-node token sum | `node-1` reports 100, `node-2` reports 200 | `GET /stats` total = 300 | P1 |
| TC-X04 | WS distinguishes nodes | Token events from both nodes | Events include `node_id` | P2 |

---

## Suggested execution order

```
Phase 1 (after unlock): P1 single-route happy paths
  TC-N01 → TC-N02 → TC-T01 → TC-T03 → TC-S01

Phase 2: P1 errors and edges
  TC-N03 → TC-N04 → TC-T02 → TC-S02 → TC-S03

Phase 3: WebSocket
  TC-W01 → TC-W02 → TC-W03 → TC-W04

Phase 4: P2 + cross-node
  TC-X01 → TC-X02 → TC-X03 → TC-X04
```

## Environment

- Start: `bash scripts/docker-up.sh` (e.g. `agent-node1` + `agent-node2`).
- Ready check: `curl http://localhost:8080/healthz`.
- Reset DB or use isolated containers between phases.
