# Roadmap And Project Data Persistence

## Scope

This document fixes the backend-owned persistence contract for:

- `ProjectDataDocument`
- `ConversationRoadmapDocument`
- `GlobalRoadmapDocument`

All three documents live under the `open-kraken` workspace and are written by the Go backend only.

## Common Metadata

Every persisted document carries a `meta` object with the same fields:

| Field | Type | Rules |
| --- | --- | --- |
| `workspaceId` | string | Required. Stable workspace aggregate identifier. |
| `scope` | string | Required. One of `project`, `conversation`, `global`. |
| `conversationId` | string | Required only when `scope=conversation`; empty for `project` and `global`. |
| `version` | integer | Required. Backend-owned monotonic version starting at `1`. |
| `updatedAt` | RFC3339 string | Required. UTC timestamp of the last successful write. |
| `storage` | string | Required. Last successful storage target, `workspace` or `app`. |
| `warning` | string | Optional. Last fallback warning; cleared after a later workspace write succeeds. |

## Documents

### `ProjectDataDocument`

Purpose:

- stores project-level metadata that is not chat truth
- provides the shared root for roadmap-adjacent project metadata

Fields:

- `meta`
- `projectId`
- `projectName`
- `attributes`

### `ConversationRoadmapDocument`

Purpose:

- stores roadmap state scoped to one conversation
- supports roadmap references that should not leak into global scope

Fields:

- `meta`
- `objective`
- `tasks`

### `GlobalRoadmapDocument`

Purpose:

- stores workspace-wide roadmap state
- acts as the default roadmap when no conversation override exists

Fields:

- `meta`
- `objective`
- `tasks`

## Task Ordering Rules

Each roadmap task persists:

- `id`
- `title`
- `status`
- `pinned`
- `order`

Canonical ordering is backend-defined and must be stable across write/read cycles:

1. pinned tasks before unpinned tasks
2. lower `order` before higher `order`
3. `id` ascending as the final deterministic tie-breaker

The persisted `tasks[]` array is written in canonical order and read back in the same canonical order. Clients must render the returned order directly instead of recomputing it, which prevents status edits or partial rewrites from causing visible drift.

## Workspace-First And App-Fallback

Workspace storage paths:

- project data: `<workspacePath>/.open-kraken/project-data.json`
- global roadmap: `<workspacePath>/.open-kraken/roadmaps/global.json`
- conversation roadmap: `<workspacePath>/.open-kraken/roadmaps/conversations/<conversationId>.json`

App fallback paths:

- project data: `<appDataRoot>/workspaces/<workspaceId>/project-data.json`
- global roadmap: `<appDataRoot>/workspaces/<workspaceId>/roadmaps/global.json`
- conversation roadmap: `<appDataRoot>/workspaces/<workspaceId>/roadmaps/conversations/<conversationId>.json`

Write behavior:

1. always attempt workspace storage first when `workspacePath` is writable
2. if workspace path resolution or write fails, write the same canonical document to app fallback storage
3. return `storage=app` and a non-empty `warning` that includes the workspace failure reason
4. do not mark fallback as permanent; the next write must still retry workspace first
5. if a later workspace write succeeds, persist `meta.storage=workspace` and clear `meta.warning`

Read behavior:

1. attempt workspace storage first
2. if workspace read fails or the file does not exist, try app fallback storage
3. when fallback is used because workspace access failed, surface the workspace failure through `warning`
4. when neither source exists, return `storage=none` without fabricating data

## Concurrency And Conflict Semantics

The first implementation uses two guards:

1. process-local serialization keyed by `workspaceId + scope + conversationId`
2. optimistic version checking through `expectedVersion`

Explicit non-goal in the current branch:

- cross-process concurrent writers are not supported
- two different backend processes pointing at the same workspace may both pass their local guards and race on the same files
- this branch must treat multi-process writes against the same persistence target as unsupported deployment topology, not as best-effort behavior

Write contract:

- writers may send `expectedVersion`
- the repository loads the latest stored document before writing
- if `expectedVersion` is set and does not match the stored version, the write is rejected with `ErrVersionConflict`
- rejected writes do not mutate either workspace storage or app fallback storage
- accepted writes increment the stored version exactly once

Return semantics on conflict:

- error: `ErrVersionConflict`
- no storage write occurs
- callers must re-read and re-apply intent before retrying

Operational boundary:

- local development may run multiple read-only processes against the same workspace, but only one writer process may own roadmap/project-data mutation at a time
- deployment docs, release scripts, and future health checks must continue to describe project-data writes as single-writer until a stronger coordination primitive lands
- if a second writer process is required, the rollout must be blocked until one of the replacement plans below is implemented

## Caller Constraint

Current repository and service callers must treat persistence mutation as a single-writer contract:

- browser, CLI compatibility, and automation flows may issue multiple write requests, but they must all converge into the same backend writer process
- callers must not shard roadmap/project-data writes across multiple backend processes that share the same workspace files
- `npm run test:go:projectdata` proves only package-level semantics under one writer process; it must not be cited as evidence that multi-process topology is supported
- any rollout, review, or deployment note that proposes more than one writer for the same workspace must reference either `Option A: File Lock Promotion` or `Option B: Central Coordinator Promotion` before approval

## Replacement Plan

### Option A: File Lock Promotion

Target:

- add a lock file per aggregate key beside the persisted document or under a dedicated `.open-kraken/locks` directory
- hold the OS-level lock across read-current -> version-check -> write-workspace/app-fallback

Why:

- preserves current file-backed persistence layout
- keeps the single-node deployment topology simple

Required follow-up:

- lock acquisition timeout/error contract
- lock cleanup semantics for crash recovery
- tests that prove a second process blocks or fails predictably instead of racing

### Option B: Central Coordinator Promotion

Target:

- move project-data and roadmap mutation behind one coordinator process or service endpoint
- other processes call the coordinator instead of touching files directly

Why:

- avoids cross-process file-lock portability issues
- aligns better with future multi-node or remote writer topologies

Required follow-up:

- coordinator ownership and failover semantics
- request/response error envelope for version conflicts and fallback warnings
- integration coverage that proves all mutation traffic goes through the coordinator

## Verification Entry

Repository gate for this persistence slice:

```bash
cd /Users/claire/IdeaProjects/open-kraken
npm run test:go:projectdata
```

What this gate proves today:

- workspace write success
- workspace failure with app fallback
- warning propagation
- version increment behavior
- process-local serialization plus optimistic conflict rejection

What it does not prove today:

- cross-process exclusion
- distributed coordinator correctness
