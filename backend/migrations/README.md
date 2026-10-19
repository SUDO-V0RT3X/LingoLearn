# Migrations

Numbered `.sql`, applied in filename order by `npm run migrate` (tracked in
`schema_migrations`). Team rule: **whoever owns a table owns its migration file** —
prefix ranges per slice so numbers never collide:

- 0xx foundation (shared, group decision)
- 1xx IAM (users, parent_links, link_codes)
- 2xx onboarding (learner_settings, learner_levels, placement_attempts)
- 3xx content builder (content)
- 4xx media & taxonomy (levels, tags, content_tags — every tag table lives here)
- 5xx learner experience (test_attempts in 501, reading progress in 502;
  503 upgrades databases where an older 501 migration was already recorded;
  504 makes the legacy `pass_rate` column optional for new submissions;
  505 makes test_attempts cascade; learners' saved read-aloud recordings in 506)
- 6xx moderation & progression (content_reviews in 600; level_challenges in 601, made into server-held challenge sessions in 602)

`000_template.sql.example` is the blank template — copy it into your range, name it and fill it in.

Applied files are tracked by filename, so a file that has already run is never
re-run and must not be edited: add a new numbered file instead.


`090_foo.sql` created the template's walkthrough table; `091_drop_foo.sql` removes it again.
