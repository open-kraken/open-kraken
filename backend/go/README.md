# backend/go

## Product role: coordination, ledger, memory, and runtime

The backend carries the **cross-process / cross-node coordination** story: **scheduling and orchestration** (terminal, realtime, node registry), **centralized ledger**, **centralized memory**, **skills and node registration**, and **stable HTTP/WebSocket contracts** for the web UI. Authorization and capabilities are enforced on the server.

Product vision and architecture alignment: **[../docs/product-vision-and-architecture.md](../docs/product-vision-and-architecture.md)**.

## Scope

- Own Go domain code, auth, HTTP/WebSocket APIs, realtime, terminal orchestration, persistence interfaces, and backend tests.
- This directory is the only backend implementation home; do not place backend source or ad-hoc service code at the repository root.
- Shared test fixtures may live under `backend/tests`; runtime code stays here.

## Ownership

- Domain models, realtime contracts, terminal orchestration, persistence, auth, HTTP/WebSocket APIs, and Go test matrices.

## Dependency direction

- May depend on modules in this tree and fixtures under `backend/tests`.
- Consumed by `web`, `docs`, `e2e`, and `scripts`.
- Must not depend on `web` implementation details or embed generic scripts.

## Entrypoints

- Go workspace file (if present at repo root): `go.work`
- Toolchain check: `bash ./scripts/check-go-toolchain.sh`
- Workspace tests (when used): `bash ./scripts/verify-go-tests.sh workspace`
- Unified server start (delegated): `scripts/dev-up.sh`
- Unified verification (delegated): `scripts/verify-all.sh`

## Persistence and domain baseline (aligned with code)

- **Data root**: `OPEN_KRAKEN_APP_DATA_ROOT` (typically `.open-kraken-data`), holding SQLite and JSON stores.  
- **SQLite (modernc)**: separate `.db` files for `tokentrack`, `memory`, `ledger`, etc.  
- **JSON / files**: node registry (`nodes`), skill bindings (`skills`), `projectdata`, and other workspace documents.  
- **Domain packages**: e.g. `internal/domain` for workspace, conversation, and message models; storage paths and policies follow each `repository` implementation.  
- If migrating to Postgres or similar, keep **HTTP/contract layers stable** and swap storage implementations.

Tooling and test entrypoints remain the root scripts (e.g. `scripts/check-go-toolchain.sh`, `npm run test:go`); see the repository root `README.md`.
