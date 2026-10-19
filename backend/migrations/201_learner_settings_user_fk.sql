-- Step 1: Clean up orphaned records in 'learner_settings' prior to enforcing referential integrity.
-- Deletes any settings entries whose 'user_id' does not match a valid record in the 'users' table,
-- preventing foreign key creation failure due to pre-existing orphan rows.
DELETE FROM learner_settings settings
WHERE NOT EXISTS (
    SELECT 1 FROM users WHERE users.id = settings.user_id
);

-- Step 2: Idempotently add the foreign key constraint linking learner settings to users.
-- Using an anonymous PL/pgSQL block ensures this script can be executed repeatedly without failing if the constraint already exists.
DO $$
BEGIN
    -- Query the PostgreSQL system catalog (pg_constraint) to check if the foreign key exists
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'learner_settings_user_id_fkey'
    ) THEN
        -- Add foreign key linking 'user_id' to 'users(id)'.
        -- ON DELETE CASCADE ensures deleting a user automatically purges their associated settings.
        ALTER TABLE learner_settings
            ADD CONSTRAINT learner_settings_user_id_fkey
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
    END IF;
END $$;