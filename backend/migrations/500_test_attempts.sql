-- TEST_ATTEMPTS: one row per quiz/test a learner submits. Used to compute
-- My Learning stats (tests completed/passed, average pass rate) and history.
CREATE TABLE IF NOT EXISTS test_attempts (
    id           SERIAL PRIMARY KEY,
    content_id   INTEGER NOT NULL REFERENCES content (id),
    learner_id   INTEGER NOT NULL REFERENCES users (id),
    answers      JSONB NOT NULL,
    total        INTEGER NOT NULL,
    score        INTEGER NOT NULL,
    pass_rate    INTEGER NOT NULL,
    passed       BOOLEAN NOT NULL,
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
