# Node Registry Contract

## Scope

This document defines the architecture contract for node registration, scheduling, and lifecycle management in open-kraken. All node management producers and consumers must follow these definitions.

---

## Domain Model

### Node

```go
// NodeType represents the infrastructure type of a node
type NodeType string

const (
    NodeTypeK8sPod    NodeType = "k8s_pod"
    NodeTypeBareMetar NodeType = "bare_metal"
)

// NodeStatus represents the current lifecycle state of a node
type NodeStatus string

const (
    NodeStatusOnline  NodeStatus = "online"
    NodeStatusOffline NodeStatus = "offline"
    NodeStatusDraining NodeStatus = "draining"
)

// NodeCapacity describes the resource capacity of a node
type NodeCapacity struct {
    CPU    string `json:"cpu"`    // e.g. "4", "0.5"
    Memory string `json:"memory"` // e.g. "8Gi", "512Mi"
    MaxAgents int `json:"maxAgents"`
}

// Node is the aggregate root for a registered compute node
type Node struct {
    ID           string            `json:"id"`
    Hostname     string            `json:"hostname"`
    Type         NodeType          `json:"type"`
    Status       NodeStatus        `json:"status"`
    Labels       map[string]string `json:"labels"`
    Capacity     NodeCapacity      `json:"capacity"`
    // WorkspaceID scopes this node to a workspace for event isolation.
    // Defaults to the server's default workspace when omitted at registration.
    WorkspaceID  string            `json:"workspaceId,omitempty"`
    RegisteredAt time.Time         `json:"registeredAt"`
    LastHeartbeatAt *time.Time     `json:"lastHeartbeatAt,omitempty"`
    AgentIDs     []string          `json:"agentIds"`
}
```

### NodeRegistration (request)

```go
type NodeRegistrationRequest struct {
    Hostname string            `json:"hostname"`
    Type     NodeType          `json:"type"`
    Labels   map[string]string `json:"labels,omitempty"`
    Capacity NodeCapacity      `json:"capacity"`
}
```

### AgentAssignment (request)

```go
type AgentAssignmentRequest struct {
    MemberID string `json:"memberId"`
}
```

---

## API Endpoints

### Register Node

```
POST /api/v1/nodes/register
```

**Request Headers (optional):**
| Header | Description |
|--------|-------------|
| `X-Kraken-Workspace-Id` | Workspace to scope this node to. Overridden by `workspaceId` in body if both present. |

**Request Body:**
```json
{
  "hostname": "worker-01.cluster.local",
  "type": "k8s_pod",
  "workspaceId": "ws_123",
  "labels": {
    "region": "us-west-2",
    "tier": "compute"
  },
  "capacity": {
    "cpu": "4",
    "memory": "8Gi",
    "maxAgents": 5
  }
}
```

**Response `201 Created`:**
```json
{
  "id": "node_01J...",
  "hostname": "worker-01.cluster.local",
  "type": "k8s_pod",
  "status": "online",
  "labels": { "region": "us-west-2", "tier": "compute" },
  "capacity": { "cpu": "4", "memory": "8Gi", "maxAgents": 5 },
  "registeredAt": "2026-04-05T10:00:00Z",
  "lastHeartbeatAt": null,
  "agentIds": []
}
```

**Errors:**
| Code | Reason |
|------|--------|
| `400` | Missing required fields or invalid `type` value |
| `409` | A node with this hostname already exists and is online |

---

### Deregister Node

```
DELETE /api/v1/nodes/{id}
```

**Path Params:** `id` — node ID

**Response `204 No Content`**

**Errors:**
| Code | Reason |
|------|--------|
| `404` | Node not found |
| `409` | Node has active agents assigned — drain first |

---

### Node Heartbeat

```
POST /api/v1/nodes/{id}/heartbeat
```

Nodes must send heartbeats every **30 seconds**. Nodes with no heartbeat for **90 seconds** are automatically marked `offline`.

**Path Params:** `id` — node ID

**Request Body:** _(empty or optional status payload)_
```json
{}
```

**Response `200 OK`:**
```json
{
  "id": "node_01J...",
  "status": "online",
  "lastHeartbeatAt": "2026-04-05T10:01:30Z"
}
```

**Errors:**
| Code | Reason |
|------|--------|
| `404` | Node not found |

> **Heartbeat expiry rule:** A background sweeper runs every 30 seconds. Any node with `lastHeartbeatAt < now - 90s` transitions to `offline` and emits a `node.offline` WebSocket event.

---

### List Nodes

```
GET /api/v1/nodes
```

**Query Params:**
| Param | Type | Description |
|-------|------|-------------|
| `status` | `string` | Filter by status: `online`, `offline`, `draining` |
| `type` | `string` | Filter by node type: `k8s_pod`, `bare_metal` |
| `label` | `string` | Filter by label key=value, e.g. `label=region=us-west-2` |

**Response `200 OK`:**
```json
{
  "nodes": [
    {
      "id": "node_01J...",
      "hostname": "worker-01.cluster.local",
      "type": "k8s_pod",
      "status": "online",
      "labels": { "region": "us-west-2" },
      "capacity": { "cpu": "4", "memory": "8Gi", "maxAgents": 5 },
      "registeredAt": "2026-04-05T10:00:00Z",
      "lastHeartbeatAt": "2026-04-05T10:01:30Z",
      "agentIds": ["member_abc"]
    }
  ],
  "total": 1
}
```

---

### Get Node Detail

```
GET /api/v1/nodes/{id}
```

**Response `200 OK`:** Full `Node` object (same shape as register response)

**Errors:**
| Code | Reason |
|------|--------|
| `404` | Node not found |

---

### Assign Agent to Node

```
POST /api/v1/nodes/{id}/agents
```

Assigns a member (agent) to a specific node. The scheduler backend records the association; the agent process itself is responsible for connecting to the assigned node.

**Path Params:** `id` — node ID

**Request Body:**
```json
{
  "memberId": "member_01J..."
}
```

**Response `201 Created`:**
```json
{
  "nodeId": "node_01J...",
  "memberId": "member_01J...",
  "assignedAt": "2026-04-05T10:05:00Z"
}
```

**Errors:**
| Code | Reason |
|------|--------|
| `404` | Node not found |
| `409` | Member already assigned to a node |
| `422` | Node is offline or at capacity (`agentIds.length >= capacity.maxAgents`) |

---

## WebSocket Events

All node events follow the standard open-kraken event envelope (see `realtime-contract.md`). The `name` field uses the following canonical names:

### `node.snapshot`

Full node roster snapshot. Emitted on initial WebSocket subscription.

```json
{
  "name": "node.snapshot",
  "workspaceId": "ws_123",
  "payload": {
    "nodes": [ /* array of Node objects */ ]
  }
}
```

### `node.updated`

Emitted when a node registers, updates its labels/capacity, or changes status (except going offline).

```json
{
  "name": "node.updated",
  "workspaceId": "ws_123",
  "payload": {
    "node": { /* Node object */ }
  }
}
```

### `node.offline`

Emitted when a node's heartbeat expires (90s timeout) or when it is explicitly deregistered.

```json
{
  "name": "node.offline",
  "workspaceId": "ws_123",
  "payload": {
    "nodeId": "node_01J...",
    "reason": "heartbeat_timeout",
    "occurredAt": "2026-04-05T10:03:00Z"
  }
}
```

`reason` values: `heartbeat_timeout`, `deregistered`

---

## Architecture Decisions

**Decision:** Heartbeat timeout via background sweeper, not TTL expiry in storage.
**Reason:** Keeps the storage layer simple (SQLite); sweeper interval is configurable and gives us explicit `node.offline` events with a typed `reason`.
**Revisit if:** Node count exceeds ~10,000 and sweeper becomes a bottleneck.

**Decision:** Agent-node assignment is a lightweight record, not a process spawn.
**Reason:** The scheduler records intent; actual process placement is handled externally (e.g., k8s pod scheduling). This keeps the registry as a coordination layer.
**Revisit if:** open-kraken needs to directly spawn agent processes on nodes.
