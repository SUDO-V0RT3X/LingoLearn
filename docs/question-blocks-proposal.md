# Question blocks: the shape to agree before building

For the content builder's Sprint 2 ticket (8 pts). Three people read this shape,
so it is worth ten minutes now rather than a rewrite later:

- **TK** — placement questions are these blocks, and `placement_attempts`
  records answers against them.
- **NS** — her `BlockRenderer` needs a branch and styling per type. Until it
  has one, a question renders as `No renderer yet for block type: …`.
- **TC** — scoring and progression read the results, not the blocks.

Nothing here is built yet. Reply on the merge request, or change it directly.

## 1. The three types

They follow the existing blocks exactly: every value starts with `title`, and
the strings are the `itemType` stored in the content JSON.

```ts
// itemType: 'Multiple Choice'
export interface $MultipleChoiceBlockValue {
    title: string;          // what the block is called in the builder
    question: string;       // shown to the learner
    options: string[];      // at least two, each non-empty, no duplicates
    correctOption: number;  // index into options
}

// itemType: 'Fill in the Blank'
export interface $FillBlankBlockValue {
    title: string;
    sentence: string;       // must contain [] exactly once: that is the gap
    accepted: string[];     // accepted answers, compared case-insensitively
}

// itemType: 'Listen and Choose'
export interface $ListenChooseBlockValue {
    title: string;
    fileUrl: string;        // an upload, as the Audio block stores it
    transcript: string;     // required, same rule as the Audio block
    options: string[];
    correctOption: number;
}
```

Adding these three to `QUESTION_BLOCK_TYPES` is what makes `deriveKind` return
`quiz`. Two things already wired up start working the moment it does: Explore's
"Has test" filter and card tag, and the moderation queue's Lesson/Test column.

## 2. The decision that matters: where the answers live

The content JSON is returned whole by `getContent`. If `correctOption` sits in
it, **a learner can read the answers out of the API response.** NS flagged
this in her placeholder: keep correct answers server-side once this is real.

Two ways to do that:

| | How | Cost |
| --- | --- | --- |
| **A. Strip on read** (recommended) | Answers stay in the content JSON, one source of truth, versioned with the content. `ContentMethods` removes `correctOption` and `accepted` when the reader is a learner. Marking happens server-side, where the full row is available. | One projection function, and a test proving a learner never receives an answer field. |
| **B. Separate table** | A `content_answers` table keyed by content id and block position. | The answers can drift from the blocks when an author reorders or deletes one. Reordering blocks is already a feature. |

Recommendation: **A**. The risk in B — answers silently attached to the wrong
question after a reorder — is worse than the projection in A.

Either way, marking is a server endpoint, not a frontend comparison. No answer
field should ever reach a learner's browser.

## 3. Validation at submit

Added to `checkSubmission` in
`backend/src/routes/api/routes.api/contentRoutes/functions/validateContent.ts`,
and mirrored in the submit screen's checklist:

- every question block needs a non-empty `title` and `question` (or `sentence`)
- multiple choice and listen-and-choose: at least two options, each non-empty
  after trimming, no duplicates, and `correctOption` within range
- fill in the blank: `sentence` contains `[]` exactly once, and at least one
  non-empty accepted answer
- listen and choose: `fileUrl` and `transcript`, same as the Audio block

## 4. What each person does

| Who | What |
| --- | --- |
| TD | The three types, their builder bars, the `BlockMux` branches, `QUESTION_BLOCK_TYPES`, the validation above, and the answer projection |
| NS | One line per type in her `BlockRenderer`. The rendering itself is handed over, see section 5 — she overrides it only if she wants a different look |
| TK | Placement reads these blocks; `placement_attempts` stores which block was answered and with what |
| TC | Nothing yet. Scoring and level-up sit on top of the results, once someone stores them |

## 5. What we hand over, so nobody builds it twice

The block types are read by the builder, the learner reader, the moderator
preview and later the placement test. That is four places one question could be
drawn, so the drawing is written once, in shared:

```
features/shared/models/contentType.ts          already shared: the types,
                                               emptyValueFor, isBlockOfType
features/shared/presentation/blocks/            new: one read-only component per
    MultipleChoiceBlock.vue                     question type, learner-facing,
    FillBlankBlock.vue                          no store and no props beyond the
    ListenChooseBlock.vue                       block value
```

Each takes a `value` and renders the question as a learner sees it — the same
prop shape NS's `TextBlock`, `ImageBlock` and `AudioBlock` already take, so
her `BlockRenderer` gains one line per type and nothing else:

```vue
<MultipleChoiceBlock v-else-if="isBlockOfType(block, ContentBlockTypes.multipleChoice)" :value="block.value" />
```

The builder's own preview renders through her `DocumentViewer`, so the author
view and the learner view cannot drift: they are the same components.

Two things this deliberately leaves to her:

- **The look.** These are plain, accessible defaults. If the learner reader
  wants its own styling, she swaps the component in her branch of the renderer
  and ours stays for the builder and the moderator preview.
- **The behaviour.** They render the question and its options. Selecting an
  answer, marking it and showing a result belong with whoever owns scoring,
  which is still open (see below).

The same offer stands for the three existing types: the read-only half of our
Text, Image and Audio bars could move into `features/shared/presentation/blocks/`
so her three components and ours stop being two renderings of one thing. That is
her call, not ours, and it is not in this ticket.

## 6. Open questions

1. **Answer submission and scoring.** Not in this ticket, and nobody owns it
   yet. A learner can be shown a question before that exists, but nothing can
   mark it. Suggest agreeing the owner in the same conversation.
2. **How many tests to level up.** NS's learner model assumed
   `REQUIRED_TESTS_PER_LEVEL = 6`. If that is the rule, it should live with
   TK's levels, not in a frontend constant.
3. **"Question blocks are only offered when content type is test" (2 pts).**
   The premise no longer holds: `kind` is derived from the blocks, not chosen by
   the author. Recommend closing it as obsolete and offering question blocks
   always — any question block makes the content a quiz by definition.
