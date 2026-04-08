# Observability And Failure Handling

## Observability Baseline

This baseline is bound to the current runtime and verification surfaces already present in the repository:

- release gate: `npm run verify:all`
- remote executor gate: `npm run ci:remote-verify`
- production-readiness sync gate: `npm run verify:production-readiness`
- API/WS/terminal/authz sync gate: `npm run verify:contract-sync`
- runtime/deployment gate: `npm run verify:runtime`
- runtime startup and probe: `bash /Users/claire/IdeaProjects/open-kraken/scripts/verify-runtime.sh`
- static build: `bash /Users/claire/IdeaProjects/open-kraken/scripts/release/build-static.sh`
- root migration verification: `npm run verify:migration`
- backend Go verification: `npm run test:go`
- backend runtime Go verification: `npm run test:go:runtime`
- runtime contract reference: `/Users/claire/IdeaProjects/open-kraken/docs/runtime/deployment-and-operations.md`

Contract docs that must stay in sync with these runtime surfaces:

- HTTP and websocket surface: `/Users/claire/IdeaProjects/open-kraken/docs/api/openapi.yaml`
- HTTP/WS behavior notes: `/Users/claire/IdeaProjects/open-kraken/docs/api/http-websocket-contract.md`
- Realtime events: `/Users/claire/IdeaProjects/open-kraken/docs/backend/realtime-contract.md`
- Terminal + authz enforcement: `/Users/claire/IdeaProjects/open-kraken/docs/backend/authz-enforcement-and-go-env.md`

### Logging

- Server minimum baseline:
  - Structured logs for request lifecycle, websocket connect/disconnect, terminal session attach/dispatch/status, authz denials, and deployment startup/shutdown.
  - Each entry should carry timestamp, level, service, workspace or conversation/session identifier when available, and a stable error code for failures.
  - The currently implemented HTTP access log baseline also includes `requestId`, `method`, `path`, `status`, and `durationMs`; production sign-off must preserve these fields.
- Frontend minimum baseline:
  - Capture route-level load failure, API request failure, websocket disconnect/reconnect, terminal panel failure state, and authz-denied UI transitions.
  - Send only sanitized client diagnostics; never log secrets or raw credentials.

### Metrics

- Server minimum baseline:
  - Request rate, error rate, latency, websocket active connections, reconnect count, terminal session count, terminal dispatch failure count, and authz denial count.
- Frontend minimum baseline:
  - Page load success/failure, API failure count by feature area, websocket reconnect attempts, and terminal panel attach failure count.

### LLM observability (Langfuse)

For **per-invocation** LLM tracing, prompts, and cost attribution on model calls that typically run **outside** the Go monolith (agents/workers), use **[Langfuse](https://langfuse.com/)** via **OpenTelemetry OTLP/HTTP** to Langfuse’s `/api/public/otel` endpoint. This **complements** workspace **`tokentrack`** (rollups in SQLite) and the **ledger** (audit narrative); it does not replace them. See **`docs/observability/langfuse-integration.md`** for endpoints, auth headers, and correlation attributes (`langfuse.trace.metadata.*`, workspace/member ids).

### Health checks

- Server minimum baseline:
  - `GET /healthz` is the currently bound health endpoint for process and runtime readiness.
  - The response must keep `status`, `service`, and `requestId`, and may include `warnings` for optional dependency degradation.
  - Static asset degradation must remain visible through `/healthz` and through the degraded static response contract documented in `/Users/claire/IdeaProjects/open-kraken/docs/runtime/deployment-and-operations.md`.
- Frontend minimum baseline:
  - Build-time asset integrity and runtime config presence checks for API base URL and websocket base URL.
  - UI-visible degraded banner when backend readiness or websocket status is not healthy.

### Alerting

- Server minimum baseline:
  - Alert on sustained API error spike, readiness failure, websocket disconnect surge, terminal dispatch failure surge, and repeated authz-denial anomalies that suggest policy drift.
- Frontend minimum baseline:
  - Alert or telemetry threshold on client-side route crash spike, repeated websocket reconnect loops, and terminal panel attach failures above baseline.

### Alert source and ownership

| Alert source | Formal Entrypoint | Owner | Verification |
| --- | --- | --- | --- |
| Runtime readiness alert | `GET /healthz` and `bash /Users/claire/IdeaProjects/open-kraken/scripts/verify-runtime.sh` | deployment/runtime owner | Probe returns healthy payload and expected warnings contract |
| Runtime gate alert | `npm run verify:runtime` | deployment/runtime owner | Runtime bootstrap, Go runtime gate, and probe chain complete without drift |
| Remote executor alert | `npm run ci:remote-verify` and `.github/workflows/verify.yml` | CI / automation owner | Remote runner executes the same unified gate and uploads `.open-kraken-artifacts/ci` |
| API/WS/terminal/authz drift alert | `npm run verify:contract-sync` | API contract owner | Contract docs still point at the current runtime, health, and cross-doc bindings |
| Release gate alert | `npm run verify:all` | release owner | Full repository gate passes before sign-off |
| Documentation drift alert | `npm run verify:production-readiness` | production-readiness doc owner | Fails when runtime/health/contract entrypoints disappear from the docs |
| Migration drift alert | `npm run verify:migration` | migration gate owner | Confirms cross-surface acceptance remains aligned |

## Ownership Split

| Capability | Server Responsibility | Frontend Responsibility |
| --- | --- | --- |
| Logs | Emit authoritative request/realtime/terminal/authz/runtime logs with identifiers and error codes | Emit sanitized UX/runtime diagnostics and surface actionable state to users |
| Metrics | Publish service, websocket, terminal, and authz counters/latency | Publish page/API/reconnect/terminal attach telemetry |
| Health checks | Expose liveness/readiness/terminal capability endpoints and deployment readiness | Validate runtime config presence and render degraded state clearly |
| Alerting | Route operational alerts for availability, error rates, and backend degradation | Route client alerts for crash loops, reconnect loops, and visible UX degradation |

## Failure Triage

Follow this order: classify the incident, confirm blast radius, check the matching baseline signals, apply the fallback, then verify recovery before reopening traffic.

## Forced Sync Mechanism

- Any API, websocket, terminal, or authz behavior change must update the matching contract doc in the same change:
  - API: `/Users/claire/IdeaProjects/open-kraken/docs/api/openapi.yaml`
  - HTTP/WS flow notes: `/Users/claire/IdeaProjects/open-kraken/docs/api/http-websocket-contract.md`
  - Realtime events: `/Users/claire/IdeaProjects/open-kraken/docs/backend/realtime-contract.md`
  - Authz + terminal enforcement: `/Users/claire/IdeaProjects/open-kraken/docs/backend/authz-enforcement-and-go-env.md`
- The same change must keep `npm run verify:production-readiness` green; that command is the repository guard against production-readiness docs drifting away from real entrypoints.
- Runtime/deployment changes must also keep `npm run verify:runtime` green or return a stable blocked classification from the runtime chain; manual `go run` plus spot checks do not replace that gate.
- API/WS/terminal/authz behavior changes must also keep `npm run verify:contract-sync` green; README references alone are not accepted as synchronization evidence.
- Release sign-off remains blocked if the implementation changes but either the contract docs or the sync command are skipped.

### Service unavailable

1. Confirm API liveness/readiness and deployment health.
   Current bound checks: `bash /Users/claire/IdeaProjects/open-kraken/scripts/verify-runtime.sh` and `curl -i http://127.0.0.1:8080/healthz`.
2. Check recent server startup/shutdown logs, request error spikes, and env/config drift.
3. Roll back or restart the affected deployment if readiness does not recover quickly.
4. Verify static assets, API requests, and websocket upgrade all recover before clearing the incident.

### Realtime stream interrupted

1. Confirm websocket upgrade health, connection counts, and reconnect spikes.
   Current repository gate: `npm run verify:migration`.
2. Check server realtime logs for disconnect cause and client telemetry for reconnect loops.
3. If reconnect semantics are unstable, fall back affected screens to polling or stale-state banner mode.
4. Verify snapshot/resubscribe flow works before restoring realtime-only indicators.

### Terminal disconnected

1. Confirm terminal capability health, session attach logs, runner/backing service health, and dispatch failure metrics.
   Current repository gates: `npm run test:go` and `npm run verify:migration`.
2. Check whether the failure is attach-time, stream-time, or dispatch-time.
3. If interactive control is unsafe, switch terminal UI to read-only or unavailable state and block dispatch.
4. Verify attach, snapshot, delta, and status transitions recover before re-enabling interactive use.

### Permission anomaly

1. Confirm the affected role, endpoint/action, and whether the denial is server-side or UI-only.
   Current contract reference: `/Users/claire/IdeaProjects/open-kraken/docs/backend/authz-enforcement-and-go-env.md`.
2. Check authz denial logs, recent role-model changes, and frontend read-model assumptions.
3. If server denies a formerly allowed action, prefer preserving server enforcement and disable the UI path until the matrix is reconciled.
4. Verify both server enforcement and frontend visibility rules match the documented role matrix before closing the incident.
