#!/usr/bin/env bash
# Builds one release of LingoLearn from a checked-out copy of the repo and makes
# it live. Runs on the server as the lingolearn user:
#   deploy/release.sh <path to the checked-out repo>
# The live site keeps running until every step before the switch has passed, so a
# failed build or failed unit test leaves the previous release serving.
set -euo pipefail

SOURCE="$(cd "${1:?usage: release.sh <checked-out repo>}" && pwd)"
APP=/srv/lingolearn
SHARED="$APP/shared"
STAMP="$(date -u +%Y%m%d-%H%M%S)"
COMMIT="$(git -C "$SOURCE" rev-parse --short HEAD 2>/dev/null || echo manual)"
RELEASE="$APP/releases/$STAMP-$COMMIT"
PREVIOUS="$(readlink -f "$APP/current" 2>/dev/null || true)"
# A 512 MB droplet builds on swap; give Node room to use it.
export NODE_OPTIONS="--max-old-space-size=1024"
# PM2 spawns its daemon in the working directory, which must be one this user can enter.
cd "$APP"

log() { echo "[release $(date -u +%H:%M:%S)] $*"; }

log "copying $COMMIT into $RELEASE"
mkdir -p "$RELEASE"
rsync -a --delete --exclude .git --exclude node_modules --exclude 'backend/.env' \
      --exclude 'backend/uploads' --exclude 'backend/dist' --exclude 'frontend/dist' \
      "$SOURCE/" "$RELEASE/"

# Reuses the previous release's packages when the lockfile hasn't changed: hard
# links cost no space and save several minutes on a small droplet.
install_packages() {
    local dir="$1"
    if [[ -n "$PREVIOUS" && -d "$PREVIOUS/$dir/node_modules" ]] \
       && cmp -s "$PREVIOUS/$dir/package-lock.json" "$RELEASE/$dir/package-lock.json"; then
        log "$dir: lockfile unchanged, reusing packages"
        cp -al "$PREVIOUS/$dir/node_modules" "$RELEASE/$dir/node_modules"
    else
        log "$dir: npm ci"
        (cd "$RELEASE/$dir" && npm ci --no-audit --no-fund --loglevel=error)
    fi
}

log "backend: install, build, unit tests"
install_packages backend
ln -sfn "$SHARED/.env" "$RELEASE/backend/.env"
(cd "$RELEASE/backend" && npm run build --silent && npm test --silent)
# The built server and the tsx seed scripts look for uploads in different places.
ln -sfn "$SHARED/uploads" "$RELEASE/backend/uploads"
ln -sfn "$SHARED/uploads" "$RELEASE/backend/dist/uploads"

log "frontend: install, build"
install_packages frontend
(cd "$RELEASE/frontend" && npx vite build --logLevel warn)

log "database: migrations"
(cd "$RELEASE/backend" && node dist/scripts/migrate.js)

log "switching the live site to $STAMP-$COMMIT"
ln -sfn "$RELEASE" "$APP/current.next" && mv -T "$APP/current.next" "$APP/current"
if pm2 describe lingolearn-api >/dev/null 2>&1; then
    pm2 reload "$APP/current/deploy/ecosystem.config.cjs" --update-env
else
    pm2 start "$APP/current/deploy/ecosystem.config.cjs"
fi
pm2 save >/dev/null

log "checking the API answers"
for attempt in 1 2 3 4 5 6 7 8 9 10; do
    if curl -fsS http://127.0.0.1:4000/health >/dev/null 2>&1; then
        log "API is up"; break
    fi
    [[ $attempt == 10 ]] && { log "API did not come up"; exit 1; }
    sleep 2
done

log "keeping the three newest releases"
ls -1dt "$APP"/releases/*/ | tail -n +4 | xargs -r rm -rf
log "done: $COMMIT is live"
