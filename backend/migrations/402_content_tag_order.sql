-- TAXONOMY: the order an author put a piece of content's tags in. The content
-- builder reads the first tag as the content's theme, so the tags are read back
-- in this order rather than by name, and a saved draft keeps the same theme.
-- Kept in its own file because 400_taxonomy.sql has already run.
ALTER TABLE content_tags
    ADD COLUMN IF NOT EXISTS position INTEGER NOT NULL DEFAULT 0 CHECK (position >= 0);

-- Links made before this column existed were inserted in the order they were
-- sent, so their ids keep that order.
UPDATE content_tags ct
   SET position = numbered.position
  FROM (SELECT id, row_number() OVER (PARTITION BY content_id ORDER BY id) - 1 AS position
          FROM content_tags) numbered
 WHERE ct.id = numbered.id;
