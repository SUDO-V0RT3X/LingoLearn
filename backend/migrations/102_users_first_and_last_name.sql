-- Add the current first-name and last-name fields to databases created by the older IAM migration.
ALTER TABLE users ADD COLUMN IF NOT EXISTS first_name TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_name TEXT;

-- Copy values from the legacy name field only when that field exists in the current database.
DO $$
BEGIN
    -- Check information_schema before referencing the legacy column in dynamic SQL.
    IF EXISTS (
        SELECT 1
          FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name = 'users'
           AND column_name = 'name'
    ) THEN
        -- Split the first word into first_name and the remaining words into last_name.
        EXECUTE $migration$
            UPDATE users
               SET first_name = COALESCE(
                       NULLIF(BTRIM(first_name), ''),
                       NULLIF(SPLIT_PART(BTRIM(name), ' ', 1), '')
                   ),
                   last_name = COALESCE(
                       NULLIF(BTRIM(last_name), ''),
                       CASE
                           WHEN POSITION(' ' IN BTRIM(name)) > 0
                           THEN NULLIF(BTRIM(SUBSTRING(BTRIM(name) FROM POSITION(' ' IN BTRIM(name)) + 1)), '')
                           ELSE NULL
                       END
                   )
             WHERE first_name IS NULL
                OR BTRIM(first_name) = ''
                OR last_name IS NULL
                OR BTRIM(last_name) = ''
        $migration$;
    END IF;
END $$;

-- Fill any remaining first names from the username, email prefix, or a stable fallback.
UPDATE users
   SET first_name = COALESCE(
           NULLIF(BTRIM(first_name), ''),
           NULLIF(BTRIM(username), ''),
           NULLIF(SPLIT_PART(BTRIM(email), '@', 1), ''),
           'User'
       )
 WHERE first_name IS NULL
    OR BTRIM(first_name) = '';

-- Fill any remaining last names with a stable value before applying the constraint.
UPDATE users
   SET last_name = 'Account'
 WHERE last_name IS NULL
    OR BTRIM(last_name) = '';

-- Match the non-null constraints declared by the current users table migration.
ALTER TABLE users ALTER COLUMN first_name SET NOT NULL;
ALTER TABLE users ALTER COLUMN last_name SET NOT NULL;
