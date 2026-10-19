-- Store the learner's language on each attempt so answer grading uses the same ladder.
-- `IF NOT EXISTS` keeps the additive migration safe to retry if a schema was repaired manually.
ALTER TABLE placement_attempts
    -- Existing attempts default to English; new starts persist the selected language explicitly.
    ADD COLUMN IF NOT EXISTS target_language TEXT NOT NULL DEFAULT 'english'
    -- Restrict stored language snapshots to branches supported by the placement engine.
    CHECK (target_language IN ('english', 'zulu'));