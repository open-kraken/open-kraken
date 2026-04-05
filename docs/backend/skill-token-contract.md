# Skill Assignment & Token Tracking Contract

## Scope

This document defines the architecture contract for two related subsystems:

1. **Skill System** — scanning, listing, and assigning skill profiles (`.md` files) to members
2. **Token Tracking** — recording and aggregating AI token usage events per member, node, and team

---

## Part 1: Skill System

### Domain Model

```go
// SkillEntry represents a discovered skill file
type SkillEntry struct {
    Name        string `json:"name"`        // e.g. "tech-lead-pro"
    Description string `json:"description"` // first non-heading line from frontmatter or file
    Path        string `json:"path"`        // absolute path to the .md file
    Category    string `json:"category"`    // inferred from parent directory name, e.g. "tech-lead"
}

// MemberSkillBinding records which skills are assigned to a member
type MemberSkillBinding struct {
    MemberID   string    `json:"memberId"`
    SkillNames []string  `json:"skillNames"` // list of SkillEntry.Name values
    UpdatedAt  time.Time `json:"updatedAt"`
}
```

### Skill Discovery

Skills are loaded by scanning the directory:

```
/Users/tanzhuo/goProjects/open-ai/skills/
```

**Scan rules:**
- Recursively enumerate `**/*.md` files under `skills/`
- Derive `category` from the immediate parent directory name (e.g. `skills/tech-lead/tech-lead-pro.md` → category `tech-lead`)
- Derive `name` from the YAML frontmatter `name` field if present; otherwise use the filename without extension
- Derive `description` from the YAML frontmatter `description` field if present; otherwise use the first non-empty line of the file body
- Files with `---` frontmatter that cannot be parsed are logged and skipped; they do not fail the scan
- Scan is performed at server startup and results are cached in memory; a `POST /api/v1/skills/reload` endpoint triggers a rescan

---

### API Endpoints

#### List All Skills

```
GET /api/v1/skills
```

Returns all discovered skill entries.

**Query Params:**
| Param | Type | Description |
|-------|------|-------------|
| `category` | `string` | Filter by category, e.g. `tech-lead` |

**Response `200 OK`:**
```json
{
  "skills": [
    {
      "name": "tech-lead-pro",
      "description": "Tech Lead focused on architecture decisions...",
      "path": "/Users/tanzhuo/goProjects/open-ai/skills/tech-lead/tech-lead-pro.md",
      "category": "tech-lead"
    },
    {
      "name": "golang-senior-pro",
      "description": "Senior Go engineer specializing in backend systems",
      "path": "/Users/tanzhuo/goProjects/open-ai/skills/software-engineer/golang/golang-senior-pro.md",
      "category": "golang"
    }
  ],
  "total": 2
}
```

---

#### Reload Skills Cache

```
POST /api/v1/skills/reload
```

Triggers a re-scan of the skills directory and refreshes the in-memory cache.

**Response `200 OK`:**
```json
{
  "loaded": 12,
  "skipped": 1,
  "reloadedAt": "2026-04-05T10:10:00Z"
}
```

---

#### Bind Skills to Member

```
PUT /api/v1/members/{id}/skills
```

Replaces the full skill binding for a member. Sending an empty `skillNames` array unbinds all skills.

**Path Params:** `id` — member ID

**Request Body:**
```json
{
  "skillNames": ["tech-lead-pro", "golang-senior-pro"]
}
```

**Response `200 OK`:**
```json
{
  "memberId": "member_01J...",
  "skillNames": ["tech-lead-pro", "golang-senior-pro"],
  "updatedAt": "2026-04-05T10:11:00Z"
}
```

**Errors:**
| Code | Reason |
|------|--------|
| `400` | One or more `skillNames` do not exist in the current skill cache |
| `404` | Member not found |

---

#### Get Member Skills

```
GET /api/v1/members/{id}/skills
```

**Response `200 OK`:**
```json
{
  "memberId": "member_01J...",
  "skills": [
    {
      "name": "tech-lead-pro",
      "description": "Tech Lead focused on architecture decisions...",
      "path": "/Users/tanzhuo/goProjects/open-ai/skills/tech-lead/tech-lead-pro.md",
      "category": "tech-lead"
    }
  ],
  "updatedAt": "2026-04-05T10:11:00Z"
}
```

**Errors:**
| Code | Reason |
|------|--------|
| `404` | Member not found |

---

## Part 2: Token Tracking

### Domain Model

```go
// TokenEvent is a single token usage record reported by an agent
type TokenEvent struct {
    ID           string    `json:"id"`
    MemberID     string    `json:"memberId"`
    NodeID       string    `json:"nodeId"`
    Model        string    `json:"model"`         // e.g. "claude-sonnet-4-6"
    InputTokens  int64     `json:"inputTokens"`
    OutputTokens int64     `json:"outputTokens"`
    Cost         float64   `json:"cost"`          // USD, 8 decimal places; computed server-side from model pricing table
    Timestamp    time.Time `json:"timestamp"`
}

// TokenStats is the aggregated view returned by the stats endpoint
type TokenStats struct {
    TotalInputTokens  int64   `json:"totalInputTokens"`
    TotalOutputTokens int64   `json:"totalOutputTokens"`
    TotalCost         float64 `json:"totalCost"`
    EventCount        int64   `json:"eventCount"`
    GroupBy           string  `json:"groupBy"` // "member" | "node" | "team" | "period"
    Groups            []TokenStatGroup `json:"groups"`
}

type TokenStatGroup struct {
    Key               string  `json:"key"`   // memberId, nodeId, "team", or time bucket
    InputTokens       int64   `json:"inputTokens"`
    OutputTokens      int64   `json:"outputTokens"`
    Cost              float64 `json:"cost"`
    EventCount        int64   `json:"eventCount"`
}
```

### Cost Calculation

- Cost is computed **server-side** at event ingestion time using a model pricing table
- Agents report raw token counts; the server derives `cost`
- Pricing table is configurable (loaded from config or environment at startup)
- If a model is unknown, `cost = 0` and the event is flagged with `unknownModel: true` in the response

---

### API Endpoints

#### Report Token Event

```
POST /api/v1/tokens/events
```

Agents call this after each model interaction to record usage.

**Request Body:**
```json
{
  "memberId": "member_01J...",
  "nodeId": "node_01J...",
  "model": "claude-sonnet-4-6",
  "inputTokens": 1024,
  "outputTokens": 256,
  "timestamp": "2026-04-05T10:15:00Z"
}
```

**Response `201 Created`:**
```json
{
  "id": "tok_01J...",
  "memberId": "member_01J...",
  "nodeId": "node_01J...",
  "model": "claude-sonnet-4-6",
  "inputTokens": 1024,
  "outputTokens": 256,
  "cost": 0.00432,
  "timestamp": "2026-04-05T10:15:00Z"
}
```

**Errors:**
| Code | Reason |
|------|--------|
| `400` | Missing required fields or negative token counts |
| `404` | `memberId` or `nodeId` not found |

---

#### Get Token Stats

```
GET /api/v1/tokens/stats
```

Returns aggregated token usage. All filters are optional and combinable.

**Query Params:**
| Param | Type | Description |
|-------|------|-------------|
| `memberId` | `string` | Filter by member |
| `nodeId` | `string` | Filter by node |
| `from` | `ISO8601` | Start of time range (inclusive) |
| `to` | `ISO8601` | End of time range (inclusive) |
| `groupBy` | `string` | Aggregation dimension: `member`, `node`, `team`, `period` |
| `period` | `string` | Time bucket when `groupBy=period`: `hour`, `day`, `week` |

**Response `200 OK`** (example: `groupBy=member`):
```json
{
  "totalInputTokens": 204800,
  "totalOutputTokens": 51200,
  "totalCost": 0.86400,
  "eventCount": 42,
  "groupBy": "member",
  "groups": [
    {
      "key": "member_01J...",
      "inputTokens": 102400,
      "outputTokens": 25600,
      "cost": 0.43200,
      "eventCount": 21
    }
  ]
}
```

**Errors:**
| Code | Reason |
|------|--------|
| `400` | Invalid `from`/`to` format or unknown `groupBy` value |

---

### WebSocket Event

#### `token.stats_updated`

Emitted after each accepted `POST /api/v1/tokens/events`. Pushes a lightweight aggregated snapshot to connected subscribers so the dashboard stays live without polling.

```json
{
  "name": "token.stats_updated",
  "workspaceId": "ws_123",
  "payload": {
    "memberId": "member_01J...",
    "nodeId": "node_01J...",
    "delta": {
      "inputTokens": 1024,
      "outputTokens": 256,
      "cost": 0.00432
    },
    "runningTotals": {
      "member": { "inputTokens": 102400, "outputTokens": 25600, "cost": 0.43200 },
      "node":   { "inputTokens": 204800, "outputTokens": 51200, "cost": 0.86400 },
      "team":   { "inputTokens": 409600, "outputTokens": 102400, "cost": 1.72800 }
    },
    "occurredAt": "2026-04-05T10:15:00Z"
  }
}
```

---

## Architecture Decisions

**Decision:** Cost computed server-side, not by agents.
**Reason:** Centralizes pricing logic; agents don't need to maintain pricing tables. Prevents drift if model pricing changes.
**Revisit if:** Agents need offline cost estimation before reporting.

**Decision:** `POST /api/v1/skills/reload` for cache refresh rather than file-watcher.
**Reason:** Avoids filesystem event complexity in the Go service; explicit reload is sufficient for the current use case where skills are updated by developers, not at runtime.
**Revisit if:** Skills need to be hot-reloaded frequently during multi-agent runs.

**Decision:** Token stats aggregation is computed at query time from raw events, not maintained as materialized views.
**Reason:** SQLite is the storage backend; event volume is expected to be moderate. Query-time aggregation keeps the schema simple.
**Revisit if:** Event volume exceeds ~1M rows and stats queries become slow (add indexed materialized tables then).
