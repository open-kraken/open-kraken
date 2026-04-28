# open-kraken

## Product vision

**open-kraken** aims to be the **unified delivery home** for the **claw-code × Golutra × OpenClaw** lineages: a **cross-server, multi-agent coordination framework** with a **built-in management UI**.

- **Core**: cross-process / cross-node **scheduling and orchestration**, a **centralized ledger**, and **centralized memory**.  
- **Org model**: continuously formed **AI teams** → multiple **agents** per team → **skills** per agent; **dynamic node join** and **dynamic agent capability** expansion.  
- **Frontend role**: **observability plane** — surface node and team state, team task maps, in-team agent status, skill management and import/export; **authorization and capabilities are server-authoritative**.

Full narrative plus alignment and gaps vs current code: **[docs/product-vision-and-architecture.md](docs/product-vision-and-architecture.md)**.

File placement, naming, code style, deletion, and verification standards are defined in **[docs/development/file-and-code-standards.md](docs/development/file-and-code-standards.md)**.

---

open-kraken is also the migration root for the Go + React rewrite of the legacy Golutra workspace. All new artifacts should live under this repository; legacy Golutra remains reference input only and must not receive new migration code.

## Migration Goal

- Rebuild the legacy Vue + Tauri/Rust product as a standalone Go backend plus React web application.
- Preserve core collaboration flows: workspace state, chat, member/role coordination, roadmap, project data, terminal sessions, and realtime updates.
- Move implementation, tests, docs, and release workflow into a single repository root that can evolve independently from legacy Golutra.

## Current Stage

This repository is in migration bootstrap stage. The current objective is to establish a stable top-level layout, fixed ownership boundaries, and canonical entrypoints so parallel contributors can add backend, web, docs, scripts, and e2e work without scattering files at the root.

## Repository Layout

- `backend/go`: Go services, domain models, realtime/event contracts, terminal orchestration, and backend-local tests.
- `web`: React application shell, feature UI, API client layer, frontend tests, and shared presentation state.
- `docs`: Migration design notes, boundary documents, API/realtime contracts, rollout guidance, and operating runbooks.
- `scripts`: Canonical developer and CI entrypoints, mock services, migration utilities, and future bootstrap wrappers.
- `e2e`: End-to-end and smoke verification that spans backend, web, and mock/real integration flows.

## Dependency Rules

- Root should contain coordination files only; feature implementation should live in one of the owned first-level areas above.
- `web` depends on contracts documented in `docs` and runtime behavior exposed by `backend/go`.
- `backend/go` may read fixtures and verification helpers from `backend/tests` and may be exercised by `e2e`, but should not depend on `web`.
- `scripts` may orchestrate `backend/go`, `web`, and `e2e`; product code should not depend on `scripts`.
- `docs` may reference any area but should not become a dumping ground for source code.

## Unified Entrypoints

The repository-level wrappers are now fixed and executable:

- Start stack: `bash scripts/dev-up.sh` or `npm run dev:up`
- Stop stack: `bash scripts/dev-down.sh` or `npm run dev:down`
- Full verification: `bash scripts/verify-all.sh` or `npm run verify:all`
- Runtime verification: `bash scripts/verify-runtime.sh`
- Migration bootstrap: `bash scripts/bootstrap-migration.sh --check` or `npm run bootstrap:migration`

Wrapper scope in the current repository state:

- `scripts/dev-up.sh` delegates to `scripts/dev/run-local.sh` and uses the repository-owned Go wrapper that clears conflicting `GOROOT/GOTOOLDIR/GOPATH` before `go run`.
- `scripts/dev-down.sh` stops the pid tracked by `.open-kraken-run/backend.pid`.
- `scripts/verify-all.sh` runs the current repository gates in order: Go, route-focused React page tree, broader web unit, browser handoff placeholder, e2e smoke, migration verify.
- `scripts/verify-runtime.sh` is the single runtime/deployment validation entrypoint. It runs bootstrap toolchain detection, backend/runtime Go tests, and `dev-up --probe`/`dev-down`.
- `scripts/bootstrap-migration.sh --check` creates local runtime directories, seeds `.env` files from checked-in examples when missing, installs `web` dependencies when absent, and then runs migration/fixture/contract guard checks.

Wrapper help contract:

- `bash scripts/dev-up.sh --help` documents `--probe`, the delegated target, and exit codes.
- `bash scripts/dev-down.sh --help` documents the zero-argument stop behavior and exit codes.
- `bash scripts/verify-all.sh --help` documents the delegated verification chain and returns the first failing delegated exit code.
- `bash scripts/bootstrap-migration.sh --help` documents `--check`, `--steps`, and its required-file failure code.

## Verification

Current implemented checks:

- `bash scripts/bootstrap-migration.sh`
- `bash scripts/check-go-toolchain.sh`
- `bash scripts/dev-up.sh`
- `bash scripts/dev-down.sh`
- `bash scripts/verify-all.sh`
- `bash scripts/verify-runtime.sh`
- `bash scripts/ci/run-remote-verify.sh`
- `npm run bootstrap:migration`
- `npm run check:go-toolchain`
- `npm run dev:up`
- `npm run dev:down`
- `npm run test:go`
- `npm run test:go:domain`
- `npm run test:go:runtime`
- `npm run test:go:workspace`
- `npm run test:web:routes`
- `npm run test:web:unit`
- `npm run test:e2e:browser`
- `npm run test:e2e:smoke`
- `npm run verify:all`
- `npm run ci:remote-verify`
- `npm run verify:runtime`
- `npm run verify:migration`
- `npm run audit:changes`

Go gate note:

- Do not use root-level `go test ./...` as the migration gate. This repository uses a multi-module/workspace layout, so the canonical root entrypoints are `npm run test:go` and `npm run test:go:workspace`.
- `bash scripts/check-go-toolchain.sh` is the repository-owned bootstrap/detection/reporting entrypoint for Go toolchain resolution.
- `npm run test:go` is the required root gate because it classifies environment/toolchain blockers separately from real regressions.
- `npm run test:go:domain` is the required gate for repository/file-store boundary, message status enum, and domain-contract alignment changes.
- Root runtime wrappers clear conflicting shell-level `GOROOT` and `GOTOOLDIR` before invoking the resolved Go binary so team commands do not depend on manual environment overrides.
- `bash scripts/verify-runtime.sh` is the required runtime/deployment pass criterion for the current migration stage.

React route gate note:

- `npm run test:web:routes` is the canonical migration gate for the first real React page tree through `AppShell`.
- `verify:migration` uses `test:web:routes` instead of the broader `test:web:unit` suite so chat, members, roadmap, and terminal entry routes can advance independently from unrelated component regressions.

Browser handoff note:

- `npm run test:e2e:browser` is the fixed repository entry for future real browser automation.
- The current implementation is a placeholder contract check that freezes the first browser route scope and required selectors until a Playwright or equivalent runner is attached behind the same command.

Repository-structure checks for this bootstrap stage:

- `test -d backend/go && test -d web && test -d docs && test -d scripts && test -d e2e`
- `rg -n "^## Scope" backend/go/README.md web/README.md docs/README.md scripts/README.md e2e/README.md`

## Change Audit

open-kraken is not a Git root, so change review must use file-based auditing instead of `git status`.

- Primary inventory entrypoint: `bash scripts/audit-changes.sh --summary`
- Focused review entrypoint: `bash scripts/audit-changes.sh --review`
- NPM alias: `npm run audit:changes`

Audit rules:

- `--summary` prints the current file inventory under the repository root and is the default audit command before reporting completion.
- `--review` fails with exit code `20` when machine-local artifacts are present, including `.env`, `.DS_Store`, `.idea` workspace files, and `.open-kraken-run/backend.log`.
- Manual review is required whenever bootstrap seeds `.env` files, runtime probes emit `.open-kraken-run/backend.log`, or editor metadata appears in the inventory, because those files are local-state outputs rather than portable migration artifacts.

## Relationship To Legacy Golutra

- Legacy Golutra remains the source of historical architecture, behavior, and migration input.
- open-kraken is the only write target for the new migration program.
- If a legacy file is needed for reference, copy or translate the required intent into open-kraken instead of extending the old tree in place.
