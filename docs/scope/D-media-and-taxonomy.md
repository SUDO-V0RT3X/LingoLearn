# Scope: D. Media and Taxonomy

**LingoLearn.** Owner: MO. 13 October 2026.

The audio and images authors upload, and how content is classified: levels, themes and tags.

## What the client asked for, and what is delivered

| Requirement | Status | What the client gets |
|---|---|---|
| Media and taxonomy tables, with seed data | Delivered | Levels, tags and content tags, plus a demo seed of accounts, lessons and tests in isiZulu and English. |
| Media upload, validation and storage | Delivered | Audio (MP3, WAV, OGG, WebM) and images (PNG, JPEG, WebP, GIF) up to 5 MB, checked by type, extension and file content. |
| Classification endpoints | Delivered | Levels, themes and tags, with limits enforced (at most 10 tags per item). |
| Administrator taxonomy screen | Delivered | Manage themes and assessment tags, and each level's pass mark. |
| Author tagging | Delivered | Authors choose a level, audience, theme and extra tags when submitting. |
| Author dashboard | Delivered | Every piece of content with its status and review feedback. |
| Audio library | Delivered | Upload clips and see your own, with player and transcript. |

## Changes agreed by the group

- Uploads cannot be deleted, because approved content may still use them.
- Tags are set when content is submitted; the separate re-tagging routes were removed for security.

## How it connects

- **Provides:** Upload links for content blocks; levels, pass marks and tags used by the builder, Learner Experience and Progression; the demo data.
- **Uses:** Identity (roles), Content Builder (the content being tagged).

## Seeing it in the demo

1. As the author: the dashboard, the Audio library (upload a clip), an image block upload in the builder.
2. As the administrator: Taxonomy, add a tag, change a level's pass mark.

Demo accounts come from `npm run seed:staff` and `npm run seed:demo`; the demo seed prints them. All share one demo password.
