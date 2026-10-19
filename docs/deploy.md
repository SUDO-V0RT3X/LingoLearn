# Deployment

The live site is **https://159-65-118-0.sslip.io**, on a DigitalOcean droplet in Frankfurt (Ubuntu 24.04).

## How a change goes live

GitLab CI can't run jobs for this project ([ci-not-running.md](ci-not-running.md)), so deploys are by hand:

1. Get the checkout you want live (normally an up-to-date `main`) and run the tests.
2. Run `deploy/manual-deploy.sh` from a machine with the droplet's SSH key.
3. It copies the checkout to `/srv/lingolearn/source` and runs [`deploy/release.sh`](../deploy/release.sh) as the `lingolearn` user, which builds a new release next to the live one and switches only if everything passes:
   - backend: install, build, unit tests;
   - frontend: install, build;
   - database: new migrations;
   - switch the `current` link, `pm2 reload`, check `/health`.

   If any step fails, the previous release keeps serving. The three newest releases are kept.

The GitLab runner installed on the droplet is unused and can stay.

## On the droplet

| What | Where |
|---|---|
| Releases | `/srv/lingolearn/releases/<time>-<commit>`; the live one is `/srv/lingolearn/current` |
| Settings (database URL, `AUTH_SECRET`) | `/srv/lingolearn/shared/.env`, only on the server |
| Uploaded audio and images | `/srv/lingolearn/shared/uploads`, kept across releases |
| API process | PM2 as user `lingolearn`, app `lingolearn-api`, port 4000, started on boot |
| Web server | nginx: `/etc/nginx/sites-available/lingolearn` (from [`deploy/nginx.conf`](../deploy/nginx.conf)), HTTPS by certbot, renewed automatically |
| Database | PostgreSQL 16, database and user `lingolearn`, listening on the droplet only |
| Firewall | ufw: SSH, 80 and 443 only |

Useful commands, run as root:

```bash
sudo -u lingolearn pm2 logs lingolearn-api --lines 100
sudo -u lingolearn pm2 status
ls -l /srv/lingolearn/current
```

To roll back by hand, point `current` at an earlier release and reload:

```bash
sudo -u lingolearn ln -sfn /srv/lingolearn/releases/<earlier> /srv/lingolearn/current && sudo -u lingolearn pm2 reload lingolearn-api
```

Migrations only move forward, so roll back only to a release whose code works with the current database.

## Demo data

The seeds are run by hand, once, from the live release:

```bash
cd /srv/lingolearn/current/backend && sudo -u lingolearn npx tsx scripts/seedStaff.ts && sudo -u lingolearn npx tsx scripts/seedDemo.ts
```

Running them again is safe.
