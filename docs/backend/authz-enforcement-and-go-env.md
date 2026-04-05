# Authz Enforcement And Go Environment

## Enforcement Wiring

This note records the first real authorization wiring on top of the role model:

- HTTP terminal entry rejects unauthorized `attach` and `dispatch` before the terminal service runs.
- WebSocket realtime attach rejects unauthorized `terminal.attach` requests and returns an error status payload instead of silently attaching.
- `terminal.Service.DispatchAuthorized` enforces `terminal.dispatch` at the service boundary so non-HTTP callers still hit a real reject path.
- `projectdata.GuardedService` enforces roadmap/project-data writes before repository mutation.

## Sync Guard Bindings

- Sync guard: `npm run verify:contract-sync`
- Runtime gate: `npm run verify:runtime`
- Release gate: `npm run verify:all`
- HTTP/WS contract peer: `/Users/claire/IdeaProjects/open-kraken/docs/api/http-websocket-contract.md`
- OpenAPI peer: `/Users/claire/IdeaProjects/open-kraken/docs/api/openapi.yaml`
- Realtime peer: `/Users/claire/IdeaProjects/open-kraken/docs/backend/realtime-contract.md`

Formal authentication adapter now used by HTTP/WebSocket entrypoints:

- `Authorization: Bearer open-kraken-dev.<base64url-json>`
- bearer payload fields: `workspaceId`, `memberId`, `role`
- adapter implementation: `/Users/claire/IdeaProjects/open-kraken/backend/go/internal/authn/adapter.go`

Compatibility note:

- legacy `X-Open-Kraken-*` actor headers remain as a fallback adapter during migration
- new entry tests and runtime docs should prefer the bearer adapter instead of the legacy header carrier

## Go GOROOT Mismatch

Observed local mismatch is reported through the repository detector rather than raw shell commands.

Repository-owned verification path:

```bash
cd /Users/claire/IdeaProjects/open-kraken
npm run check:go-toolchain
npm run test:go
npm run test:go:workspace
```

Repository behavior:

- `scripts/check-go-toolchain.sh` is the single repository-owned detection/reporting path for Go binary resolution and sanitized version output.
- `scripts/verify-go-tests.sh` clears inherited `GOROOT`, `GOTOOLDIR`, and `GOPATH` before invoking Go.
- `scripts/dev/run-local.sh` uses the same sanitized Go invocation path for `go run ./cmd/server`.
- Contributors should not add manual `export GOROOT=...` steps to normal repository commands.

Result on this machine:

- the stale-shell mismatch no longer blocks repository-owned Go commands
- sanitized verification now reaches real package assertions, which is the expected prerequisite for classifying actual regressions
