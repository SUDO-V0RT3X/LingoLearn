-- CONTENT: a fill in the blank gap is now marked with [] instead of ___. There is
-- only ever one marker, so every sentence already stored is rewritten to use the
-- new one. Only the sentence of a 'Fill in the Blank' block changes; every other
-- block and field, and updated_at, stay as they were. Running it again changes
-- nothing, because no rewritten sentence holds ___ any more.
-- Level-up challenges keep their own copy of the blocks they drew; those are
-- rewritten in 603_challenge_fill_blank_marker.sql, after their table exists.

-- One block with its marker rewritten; any other block comes back unchanged.
CREATE OR REPLACE FUNCTION pg_temp.fill_blank_marker(block JSONB) RETURNS JSONB
LANGUAGE sql IMMUTABLE AS $$
    SELECT CASE
        WHEN block->>'itemType' = 'Fill in the Blank'
             AND jsonb_typeof(block->'value'->'sentence') = 'string'
        THEN jsonb_set(block, '{value,sentence}', to_jsonb(replace(block->'value'->>'sentence', '___', '[]')))
        ELSE block
    END
$$;

-- content is a list of pages, each a list of blocks; both keep their order.
UPDATE content AS c
   SET content = (
       SELECT jsonb_agg(
                  CASE WHEN jsonb_typeof(p.page) = 'array'
                       THEN (SELECT COALESCE(jsonb_agg(pg_temp.fill_blank_marker(b.block) ORDER BY b.at), '[]'::jsonb)
                               FROM jsonb_array_elements(p.page) WITH ORDINALITY AS b(block, at))
                       ELSE p.page
                  END
                  ORDER BY p.at)
         FROM jsonb_array_elements(c.content) WITH ORDINALITY AS p(page, at))
 WHERE jsonb_path_exists(c.content,
           '$[*][*] ? (@.itemType == "Fill in the Blank" && @.value.sentence like_regex "___")');

DROP FUNCTION pg_temp.fill_blank_marker(JSONB);
