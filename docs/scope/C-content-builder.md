# Scope: C. Content Builder

**LingoLearn.** Owner: TD. 13 October 2026.

The authoring tool on which an author assembles a lesson or a test. The document it produces is what every other part of the platform reads.

## What the client asked for, and what is delivered

| Requirement | Status | What the client gets |
|---|---|---|
| Content schema | Delivered | Pages of typed blocks, the single source every reader uses: the learner reader, the review preview and grading. |
| Content table and routes | Delivered | Create, read, edit, delete and submit, by role. Each submission increases the content's version. |
| Draft lifecycle | Delivered | Create, save and reopen drafts; drafts are visible only to their author. |
| Page and block editor | Delivered | Add, edit, reorder (drag and drop) and delete pages and blocks. |
| Block types | Delivered | Text, image (uploaded), audio (uploaded), and the question types multiple choice, fill in the blank, and listen and choose. |
| Submission gate | Delivered | Every check is shown before submitting and enforced again by the server; submitting locks the content for review. |
| Author preview | Delivered | Shows the work exactly as a learner sees it, through the learner's own reader. |
| Answer security | Delivered | Correct answers never leave the server for a learner; they are graded server-side. |

## Changes agreed by the group

- Approved content is locked from editing rather than returning to review when edited.

## How it connects

- **Provides:** The content documents read by Learner Experience, Moderation and Progression.
- **Uses:** Media (audio and image uploads), Taxonomy (themes, tags, levels), Moderation (review outcomes).

## Seeing it in the demo

1. Sign in as the author: New content, add text, an image, audio and each question type, reorder, Preview.
2. Submit: see the checks, then submit for review.
3. As the moderator, approve it; as a learner, find and take it.

Demo accounts come from `npm run seed:staff` and `npm run seed:demo`; the demo seed prints them. All share one demo password.
