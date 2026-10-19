-- Older releases used the same migration filename with a different schema.
-- The migration ledger tracks filenames, so this idempotent follow-up upgrades
-- any such table before the current test and level-up APIs use it.
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
