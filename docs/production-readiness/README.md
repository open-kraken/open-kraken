# Production Readiness

## Scope

- This directory defines the production-readiness baseline for `/Users/claire/IdeaProjects/open-kraken`.
- It covers release risk tracking, regression gates, observability baselines, and failure handling for the Go backend, React web app, realtime transport, terminal flows, and deployment runtime.
- These documents are the write target for the new migration program; legacy Golutra files are reference input only.

## Documents

- `risk-register.md`: active production risks with fixed ownership, triggers, mitigation, fallback, and affected area.
- `regression-checklist.md`: release-gate checklist with explicit pass criteria for critical product flows.
- `observability-and-failure-handling.md`: minimum logging, metrics, health checks, alerting, ownership split, and incident triage order.

## Formal Entrypoints And Owners

| Surface | Formal Entrypoint | Primary Owner | Verification |
| --- | --- | --- | --- |
| Release aggregation | `npm run verify:all` | release owner | Runs repository gates plus `npm run verify:production-readiness` |
| Remote executor | `npm run ci:remote-verify` and `.github/workflows/verify.yml` | CI / automation owner | Executes `npm run verify:all` on the remote runner and uploads `.open-kraken-artifacts/ci` |
| API/WS/terminal/authz sync guard | `npm run verify:contract-sync` | API contract owner | Fails when API/WS/terminal/authz docs drift away from runtime/health/gate bindings |
| Production-readiness sync | `npm run verify:production-readiness` | production-readiness doc owner | Fails when release docs stop naming the current runtime, health, alert, and contract entrypoints |
| Runtime/deployment aggregation | `npm run verify:runtime` | deployment/runtime owner | Runs bootstrap checks, runtime Go gate, and runtime probe/cleanup through one repository entrypoint |
| Runtime startup/probe | `bash /Users/claire/IdeaProjects/open-kraken/scripts/verify-runtime.sh` | deployment/runtime owner | Confirms toolchain detection, backend/runtime tests, and `/healthz` probe path |
| Health | `GET /healthz` | backend/runtime owner | Confirms readiness payload and warning surface |
| Migration aggregation | `npm run verify:migration` | migration gate owner | Confirms cross-surface migration acceptance |
| Go verification | `npm run test:go` | backend/go owner | Confirms backend contract and flow guards |
| Web route verification | `npm run test:web:routes` | web owner | Confirms formal route shells remain wired |
| Browser smoke | `npm run test:e2e:browser` | release owner | Confirms browser-facing runtime shell still renders and boots |

Current CI binding:

- GitHub Actions remote executor now lives at `/Users/claire/IdeaProjects/open-kraken/.github/workflows/verify.yml`.
- The workflow calls `bash ./scripts/ci/run-remote-verify.sh`, which executes `npm run verify:all` and writes `.open-kraken-artifacts/ci/verify-all.log` plus `.open-kraken-artifacts/ci/summary.json`.
- The workflow uploads `.open-kraken-artifacts/ci` as `open-kraken-verify-artifacts`, so remote verification evidence is persisted outside the runner.
- `npm run verify:production-readiness` is the current sync mechanism that guards command names, runtime/contract references, and production-readiness doc drift before CI exists.
- `npm run verify:contract-sync` is the narrower contract-sync guard for `docs/api/openapi.yaml`, `docs/api/http-websocket-contract.md`, `docs/backend/realtime-contract.md`, and `docs/backend/authz-enforcement-and-go-env.md`.

## Bound Entrypoints

The current production-readiness baseline is bound to the repository entrypoints that already exist today:

- Root release gate: `npm run verify:all`
- Root remote executor gate: `npm run ci:remote-verify`
- Root production-readiness sync gate: `npm run verify:production-readiness`
- Root API/WS/terminal/authz sync gate: `npm run verify:contract-sync`
- Root runtime/deployment gate: `npm run verify:runtime`
- Root migration gate: `npm run verify:migration`
- Root Go gate: `npm run test:go`
- Root runtime Go gate: `npm run test:go:runtime`
- Root workspace Go smoke gate: `npm run test:go:workspace`
- Root web route gate: `npm run test:web:routes`
- Root web unit gate: `npm run test:web:unit`
- Root browser smoke gate: `npm run test:e2e:browser`
- Root e2e smoke gate: `npm run test:e2e:smoke`
- Local runtime probe: `bash /Users/claire/IdeaProjects/open-kraken/scripts/verify-runtime.sh`
- Static build entry: `bash /Users/claire/IdeaProjects/open-kraken/scripts/release/build-static.sh`
- Runtime health endpoint: `GET /healthz`

Supporting contracts that these documents rely on:

- Runtime and deployment details: `/Users/claire/IdeaProjects/open-kraken/docs/runtime/deployment-and-operations.md`
- Go gate semantics and blocker codes: `/Users/claire/IdeaProjects/open-kraken/docs/testing/go-test-matrix.md`
- Authz enforcement and Go environment note: `/Users/claire/IdeaProjects/open-kraken/docs/backend/authz-enforcement-and-go-env.md`
- Realtime contract: `/Users/claire/IdeaProjects/open-kraken/docs/backend/realtime-contract.md`

## Forced Sync Mechanism

- `npm run verify:production-readiness` is the formal sync command for this directory.
- `npm run verify:contract-sync` is the formal sync command for API/WS/terminal/authz document bindings.
- `npm run ci:remote-verify` is the repository-owned remote execution entry and must remain a thin wrapper over `npm run verify:all`.
- It verifies root `package.json` script bindings for `verify:all`, `verify:production-readiness`, `verify:runtime`, `verify:migration`, `test:go`, `test:go:runtime`, `test:web:routes`, `test:e2e:browser`, `dev:up`, and `dev:down`.
- It verifies API/WS/terminal/authz docs still name the current runtime, health, and contract linkage rather than drifting into README-only references.
- It verifies the wrapper/runtime/contract files referenced by these docs still exist in the repository.
- It verifies the remote executor workflow still points at the repository-owned script and artifact upload path instead of re-encoding a partial gate set.
- It verifies `README.md` and the production-readiness docs keep naming the same release gate, runtime gate, health endpoint, and contract references.
- A release-affecting change is incomplete if it changes those entrypoints or references without keeping `npm run verify:production-readiness` green in the same change.

## Verification

- `test -f /Users/claire/IdeaProjects/open-kraken/docs/production-readiness/risk-register.md`
- `test -f /Users/claire/IdeaProjects/open-kraken/docs/production-readiness/regression-checklist.md`
- `test -f /Users/claire/IdeaProjects/open-kraken/docs/production-readiness/observability-and-failure-handling.md`
- `rg -n "^## Active Risks|^## Release Gates|^## Observability Baseline|^## Failure Triage" /Users/claire/IdeaProjects/open-kraken/docs/production-readiness`
- `npm run verify:production-readiness`
- `npm run verify:contract-sync`
- `npm run verify:runtime`
- `npm run ci:remote-verify`
- `npm run verify:migration`
- `bash /Users/claire/IdeaProjects/open-kraken/scripts/verify-runtime.sh`
