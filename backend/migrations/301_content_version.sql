-- CONTENT: which submission of a piece of content a moderator is looking at.
-- 0 until it is first submitted; every submission adds one, so content sent back
-- after a moderator rejected it arrives as version 2. Saving a draft does not
-- change it. Kept in its own file because 300_content.sql has already run.
ALTER TABLE content
    ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 0 CHECK (version >= 0);

-- Anything submitted before this column existed has been submitted at least once.
-- How many times is not recorded anywhere, so it starts from 1.
UPDATE content SET version = 1 WHERE submitted_at IS NOT NULL AND version = 0;
