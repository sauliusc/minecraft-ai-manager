# deploymentV2 — Deployment Guide

Deploy the entire CraftControl stack with two commands:

```bash
make setup    # run once — generates .env and prints your Claude MCP config
make deploy   # run every time you want to deploy or update
```

---

## What gets deployed

| Container | What it runs | Port |
|-----------|--------------|------|
| `db` | PostgreSQL 16 | internal |
| `redis` | Redis 7 | internal |
| `api` | Node.js API + Prisma | internal |
| `web` | Nginx + React SPA | **80** |
| `mcp` | Claude MCP server (52 tools) | **3100** |

Only ports 80 (web panel) and 3100 (MCP) are exposed. The `web` container proxies all `/api/` requests to `api` internally.

---

## Prerequisites

Install on the server (Ubuntu 22.04 / 24.04 recommended):

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER   # re-login after this
docker compose version          # verify
```

No Node.js, PostgreSQL, or Redis needed on the host.

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

The wizard asks for:
- Game server IP / hostname
- Web panel port (default 80)
- **Admin email and password** — used to log into the web panel and by the MCP server
- RCON port and password — for live server console access
- MCP auth token — bearer token Claude must send to the MCP server

All other secrets (database, Redis, JWT, bridge) are generated automatically.

At the end it prints:
- The `BRIDGE_SECRET` to copy into DiscoPanel
- A **ready-to-paste Claude config snippet** for the MCP server

### 3. Configure the Minecraft game server

In DiscoPanel → **Startup → Environment Variables**, add:

```
BRIDGE_SECRET=<the value shown at the end of make setup>
```

### 4. Deploy

```bash
make deploy
```

This will:
1. Build Docker images from source (including the MCP server)
2. Start all containers
3. Wait for the database to be ready
4. Run database migrations automatically
5. Check the API health endpoint
6. Print the panel URL

The admin account is created automatically from `ADMIN_EMAIL` / `ADMIN_PASSWORD` on first start — no separate seed step needed.

### 5. Connect Claude (optional)

Paste the config snippet from `make setup` into Claude Desktop or Claude Code config. You now have 52 tools to control your server. See [`mcp/README.md`](../mcp/README.md).

---

## Day-to-day commands

```bash
make status       # Are all containers running?
make logs         # Tail all logs (Ctrl+C to stop)
make logs-api     # API logs only
make logs-mcp     # MCP server logs
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

Restarts all containers (including `mcp`) with the previous Docker images in under 30 seconds.

> **Note:** Database migrations are not reversed. If you need to restore data, use `make restore` after rollback.

---

## Database backup & restore

### Manual backup

```bash
make backup
# Creates: deploymentV2/backups/craftcontrol_YYYYMMDD_HHMMSS.sql.gz
```

### Automatic daily backups (recommended)

```cron
0 3 * * * cd /opt/craftcontrol/deploymentV2 && make backup >> /var/log/craftcontrol-backup.log 2>&1
```

### Restore from backup

```bash
make restore                                              # interactive prompt
make restore BACKUP=backups/craftcontrol_20240801_030000.sql.gz
```

---

## Minecraft plugins

Plugins run inside the Minecraft server managed by DiscoPanel and communicate with the web API over the network.

### Build and deploy plugins manually

```bash
make build-plugins    # compiles all plugins with Maven
make deploy-plugins   # uploads JARs to the game server via SCP
```

### Automatic plugin deployment (CI/CD)

The GitHub Actions workflow automatically deploys plugins whenever files in `plugins/` change on `main`. See the **CI/CD** section below.

---

## CI/CD (GitHub Actions)

The workflow at `.github/workflows/deploy-v2.yml` runs on every push to `main`:

1. **Tests** — full test suite against real PostgreSQL + Redis (GitHub-hosted runner)
2. **Deploy** — runs `git pull` + `deploy.sh` directly on the **self-hosted CT102 runner** (no SSH needed — the runner is the server)
3. **Validate** — checks Minecraft startup logs for errors on the same runner
4. **Deploy plugins** — builds and uploads plugin JARs if `plugins/` changed (self-hosted runner, reaches game VM over local network)

### Self-hosted runner setup

The runner must be registered on the CT102 container with label `ct102`. To register:

1. Go to **Settings → Actions → Runners → New self-hosted runner**
2. Follow the instructions, passing `--labels ct102` to `config.sh`
3. Install as a service: `sudo ./svc.sh install && sudo ./svc.sh start`

The runner connects outbound to GitHub — no inbound ports needed.

### GitHub Secrets required (plugin deployment only)

These are only needed if you use the automatic plugin deploy (`deploy-plugins` job):

| Secret | Value |
|--------|-------|
| `GAME_VM_HOST` | IP address of your Minecraft server |
| `GAME_VM_SSH_USER` | SSH username on the game server |
| `GAME_VM_SSH_KEY` | Private SSH key for the game server |
| `DISCOPANEL_API_TOKEN` | DiscoPanel API token (for restart-on-deploy) |
| `DISCOPANEL_SERVER_ID` | DiscoPanel server UUID |

> No `MGMT_VM_*` secrets are needed — the deploy runs locally on the self-hosted runner.

---

## HTTPS / SSL (optional)

The default setup runs on HTTP port 80.

### Option A — Cloudflare (easiest)

1. Point your domain's DNS to the server IP in Cloudflare.
2. Enable **Proxied** (orange cloud).
3. Cloudflare handles TLS — no server changes needed.

### Option B — Let's Encrypt (self-managed)

```bash
sudo apt install certbot
sudo certbot certonly --standalone -d panel.yourdomain.com
```

Then update `deploymentV2/nginx/default.conf` to add the HTTPS server block, mount the certs as a volume in `docker-compose.yml`, and set `HTTP_PORT=443` in `.env`.

---

## Troubleshooting

### Containers won't start
```bash
make logs      # read the error
make status    # see which container is unhealthy
```

### API health check keeps failing
```bash
make logs-api
make shell-api
wget -qO- http://localhost:3000/api/health
```

### MCP server not responding
```bash
make logs-mcp
wget -qO- http://localhost:3100/health
```

### Forgot admin password
```bash
# Update directly in the running container
docker compose exec api node -e "
  const {PrismaClient} = require('@prisma/client');
  const bcrypt = require('bcryptjs');
  const prisma = new PrismaClient();
  bcrypt.hash('newpassword',12).then(h =>
    prisma.user.update({where:{email:'admin@example.com'},data:{passwordHash:h}})
  ).then(() => { console.log('done'); prisma.\$disconnect(); });
"
```

### Forgot BRIDGE_SECRET
```bash
grep BRIDGE_SECRET deploymentV2/.env
```

---

## Directory layout

```
deploymentV2/
├── docker-compose.yml     # All five services (db, redis, api, web, mcp)
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
