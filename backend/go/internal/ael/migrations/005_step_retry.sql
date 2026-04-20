-- Step retry columns (paper §5.3, Lemma 5.1).
--
-- A failed Step never mutates back to pending; retries are new rows
-- that chain to their direct parent via retry_of. This preserves FSM
-- monotonicity (the invariant CWS's UCB convergence relies on) while
-- still letting transient failures recover.
--
-- Flow/Run finalization must only count the leaf of each retry chain
-- (the Step that has no retry child). The CountStepsByFlow SQL in
-- internal/ael/repository.go filters with NOT EXISTS on retry_of.

ALTER TABLE steps
    ADD COLUMN IF NOT EXISTS retry_of    UUID REFERENCES steps(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS retry_count INT  NOT NULL DEFAULT 0;

-- Index accelerates "is this Step a retry root / has it been retried"
-- lookups used by CountStepsByFlow and by the scheduler's retry policy.
CREATE INDEX IF NOT EXISTS idx_steps_retry_of
    ON steps (retry_of)
    WHERE retry_of IS NOT NULL;
