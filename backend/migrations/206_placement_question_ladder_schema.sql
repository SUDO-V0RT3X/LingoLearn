-- Add the proficiency tier required by the placement question loader.
ALTER TABLE placement_questions
    ADD COLUMN IF NOT EXISTS level_number INTEGER NOT NULL DEFAULT 1
    CHECK (level_number BETWEEN 1 AND 6);

-- Persisted isiZulu placement items use the same server-side grading contract as English.
CREATE TABLE IF NOT EXISTS zulu_placement_questions (
    id           TEXT PRIMARY KEY,
    section      TEXT NOT NULL,
    instructions TEXT NOT NULL,
    type         TEXT NOT NULL CHECK (type IN ('multiple-choice', 'fill-blank')),
    prompt       TEXT NOT NULL,
    options      JSONB NULL,
    correct_id   TEXT NOT NULL,
    order_index  INTEGER NOT NULL UNIQUE,
    level_number INTEGER NOT NULL CHECK (level_number BETWEEN 1 AND 6),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);