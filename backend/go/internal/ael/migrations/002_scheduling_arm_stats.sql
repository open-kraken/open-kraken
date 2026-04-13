-- UCB arm statistics for the Cognitive Workload Scheduler (paper §5.2.6, Appendix A.3.5).
--
-- Written by:
--   - T2 transaction (VERIFIABLE/PROXIED regime, where reward is immediate)
--   - WAL consumer (OPAQUE regime, after DAG attribution completes — Phase 3)
--
-- The table stores enough to compute UCB score r̄ + sqrt(2 ln t / n) and per-arm
-- variance for Layer 3 annotation priority.

CREATE TABLE IF NOT EXISTS scheduling_arm_stats (
    agent_type     TEXT          NOT NULL,
    provider       TEXT          NOT NULL,
    workload_class TEXT          NOT NULL,
    regime         step_regime   NOT NULL,
    pull_count     BIGINT        NOT NULL DEFAULT 0,
    reward_sum     NUMERIC(14,6) NOT NULL DEFAULT 0,
    reward_sq_sum  NUMERIC(18,8) NOT NULL DEFAULT 0,
    last_updated   TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    PRIMARY KEY (agent_type, provider, workload_class, regime)
);

CREATE INDEX IF NOT EXISTS idx_arm_stats_lookup
    ON scheduling_arm_stats (workload_class, regime);
