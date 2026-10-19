-- Learners can study English or isiZulu for now (Tshivenda joins later through
-- its own migration, which widens this constraint).
-- Move any other saved target language onto isiZulu, then let the database
-- refuse anything outside the list, matching the onboarding validator.
UPDATE learner_settings
   SET target_language = 'zulu', updated_at = now()
 WHERE target_language NOT IN ('english', 'zulu');

-- Idempotent: only add the constraint when it is not there yet. (The name
-- learner_settings_target_language_check is taken by 200's length check.)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'learner_settings_target_language_supported'
    ) THEN
        ALTER TABLE learner_settings
            ADD CONSTRAINT learner_settings_target_language_supported
            CHECK (target_language IN ('english', 'zulu'));
    END IF;
END $$;
