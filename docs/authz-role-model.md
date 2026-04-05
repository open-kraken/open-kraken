# open-kraken Authz And Role Model

## Scope

This document fixes the server-owned role and authorization contract for open-kraken. All new artifacts live under `/Users/claire/IdeaProjects/open-kraken`. `/Users/claire/IdeaProjects/golutra` is reference input only.

## Canonical Roles

The workspace principal role enum is fixed to:

- `owner`
- `supervisor`
- `assistant`
- `member`

No browser DTO, API payload, or realtime projection may introduce `admin` or any alternate role label as a first-class workspace role.

## Authorizer Contract

The reusable server-side authorization entrypoint is:

```go
type AuthContext struct {
    Actor          Principal
    WorkspaceID    string
    ConversationID string
    TargetMemberID string
    ResourceOwner  string
    Action         Action
}
```

Required semantics:

- `Actor` identifies the authenticated workspace principal and carries `memberId`, `workspaceId`, and `role`.
- `WorkspaceID` is the resource workspace being accessed and must match `Actor.WorkspaceID`.
- `ConversationID` is present when an action targets a conversation or realtime channel.
- `TargetMemberID` is required for role changes and any future target-sensitive member operation.
- `ResourceOwner` allows reusable checks against self-directed changes or owner-protected resources.
- `Action` is the stable action enum used by HTTP, WebSocket, terminal, roadmap, and project-data enforcement points.

## Action Matrix

| Action | owner | supervisor | assistant | member | Notes |
| --- | --- | --- | --- | --- | --- |
| `member.manage` | allow | allow | deny | deny | create/remove/invite/sync members |
| `member.role.change` | allow | allow with target limits | deny | deny | supervisor cannot change own role |
| `chat.send` | allow | allow | allow | allow | conversation membership is enforced separately |
| `roadmap.read` | allow | allow | allow | allow | workspace-scoped read |
| `roadmap.write` | allow | allow | allow | deny | write path is server-enforced |
| `projectdata.read` | allow | allow | allow | allow | workspace-scoped read |
| `projectdata.write` | allow | allow | allow | deny | mutation path is server-enforced |
| `terminal.attach` | allow | allow | allow | allow | attach still requires valid session membership |
| `terminal.dispatch` | allow | allow | deny | deny | dispatch is elevated control |
| `collaboration.command` | allow | allow | deny | deny | cross-agent instruction and orchestration |

Target-sensitive rule for `member.role.change`:

- `owner` may change any workspace member role, including supervisors and assistants.
- `supervisor` may change another member's role but may not self-promote or self-demote.
- `assistant` and `member` cannot change roles.

Global workspace rule:

- Any request where `Actor.WorkspaceID != WorkspaceID` is denied before role evaluation.

## Server Enforcement Points

The same `Authorizer` contract must be called at these boundaries:

1. HTTP handlers before member mutation, role change, roadmap write, project-data write, and terminal control routes.
2. WebSocket or realtime event ingress before accepting client-originated chat send, roadmap mutation, dispatch, or control messages.
3. Terminal dispatch orchestration before enqueueing or forwarding any dispatch command to a session.
4. Roadmap update services before applying conversation or global roadmap mutations.
5. Project-data write services before persisting workspace-scoped state changes.

Do not push these checks down into UI selectors or client-side guards as the primary control. The frontend may only consume server-derived decisions.

## Frontend Read Model Contract

The browser-facing member projection is fixed to:

```ts
type MemberReadModel = {
  memberId: string;
  workspaceId: string;
  displayName: string;
  roleType: "owner" | "supervisor" | "assistant" | "member";
  presence: "offline" | "online" | "away" | "busy";
  terminalStatus: "idle" | "attached" | "busy" | "error" | "offline";
  capabilities: CapabilityFlags;
};
```

Rules:

- `capabilities` is derived server-side from the authenticated actor and returned as a stable field. The frontend must not infer or synthesize privileges from `roleType`.
- `presence` comes from collaboration presence tracking, such as websocket heartbeat or member session liveness.
- `terminalStatus` comes from terminal/session orchestration state and reflects runtime work status, not social presence.
- UI surfaces may denormalize for presentation, but the permission source of truth remains the server-authored `capabilities`.

## Verification Target

Minimum automated coverage:

- owner and supervisor boundary differences
- assistant and member restricted actions
- cross-workspace rejection
- target-member role change restrictions
- server-derived read model capability projection
