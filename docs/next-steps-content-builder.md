# Content builder: what is left

Written at the end of the integration merge, for the slice owner (TD,
TD-ID). Sprint 2 tickets, the debt the merge left behind, and the documents
that the merge made stale.

## 1. Close out the merge

| Task | Notes |
| --- | --- |
| Merge request `integration` → `main` | Needs one approval from someone other than the author |
| Tell the group how to pick it up | A **fresh** database for `npm run migrate`, `AUTH_SECRET` in `backend/.env`, then `npm run seed:staff` |
| Retire the dead branches | Listed in [handover/README.md](handover/README.md). Keep `learner_experiencev1` until NS has signed off on the port |
| Chase the intermittent backend test timeout | On a loaded machine a database test occasionally times out. Never a wrong result, always a stall. Reproduce under load, then fix it or write it up |

## 2. Sprint 2 tickets

Two of the five landed with the merge: **submit-time validation** (5 pts) and
**submitting transitions draft to pending and locks editing** (3 pts).

### Author preview — 3 pts, do first

The Preview button is still disabled. The learner slice's `BlockRenderer` takes
exactly this slice's block shape, and the moderation review screen already
reuses it, so the preview is a small piece of wiring rather than a new renderer.

### Question block types — 8 pts, and it blocks onboarding

Multiple choice, fill in the blank, listen and choose. Touches:

- `ContentBlockTypes` and one value interface per type, in
  `features/shared/models/contentType.ts`, plus `emptyValueFor`
- one bar component per type, and a branch in `BlockMux`
- `QUESTION_BLOCK_TYPES` on both sides — both arrays are empty and waiting, and
  filling them is what makes `deriveKind` return `quiz`
- `BLOCK_TYPES` and the submit checks in
  `contentRoutes/functions/validateContent.ts`
- tests on both sides

**Agree the value shape with TK before building it.** His placement ladder
stores a learner's answers against these blocks, and he cannot start until the
shape is fixed.

### Question blocks only when the content type is test — 2 pts, decide the premise

The ticket assumes the author picks a content type. The merge settled that
`kind` is *derived* from the blocks: any question block makes it a quiz. Either
add an explicit type toggle, or close the ticket as obsolete and offer the
question blocks always. Recommendation: the second, recorded in the status doc.

## 3. Debt in the slice

- **Cap the size of content.** `express.json` is at 50 MB (from the scaffold) and
  nothing limits pages, blocks or string lengths.
- **Move `CONTENT_LEVELS` and `CONTENT_LANGUAGE_OPTIONS` into
  `features/shared`.** The learner slice reaches into
  `content_builder/functions/submission.ts` for them today.

## 4. Documents the merge made stale

- [gui-tests/content-builder.md](gui-tests/content-builder.md) — needs a re-run.
  The screens gained a title field, real audio upload, the draft-reopen route at
  `/content-builder/:contentId`, the delete button, role guards, and the
  language and child-friendly controls on submit.
- [cyclomatic-complexity.md](cyclomatic-complexity.md) — the store,
  `ContentMethods` and the routes all changed. The routes got simpler when the
  three copies of the validation became one module.
- `unit-tests.md` and `unit-tests.csv` in the report folder — they say 115 tests
  across 28 classes; it is now 124 backend and 285 frontend.
- The next status-doc section.

## Order

The merge request first, because everyone else is waiting on it. Question blocks
next, because TK is waiting on those. Author preview is the cheapest win and
fits while the merge request is waiting for approval.
