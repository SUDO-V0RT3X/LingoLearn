# Scope: E. Learner Experience

**LingoLearn.** Owner: NS. 13 October 2026.

Everything the learner sees and does: discovering content, working through lessons, taking tests, and following their progress.

## What the client asked for, and what is delivered

| Requirement | Status | What the client gets |
|---|---|---|
| Content progress and test attempt tables | Delivered | Every test attempt with its answers, score and outcome; reading progress per page. |
| Shared block renderer | Delivered | One renderer for every block type, used by the learner reader and the author preview. |
| Explore | Delivered | Approved content filtered by level, child-friendly and has-test, plus search. Content above the learner's level is shown locked and cannot be opened. |
| Lesson player | Delivered | Page navigation, audio playback, read-aloud practice, and resuming at the last page read. |
| Test runner, scoring and results | Delivered | Forward-only, one question at a time, marked on the server; the results show the score, pass or fail, and which questions were right. |
| My Learning | Delivered | Current level, progress toward the level-up challenge, statistics, history and continue reading. |
| Backend API | Delivered | Learner content, reading progress, test submission and learning history. |
| Child-friendly experience | Delivered | Children get a colourful theme and friendlier wording across every learner screen. |

## Changes agreed by the group

- Tests use the builder's three question types rather than a separate question format.

## How it connects

- **Provides:** Test attempts and progress that Progression (eligibility) and the guardian's report read.
- **Uses:** Content Builder (content), Onboarding (level and access), Moderation (only approved content), Progression (the challenge).

## Seeing it in the demo

1. Sign in as the adult learner: Explore, open a lesson, then take a test and see the result.
2. My learning: the sixth test passed unlocks the level-up challenge.
3. Sign in as the child learner: the same journey in the child theme.

Demo accounts come from `npm run seed:staff` and `npm run seed:demo`; the demo seed prints them. All share one demo password.
