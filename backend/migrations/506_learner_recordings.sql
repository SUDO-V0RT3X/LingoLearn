-- A learner's own read-aloud recording, saved to their account so it is still
-- there when they come back to the content. One per learner and content: the
-- reader offers the recorder on page 1 and plays the same clip back on whichever
-- page carries the author's audio, so a recording belongs to the content, not to
-- a page. Recording again replaces it (PUT /api/recordings/:contentId).
--
-- The audio itself is a file under uploads/recordings/, named file_name. That
-- folder is never served at /uploads: only its owner can fetch it, through
-- GET /api/recordings/:contentId.
CREATE TABLE IF NOT EXISTS learner_recordings (
    id          SERIAL PRIMARY KEY,
    learner_id  INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    content_id  INTEGER NOT NULL REFERENCES content (id) ON DELETE CASCADE,
    -- A generated name (a UUID), never the uploaded one.
    file_name   TEXT NOT NULL UNIQUE,
    -- One of audio/webm, audio/ogg, audio/mp4: what the browser recorded.
    mime_type   TEXT NOT NULL,
    size_bytes  INTEGER NOT NULL CHECK (size_bytes > 0),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (learner_id, content_id)
);
