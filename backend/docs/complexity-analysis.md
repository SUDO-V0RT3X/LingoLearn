# Cyclomatic Complexity — Four Largest Classes

**Moderation & Progression slice — LingoLearn**

Cyclomatic complexity (McCabe) is calculated as the number of independent decision points in a unit of code, plus one: **CC = (decision points) + 1**. Every `if`, ternary (`?:`), and short-circuit logical operator (`&&`, `||`) used for control flow counts as one decision point.

## The four largest classes, by lines of code

| Rank | Class | Lines |
|---|---|---|
| 1 | `ProgressMethods` | 157 |
| 2 | `QueueSortFilter` | 43 |
| 3 | `ReviewDetailMethods` | 42 |
| 4 | `QuestionSelector` | 36 |

`ChallengeEligibility` (35 lines) narrowly missed the cut.

`ProgressMethods` is over three times larger than the next class — it accumulated one method per ticket across LIN-45 through LIN-49, rather than each ticket getting its own file.

## Complexity of each

### `ProgressMethods` — CC = 9

Five methods, summed:

| Method | Decision points | CC |
|---|---|---|
| `getTestsPassedAtLevel` | none — straight-line | 1 |
| `getLastCooldownUntil` | 1 × `if`; 1 × `\|\|` inside it | 3 |
| `checkEligibility` | none — pure orchestration | 1 |
| `submitChallenge` | 1 × ternary; 1 × `if` | 3 |
| `drawChallengeQuestions` | none — straight-line | 1 |

**Class total: 1 + 3 + 1 + 3 + 1 = 9**

### `QueueSortFilter.apply` — CC = 3

One `if` (the level filter) and one ternary (the sort-direction flip) = 2 decision points → CC = 2 + 1 = 3.

### `ReviewDetailMethods.getReviewDetail` — CC = 2

One `if` (the not-found check) = 1 decision point → CC = 1 + 1 = 2.

### `QuestionSelector.selectQuestions` — CC = 1

No branching at all — a copy, a shuffle call, and a slice. The theoretical minimum.

## Summary

| Class | Lines | CC | Interpretation |
|---|---|---|---|
| `ProgressMethods` | 157 | **9** | Highest — five tickets' worth of methods in one class |
| `QueueSortFilter` | 43 | 3 | Low — one filter, one sort switch |
| `ReviewDetailMethods` | 42 | 2 | Low — a single not-found check |
| `QuestionSelector` | 36 | 1 | Minimal — no branching |

## What this shows

Size and complexity don't track each other here. `QueueSortFilter` and `ReviewDetailMethods` are close in size (43 vs 42 lines) but differ in complexity (3 vs 2). `ProgressMethods` is both the largest and the most complex, but by a margin much bigger than its size advantage alone would suggest — a signal that it has accumulated real decision-making across its five methods, not just length.

Worth watching going forward: if the progression feature grows further, `ProgressMethods` sitting well above every other class in complexity is a reasonable point to consider splitting it — e.g. separating eligibility-related reads from challenge-submission writes — rather than continuing to add methods to one file.
