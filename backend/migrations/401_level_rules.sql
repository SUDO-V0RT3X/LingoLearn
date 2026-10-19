-- Adds a configurable pass mark to each level (50–100, default 70%).
ALTER TABLE levels
    ADD COLUMN IF NOT EXISTS pass_mark INTEGER NOT NULL DEFAULT 70
        CHECK (pass_mark BETWEEN 50 AND 100);
