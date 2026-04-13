-- Authoritative Execution Ledger (AEL) — initial schema
-- Paper: Agents as Execution Resources, Appendix A.
--
-- The AEL is the durable, FSM-enforced, immutable record of what the system did.
-- It is NOT a memory store (L1-L3 live in agent runtime + SEM) and it is NOT
-- coordination state (leases, node health, leader election live in etcd). Conflating
-- the layers breaks UCB convergence (Proposition 5.1).
--
-- Hierarchy: runs → flows → steps → side_effects
-- Terminal states are absorbing: once a record reaches succeeded/failed/cancelled
-- the FSM validator rejects any further transition.

-- ---------- Enums ----------

DO $$ BEGIN
    CREATE TYPE run_state AS ENUM ('pending', 'running', 'succeeded', 'failed', 'cancelled');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE flow_state AS ENUM ('pending', 'assigned', 'running', 'succeeded', 'failed', 'cancelled');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE step_state AS ENUM ('pending', 'leased', 'running', 'succeeded', 'failed', 'cancelled', 'expired');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE se_state AS ENUM ('pending', 'executing', 'committed', 'failed', 'skipped');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE idem_class AS ENUM ('idempotent', 'deduplicatable', 'non_retriable');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Step quality regime (paper §5.2.2). Used by CWS to route differently per regime.
DO $$ BEGIN
    CREATE TYPE step_regime AS ENUM ('OPAQUE', 'VERIFIABLE', 'PROXIED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ---------- runs ----------

CREATE TABLE IF NOT EXISTS runs (
    id               UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id        UUID          NOT NULL,
    hive_id          UUID          NOT NULL,
    state            run_state     NOT NULL DEFAULT 'pending',
    policy_set_id    UUID,
    token_budget     INT           NOT NULL DEFAULT 0,
    tokens_used      INT           NOT NULL DEFAULT 0,
    cost_usd         NUMERIC(12,6) NOT NULL DEFAULT 0,
    objective        TEXT          NOT NULL DEFAULT '',
    version          INT           NOT NULL DEFAULT 0,
    created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_runs_budget CHECK (tokens_used <= token_budget OR token_budget = 0)
);

-- ---------- flows ----------

CREATE TABLE IF NOT EXISTS flows (
    id             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id         UUID         NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
    tenant_id      UUID         NOT NULL,
    agent_role     TEXT         NOT NULL DEFAULT '',
    assigned_node  TEXT,
    state          flow_state   NOT NULL DEFAULT 'pending',
    version        INT          NOT NULL DEFAULT 0,
    created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ---------- steps ----------

CREATE TABLE IF NOT EXISTS steps (
    id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    flow_id          UUID         NOT NULL REFERENCES flows(id) ON DELETE CASCADE,
    run_id           UUID         NOT NULL,  -- denormalized; avoids join on hot paths
    tenant_id        UUID         NOT NULL,  -- denormalized for row-level security
    state            step_state   NOT NULL DEFAULT 'pending',
    regime           step_regime  NOT NULL DEFAULT 'OPAQUE',
    workload_class   TEXT         NOT NULL DEFAULT 'unknown',
    -- Lease mirror fields (authoritative lock state lives in etcd; these are audit mirror).
    -- See backend/go/internal/stepLease/ for the etcd-native primary path.
    lease_node_id    TEXT,
    lease_expires_at TIMESTAMPTZ,
    instance_id      UUID,  -- AgentInstance that holds/held the lease
    -- Execution record (written atomically with side_effects on completion via T2)
    agent_id         TEXT,
    agent_type       TEXT,
    provider         TEXT,
    input_ref        TEXT,
    input_hash       BYTEA,
    event_stream     JSONB,
    output_ref       TEXT,
    tokens_used      INT,
    cost_usd         NUMERIC(10,6),
    duration_ms      INT,
    failure_reason   TEXT,
    version          INT          NOT NULL DEFAULT 0,
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ---------- side_effects ----------

CREATE TABLE IF NOT EXISTS side_effects (
    id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    step_id           UUID         NOT NULL REFERENCES steps(id) ON DELETE CASCADE,
    run_id            UUID         NOT NULL,
    tenant_id         UUID         NOT NULL,
    seq               INT          NOT NULL,
    target_system     TEXT         NOT NULL,
    operation_type    TEXT         NOT NULL,
    idempotency_class idem_class   NOT NULL DEFAULT 'idempotent',
    idempotency_key   TEXT,
    request_payload   JSONB,
    response_payload  JSONB,
    state             se_state     NOT NULL DEFAULT 'pending',
    policy_outcome    TEXT,
    executed_at       TIMESTAMPTZ,
    created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    UNIQUE (step_id, seq)
);

-- ---------- Indexes (paper Appendix A.4) ----------

-- T4 lease expiry backup scanner (authoritative path is etcd watch; this is the fallback).
CREATE INDEX IF NOT EXISTS idx_steps_lease_expiry
    ON steps (lease_expires_at)
    WHERE state IN ('leased', 'running') AND lease_expires_at IS NOT NULL;

-- FlowScheduler: pending steps available for assignment.
CREATE INDEX IF NOT EXISTS idx_steps_pending
    ON steps (run_id, created_at)
    WHERE state = 'pending';

-- Tenant dashboard: active runs per tenant.
CREATE INDEX IF NOT EXISTS idx_runs_tenant_active
    ON runs (tenant_id, updated_at DESC)
    WHERE state = 'running';

-- Audit query: all steps in a run, chronological order.
CREATE INDEX IF NOT EXISTS idx_steps_run_audit
    ON steps (run_id, created_at);

-- Side effect lookup by step (audit, replay, idempotency deduplication).
CREATE INDEX IF NOT EXISTS idx_side_effects_step
    ON side_effects (step_id, seq);

-- System Orchestrator fleet-wide scan.
CREATE INDEX IF NOT EXISTS idx_runs_active
    ON runs (updated_at DESC)
    WHERE state = 'running';

-- Steps assigned to a specific instance (per-instance reliability tracking).
CREATE INDEX IF NOT EXISTS idx_steps_instance
    ON steps (instance_id)
    WHERE instance_id IS NOT NULL;
