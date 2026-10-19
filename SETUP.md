# Setup

From a blank machine to both apps running. Do the steps in order; each one has a
check so you know it worked before moving on.

## 1. Node.js 22 (runs the backend, builds the frontend)

We use Node 22 LTS. Check what you have:

```bash
node --version
```

If that prints `v22.x.x`, skip ahead. Otherwise install it:

**macOS**
```bash
brew install node@22 && brew link --overwrite node@22
```
(No Homebrew? Install it first from https://brew.sh, or download the macOS installer from https://nodejs.org.)

**Windows** — download the Windows installer (LTS) from https://nodejs.org and run it.
Tick "Automatically install the necessary tools" if it asks. Then open a **new**
terminal (PowerShell or Git Bash).

**Linux (Debian/Ubuntu)**
```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt-get install -y nodejs
```

`npm` comes with Node. Check both:

```bash
node --version && npm --version
```

## 2. Git

```bash
git --version
```

Missing? macOS: `xcode-select --install`. Windows: https://git-scm.com/download/win
(pick "Git Bash" during install — the commands in this repo assume a bash shell).
Linux: `sudo apt-get install -y git`.

## 3. Docker (runs the database)

The database is Postgres 16 inside a Docker container, so nobody installs Postgres itself.

- **macOS / Windows**: install Docker Desktop from https://www.docker.com/products/docker-desktop
  and start it (whale icon in the menu bar / tray). On Windows it will ask to enable WSL 2 — say yes.
- **Linux**: `sudo apt-get install -y docker.io docker-compose-v2` and add yourself to the
  docker group: `sudo usermod -aG docker $USER`, then log out and in.

Check:

```bash
docker --version && docker compose version
```

## 4. Get the code

```bash
git clone git@github.com:SUDO-V0RT3X/LingoLearn.git
cd LingoLearn
```

## 5. Backend: Express + Postgres

Everything the backend needs is listed in `backend/package.json`; `npm install` fetches it.

```bash
cd backend
npm install
cp .env.example .env
```

Open `.env` and set `AUTH_SECRET` to any long random string: the server won't sign anyone in without it. Leave `DATABASE_URL` pointing at the local Docker container.

Start the database, create the tables, and load the demo accounts and content:

```bash
docker compose up -d
npm run migrate
npm run seed:staff
npm run seed:demo
```

`npm run seed:demo` ends by printing the demo accounts. Running the seeds again is safe. Now run the API:

```bash
npm run dev
```

Check, in a second terminal:

```bash
curl localhost:4000/health
```

`{"ok":true}` means the API is up and talking to the database. The API documentation is at http://localhost:4000/api/docs.

## 6. Frontend: Vue 3

```bash
cd ../frontend
npm install
npm run dev
```

Open http://localhost:5173 and sign in with one of the demo accounts. Each role lands on its own home screen.

If the backend runs on a port other than 4000 (the `PORT` in `backend/.env`), tell the frontend in `frontend/.env.local`:

```
VITE_API_PORT=4001
```

## 7. Editor

VS Code, with the **Vue - Official** extension (`Vue.volar`). Open the `frontend/` folder (or the repo root) so the editor picks up the frontend's TypeScript settings.

Windows only: if `npm run dev` complains about scripts being disabled, run this once in
PowerShell as administrator: `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`.

## 8. Prove it all works

```bash
cd backend && npm test && npm run test:integration
```

```bash
cd frontend && npm run type-check && npx vitest run
```

Both green means you're set. To run one person's tests on both sides, use `./runTests.sh -<Name>` from the repo root (in Git Bash on Windows).

## If something breaks

| Symptom | Fix |
|---|---|
| `DATABASE_URL is not set` | `cp .env.example .env` inside `backend/` |
| Signing in fails with a server error | `AUTH_SECRET` is missing from `backend/.env` |
| `connect ECONNREFUSED 127.0.0.1:5433` | Docker isn't running, or `docker compose up -d` wasn't run in `backend/` |
| `port 5433 is already allocated` | Another container is on it: `docker ps`, stop it, or change the port in `docker-compose.yml` **and** `.env` |
| `relation "..." does not exist` | `npm run migrate` |
| `EADDRINUSE :4000` | Something else is on 4000: stop it, or set `PORT=4001` in `backend/.env` and `VITE_API_PORT=4001` in `frontend/.env.local` |
| `Cannot find module` after pulling | `npm install` again in that folder: someone added a dependency |
| `vue-tsc` errors in the editor but `npm run build` passes | The editor has the wrong folder open, or needs "Vue: Restart Vue and TS servers" |
| A completely fresh database | `docker compose down -v && docker compose up -d && npm run migrate && npm run seed:staff && npm run seed:demo` |
