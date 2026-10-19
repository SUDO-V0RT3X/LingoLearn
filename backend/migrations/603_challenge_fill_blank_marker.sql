-- LEVEL CHALLENGES: a challenge keeps a copy of the blocks it drew (602), and an
-- open one is shown again when the learner resumes it. Fill in the blank gaps are
-- now marked with [] instead of ___ (see 303_fill_blank_marker.sql, which rewrote
-- the content itself), so the copies are rewritten the same way. Running it again
-- changes nothing, because no rewritten sentence holds ___ any more.

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

-- questions is one list of blocks, kept in the order they were drawn.
UPDATE level_challenges AS lc
   SET questions = (
       SELECT jsonb_agg(pg_temp.fill_blank_marker(q.block) ORDER BY q.at)
         FROM jsonb_array_elements(lc.questions) WITH ORDINALITY AS q(block, at))
 WHERE jsonb_path_exists(lc.questions,
           '$[*] ? (@.itemType == "Fill in the Blank" && @.value.sentence like_regex "___")');

DROP FUNCTION pg_temp.fill_blank_marker(JSONB);
