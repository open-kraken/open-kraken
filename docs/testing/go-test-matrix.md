# Go Test Matrix

## Scope

This repository uses three Go test layers under `/Users/claire/IdeaProjects/open-kraken/backend/go`:

- `unit`: implementation-adjacent tests that live with the package they exercise, such as `internal/.../*_test.go` and `contracts` package safety checks that are not external API compatibility gates.
- `contract`: compatibility checks in `backend/go/tests/contract` for DTOs, event names, wire enums, payload shapes, and other external guarantees consumed by web, realtime, or migration tooling.
- `integration`: cross-package assembly checks in `backend/go/tests/integration` for domain + authorization + transport-adjacent flows that must stay aligned when the packages are composed together.

## Boundary Rules

- `unit` may assert private invariants, exact validation branches, and package-local error behavior.
- `unit` must not be the only place where externally consumed DTO, event, or payload guarantees are frozen.
- `contract` must assert exported compatibility only.
- `contract` must not inspect private state, rely on package-local helpers, or encode implementation sequencing that callers cannot observe.
- `integration` must exercise assembled flows across package boundaries, shared fixtures, or runtime wiring seams.
- `integration` must not degrade into pure field-by-field DTO snapshots that belong in `contract`.
- `integration` must not duplicate narrow branch testing that already belongs in `unit`.

## Testkit Rules

- Shared helpers live in `backend/go/testing/testkit`.
- `testkit` may contain fixtures, test context assembly, and assertion helpers.
- `testkit` must not copy production business logic, validation branches, or policy decisions from `internal/...`.
- If a helper starts mirroring production behavior instead of assembling inputs or asserting outputs, move that logic back into tests or production code.

## Gate Script

The unified gate is `scripts/verify-go-tests.sh`.

- Repository-owned Go toolchain detection/reporting lives at `scripts/check-go-toolchain.sh`.
- Root callers must use `npm run test:go` or `npm run test:go:workspace`.
- The domain-model mainline must use `npm run test:go:domain` when a change is about repository boundary, file-store replacement seam, message status enums, or domain/contract alignment.
- The persistence-focused slice may use `npm run test:go:projectdata` when a change is intentionally limited to roadmap/project-data storage semantics.
- Root-level `go test ./...` is not a valid repository gate in this workspace layout and must not be used in CI, docs, or review checklists as evidence of backend correctness.
- The gate clears inherited `GOROOT`, `GOTOOLDIR`, and `GOPATH` before invoking Go, so repository verification does not rely on manual shell exports.
- Default mode runs layered gates in this order: `unit`, `contract`, `integration`.
- `workspace` mode runs `go test ./...` from `backend/go` as a broad smoke entrypoint when callers need a single recursive Go invocation.
- `projectdata` mode runs only `./internal/projectdata/...` and is the narrow validation entry for the persistence mainline while multi-process coordination remains explicitly unsupported.
- `domain` mode runs `./internal/domain/...` and `./tests/contract/...` together as the fixed gate for the domain-model mainline.
- `importer` mode runs only `./internal/migration/importer/...` and is the narrow validation entry for importer preflight contracts, `chat.redb` discovery classification, alias staging hooks, and rollback token boundaries.
- `projectdata` mode must be run under single-writer topology. If a caller explicitly marks the topology as multi-writer, the script must fail preflight instead of pretending to validate an unsupported deployment shape.
- The script prints the exact stage and command before execution so failures are attributable to a layer.

Exit code semantics:

- `0`: all requested gates passed.
- `10`: script or repository preflight failed.
- `20`: unit regression.
- `21`: unit blocked by an existing environment/toolchain issue.
- `30`: contract regression.
- `31`: contract blocked by an existing environment/toolchain issue.
- `40`: integration regression.
- `41`: integration blocked by an existing environment/toolchain issue.
- `50`: workspace-wide `go test ./...` regression.
- `51`: workspace-wide `go test ./...` blocked by an existing environment/toolchain issue.
- `60`: projectdata persistence regression.
- `61`: projectdata persistence blocked by an existing environment/toolchain issue.
- `80`: domain mainline regression.
- `81`: domain mainline blocked by an existing environment/toolchain issue.
- `90`: importer contract regression.
- `91`: importer contract blocked by an existing environment/toolchain issue.

## Go Environment Handling

As of `2026-04-03`, one local shell inherited a stale `GOROOT` and produced:

```text
compile: version "go1.25.3" does not match go tool version "go1.25.6"
```

The repository gate now clears inherited `GOROOT`, `GOTOOLDIR`, and `GOPATH` before running Go. If the same message still appears through `npm run test:go` after sanitization, treat it as a real machine-level toolchain issue. If the sanitized gate instead reaches package assertions and fails tests, classify that as a repository regression.

Canonical diagnosis path before escalating a Go environment issue:

```bash
cd /Users/claire/IdeaProjects/open-kraken
bash scripts/check-go-toolchain.sh
```

Repro command for the raw shell-level mismatch:

```bash
cd /Users/claire/IdeaProjects/open-kraken/backend/go && go test ./...
```

Repository-safe verification entry:

```bash
cd /Users/claire/IdeaProjects/open-kraken && npm run test:go:projectdata
```

Repository-safe domain entrypoint:

```bash
cd /Users/claire/IdeaProjects/open-kraken && npm run test:go:domain
```

Result semantics for the persistence-focused gate:

- pass: `npm run test:go:projectdata` exits `0`
- blocked: `npm run test:go:projectdata` exits `61` because sanitized toolchain resolution still cannot run Go tests
- fail: `npm run test:go:projectdata` exits `60` on projectdata regressions, or exits `10` when the caller explicitly declares unsupported multi-writer topology

The repository-safe entrypoint is the only supported validation command for this slice. Do not replace it with hand-written `env GOROOT=... go test ...` commands in docs, review comments, or runbooks.
