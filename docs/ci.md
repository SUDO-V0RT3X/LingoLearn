# Continuous integration

**GitLab CI is disabled for this project**: the host runner environment restricts pipeline jobs. See [ci-not-running.md](ci-not-running.md). `.gitlab-ci.yml` is kept switched off (`when: never`).

Run the checks yourself before pushing, either with `./runTests.sh` or with the full replica below, which matches what a pipeline would do on an empty database. **Checked on 18 October 2026:** backend 332 unit and 259 integration tests pass; frontend type check, 967 tests and build pass.

## Running the same checks locally

These are the pipeline's steps against a throwaway database. It needs Docker running with the `lingolearn_db` container (`docker compose up -d` in `backend/`). On Windows, run it in Git Bash.

```bash
docker exec lingolearn_db createdb -U postgres lingolearn_ci
export DATABASE_URL=postgres://postgres:postgres@localhost:5433/lingolearn_ci
export AUTH_SECRET=local-ci-check

cd backend
npm ci && npx tsc --noEmit && npm run migrate && npm test && npm run test:integration

cd ../frontend
npm ci && npm run type-check && npx vitest run && npm run build-only

cd .. && docker exec lingolearn_db dropdb -U postgres lingolearn_ci
```

`npm ci` reinstalls packages exactly as the lockfile says, just as CI does. Afterwards your own `npm run dev` still works.

## When a pipeline is red

Open the failed job's log in GitLab. Then run the replica above on the same commit: it fails the same way, and that is the quickest way to debug it. Don't merge into `main` while its pipeline is red.
