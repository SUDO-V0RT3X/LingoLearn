-- Every account keeps the language its menus and buttons are shown in, so a
-- guardian's or staff member's choice follows them to any device the way a
-- learner's already did. NULL means the account has never chosen: the browser's
-- own choice is kept.
ALTER TABLE users ADD COLUMN IF NOT EXISTS interface_language TEXT;

-- Idempotent: only add the constraint when it is not there yet.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'users_interface_language_supported'
    ) THEN
        ALTER TABLE users
            ADD CONSTRAINT users_interface_language_supported
            CHECK (interface_language IN ('english', 'zulu'));
    END IF;
END $$;

-- Learners chose theirs in setup (learner_settings, 200). Copy it over so the
-- account and the setup row agree. On a fresh database this file runs before
-- 200 creates that table, and there is nothing to copy.
DO $$
BEGIN
    IF to_regclass('public.learner_settings') IS NOT NULL THEN
        UPDATE users u
           SET interface_language = lower(btrim(s.interface_language))
          FROM learner_settings s
         WHERE s.user_id = u.id
           AND u.interface_language IS NULL
           AND lower(btrim(s.interface_language)) IN ('english', 'zulu');
    END IF;
END $$;
