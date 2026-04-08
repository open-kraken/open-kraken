# Open-Kraken E2E Test Plan

## 1. Node registry scenarios

### 1.1 Node registration
- [ ] When a new node registers with the backend, response includes a unique `node_id` and confirmation.
- [ ] Re-registering the same node (`node_id`) updates registration instead of erroring.
- [ ] Registration missing required fields (`node_id` / `capabilities`) returns `400`.

### 1.2 Heartbeats
- [ ] Registered node sends heartbeat every T seconds; backend records `last_seen`.
- [ ] Heartbeat response may include latest scheduling directives or config changes.

### 1.3 Timeout / offline
- [ ] After heartbeat stops beyond the timeout, backend marks node `offline`.
- [ ] Offline nodes are not assigned new agent work.
- [ ] When the node sends heartbeat again, status returns to `online`.

### 1.4 Agent assignment
- [ ] When creating agent work, scheduler picks an `online` node.
- [ ] When all nodes are offline, agent tasks enter a `pending` queue.
- [ ] When a node comes online, `pending` tasks are assigned automatically.

---

## 2. Skill system scenarios

### 2.1 Skill loading
- [ ] On startup, backend loads all skill definitions from `KRAKEN_SKILLS_DIR` (or configured skill root).
- [ ] Malformed skill definitions log warnings but do not block startup.
- [ ] `GET /api/v1/skills` returns all loaded skills.

### 2.2 Skill binding
- [ ] Binding a skill to an agent returns confirmation.
- [ ] Binding a non-existent skill returns `404`.
- [ ] Multiple skills per agent can be invoked independently.

### 2.3 Skill queries
- [ ] `GET /api/v1/skills/:id` returns details (name, version, parameter schema).
- [ ] Skill list can be filtered by tag/capability.
- [ ] At execution time, bound skills are invoked and return results.

---

## 3. Token tracking scenarios

### 3.1 Token reporting
- [ ] After agent execution, prompt/completion token usage is reported.
- [ ] Reports persist across restarts.
- [ ] Invalid report payload returns `422` and is logged.

### 3.2 Token aggregation
- [ ] `GET /api/v1/tokens/usage` (or equivalent stats route) returns aggregated usage for a time range.
- [ ] Aggregation supports grouping by `agent_id`, `node_id`, `skill_id` as applicable.
- [ ] Aggregates match the sum of individual events (numeric accuracy).

### 3.3 Realtime push
- [ ] WebSocket `/ws` can subscribe to token usage events.
- [ ] New token reports push to subscribed clients.
- [ ] After reconnect, client receives cumulative or resynced data (per contract).

---

## 4. Memory storage scenarios

### 4.1 CRUD
- [ ] `POST /api/v1/memory` creates an entry and returns `id`.
- [ ] `GET /api/v1/memory/:id` reads the entry.
- [ ] `PUT /api/v1/memory/:id` updates content and bumps version.
- [ ] `DELETE /api/v1/memory/:id` removes the entry; subsequent `GET` returns `404`.

### 4.2 Scope isolation
- [ ] `scope=agent:{id}` entries are visible only to that agent.
- [ ] `scope=global` entries are visible to all agents (per contract).
- [ ] Cross-scope reads that are denied return `403`.

### 4.3 TTL expiry
- [ ] Entries can be created with a `ttl` field.
- [ ] After TTL, `GET` returns `404` (or `410 Gone`).
- [ ] TTL extension (e.g. `PATCH`) extends lifetime before expiry.

---

## 5. Cross-node scenarios

### 5.1 Parallel agent execution on multiple nodes
- [ ] Assign different agent tasks to two nodes (e.g. `agent-node-1`, `agent-node-2`) concurrently.
- [ ] Both tasks run in parallel without blocking each other.
- [ ] Results are reported per node; backend attributes source correctly.

### 5.2 Scheduling balance
- [ ] Creating N agent tasks spreads work across two nodes within ±1.
- [ ] When one node goes down, new tasks route to surviving nodes.

### 5.3 Shared memory (global scope)
- [ ] Agent on `node-1` writes `scope=global` memory.
- [ ] Agent on `node-2` reads the same key; content matches.
- [ ] Concurrent writes to the same global key: last-write-wins or conflict per contract.

### 5.4 Cross-node token aggregation
- [ ] Each node reports token usage.
- [ ] Global aggregate API returns the sum across nodes.
- [ ] WebSocket events include `node_id` where applicable.

---

## Test environment

- Docker Compose: `bash scripts/docker-up.sh` (e.g. `agent-node1` + `agent-node2`).
- Or Kubernetes: `bash scripts/k8s-deploy.sh`.
- Start tests after backend `/healthz` is ready.
- Use an isolated database or reset state before each run (or transactional rollback).
