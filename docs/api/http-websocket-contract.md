# open-kraken HTTP and WebSocket Contract

## Scope

This document freezes the browser-facing HTTP and WebSocket contract for the open-kraken migration workspace at `/Users/claire/IdeaProjects/open-kraken`.

- HTTP is the source of truth for query and command DTOs.
- WebSocket is the source of truth for live event names, handshake semantics, replay semantics, and reconnect behavior.
- Producers and consumers must reuse the exact event names and field names in this document. No aliases are allowed.

## Sync Guard Bindings

- Sync guard: `npm run verify:contract-sync`
- Runtime gate: `npm run verify:runtime`
- Release gate: `npm run verify:all`
- Health endpoint: `GET /healthz`
- Realtime contract peer: `/Users/claire/IdeaProjects/open-kraken/docs/backend/realtime-contract.md`
- Authz/runtime peer: `/Users/claire/IdeaProjects/open-kraken/docs/backend/authz-enforcement-and-go-env.md`

## Shared Error Envelope

Every HTTP 4xx and 5xx response uses one error body:

```json
{
  "error": {
    "code": "terminal_forbidden",
    "message": "member cannot dispatch to this terminal",
    "status": 403,
    "requestId": "req_01KN9B00000000000000000000",
    "retryable": false,
    "details": {
      "terminalId": "term_123",
      "requiredRole": "assistant"
    }
  }
}
```

- `error.code`: stable machine-readable error code.
- `error.message`: human-readable error summary safe for UI rendering.
- `error.status`: HTTP status code mirrored into the body.
- `error.requestId`: request trace id that also appears in server logs.
- `error.retryable`: whether the caller may retry without changing input.
- `error.details`: optional object for validation or policy context.

### Authentication And Authorization Rejections

HTTP `401`, HTTP `403`, and WebSocket `handshake.rejected` must all reuse the shared error envelope. Contracted auth-specific error codes:

- `auth.unauthorized`: token missing, expired, malformed, or rejected by the auth provider
- `auth.workspace_mismatch`: token member does not belong to the requested workspace
- `auth.forbidden_scope`: caller is authenticated but requested a conversation, terminal, or subscription scope outside its readable boundary
- `auth.capability_denied`: caller lacks the required capability for the target mutation

Auth rejection example:

```json
{
  "error": {
    "code": "auth.capability_denied",
    "message": "member cannot dispatch to this terminal",
    "status": 403,
    "requestId": "req_01KN9B00000000000000000002",
    "retryable": false,
    "details": {
      "workspaceId": "ws_123",
      "memberId": "member_member",
      "requiredCapability": "terminal.dispatch"
    }
  }
}
```

### Common Failure Shapes

- `400` invalid request body, invalid query, invalid cursor, malformed ids.
- `401` missing or invalid authentication.
- `403` caller authenticated but not allowed by role or workspace scope.
- `404` workspace, conversation, roadmap, project data, or terminal not found.
- `409` optimistic concurrency conflict or stale write version.
- `422` semantically invalid command, for example dispatch target not attachable.
- `429` rate limited or reconnect backoff enforced.
- `500` internal server error.
- `503` dependency unavailable or replay window temporarily unavailable.

## Shared Status And Persistence Semantics

### Message Status Enum

The message status enum is fixed to:

- `pending`: message truth is persisted, but downstream delivery or side effects may still be settling
- `sent`: message truth is persisted and the server accepted the downstream delivery path for the current workflow
- `failed`: message truth is persisted, but the downstream delivery path or attached side effect failed

No HTTP DTO, OpenAPI schema, browser helper, or WebSocket payload may use `sending`, `queued`, `delivered`, or any other parallel enum for the same persisted message status field.

Reconnect rule:

- message history reloads and `chat.message.created` replay must surface the latest persisted `status`
- reconnect may repeat a status observation, but must not invent a second enum or regress ordering semantics

### Persistence Outcome Shape

Roadmap and project-data responses share one persistence outcome object:

```json
{
  "persistence": {
    "storage": "app",
    "warning": "workspace write failed: permission denied",
    "error": null
  }
}
```

- `storage`: `workspace`, `app`, or `none`
- `warning`: non-blocking fallback or degraded-read warning; empty or null when no warning exists
- `error`: optional embedded shared error body when the caller needs structured last-failure context while still receiving a usable document

Persistence warnings stay informational. If the backend cannot produce a usable document or accepted write result, the request fails with the shared error envelope instead of downgrading the failure into `persistence.warning`.

### Recovery Strategy Shape

Terminal HTTP responses and WebSocket handshake acceptance share one recovery strategy object:

```json
{
  "recovery": {
    "mode": "replay",
    "lastAckCursor": "rt_00000000000000000042",
    "resyncRequired": false,
    "terminalReplay": "delta_after_snapshot",
    "dedupeKey": "cursor_then_terminal_seq"
  }
}
```

- `mode`: `snapshot`, `replay`, or `snapshot_resync`
- `lastAckCursor`: last durable cursor acknowledged by the client, if any
- `resyncRequired`: whether the caller must discard incremental assumptions and rebuild from snapshots
- `terminalReplay`: `none`, `snapshot_only`, or `delta_after_snapshot`
- `dedupeKey`: fixed to `cursor_then_terminal_seq`; browser clients must ignore events older than the last accepted cursor and ignore terminal deltas where `seq <= lastAppliedSeq`

## HTTP Contract

### GET `/api/v1/namespaces`

Lists namespace registry entries. All authenticated roles may list and view
namespaces.

Query parameters:

- `status`: `active`, `archived`, or `all`; default `all`.
- `q`: optional case-insensitive substring search against `name` and `description`.

Success body:

```json
{
  "items": [
    {
      "id": "ns_01jexample",
      "name": "Open Kraken",
      "slug": "open-kraken",
      "description": "Primary namespace",
      "status": "active",
      "team_count": 4,
      "member_count": 12,
      "created_at": "2026-04-29T00:00:00Z",
      "updated_at": "2026-04-29T00:00:00Z"
    }
  ],
  "total": 1
}
```

Failure bodies:

- `400`, `401`, `403`, `500` use the shared error envelope.

### POST `/api/v1/namespaces`

Creates an active namespace. Allowed roles: `owner`, `supervisor`.

Request body:

```json
{ "name": "Open Kraken", "description": "Primary namespace" }
```

Success: `201 Created` with a single namespace object. The server derives a
unique immutable `slug` from `name`. Validation errors use `400`; duplicate
case-insensitive names use `409`.

### GET `/api/v1/namespaces/{id}`

Returns a single namespace object. All authenticated roles may view.

Failure bodies:

- `401`, `403`, `404`, `500` use the shared error envelope.

### PUT `/api/v1/namespaces/{id}`

Updates namespace `name` and `description`. Allowed roles: `owner`,
`supervisor`. `slug` is immutable; if the caller supplies a changed slug, the
server returns `400` with message `slug cannot be changed`.

Success: `200 OK` with the updated namespace object. Duplicate
case-insensitive names use `409`.

### POST `/api/v1/namespaces/{id}/archive`

Archives an active namespace. Allowed role: `owner`.

Success: `200 OK` with the updated namespace object. Archiving an already
archived namespace returns `409`.

### POST `/api/v1/namespaces/{id}/restore`

Restores an archived namespace. Allowed role: `owner`.

Success: `200 OK` with the updated namespace object. Restoring an already
active namespace returns `409`.

### GET `/api/workspaces/{workspaceId}/chat/home`

Returns the chat landing read model for the active workspace.

Success body:

```json
{
  "workspace": {
    "id": "ws_123",
    "name": "open-kraken",
    "rootPath": "/Users/claire/IdeaProjects/open-kraken",
    "readOnly": false
  },
  "conversations": [
    {
      "id": "conv_general",
      "type": "channel",
      "memberIds": ["member_owner", "member_assistant"],
      "customName": "General",
      "pinned": true,
      "muted": false,
      "lastMessageAt": 1775172000,
      "lastMessagePreview": "terminal attached",
      "isDefault": true,
      "unreadCount": 3
    }
  ],
  "members": [
    {
      "workspaceId": "ws_123",
      "memberId": "member_assistant",
      "displayName": "Assistant",
      "avatar": "assistant.png",
      "roleType": "assistant",
      "manualStatus": "online",
      "terminalStatus": "working"
    }
  ],
  "defaultConversationId": "conv_general",
  "totalUnreadCount": 3
}
```

Failure bodies:

- `401`, `403`, `404`, `500` use the shared error envelope.

### GET `/api/workspaces/{workspaceId}/conversations/{conversationId}/messages`

Returns ordered paged messages for a conversation.

Query parameters:

- `before`: optional opaque message id cursor.
- `limit`: optional page size, default `50`, max `200`.

Success body:

```json
{
  "conversationId": "conv_general",
  "items": [
    {
      "id": "msg_123",
      "senderId": "member_owner",
      "content": {
        "type": "text",
        "text": "ship it"
      },
      "createdAt": 1775172000,
      "isAi": false,
      "status": "pending"
    }
  ],
  "nextBefore": "msg_099"
}
```

Failure bodies:

- `400`, `401`, `403`, `404`, `500` use the shared error envelope.

### POST `/api/workspaces/{workspaceId}/conversations/{conversationId}/messages`

Creates a message and returns the persisted message.

Request body:

```json
{
  "clientMessageId": "client_msg_123",
  "content": {
    "type": "text",
    "text": "open terminal"
  },
  "attachment": {
    "type": "roadmap",
    "title": "Roadmap item",
    "roadmapId": "roadmap_main",
    "taskId": "task_1"
  }
}
```

Success body:

```json
{
  "message": {
    "id": "msg_124",
    "senderId": "member_owner",
    "content": {
      "type": "text",
      "text": "open terminal"
    },
    "createdAt": 1775172001,
    "isAi": false,
    "status": "sent"
  }
}
```

Failure bodies:

- `400`, `401`, `403`, `404`, `409`, `422`, `500` use the shared error envelope.

### GET `/api/workspaces/{workspaceId}/members`

Returns the member roster read model used by chat, terminal, and collaboration views.

Success body:

```json
{
  "members": [
    {
      "workspaceId": "ws_123",
      "memberId": "member_owner",
      "displayName": "Owner",
      "avatar": "owner.png",
      "roleType": "owner",
      "manualStatus": "online",
      "terminalStatus": "online"
    }
  ]
}
```

Failure bodies:

- `401`, `403`, `404`, `500` use the shared error envelope.

### GET `/api/workspaces/{workspaceId}/roles/matrix`

Returns the server-enforced role capability read model.

Success body:

```json
{
  "workspaceId": "ws_123",
  "roles": [
    {
      "roleType": "owner",
      "capabilities": [
        "chat.read",
        "chat.write",
        "members.manage",
        "roadmap.write",
        "projectData.write",
        "terminal.dispatch"
      ]
    }
  ]
}
```

Failure bodies:

- `401`, `403`, `404`, `500` use the shared error envelope.

### GET `/api/v1/skills`

Returns the filesystem-backed skill catalog.

Success body:

```json
{
  "items": [
    {
      "name": "code-review",
      "description": "Reviews code for quality",
      "path": "/skills/code-review.md",
      "category": "qa",
      "contentSummary": "Review the code and provide feedback."
    }
  ]
}
```

### POST `/api/v1/skills/reload`

Rescans the filesystem-backed skill catalog. The current loader is not cache-backed, so this endpoint returns the count visible after a rescan.

Success body:

```json
{
  "loaded": 12,
  "skipped": 0,
  "reloadedAt": "2026-04-03T16:05:00Z"
}
```

### GET/PUT `/api/v1/members/{memberId}/skills`

`GET` returns the member's assigned skills. `PUT` replaces the full assignment list using skill names:

```json
{
  "skills": ["code-review", "react-ui"]
}
```

An empty `skills` array is valid and clears the member's assignments. Non-empty assignment remains restricted to AI Assistant members.

Success body:

```json
{
  "memberId": "assistant_1",
  "skills": []
}
```

### POST `/api/v1/tokens/events`

Records a token usage event.

Request body:

```json
{
  "memberId": "assistant_1",
  "nodeId": "node_1",
  "model": "gpt-5",
  "inputTokens": 1200,
  "outputTokens": 400,
  "cost": 0.05
}
```

Success body mirrors the recorded event and adds `id` and `timestamp`.

### GET `/api/v1/tokens/stats`

Returns aggregate token usage:

```json
{
  "scope": "all",
  "inputTokens": 1200,
  "outputTokens": 400,
  "totalTokens": 1600,
  "totalCost": 0.05,
  "eventCount": 1
}
```

### GET `/api/v1/tokens/activity`

Returns recent token usage events:

```json
{
  "items": [],
  "total": 0
}
```

### GET `/api/workspaces/{workspaceId}/roadmap`

Returns the canonical roadmap document and version.

Success body:

```json
{
  "workspaceId": "ws_123",
  "version": 7,
  "persistence": {
    "storage": "workspace",
    "warning": null,
    "error": null
  },
  "roadmap": {
    "objective": "Migrate to Go and React",
    "tasks": [
      {
        "id": "task_1",
        "title": "Freeze API contracts",
        "status": "in_progress",
        "assigneeId": "member_assistant"
      }
    ]
  }
}
```

Failure bodies:

- `401`, `403`, `404`, `500` use the shared error envelope.

### PUT `/api/workspaces/{workspaceId}/roadmap`

Replaces the roadmap document using optimistic concurrency.

Request body:

```json
{
  "expectedVersion": 7,
  "roadmap": {
    "objective": "Migrate to Go and React",
    "tasks": [
      {
        "id": "task_1",
        "title": "Freeze API contracts",
        "status": "done",
        "assigneeId": "member_assistant"
      }
    ]
  }
}
```

Success body:

```json
{
  "workspaceId": "ws_123",
  "version": 8,
  "persistence": {
    "storage": "app",
    "warning": "workspace write failed: permission denied",
    "error": null
  },
  "roadmap": {
    "objective": "Migrate to Go and React",
    "tasks": [
      {
        "id": "task_1",
        "title": "Freeze API contracts",
        "status": "done",
        "assigneeId": "member_assistant"
      }
    ]
  }
}
```

Failure bodies:

- `400`, `401`, `403`, `404`, `409`, `500` use the shared error envelope.

### GET `/api/workspaces/{workspaceId}/project-data`

Returns canonical project data including roadmap-adjacent metadata.

Success body:

```json
{
  "workspaceId": "ws_123",
  "projectId": "project_open_kraken",
  "projectName": "open-kraken",
  "description": "Go and React migration workspace",
  "updatedAt": "2026-04-03T16:00:00Z",
  "persistence": {
    "storage": "workspace",
    "warning": null,
    "error": null
  },
  "roadmap": {
    "objective": "Migrate to Go and React",
    "tasks": []
  }
}
```

Failure bodies:

- `401`, `403`, `404`, `500` use the shared error envelope.

### PUT `/api/workspaces/{workspaceId}/project-data`

Updates project metadata and roadmap-adjacent document state.

Request body:

```json
{
  "expectedVersion": 12,
  "projectName": "open-kraken",
  "description": "Go and React migration workspace",
  "roadmap": {
    "objective": "Migrate to Go and React",
    "tasks": []
  }
}
```

Success body:

```json
{
  "workspaceId": "ws_123",
  "projectId": "project_open_kraken",
  "projectName": "open-kraken",
  "description": "Go and React migration workspace",
  "version": 13,
  "updatedAt": "2026-04-03T16:05:00Z",
  "persistence": {
    "storage": "app",
    "warning": "workspace write failed: permission denied",
    "error": null
  },
  "roadmap": {
    "objective": "Migrate to Go and React",
    "tasks": []
  }
}
```

Failure bodies:

- `400`, `401`, `403`, `404`, `409`, `500` use the shared error envelope.

### GET `/api/workspaces/{workspaceId}/terminals`

Returns terminal session summaries for the workspace.

Success body:

```json
{
  "items": [
    {
      "terminalId": "term_123",
      "memberId": "member_assistant",
      "workspaceId": "ws_123",
      "terminalType": "member",
      "command": "bash",
      "status": "online",
      "seq": 21,
      "unackedBytes": 0,
      "keepAlive": true,
      "recovery": {
        "mode": "replay",
        "lastAckCursor": "rt_00000000000000000042",
        "resyncRequired": false,
        "terminalReplay": "delta_after_snapshot",
        "dedupeKey": "cursor_then_terminal_seq"
      },
      "createdAt": "2026-04-03T16:00:00Z",
      "updatedAt": "2026-04-03T16:05:00Z",
      "snapshot": {
        "terminalId": "term_123",
        "seq": 21,
        "buffer": {
          "data": "$ ",
          "rows": 24,
          "cols": 80,
          "cursorRow": 0,
          "cursorCol": 2
        }
      }
    }
  ]
}
```

Failure bodies:

- `401`, `403`, `404`, `500` use the shared error envelope.

### POST `/api/workspaces/{workspaceId}/terminals`

Creates or reuses a terminal session for a member or workflow target.

Request body:

```json
{
  "memberId": "member_assistant",
  "terminalType": "member",
  "command": "bash",
  "cols": 80,
  "rows": 24,
  "keepAlive": true
}
```

Success body:

```json
{
  "session": {
    "terminalId": "term_123",
    "memberId": "member_assistant",
    "workspaceId": "ws_123",
    "terminalType": "member",
    "command": "bash",
    "status": "starting",
    "seq": 0,
    "unackedBytes": 0,
    "keepAlive": true,
    "recovery": {
      "mode": "snapshot",
      "lastAckCursor": null,
      "resyncRequired": false,
      "terminalReplay": "snapshot_only",
      "dedupeKey": "cursor_then_terminal_seq"
    },
    "createdAt": "2026-04-03T16:00:00Z",
    "updatedAt": "2026-04-03T16:00:00Z",
    "snapshot": {
      "terminalId": "term_123",
      "seq": 0,
      "buffer": {
        "data": "",
        "rows": 24,
        "cols": 80,
        "cursorRow": 0,
        "cursorCol": 0
      }
    }
  }
}
```

Failure bodies:

- `400`, `401`, `403`, `404`, `409`, `422`, `500`, `503` use the shared error envelope.

### POST `/api/workspaces/{workspaceId}/terminals/{terminalId}/dispatch`

Dispatches user input or structured command text into the terminal lane.

Request body:

```json
{
  "data": "@assistant summarize latest build failures",
  "context": {
    "conversationId": "conv_general",
    "conversationType": "channel",
    "senderId": "member_owner",
    "senderName": "Owner",
    "messageId": "msg_124",
    "clientTraceId": "trace_001",
    "timestamp": 1775172001
  }
}
```

Success body:

```json
{
  "accepted": true,
  "terminalId": "term_123",
  "queuedAt": "2026-04-03T16:06:00Z",
  "messageStatus": "pending"
}
```

Failure bodies:

- `400`, `401`, `403`, `404`, `409`, `422`, `500`, `503` use the shared error envelope.

## WebSocket Contract

### Endpoint

- `GET /api/ws`

The WebSocket channel multiplexes chat, member presence, roadmap, and terminal updates for one workspace-scoped browser session.

### Handshake

Client request requirements:

- `Authorization: Bearer <token>` header is required.
- `workspaceId` query parameter is required.
- `memberId` query parameter is required.
- `subscriptions` query parameter is an optional comma-separated scope list. Supported values are `chat`, `members`, `roadmap`, and `terminal`.
- `cursor` query parameter is optional last acked event cursor.
- `terminalId` query parameter may be repeated to narrow terminal session subscriptions.
- `conversationId` query parameter may be repeated to narrow chat subscriptions.

Example:

```text
GET /api/ws?workspaceId=ws_123&memberId=member_owner&subscriptions=chat,members,roadmap,terminal&conversationId=conv_general&terminalId=term_123&cursor=rt_00000000000000000042
Authorization: Bearer eyJ...
```

Handshake success frame:

```json
{
  "type": "handshake.accepted",
  "workspaceId": "ws_123",
  "memberId": "member_owner",
  "subscriptionScope": {
    "chat": ["conv_general"],
    "members": true,
    "roadmap": true,
    "terminal": ["term_123"]
  },
  "mode": "replay",
  "cursor": "rt_00000000000000000042",
  "replayFromCursor": "rt_00000000000000000042",
  "resyncRequired": false,
  "recovery": {
    "mode": "replay",
    "lastAckCursor": "rt_00000000000000000042",
    "resyncRequired": false,
    "terminalReplay": "delta_after_snapshot",
    "dedupeKey": "cursor_then_terminal_seq"
  },
  "heartbeatIntervalMs": 15000
}
```

### Authentication and Subscription Rules

- The bearer token must resolve to the same workspace membership as `workspaceId` and `memberId`.
- The server must apply role-based filtering before accepting requested scopes.
- Unknown `subscriptions` values are rejected during the handshake instead of being ignored.
- `subscriptions=members` grants member roster and presence updates only, not terminal control.
- `terminalId` filters only apply when the `terminal` subscription family is enabled.
- `conversationId` filters only apply when the `chat` subscription family is enabled.
- Client-originated `terminal.attach` frames are rejected unless the `terminal` subscription family is enabled.
- If explicit `terminalId` filters were accepted, a later `terminal.attach` frame must target one of those terminal IDs.
- Terminal events may be filtered to explicit `terminalId` values when the caller lacks workspace-wide terminal read.
- Chat events may be filtered to explicit `conversationId` values when the caller lacks workspace-wide chat read.
- Missing scope filters imply all readable resources within the requested subscription families.

### Reconnect and Replay Rules

- `cursor` must be the last acked cursor, not the last merely received cursor.
- If `cursor` is omitted, the server responds in `snapshot` mode.
- If `cursor` is still inside the replay window, the server responds in `replay` mode.
- If `cursor` is older than the replay window, the server responds in `snapshot` mode with `resyncRequired=true`.
- The client must treat `resyncRequired=true` as a full replacement signal and discard cached incremental assumptions.
- Terminal views must rehydrate from `terminal.snapshot` before applying later `terminal.delta` frames.
- Browser dedupe is fixed to `cursor_then_terminal_seq`: reject frames with cursor older than the last accepted cursor, and for one terminal reject deltas with `seq <= lastAppliedSeq`.

### Server Rejection Conditions

The server rejects the handshake before live frames when:

- the token is missing, expired, or invalid
- `workspaceId` or `memberId` is missing or malformed
- the token principal does not match the requested `workspaceId` and `memberId`
- `subscriptions` contains an unsupported family name
- requested scopes exceed the caller's readable authorization boundary
- a `conversationId` or `terminalId` is not inside the caller's visible scope
- `cursor` is malformed or points beyond the current cursor head
- the workspace is unavailable or realtime service capacity is exhausted

Handshake rejection body:

```json
{
  "type": "handshake.rejected",
  "error": {
    "code": "realtime_forbidden_scope",
    "message": "terminal subscription is outside the caller scope",
    "status": 403,
    "requestId": "req_01KN9B00000000000000000001",
    "retryable": false,
    "details": {
      "workspaceId": "ws_123",
      "memberId": "member_member",
      "subscription": "terminal",
      "terminalId": "term_999",
      "requiredCapability": "terminal.read"
    }
  }
}
```

## Event Envelope

Every live frame after handshake uses one envelope:

```json
{
  "cursor": "rt_00000000000000000043",
  "name": "chat.snapshot",
  "workspaceId": "ws_123",
  "conversationId": "conv_general",
  "memberId": "member_owner",
  "terminalId": "term_123",
  "occurredAt": "2026-04-03T16:06:01Z",
  "payload": {}
}
```

- `cursor`: monotonic server-issued event cursor.
- `name`: exact event name from the canonical list below.
- `workspaceId`: required on every event.
- `conversationId`: present for chat events.
- `memberId`: present for member presence events and member-scoped terminal updates.
- `terminalId`: present for terminal events.
- `occurredAt`: RFC3339 timestamp in UTC.
- `payload`: event-specific object.

## Canonical Event Names and Payloads

### `chat.snapshot`

Representative payload fields:

- `conversationId`
- `messageIds`

### `chat.delta`

Representative payload fields:

- `conversationId`
- `messageId`
- `sequence`
- `body`

### `chat.status`

Representative payload fields:

- `conversationId`
- `messageId`
- `status`

### `presence.snapshot`

Representative payload fields:

- `members[].memberId`
- `members[].presenceState`
- `members[].terminalStatus`
- `members[].lastHeartbeat`

Presence rule:

- `presence.updated` is member availability and heartbeat freshness only. It must not replace terminal session lifecycle truth.

### `presence.updated`

Representative payload fields:

- `memberId`
- `presenceState`
- `sentAt`

### `roadmap.updated`

Representative payload fields:

- `version`
- `workspaceId`
- `reason`

### `roadmap.snapshot`

Representative payload fields:

- `workspaceId`
- `itemIds`
- `version`

### `terminal.attach`

Representative payload fields:

- `terminalId`
- `connectionState`
- `processState`

### `terminal.snapshot`

Representative payload fields:

- `terminalId`
- `connectionState`
- `processState`
- `rows`
- `cols`
- `buffer`

### `terminal.delta`

Representative payload fields:

- `terminalId`
- `sequence`
- `data`

### `terminal.status`

Representative payload fields:

- `terminalId`
- `connectionState`
- `processState`
- `reason`

## WebSocket Runtime Notes

- The server may emit `chat.snapshot`, `chat.delta`, `chat.status`, `presence.snapshot`, `presence.updated`, `roadmap.snapshot`, `roadmap.updated`, `terminal.attach`, `terminal.snapshot`, `terminal.delta`, and `terminal.status` in the same connection when the subscription scope permits it.
- Event names above must match backend constants and browser subscription routing exactly.
- Terminal stream replay must resume from `terminal.snapshot` plus subsequent `terminal.delta` frames.
- If the service restarts without persisted replay state, any non-empty cursor is treated as out-of-window and the handshake returns `snapshot` mode with `resyncRequired=true`.
- Terminal status changes must not be encoded as `presence.updated`; presence and terminal lifecycles stay distinct.
