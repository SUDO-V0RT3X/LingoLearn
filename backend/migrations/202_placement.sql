-- ============================================================================
-- Migration: 202_placement.sql
-- Slice: Onboarding & Placement (Slice B, 2xx range)
-- Description: Creates tables for learner level placement, assessment attempts,
--              and graded question ladder with initial seed data.
-- ============================================================================

-- Table 1: learner_levels
-- Stores the single source of truth for each learner's assigned reading and learning level.
-- TK's onboarding slice owns the single write path into learner_levels;
-- progression, content gating, and the Explore catalogue read from here.
-- `IF NOT EXISTS` makes the migration idempotent so re-running it is safe.
CREATE TABLE IF NOT EXISTS learner_levels (
    -- One row per learner: the primary key is the user id itself, not a surrogate key.
    -- `ON DELETE CASCADE` removes the level row automatically when the user is deleted.
    user_id      INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    -- The learner's tier; constrained to the 1–6 band so no bad value can be persisted.
    -- Defaults to 1 so an unplaced learner always has a usable starting point.
    level_number INTEGER NOT NULL DEFAULT 1 CHECK (level_number BETWEEN 1 AND 6),
    -- Audit column recording when the row was first created.
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- Audit column recording the last write; callers must refresh this on update.
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Table 2: placement_attempts
-- Tracks an individual learner's session taking the placement test.
-- Maintains their running score and records the outcome upon completion.
-- Idempotent creation so re-running the migration does not fail.
CREATE TABLE IF NOT EXISTS placement_attempts (
    -- Surrogate UUID primary key so attempt ids cannot be guessed or enumerated.
    -- `gen_random_uuid()` requires the pgcrypto extension (enabled by an earlier migration).
    id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- Owning learner; `ON DELETE CASCADE` removes attempts when the user is deleted.
    user_id                INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    -- Zero-based position in the ladder; used by the optimistic-concurrency guard.
    current_question_index INTEGER NOT NULL DEFAULT 0,
    -- Running count of correct answers, used to derive the final tier on completion.
    score                  INTEGER NOT NULL DEFAULT 0,
    -- Final tier assigned when the attempt closes; NULL while the attempt is in flight.
    -- The CHECK keeps stored values inside the same 1–6 band as `learner_levels`.
    assigned_level         INTEGER NULL CHECK (assigned_level BETWEEN 1 AND 6),
    -- Flag marking the attempt as finished, so further submissions are rejected.
    completed              BOOLEAN NOT NULL DEFAULT false,
    -- Audit column for row creation time.
    created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- Audit column for the last mutation; updated by the service on every write.
    updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Support index so lookups by learner (e.g. listing a user's attempts) stay fast.
-- `IF NOT EXISTS` keeps the migration idempotent for repeated runs.
CREATE INDEX IF NOT EXISTS idx_placement_attempts_user_id ON placement_attempts(user_id);

-- Table 3: placement_questions
-- Stores the graded placement ladder questions.
-- The correct_id column contains the correct answer identifier or expected string.
-- The API specifically strips correct_id before returning question data to the client,
-- ensuring correctness verification remains strictly server-side.
-- Idempotent creation for safe re-runs.
CREATE TABLE IF NOT EXISTS placement_questions (
    -- Stable textual identifier (e.g. 'q1') so seeds can reference rows across languages.
    id           TEXT PRIMARY KEY,
    -- Display header shown above each question.
    section      TEXT NOT NULL,
    -- Instruction sentence rendered under the section header.
    instructions TEXT NOT NULL,
    -- Widget type; the CHECK constraint rejects any value outside the two supported kinds.
    type         TEXT NOT NULL CHECK (type IN ('multiple-choice', 'fill-blank')),
    -- The question stem or sentence with a missing token.
    prompt       TEXT NOT NULL,
    -- JSONB array of `{id, text}` options for multiple-choice; NULL for fill-in questions.
    options      JSONB NULL,
    -- Secret answer key or expected string; never returned to clients.
    correct_id   TEXT NOT NULL,
    -- Zero-based ladder position; UNIQUE guarantees a single question per slot.
    order_index  INTEGER NOT NULL UNIQUE,
    -- Audit column for row creation time.
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed initial placement ladder questions
-- Designed to progressively evaluate language proficiency from CEFR A1 up to C1.
-- The explicit column list keeps the insert resilient to future column additions.
INSERT INTO placement_questions (id, section, instructions, type, prompt, options, correct_id, order_index)
VALUES 
(
    -- First seed row's stable identifier.
    'q1',
    -- Section header displayed above the question.
    'Grammar & Vocabulary',
    -- Instruction sentence shown under the header.
    'Choose the correct answer below.',
    -- Rendered as radio options.
    'multiple-choice',
    -- Present-perfect time-phrase prompt with a blank.
    'I have lived here _____ 2019.',
    -- Four options encoded as JSONB so they can be queried structurally later.
    '[{"id":"a","text":"for"},{"id":"b","text":"since"},{"id":"c","text":"during"},{"id":"d","text":"from"}]'::jsonb,
    -- Correct answer is "since" (option b).
    'b',
    -- First ladder position.
    0
),
(
    -- Second seed row's stable identifier.
    'q2',
    -- Section header.
    'Grammar & Vocabulary',
    -- Standard instruction.
    'Choose the correct answer below.',
    -- Rendered as radio options.
    'multiple-choice',
    -- Third-person singular verb agreement prompt.
    'She _____ to school every day.',
    -- Verb-form candidates as JSONB.
    '[{"id":"a","text":"walk"},{"id":"b","text":"walks"},{"id":"c","text":"walking"},{"id":"d","text":"is walk"}]'::jsonb,
    -- Correct answer is "walks" (option b).
    'b',
    -- Second ladder position.
    1
),
(
    -- Third seed row's stable identifier.
    'q3',
    -- Section header.
    'Grammar & Vocabulary',
    -- Standard instruction.
    'Choose the correct answer below.',
    -- Rendered as radio options.
    'multiple-choice',
    -- Antonym prompt.
    'What is the opposite of "expensive"?',
    -- Adjective candidates as JSONB.
    '[{"id":"a","text":"cheap"},{"id":"b","text":"difficult"},{"id":"c","text":"large"},{"id":"d","text":"modern"}]'::jsonb,
    -- Correct answer is "cheap" (option a).
    'a',
    -- Third ladder position.
    2
),
(
    -- Fourth seed row's stable identifier.
    'q4',
    -- Section header.
    'Grammar & Vocabulary',
    -- Fill-in instruction tailored to the input widget.
    'Type the missing word.',
    -- Rendered as a text input.
    'fill-blank',
    -- Conditional-verb prompt with a blank.
    'If I had known, I _____ have called you.',
    -- No options for fill-in questions, so the column is NULL.
    NULL,
    -- Expected answer is "would".
    'would',
    -- Fourth ladder position.
    3
),
(
    -- Fifth seed row's stable identifier.
    'q5',
    -- Section header.
    'Grammar & Vocabulary',
    -- Standard instruction.
    'Choose the correct answer below.',
    -- Rendered as radio options.
    'multiple-choice',
    -- Future perfect prompt.
    'By next year, she _____ here for a decade.',
    -- Verb-phrase candidates as JSONB.
    '[{"id":"a","text":"will work"},{"id":"b","text":"will be working"},{"id":"c","text":"will have worked"},{"id":"d","text":"has worked"}]'::jsonb,
    -- Correct answer is "will have worked" (option c).
    'c',
    -- Fifth ladder position.
    4
)
-- Conflict policy: if a row with the same id already exists (e.g. a curated admin
-- edit or a re-run of this migration), silently skip it instead of failing.
ON CONFLICT (id) DO NOTHING;