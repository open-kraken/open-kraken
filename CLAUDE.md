# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository purpose

open-kraken is a **cross-server, multi-agent coordination framework** with a built-in management UI (Go backend + React frontend in one repo). It is the migration root for the Go + React rewrite of the legacy Vue/Tauri Golutra product, and is being reshaped to implement the architecture from the "Agents as Execution Resources" paper — AEL (Authoritative Execution Ledger), CWS (Cognitive Workload Scheduler), and Agent Runtime. Canonical narrative: `docs/product-vision-and-architecture.md`.

## Commands

**Always use the root-level wrappers.** `go test ./...` from the repo root is NOT a valid gate — the backend is a multi-module / workspace layout, and the wrappers classify toolchain/environment blockers separately from real regressions.

Dev stack:
- `npm run dev:up` / `bash scripts/dev-up.sh` — build web statics, start backend at `127.0.0.1:8080`, writes pid to `.open-kraken-run/backend.pid`. `--probe` returns after `/healthz` responds.
- `npm run dev:down` / `bash scripts/dev-down.sh` — stops the pid-tracked backend.
- `bash scripts/docker-up.sh` — bring up full stack via `docker-compose.yml` (Postgres, etcd, Qdrant, Vault, Prometheus, Grafana, backend, web).

Go tests (wrapper: `scripts/verify-go-tests.sh`; clears `GOROOT/GOTOOLDIR/GOPATH` before invoking `go`):
- `npm run test:go` — **canonical root gate**. Runs unit (`./cmd/... ./contracts ./internal/... ./testing/...`), contract (`./tests/contract/...`), then integration (`./tests/integration/...`) with stage-specific exit codes.
- `npm run test:go:domain` — `./internal/domain/... ./tests/contract/...` (required for repository/file-store boundary, message status enum, or domain-contract alignment changes).
- `npm run test:go:runtime` — `./cmd/server ./internal/platform/... ./internal/api/http/...` (required runtime/deployment gate).
- `npm run test:go:workspace` — `go test ./...` from `backend/go`.
- `npm run test:go:projectdata`, `npm run test:go:importer` — narrow single-package gates.
- Run a single Go test: `cd backend/go && env -u GOROOT -u GOTOOLDIR -u GOPATH go test -run TestName ./internal/<pkg>/...`

Web tests (from root):
- `npm run test:web:routes` — **canonical migration gate** for the React route tree through `AppShell`.
- `npm run test:web:unit` — broader unit suite.
- Inside `web/`: `npm run dev` (Vite), `npm run build`, `npm run typecheck` (= `lint`), `npm test`.

E2E / verification:
- `npm run test:e2e:smoke` — `node --test ./e2e/smoke/*.test.mjs`.
- `npm run test:e2e:browser` — browser-automation placeholder (contract-freeze check, not Playwright yet).
- `npm run test:e2e:playwright` — `npx playwright test --config=e2e/playwright.config.ts`.
- `npm run verify:all` — Go + web routes + broader web + browser placeholder + e2e smoke + migration verify.
- `npm run verify:runtime` — toolchain detection + backend runtime tests + `dev-up --probe`/`dev-down`.
- `npm run verify:migration`, `npm run verify:contract-sync`, `npm run verify:production-readiness`.
- `npm run audit:changes` / `bash scripts/audit-changes.sh --review` — **before reporting completion**; `--review` exits 20 when machine-local artifacts (`.env`, `.DS_Store`, `.idea`, `.open-kraken-run/backend.log`) appear.

## Architecture

### Top-level layout
- `backend/go/` — Go backend (single module, `open-kraken/backend/go`). Only backend implementation home.
- `web/` — React 19 + Vite + Tailwind 4 frontend. Only frontend implementation home.
- `docs/` — contracts, architecture notes, runbooks, acceptance matrices. Source of truth for API/realtime contracts.
- `scripts/` — canonical developer/CI entrypoints. All verification flows dispatch from here.
- `e2e/` — smoke, browser, Playwright config.
- `backend/tests/fixtures/` — shared test fixtures.
- `ops/`, `k8s/`, `docker-compose.yml`, `Dockerfile.{backend,web,agent}` — deployment.

### Backend structure (`backend/go/`)
Entry points: `cmd/server/main.go` (HTTP + WS server), `cmd/agent/main.go`, `cmd/cli/main.go`. Internal packages:

- `internal/ael/` — **Authoritative Execution Ledger** (paper §5.1, Appendix A). Run → Flow → Step → SideEffect four-level hierarchy with FSM-enforced monotonicity; four transactions T1–T4 (lease issuance, step completion, lease renewal, expiry recovery). PostgreSQL-backed via `pgx`; SQL lives in `internal/ael/migrations/`. **Do not** merge AEL into the legacy `internal/ledger/` — AEL Steps project a summary row into `ledger_events` for v1 API compatibility.
- `internal/stepLease/` — etcd-based authoritative Step leases (`etcd.go`) with in-memory fallback (`memory.go`) for single-node dev mode.
- `internal/runtime/instance/` — **AgentInstance** (paper §5.4.2). Eight-state FSM wrapping (not replacing) the 5-state `internal/session` Actor. Terminal states (`terminated`, `crashed`) cannot go back to live states.
- `internal/api/http/` — `handler.go` composes the mux; `handlers/` holds per-feature handlers; `paths.go` joins `apiBasePath` with relative segments; `integration/` holds end-to-end HTTP tests. `ExtendedServices` struct in `handler.go` is how optional services (node, skill, token, memory, ledger, message, presence, plugin, settings, provider registry, task queue, AEL) are wired; nil fields omit their routes.
- `internal/api/contracts/`, `contracts/contracts.go` — stable wire contracts; the frontend and `docs/api` depend on these.
- `internal/platform/` — `http/` (WS upgrader, middleware), `logger/`, `runtime/config.go` (all `OPEN_KRAKEN_*` env config).
- `internal/{ledger,memory,node,skill,tokentrack,terminal,realtime,session,presence,settings,message,plugin,taskqueue,projectdata,roster,orchestration,migration,pty}` — feature packages, each with `model.go` / `repository.go` / `service.go` and package-local tests.
- `internal/observability/` — Prometheus metrics (`prometheus/`) + OTEL tracing (Langfuse OTLP exporter).
- `internal/authn/`, `internal/authz/` — server-authoritative auth. **Never** fake permissions in the UI.
- `tests/contract/` — cross-package wire contracts. `tests/integration/` — integration tests across services. `testing/testkit/` — shared helpers.

### Persistence model
- Dev default: embedded `modernc.org/sqlite` files + JSON/file stores under `$OPEN_KRAKEN_APP_DATA_ROOT` (defaults to `./.open-kraken-data`). Separate `.db` files per domain (`tokentrack`, `memory`, `ledger`, …). JSON/file stores for `nodes`, `skills`, `projectdata`, workspace docs.
- Paper §3.2 stack (opt-in, env-gated): `OPEN_KRAKEN_POSTGRES_DSN` enables AEL; `OPEN_KRAKEN_ETCD_ENDPOINTS` enables distributed Step leasing; `OPEN_KRAKEN_PROMETHEUS_ADDR` starts the scrape listener. Empty = disabled = single-node fallback.
- When evolving storage, **keep HTTP/contract layers stable** and swap repository implementations.

### Frontend structure (`web/src/`)
- `main.tsx` → `app/` providers (`AuthProvider`, `I18nProvider`, `ThemeProvider`, `AppProviders`) → `components/AppShell` → routes in `routes/index.tsx`.
- Path-based SPA; `AppProviders` syncs `window.location.pathname` to active route. Auth gate: unauthenticated → `LoginPage`; `/auth/me` validates session.
- `api/` — `HttpClient` + typed `apiClient` with bearer token. `realtime/` — `RealtimeClient` WebSocket.
- `features/` — per-route feature modules. `pages/` — page roots. `state/` — zustand-style stores (`app-shell-store`, `nodesStore`, `dashboardStore`, `auth-store`, …). `types/` — domain types (node, skill, token, ledger).
- Routes wired in shell: `/dashboard`, `/ledger`, `/chat`, `/members`, `/skills`, `/roadmap`, `/terminal`, `/nodes`, `/system`, `/settings`. `pages/collaboration/CollaborationOverviewPage` is a demo, **not** in shell nav.

## Working rules

- **Paper alignment.** open-kraken implements the "Agents as Execution Resources" paper (AEL + CWS + Agent Runtime). Use paper vocabulary (Run/Flow/Step/SideEffect, AEP, Hive, L1–L4 memory, AgentInstance, Step Lease). Don't overwrite it. See `docs/product-vision-and-architecture.md`.
- **Server-authoritative auth.** Authorization and capability decisions live on the backend. The UI shows read models and failure/degradation — never fake permissions client-side.
- **Don't scatter files at repo root.** Backend code goes in `backend/go/`, frontend in `web/`, scripts in `scripts/`, docs in `docs/`. Root holds coordination files only.
- **Legacy Golutra is reference-only.** Don't write new code into the old tree; copy/translate intent into open-kraken.
- **Runtime wrappers clear `GOROOT`/`GOTOOLDIR`/`GOPATH`** before invoking Go. Don't depend on manually-overridden env for team commands.
- **Audit before reporting completion.** `.env`, `.DS_Store`, `.idea/`, and `.open-kraken-run/backend.log` are machine-local and will fail `audit-changes.sh --review` with exit 20.

## Key environment variables

Loaded in `internal/platform/runtime/config.go`. `OPEN_KRAKEN_APP_DATA_ROOT` (default `./.open-kraken-data`), `OPEN_KRAKEN_HTTP_ADDR` (default `127.0.0.1:8080`), `OPEN_KRAKEN_API_BASE_PATH` (`/api/v1`), `OPEN_KRAKEN_WS_PATH` (`/ws`), `OPEN_KRAKEN_WEB_DIST_DIR` (`./web/dist`), `OPEN_KRAKEN_JWT_SECRET` (empty = dev mode, no JWT middleware), `OPEN_KRAKEN_WS_ALLOW_ANY_ORIGIN` + `OPEN_KRAKEN_WS_ALLOWED_ORIGINS`, `OPEN_KRAKEN_RATE_LIMIT_RPS`, `OPEN_KRAKEN_POSTGRES_DSN`, `OPEN_KRAKEN_ETCD_ENDPOINTS`, `OPEN_KRAKEN_PROMETHEUS_ADDR`, `OPEN_KRAKEN_OTEL_EXPORTER_OTLP_TRACES_ENDPOINT` + `OPEN_KRAKEN_LANGFUSE_{PUBLIC,SECRET}_KEY` (tracing requires all three). LLM providers (multi, comma-separated): `OPEN_KRAKEN_LLM_PROVIDER=anthropic,openai` (empty = NoopExecutor). Each enabled provider needs its own key: `ANTHROPIC_API_KEY` (or `OPEN_KRAKEN_LLM_API_KEY` for back-compat), `OPENAI_API_KEY` (or `OPEN_KRAKEN_OPENAI_API_KEY`). `OPEN_KRAKEN_LLM_DEFAULT_MODEL` is used when Step.event_stream.model is blank; `OPEN_KRAKEN_LLM_DEFAULT_PROVIDER` names the llmexec fallback route when Step.Provider is blank (defaults to first in LLM_PROVIDER list). CWS budget awareness: `OPEN_KRAKEN_CWS_COST_ALPHA` (0–1, 0=off) + `OPEN_KRAKEN_CWS_COST_BASELINE_USD` (both must be >0 to enable `BudgetAwareRewardModel`). Step retry: `OPEN_KRAKEN_RETRY_MAX_ATTEMPTS` (default 3; 0 disables — failed Step propagates immediately). Frontend diagnostics: optional `VITE_LANGFUSE_UI_URL`.
