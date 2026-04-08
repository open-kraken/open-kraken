# docs

## Product vision and architecture

- **[product-vision-and-architecture.md](product-vision-and-architecture.md)** — open-kraken positioning (claw-code × Golutra × OpenClaw as one deliverable), cross-server multi-agent coordination, centralized ledger and memory, frontend observability responsibilities, and **alignment / gaps** vs the current codebase.
- **[action-items-and-current-state.md](action-items-and-current-state.md)** — **current implementation snapshot**, backlog / action items (scheduling, teams, HA, skill import/export, optional vector memory), and **non-goals** (e.g. P2P mesh).
- **[architecture/langgraph-and-ray-design-references.md](architecture/langgraph-and-ray-design-references.md)** — **LangGraph** and **Ray** (web-sourced design summaries: agent runtime, checkpoints, tasks/actors; **reference only**, not a default stack).
- **[observability/langfuse-integration.md](observability/langfuse-integration.md)** — **Langfuse** (LLM traces via OTLP, deployment options, correlation with workspace/member ids; complements **tokentrack** / **ledger**).

## Scope

- Migration design, module mapping, contracts, runbooks, risk lists, acceptance matrices, and release notes.
- Documentation is the collaboration source of truth, not a code dump; do not park implementation code or throwaway scripts here.
- Preserve legacy Golutra knowledge as migrated documents in this tree, not by writing back to the old repository.

## Ownership

- Architecture reviews, API/realtime contracts, auth models, deployment, data migration, production readiness, test matrices, and migration notes.

## Dependency direction

- May reference factual state in `backend/go`, `web`, `scripts`, and `e2e`.
- Read by `web`, `backend/go`, `scripts`, and contributors as contract input.
- Must not become a runtime code dependency or a patch layer for implementation shortcuts.

## Entrypoints

- Search: `rg -n "migration|contract|auth|mock" docs`
- Production readiness: `production-readiness/README.md`
- Repository-level checks: `npm run verify:migration`, `bash scripts/verify-runtime.sh`, `curl -i http://127.0.0.1:8080/healthz`
- Unified doc verification (delegated): `scripts/verify-all.sh`
- Top-level overview: repository root `README.md`
