# Deployment And Operations

## Scope

This document fixes the minimum runtime contract for the open-kraken migration stack under `/Users/claire/IdeaProjects/open-kraken`. The legacy `/Users/claire/IdeaProjects/golutra` tree remains reference input only.

## Runtime Environment Contract

Required runtime environment variables and defaults:

- `OPEN_KRAKEN_HTTP_ADDR`: backend listen address. Default `127.0.0.1:8080`.
- `OPEN_KRAKEN_API_BASE_PATH`: HTTP API prefix reserved for backend routes. Default `/api/v1`.
- `OPEN_KRAKEN_WS_PATH`: realtime upgrade path reserved for WebSocket traffic. Default `/ws`.
- `OPEN_KRAKEN_APP_DATA_ROOT`: writable server-side data root. Default `./.open-kraken-data`. Startup fails if this directory cannot be created.
- `OPEN_KRAKEN_LOG_LEVEL`: runtime log verbosity hint. Default `info`.
- `OPEN_KRAKEN_WEB_DIST_DIR`: static asset directory served by the backend. Default `./web/dist`.

Frontend build-time examples:

- `VITE_API_BASE_URL=http://127.0.0.1:8080/api/v1`
- `VITE_WS_BASE_URL=ws://127.0.0.1:8080/ws`
- `VITE_APP_ORIGIN=http://127.0.0.1:8080`

## Process Model

Local runtime flow is intentionally single-process on the serving side:

1. `scripts/bootstrap-migration.sh` prepares local runtime directories and `.env` files.
2. `scripts/release/build-static.sh` builds `web/dist`.
3. `scripts/dev-up.sh` delegates to `scripts/dev/run-local.sh`, validates the listen port is free, and starts the Go backend through the repository Go resolver.
4. The backend serves `/healthz`, API routes under `OPEN_KRAKEN_API_BASE_PATH`, realtime upgrades under `OPEN_KRAKEN_WS_PATH`, and static files from `OPEN_KRAKEN_WEB_DIST_DIR`.

`run-local.sh` is blocking by default. It traps `EXIT`, `INT`, and `TERM`, kills the spawned backend process, waits for process termination, and removes the pid file so local runs do not leave hanging processes. `scripts/dev-down.sh` provides the repository-level stop entrypoint for the same pid file.

For validation without leaving a long-running process behind, use:

```bash
bash /Users/claire/IdeaProjects/open-kraken/scripts/dev-up.sh --probe
```

`--probe` starts the backend, waits until `/healthz` responds, then exits through the same cleanup path.

Go toolchain handling is repository-owned:

- `scripts/lib/go-env.sh` resolves the effective Go binary and strips inherited `GOROOT`, `GOPATH`, and `GOTOOLDIR`.
- `scripts/check-go-toolchain.sh` is the canonical detection/reporting entrypoint. If Go cannot be resolved, it fails with a repository-level error before runtime verification starts.
- `scripts/bootstrap-migration.sh --check` and `scripts/verify-runtime.sh` delegate to `scripts/check-go-toolchain.sh` instead of maintaining their own detection logic.
- Team members should not run ad hoc `GOROOT=... go ...` commands or bare `go test` commands as the primary path; use repository wrappers instead.

## Persistence Writer Topology

Current roadmap/project-data persistence is approved only for single-writer topology per workspace:

- one backend process may own mutation for a given workspace's roadmap/project-data files
- additional processes may read the same workspace, but they must not perform concurrent writes against the same persistence target
- the validation entry `npm run test:go:projectdata` checks single-process serialization plus optimistic version conflict behavior only

If deployment needs more than one writer process for the same workspace, the rollout must stop until one of the replacement paths in `/Users/claire/IdeaProjects/open-kraken/docs/persistence/roadmap-project-data.md` is implemented.

## Skill And Command Channel Layering

open-kraken fixes the command surface into three layers:

1. CLI/local automation entry:
   - local-only callers may enter through the CLI-compatible path owned by the backend runtime
   - this layer may talk to a local backend process, but it must not bypass backend authorization or persistence rules
2. HTTP command layer:
   - browser and service-to-service command mutations use HTTP DTOs under `OPEN_KRAKEN_API_BASE_PATH`
   - command results, warnings, and failures must reuse the documented HTTP error envelope instead of inventing CLI-only payloads for browser paths
3. WebSocket/realtime layer:
   - realtime is delivery-only for snapshots, deltas, status, and reconnect/resync flows
   - realtime must not become a second write protocol for mutations that already belong to HTTP commands

Current hard boundary:

- The long-term write truth is the Go backend under `/Users/claire/IdeaProjects/open-kraken/backend/go`.
- Tauri-local IPC from legacy Golutra is not an allowed target runtime in open-kraken.
- Skill discovery, command dispatch, and command authorization may reuse CLI compatibility at the edge, but they must converge into the same backend-owned authorization and command handling paths described in:
  - `/Users/claire/IdeaProjects/open-kraken/docs/api/http-websocket-contract.md`
  - `/Users/claire/IdeaProjects/open-kraken/docs/authz-role-model.md`
  - `/Users/claire/IdeaProjects/open-kraken/docs/backend/authz-enforcement-and-go-env.md`

Ownership and orchestration interface:

- `scripts` and CLI wrappers own process entry only. They may resolve environment, spawn the local backend, and format user input into transport requests.
- `backend/go` owns skill catalog truth, command authorization, dispatch admission, persistence mutation, and cross-agent orchestration.
- `web` owns browser presentation and must consume the backend-owned HTTP/WebSocket contracts instead of introducing page-local command semantics.

Accepted command handoff surfaces:

- skill and command discovery: backend-owned route/handler surface documented under the API contract set
- cross-agent orchestration command: server-enforced `collaboration.command`
- terminal dispatch command: server-enforced `terminal.dispatch`
- read-only realtime fan-out: `snapshot` / `delta` / `status` / replay-resync semantics only

Rejected command patterns:

- browser-originated direct PTY/shim/process control that bypasses backend orchestration
- WebSocket-only mutation flows that do not have an equivalent backend command boundary
- CLI-local writes that mutate workspace truth without passing backend authz and persistence enforcement

## Remote Deployment Local Capability Boundary

open-kraken distinguishes browser-visible collaborative truth from host-local capabilities:

- Browser-safe collaborative truth:
  - chat
  - member/role read models
  - roadmap
  - project data
  - terminal snapshots, deltas, status, and attach state after a backend session already exists
- Host-local capabilities that require a local runtime:
  - opening local folders or shell windows
  - reading host-local avatar or filesystem paths directly
  - spawning PTY processes and binding shim/runtime lifecycle
  - executing CLI/local command adapters that assume machine-local process access

Capability split:

- Keep local-only:
  - PTY/shim lifecycle
  - local shell/folder launch
  - any host-path resolution that would reveal raw machine-local filesystem layout
- Allow through backend service proxy:
  - chat, member roster, role matrix, roadmap, project data
  - clustered team/member roster writes require `OPEN_KRAKEN_POSTGRES_DSN`; without PostgreSQL the roster falls back to single-process workspace-file storage for local development only
  - terminal attach, snapshot, delta, status, and transcript reads after a backend-managed session already exists
  - healthz/readiness and degraded capability reporting
- Forbid exposing through browser or generic API passthrough:
  - arbitrary filesystem browsing
  - arbitrary shell command execution outside the backend-owned orchestration surface
  - direct shim/socket/IPC handles
  - legacy desktop window or tray controls

Deployment rule:

- If the backend is remote and no local runtime is attached, host-local capabilities are disabled, not proxied through the browser as raw filesystem or shell access.
- In that degraded mode, the backend may still serve chat, roadmap, project data, member views, historical terminal transcript reads, and non-interactive terminal status visibility.
- Any feature that requires machine-local execution must surface as `disabled` or `degraded` in the UI and operations layer rather than silently failing open.

Operational consequence:

- `/healthz` and readiness remain valid even when local execution features are disabled, as long as the backend can truthfully report that terminal capability is degraded or unavailable.
- Release and incident handling must classify local-runtime loss separately from full service outage, matching:
  - `/Users/claire/IdeaProjects/open-kraken/docs/production-readiness/observability-and-failure-handling.md`
  - `/Users/claire/IdeaProjects/open-kraken/docs/production-readiness/risk-register.md`

Verification entry:

- `bash /Users/claire/IdeaProjects/open-kraken/scripts/dev-up.sh --probe`
- `curl -i http://127.0.0.1:8080/healthz`
- `bash /Users/claire/IdeaProjects/open-kraken/scripts/verify-all.sh`
- `bash /Users/claire/IdeaProjects/open-kraken/scripts/bootstrap-migration.sh --check`

Pass condition:

- healthz stays reachable
- browser-safe collaborative routes still function
- local-only capability loss is reported as `disabled` or `degraded`, not silently proxied

## Static Hosting Contract

- Static files are served only for non-API and non-WebSocket paths.
- `OPEN_KRAKEN_API_BASE_PATH` and `OPEN_KRAKEN_WS_PATH` are never shadowed by static routing.
- Terminal HTTP APIs are served only under `{OPEN_KRAKEN_API_BASE_PATH}/terminal` (default `/api/v1/terminal`). The WebSocket endpoint is `{OPEN_KRAKEN_WS_PATH}` (default `/ws`), with a legacy alias at `/realtime`.
- If `OPEN_KRAKEN_WEB_DIST_DIR` is unset, missing, not a directory, or lacks `index.html`, the backend still starts and continues to serve API and `/healthz`.
- In that degraded static state, browser-path requests such as `/` return `503` with `application/json; charset=utf-8` and a body containing `status=degraded`, `error=web_dist_unavailable`, and `requestId`.

## Health Contract

`GET /healthz`

- Success response: `200 OK`
- Content type: `application/json; charset=utf-8`
- Minimum body fields: `status`, `service`
- Additional fixed field: `requestId`

Healthy example:

```json
{
  "status": "ok",
  "service": "open-kraken-backend",
  "requestId": "req-1"
}
```

Dependency semantics:

- Required dependency failures return `503 Service Unavailable` with `status=unhealthy` and an `errors` array.
- Optional dependency failures return `200 OK` with a `warnings` array.
- Missing static assets are treated as an optional dependency failure so operators can still probe the backend while seeing the degraded condition.

## Logging Contract

Every HTTP request log line must include at least:

- `time`
- `level`
- `service`
- `requestId`
- `message`

Current access logs also emit `method`, `path`, `status`, and `durationMs` to make routing and failure analysis practical.

## Release Steps

1. Build static assets: `bash /Users/claire/IdeaProjects/open-kraken/scripts/release/build-static.sh`
2. Confirm `web/dist/index.html` exists and assets are present under `web/dist/assets`.
3. Export runtime env vars or copy from `/Users/claire/IdeaProjects/open-kraken/backend/.env.example`.
4. Start the backend with `bash /Users/claire/IdeaProjects/open-kraken/scripts/dev-up.sh`
5. Smoke-check health: `curl -i http://127.0.0.1:8080/healthz`
6. Smoke-check static hosting: `curl -i http://127.0.0.1:8080/`
7. Smoke-check API prefix is not shadowed: `curl -i http://127.0.0.1:8080/api/v1/terminal/sessions`
8. Smoke-check WebSocket path is reserved: open a client against `ws://127.0.0.1:8080/ws`
9. Stop the backend with `bash /Users/claire/IdeaProjects/open-kraken/scripts/dev-down.sh`

## Verification Categories

The runtime verification split is fixed into three separate outcomes:

- Script startup result: whether `scripts/dev/run-local.sh` starts, probes readiness, and exits cleanly without leaving a backend process behind.
- Static artifact result: whether `npm --prefix /Users/claire/IdeaProjects/open-kraken/web run build` produces `web/dist/index.html` and `web/dist/assets/*`.
- Routing preservation result: whether `/api/v1` and `/ws` continue to reach backend handlers instead of static fallback paths.

Canonical runtime verification command:

```bash
bash /Users/claire/IdeaProjects/open-kraken/scripts/verify-runtime.sh
```

This is the single repository-owned pass criterion for the runtime/deployment chain in the current migration stage. If it fails:

1. `bootstrap-migration.sh --check` output is the only accepted toolchain diagnosis.
2. `verify-go-tests.sh runtime` output is the accepted backend/runtime test result.
3. `dev-up.sh --probe` output is the accepted runtime readiness result.
4. data-migration preflight remains `bootstrap-migration.sh --check`; runtime verification must not rediscover legacy snapshot inputs differently from the migration bootstrap path.
