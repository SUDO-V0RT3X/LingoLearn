-- The template's walkthrough table. Its routes are gone, so the table goes too.
-- 090_foo.sql has already run on existing databases, so it stays and this undoes it.
DROP TABLE IF EXISTS foo;
