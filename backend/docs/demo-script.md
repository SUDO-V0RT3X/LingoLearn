# Individual Demo Script — Moderation & Progression

**LingoLearn — TC**

Updated after merging TK's real placement/level system into the branch. 

---

## 0. Opening line 

> "I'm demoing Moderation and Progression — Review Queue and Review Detail from Sprint 1, and the full level-up challenge chain from Sprint 2, now integrated with a teammate's real system rather than running purely on stubs."

---

## 1. GUI walkthrough

### Review Queue (`/review-queue`)
- Load the page, point out the count and oldest-waiting time
- Toggle sort, show the order flip and amber highlight behaving correctly
- Change the level filter, show the count update

### Review Detail (`/review-queue/:id`)
- Click into a row, point out the learner-accurate preview (reused block renderer)
- Reject with an empty reason — show the block
- Reject with a real reason — show the feedback message

### Challenge Intro (`/challenge-intro`)
- Sign in as a learner with a saved language
- Show the real progress bar — actual test-pass count against the requirement
- Show either the "not yet" or "ready" state depending on current data

### Challenge Play (`/challenge/play`) — new since the last script version
- Click "Start the challenge" from the intro screen
- Watch the questions reveal one at a time — the staggered animation makes LIN-47's random shuffle visible
- Mark a mix of Correct/Incorrect (say plainly: *"since Content Builder has no real question-answer data yet, I'm marking these myself in a labeled demo mode — everything from here on is real"*)
- Submit, showing either:
  - **Pass** — mention the learner's level was just genuinely incremented in the database
  - **Fail** — show the live, ticking countdown (seconds actually counting down, not a frozen number)

---

## 2. Code walkthrough

1. **`QueueSortFilter.ts`** — one filter, one sort-direction ternary, fully tested
2. **`ChallengeEligibility.ts`** — the two-gate design: requirement checked before cooldown, deliberately
3. **`ProgressMethods.getLearnerLevel` / `submitChallenge`** — say explicitly: *"these now call a teammate's real code — `PlacementMethods.incrementLearnerLevel` — not a stub. I merged his branch in, resolved the conflicts, and confirmed it live with a real level-up."*
4. **The two remaining stubs** — read the comment on `fetchAttemptsForLearner` or `fetchQuestionsForLevel` out loud; both explain exactly what's missing on the other side and why.

---

## 3. Run the tests live

```bash
cd backend && npm test
cd ../frontend && npx vitest run
```


Ignore the lines above.

---

## 3b. Running only my own tests (optional, for quick checks)

Backend — scoped to my six test files:
```bash
cd backend
npx vitest run test/unit/reviewQueueMethods.test.ts test/unit/testPassCounter.test.ts test/unit/challengeEligibility.test.ts test/unit/questionSelector.test.ts test/unit/challengeGrader.test.ts test/unit/progressMethods.test.ts
```

Frontend — scoped to my three feature folders:
```bash
cd frontend
npx vitest run src/features/review_queue_feature src/features/review_detail_feature src/features/progress_feature
```

Note: this is for quick iteration only — always run the full `npm test && npm run test:integration` before committing, since changes here can affect shared files other slices depend on.


## 4. Complexity — the one insight worth repeating

> "My four largest classes are ProgressMethods, QueueSortFilter, ReviewDetailMethods, and QuestionSelector. Size and complexity don't track each other — ProgressMethods is both the largest and by far the most complex, at CC=9, because five tickets each added a method to it. The other three are close in size but differ meaningfully in complexity."

---

## 5. The two bugs I found and fixed tonight — worth telling, not hiding

**In my own code:**
> "While testing, I found that refreshing the play screen after a fail let a learner immediately retake the challenge — the screen was trusting that eligibility had already been checked elsewhere. I fixed it by having the play screen check independently."

**In shared team code, while merging:**
> "After merging a teammate's branch, my full test suite failed on a migration script — someone had written a JavaScript-style `//` comment inside a SQL string, which broke `npm run migrate` for the entire team, not just me. I traced it, fixed it, and flagged it."

This is worth saying plainly if asked "what went wrong" — finding and fixing real bugs, including in shared infrastructure, is stronger evidence of engineering ability than a demo where nothing ever went wrong.

---

## 6. Likely questions, prepared answers

**"Why is some of this still stubbed?"**
> "Two things — test-attempt data and quiz question content — genuinely don't exist yet on the other teams' slices. I checked directly, confirmed it with the group, and the module's own rules allow stubbing exactly this kind of cross-slice dependency."

**"What's not built yet?"**
> "Claiming a review item is optional and not built. A shared UI component library and a CI pipeline that runs tests on every merge request are both flagged on the team's shared todo — whole-project infrastructure, not specific to my slice."

**"How do you know the level integration actually works, not just compiles?"**
> "I triggered it with a real authenticated request outside the UI, then checked the database directly — a real user went from level 1 to level 2 through the actual code path, not a test double."

---

## 7. Closing line

> "That's the full chain — eligibility, question drawing, grading, and cooldown — now genuinely integrated with a teammate's real system, not just running in isolation. The two remaining stubs are exactly where this slice touches work that hasn't landed yet elsewhere, and I've confirmed that directly rather than assumed it."


