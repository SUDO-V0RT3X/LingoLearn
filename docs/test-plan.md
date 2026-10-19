# Moderation & Progression — Test Plan

**GUI Test Plan, Input Validation Summary & Cyclomatic Complexity Analysis**
*LingoLearn — TC*

## Scope note

This pass is scoped specifically to LIN-38 (Review Queue) and LIN-39 (Review Detail) — the two tickets actually built this sprint. Table VI's other classes (`ContentStateMachine`, `DecisionService` as a backend concept, `ClaimService`, `ChallengeEligibility`, `ChallengeService`) belong to later Sprint 2 tickets and are intentionally left untested here, since there is no real code behind them yet. Instead, the logic already sitting inside the two built screens — waiting-time formatting, the sort/filter behaviour, and the reason-required decision check — has been pulled out into small, named, testable units, alongside direct unit tests of the two backend methods classes. **23 tests, all passing, covering both tickets.**

---

## 1. GUI Test Plan

Written as expected behaviour, not screenshots — each row states a precondition, the action taken, and exactly what the screen should show afterwards.

### 1.1 Review Queue screen (LIN-38)

| ID | Precondition | Action | Expected result |
|---|---|---|---|
| TC-01 | Queue has 7 pending items | Navigate to `/review-queue` | Table renders 7 rows; subtitle reads "7 pending · oldest waiting 3 d"; rows ordered oldest-submitted first |
| TC-02 | Sort set to "Oldest first" (default) | Change sort dropdown to "Newest first" | Row order reverses; the amber highlight on the oldest row is removed, since it is no longer row 1 |
| TC-03 | Items exist at multiple levels | Select "Level 4" in the level filter | Only rows with level = 4 remain visible; subtitle updates to "X shown of 7 pending" |
| TC-04 | A level filter is active | Select "Any" in the level filter | All pending rows return to view |
| TC-05 | Any row is visible | Click that row's "Review" link | Browser navigates to `/review-queue/:id` matching that specific row's id, not a fixed or different id |
| TC-06 (invalid) | Backend server is not running | Navigate to `/review-queue` | An error message is shown in place of the table; the page does not crash or render blank with no explanation |
| TC-07 (edge) | Queue has zero pending items | Navigate to `/review-queue` | Subtitle reads "0 pending"; table header renders with no data rows beneath it |

### 1.2 Review Detail screen (LIN-39)

| ID | Precondition | Action | Expected result |
|---|---|---|---|
| TC-08 | Item id 1 exists and is pending | Navigate to `/review-queue/1` | Title, author, status, assigned tags and every content page for id 1 render correctly |
| TC-09 (regression) | Currently viewing item 1 | Click a "Review" link for item 3 from elsewhere without a full page reload | Screen updates to show item 3's actual title and content, not item 1's stale data |
| TC-10 | Viewing any pending item | Click "Approve" | Confirmation message reads exactly "Approved — will be published to learners." |
| TC-11 (invalid) | Reason box is open for Request changes | Click "Confirm" with the reason field left empty | An alert requires a reason; the decision is not submitted and no message appears |
| TC-12 | Reason box is open for Request changes | Type a reason, click "Confirm" | Message reads exactly "Changes requested — feedback sent to the author." |
| TC-13 | An "Approved" message is currently shown | Click "Request changes" | The old "Approved" message disappears immediately, before the reason box is shown |
| TC-14 | Reason box is open | Click "Cancel" | Reason box closes; no decision message is shown afterwards |
| TC-15 (invalid) | No item with id 999 exists | Navigate to `/review-queue/999` | An error message is shown instead of a blank page or an unhandled crash |

---

## 2. Input Validation — Correct vs. Incorrect Values

Every validation rule actually built for LIN-38 and LIN-39 is tested against both a value that should be accepted and one that should be rejected, so the rule is proven from both directions rather than only the happy path.

| Rule | Correct value → result | Incorrect value → result |
|---|---|---|
| Decision reason requirement | Reason text supplied for reject / request changes → accepted, decision recorded | Reason left blank or whitespace-only → rejected client-side, decision not submitted |
| Approve reason requirement | No reason needed to approve → always accepted | N/A — approve has no reason field to get wrong |
| Review-detail id (backend route) | A valid integer id (e.g. 1) → item returned | A non-integer id (e.g. `"abc"`) → 400 Bad Request |
| Review-detail id (does it exist) | id = 1 → the real item returned | Any other id (e.g. 2) → 404 Not Found |
| Moderator-only routes | Request carries a moderator/admin role → allowed through | No authenticated role present → 401 Unauthorized |
| Level filter (Review Queue) | A level with matching rows → that subset returned | A level with no matching rows → empty array returned, not an error |

---

## 3. Cyclomatic Complexity — 4 Largest Classes (LIN-38 & LIN-39)

Cyclomatic complexity (McCabe) is calculated as the number of independent decision points in a unit of code, plus one: **CC = (decision points) + 1**. Every `if`, `else-if` branch, ternary (`?:`), and short-circuit logical operator (`&&`, `||`) used for control flow counts as one decision point. The four largest classes by lines of code, among the six extracted or tested for this pass, are analysed below.

### 3.1 `ReviewDetailMethods` (42 lines — largest, mostly placeholder data)

| Method | Decision points counted | CC |
|---|---|---|
| `getReviewDetail()` | 1 × `if (id !== 1)` | 2 |

**Class total CC = 2.** Most of this file's 42 lines are the placeholder data object literal, not branching logic — a reminder that line count and complexity are not the same measure. Once this is swapped for a real database query, the single conditional here is likely to be replaced by the database's own "row not found" check.

### 3.2 `QueueSortFilter` (33 lines)

| Method | Decision points counted | CC |
|---|---|---|
| `apply()` | 1 × `if (levelFilter !== 'any')`; 1 × ternary inside the sort comparator (`sortOrder === 'oldest' ? diff : -diff`) | 3 |

**Class total CC = 3.**

### 3.3 `ReviewQueueMethods` (23 lines)

| Method | Decision points counted | CC |
|---|---|---|
| `getReviewQueue()` | none — straight-line code, no branching | 1 |

**Class total CC = 1** (the theoretical minimum). Like `ReviewDetailMethods`, most of its lines are placeholder data, not logic.

### 3.4 `DecisionValidator` (22 lines — highest complexity of the four)

| Method | Decision points counted | CC |
|---|---|---|
| `validate()` | 1 × `\|\|` (building `reasonRequired`); 1 × `if (reasonRequired && reason.trim() === '')`; 1 × `&&` inside it | 4 |

**Class total CC = 4.**

### 3.5 Summary

| Class | Lines | Total CC | Interpretation |
|---|---|---|---|
| `ReviewDetailMethods` | 42 | 2 | Low — a single not-found check; bulk of the file is data, not logic |
| `QueueSortFilter` | 33 | 3 | Low — one filter condition, one sort-direction ternary |
| `ReviewQueueMethods` | 23 | 1 | Minimal — no branching at all |
| `DecisionValidator` | 22 | 4 | Low-moderate — the most complex of the four, still simple to test exhaustively |

All four classes sit at the low end of the complexity scale (CC 1–4), which tracks with how small and single-purpose each one is — every branch across all four is already exercised by the unit tests delivered alongside this document. The pattern worth noting: the two classes with the most lines (`ReviewDetailMethods`, `ReviewQueueMethods`) are actually the *least* complex, because their length comes from placeholder data rather than decision logic — line count is not a reliable stand-in for complexity on its own.
