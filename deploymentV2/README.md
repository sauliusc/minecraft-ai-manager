# deploymentV2 — One-Click Deployment

Deploy the entire Minecraft AI Manager stack with two commands.
No Proxmox, no VM networking, no manual service wiring — just Docker.

```
make setup    ← run once (generates .env)
make deploy   ← run every time you want to deploy
```

---

## What gets deployed

| Container | What it runs            | Port       |
|-----------|-------------------------|------------|
| `db`      | PostgreSQL 16           | internal   |
| `redis`   | Redis 7                 | internal   |
| `api`     | Node.js API             | internal   |
| `web`     | Nginx + React SPA       | **80**     |

The `web` container serves the React dashboard and proxies all `/api/` requests
to the `api` container. Only port 80 is exposed to the internet.

---

## Prerequisites

Install these on the server (Ubuntu 22.04 / 24.04 recommended):

```bash
# Docker Engine
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER   # re-login after this

# Docker Compose plugin (included with modern Docker, verify:)
docker compose version
```

That's it. No Node.js, no PostgreSQL, no Redis needed on the host.

---

## First-time setup

### 1. Clone the repository

```bash
git clone <your-repo-url> /opt/craftcontrol
cd /opt/craftcontrol/deploymentV2
```

### 2. Run the setup wizard

```bash
make setup
```

The wizard will:
- Check Docker is installed
- Ask for your game server IP
- Generate all passwords and secrets automatically
- Write a `.env` file (permissions: 600, never committed to git)

At the end you will see a `BRIDGE_SECRET` value. **Copy it** — you need it in Step 3.

### 3. Configure the Minecraft game server

In DiscoPanel (on your game server), go to:

**Startup → Environment Variables** and add:

```
BRIDGE_SECRET=<the value shown at the end of make setup>
```

This allows the Minecraft plugins to authenticate with the web API.

### 4. Deploy

```bash
make deploy
```

This will:
1. Build Docker images from source
2. Start all containers
3. Wait for the database to be ready
4. Run database migrations automatically
5. Check the API health endpoint
6. Print the URL of your panel

### 5. Create your admin account

```bash
make seed-admin
```

Enter an email address and password when prompted.
Then open the panel URL and log in.

---

## Day-to-day commands

```bash
make status       # Are all containers running?
make logs         # Tail all logs (Ctrl+C to stop)
make logs-api     # API logs only
make deploy       # Deploy a new version (safe to run anytime)
make update       # git pull + deploy in one step
make rollback     # Revert to the previous version
make backup       # Dump the database to deploymentV2/backups/
make restart      # Restart containers without rebuilding
make stop         # Stop everything (data preserved)
```

---

## Updating the application

```bash
# Option A — pull + deploy in one step
make update

# Option B — do it manually
git pull
make deploy
```

`make deploy` is safe to run on a live server. It:
- Builds new images in the background
- Tags the current images as `previous` (used by `make rollback`)
- Starts new containers
- Runs migrations
- Rolls back automatically if the health check fails

---

## Rollback

If a deployment breaks something:

```bash
make rollback
```

This restarts the containers with the previous Docker images in under 30 seconds.

> **Note:** Database migrations are not reversed. If you need to restore data,
> use `make restore` after rollback.

---

## Database backup & restore

### Manual backup

```bash
make backup
# Creates: deploymentV2/backups/craftcontrol_YYYYMMDD_HHMMSS.sql.gz
```

### Automatic daily backups (recommended)

Add this to your crontab (`crontab -e`):

```cron
0 3 * * * cd /opt/craftcontrol/deploymentV2 && make backup >> /var/log/craftcontrol-backup.log 2>&1
```

### Restore from backup

```bash
# Restore the most recent backup (interactive prompt)
make restore

# Restore a specific file
make restore BACKUP=backups/craftcontrol_20240801_030000.sql.gz
```

---

## Minecraft plugins

Plugins are not Docker containers — they run inside the Minecraft server managed
by DiscoPanel. They communicate with the web API over the internal network.

### Build and deploy plugins manually

```bash
make build-plugins    # compiles all 13 plugins with Maven
make deploy-plugins   # uploads JARs to the game server via SCP
```

### Automatic plugin deployment (CI/CD)

The `deploy-v2.yml` GitHub Actions workflow automatically deploys plugins
whenever files in `plugins/` change on `main`. See the **CI/CD** section below.

---

## CI/CD (GitHub Actions)

The workflow at `.github/workflows/deploy-v2.yml` runs on every push to `main`:

1. Runs the full test suite (with a real PostgreSQL + Redis)
2. SSHs into your server and runs `make deploy`
3. Builds and uploads plugin JARs if `plugins/` changed

### Required GitHub Secrets

Go to **Settings → Secrets and variables → Actions** and add:

| Secret                  | Value                                              |
|-------------------------|----------------------------------------------------|
| `MGMT_VM_HOST`          | IP address of your management server               |
| `MGMT_VM_SSH_USER`      | SSH username (e.g. `ubuntu`)                       |
| `MGMT_VM_SSH_KEY`       | Private SSH key (contents of `~/.ssh/id_ed25519`)  |
| `MGMT_VM_SSH_PORT`      | SSH port (default `22`)                            |
| `GAME_VM_HOST`          | IP address of your Minecraft server                |
| `GAME_VM_SSH_USER`      | SSH username on the game server                    |
| `GAME_VM_SSH_KEY`       | Private SSH key for the game server                |
| `DISCOPANEL_API_TOKEN`  | DiscoPanel API token (for restart-on-deploy)       |
| `DISCOPANEL_SERVER_ID`  | DiscoPanel server UUID                             |

### Generate an SSH key pair for CI

```bash
ssh-keygen -t ed25519 -C "github-actions" -f ~/.ssh/github_deploy -N ""
cat ~/.ssh/github_deploy.pub >> ~/.ssh/authorized_keys   # on the server
cat ~/.ssh/github_deploy                                 # paste into GitHub secret
```

---

## HTTPS / SSL (optional)

The default setup runs on HTTP port 80. To add HTTPS:

### Option A — Cloudflare (easiest, recommended)

1. Point your domain's DNS to the server IP in Cloudflare.
2. Enable **Proxied** (orange cloud).
3. Cloudflare handles TLS automatically — no server changes needed.

### Option B — Let's Encrypt (self-managed)

Install Certbot on the host and create a certificate:

```bash
sudo apt install certbot
sudo certbot certonly --standalone -d panel.yourdomain.com
```

Then update `deploymentV2/nginx/default.conf` to add the HTTPS server block,
mount the certs as a volume in `docker-compose.yml`, and change `HTTP_PORT=443`
in your `.env`.

---

## Troubleshooting

### Containers won't start

```bash
make logs       # read the error
make status     # see which container is unhealthy
```

### API health check keeps failing

```bash
make logs-api   # look for startup errors or DB connection issues
make shell-api  # get a shell and test manually
wget -qO- http://localhost:3000/api/health
```

### Database migration fails

```bash
make shell-db   # open psql
\dt             # list tables
\q              # exit
```

### Port 80 already in use

Edit `.env` and change `HTTP_PORT=8080`, then `make deploy`.

### Forgot BRIDGE_SECRET

```bash
grep BRIDGE_SECRET deploymentV2/.env
```

Copy that value to DiscoPanel → Environment Variables.

---

## Directory layout

```
deploymentV2/
├── docker-compose.yml     # All four services defined here
├── .env.example           # Template — copy to .env and fill in
├── .env                   # Your config (gitignored, auto-generated by make setup)
├── Makefile               # All commands (make help for full list)
├── nginx/
│   └── default.conf       # Nginx config: SPA serving + /api proxy
├── scripts/
│   ├── setup.sh           # Interactive wizard → writes .env
│   ├── deploy.sh          # Full deploy: build → migrate → health check
│   ├── rollback.sh        # Revert to previous Docker images
│   ├── backup.sh          # pg_dump → backups/*.sql.gz
│   └── restore.sh         # Restore from a backup file
└── backups/               # Database backups (gitignored)
```

---

## Differences from deploymentV1

| Topic                  | deploymentV1                     | deploymentV2                     |
|------------------------|----------------------------------|----------------------------------|
| Infrastructure         | Proxmox VMs, manual networking   | Any Linux server with Docker     |
| Setup time             | 1–2 hours                        | ~10 minutes                      |
| Entry point            | 10+ manual steps                 | `make setup && make deploy`      |
| Updates                | SSH + multiple commands          | `make update`                    |
| Rollback               | Manual / snapshot                | `make rollback` (seconds)        |
| Database backup        | Cron + pg_dump script            | `make backup`                    |
| SSL                    | Certbot on host                  | Cloudflare or Certbot (optional) |
| CI/CD                  | 4 separate workflows             | 1 workflow, SSH + make deploy    |
| Plugin deploy          | DiscoPanel SFTP                  | `make deploy-plugins` or CI/CD   |
