# Integration handover

What happened when the six slice branches were merged into `integration`, written
one page per person. Open the `.html` files in a browser.

| Page | For | Covers |
| --- | --- | --- |
| [overview.html](overview.html) | Everyone | What merged, the decisions that settled the conflicts, what is still missing |
| [ts-identity-access.html](ts-identity-access.html) | TS | Identity and access: the API and screens stayed, the storage moved to Postgres |
| [ts-integration-list.md](ts-integration-list.md) | TS | Identity and access: what is left before the 19 October demo (old branch, real report data, language codes) |
| [tk-onboarding.html](tk-onboarding.html) | TK | Onboarding: what was kept, what was dropped as another slice's, four bug fixes |
| [td-content-builder.html](td-content-builder.html) | TD | Content builder: ownership, title and language, and the routes other slices read |
| [mo-media-taxonomy.html](mo-media-taxonomy.html) | MO | Media and taxonomy: the tag collision, uploads behind the gate, the dashboard on real data |
| [tc-moderation.html](tc-moderation.html) | TC | Moderation: which branches merged, real queue, recorded decisions |
| [ns-learner-experience.html](ns-learner-experience.html) | NS | Learner experience: why the branch was not merged and what was ported instead |

## What the merge was, and was not

The job was to make the existing parts into one coherent system, not to build
anyone's remaining features. Onboarding and learner experience were ported,
fixed and rewired only; what is left in them is still their owner's.

Two slices did get new code, each because the join could not close without it.
Both are marked in that person's page and can be handed back:

- **Moderation** — the decisions table and the approve/reject and feedback
  routes. Deciding was never implemented, so nothing could reach `approved`.
- **Identity** — the same features, with the storage rewritten from JSON files
  to SQL, plus the staff seed script.

Two further additions were written during the merge and then removed again,
because integration did not need them: an image upload that only repeated the
audio path, and a second block renderer for the review screen, which now reuses
the learner's.

The content builder was advanced deliberately: four slices read it, and each gap
in it was blocking someone else.

## Before you pull

- Run `npm run migrate` against a **fresh** database. The migrations were
  renumbered, and applied files are tracked by filename.
- Add `AUTH_SECRET` to `backend/.env`. The server will not issue or verify a
  token without it.
- Run `npm run seed:staff` for the author, moderator and administrator accounts.
  Only learners and guardians can sign themselves up.
