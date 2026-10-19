#!/usr/bin/env bash
# Deploys the current checkout to the droplet by hand (GitLab CI can't run jobs
# for this project; see docs/ci-not-running.md). Needs SSH access to the droplet.
#   deploy/manual-deploy.sh            uses ~/.ssh/lingolearn_deploy
#   SSH_KEY=~/.ssh/other deploy/manual-deploy.sh
# The release step builds beside the live site and only switches when the build,
# unit tests and migrations pass, so a failed deploy leaves the site as it was.
set -euo pipefail

HOST="${DEPLOY_HOST:-root@159.65.118.0}"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/lingolearn_deploy}"
REPO="$(cd "$(dirname "$0")/.." && pwd)"
SSH=(ssh -i "$SSH_KEY" -o ConnectTimeout=15)

if [[ -n "$(git -C "$REPO" status --porcelain)" ]]; then
    echo "Note: deploying uncommitted changes in $REPO" >&2
fi

echo "== copying $(git -C "$REPO" rev-parse --short HEAD) to $HOST"
rsync -rlz --delete --omit-dir-times -e "ssh -i $SSH_KEY" \
      --exclude node_modules --exclude .git --exclude docs --exclude .DS_Store \
      --exclude backend/.env --exclude backend/uploads --exclude backend/dist --exclude frontend/dist \
      "$REPO/" "$HOST:/srv/lingolearn/source/"

echo "== building and releasing on the droplet"
"${SSH[@]}" "$HOST" 'chown -R gitlab-runner:lingolearn /srv/lingolearn/source \
    && chmod -R g+rwX /srv/lingolearn/source \
    && cd /srv/lingolearn && sudo -u lingolearn -H /srv/lingolearn/bin/release'

echo "== live at https://159-65-118-0.sslip.io"
