# Scope: F. Moderation and Progression

**LingoLearn.** Owner: TC. 13 October 2026.

Whether content gets published, and whether a learner moves up a level.

## What the client asked for, and what is delivered

| Requirement | Status | What the client gets |
|---|---|---|
| Content state machine | Delivered | Draft, pending, approved and rejected, with the roles allowed to make each move. |
| Review queue | Delivered | Oldest first by default, with level, type, audience, language and waiting time; search, filters and sorting. |
| Claiming | Dropped | Dropped by group decision (see below). |
| Categorisation review | Delivered | The moderator sees the level, theme, tags and audience next to the content, including every question with its correct answer. |
| Review decisions | Changed | Approve, or reject with a mandatory reason. The author sees the reason and can reopen the content to fix it. |
| Level-up eligibility | Delivered | Three different tests (TESTS_REQUIRED_PER_LEVEL) passed at the learner's level, no active cooldown, and not already at the top level. |
| Level-up challenge | Delivered | Questions drawn from the next level, marked on the server, the level raised on a pass and a 24-hour cooldown on a fail. |
| Backend API | Delivered | Review queue, decisions and progression endpoints. |

## Changes agreed by the group

- Claiming and "request changes" were dropped: one moderator at a time is enough at this scale, and rejecting with a reason covers requested changes.
- The pass mark for each level comes from the administrator's level rules.

## How it connects

- **Provides:** Published content for learners; level changes for the learner.
- **Uses:** Content Builder (content and status), Learner Experience (passed tests), Onboarding (the learner's level), Taxonomy (pass marks).

## Seeing it in the demo

1. As the moderator: the review queue, open an item, approve or reject with a reason.
2. As the learner who has passed three tests: Level up, take the challenge, see the result.

Demo accounts come from `npm run seed:staff` and `npm run seed:demo`; the demo seed prints them. All share one demo password.
