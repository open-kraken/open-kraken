# Production Risk Register

## Contract

Each active risk entry must include `category`, `severity`, `likelihood`, `owner`, `trigger`, `mitigation`, and `fallback`.
Mitigations and fallback paths should bind to concrete repository entrypoints or documented runtime surfaces when they already exist.
Every release-affecting change must also preserve the binding between this register, `npm run verify:all`, `npm run verify:production-readiness`, `npm run verify:contract-sync`, and the runtime verification entry `scripts/verify-runtime.sh`.
The release owner remains accountable for enforcing `npm run verify:all` before sign-off, even before repository CI exists.
Runtime/deployment changes must also keep `npm run verify:runtime` green or return a stable blocked result from that chain.

## Active Risks

| Category | Risk | Severity | Likelihood | Owner | Trigger | Mitigation | Fallback |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Go backend | Domain contracts drift across workspace, conversation, member, role, roadmap, and project data services | high | medium | backend/go owner | `npm run test:go` or `npm run test:go:workspace` reports a regression in contracts or assembled flows | Keep backend interfaces, service DTOs, and docs contracts versioned together; require contract test updates in the same change, require `npm run verify:production-readiness` when docs references change, and use `scripts/verify-go-tests.sh` as the gate | Freeze new backend surface to documented fields only and temporarily reject new fields behind server validation until `npm run test:go` is green or explicitly classified as a known blocker |
| React web | Frontend read models drift from backend/authz/realtime contracts and render stale or incomplete state | high | medium | web owner | `npm run test:web:unit`, `npm run test:web:routes`, or `npm run verify:migration` fails chat/member/roadmap/terminal assertions | Use shared fixture shapes from documented contracts, gate merges on `npm run test:web:unit`, and require `npm run verify:all` before release sign-off | Fall back to read-only placeholders for affected panels until contract parity is restored and `npm run test:web:unit` passes again |
| Realtime communication | WebSocket reconnect semantics or event payload shapes diverge across chat, presence, roadmap, and terminal streams | high | medium | realtime/API contract owner | `npm run verify:migration`, `npm run verify:contract-sync`, `npm run verify:production-readiness`, or runtime websocket smoke reveals duplicate events, missing snapshots, or incompatible payload names | Keep event names centralized in `/Users/claire/IdeaProjects/open-kraken/docs/backend/realtime-contract.md`, require reconnect tests, preserve `attach/snapshot/delta` semantics across backend and web, and require `npm run verify:contract-sync` when contract docs move | Degrade affected screens to polling or stale-state banner mode until realtime contract and smoke checks recover |
| Terminal | Session attach/dispatch/status flow becomes unstable under reconnect, multi-subscriber, or runner restarts | critical | medium | terminal owner | `npm run test:go`, `npm run verify:migration`, `npm run verify:contract-sync`, `npm run verify:production-readiness`, or runtime probe evidence shows attach succeeds but stream/status/dispatch becomes inconsistent | Keep terminal session lifecycle tests and runtime contract docs aligned, validate status transitions, and treat terminal flow as part of `verify:migration` acceptance and `verify:contract-sync` bindings | Disable interactive dispatch and expose terminal as read-only session transcript while backend recovers |
| Deployment | Split web/API deployment or env configuration breaks health checks, asset serving, websocket upgrade, release gating, or remote verification upload | critical | medium | deployment/runtime owner | `bash scripts/verify-runtime.sh` fails, `npm run verify:runtime` fails, `GET /healthz` is unhealthy, `npm run verify:all` fails, `npm run ci:remote-verify` fails, or CI artifact upload breaks | Standardize env contract via `/Users/claire/IdeaProjects/open-kraken/docs/runtime/deployment-and-operations.md`, build assets with `scripts/release/build-static.sh`, probe readiness through `/healthz`, and keep `bash scripts/verify-runtime.sh`, `npm run verify:runtime`, `npm run verify:all`, and `.github/workflows/verify.yml` aligned | Roll back to previous release bundle/config, keep maintenance banner active, and restrict new rollout until local runtime, unified gate, and remote executor all pass |

## Review Rhythm

- Re-evaluate severity, likelihood, owner, trigger, mitigation, and fallback before each release candidate.
- Add new rows rather than overloading existing rows when a risk affects a different subsystem or failure mode.
- Close a risk only after the mitigation is implemented and the fallback path has been verified.
