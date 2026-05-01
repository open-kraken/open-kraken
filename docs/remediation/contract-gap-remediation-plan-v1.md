# Contract Gap Remediation Plan — v1

**Status:** First pass. Based on contract-checker findings (round 1).  
**Merge point:** Backend, frontend, and flow-inspector findings can be added as new rows in §3 and new tasks in §4.  
**Last updated:** 2026-04-29

---

## 1. Severity Legend

| Level | Meaning |
|-------|---------|
| P0 | Hard runtime failure — feature broken for users right now |
| P1 | Silent degradation — error handling, staleness, or misleading UX |
| P2 | Docs/contract drift — no current user-facing breakage but a hazard for future work |

---

## 2. Owner Lane Legend

| Lane | Who |
|------|-----|
| BE | Backend Go (handlers, routes, service layer) |
| FE | Frontend TypeScript/React |
| DOCS | Contract docs, OpenAPI YAML |
| BE+DOCS | Backend with paired doc update required |
| FE+BE | Coordinated change across both sides |

---

## 3. Issue Task Matrix

### Issue 1 — Skills reload endpoint missing (`POST /skills/reload`)

| Field | Value |
|-------|-------|
| **Title** | Skills reload endpoint mismatch |
| **Severity** | P0 |
| **Affected FE** | `web/src/api/skills.ts:36-38`, `web/src/pages/skills/SkillsPage.tsx:811` |
| **Affected BE** | `backend/go/internal/api/http/handler.go:125,210`, `backend/go/internal/api/http/handlers/skill.go` |
| **Affected DOCS** | `docs/api/http-websocket-contract.md`, `docs/api/openapi.yaml` |
| **Fix scope** | Small — add `POST /skills/reload` route in `handler.go` + implement handler method in `skill.go`. Re-use existing scan/reload logic. |
| **Dependency** | None |
| **Owner lane** | BE+DOCS |
| **Execution order** | **1** (quick win, isolated, unblocks UX immediately) |

**Notes:**  
- Integration test at `backend/go/tests/integration/skill_system_test.go:141` already skips on 501, so the test scaffold exists — just needs the route.  
- `POST /skills/import` exists and handles file-based import. The reload endpoint should call the file-system scan path, not duplicate import logic.  
- Doc update: add `POST /api/v1/skills/reload → 200 {loaded, skipped, reloadedAt}` to openapi.yaml and http-websocket-contract.md.

---

### Issue 2 — Error envelope drift across HTTP handlers

| Field | Value |
|-------|-------|
| **Title** | Shared error envelope drift |
| **Severity** | P1 |
| **Affected FE** | `web/src/api/http-client.ts:1-7` (type `HttpErrorEnvelope`), error-display components consuming `HttpClientError` |
| **Affected BE** | `backend/go/internal/api/http/handlers/terminal.go:209` (bare `{error}`), `handlers/taskqueue.go:137`, any handler using `map[string]string{"error": ...}` or `map[string]any{"message": ...}` inline |
| **Affected DOCS** | `docs/api/http-websocket-contract.md` §Error Responses |
| **Fix scope** | Medium — add shared `respondError(w, status, code, message, requestId)` helper in `handlers/`; sweep all handlers to use it; add `retryable?: boolean` to FE type |
| **Dependency** | None; FE type update can land after BE helper exists |
| **Owner lane** | BE then FE |
| **Execution order** | **2** (BE helper first, then FE type narrowing) |

**Notes:**  
- WS handshake at `handlers/realtime.go:311-316` already emits `{code, message, requestId, retryable}` — use that as the canonical shape.  
- `parseErrorEnvelope` in `http-client.ts:81` already falls back gracefully on missing fields, so the FE won't break during the rollout window.  
- `retryable` field is in WS docs and realtime handler but absent from the FE `HttpErrorEnvelope` type — add `retryable?: boolean` to the type definition.  
- Roster handlers use `{message}` (no `code`), terminal uses `{error}` (no `message`) — both need normalisation.

---

### Issue 3 — WebSocket path stale in OpenAPI / docs

| Field | Value |
|-------|-------|
| **Title** | WebSocket docs stale (`GET /api/ws` vs runtime `/ws`) |
| **Severity** | P2 |
| **Affected FE** | `web/src/config/env.ts:41` (already correct: defaults to `ws://127.0.0.1:8080/ws`) |
| **Affected BE** | None — runtime path `/ws` is correct |
| **Affected DOCS** | `docs/api/openapi.yaml` (documents `GET /api/ws`), `docs/api/http-websocket-contract.md:654` |
| **Fix scope** | Small — docs-only: correct path from `/api/ws` to `/ws`; note `/realtime` alias if it exists at runtime |
| **Dependency** | None |
| **Owner lane** | DOCS |
| **Execution order** | **1** (parallel with Issue 1 — pure docs, zero risk) |

**Notes:**  
- Frontend `env.ts:98-118` already rewrites localhost dev URL to `/ws` correctly.  
- Clarify in docs whether `/realtime` is a live alias or a deprecated path; if alias, document both.

---

### Issue 4 — Workspace-scoped terminal contract broader than backend

| Field | Value |
|-------|-------|
| **Title** | Workspace terminal formal contract broader than backend |
| **Severity** | P1 |
| **Affected FE** | `web/src/pages/terminal/` — currently uses flat `/api/v1/terminal/sessions*`, not workspace-scoped paths |
| **Affected BE** | `backend/go/internal/api/http/handlers/workspace.go:181-228` (list + attach only), `handler.go` (no workspace-scoped create/dispatch routes registered) |
| **Affected DOCS** | `docs/api/http-websocket-contract.md:536-654`, `docs/api/openapi.yaml:262,317` (`POST /workspaces/{id}/terminals`, `POST /workspaces/{id}/terminals/{id}/dispatch`) |
| **Fix scope** | Medium-Large — **requires product decision first**: (a) implement workspace-scoped create+dispatch in BE, or (b) narrow docs to `GET /workspaces/{id}/terminals` + `GET /workspaces/{id}/terminals/{id}/attach` only and declare `/api/v1/terminal/sessions*` as the canonical namespace |
| **Dependency** | Product decision gates BE scope; docs update is independent of that decision |
| **Owner lane** | BE+DOCS (after decision) |
| **Execution order** | **3** — needs decision; docs narrowing can proceed immediately as order **1.5** |

**Notes:**  
- `docs/mock-and-fixture.md:67` references `GET /api/workspaces/{workspaceId}/terminal/sessions/{terminalId}/attach` — note path inconsistency (`terminal/sessions` vs `terminals`).  
- Safest near-term action: narrow docs to describe only what exists; flag `POST .../terminals` and `POST .../terminals/{id}/dispatch` as "planned, not yet implemented".  
- Frontend currently functional because it bypasses workspace-scoped paths entirely.

---

## 4. Remediation Execution Order

```
Wave 1 (parallel, low risk, quick wins)
  [1a] Issue 3  — Fix WS path in docs/openapi.yaml          DOCS
  [1b] Issue 1  — Add POST /skills/reload route + handler    BE+DOCS

Wave 2 (medium scope, no hard dependencies on Wave 1)
  [2a] Issue 2  — BE: add shared respondError helper + sweep BE
  [2b] Issue 4  — DOCS: narrow workspace terminal contract   DOCS

Wave 3 (dependent on Wave 2 completing)
  [3a] Issue 2  — FE: add retryable to HttpErrorEnvelope     FE
  [3b] Issue 4  — BE: implement or formally defer            BE (post-decision)
```

---

## 5. Merge Protocol for Incoming Findings

When backend-auditor, frontend-auditor, or flow-inspector reports arrive, slot new issues into this matrix:

1. Assign an **Issue N** number (continue from 4).  
2. Fill all 8 fields in §3.  
3. Assign severity (P0/P1/P2).  
4. Check if it creates a dependency on an existing wave item — if so, note it in the Dependency field and re-sequence §4 accordingly.  
5. If a new finding overlaps an existing issue (e.g., backend-auditor finds more bare `{error}` patterns), add a **Notes** sub-bullet under the existing issue rather than creating a new row.

---

## 6. Open Questions (requires Leader / product input)

| # | Question | Blocking |
|---|----------|---------|
| Q1 | Should `POST /workspaces/{id}/terminals` create a terminal session (implement) or be removed from docs/contract (narrow)? | Issue 4 BE scope |
| Q2 | Is `/realtime` a live alias for `/ws` or a deprecated path to be removed? | Issue 3 docs clarity |
| Q3 | Should `requestId` in the error envelope be server-generated or echoed from the `X-Request-ID` header the client already sends? | Issue 2 BE design |
