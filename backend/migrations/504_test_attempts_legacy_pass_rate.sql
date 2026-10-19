-- Older test_attempts tables required pass_rate. New submissions store the
-- equivalent value in percent, so the obsolete column must not remain required.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_schema = current_schema()
           AND table_name = 'test_attempts'
           AND column_name = 'pass_rate'
    ) THEN
        ALTER TABLE test_attempts ALTER COLUMN pass_rate DROP NOT NULL;
    END IF;
END $$;
