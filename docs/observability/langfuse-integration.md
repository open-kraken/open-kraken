# Langfuse integration (LLM observability)

This document describes how **[Langfuse](https://langfuse.com/)** fits into open-kraken as the **LLM observability** layer: traces, generations, token/cost attribution, prompts, and scores. It is **complementary** to the built-in **`tokentrack`** domain (workspace-level token events in SQLite) and the **ledger** (audit events)—not a replacement unless you explicitly migrate workflows.

**Official references**

- [Langfuse + OpenTelemetry](https://langfuse.com/docs/integrations/opentelemetry) — OTLP ingestion, attribute mapping, self-hosted vs cloud.
- [Get started](https://langfuse.com/docs/get-started) — projects, API keys, UI.

---

## 1. Role in the architecture

| Capability | open-kraken (today) | Langfuse |
|------------|---------------------|----------|
| Workspace token totals / activity API | `tokentrack` + Dashboard | Optional detail: per-trace usage, model, latency |
| Audit / compliance narrative | `ledger` | Not a substitute; Langfuse is **LLM product** observability |
| Where LLM calls run | Often **outside** the Go monolith (agents, workers, notebooks) | **Primary** target: instrument those runtimes |
| Control plane HTTP/WS | Go backend | Optional OTLP export from services you add later |

**Principle:** Instrument **where the model is invoked** (Python/Node workers, LangChain/LangGraph stacks, etc.). The Go API can remain free of LLM calls; it can still export **sparse** OTel spans later (e.g. “dispatch task”) if you add OpenTelemetry to Go.

---

## 2. Ingestion path: OpenTelemetry → Langfuse

Langfuse exposes an **OTLP/HTTP** endpoint (not gRPC):

- Cloud (EU example): `https://cloud.langfuse.com/api/public/otel`
- US: `https://us.cloud.langfuse.com/api/public/otel`
- Self-hosted (Langfuse ≥ v3.22.0): `http://<host>:<port>/api/public/otel`

Authentication uses **HTTP Basic** with API keys: `Authorization: Basic <base64(pk:sk)>`, plus header `x-langfuse-ingestion-version: 4` for current ingestion (see upstream docs for changes).

Trace-specific path if needed: `…/api/public/otel/v1/traces`.

**Environment variables (typical for OTel SDKs / collectors)**

```bash
OTEL_EXPORTER_OTLP_ENDPOINT="https://cloud.langfuse.com/api/public/otel"
OTEL_EXPORTER_OTLP_HEADERS="Authorization=Basic ${AUTH_STRING},x-langfuse-ingestion-version=4"
# Optional explicit traces URL:
# OTEL_EXPORTER_OTLP_TRACES_ENDPOINT="https://cloud.langfuse.com/api/public/otel/v1/traces"
```

Generate `AUTH_STRING`:

```bash
echo -n "pk-lf-xxx:sk-lf-yyy" | base64
# GNU: add -w 0 if line wrapping breaks keys
```

**GenAI semantic conventions:** Langfuse maps **OpenTelemetry GenAI** attributes and `langfuse.*` namespaces (trace/user/session metadata, observation types). See [property mapping](https://langfuse.com/docs/integrations/opentelemetry#property-mapping) in the official docs.

---

## 3. Where to integrate in this repo

### 3.1 Agent / worker runtimes (recommended first)

Use the **Langfuse SDK** (Python v3+ / JS v4+ OTel-native) or **OpenLIT / OpenLLMetry**-style instrumentors on the processes that call OpenAI, Anthropic, Bedrock, etc. Set `OTEL_EXPORTER_OTLP_*` to point at Langfuse (or to an **OpenTelemetry Collector** that forwards to Langfuse).

**Correlation with open-kraken:** propagate stable IDs into OTel baggage or span attributes, for example:

- `langfuse.trace.metadata.workspace_id` = open-kraken workspace id  
- `langfuse.user.id` or `user.id` = member / agent id  
- `langfuse.session.id` = conversation or terminal session id when applicable  

This makes Langfuse filters align with the **console** mental model.

### 3.2 OpenTelemetry Collector (optional hub)

If you already run a collector, add an **OTLP HTTP exporter** to Langfuse (see upstream YAML examples). Use **filter processors** if you must only forward `gen_ai.*` spans.

### 3.3 Go monolith (HTTP control plane)

The backend exports **OTLP/HTTP traces** to Langfuse when all of the following are set (see `internal/observability/tracing.go`):

| Variable | Purpose |
|----------|---------|
| `OPEN_KRAKEN_OTEL_EXPORTER_OTLP_TRACES_ENDPOINT` or `OPEN_KRAKEN_OTEL_EXPORTER_OTLP_ENDPOINT` | OTLP base or full traces URL (normalized to `…/v1/traces` if needed) |
| `OPEN_KRAKEN_LANGFUSE_PUBLIC_KEY` | Langfuse public key (`pk-lf-…`) |
| `OPEN_KRAKEN_LANGFUSE_SECRET_KEY` | Langfuse secret key (`sk-lf-…`) |

The server sets **W3C Trace Context** propagation and wraps the HTTP handler with `otelhttp` (excluding `/healthz` and `/metrics`). Keys never leave the process; they are only used for the OTLP exporter’s Basic auth header plus `x-langfuse-ingestion-version: 4`.

If any of the three values is missing, tracing stays off (no exporter). If the endpoint is set but keys are missing, tracing remains off—configure all three for export.

Watch for **TracerProvider conflicts** if you also use Sentry/Datadog—see [existing OTel setup FAQ](https://langfuse.com/faq/all/existing-otel-setup).

### 3.4 Relationship to `tokentrack`

- **tokentrack**: first-party, embedded DB, good for **dashboards and billing-style rollups** tied to open-kraken APIs.  
- **Langfuse**: deep **LLM** debugging (prompts, spans, comparisons).  
You can **dual-write** token events from instrumented workers (HTTP to open-kraken + OTel to Langfuse) or derive summaries in batch—product decision.

---

## 4. Deployment options

| Mode | When to use |
|------|-------------|
| **Langfuse Cloud** | Fastest; no extra infra; keys via env. |
| **Self-hosted** | Data residency, air-gapped, or heavy usage; requires Postgres, ClickHouse, Redis, object storage (see [Langfuse self-hosting](https://langfuse.com/docs/deployment/self-host)). Minimum RAM and upgrade notes apply; OTLP endpoint needs Langfuse **≥ 3.22.0**. |

Do **not** commit API keys. Use Kubernetes Secrets, Docker secrets, or CI-injected env.

---

## 5. Web console: link from Settings + trace propagation

The React app supports an optional **UI URL** (not the OTLP endpoint) so operators can jump to the Langfuse project from **Settings**:

- Env: `VITE_LANGFUSE_UI_URL` — e.g. `https://cloud.langfuse.com` or your self-hosted origin.

**Browser → API trace context:** the shared `HttpClient` adds a W3C `traceparent` header on JSON API calls so the Go `otelhttp` layer can continue the same trace into OTLP/Langfuse. No Langfuse secrets in the browser. Set `VITE_OPEN_KRAKEN_TRACE_CONTEXT=0` (or `false` / `off` / `no`) to disable.

This is **read-only navigation** for the UI link; ingestion uses OTel from the backend and workers as configured.

---

## 6. Verification checklist

- [ ] Langfuse project created; **public/secret** keys generated.  
- [ ] Worker or collector reaches `OTEL_EXPORTER_OTLP_ENDPOINT` (no 401/404).  
- [ ] Test span with `gen_ai.request.model` or Langfuse SDK generation appears in Langfuse UI.  
- [ ] `langfuse.trace.metadata.workspace_id` (or equivalent) set for cross-filtering with open-kraken.  
- [ ] Secrets not logged; Basic auth only in env / secret stores.  
- [ ] Optional: `VITE_LANGFUSE_UI_URL` set; Settings shows “Open Langfuse”.

---

## 7. Revision

- Introduced with: documentation + optional Settings link env; **no** default Langfuse container in the main `docker-compose` (add per deployment when self-hosting).
