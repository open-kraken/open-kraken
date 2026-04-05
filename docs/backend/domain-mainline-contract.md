# Domain Mainline Contract

## Scope

This document fixes the executable constraints for the open-kraken backend domain mainline under `/Users/claire/IdeaProjects/open-kraken/backend/go`.

It exists to prevent three regressions:

- the repository boundary drifting back to abstract interfaces with no runnable persistence baseline
- message delivery status drifting between domain, API, realtime, mock, and fixture layers
- local verification depending on hand-written `GOROOT` exports

## Canonical Runtime Boundary

- The current runnable persistence baseline is `internal/domain/repository.FileStore`.
- `FileStore` persists aggregate documents under `<workspaceRoot>/.open-kraken/domain`.
- Aggregate roots that persist independently are `workspace`, `conversation`, `member`, `roadmap`, and `project data`.
- `message` persists independently as a conversation-scoped append record under `workspaceId + conversationId`.
- Cross-aggregate ownership stays ID-only. Services must not embed one aggregate inside another for persistence.

## Replacement Plan

- The replacement seam is the `internal/domain/repository` package only.
- Future SQLite/Postgres work may replace `FileStore`, but must preserve the current query/store interface split and the minimum query dimensions:
  - `workspaceId`
  - `workspaceId + conversationId`
- Callers must continue to use repository interfaces rather than file paths or `.open-kraken/domain` internals directly.

## Message Status Contract

The only allowed backend message delivery states are:

- `sending`
- `sent`
- `failed`

They must stay aligned across:

- `backend/go/contracts`
- `backend/go/internal/domain/message`
- realtime event `chat.message.status.changed`
- mock server payloads
- web mock client payloads
- checked-in fixtures

Any new status requires updating the domain package, contracts package, realtime contract, mocks, fixtures, and contract tests in the same change.

## Validation Entry

The only supported validation command for this slice is:

```bash
cd /Users/claire/IdeaProjects/open-kraken && npm run test:go:domain
```

Result semantics:

- `0`: pass
- `81`: blocked by sanitized Go toolchain resolution still failing
- `80`: regression in domain or contract assertions

Do not use hand-written `env GOROOT=... go test ...` snippets as the primary review or CI evidence for this slice. Those remain debugging fallbacks only.
