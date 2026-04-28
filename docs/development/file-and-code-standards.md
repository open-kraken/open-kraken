# File And Code Standards

This document is the repository rulebook for adding, changing, moving, or deleting implementation files. It complements `AGENTS.md`; when a change is ambiguous, prefer the stricter rule here.

## Goals

- Keep feature code inside owned areas, not at the repository root.
- Make file ownership obvious from the path.
- Keep production code, tests, fixtures, generated assets, and docs separate.
- Remove dead or duplicate code only after proving it is not part of a production, test, migration, or contract surface.
- Preserve backend authority for security, runtime state, orchestration, and persistence.

## Top-Level Ownership

Use these roots only for the listed concerns:

| Path | Owns | Must Not Contain |
| --- | --- | --- |
| `backend/go` | Go backend, domain models, services, HTTP/WebSocket handlers, runtime orchestration, backend tests | React/UI code, browser-only fixtures |
| `web` | React app, frontend API clients, route pages, feature UI, browser state, frontend tests | Backend business logic, server-side authorization decisions |
| `backend/tests` | Shared backend integration fixtures | Production Go packages |
| `e2e` | Browser and smoke flows that cross process boundaries | Unit tests for one package/component |
| `docs` | Contracts, architecture, runbooks, development standards | Implementation code or throwaway scripts |
| `scripts` | Repository wrappers and automation entrypoints | Product runtime logic |
| `docker`, `k8s`, `ops` | Deployment and operations assets | Feature implementation |

Do not add feature code at the repository root. Root files should be coordination files such as `README.md`, `AGENTS.md`, `package.json`, or repository-level config.

## File Placement

### Backend Go

- Production packages live under `backend/go/internal`, `backend/go/cmd`, or `backend/go/contracts`.
- HTTP handlers live in `backend/go/internal/api/http/handlers`.
- Cross-cutting HTTP wiring lives in `backend/go/internal/api/http`.
- Domain/service packages should keep their own `model.go`, `service.go`, `repository.go`, and focused `*_test.go` files when applicable.
- Integration and contract tests belong under `backend/go/tests`, except package-local unit tests beside the package.
- SQL migrations live with the owning persistence package, for example `backend/go/internal/ael/migrations`.

### Frontend Web

- Route pages live in `web/src/pages/<route>/<RoutePage>.tsx` or `web/src/pages/<route>/<RoutePage>.ts` for non-React route logic.
- Feature components live in `web/src/features/<feature>`.
- Shared UI primitives live in `web/src/components/ui`.
- Shell-specific components live in `web/src/components/shell`.
- API clients live in `web/src/api`; versioned backend clients live under `web/src/api/v2` only when the backend route is versioned that way.
- Shared runtime state lives in `web/src/state`.
- Shared TypeScript types live in `web/src/types` only when used across multiple features; feature-local types stay near the feature.
- Global CSS lives in `web/src/styles`; feature-local CSS modules stay beside the feature component.
- Frontend tests live in `web/src/test`.

### Docs

- API and realtime contracts live under `docs/api` or `docs/backend`.
- Frontend-specific UX/runtime notes live under `docs/frontend`.
- Runtime and deployment runbooks live under `docs/runtime` or `docs/production-readiness`.
- Development standards live under `docs/development`.

## Naming

### Go

- Package names are short, lowercase, and singular when possible: `ledger`, `memory`, `taskqueue`.
- File names are lowercase with underscores only when they improve readability: `service_test.go`, `repository_pg.go`.
- Exported identifiers must describe stable API concepts; avoid exporting helper details just for tests.
- Error values use `ErrName` and live near the type/service that owns the invariant.
- HTTP handler constructors use `New<Name>Handler`; services use `NewService` inside their package.

### TypeScript And React

- React components use `PascalCase.tsx`.
- Non-component modules use `kebab-case.ts`, except established stores such as `dashboardStore.ts` should not be renamed casually.
- API client files use the backend domain name: `agents.ts`, `taskqueue.ts`, `terminal.ts`.
- Route page components end in `Page`: `TaskMapPage`, `NodesPage`.
- Hooks start with `use`.
- Test files use `*.test.ts`, `*.test.tsx`, or existing `*.test.mjs` only for legacy tests that have not yet been migrated.
- Avoid duplicate component names across different feature folders unless they are clearly local and not exported.

### CSS

- Prefer existing design tokens and classes before adding new tokens.
- Use CSS modules for component-specific styling when the component already uses modules.
- Use global CSS only for shell-wide layout, route-level structural classes, or legacy styles that are intentionally shared.
- Do not add one-off utility classes in unrelated global files when the style belongs to a single component.

## Code Rules

### Backend

- Format Go with `gofmt`.
- Do not add package cycles or hidden dependencies on `web`.
- Keep authorization, task state, agent lifecycle, terminal dispatch, and persistence mutations server-authoritative.
- Validate request payloads at the handler/service boundary.
- State transitions must go through the owning service or FSM; do not mutate persisted status fields from unrelated packages.
- Repository interfaces should expose domain operations, not raw query convenience methods for UI shortcuts.
- Realtime events are read fan-out; do not make WebSocket handlers the primary mutation authority.

### Frontend

- Use TypeScript for all new frontend code.
- Treat backend API responses as untrusted: normalize values at API-client boundaries.
- Do not enforce security only in the browser; show backend state, errors, and authorization failures.
- Keep route pages responsible for composition and workflow, not reusable low-level UI primitives.
- Prefer existing UI primitives from `web/src/components/ui`.
- Do not leave mock data in production routes unless the route explicitly documents it as a prototype or fallback state.
- New controls that mutate backend state must call a typed API client and surface loading/error states.
- Avoid unused exported feature components. If a component exists only for a future design, document it in a backlog instead of keeping it in production source.

### API Clients

- Use `getHttpClient()` for versioned `/api/v1` calls.
- Keep response mapping in the API client, not inside route components.
- Export input/output types that match frontend usage, not raw backend maps.
- Avoid adding another generic client unless the existing `HttpClient` cannot express the backend route.
- Legacy clients may remain only while `AppProviders` or tests still depend on them; new routes should use the typed clients.

### Tests

- Add or update the narrowest test that protects the changed behavior.
- Backend package behavior gets package-local tests first.
- Cross-package assembly belongs under `backend/go/tests`.
- Frontend API clients should have direct client tests when they normalize data or call mutation endpoints.
- UI route changes should use existing route/page tests when possible.
- Do not keep tests that only assert an unused component is exported. If the component is removed, remove or replace the export-only test.

## Deleting Or Moving Files

Before deleting or moving a file, run a focused reachability check:

1. Search direct imports and references with `rg`.
2. Check route registration, backend handler wiring, script entrypoints, docs references, and tests.
3. For Go, remember every `.go` file in a package participates in package compilation; package-level dependency checks are more useful than file-level import checks.
4. For frontend, check both production reachability from `web/src/main.tsx` and direct test imports.
5. If a file is only used by an obsolete test, delete or rewrite the test in the same change.
6. If a file is a documented contract, migration tool, fixture, or backlog implementation skeleton, do not delete it without updating the owning doc.

High-confidence deletion candidates must satisfy all of these:

- No production import path reaches the file.
- No canonical script or build entrypoint requires it.
- No contract, migration, or runtime doc names it as an owned artifact.
- Tests either do not reference it, or the same change removes/replaces those tests.
- The deletion does not remove a public API route, exported backend contract type, database migration, or fixture used by integration tests.

## Generated And Local Files

- Do not commit secrets, `.env` files, local logs, editor metadata, or `.open-kraken-run` contents.
- Generated files must have a documented source command.
- Do not manually edit generated files unless the generator is also updated or the file is explicitly no longer generated.
- Keep dependency lockfiles only in the package that owns the dependency graph.

## Verification Matrix

Run the smallest relevant check first, then broaden when the blast radius grows:

| Change Type | Minimum Check |
| --- | --- |
| Go package logic | `npm run test:go` or a documented focused Go gate |
| Domain model/repository contract | `npm run test:go:domain` |
| Runtime/deployment path | `npm run verify:runtime` |
| Frontend API client or route logic | `cd web && npm run typecheck` plus focused `tsx --test ...` |
| Frontend route tree | `npm run test:web:routes` |
| User-visible UI change | Relevant unit/route test plus screenshot or manual browser check when practical |
| Cross-service behavior | `npm run verify:all` or the narrowest affected integration/e2e command |

If a canonical check is blocked by an existing repository issue, record the exact command, failure class, and the narrower checks that passed.

## Review Checklist

Use this checklist before marking a change done:

- Files are in the owned directory for their concern.
- No feature code was added at the root.
- Names match local conventions.
- No stale mock data, unused exports, or duplicate components were introduced.
- Backend-owned state remains backend-owned.
- API clients normalize response shape and surface errors.
- Tests cover the behavior at the narrowest useful layer.
- Docs or contracts were updated when behavior changed.
- Local-only artifacts were not committed.
