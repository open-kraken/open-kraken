# Distributed Memory Store Contract

## Scope

This document defines the architecture contract for the open-kraken distributed memory store. All agents and services that read or write shared memory must use the HTTP API defined here. The backing store is centralized — all nodes share a single backend HTTP service, ensuring consistent cross-node memory access without distributed consensus.

---

## Domain Model

```go
// MemoryScope defines the visibility boundary of a memory entry
type MemoryScope string

const (
    MemoryScopeAgent  MemoryScope = "agent"  // visible only to the owning agent (ownerId)
    MemoryScopeTeam   MemoryScope = "team"   // visible to all agents in the same team/workspace
    MemoryScopeGlobal MemoryScope = "global" // visible to all agents across all workspaces
)

// MemoryEntry is the storage unit for a single memory key
type MemoryEntry struct {
    ID        string          `json:"id"`
    Key       string          `json:"key"`
    Value     json.RawMessage `json:"value"`     // arbitrary JSON blob
    Scope     MemoryScope     `json:"scope"`
    OwnerID   string          `json:"ownerId"`   // memberId for agent scope; "" for team/global shared entries
    NodeID    string          `json:"nodeId"`    // node that wrote the entry (informational, not access-control)
    CreatedAt time.Time       `json:"createdAt"`
    UpdatedAt time.Time       `json:"updatedAt"`
    TTL       *int64          `json:"ttl,omitempty"` // seconds until expiry; null = no expiry
}
```

### Key Format

Keys are arbitrary strings. Recommended convention:

```
<namespace>/<resource>/<identifier>
```

Examples:
- `agent/context/last-task`
- `team/roadmap/active-sprint`
- `global/config/model-defaults`

Keys are **scoped** — the same key string under different scopes is a different entry.

---

## Storage Backend

- **Engine:** SQLite, file at `open-kraken/backend/go/internal/memory/memory.db`
- **Module path:** `open-kraken/backend/go/internal/memory/`
- **Schema:**

```sql
CREATE TABLE memory_entries (
    id         TEXT PRIMARY KEY,
    key        TEXT NOT NULL,
    value      TEXT NOT NULL,           -- JSON
    scope      TEXT NOT NULL,           -- 'agent' | 'team' | 'global'
    owner_id   TEXT NOT NULL DEFAULT '',
    node_id    TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL,        -- Unix epoch seconds
    updated_at INTEGER NOT NULL,
    expires_at INTEGER                  -- NULL = no expiry
);

CREATE UNIQUE INDEX idx_memory_scope_owner_key
    ON memory_entries (scope, owner_id, key);

CREATE INDEX idx_memory_expires_at
    ON memory_entries (expires_at)
    WHERE expires_at IS NOT NULL;
```

- TTL expiry is enforced lazily on read (expired entries return `404`) and eagerly by a background sweeper that runs every **60 seconds**
- `owner_id` for `team` and `global` scope entries is stored as empty string `""` so those scopes remain shared by key
- The SQLite file is local to the server process; cross-node access happens through the HTTP API, not direct file access

---

## Caller Identity Header

All memory API requests may include:

| Header | Required | Description |
|--------|----------|-------------|
| `X-Kraken-Actor-Id` | No | Identifies the calling agent or service. Used as `ownerId` for `agent` scope writes. Defaults to `"anonymous"` when absent. |

**Scope access rules:**

| Scope | Read | Write | Delete |
|-------|------|-------|--------|
| `agent` | Actor must match stored `ownerId` | `ownerId` forced to Actor-Id | Actor must match stored `ownerId` |
| `team` | Any actor | Any actor | Any actor |
| `global` | Any actor | Any actor | Any actor |

---

## API Endpoints

### Write (Create or Replace) Memory Entry

```
PUT /api/v1/memory/{scope}/{key}
```

Creates or replaces a memory entry. For `agent` scope, `ownerId` is always set to the value of `X-Kraken-Actor-Id` (server-side enforcement), preventing cross-agent writes. For `team` and `global` scopes, `ownerId` is normalized to `""` so writes replace the shared `{scope, key}` entry instead of creating per-actor copies.

**Path Params:**
| Param | Type | Description |
|-------|------|-------------|
| `scope` | `string` | `agent`, `team`, or `global` |
| `key` | `string` | URL-encoded key string |

**Request Body:**
```json
{
  "value": { "lastTask": "T01", "confidence": 0.95 },
  "nodeId": "node_01J...",
  "ttl": 3600
}
```

`ttl` is optional. Omit or set to `null` for no expiry.

**Response `200 OK`** (updated) or **`201 Created`** (new):
```json
{
  "id": "mem_01J...",
  "key": "agent/context/last-task",
  "value": { "lastTask": "T01", "confidence": 0.95 },
  "scope": "agent",
  "ownerId": "member_01J...",
  "nodeId": "node_01J...",
  "createdAt": "2026-04-05T10:20:00Z",
  "updatedAt": "2026-04-05T10:20:00Z",
  "ttl": 3600
}
```

**Errors:**
| Code | Reason |
|------|--------|
| `400` | Invalid scope value or malformed JSON `value` |
| `403` | Reserved for rejected cross-owner agent memory operations |

---

### Read Memory Entry

```
GET /api/v1/memory/{scope}/{key}
```

**Path Params:**
| Param | Type | Description |
|-------|------|-------------|
| `scope` | `string` | `agent`, `team`, or `global` |
| `key` | `string` | URL-encoded key string |

**Query Params (agent scope only):**
| Param | Type | Description |
|-------|------|-------------|
| `ownerId` | `string` | Optional for `agent` scope. If present, it must match `X-Kraken-Actor-Id`; omit to read own memory. |

**Response `200 OK`:** Full `MemoryEntry` object

**Errors:**
| Code | Reason |
|------|--------|
| `404` | Entry not found or TTL expired |
| `403` | Reading another agent's memory |

---

### List Memory Entries by Scope

```
GET /api/v1/memory/{scope}
```

Returns all entries for the given scope visible to the caller.

**Path Params:** `scope` — `agent`, `team`, or `global`

**Query Params:**
| Param | Type | Description |
|-------|------|-------------|
| `prefix` | `string` | Filter keys by prefix, e.g. `agent/context/` |
| `ownerId` | `string` | For `agent` scope: optional owner check. If present, it must match `X-Kraken-Actor-Id`; omit to list own memory. |
| `limit` | `int` | Max entries to return (default 100, max 1000) |
| `cursor` | `string` | Pagination cursor from previous response |

**Response `200 OK`:**
```json
{
  "entries": [
    {
      "id": "mem_01J...",
      "key": "agent/context/last-task",
      "value": { "lastTask": "T01" },
      "scope": "agent",
      "ownerId": "member_01J...",
      "nodeId": "node_01J...",
      "createdAt": "2026-04-05T10:20:00Z",
      "updatedAt": "2026-04-05T10:20:00Z",
      "ttl": 3600
    }
  ],
  "nextCursor": "mem_01J...",
  "total": 1
}
```

---

### Delete Memory Entry

```
DELETE /api/v1/memory/{scope}/{key}
```

**Path Params:** Same as GET

**Response `204 No Content`**

**Errors:**
| Code | Reason |
|------|--------|
| `404` | Entry not found |
| `403` | Deleting another agent's memory |

---

## Cross-Node Access Model

```
Node A (Agent)          Node B (Agent)
     │                       │
     │  PUT /api/v1/memory/...  │
     └──────────┐            │
                ▼            │
         open-kraken         │
         HTTP Service        │
         (SQLite store)      │
                ▲            │
                └────────────┘
                  GET /api/v1/memory/...
```

- All nodes call the **same central HTTP service**
- No peer-to-peer memory sync; no distributed storage
- Network partitions between a node and the central service cause writes to fail (HTTP 5xx); reads return stale data from local cache if applicable (not implemented in v1 — fail-fast)
- This design is intentionally simple for the current scale (< 100 nodes)

---

## Go Module Structure

New module to be created at `open-kraken/backend/go/internal/memory/`:

```
internal/memory/
├── db.go          # SQLite connection setup, schema migration
├── store.go       # MemoryStore interface + SQLiteMemoryStore implementation
├── sweeper.go     # Background TTL expiry sweeper
└── handler.go     # HTTP handler wiring (PUT/GET/LIST/DELETE)
```

**Interface contract:**

```go
type MemoryStore interface {
    Put(ctx context.Context, entry MemoryEntry) (MemoryEntry, error)
    Get(ctx context.Context, scope MemoryScope, ownerId, key string) (MemoryEntry, error)
    List(ctx context.Context, scope MemoryScope, ownerId, prefix string, limit int, cursor string) ([]MemoryEntry, string, error)
    Delete(ctx context.Context, scope MemoryScope, ownerId, key string) error
    SweepExpired(ctx context.Context) (int64, error)
}
```

---

## Architecture Decisions

**Decision:** Centralized SQLite store, accessed via HTTP from all nodes.
**Reason:** Avoids distributed consensus (Raft, etcd) which is overkill for the current agent count. A single HTTP service with SQLite gives ACID guarantees and is easy to reason about. Cross-node access is a network call, not a storage protocol.
**Revisit if:** Node count or write throughput requires horizontal scaling (migrate to Postgres or a distributed KV store then).

**Decision:** TTL enforced lazily on read + eager sweeper, not as a DB trigger.
**Reason:** SQLite does not have native TTL support. Lazy expiry prevents stale reads; the sweeper prevents unbounded storage growth. This pattern is straightforward to test and observe.
**Revisit if:** High write volume with short TTLs causes the sweeper to lag and storage grows faster than it is cleaned.

**Decision:** `ownerId` derived server-side from auth context, not from request body.
**Reason:** Prevents agents from writing into another agent's memory scope by crafting a request with a spoofed `ownerId`. Authorization is enforced at the HTTP handler layer.
**Revisit if:** Service-to-service calls require writing on behalf of another member (introduce explicit delegation tokens then).
