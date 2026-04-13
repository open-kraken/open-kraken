-- AgentInstance persistent state (paper §5.4.2).
--
-- The eight-state FSM is enforced in Go (internal/runtime/instance/fsm.go) rather than
-- in the database, because instance state changes flow through the Agent Runtime and
-- are not directly committed by transactions. This table is the durable mirror that
-- lets a restarted backend recover the instance pool without losing identity.

DO $$ BEGIN
    CREATE TYPE agent_instance_state AS ENUM (
        'created', 'scheduled', 'running', 'idle',
        'suspended', 'resumed', 'terminated', 'crashed'
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS agent_instances (
    id             UUID                 PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_type     TEXT                 NOT NULL,
    provider       TEXT                 NOT NULL,
    tenant_id      UUID                 NOT NULL,
    hive_id        UUID                 NOT NULL,
    state          agent_instance_state NOT NULL DEFAULT 'created',
    assigned_step  UUID                 REFERENCES steps(id) ON DELETE SET NULL,
    context_l1_ref TEXT,  -- opaque pointer to runtime L1 store; NULL for cold instances
    spawned_at     TIMESTAMPTZ          NOT NULL DEFAULT NOW(),
    last_active    TIMESTAMPTZ          NOT NULL DEFAULT NOW(),
    terminated_at  TIMESTAMPTZ,
    crash_reason   TEXT,
    version        INT                  NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_instances_pool
    ON agent_instances (agent_type, provider, tenant_id, state)
    WHERE state IN ('idle', 'scheduled', 'suspended');

CREATE INDEX IF NOT EXISTS idx_instances_tenant
    ON agent_instances (tenant_id, last_active DESC);
