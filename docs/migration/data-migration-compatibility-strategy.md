# open-kraken Data Migration Compatibility Strategy

## 1. Scope

This document fixes the compatibility contract for importing legacy Golutra workspace data into open-kraken.

- Legacy sources are read-only inputs.
- open-kraken becomes the sole post-import source of truth.
- The strategy covers workspace project data, chat data, roadmap data, member roster data, and explicit non-migrated runtime state.

## 2. Source Compatibility

open-kraken import reads only the source classes listed below:

- `<legacyWorkspacePath>/.golutra/workspace.json`
- `<legacyAppData>/<workspaceId>/project.json`
- `<legacyChatBaseDir>/<workspaceId>/chat.redb`

Read order:

1. resolve workspace project data from workspace file first
2. fall back to app project data only when workspace data is absent or unreadable
3. load `chat.redb` only for durable chat/conversation/message data
4. ignore memory-only runtime state even if a legacy process is still running

Trust rules:

- Project document sources are compatibility inputs, not canonical truth, until normalized into open-kraken contracts.
- `chat.redb` is the canonical legacy source for message history.
- Runtime session bindings, retry queues, and caches are never promoted to canonical truth.

## 3. Import Contracts

### 3.1 `WorkspaceImportSource`

Represents the resolved legacy workspace import root.

Required fields:

- `legacyWorkspacePath`
- `legacyWorkspaceId`
- `workspaceProjectSource`: `workspace` | `app` | `none`
- `chatSourcePath`
- `snapshotTakenAt`
- `trustSummary`

### 3.2 `ConversationImportBatch`

Represents one normalized conversation payload imported from `chat.redb`.

Required fields:

- `legacyConversationId`
- `canonicalConversationId`
- `kind`
- `memberAliases`
- `messages`
- `settings`
- `warnings`

### 3.3 `ProjectDataImportSnapshot`

Represents normalized workspace metadata before open-kraken persistence.

Required fields:

- `legacyWorkspaceId`
- `canonicalWorkspaceId`
- `projectData`
- `members`
- `globalRoadmap`
- `source`
- `warnings`

### 3.4 `ImportWarning`

Non-blocking diagnostic raised during import normalization.

Required fields:

- `code`
- `entityType`
- `legacyId`
- `message`
- `action`

Rule:

- `ImportWarning` does not block overall migration by itself.
- If a condition must block migration, the importer must emit a `failed` result instead of downgrading the issue to warning.

### 3.5 `ImportReport`

Final import outcome for one workspace.

Required fields:

- `workspaceId`
- `status`
- `importedCounts`
- `skippedCounts`
- `warnings`
- `failures`
- `rollbackToken`

`status` is required and must be one of:

- `success`: all required durable sources imported; only optional sources may be absent
- `partial`: at least one durable source imported, but some optional or per-record data was skipped
- `skipped`: import intentionally not executed because no migratable source was found or policy rejected it before write
- `failed`: import could not establish a safe canonical result and must not be considered applied

## 4. ID Mapping Strategy

### 4.1 Mapping Policy

open-kraken keeps legacy IDs when they remain valid, unique, and stable inside the new workspace scope. Otherwise it rewrites the canonical ID and persists a legacy alias map.

### 4.2 Entity Rules

| Entity | Preserve | Rewrite | Alias Key | Conflict Handling |
| --- | --- | --- | --- | --- |
| Workspace | Preserve legacy workspace ID if non-empty and not already bound to another open-kraken workspace | Rewrite when empty, malformed for open-kraken policy, or colliding with an existing canonical workspace | `legacyWorkspaceId` | New canonical workspace ID is generated; report includes warning and alias. |
| Member | Preserve legacy member ID when unique in workspace scope | Rewrite when duplicated, malformed, or reserved for a different canonical member | `legacyMemberId` | Duplicate member rows prefer first valid persistent identity; later duplicates get rewritten or skipped if identity is unrecoverable. |
| Conversation | Preserve `chat.redb` conversation ID when unique | Rewrite on collision or invalid ID | `legacyConversationId` | Rewritten conversation ID is stored in alias map before importing messages. |
| Message | Preserve message ID when unique inside canonical conversation | Rewrite on collision, orphaned conversation remap, or invalid format | `(legacyConversationId, legacyMessageId)` | Message alias is created before attachments and status metadata import. |
| Roadmap item | Preserve explicit item `id` when unique in its roadmap scope | Generate deterministic ID when missing or duplicated | `(roadmapScope, legacyItemIdOrOrdinal)` | Duplicate IDs are rewritten deterministically and reported as warning. |

### 4.3 Deterministic Rewrite Rules

When rewrite is required:

1. workspace IDs use a new backend-generated canonical ID
2. member IDs use a new backend-generated canonical ID scoped to the imported workspace
3. conversation IDs use a new backend-generated canonical ID
4. message IDs use a new backend-generated canonical ID after conversation remap
5. roadmap items use deterministic IDs derived from `scope + ordinal + normalized title` when no trusted unique legacy ID exists

Alias persistence rule:

- open-kraken stores legacy-to-canonical aliases so imported references, diagnostics, and future re-import tooling can trace origin without reusing invalid runtime identifiers as primary keys.

## 5. Skip Items

### 5.1 Explicitly Non-Migrated

| Data Class | Reason | User-Visible Impact |
| --- | --- | --- |
| `terminal_session_map` / `terminal_session_index` | Session IDs point to dead runtime processes and cannot be safely replayed in the new backend. | Existing terminal tabs do not auto-reattach; users start fresh sessions. |
| `chat_outbox_tasks` / `chat_outbox_schedule` | Pending retry state could re-dispatch stale prompts or commands after migration. | Messages remain visible, but in-flight terminal delivery is not resumed. |
| In-memory terminal session lifecycle state | It has no durable compatibility guarantee and cannot survive process replacement. | Long-running legacy terminal jobs are not carried over. |
| Browser cache, notification cache, tray state | They are derived UX caches, not collaborative truth. | UI selection, unread badge cache, and local view affordances reset. |

### 5.2 Skip Policy

- Skip items produce `ImportWarning` entries only when their absence matters to user expectations.
- Skip items never upgrade to `failed` unless a caller incorrectly declared them as required input.

## 6. Migration Flow

1. Snapshot legacy source files and record `WorkspaceImportSource`.
2. Resolve project document source using workspace-first, app-fallback semantics.
3. Normalize members, project metadata, and roadmap into `ProjectDataImportSnapshot`.
4. Open `chat.redb`, import conversations and messages into `ConversationImportBatch` units.
5. Apply ID alias maps before importing dependent records.
6. Persist canonical open-kraken workspace data.
7. Emit `ImportReport` with `success`, `partial`, `skipped`, or `failed`.

### 6.1 Trigger Conditions

Run the import path only when one of the following is true:

- a workspace is being migrated from legacy Golutra into a new open-kraken root
- fixture/contract work changes the expected importable source shape and the migration guard must be re-checked
- rollback recovery requires re-import from the same recorded snapshot

Do not run import as a generic startup side effect for normal backend boot.

### 6.2 Execution Path

Current execution path is fixed to:

1. snapshot the legacy inputs from Section 2
2. run `bash /Users/claire/IdeaProjects/open-kraken/scripts/bootstrap-migration.sh --check`
3. review `docs/mock-and-fixture.md` and the import contract sections if fixture or event vocabulary changed
4. execute importer implementation against the frozen contracts
5. if write fails, classify into `failed`, `partial`, or `skipped` and follow rollback rules before retry

Current validation entrypoints:

- `bash /Users/claire/IdeaProjects/open-kraken/scripts/bootstrap-migration.sh --check`
- `bash /Users/claire/IdeaProjects/open-kraken/scripts/bootstrap-migration.sh --verify-result <target-workspace-path>`
- `bash /Users/claire/IdeaProjects/open-kraken/scripts/verify-all.sh`
- `cd /Users/claire/IdeaProjects/open-kraken && npm run test:go:importer`

Minimum pass condition before an import attempt is considered ready:

- bootstrap check passes
- fixture/contract sync guard passes
- migration docs still expose source inventory, import contracts, skip policy, and rollback boundary

### 6.3 Importer Boundary And Repository Hookup

Current importer boundary is intentionally narrow and must plug into existing backend-owned repositories instead of inventing a second persistence path.

Importer write surfaces that are allowed:

- project metadata, global roadmap, and conversation roadmap through `/Users/claire/IdeaProjects/open-kraken/backend/go/internal/projectdata.Repository`
- authorization-enforced write calls through `/Users/claire/IdeaProjects/open-kraken/backend/go/internal/projectdata.GuardedService` when the importer runs inside a backend command path
- legacy alias and import-report persistence only as import metadata beside the staged open-kraken workspace target

Importer write surfaces that are not allowed:

- direct writes back into legacy Golutra workspace or app data
- page-local mock stores as the primary migration destination
- bypassing `projectdata.Repository` for roadmap/project-data truth
- replaying runtime-only state into terminal/session/outbox repositories

Current required hookup order:

1. resolve and snapshot legacy inputs
2. normalize IDs and produce alias maps in memory
3. write canonical project data and roadmap documents through the backend repository/service boundary
4. persist import metadata for alias maps and import report beside the staged open-kraken target
5. only then classify the attempt as `success`, `partial`, `skipped`, or `failed`

Required import metadata artifacts:

- `ImportReport`
- workspace/member/conversation/message/roadmap alias maps
- a snapshot manifest that records which legacy files were used

Until a dedicated importer package exists, this document is the binding source for where importer code may write.

Current code-side importer preflight package:

- `/Users/claire/IdeaProjects/open-kraken/backend/go/internal/migration/importer`

Current code-side guard scope:

- frozen importer structs for `WorkspaceImportSource`, `ConversationImportBatch`, `ProjectDataImportSnapshot`, `ImportWarning`, `ImportReport`, and `rollbackToken`
- read-only `chat.redb` discovery and classification (`ready`, `missing`, `corrupt`, `read_failed`)
- alias metadata staging hook
- staged rollback token generation and consume boundary

### 6.4 Legacy `chat.redb` Discovery

Legacy chat DB discovery is fixed to repository-owned inputs, not ad hoc shell lookups.

Discovery order:

1. explicit operator-provided snapshot path for the target workspace
2. canonical legacy base directory recorded in the snapshot manifest
3. resolved `<legacyChatBaseDir>/<workspaceId>/chat.redb` path recorded by the bootstrap step

Discovery rules:

- importer code must treat the discovered `chat.redb` path as read-only
- if discovery produces more than one candidate file, the operator must choose one snapshot source before import continues
- if no `chat.redb` exists, chat import may downgrade to `partial` or `skipped` according to policy, but project data import may still proceed
- discovery results must be written into `WorkspaceImportSource.chatSourcePath` and the final `ImportReport`

## 7. Warning, Failure, And Result Semantics

### 7.1 Warning Semantics

Warnings are non-blocking and capture recoverable degradation such as:

- app fallback used because workspace project file was unreadable
- duplicate roadmap item ID rewritten
- one malformed message skipped while the rest of the conversation imported

### 7.2 Failure Semantics

Use `failed` when:

- no trustworthy project source can be normalized for a required workspace import
- chat data required by policy cannot be opened or decoded safely
- canonical persistence fails after normalization
- ID conflicts cannot be resolved deterministically

### 7.3 Partial Import Semantics

Use `partial` when:

- workspace metadata imported, but some optional per-record chat or roadmap items were skipped
- chat history imported, but non-critical settings or malformed attachments were dropped

### 7.4 Skipped Semantics

Use `skipped` when:

- no migratable durable source exists for the requested workspace
- policy rejects the import before any open-kraken write occurs

## 8. Risks And Rollback

### 8.1 Risks

- Workspace file and app fallback may disagree on roster or roadmap truth.
- Legacy `redb` decoding may fail selectively across tables.
- Duplicate or malformed legacy IDs may force wider alias rewriting than expected.
- Users may expect live terminal continuity even though runtime state is intentionally excluded.

### 8.2 Rollback

Rollback contract:

1. open-kraken never writes back into legacy Golutra storage.
2. Import writes are staged under open-kraken-owned workspace storage only after normalization succeeds.
3. If `ImportReport.status=failed`, discard the staged open-kraken import result and keep the legacy snapshot untouched.
4. Re-import is allowed from the same snapshot because alias maps and warnings are reproducible migration artifacts, not source mutations.

### 8.3 Rollback Boundary Rules

The rollback boundary is intentionally narrow and must be treated as an operator-visible step:

- Rollback may remove or quarantine only the open-kraken-owned staged or newly imported artifacts created by the failing import attempt.
- Rollback must not try to revive legacy runtime state such as live terminal sessions, outbox retries, or in-memory orchestration queues.
- Rollback must not mutate, compact, or clean up legacy Golutra sources.
- Rollback must preserve the import report, alias maps, and warnings needed to explain what was attempted.

Current operator sequence:

1. retain the `ImportReport`, including `rollbackToken`
2. identify the open-kraken-owned workspace artifacts created by that import attempt
3. remove or quarantine only those open-kraken artifacts
4. leave legacy inputs untouched
5. rerun import from the recorded snapshot only after the blocking issue is fixed

Blocking vs non-blocking boundary:

- `failed` means rollback is mandatory before the result can be treated as absent
- `partial` means rollback is optional and policy-driven; imported durable truth remains usable unless the operator explicitly chooses to discard it
- warnings alone never trigger rollback

Cross-reference:

- Runtime and degraded local capability rules are fixed in `/Users/claire/IdeaProjects/open-kraken/docs/runtime/deployment-and-operations.md`.
- Production fallback handling and release risk ownership are fixed in `/Users/claire/IdeaProjects/open-kraken/docs/production-readiness/observability-and-failure-handling.md` and `/Users/claire/IdeaProjects/open-kraken/docs/production-readiness/risk-register.md`.

## 9. Executable Bootstrap Steps

Use the repository wrapper instead of ad hoc manual checks:

- command: `bash /Users/claire/IdeaProjects/open-kraken/scripts/bootstrap-migration.sh --check`

The wrapper must pass before importer code or fixture vocabulary changes are considered ready because it checks:

- migration docs still contain source, id mapping, skip, rollback, and contract sections
- `backend/go/contracts/contracts.go`, `backend/tests/fixtures/workspace-fixture.json`, `scripts/mock-server/server.mjs`, `web/src/mocks/mock-client.mjs`, and `backend/go/tests/contract/contracts_matrix_test.go` still share the frozen event vocabulary
- the canonical fixture still exposes workspace, members, conversations, messages, roadmap, project data, and terminal session blocks

Operator sequence:

1. snapshot the three legacy source inputs from Section 2
2. run `bash scripts/bootstrap-migration.sh --check`
3. review `docs/mock-and-fixture.md` for fixture/mock sync order before touching mock or importer adapters
4. execute importer implementation only after the wrapper and targeted tests pass
5. if any write phase fails, mark `ImportReport.status=failed`, discard the staged open-kraken import target, and restart from the same snapshot

Verification entry:

- `bash /Users/claire/IdeaProjects/open-kraken/scripts/bootstrap-migration.sh --check`
- `bash /Users/claire/IdeaProjects/open-kraken/scripts/verify-all.sh`

Trigger to invoke rollback:

- `ImportReport.status=failed`
- persistence write abort after normalization but before a safe canonical result is committed
- operator explicitly rejects a `partial` import and chooses to discard the staged open-kraken result
