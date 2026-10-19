-- MODERATION: one row per decision a moderator makes on a piece of content.
-- The content's own status lives on content.status (300_content.sql); this is the
-- record of who decided what, when, and why, which the author's dashboard reads
-- back as feedback. Rows are kept after a resubmission, so the history stays.
CREATE TABLE IF NOT EXISTS content_reviews (
    id           SERIAL PRIMARY KEY,
    content_id   INTEGER NOT NULL REFERENCES content (id) ON DELETE CASCADE,
    moderator_id INTEGER NOT NULL REFERENCES users (id),
    decision     TEXT NOT NULL CHECK (decision IN ('approved', 'rejected')),
    -- Required when rejecting: the author needs to know what to change.
    reason       TEXT NOT NULL DEFAULT '',
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT rejection_needs_a_reason CHECK (decision = 'approved' OR reason <> '')
);

CREATE INDEX IF NOT EXISTS idx_content_reviews_content_id ON content_reviews(content_id);
