-- LEVEL CHALLENGES: one row per level-up challenge attempt. Read to check
-- eligibility (an active cooldown blocks a new attempt); written when a
-- challenge is graded in next jira tasks.
CREATE TABLE IF NOT EXISTS level_challenges (
    id             SERIAL PRIMARY KEY,
    learner_id     INTEGER NOT NULL REFERENCES users (id),
    language       TEXT NOT NULL,
    target_level   INTEGER NOT NULL CHECK (target_level > 0),
    score          INTEGER NOT NULL CHECK (score BETWEEN 0 AND 100),
    passed         BOOLEAN NOT NULL,
    -- Only set on a failed attempt; NULL means no active cooldown.
    --either the learner has never failed, or their last cooldown has 
    --already expired
    cooldown_until TIMESTAMPTZ,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
--speeds up the exact query getLastCooldownUntil() runs: "this learner's
--most recent attemot at this language/level, newest first"
CREATE INDEX IF NOT EXISTS idx_level_challenges_learner_lookup
    ON level_challenges (learner_id, language, target_level, created_at DESC);