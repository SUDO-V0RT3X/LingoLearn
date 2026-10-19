# Scope: B. Onboarding and Placement

**LingoLearn.** Owner: TK. 13 October 2026.

Everything between a learner creating an account and starting to learn at a suitable level.

## What the client asked for, and what is delivered

| Requirement | Status | What the client gets |
|---|---|---|
| Learner level model and its write API | Delivered | One level per learner (1 to 6), written only through this subsystem; Progression raises it after a passed level-up challenge. |
| Learner setup | Delivered | Target language (English or isiZulu), date of birth and daily goal. The first save leads into the placement test. |
| Age detection and safety | Delivered | Under-13 learners get child-friendly content only and are blocked until a guardian links them. Only a linked guardian can change a learner's date of birth after setup. |
| Placement engine | Delivered | A question ladder that adapts to the learner's answers and calculates a starting level. Answer options are shuffled, and graded by id, never by position. |
| Placement test and result screens | Delivered | The interactive test and a result screen that sets the level and moves the learner on to Explore. |
| Backend API | Delivered | Endpoints for settings, access, placement steps and level updates. |

## Changes agreed by the group

- The learner's level is one level overall rather than one per language.
- Target languages are English and isiZulu; Tshivenda is planned as a later addition.

## How it connects

- **Provides:** Learner settings and access (who may see what), the learner's level, and the child/adult decision that switches the child theme.
- **Uses:** Identity (the parent link that admits an under-13 learner), Progression (raises the level).

## Seeing it in the demo

1. Create a new learner account, complete setup, and take the placement test.
2. Sign in as the child learner to see the child-friendly mode.
3. As the guardian, open the child's report and correct their date of birth.

Demo accounts come from `npm run seed:staff` and `npm run seed:demo`; the demo seed prints them. All share one demo password.
