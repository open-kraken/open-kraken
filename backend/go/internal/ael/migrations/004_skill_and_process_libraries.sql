-- Skill Library (paper §5.4.5) and Process Template Library (paper §5.6.0).
--
-- These are the L0 foundation layers in the 6-layer knowledge model (§5.7.6):
--   L0-S: Skill Library — reusable execution techniques (prompt templates, tool patterns)
--   L0-P: Process Template Library — SOP-level DAG templates for task categories
--
-- Both are human-authored, version-controlled, immutable once published, and NOT
-- subject to confidence decay. Their authority derives from operator authorship,
-- not execution frequency.
--
-- Each has a companion Qdrant collection for semantic retrieval:
--   skill_definitions    → Qdrant collection "skill_definitions"
--   process_templates    → Qdrant collection "process_templates"

-- ---------- SEM Records (paper §5.7) ----------
-- This table was defined in the gap analysis but not yet created. It stores
-- mutable, scoped, agent-readable knowledge: pitfalls, workflows, iterations,
-- open issues, and artifacts. The embedding_status + qdrant_id columns
-- implement the outbox pattern for Qdrant dual-write (§5.7.4).

DO $$ BEGIN
    CREATE TYPE sem_type AS ENUM ('pitfall', 'workflow', 'iteration', 'open_issue', 'artifact');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE sem_scope AS ENUM ('step', 'flow', 'run', 'hive');
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS sem_records (
    id               UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    type             sem_type      NOT NULL,
    scope            sem_scope     NOT NULL DEFAULT 'run',
    hive_id          UUID          NOT NULL,
    run_id           UUID,
    key              TEXT          NOT NULL DEFAULT '',
    content          JSONB         NOT NULL DEFAULT '{}',
    created_by       TEXT          NOT NULL DEFAULT '',
    source_step      UUID          REFERENCES steps(id) ON DELETE SET NULL,
    confidence       NUMERIC(3,2)  NOT NULL DEFAULT 1.0
                     CHECK (confidence >= 0 AND confidence <= 1),
    version          INT           NOT NULL DEFAULT 0,
    superseded_by    UUID,
    resolved_at      TIMESTAMPTZ,
    embedding_status TEXT          NOT NULL DEFAULT 'pending'
                     CHECK (embedding_status IN ('pending', 'indexed', 'failed')),
    qdrant_id        BIGINT,
    created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sem_scope_hive
    ON sem_records (hive_id, scope, type)
    WHERE superseded_by IS NULL;

CREATE INDEX IF NOT EXISTS idx_sem_source_step
    ON sem_records (source_step)
    WHERE source_step IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sem_embedding_pending
    ON sem_records (created_at)
    WHERE embedding_status = 'pending';

-- ---------- Skill Library ----------

CREATE TABLE IF NOT EXISTS skill_definitions (
    id                  UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    name                TEXT          NOT NULL,
    version             INT           NOT NULL DEFAULT 1,
    description         TEXT          NOT NULL DEFAULT '',
    prompt_template     TEXT          NOT NULL DEFAULT '',
    tool_requirements   TEXT[]        NOT NULL DEFAULT '{}',
    agent_type_affinity TEXT[]        NOT NULL DEFAULT '{}',
    workload_class_tags TEXT[]        NOT NULL DEFAULT '{}',
    tenant_id           UUID,                                -- NULL = global (visible to all tenants)
    authored_by         TEXT          NOT NULL DEFAULT '',
    published_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    -- Qdrant outbox pattern (§5.7.4): embedding_status tracks dual-write state.
    embedding_status    TEXT          NOT NULL DEFAULT 'pending'
                        CHECK (embedding_status IN ('pending', 'indexed', 'failed')),
    qdrant_id           BIGINT,                              -- Qdrant point ID once indexed
    UNIQUE (name, version)
);

CREATE INDEX IF NOT EXISTS idx_skill_defs_embedding_pending
    ON skill_definitions (published_at)
    WHERE embedding_status = 'pending';

CREATE INDEX IF NOT EXISTS idx_skill_defs_tenant
    ON skill_definitions (tenant_id)
    WHERE tenant_id IS NOT NULL;

-- ---------- Process Template Library ----------

CREATE TABLE IF NOT EXISTS process_templates (
    id                    UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    name                  TEXT          NOT NULL,
    version               INT           NOT NULL DEFAULT 1,
    trigger_description   TEXT          NOT NULL DEFAULT '',
    dag_template          JSONB         NOT NULL DEFAULT '{}',
    applicable_domains    TEXT[]        NOT NULL DEFAULT '{}',
    estimated_steps_min   INT           NOT NULL DEFAULT 1,
    estimated_steps_max   INT           NOT NULL DEFAULT 100,
    authored_by           TEXT          NOT NULL DEFAULT '',
    published_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    -- Qdrant outbox pattern
    embedding_status      TEXT          NOT NULL DEFAULT 'pending'
                          CHECK (embedding_status IN ('pending', 'indexed', 'failed')),
    qdrant_id             BIGINT,
    UNIQUE (name, version)
);

CREATE INDEX IF NOT EXISTS idx_process_templates_embedding_pending
    ON process_templates (published_at)
    WHERE embedding_status = 'pending';

-- (sem_records embedding_status and qdrant_id are already in the CREATE TABLE above.)
