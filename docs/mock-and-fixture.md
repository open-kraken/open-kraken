# open-kraken Mock And Fixture Contract

## Scope

All new mock and fixture artifacts live under `/Users/claire/IdeaProjects/open-kraken`.
`/Users/claire/IdeaProjects/golutra` is reference input only and must not receive new outputs.

## Canonical Fixture Source

- Canonical fixture: `backend/tests/fixtures/workspace-fixture.json`
- Consumer copies/adapters:
  - `scripts/mock-server/server.mjs`
  - `web/src/fixtures/workspace-fixture.mjs`
  - `web/src/mocks/mock-store.mjs`

The fixture field names intentionally reuse the backend/browser contract names already frozen in the migration docs:

- workspace: `id`, `name`, `rootPath`, `readOnly`
- member identity projection: `workspaceId`, `memberId`, `displayName`, `avatar`, `roleType`, `manualStatus`, `terminalStatus`
- chat: `conversationId`, `message`, `content`, `createdAt`, `status`
- roadmap: `objective`, `tasks`
- terminal attach: `terminalId`, `status`, `snapshot`, `seq`, `buffer`

## Update Responsibility

- Contract owner for naming drift: backend and API contract owners must update the canonical JSON and `backend/go/contracts/contracts.go` together.
- Mock owner for scenario drift: mock/fixture maintainer updates `scripts/mock-server/server.mjs` and `web/src/mocks/mock-client.mjs` after the canonical fixture changes.
- Frontend consumers must not introduce page-local aliases when the canonical fields already exist.
- Page owners must consume canonical field names directly. If a page needs derived labels, derive them locally without renaming source keys in transport DTOs or fixtures.

## Frozen Reuse Rules

- Event names must stay aligned across all of:
  - `backend/go/contracts/contracts.go`
  - `backend/go/tests/contract/contracts_matrix_test.go`
  - `scripts/mock-server/server.mjs`
  - `web/src/mocks/mock-client.mjs`
- Canonical identity fields must stay aligned across all of:
  - `backend/tests/fixtures/workspace-fixture.json`
  - `backend/go/contracts/contracts.go`
  - `web/src/fixtures/workspace-fixture.mjs`
  - any page/store that joins member identity, chat, roadmap, or terminal data
- `roleType` is frozen to `owner | supervisor | assistant | member`.
- `manualStatus` is user/profile presence only.
- `terminalStatus` is runtime work state only.

## When To Use Mock

- Use mock mode for local UI work before the real backend route or realtime publisher exists.
- Use mock mode for deterministic unit and smoke tests that only need stable DTO shape and event order.
- Enable it with one switch: `OPEN_KRAKEN_API_MODE=mock`.

## When To Switch To Real API

- Switch to `OPEN_KRAKEN_API_MODE=live` as soon as the target route or websocket publisher exists in `open-kraken`.
- Keep the same client calls. Only base URLs should change:
  - `OPEN_KRAKEN_API_BASE_URL`
  - `OPEN_KRAKEN_WS_BASE_URL`
  - optional `OPEN_KRAKEN_WORKSPACE_ID`

## Minimum Supported Flows

- Chat message stream: `chat.snapshot`, `chat.delta`, `chat.status`
- Member status refresh: `presence.snapshot`, `presence.delta`, `presence.status`
- Roadmap read/write: `GET/PUT /api/workspaces/{workspaceId}/roadmap` + `roadmap.updated`
- Terminal attach and stream bootstrap:
  - `GET /api/workspaces/{workspaceId}/terminal/sessions/{terminalId}/attach`
  - `terminal.attach`
  - `terminal.snapshot`
  - `terminal.delta`
  - `terminal.status`

Canonical naming rule:

- Mock fixtures, browser mocks, backend contracts, and docs must reuse the event names fixed in `/Users/claire/IdeaProjects/open-kraken/docs/backend/realtime-contract.md`.
- Legacy names such as `chat.message.created`, `friends.snapshot.updated`, `terminal.ready`, `terminal.output.delta`, and `terminal.status.changed` are compatibility input only and must not be introduced as new open-kraken fixture vocabulary outside the temporary compatibility layer described below.

## Current Compatibility Layer

Current repository state is still split:

- target vocabulary for new backend/browser-facing contracts:
  - `chat.snapshot`, `chat.delta`, `chat.status`
  - `presence.snapshot`, `presence.delta`, `presence.status`
  - `terminal.attach`, `terminal.snapshot`, `terminal.delta`, `terminal.status`
- temporary compatibility vocabulary still present in:
  - `backend/go/contracts/contracts.go`
  - `backend/go/tests/contract/contracts_matrix_test.go`
  - `scripts/mock-server/server.mjs`
  - `web/src/mocks/mock-client.mjs`

Boundary:

- Do not add more legacy event aliases beyond the current compatibility layer.
- New docs, new routes, new realtime publishers, and new UI code must point at the target vocabulary from `docs/backend/realtime-contract.md`.
- Existing compatibility aliases remain detectable debt until the contract owners converge the code paths.

## Sync Workflow

When changing fixture shape or event vocabulary, update in this order:

1. Change the canonical source in `backend/go/contracts/contracts.go` or `backend/tests/fixtures/workspace-fixture.json`.
2. Update adapters in `scripts/mock-server/server.mjs`, `web/src/fixtures/workspace-fixture.mjs`, and `web/src/mocks/mock-client.mjs`.
3. Run `npm run test:go`, `npm run test:web:unit`, and `npm run test:e2e:smoke`.
4. If the change is intentional, update this document and any consuming page docs in the same change.

Guardrails:

- `backend/go/tests/contract/contracts_matrix_test.go` is the cross-source guard for event names and fixture field reuse.
- A change is incomplete if only the fixture or only one consumer is updated.

## Migration Bootstrap Coupling

Data migration work must stay coupled to these canonical sources:

- `docs/migration/data-migration-source-inventory.md`
- `docs/migration/data-migration-compatibility-strategy.md`
- `backend/go/contracts/contracts.go`
- `backend/tests/fixtures/workspace-fixture.json`
- `scripts/mock-server/server.mjs`
- `web/src/fixtures/workspace-fixture.mjs`
- `web/src/mocks/mock-client.mjs`

Executable guard:

- `bash /Users/claire/IdeaProjects/open-kraken/scripts/bootstrap-migration.sh --check`
- `rg -n "chat\\.message\\.created|friends\\.snapshot\\.updated|terminal\\.attach|terminal\\.delta|terminal\\.status" /Users/claire/IdeaProjects/open-kraken/backend/go/contracts/contracts.go /Users/claire/IdeaProjects/open-kraken/backend/go/tests/contract/contracts_matrix_test.go /Users/claire/IdeaProjects/open-kraken/scripts/mock-server/server.mjs /Users/claire/IdeaProjects/open-kraken/web/src/mocks/mock-client.mjs`
- `rg -n "chat\\.snapshot|presence\\.snapshot|terminal\\.attach|terminal\\.snapshot|terminal\\.delta|terminal\\.status" /Users/claire/IdeaProjects/open-kraken/docs/backend/realtime-contract.md /Users/claire/IdeaProjects/open-kraken/docs/mock-and-fixture.md`

Use it before:

- changing fixture field names
- changing event names or transport vocabulary
- wiring importer code to mock or fixture adapters
- claiming rollback or partial-import semantics are still aligned

Rollback boundary:

- fixture/mock data may simulate import results, but they must not pretend runtime-only data such as `terminal_session_map`, dispatch outbox retries, or browser caches are migratable truth
- if importer behavior or fixture vocabulary diverges, fix the canonical contract first and regenerate adapters from that contract instead of patching page-local aliases

Importer hookup rule:

- fixture and mock artifacts may model canonical post-import DTOs, but importer code must persist durable roadmap/project-data truth through the backend repository boundary documented in `docs/migration/data-migration-compatibility-strategy.md`
- alias maps, import report, and snapshot manifest are migration metadata and must not be replaced by page-local mock state

Consistency close-out rule:

- A migration boundary change is incomplete if it updates runtime/deployment or data-migration docs but leaves the compatibility-layer explanation or validation commands here stale.
