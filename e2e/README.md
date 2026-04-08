# e2e

## Scope

- Smoke flows across backend and frontend, integration-style browser flows, regression acceptance cases, and shared end-to-end assets.
- Keep end-to-end acceptance scripts in this directory; do not scatter scenario scripts across `web`, the repository root, or temp folders.
- e2e validates system behavior end-to-end; it does not own domain implementation.

## Ownership

- Web unit tests vs e2e smoke, front/back integration scaffolding, and production-readiness regression lists.

## Dependency direction

- Depends on executable entrypoints or mock environments exposed by `web`, `backend/go`, and `scripts`.
- May read acceptance matrices and contracts from `docs` for assertions.
- Must not be depended on by runtime product code, and must not define new business contracts that constrain source implementations.

## Entrypoints

- Smoke: `cd web && npm run test:e2e:smoke`
- Browser automation placeholder: `npm run test:e2e:browser`
- Example smoke assets: `e2e/smoke`
- Browser automation placeholder assets: `e2e/browser`
- Unified end-to-end verification (delegated): `scripts/verify-all.sh`
