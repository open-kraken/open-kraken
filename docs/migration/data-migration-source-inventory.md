# open-kraken Legacy Data Migration Source Inventory

## 1. Scope

This document inventories the legacy Golutra data that open-kraken may read during migration.

- It only covers import inputs from `/Users/claire/IdeaProjects/golutra` and legacy workspace/app data written by that codebase.
- It does not redefine the target backend repository shape.
- It treats open-kraken as the only write target after import.

## 2. Source Inventory

Each source row states the concrete legacy origin, serialization format, trust level, and whether the importer may continue when the source is absent.

| Legacy Data Class | Primary Source Path | Secondary Source Path | Format | Trust Level | Allow Missing | Import Decision |
| --- | --- | --- | --- | --- | --- | --- |
| Workspace project document | `<legacyWorkspacePath>/.golutra/workspace.json` | `<legacyAppData>/<workspaceId>/project.json` | JSON object | Medium. Workspace copy is preferred but may be stale or malformed; app fallback may be newer after read-only mode. | Yes | Import when either source parses; prefer workspace, then fallback. |
| Member roster embedded in project document | `members[]` inside `<legacyWorkspacePath>/.golutra/workspace.json` | `members[]` inside `<legacyAppData>/<workspaceId>/project.json` | JSON array inside project document | Medium. Owner bootstrap may be synthetic and terminal members may include runtime-only defaults. | Yes | Import only persistent member identity and policy fields. |
| Project metadata and attributes | top-level fields inside `<legacyWorkspacePath>/.golutra/workspace.json` | same fields in app fallback | JSON object | Medium | Yes | Import selected canonical metadata into open-kraken `ProjectDataImportSnapshot`. |
| Global roadmap in project document | `roadmap` node inside workspace/app project document | none | JSON object with objective/tasks | Medium | Yes | Import as workspace-scoped roadmap when structurally valid. |
| Chat database | `<legacyChatBaseDir>/<workspaceId>/chat.redb` | none | `redb` tables with bincode-encoded records | Medium-Low. Schema is code-defined and must be read through a migration adapter, not ad hoc parsing. | Yes | Import conversations, messages, membership, unread anchors only when DB opens cleanly. |
| Conversation metadata | `conversations` table in `chat.redb` | none | `redb` + bincode | Medium-Low | Yes | Import if chat DB is present and records decode. |
| Conversation membership | `members` table in `chat.redb` | none | `redb` + bincode | Medium-Low | Yes | Import if member IDs can be reconciled to migrated members or aliases. |
| Per-user conversation settings | `user_convs` and `timeline_index` tables in `chat.redb` | none | `redb` + bincode | Low-Medium. Useful for last-read anchors and ordering, but not stronger than message truth. | Yes | Import last-read and pinned/muted signals when referential integrity holds; otherwise skip per-record. |
| Messages and attachments | `messages` and `attachments_index` tables in `chat.redb` | none | `redb` + bincode | Medium-Low | Yes | Import when message payload decodes and conversation mapping exists. |
| Dispatch outbox state | `chat_outbox_tasks` and `chat_outbox_schedule` tables in `chat.redb` | none | `redb` + bincode | Low. Retry state reflects transient terminal dispatch, not durable business truth. | Yes | Do not migrate as executable state. Preserve only optional diagnostics in report. |
| Terminal session map | `terminal_session_map` and `terminal_session_index` tables in `chat.redb` | none | `redb` + bincode | Low. Session IDs are runtime bindings to no-longer-valid terminal processes. | Yes | Do not migrate. |
| Ephemeral terminal runtime state | in-memory Rust session manager and window-scoped ephemeral sessions | none | process memory | Untrusted for migration; disappears on restart. | Yes | Do not migrate. |
| Browser/UI cache and tray/notification cache | legacy browser storage and Tauri app/cache helpers | none | browser storage / local cache files | Low. Derived view state only. | Yes | Do not migrate. |

## 3. Source Semantics

### 3.1 Workspace Project Document

Legacy `project_data.rs` reads `.golutra/workspace.json` first and falls back to app storage when workspace access fails or the workspace copy is absent. open-kraken import must preserve that read order for compatibility analysis, but it must write only to open-kraken-owned storage after normalization.

Minimum fields treated as migration candidates:

- `projectId`
- `projectName`
- `version`
- `members`
- `memberSequence`
- `roadmap`
- domain-specific top-level attributes that remain meaningful outside the Tauri runtime

### 3.2 Chat Database

Legacy `chat.redb` is the only durable source for conversation and message truth. Relevant tables include:

- `conversations`
- `members`
- `messages`
- `attachments_index`
- `user_convs`
- `timeline_index`

The importer must not treat:

- `chat_outbox_tasks`
- `chat_outbox_schedule`
- `terminal_session_map`
- `terminal_session_index`

as canonical user data.

### 3.3 Runtime-Only Sources

The following sources may exist during a running Golutra desktop session, but they are not valid import truth:

- terminal engine in-memory session registry
- window-scoped ephemeral sessions
- notification unread preview cache
- browser route/UI selection caches

These sources may inform troubleshooting, but they are outside the compatibility contract.

## 4. ID Mapping Summary

This inventory document records which legacy identifiers are expected to survive migration and which require aliasing.

| Entity | Legacy ID Shape | Default Mapping | Collision Rule |
| --- | --- | --- | --- |
| Workspace | string | Preserve when non-empty and unique in open-kraken import scope | If already claimed by another imported workspace, generate new canonical workspace ID and record `legacyWorkspaceId -> workspaceId` alias. |
| Member | ULID-like string for seeded/default entries, but legacy data may contain arbitrary strings | Preserve when syntactically valid and unique in workspace scope | On collision or invalid format, generate new canonical member ID and persist alias map from legacy ID. |
| Conversation | ULID-backed string from `chat.redb` | Preserve when unique in workspace scope | On collision, generate new canonical conversation ID and store alias. |
| Message | ULID-backed string from `chat.redb` | Preserve when unique inside canonical conversation | On collision, generate new canonical message ID and store alias keyed by `(legacyConversationId, legacyMessageId)`. |
| Roadmap item | Often ad hoc string or absent | Preserve explicit `id` when unique within roadmap document; otherwise generate deterministic alias from workspace/conversation scope plus ordinal | Duplicate IDs are rewritten and logged as warnings, not blockers. |

## 5. Skip Items

These legacy data classes are intentionally excluded from import:

| Legacy Data Class | Why It Is Skipped | User-Visible Impact |
| --- | --- | --- |
| Terminal session map | It binds `member_id` to obsolete runtime `session_id`; imported values would point at dead processes. | Users reopen terminals in open-kraken; no previous live terminal attachment is restored. |
| Dispatch outbox retry queue | It is transient delivery state and may replay stale side effects if imported. | Messages stay imported, but pending terminal dispatches are not resumed automatically. |
| Ephemeral terminal runtime state | It only exists in memory and is not a durable workspace artifact. | Running commands from the old desktop app do not continue in the new backend. |
| UI cache / browser cache / tray unread cache | Derived presentation state is recomputed from canonical backend data. | Selection state, temporary filters, and tray badges reset after migration. |
| Broken or undecodable records | open-kraken must not invent truth from corrupted binary rows. | The report shows skipped records; unaffected records still import. |

## 6. Risks And Rollback

### 6.1 Main Risks

- Workspace JSON and app fallback may diverge; naive import could pick the wrong copy.
- `chat.redb` decoding requires the legacy table schema; partial schema drift could create selective data loss.
- Legacy IDs may collide with already-imported open-kraken workspaces if multiple imports converge.
- Roadmap tasks may lack stable IDs, forcing generated aliases.

### 6.2 Rollback Baseline

Before import, keep a read-only snapshot of:

- `<legacyWorkspacePath>/.golutra/workspace.json`
- `<legacyAppData>/<workspaceId>/project.json` when present
- `<legacyChatBaseDir>/<workspaceId>/chat.redb` when present

Rollback rule:

1. open-kraken import never mutates the legacy source.
2. If normalization or writeback fails, discard the partially written open-kraken import workspace.
3. Re-run import from the same immutable snapshot after fixing the importer or source repair issue.

## 7. Sync And Execution References

This inventory is coupled to the following executable and canonical references:

- bootstrap guard: `bash /Users/claire/IdeaProjects/open-kraken/scripts/bootstrap-migration.sh --check`
- compatibility contract: `/Users/claire/IdeaProjects/open-kraken/docs/migration/data-migration-compatibility-strategy.md`
- mock and fixture contract: `/Users/claire/IdeaProjects/open-kraken/docs/mock-and-fixture.md`
- backend contract source: `/Users/claire/IdeaProjects/open-kraken/backend/go/contracts/contracts.go`
- canonical fixture source: `/Users/claire/IdeaProjects/open-kraken/backend/tests/fixtures/workspace-fixture.json`
- mock transport source: `/Users/claire/IdeaProjects/open-kraken/scripts/mock-server/server.mjs`

Execution rule:

1. freeze or snapshot the legacy source paths listed in Section 2
2. run the bootstrap guard before changing importer code or fixture vocabulary
3. run `cd /Users/claire/IdeaProjects/open-kraken && npm run test:go:importer` before claiming importer preflight, discovery classification, or rollback token semantics are guarded in code
4. after a real import attempt, run `bash /Users/claire/IdeaProjects/open-kraken/scripts/bootstrap-migration.sh --verify-result <target-workspace-path>` to confirm canonical output artifacts were written
5. if the guard fails, repair contract drift first instead of continuing with migration execution
6. if import fails after write begins, discard the staged open-kraken target and restart from the same source snapshot

### 7.1 Recorded Snapshot Inputs

The snapshot manifest created for an import attempt must record:

- the resolved legacy workspace path
- the resolved legacy app fallback path, when used
- the resolved `chat.redb` file path, when present
- whether project data came from workspace or app fallback
- the timestamp of the snapshot

This manifest is required so rollback and re-import can refer to the same immutable inputs instead of rediscovering sources differently on a later run.

### 7.2 Alias And Import Metadata Destination

Until importer code is implemented, the required metadata destination is fixed conceptually as open-kraken-owned staged import metadata beside the target workspace.

The importer must persist:

- alias maps for workspace/member/conversation/message/roadmap item IDs
- the final `ImportReport`
- the snapshot manifest described above

These artifacts are not optional diagnostics; they are required to explain rollback, replay, and conflict handling.
