# Production Regression Checklist

## Release Gates

Each item must be marked as passed only when the pass criteria is satisfied in the target environment or by the repository gate explicitly named in `Suggested Verification`.
The release owner is responsible for `npm run verify:all`; the CI / automation owner must mirror that exact command when repository CI is added.

| Area | Scenario | Pass Criteria | Suggested Verification | Owner |
| --- | --- | --- | --- | --- |
| Chat | Conversation list, message list, and send flow remain usable | A user can load conversations, open a thread, send a message, and observe the persisted message rendered in order without manual refresh | `npm run test:web:unit` and `npm run verify:migration` | web owner |
| Member status | Member roster and role/state indicators stay accurate | Member cards show the expected role, presence/work status, and avatar/name metadata, and status changes render without layout breakage on desktop and narrow widths | `npm run test:web:unit` and `npm run verify:migration` | web owner |
| Roadmap | Roadmap and project data views preserve read/write flow | Roadmap/project data screens can load initial state, submit an edit/create action, show success/error state, and reflect the latest persisted value | `npm run test:go` and `npm run verify:migration` | backend/go owner |
| Terminal | Session attach and streamed output remain functional | A client can attach to a session, receive snapshot or buffered output, observe incremental output/status changes, and see a clear failure state if dispatch is unavailable | `npm run test:go` and `npm run verify:migration` | terminal owner |
| Authentication and authorization | Role enforcement still matches the owner/supervisor/assistant/member matrix | Protected operations reject unauthorized roles, allowed roles succeed, and the frontend read model hides or disables actions that the server forbids | `npm run test:go` plus `/Users/claire/IdeaProjects/open-kraken/docs/backend/authz-enforcement-and-go-env.md` contract review | authz owner |
| Deployment health | Runtime surface is releasable | Static assets serve successfully, API health endpoint reports ready, websocket/realtime endpoint upgrades successfully, required env/config values are present, and the same gate is runnable under remote automation | `bash /Users/claire/IdeaProjects/open-kraken/scripts/verify-runtime.sh`; `npm run verify:runtime`; `curl -i http://127.0.0.1:8080/healthz`; `npm run ci:remote-verify`; `npm run verify:production-readiness` | deployment/runtime owner |
| Remote executor | Remote automation still uses the repository-owned unified gate and persists evidence | The checked-in workflow calls `scripts/ci/run-remote-verify.sh`, that script runs `npm run verify:all`, and `.open-kraken-artifacts/ci` is produced for upload | `npm run verify:production-readiness` and repository review of `.github/workflows/verify.yml` + `scripts/ci/run-remote-verify.sh` | CI / automation owner |
| API/WS/terminal/authz sync | API/WS/terminal/authz docs remain bound to runtime and verification entrypoints | OpenAPI, HTTP/WS behavior, realtime vocabulary, and authz enforcement docs still name the current sync guard, runtime gate, health endpoint, and cross-document contract links | `npm run verify:contract-sync` and `npm run verify:production-readiness` | API contract owner |
| Release aggregation | All production-facing docs and gates still point to real repository entrypoints | Production-readiness docs name the current runtime probe, health endpoint, alert source, and release gate without stale command drift | `npm run verify:production-readiness` and `npm run verify:all` | release owner |

## Sign-off Rules

- Do not sign off a release if any critical flow is only checked by module presence rather than pass criteria.
- `npm run verify:migration` is the repository-level aggregator for the current migration stage; if it fails, release sign-off remains open even if a single lower-level gate passes.
- `npm run verify:all` is the release-owner gate and the intended future CI gate; partial command subsets do not replace it.
- `npm run verify:runtime` is the runtime/deployment gate; runtime owners must use it instead of ad hoc `go run` plus manual curl checks when claiming deployment readiness.
- `npm run verify:contract-sync` is the single API/WS/terminal/authz doc-binding guard; changing those docs or their runtime bindings without keeping it green leaves release sign-off open.
- Any API/WS/terminal/authz behavior change that updates `/Users/claire/IdeaProjects/open-kraken/docs/api/openapi.yaml`, `/Users/claire/IdeaProjects/open-kraken/docs/api/http-websocket-contract.md`, `/Users/claire/IdeaProjects/open-kraken/docs/backend/realtime-contract.md`, or `/Users/claire/IdeaProjects/open-kraken/docs/backend/authz-enforcement-and-go-env.md` must also keep `npm run verify:production-readiness` green in the same change.
- If a gate uses mocks, record the missing production check and the owner who will replace it with a real environment check.
- When a known risk forces a degraded mode, the related gate must state the degraded acceptance explicitly before release approval.
