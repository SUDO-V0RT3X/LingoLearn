# Identity & Access: your integration list

Hi TS. This is what is left in your slice for the Group Demo on **19 October**,
and only that. The polishing and hardening work is already done on the branch
`slice/identity` (summary at the bottom), so none of it is on this list.

Each item says **why**, **where** and **how**. Items marked **DEMO** need to be
done before the 19th; the rest can wait.

| # | Item | Demo? |
| --- | --- | --- |
| 1 | [Bring in what is still useful from your old branch, without merging it](#1-your-old-branch-port-the-keepers-do-not-merge-it) | **DEMO** |
| 2 | [Wire the child progress report to real data](#2-wire-the-child-progress-report-to-real-data) | **DEMO** |
| 3 | [Settle the report's language codes](#3-settle-the-reports-language-codes) | **DEMO** |
| 4 | [Give the demo learner something to report](#4-give-the-demo-learner-something-to-report) | **DEMO** |
| 5 | [Admin search by email and username](#5-admin-search-by-email-and-username) | nice for the demo |
| 6 | [The dead `requires_guardian_link` flag](#6-the-dead-requires_guardian_link-flag) | after |
| 7 | [`GET /api/auth/roles` lists every role](#7-get-apiauthroles-lists-every-role) | after |
| 8 | [Document your endpoints in openapi.yaml](#8-document-your-endpoints-in-openapiyaml) | after |
| 9 | [Email registration: verification and password reset](#9-email-registration-verification-and-password-reset) | after (decide only) |

---

## 1. Your old branch: port the keepers, do not merge it

**DEMO**

**Why.** Your branch `origin/Auth_&amp;_parent_linking` (the name really
contains `&amp;`, so always quote it) was last committed on 28 September
(`0b06fb8`). Since then almost everything on it has reached the shared base
another way, and a merge now conflicts in a lot of files:

```sh
# from the repo root; quote the ref because of the & and ;
git merge-tree --write-tree --name-only --no-messages 0f21bf5 'origin/Auth_&amp;_parent_linking'
git merge-tree --write-tree --name-only --no-messages origin/main 'origin/Auth_&amp;_parent_linking'
git merge-tree --write-tree --name-only --no-messages slice/identity 'origin/Auth_&amp;_parent_linking'
```

| Merged into | Conflicting files |
| --- | --- |
| `origin/main` | 8: `parentLinkMethods.ts`, `routes.ts`, `App.vue`, `authEndpoints.ts`, `AdminAccountManagement.spec.ts`, `ParentLinkScreen.vue`, `authStore.spec.ts`, `authStore.ts` |
| the integration base `0f21bf5` | 12: the 8 above plus `index.html`, `OnboardingScreen.vue` (deleted on the base), `SignInScreen.vue`, `router/index.ts` |
| `slice/identity` | 21: the restyled screens and dialogs, their tests, and the admin service conflict as well |

**How.** Don't merge. Once `slice/identity` is in, start a branch from the
integrated main, copy across the few things in the "port" column by hand, and
then archive or delete the old branch so nobody merges it by accident.

| Your branch had | What to do | Why |
| --- | --- | --- |
| Sign-out button in `App.vue` | **Drop** | The shell already has it: `frontend/src/features/shared/presentation/shell/AppHeader.vue` (user menu). |
| Role-based landing (`functions/authDestination.ts` + spec, router edits) | **Drop** | Already on main as route `home` (`resolveHome` in `frontend/src/router/index.ts`, `homeRouteNameFor` in `shell/navigation.ts`). |
| Show/hide password | **Already done** | The new `SignInScreen.vue` has a Show/Hide toggle (tested). |
| Sign-up limited to learner and guardian | **Already done**, except `/api/auth/roles` | The UI only offers the two, and `AccountMethods.signUp` refuses the rest. The one missing piece is item 7. |
| Parent-link reset fix (children list empty after sign-in) | **Already done** | `authStore.loadChildren` sets `hasLoadedChildren`, `ParentLinkScreen` loads on open, and the `unlinked_at IS NULL` filters are on the base. |
| Guardian sign-up opens "Add child" (`?addChild=1`) | **Optional** | The new My children page shows the code form all the time, so the dialog isn't needed. If you want it, focus the code input when `route.query.addChild === '1'`. |
| Hard-coded demo progress report (`buildDemoProgressReport`, Tshivenda / level 3 / 82%) | **Drop** | Invented data in front of markers. The endpoint it fed (`/api/auth/children/:childId/progress`) has been removed; the real report is item 2. |
| Edits to `backend/migrations/101_parent_linking.sql` | **Drop** | That migration has already run everywhere. Migrations are tracked by filename, so edits never run and only make the file disagree with real databases. Schema changes go in a new `1xx` file. |
| `backend/uploads/*.meta.json` (12 files) | **Drop** | Runtime upload artefacts from your machine, not source. |
| 15-character maximum on passwords | **Drop** | Long passphrases are the safest passwords, and it contradicts the 8+ rule elsewhere. |
| 15-character maximum on usernames | **Your call**, but I'd drop it | The base allows 3–30, and the UI hint and `openapi.yaml` say 30. If you keep 15, change all three together. |
| "Gudani Na Rine (GNR)" in `index.html` and the server log | **Drop** unless the group renames the app | The name lives in one place, `APP_NAME` in `frontend/src/core/brand.ts`. A rename changes that line and the `<title>` in `index.html`. |
| Old nav bar in `App.vue` (Foo / Feature 1 links) | **Drop** | Those routes are gone and the shell has replaced the nav bar. |
| `OnboardingScreen.vue` edits | **Drop** | The screen was deleted on the base; `/onboarding` redirects to `home`. |
| Comment-only rewrites (`roleGuard.ts`, `passwordMethods.ts`, `authEndpoints.ts`, `roleGuard.test.ts`) | **Drop** | No behaviour change, and they would bury the real diff. |
| `SignInScreen.spec.ts`, `ParentLinkScreen.spec.ts` | **Drop** | They test the 15-character limit and the collapsed dialog. `slice/identity` has new specs for both screens. |
| `router/__tests__/router.spec.ts` (`/` redirects to sign-in) | **Port** | Still true and still untested on main. |
| `AppSignOut.spec.ts` | **Port, rewritten** | Main has no sign-out test. Point it at `AppHeader.vue`: open the user menu, click Sign out, expect `auth.logout` and a redirect to `signIn`. |

---

## 2. Wire the child progress report to real data

**DEMO**

**Why.** `GET /api/guardians/me/children/:childId/report` works end to end
(link check, 403 for an unlinked child, flags, language switch, screen), but
every number comes from stubs. A guardian sees zeros and "Not placed" for every
child.

**Where.** Everything is in
`backend/src/routes/api/routes.api/authRoutes/methods/childProgressReportDependencies.ts`.
`childProgressReportService.ts` and the screen don't need changes. Swap the four
stubs (and the profile reader's hard-coded fields) for readers over the real
tables:

| Stub | Read from | How |
| --- | --- | --- |
| `IdentityChildProfileService` (`languages`, `activeLanguage`, `lastActiveAt`, `childFriendly` are fixed) | `learner_settings`, `test_attempts`, `level_challenges`, `shared/learnerAccess.ts` | `activeLanguage` and `languages` come from `learner_settings.target_language` (see item 3). `lastActiveAt` is the later of `MAX(test_attempts.submitted_at)` and `MAX(level_challenges.created_at)`. `childFriendly` is `(await getLearnerAccessForUser(id)).contentAudience === 'child'`; catch its 403 for a child who hasn't finished setup. |
| `LevelServiceStub` | `learner_levels` | One row per learner, **not** per language. Return `{ [activeLanguage]: level_number }`, or `null` when there is no row, so the report says "Not placed". Don't use `currentLevelOf()` here: it returns 1 for an unplaced learner. |
| `ProgressServiceStub` | `test_attempts` (migration **501**, new) joined to `content` for the title; `level_challenges` | Recent activity: `SELECT ta.content_id, c.title, ta.percent, ta.passed, ta.submitted_at FROM test_attempts ta JOIN content c ON c.id = ta.content_id WHERE ta.learner_id = $1 AND ta.language = $2 ORDER BY ta.submitted_at DESC LIMIT $3`, mapped to `type: 'test'`, `score: percent`, `outcome: passed ? 'passed' : 'failed'`. Add `level_challenges` rows as `type: 'challenge'` (no content id, so use the challenge id, or make `contentId` nullable in both type files). Completed is `COUNT(DISTINCT content_id) … AND passed`. Average is `ROUND(AVG(percent))`, or `null` when there are no rows. |
| `ChallengeEligibilityServiceStub` | `shared/levelRules.ts`, `level_challenges`, `progressRoutes/methods/challengeEligibility.ts` | `testsRequired = TESTS_REQUIRED_PER_LEVEL`; `testsPassed = distinctTestsPassedAt(id, currentLevelOf(id))`; `cooldownEndsAt` is the newest `level_challenges.cooldown_until` for the learner, language and next level. `eligible = ChallengeEligibility.check(testsPassed, testsRequired, cooldown, now).eligible`. Reusing these keeps the guardian's view in step with what the learner sees. |

**Tests.** `backend/test/integration/childProgressReportRoutes.test.ts`: insert
a few `test_attempts` and a failed `level_challenges` row for a linked learner,
then assert the summary, the activity order, `cooldown`, and that another
learner's attempts never show. The existing unit tests take a
`ChildProgressReportDependencies` object, so they keep working.

**Heads-up.** The report screen is also getting a `GuardianDateOfBirthCard`
from another branch, so expect one extra import and tag in
`ChildProgressReportScreen.vue` when you merge.

---

## 3. Settle the report's language codes

**DEMO** (part of item 2)

**Why.** The report speaks one dialect and the data another:

- The report uses `'en' | 'zu'`: `ReportLanguage` in
  `backend/.../authRoutes/types/childProgressReportType.ts`, the `?language=`
  check in `childProgressReportRoutes.ts` ("language must be en or zu"),
  `frontend/src/features/auth_feature/models/childProgressReportType.ts`, and
  `languageName()` in `ChildProgressReportScreen.vue`.
- Content and test attempts use `'english' | 'zulu'`: `CONTENT_LANGUAGES` in
  `contentRoutes/types/contentType.ts`, and the `CHECK` in
  `501_test_attempts.sql`.
- `learner_settings.target_language` is now limited to `'english'` and
  `'zulu'` (migration 208), and the demo seed uses `'zulu'`.

So a query of `test_attempts WHERE language = 'en'` returns nothing, ever.

**How.** Switch the report to the words the database already uses:
`ReportLanguage = 'english' | 'zulu'`, accept those in the route, and update the
frontend type and `languageName()`. Mapping `en` to `english` in one adapter
also works, but it is one more thing to keep in step.

---

## 4. Give the demo learner something to report

**Done in the seed.** `scripts/seedDemo.ts` now gives `young_learner` five passed
isiZulu level-1 tests in `test_attempts`, at level 1 in `learner_levels`. Once
item 2 reads the real tables, the guardian's report shows them. Rehearse the
guardian path once on a fresh database: sign in as `one@guardian.test`, then
My children, then View progress.

---

## 5. Admin search by email and username

Nice to have for the demo.

**Why.** The Users page searches by **name or user ID only**
(`AdminUserService.listUsers`, `LOWER(first_name || ' ' || last_name) LIKE …`).
Typing `one@guardian.test` or `young_learner` finds nobody, which is the first
thing someone tries in a demo.

**How.** In
`backend/src/routes/api/routes.api/adminUserRoutes/methods/adminUserService.ts`,
widen the text branch to `(LOWER(first_name || ' ' || last_name) LIKE $n
ESCAPE '\' OR LOWER(email) LIKE $n ESCAPE '\' OR LOWER(username) LIKE $n ESCAPE
'\')`, reusing the one escaped parameter. Change the placeholder in
`AdminUsersScreen.vue` to "Name, email, username or user ID", and add a case to
`backend/test/integration/adminUserRoutes.test.ts`.

---

## 6. The dead `requires_guardian_link` flag

After the demo.

**Why.** `users.requires_guardian_link` (migration `100`) is written but never
read. Redeeming a code sets it to `false`, the seed sets `true` for
`young_learner`, and nothing decides anything by it. The real rule is
`shared/learnerAccess.ts`: under 13 plus an active row in `parent_child_links`.
It is also wrong in practice. The seed links `young_learner` without clearing
it, so `/api/auth/me` reports `requiresGuardianLink: true` for a linked child,
and an admin unlinking a child never sets it back.

**How.** Either drop it, with a new migration (for example
`105_drop_requires_guardian_link.sql`, never an edit to `100`) plus the field in
`authType.ts` (`PublicUser`, `UserRow`, `toPublicUser`), `USER_COLUMNS` in
`parentLinkMethods.ts`, the `RETURNING`/`SELECT` lists in `accountMethods.ts`,
`seedDemo.ts`, `openapi.yaml` and the frontend `PublicUser` in `authStore.ts`.
Or compute it from `learnerAccess` when building `/me` and stop storing it.
Dropping it is simpler.

---

## 7. `GET /api/auth/roles` lists every role

After the demo; this is the one keeper from item 1 that isn't on main yet.

**Why.** It still returns all five roles, although only learner and guardian
can sign up. Nothing in the frontend calls it today, but it advertises staff
roles to anyone.

**How.** `AccountMethods.roles()` in `authRoutes/methods/accountMethods.ts`
returns `SELF_SERVICE_ROLES`. Update the `/api/auth/roles` description in
`openapi.yaml` and add a one-line assertion to `authRoutes.test.ts`.

---

## 8. Document your endpoints in openapi.yaml

After the demo, once item 2 has fixed the report's shape.

**Why.** `backend/openapi.yaml` (served at `/api/docs`) has no entry for
`GET /api/guardians/me/children/{childId}/report`, or for any `/api/admin/users…`
and `/api/admin/parent-links…` route. The old report endpoint and its schema
have been removed, and 429 responses were added to signup, login and redeem.

**How.** Add the paths with their status codes (400 bad id or language, 401,
403 not linked or wrong role, 404, 409 for the admin rules). Add a
`ChildProgressReport` schema that mirrors `types/childProgressReportType.ts` as
it stands after items 2 and 3.

---

## 9. Email registration: verification and password reset

After the demo, and only a decision for now.

**Why.** Guardians and staff register with an email that is never verified,
and nobody can reset a forgotten password. There is no mail sender in the stack.
Emails are already normalised to lower case and unique, so duplicates are
handled.

**How.** Decide with the group whether this is in scope at all. If it is, it
needs a mail provider, a token table and two screens, which is not something to
start before the 19th. For the demo the seeded accounts are enough, and an
administrator can deactivate a wrong account.

---

## Already done on `slice/identity` (nothing for you to do)

So you know what changed under you:

- **Rate limits** on `POST /api/auth/login` (10 failed attempts a minute per IP;
  successful sign-ins don't count), `POST /api/auth/signup` (10 per 15 minutes)
  and `POST /api/auth/parent-links/redeem` (10 refused codes a minute). Each
  answers 429 with a clear message and `Retry-After`. Limits are off under
  `NODE_ENV=test` and `RATE_LIMIT=off` disables them anywhere. Code:
  `shared/functions/rateLimit.ts`, `AUTH_RATE_LIMITS` in `authRoutes.ts`.
- **`trust proxy`** is now off by default instead of `true`, which let anyone
  fake their IP with `X-Forwarded-For` and dodge the limits. Behind a real
  proxy, set `TRUST_PROXY=1` (hop count) or `loopback`
  (`shared/functions/trustProxy.ts`).
- **Role changes** between learner and any other role are refused with 409, in
  both directions (learners have a username and no email, everyone else the
  reverse). The change-role dialog greys those options out and says why.
  `crossesLearnerBoundary` in `adminUserService.ts`, mirrored in
  `admin_users_feature/functions/roleRules.ts`.
- **Removed** `GET /api/auth/children/:childId/progress` (route, method, type,
  frontend endpoint, datasource, store action, openapi entry). The guardian
  report route replaces it. The old URL now returns 404.
- **No more bodies in logs.** `genericRouteCatch.ts` logs method, path and
  error; `EndpointType.ts`/`httpService.ts` log method, path and status. A
  wrong password no longer shows up in the server log or the browser console.
- **Restyled** to the design system: sign-in/sign-up, My children and the
  learner's link-code page (with a playful version for children), the admin
  Users table and its three dialogs, and the progress report. Loading, empty
  and error states throughout, with tests for each screen.
