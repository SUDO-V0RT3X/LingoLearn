-- Where each learner is in each piece of content they have opened: the page
-- they were last on, so the reader can resume there and Explore and My Learning
-- can offer "Continue reading". One row per learner and content, overwritten on
-- every page change (PUT /api/reading/saveProgress).
CREATE TABLE IF NOT EXISTS content_progress (
    learner_id  INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    content_id  INTEGER NOT NULL REFERENCES content (id) ON DELETE CASCADE,
    -- 0-based page index, always inside the content's pages when it was saved.
    page_index  INTEGER NOT NULL CHECK (page_index >= 0),
    -- The content's page count at that time, so progress reads as "page 2 of 5".
    total_pages INTEGER NOT NULL CHECK (total_pages > 0),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (learner_id, content_id),
    CHECK (page_index < total_pages)
);

-- "Continue reading" lists a learner's most recent first.
CREATE INDEX IF NOT EXISTS content_progress_learner_idx ON content_progress (learner_id, updated_at DESC);
