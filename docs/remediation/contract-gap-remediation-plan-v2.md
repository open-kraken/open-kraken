# Contract Gap Remediation Plan — v2 (Consolidated Final)

**Status:** Consolidated. Incorporates contract-checker (round 1), frontend-auditor, flow-inspector, and backend-auditor findings.  
**Last updated:** 2026-04-29  
**Previous version:** `contract-gap-remediation-plan-v1.md`

---

## 0. Calibration from Flow-Inspector

The flow-inspector confirmed these flows are **materially closed and should not be treated as broken**:

| Flow | Status |
|------|--------|
| Authentication (login → /auth/me → localStorage token) | ✅ Closed |
| Chat / messaging (CRUD + realtime /ws) | ✅ Closed |
| Agent / session lifecycle (PTY, WS streaming, terminal FSM) | ✅ Closed |
| AEL v2 (runs/flows/steps, FSMs, PG, etcd leases) | ✅ Closed |
| Node management (register/list/heartbeat/assign/remove) | ✅ Closed |
| Task queue (enqueue/list/claim/start/ack/nack/cancel/stats) | ✅ Closed |

Remediation priority is therefore concentrated on **security defects in otherwise-healthy flows**, **contract drift at the edges of closed flows**, **non-durable UI actions**, **mock-backed routes**, and **product-model ambiguity**. Do not reopen or re-implement these core paths.

---

## 1. Severity / Category Legend

| Code | Meaning |
|------|---------|
| **SEC** | Security defect — authentication bypass, data isolation failure, or event leakage |
| **P0** | Hard runtime failure or confirmed test regression — user action broken today |
| **P1** | Silent degradation — wrong data, misleading UX, or data-loss risk under concurrency |
| **P2** | Drift only — no current user-facing breakage, but hazardous for future work |
| **PROD** | Product-model decision required before implementation |
| **DOCS** | Documentation-only update — no code change needed |

---

## 2. Owner Lane Legend

| Lane | Who |
|------|-----|
| BE | Backend Go |
| FE | Frontend TypeScript / React |
| DOCS | Contract docs, OpenAPI YAML |
| BE+DOCS | Backend change with paired doc update |
| FE+BE | Coordinated cross-boundary change |
| PRODUCT | Needs product / IA decision before any code |

---

## 3. Consolidated Issue Matrix

---

### CATEGORY A — Security & Runtime Defects

---

#### A1 — Auth bypass: dev tokens not gated by JWT_SECRET presence

| Field | Value |
|-------|-------|
| **Severity** | **SEC** |
| **Source** | Backend-auditor B2 |
| **Affected BE** | `internal/platform/http/authmw.go:46-47`, `internal/authn/adapter.go:14` |
| **Affected FE** | None |
| **Affected DOCS** | None |
| **Fix scope** | Small — gate `open-kraken-dev.*` pass-through behind `cfg.JWTSecret == ""` check in `authmw.go`; `ResolvePrincipal` should reject dev-prefix tokens when a real secret is configured. Login handler should stop issuing dev-format tokens when JWT is active. |
| **Dependency** | None; standalone |
| **Owner lane** | BE |
| **Wave** | **0** (security — ship before anything else) |

**Notes:** `authmw_test.go:106-111` currently asserts that dev tokens pass through unconditionally — that test must be updated to assert the new conditional behavior.

---

#### A2 — Realtime handshake does not enforce requested member identity

| Field | Value |
|-------|-------|
| **Severity** | **SEC** |
| **Source** | Backend-auditor B1 |
| **Affected BE** | `internal/api/http/handlers/realtime.go` (HandleWS) |
| **Affected FE** | None |
| **Affected DOCS** | `docs/api/http-websocket-contract.md` §WebSocket Handshake |
| **Fix scope** | Medium — after resolving principal via `authn.ResolvePrincipal`, assert `principal.MemberID == query.memberId`; reject mismatches with 403. Subscription family enforcement: only deliver event families that the authenticated principal is permitted to receive. |
| **Dependency** | A1 (JWT enforcement must be solid before this check is meaningful) |
| **Owner lane** | BE |
| **Wave** | **0** |

**Notes:** This is a defence-in-depth gap in an otherwise closed Agent/session flow. Core chat and terminal streaming are functional, but the event filter boundary is too permissive.

---

#### A3 — Agent memory isolation broken: owner_id not filtered

| Field | Value |
|-------|-------|
| **Severity** | **SEC / P0** |
| **Source** | Backend-auditor B4 |
| **Affected BE** | `internal/memory/repository.go` — `SELECT` queries at lines ~94 and ~131 do not include `WHERE owner_id = ?` predicate; uniqueness constraint also missing owner_id dimension |
| **Affected FE** | None |
| **Affected DOCS** | `docs/backend/memory-store-contract.md` |
| **Fix scope** | Medium — add `owner_id` predicate to all read/list/uniqueness queries; add composite index `(scope, key, owner_id)`. Verify L1–L4 memory API handlers pass the authenticated principal's member ID as `owner_id`. |
| **Dependency** | A1 (principal resolution must be reliable) |
| **Owner lane** | BE |
| **Wave** | **1** |

---

#### A4 — Skills reload endpoint missing (confirmed 404/405)

| Field | Value |
|-------|-------|
| **Severity** | **P0** |
| **Source** | Contract-checker C1, Backend-auditor B7 |
| **Affected BE** | `internal/api/http/handler.go:125,210`, `internal/api/http/handlers/skill.go` |
| **Affected FE** | `web/src/api/skills.ts:36-38`, `web/src/pages/skills/SkillsPage.tsx:811` |
| **Affected DOCS** | `docs/api/http-websocket-contract.md`, `docs/api/openapi.yaml` |
| **Fix scope** | Small — register `POST /skills/reload` in `handler.go`; add `HandleSkillReload` method in `skill.go` that calls the existing scan path. Integration test scaffold already exists at `skill_system_test.go:141` (currently skipped on 501). |
| **Dependency** | None |
| **Owner lane** | BE+DOCS |
| **Wave** | **1** |

---

#### A5 — Terminal audit report IDs can collide (confirmed test failure)

| Field | Value |
|-------|-------|
| **Severity** | **P0** |
| **Source** | Backend-auditor B8; confirmed by `TestListReports` (expected 2 reports for ws1, got 1) |
| **Affected BE** | `internal/terminal/audit/service.go:57` — `audit_%d` using `time.Now().UnixNano()` |
| **Affected FE** | None |
| **Affected DOCS** | None |
| **Fix scope** | Trivial — replace `time.Now().UnixNano()` with a UUID or `crypto/rand` hex string in the `idGen` function |
| **Dependency** | None |
| **Owner lane** | BE |
| **Wave** | **1** |

---

#### A6 — Skills empty-array PUT regression (confirmed test failure)

| Field | Value |
|-------|-------|
| **Severity** | **P0** |
| **Source** | Backend-auditor — `TestTC_S03_05_PUTEmptySkillsArray` expects 200, gets 400 ("skills can only be assigned to AI Assistant members") |
| **Affected BE** | `internal/api/http/handlers/` — roster/skills PUT handler validation logic |
| **Affected FE** | `web/src/pages/members/MembersPage.tsx` (skill assignment flow) |
| **Affected DOCS** | None |
| **Fix scope** | Small — empty-array body `[]` should be a valid clear-skills request for any member type; validation guard that rejects the request for non-assistant members is too broad. Clarify policy: either (a) allow empty clear for all role types, or (b) return 200 with no-op for non-assistant members. |
| **Dependency** | None |
| **Owner lane** | BE |
| **Wave** | **1** |

---

#### A7 — Roadmap/project-data optimistic concurrency not implemented in HTTP layer

| Field | Value |
|-------|-------|
| **Severity** | **P1** (data-loss risk under concurrent edits) |
| **Source** | Backend-auditor B5 |
| **Affected BE** | `internal/projectdata/repository.go` (has `ErrVersionConflict`), HTTP handlers for `PUT /roadmap` and `PUT /project-data` — `expectedVersion` is not read from request or mapped to `WriteOptions` |
| **Affected FE** | `web/src/features/roadmap-project-data/store.ts` (tracks version locally but may not send it) |
| **Affected DOCS** | `docs/api/http-websocket-contract.md` §Roadmap, §Project Data |
| **Fix scope** | Medium — wire `expectedVersion` from request body into `WriteOptions{ExpectedVersion}` in handlers; return 409 with current version when conflict detected. FE must include `expectedVersion` in PUT body. |
| **Dependency** | None; roadmap/project-data flow confirmed closed by flow-inspector but concurrency semantics unimplemented |
| **Owner lane** | BE+DOCS then FE |
| **Wave** | **2** |

---

#### A8 — Node WorkspaceID not persisted to storage

| Field | Value |
|-------|-------|
| **Severity** | **P1** |
| **Source** | Backend-auditor B6 |
| **Affected BE** | `internal/node/model.go:62` (field defined), `internal/node/` repository — `workspace_id` omitted from serialisation; `data/nodes/nodes.json` (JSON store) |
| **Affected FE** | None |
| **Affected DOCS** | `docs/backend/node-registry-contract.md` |
| **Fix scope** | Medium — add `workspace_id` to node JSON serialisation; add to `SELECT`/`INSERT` if using SQLite path; add workspace filter predicate to `List` and event delivery. Cross-reference: node management flow is closed, but workspace scoping is a correctness gap that will surface in multi-workspace deployments. |
| **Dependency** | None |
| **Owner lane** | BE+DOCS |
| **Wave** | **2** |

---

### CATEGORY B — Contract Drift (Partial Implementations / Mismatches)

---

#### B1 — Error envelope drift across HTTP handlers

| Field | Value |
|-------|-------|
| **Severity** | **P1** |
| **Source** | Contract-checker C2 |
| **Affected BE** | `handlers/terminal.go:209` (`map[string]string{"error": ...}`), `handlers/taskqueue.go:137`, roster handlers (`{message}` without `code`), and any inline error map — broad sweep needed |
| **Affected FE** | `web/src/api/http-client.ts:1-7` (`HttpErrorEnvelope` missing `retryable?: boolean`) |
| **Affected DOCS** | `docs/api/http-websocket-contract.md` §Error Responses |
| **Fix scope** | Medium — introduce shared `respondError(w, status, code, message, requestId string, retryable bool)` helper in `handlers/`; sweep all handlers to use it. WS handshake at `realtime.go:311-316` is the canonical shape. FE: add `retryable?: boolean` to `HttpErrorEnvelope`. |
| **Dependency** | None; `parseErrorEnvelope` in FE falls back gracefully, so rollout is safe |
| **Owner lane** | BE then FE |
| **Wave** | **2** (BE helper), **3** (FE type) |

---

#### B2 — Message status values mismatch: docs vs backend

| Field | Value |
|-------|-------|
| **Severity** | **P1** |
| **Source** | Backend-auditor B3 |
| **Affected BE** | `internal/message/model.go:26-29` — actual values: `sending`, `queued`, `delivered` |
| **Affected FE** | Any FE code switching on message status strings |
| **Affected DOCS** | `docs/api/http-websocket-contract.md` §Messages — documents `pending`, `sent`, `failed` |
| **Fix scope** | Small — decide canonical set (backend values are likely correct since the flow is closed); update docs and any FE string literals. Add `failed` if it is a valid terminal state that backend does not currently emit. |
| **Dependency** | None; chat flow is closed — this is a labelling fix |
| **Owner lane** | BE+DOCS then FE |
| **Wave** | **2** |

---

#### B3 — Workspace terminal contract broader than backend

| Field | Value |
|-------|-------|
| **Severity** | **P1** |
| **Source** | Contract-checker C4 |
| **Affected BE** | `handlers/workspace.go:181-228` — list + attach only; no `POST /workspaces/{id}/terminals` or `/dispatch` route registered |
| **Affected FE** | `web/src/pages/terminal/` — uses flat `/api/v1/terminal/sessions*` correctly; not affected by gap |
| **Affected DOCS** | `docs/api/http-websocket-contract.md:536-654`, `docs/api/openapi.yaml:262,317` |
| **Fix scope** | Near-term: narrow docs — mark `POST /workspaces/{id}/terminals` and `POST /workspaces/{id}/terminals/{id}/dispatch` as "planned, not yet implemented". Long-term: implement or formally defer (see C3). |
| **Dependency** | Product decision C3 for implementation scope |
| **Owner lane** | DOCS (near-term narrow); BE+DOCS (implementation wave) |
| **Wave** | **2** (docs narrow), gated wave (implementation) |

---

#### B4 — Skill / token field drift (category, groupBy, cost validation)

| Field | Value |
|-------|-------|
| **Severity** | **P1** |
| **Source** | Backend-auditor B7 (beyond reload already covered in A4) |
| **Affected BE** | `internal/api/http/handlers/skill.go` — `category` field accepted in request but ignored; `internal/tokentrack/` — client-supplied `cost` accepted without server-side validation; stats `groupBy` parameter unsupported |
| **Affected FE** | `web/src/types/skill.ts`, token stats display components |
| **Affected DOCS** | `docs/backend/skill-token-contract.md` |
| **Fix scope** | Medium — (a) validate/persist `category` in skill handler or strip from contract; (b) reject client-supplied `cost` — compute server-side; (c) implement or remove `groupBy` from stats endpoint. |
| **Dependency** | A4 (skill reload) should land first to reduce churn in skill.go |
| **Owner lane** | BE+DOCS |
| **Wave** | **2** |

---

#### B5 — Skills import lacks conflict UI / true merge policy

| Field | Value |
|-------|-------|
| **Severity** | **P1** (partial mutations leave bindings in inconsistent state) |
| **Source** | Frontend-auditor F2 |
| **Affected FE** | `web/src/pages/skills/SkillsPage.tsx` — `applyImport` loops `updateMemberSkills` per member; no conflict preview or merge policy selection |
| **Affected BE** | `internal/api/http/handlers/skill.go` — `HandleSkillImport` already exposes `validate/merge/replace` and conflict reporting |
| **Affected DOCS** | `docs/backend/skill-token-contract.md` |
| **Fix scope** | Medium (FE) — add a pre-flight conflict preview step calling `skills/import?mode=validate`; surface conflict list; let user choose `merge` or `replace` before committing. No BE change needed. |
| **Dependency** | A4 (skills reload) should be stable first |
| **Owner lane** | FE |
| **Wave** | **3** |

---

#### B6 — WebSocket path stale in OpenAPI / docs

| Field | Value |
|-------|-------|
| **Severity** | **P2** |
| **Source** | Contract-checker C3 |
| **Affected FE** | None — `web/src/config/env.ts:41` already defaults to `ws://127.0.0.1:8080/ws` correctly |
| **Affected BE** | None |
| **Affected DOCS** | `docs/api/openapi.yaml` — `GET /api/ws` should be `GET /ws`; `docs/api/http-websocket-contract.md:654` |
| **Fix scope** | Trivial — correct path in YAML; clarify whether `/realtime` is a live alias |
| **Dependency** | None |
| **Owner lane** | DOCS |
| **Wave** | **1** (parallel, zero risk) |

---

#### B7 — Docs stale against current frontend routes and APIs

| Field | Value |
|-------|-------|
| **Severity** | **P2** |
| **Source** | Frontend-auditor F6 |
| **Affected DOCS** | `web/README.md` nav inventory, `docs/frontend-backend-gap-map.md` |
| **Affected FE** | None |
| **Fix scope** | Small — update `web/README.md` route table; refresh `frontend-backend-gap-map.md` to reflect closed flows per flow-inspector report |
| **Dependency** | Should be done after Wave 1 (stable baseline) |
| **Owner lane** | DOCS |
| **Wave** | **3** |

---

### CATEGORY C — Product-Model Decisions

> These items cannot be implemented until a product decision is recorded. The recommended near-term action for each is to **mark the route/feature as preview-disabled or not-yet-implemented** so users are not misled.

---

#### C1 — Mock-backed routes promoted in AppShell navigation

| Field | Value |
|-------|-------|
| **Severity** | **PROD** |
| **Source** | Frontend-auditor F1 |
| **Affected FE** | `web/src/routes/index.tsx:107-131` — `/workspaces`, `/repositories`, `/namespaces`, `/artifacts` render static mock arrays |
| **Decision needed** | Are these routes near-term roadmap items (wire to backend), medium-term preview (show disabled/coming-soon badge), or cut from nav entirely? |
| **Near-term action** | Add `preview: true` / disabled badge to these nav entries so users see them as non-functional, rather than routes that silently render mock data |
| **Owner lane** | PRODUCT → FE |
| **Wave** | **4** (post-decision); nav badge can be Wave 2 as a stop-gap |

---

#### C2 — Task Map edits are non-durable (local React Flow state only)

| Field | Value |
|-------|-------|
| **Severity** | **PROD / P1** |
| **Source** | Frontend-auditor F3 |
| **Affected FE** | Task Map page — node add/duplicate/decision edits live only in React Flow local state |
| **Affected BE** | No Task Map persistence endpoint exists |
| **Decision needed** | Should Task Map be persisted to a new `task_graph` resource (BE work), persisted as part of an existing AEL entity (Run/Flow topology), or clearly demoed as a non-durable sketch surface? |
| **Near-term action** | Add an unsaved-changes warning banner to the Task Map page |
| **Owner lane** | PRODUCT → BE+FE |
| **Wave** | **4** (post-decision) |

---

#### C3 — Teams IA: no dedicated Teams entity or page

| Field | Value |
|-------|-------|
| **Severity** | **PROD** |
| **Source** | Frontend-auditor F4 |
| **Affected FE** | `web/src/pages/members/MembersPage.tsx` — `/members` currently doubles as team surface; team CRUD APIs exist but there is no `/teams` route |
| **Affected BE** | `internal/api/http/handlers/roster.go` — team CRUD methods exist |
| **Decision needed** | Is `/members` the canonical home for team management, or should a first-class `/teams` route be introduced? What is the policy boundary between member identity and team membership? |
| **Near-term action** | None — current UX is functional; just underspecified |
| **Owner lane** | PRODUCT → FE |
| **Wave** | **4** |

---

#### C4 — No unified agent lifecycle / status hub

| Field | Value |
|-------|-------|
| **Severity** | **PROD** |
| **Source** | Frontend-auditor F5 |
| **Affected FE** | `state/dashboardStore`, `pages/nodes/`, `pages/members/`, Task Map — each surface a slice of agent status independently |
| **Decision needed** | Should a single `/agents` or `/fleet` route serve as the lifecycle hub, or is the current per-surface model the intended IA? |
| **Near-term action** | None — status propagation is functional; product cohesion is missing |
| **Owner lane** | PRODUCT → FE |
| **Wave** | **4** |

---

### CATEGORY D — Open Questions Requiring Leader / Product Input

| # | Question | Blocks |
|---|----------|--------|
| Q1 | Implement `POST /workspaces/{id}/terminals` (create/dispatch) or formally retire it from the contract? | B3 implementation wave |
| Q2 | Is `/realtime` a live alias for `/ws` or a dead path to be removed? | B6 docs clarity |
| Q3 | Should error `requestId` in the envelope be server-generated or echo the client's `X-Request-ID` request header? | B1 BE design |
| Q4 | Canonical message status values: keep `sending/queued/delivered` (current backend) or align with docs (`pending/sent/failed`)? | B2 |
| Q5 | Mock routes `/workspaces` etc.: preview-badge, cut, or wire to new backend resources? | C1 |
| Q6 | Task Map persistence: AEL-linked, standalone resource, or non-durable sketch surface? | C2 |

---

## 4. Consolidated Execution Waves

```
Wave 0 — Security (ship immediately, no dependencies)
  [A1] Auth bypass: gate dev tokens behind JWT_SECRET absence      BE
  [A2] Realtime member identity enforcement                        BE

Wave 1 — P0 regressions + quick doc fix (parallel within wave)
  [A3] Memory isolation: add owner_id predicates                   BE
  [A4] Skills reload endpoint POST /skills/reload                  BE+DOCS
  [A5] Terminal audit ID collision → use UUID                      BE
  [A6] Skills empty-array PUT 400 regression fix                   BE
  [B6] WebSocket path fix in openapi.yaml                          DOCS  ← zero-risk, can merge any time

Wave 2 — P1 contract + data integrity (sequential after Wave 1)
  [A7] Roadmap optimistic concurrency: wire expectedVersion/409    BE+DOCS → FE
  [A8] Node WorkspaceID serialisation                              BE+DOCS
  [B1] Error envelope: shared respondError helper + handler sweep  BE
  [B2] Message status values: align backend ↔ docs ↔ FE            BE+DOCS → FE
  [B3] Workspace terminal: narrow docs to implemented surface      DOCS
  [B4] Skill/token field drift: category, cost, groupBy            BE+DOCS

Wave 3 — FE improvements + doc refresh (parallel after Wave 2)
  [B1-FE] Add retryable to HttpErrorEnvelope                       FE
  [B5] Skills import conflict preview UI                           FE
  [B7] Refresh web/README.md and frontend-backend-gap-map.md       DOCS

Wave 4 — Product-gated (blocked on decisions Q1–Q6)
  [C1] Mock routes: preview badge or wire to backend               PRODUCT → FE
  [C2] Task Map durability                                         PRODUCT → BE+FE
  [C3] Teams IA decision                                           PRODUCT → FE
  [C4] Agent lifecycle hub                                         PRODUCT → FE
  [B3] Terminal create/dispatch implementation (if Q1 = implement) BE+DOCS
```

---

## 5. Merge Protocol for Future Findings

To incorporate additional findings from any auditor:

1. Assign the next issue ID in the relevant category (A_, B_, C_, D_) — continue numbering from where this document ends.
2. Fill all 8 fields in the table.
3. Check whether the finding overlaps an existing issue; if so, add a sub-bullet under that issue rather than a new row.
4. Insert into the wave that matches severity — SEC → Wave 0, P0 → Wave 1, P1 → Wave 2, etc.
5. If a new finding creates a dependency on an existing wave item, annotate the **Dependency** field and re-sequence if needed.
6. Update the Open Questions table (§D) if a product decision is required.
