# Repository Guidelines

## Project Structure & Module Organization

open-kraken is a Go backend plus React/Vite web app. Keep implementation inside owned top-level areas:

- `backend/go`: Go services, domain models, auth, HTTP/WebSocket APIs, realtime, terminal orchestration, and backend tests.
- `web`: React shell, routes, feature UI, API clients, state, styles, and tests under `web/src/test`.
- `backend/tests`: shared fixtures for backend integration and contract tests.
- `e2e`: smoke and browser-oriented end-to-end checks.
- `docs`, `scripts`, `k8s`, `ops`, `docker`: design notes, wrappers, deployment, observability, and containers.

Do not add feature code at the repository root.

Use `docs/development/file-and-code-standards.md` as the canonical rulebook for file placement, naming, code style, deletion checks, and verification scope.

## Build, Test, and Development Commands

- `npm run dev:up` / `npm run dev:down`: start or stop the local stack.
- `npm run verify:all`: run the main verification chain.
- `npm run verify:runtime`: validate runtime/deployment readiness.
- `npm run test:go`: run the canonical Go gate; use scoped variants such as `npm run test:go:domain` for focused changes.
- `npm run test:web:unit` and `npm run test:web:routes`: run frontend unit tests and route tree checks.
- `npm run test:e2e:smoke` or `npm run test:e2e:playwright`: run e2e smoke or Playwright tests.
- `cd web && npm run dev`: run only the Vite frontend during UI work.

## Coding Style & Naming Conventions

Format Go with `gofmt` and keep packages under `backend/go/internal`, `backend/go/cmd`, or `backend/go/contracts`. React uses TypeScript, `.tsx` components, and existing route, store, and feature naming patterns. Keep CSS in `web/src/styles` or established feature-local files. Use server contracts from `docs` and `backend/go`.

## Testing Guidelines

Place frontend tests in `web/src/test` using `*.test.ts`, `*.test.tsx`, or `*.test.mjs`. Backend integration and contract tests live under `backend/go/tests`; shared fixtures live under `backend/tests`. For Go, use repository scripts instead of root-level `go test ./...`. Run the narrowest relevant test first.

## Commit & Pull Request Guidelines

Git history uses Conventional Commit style with scopes, for example `feat(auth): add authentication system with JWT and login endpoints`. Use short imperative subjects and scopes such as `web`, `auth`, `ledger`, `ael`, or `k8s`.

Pull requests should describe the change, list verification commands, link issues or docs, and include screenshots for visible UI changes. Note skipped checks, migrations, or deployment impacts.

## Security & Configuration Tips

Keep secrets out of Git. Local state may appear under `.open-kraken-run`, `.open-kraken-data`, or seeded `.env` files; review with `npm run audit:changes`. Authorization is server-authoritative, so UI changes should display backend state and errors rather than enforcing security only in the browser.
