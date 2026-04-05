# Terminal UI Runtime

## Real Page Entry

- Real page entry: `/Users/claire/IdeaProjects/open-kraken/web/src/pages/terminal/TerminalPage.tsx`
- Runtime container: `/Users/claire/IdeaProjects/open-kraken/web/src/pages/terminal/terminal-runtime.ts`
- Presentational panel: `/Users/claire/IdeaProjects/open-kraken/web/src/features/terminal/TerminalPanel.tsx`

Responsibility split:

- `TerminalPage.tsx` owns the route-level shell placement inside `AppShell`.
- `terminal-runtime.ts` owns attach/retry callbacks, session identity, realtime event normalization, seq dedupe/replay, exit/error mapping, and resync requests.
- `TerminalPanel.tsx` only renders the current read model and invokes callbacks.

## Runtime Wiring Contract

The terminal runtime container must provide all of:

- session identity: `terminalId`, `memberId`, and command metadata from attach or snapshot payloads
- attach and retry callbacks
- snapshot, delta, and status inputs from the active websocket stream
- seq dedupe and replay rules
- error and exited state mapping into the terminal panel read model

Current wiring:

- attach source: `apiClient.attachTerminal(terminalId)`
- realtime source: `AppShell` shared `realtimeClient.subscribe('workspace', listener)`
- store bridge: `createTerminalStore()` plus `resolveAttach()` and `applyTerminalRealtimeEvent()`

## Event Boundary

The browser runtime accepts the formal websocket handshake plus canonical terminal events:

- `handshake.accepted`

- `terminal.attach`
- `terminal.snapshot`
- `terminal.delta`
- `terminal.status`

Compatibility input still accepted at the adapter boundary:

- `terminal.session.snapshot`
- `terminal.session.delta`
- `terminal.status.changed`
- `terminal.ready`
- `terminal.output.delta`

Normalization rule:

- `handshake.accepted` is consumed at the runtime boundary only; `resyncRequired=true` forces a fresh attach for the active terminal
- compatibility names are normalized inside `terminal-runtime.ts` before they touch `terminal-store`
- no page or component may consume compatibility names directly

## Seq Dedupe And Resync

- `terminal.snapshot` is authoritative and replaces the rendered buffer when `snapshot.seq >= lastSeq`
- `terminal.delta` is append-only and ignored when `delta.seq <= lastSeq`
- a delta gap (`delta.seq > lastSeq + 1` after the buffer has initialized) triggers resync by calling `attachTerminal(activeTerminalId)` again
- websocket replay gaps signaled by `handshake.accepted.resyncRequired=true` also trigger a fresh attach for the active terminal
- `terminal.status` updates connection and process state only; it does not rewrite buffered output

## React Toolchain Preconditions

Formal React toolchain is already the source of truth:

- runtime entry: `/Users/claire/IdeaProjects/open-kraken/web/src/main.tsx`
- HTML entry: `/Users/claire/IdeaProjects/open-kraken/web/index.html`
- build entry: `/Users/claire/IdeaProjects/open-kraken/web/scripts/build.mjs`
- test entry: `npm run test:web:unit`
- React/JSX types: `react`, `react-dom`, `@types/react`, `@types/react-dom`
- TS JSX mode: `jsx: react-jsx` in `/Users/claire/IdeaProjects/open-kraken/web/tsconfig.json`

Replacement condition for the old JSX placeholder:

- `jsx.d.ts` must not exist once the repository has all of the entries and packages above
- if React or JSX typing breaks again, fix the package/toolchain configuration rather than reintroducing a local JSX placeholder

Executed preconditions:

- `/Users/claire/IdeaProjects/open-kraken/web/src/main.tsx`, `/Users/claire/IdeaProjects/open-kraken/web/index.html`, and `/Users/claire/IdeaProjects/open-kraken/web/scripts/build.mjs` are present and used by `npm run build`
- `react`, `react-dom`, `@types/react`, and `@types/react-dom` are installed in `/Users/claire/IdeaProjects/open-kraken/web/package.json`
- `jsx: react-jsx` is active in `/Users/claire/IdeaProjects/open-kraken/web/tsconfig.json`
- the old local placeholder `/Users/claire/IdeaProjects/open-kraken/web/src/features/terminal/jsx.d.ts` has been removed

Current blocker and next step:

- No JSX typing blocker remains in the terminal page path after removing the placeholder
- The remaining follow-up is broader workspace-wide React build coverage outside the terminal route; that is a repo-wide verification task, not a terminal-runtime-specific blocker

## Verification

- `cd /Users/claire/IdeaProjects/open-kraken/web && npm test -- terminal-runtime`
- `cd /Users/claire/IdeaProjects/open-kraken/web && npm test -- terminal-panel`
- `cd /Users/claire/IdeaProjects/open-kraken/web && npm test -- migration-web`
- `cd /Users/claire/IdeaProjects/open-kraken/web && npm run typecheck`
- `cd /Users/claire/IdeaProjects/open-kraken/web && npm run build`
