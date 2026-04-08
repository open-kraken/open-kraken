# scripts

## Scope

- Canonical dev entrypoints, verification scripts, mock services, migration helpers, release helpers, and CI-reusable commands.
- Single home for cross-directory execution entrypoints; do not scatter shell/js/python launchers at the repository root.
- Product code stays in `backend/go` or `web`; this directory only orchestrates and automates.

## Ownership

- Integration scaffolding, mocks/fixtures, deployment/runtime helpers, migration tooling, and unified verification entrypoints.

## Dependency direction

- May invoke implementations or configuration from `backend/go`, `web`, `docs`, and `e2e`.
- Used by developers, local workflows, and CI as unified entrypoints.
- Must not be depended on by product runtime code as a core business library.

## Entrypoints

- Mock server: `node scripts/mock-server/server.mjs`
- Migration bootstrap: `bash scripts/bootstrap-migration.sh`
- Go toolchain check: `bash scripts/check-go-toolchain.sh`
- Dev start: `bash scripts/dev-up.sh`
- Dev stop: `bash scripts/dev-down.sh`
- Full verification: `bash scripts/verify-all.sh`
- Runtime verification: `bash scripts/verify-runtime.sh`
- Non–git-root inventory: `bash scripts/audit-changes.sh --summary`
- Non–git-root manual review: `bash scripts/audit-changes.sh --review`

## Go environment rules

- Repository-level Go commands must resolve the binary via `scripts/lib/go-env.sh` and clear shell-injected `GOROOT` / `GOPATH` / `GOTOOLDIR`.
- Do not require callers to hand-set `GOROOT=/... go test`; unified entrypoints absorb local drift.
- `scripts/check-go-toolchain.sh` is the canonical toolchain detection and error reporting entry; `scripts/bootstrap-migration.sh --check` and `scripts/verify-runtime.sh` delegate to it.
- Report toolchain drift only through repository gates such as `bash scripts/check-go-toolchain.sh`, `npm run test:go`, `npm run test:go:workspace`, `npm run test:go:projectdata`; do not document bare `go test` as an equivalent gate in READMEs or runbooks.
- For projectdata persistence, reference `npm run test:go:projectdata` from the repository root without adding explicit `GOROOT` or bare `go test` as “equivalent” commands.

## Audit rules

- open-kraken may not be a git root; do not rely on `git status` as the default change audit.
- Run `bash scripts/audit-changes.sh --summary` for inventory, then `bash scripts/audit-changes.sh --review` when human review is needed.
- `--review` exits `20` when review is required (e.g. `.env`, `.DS_Store`, `.idea/*`, `.open-kraken-run/backend.log`).
