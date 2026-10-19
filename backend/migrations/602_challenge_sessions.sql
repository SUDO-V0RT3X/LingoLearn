-- LEVEL CHALLENGES as sessions: a row is now written when the learner STARTS a
-- challenge, holding the questions drawn for them (with their answers, which
-- never leave the server), and completed when they submit. Grading happens on
-- the server against these stored questions, so the client cannot pick its own
-- questions or claim its own score.
--
-- A row is open while submitted_at is NULL; score and passed are only known once
-- it is submitted, so they become nullable. Rows written before this migration
-- were all graded on the spot, so they count as submitted when they were created.
ALTER TABLE level_challenges
    ADD COLUMN IF NOT EXISTS questions    JSONB NULL CHECK (questions IS NULL OR jsonb_typeof(questions) = 'array'),
    ADD COLUMN IF NOT EXISTS answers      JSONB NULL,
    ADD COLUMN IF NOT EXISTS total        INTEGER NULL CHECK (total IS NULL OR total > 0),
    ADD COLUMN IF NOT EXISTS correct      INTEGER NULL CHECK (correct IS NULL OR correct >= 0),
    ADD COLUMN IF NOT EXISTS started_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ NULL;

UPDATE level_challenges SET submitted_at = created_at, started_at = created_at WHERE submitted_at IS NULL;

ALTER TABLE level_challenges
    ALTER COLUMN score DROP NOT NULL,
    ALTER COLUMN passed DROP NOT NULL,
    -- A submitted challenge always has its result.
    ADD CONSTRAINT level_challenge_result_when_submitted
        CHECK (submitted_at IS NULL OR (score IS NOT NULL AND passed IS NOT NULL)),
    -- NOT VALID: checked for every new row, without failing on old stub rows.
    ADD CONSTRAINT level_challenge_target_in_range CHECK (target_level BETWEEN 2 AND 6) NOT VALID;

-- At most one open challenge per learner: starting again resumes it, so a
-- learner cannot redraw until they get an easy set.
CREATE UNIQUE INDEX IF NOT EXISTS level_challenges_one_open_per_learner
    ON level_challenges (learner_id) WHERE submitted_at IS NULL;

-- Level is global, so the cooldown lookup no longer goes through language.
CREATE INDEX IF NOT EXISTS idx_level_challenges_learner_recent
    ON level_challenges (learner_id, created_at DESC);

-- A challenge belongs to its learner: removing the account removes its attempts.
ALTER TABLE level_challenges DROP CONSTRAINT IF EXISTS level_challenges_learner_id_fkey;
ALTER TABLE level_challenges
    ADD CONSTRAINT level_challenges_learner_id_fkey
        FOREIGN KEY (learner_id) REFERENCES users (id) ON DELETE CASCADE;
