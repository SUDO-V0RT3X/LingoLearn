-- Taxonomy tables: levels, tags, and the content_tags linker.
-- This file owns every tag table. The content builder reads the theme tags from
-- here; content.level matches levels.level_number (1-6).

-- Levels table: reading and learning levels with their descriptions
CREATE TABLE IF NOT EXISTS levels (
    id           SERIAL PRIMARY KEY,
    level_number INTEGER NOT NULL UNIQUE CHECK (level_number >= 1),
    name         TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 60),
    description  TEXT NOT NULL DEFAULT '',
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tags table: tags that can be attached to content
-- Two tag types are supported:
--   'test': differentiates content for tests and assessments
--   'theme': describes the themes covered by a piece of content
CREATE TABLE IF NOT EXISTS tags (
    id          SERIAL PRIMARY KEY,
    name        TEXT NOT NULL UNIQUE CHECK (length(name) BETWEEN 1 AND 50),
    tag_type    TEXT NOT NULL CHECK (tag_type IN ('test', 'theme')),
    description TEXT NOT NULL DEFAULT '',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tags_tag_type ON tags(tag_type);

-- Content tags linker table: links a piece of content to its tags
-- A single piece of content cannot have more than 10 tags.
-- Deleting content removes its links; a tag that is still in use cannot be deleted.
CREATE TABLE IF NOT EXISTS content_tags (
    id         SERIAL PRIMARY KEY,
    content_id INTEGER NOT NULL REFERENCES content (id) ON DELETE CASCADE,
    tag_id     INTEGER NOT NULL REFERENCES tags (id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_content_tag UNIQUE (content_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_content_tags_content_id ON content_tags(content_id);
CREATE INDEX IF NOT EXISTS idx_content_tags_tag_id ON content_tags(tag_id);

-- Enforce the maximum of 10 tags per content item at the database level
CREATE OR REPLACE FUNCTION check_content_tags_limit()
RETURNS TRIGGER AS $$
DECLARE
    tag_count INTEGER;
BEGIN
    SELECT count(*) INTO tag_count
    FROM content_tags
    WHERE content_id = NEW.content_id;

    IF tag_count >= 10 THEN
        RAISE EXCEPTION 'A single piece of content cannot have more than 10 tags (content_id: %)', NEW.content_id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_check_content_tags_limit ON content_tags;

CREATE TRIGGER trg_check_content_tags_limit
BEFORE INSERT ON content_tags
FOR EACH ROW
EXECUTE FUNCTION check_content_tags_limit();

-- Seed initial levels
INSERT INTO levels (level_number, name, description) VALUES
    (1, 'Level 1: Absolute Beginner', 'Foundational phonics, basic vocabulary, and simple greetings'),
    (2, 'Level 2: Elementary Reader', 'Simple sentence structures and familiar everyday topics'),
    (3, 'Level 3: Intermediate Reader', 'Paragraph-length stories, descriptive narrative, and expanded vocabulary'),
    (4, 'Level 4: Advanced Reader', 'Complex compound sentences, abstract concepts, and cultural texts'),
    (5, 'Level 5: Fluent Reader', 'Unconstrained literature, nuanced grammar, and idiom comprehension'),
    (6, 'Level 6: Independent Reader', 'Full-length texts, register and tone, and independent study')
ON CONFLICT (level_number) DO NOTHING;

-- Seed initial tags for tests and themes
INSERT INTO tags (name, tag_type, description) VALUES
    -- Test tags: differentiate content for tests
    ('quiz', 'test', 'Short formative quiz checking recent lesson topics'),
    ('placement-test', 'test', 'Diagnostic test evaluating initial reader placement'),
    ('practice-test', 'test', 'Ungraded practice assessment for self-study'),
    ('review-test', 'test', 'Comprehensive unit or level checkpoint assessment'),
    -- Theme tags: describe content themes
    ('travel', 'theme', 'Navigating transport, directions, places, and journeys'),
    ('food', 'theme', 'Culinary culture, ingredients, dining out, and recipes'),
    ('family', 'theme', 'Kinship, household roles, and family traditions'),
    ('school', 'theme', 'Classroom environment, study routines, and educational subjects'),
    ('animals', 'theme', 'Domesticated pets, wildlife, and natural habitats'),
    ('daily-life', 'theme', 'Routines, weather, shopping, and community interactions'),
    ('greetings', 'theme', 'Meeting people, introductions, and everyday courtesies'),
    ('numbers', 'theme', 'Counting, prices, dates, and quantities'),
    ('shopping', 'theme', 'Markets, shops, money, and bargaining'),
    ('directions', 'theme', 'Asking the way, landmarks, and giving instructions'),
    ('weather', 'theme', 'Seasons, forecasts, and talking about the weather'),
    ('conversation', 'theme', 'Small talk, opinions, and keeping a conversation going'),
    ('vocabulary', 'theme', 'Word building, synonyms, and everyday word sets'),
    ('listening', 'theme', 'Listening practice with recorded speech'),
    ('grammar', 'theme', 'Sentence patterns, tense, and agreement')
ON CONFLICT (name) DO NOTHING;

