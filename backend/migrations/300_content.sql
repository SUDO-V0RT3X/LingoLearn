-- CONTENT: the content builder slice. One row per piece of content. Its pages and
-- their blocks are one JSONB document in the content column: a draft is always read
-- and written whole and blocks are never queried on their own, so they are not
-- split into rows. Story or quiz is derived from the blocks, so it is not stored.
CREATE TABLE IF NOT EXISTS content (
    id           SERIAL PRIMARY KEY,
    author_id    INTEGER NOT NULL REFERENCES users (id),    -- the author who created it
    status       TEXT NOT NULL DEFAULT 'draft'
                 CHECK (status IN ('draft', 'pending', 'approved', 'rejected')),
    title        TEXT NOT NULL DEFAULT '',                    -- what every other screen lists it by
    language     TEXT NULL CHECK (language IN ('english', 'zulu')),  -- learner_settings.target_language
    child_friendly BOOLEAN NOT NULL DEFAULT false,            -- the only gate an under-13 learner needs
    level        INTEGER NULL CHECK (level BETWEEN 1 AND 6),    -- levels(level_number) in 400_taxonomy.sql
    content      JSONB NOT NULL DEFAULT '[[]]' CHECK (jsonb_typeof(content) = 'array'),
    submitted_at TIMESTAMPTZ NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- These may be empty while drafting, never once the content leaves draft.
    CONSTRAINT content_ready_after_draft CHECK (
        status = 'draft' OR (level IS NOT NULL AND language IS NOT NULL AND title <> '')
    )
);

