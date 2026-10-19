# Scope: A. Identity and Access

**LingoLearn.** Owner: TS. 13 October 2026.

Every account-level function: creating and authenticating users, enforcing what each role may do, and linking a guardian to the children they look after.

## What the client asked for, and what is delivered

| Requirement | Status | What the client gets |
|---|---|---|
| User model and roles | Delivered | Users with the roles learner, guardian, author, moderator and administrator; passwords stored as salted scrypt hashes. |
| Sign up, sign in, sign out | Delivered | Session tokens are signed and stored server-side, so signing out revokes the session on the server, not only in the browser. |
| Role guard | Delivered | Express middleware rejects requests from the wrong role at the API; the frontend router hides screens a role may not open. |
| Parent link codes | Delivered | A child generates a short-lived code; a guardian redeems it. Wrong, already-used and expired codes are told apart. Redeeming is rate-limited. |
| Guardian: list of linked children | Delivered | "My children" lists linked children with a link to each one's progress. |
| Guardian: read-only child progress report | In progress | The report screen and route are built. Wiring every figure to the learner's real level, tests and challenges is being completed. |
| Administrator user management | Delivered | Search and filter users, change roles, manage parent links and deactivate accounts. Every change is written to an audit log. |
| Security hardening | Delivered | Login, sign-up and code redemption are rate-limited; request bodies, which may hold passwords, are never logged. |

## Changes agreed by the group

- A learner cannot be changed into a staff role, or the reverse, because their sign-in identity differs (username vs email). The administrator sees why.

## How it connects

- **Provides:** Sessions and the signed-in user for every other subsystem; the role guard; the parent-child link that Onboarding uses to allow under-13 learners in.
- **Uses:** Onboarding (a child's date of birth and access), Learner Experience and Progression (data for the child report).

## Seeing it in the demo

1. Sign in as the administrator: Users, search, change a role, see the audit log entry.
2. Sign in as the guardian: My children, then View progress for the linked child.
3. Sign out from the menu at the top right.

Demo accounts come from `npm run seed:staff` and `npm run seed:demo`; the demo seed prints them. All share one demo password.
