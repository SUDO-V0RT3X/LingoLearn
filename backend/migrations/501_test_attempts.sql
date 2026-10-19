-- One row per test a learner submits: which content, what they answered, and
-- how the server marked it (shared/grading.ts). Read by My Learning (history and
-- statistics) and by the level-up challenge's eligibility check, which counts
-- distinct tests passed at a level.
--
-- Numbered 501, not 500: older branches created a simpler test_attempts table
-- at 500. The follow-up statements upgrade that table too, so an existing local
-- database can migrate without losing its learner history.
CREATE TABLE IF NOT EXISTS test_attempts (
    id           SERIAL PRIMARY KEY,
    content_id   INTEGER NOT NULL REFERENCES content (id) ON DELETE CASCADE,
    learner_id   INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    -- The content's level and language when the attempt was made, so history
    -- stays correct if the content is edited and re-approved later.
    level        INTEGER NOT NULL,
    language     TEXT NOT NULL,
    answers      JSONB NOT NULL,
    total        INTEGER NOT NULL CHECK (total > 0),
    score        INTEGER NOT NULL CHECK (score >= 0 AND score <= total),
    percent      INTEGER NOT NULL,
    -- percent >= the level's pass mark (levels.pass_mark) at submission time.
    passed       BOOLEAN NOT NULL,
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE test_attempts ADD COLUMN IF NOT EXISTS level INTEGER;
ALTER TABLE test_attempts ADD COLUMN IF NOT EXISTS language TEXT;
ALTER TABLE test_attempts ADD COLUMN IF NOT EXISTS percent INTEGER;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_schema = current_schema()
           AND table_name = 'test_attempts'
           AND column_name = 'pass_rate'
    ) THEN
        EXECUTE 'UPDATE test_attempts SET percent = pass_rate WHERE percent IS NULL';
    END IF;
END $$;

UPDATE test_attempts AS attempt
   SET level = COALESCE(attempt.level, content.level, 1),
       language = COALESCE(attempt.language, content.language, 'english'),
       percent = COALESCE(
           attempt.percent,
           CASE WHEN attempt.total > 0 THEN ROUND(attempt.score * 100.0 / attempt.total)::INTEGER ELSE 0 END
       )
  FROM content
 WHERE content.id = attempt.content_id
   AND (attempt.level IS NULL OR attempt.language IS NULL OR attempt.percent IS NULL);

ALTER TABLE test_attempts ALTER COLUMN level SET NOT NULL;
ALTER TABLE test_attempts ALTER COLUMN language SET NOT NULL;
ALTER TABLE test_attempts ALTER COLUMN percent SET NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'test_attempts'::regclass AND conname = 'test_attempts_level_range_check') THEN
        ALTER TABLE test_attempts ADD CONSTRAINT test_attempts_level_range_check CHECK (level BETWEEN 1 AND 6);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'test_attempts'::regclass AND conname = 'test_attempts_language_check') THEN
        ALTER TABLE test_attempts ADD CONSTRAINT test_attempts_language_check CHECK (language IN ('english', 'zulu'));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'test_attempts'::regclass AND conname = 'test_attempts_percent_check') THEN
        ALTER TABLE test_attempts ADD CONSTRAINT test_attempts_percent_check CHECK (percent BETWEEN 0 AND 100);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS test_attempts_learner_idx ON test_attempts (learner_id, submitted_at DESC);
CREATE INDEX IF NOT EXISTS test_attempts_learner_level_idx ON test_attempts (learner_id, level) WHERE passed;
