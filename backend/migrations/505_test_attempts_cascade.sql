-- Ensure foreign keys on test_attempts cascade delete when content or users are deleted,
-- matching the contract in 501_test_attempts.sql.
DO $$
BEGIN
    ALTER TABLE test_attempts DROP CONSTRAINT IF EXISTS test_attempts_content_id_fkey;
    ALTER TABLE test_attempts
        ADD CONSTRAINT test_attempts_content_id_fkey
        FOREIGN KEY (content_id) REFERENCES content(id) ON DELETE CASCADE;

    ALTER TABLE test_attempts DROP CONSTRAINT IF EXISTS test_attempts_learner_id_fkey;
    ALTER TABLE test_attempts
        ADD CONSTRAINT test_attempts_learner_id_fkey
        FOREIGN KEY (learner_id) REFERENCES users(id) ON DELETE CASCADE;
END $$;
