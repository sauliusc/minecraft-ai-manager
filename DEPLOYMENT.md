# CraftControl — Deployment Guide

**Environment:** Proxmox VE (bare metal) — single LXC container + Docker Compose  
**Last Updated:** 2026-05-23  
**Status:** Production

---

## Quick Start

```bash
# 1. Clone the repo into the container
git clone https://github.com/sauliusc/minecraft-ai-manager.git /opt/craftcontrol
cd /opt/craftcontrol/deploymentV2

# 2. Interactive setup wizard — generates .env with all secrets
make setup

# 3. Build images and start everything
make deploy
```

The web panel will be at **http://\<container-ip\>** and the Minecraft server on **:25565**.  
See [`deploymentV2/README.md`](deploymentV2/README.md) for day-to-day commands.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Proxmox Host Setup](#2-proxmox-host-setup)
3. [CT102 — LXC Container Setup](#3-ct102--lxc-container-setup)
4. [Networking & Firewall](#4-networking--firewall)
5. [SSL/TLS Configuration](#5-ssltls-configuration)
6. [CI/CD Pipeline](#6-cicd-pipeline)
7. [Backup Strategy](#7-backup-strategy)
8. [Monitoring & Alerting](#8-monitoring--alerting)
9. [Secrets Management](#9-secrets-management)
10. [Runbooks](#10-runbooks)

---

## 1. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                      PROXMOX VE HOST                            │
│                    (bare metal, Ubuntu)                         │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  CT102 — LXC Container (Docker Compose)                  │  │
│  │  4–8 vCPU  /  12–16 GB RAM  /  80 GB disk                │  │
│  │                                                          │  │
│  │  ┌────────┐ ┌────────┐ ┌─────────────┐ ┌────────────┐  │  │
│  │  │ db     │ │ redis  │ │ api         │ │ web        │  │  │
│  │  │ :5432  │ │ :6379  │ │ :3000       │ │ Nginx :80  │  │  │
│  │  │(intern)│ │(intern)│ │ (internal)  │ │ (public)   │  │  │
│  │  └────────┘ └────────┘ └─────────────┘ └────────────┘  │  │
│  │                                                          │  │
│  │  ┌──────────────────────┐  ┌──────────────────────────┐ │  │
│  │  │ minecraft            │  │ mcp                      │ │  │
│  │  │ Paper 1.21.x         │  │ Claude MCP server        │ │  │
│  │  │ :25565 (public)      │  │ :3100 (public)           │ │  │
│  │  │ BridgePlugin: :25580 │  │                          │ │  │
│  │  │ RCON: :25575         │  └──────────────────────────┘ │  │
│  │  │ (all internal)       │                               │  │
│  │  └──────────────────────┘                               │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              │
                         Public Internet
          Minecraft :25565  |  Web panel :80  |  MCP :3100
```

All six services share a single Docker Compose network. The Minecraft server communicates with the API container by name (`http://api:3000`) — no external network hops.

---

## 2. Proxmox Host Setup

### 2.1 Minimum Host Requirements

| Resource | Minimum | Recommended |
|---|---|---|
| CPU | 4 cores (physical) | 8+ cores |
| RAM | 16 GB | 32 GB |
| Storage | 120 GB SSD | 250 GB NVMe |
| OS | Proxmox VE 8.x | Proxmox VE 8.x (latest) |

### 2.2 One-Click LXC Deployment (Proxmox shell)

```bash
bash proxmox/deploy.sh
```

This creates CT102 (Ubuntu 22.04), installs Docker, clones the repo, and prints next steps.  
See [`proxmox/README.md`](proxmox/README.md) for options (custom CTID, RAM, disk).

### 2.3 Manual LXC Creation

If you prefer manual setup, create an LXC container with these settings:

| Setting | Value |
|---|---|
| Container ID | 102 |
| OS Template | Ubuntu 22.04 LTS |
| vCPU | 4–8 |
| RAM | 12–16 GB |
| Disk | 80 GB (local-lvm) |
| Network | Bridge `vmbr0`, static or DHCP |
| Features | `keyctl=1,nesting=1` (required for Docker) |

After creation, run `proxmox/deploy.sh` inside the container or follow §3 manually.

---

## 3. CT102 — LXC Container Setup

### 3.1 Install Docker

```bash
curl -fsSL https://get.docker.com | sh
# If not root, add user to docker group:
# usermod -aG docker $USER && newgrp docker
docker compose version   # verify
```

### 3.2 Clone repository

```bash
git clone https://github.com/sauliusc/minecraft-ai-manager.git /opt/craftcontrol
cd /opt/craftcontrol/deploymentV2
```

### 3.3 Configure

```bash
make setup    # interactive wizard — generates deploymentV2/.env
```

The wizard asks for:
- Web panel port (default 80)
- Admin email + password
- RCON port + password (or auto-generates)
- MCP auth token (or auto-generates)

All other secrets (database, Redis, JWT, bridge) are generated automatically.

### 3.4 Deploy

```bash
make deploy   # builds images, runs migrations, starts all 6 containers
```

### 3.5 Register the GitHub Actions self-hosted runner

```bash
# Run on CT102 — follow GitHub's instructions at:
# Settings → Actions → Runners → New self-hosted runner
# Pass --labels ct102 to config.sh, then:
./svc.sh install
./svc.sh start
```

The runner connects outbound to GitHub — no inbound ports needed.

---

## 4. Networking & Firewall

### 4.1 Exposed Ports

| Port | Purpose | Accessible From |
|---|---|---|
| 80 (or `HTTP_PORT`) | Web panel (Nginx) | Public internet |
| 25565 | Minecraft Java Edition | Public internet |
| 3100 (or `MCP_PORT`) | MCP server (Claude tools) | Admin only (firewall recommended) |

### 4.2 Internal-Only Ports (never expose externally)

| Port | Purpose |
|---|---|
| 3000 | Node.js API |
| 5432 | PostgreSQL |
| 6379 | Redis |
| 25575 | Minecraft RCON |
| 25580 | BridgePlugin HTTP |

### 4.3 UFW Rules (recommended)

```bash
ufw default deny incoming
ufw default allow outgoing

ufw allow 22/tcp    # SSH (restrict to known admin IPs in production)
ufw allow 80/tcp    # Web panel
ufw allow 25565/tcp # Minecraft
ufw allow 3100/tcp  # MCP server (optional — restrict to your IP)

ufw enable
```

---

## 5. SSL/TLS Configuration

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

Update `deploymentV2/nginx/default.conf` to add the HTTPS server block, mount the certs in `docker-compose.yml`, and set `HTTP_PORT=443` in `.env`.

---

## 6. CI/CD Pipeline

### 6.1 Workflow overview

`.github/workflows/deploy-v2.yml` runs on every push to `main`:

| Job | Runner | Trigger | What it does |
|-----|--------|---------|--------------|
| `test` | GitHub-hosted (ubuntu-latest) | always | Full test suite against real PostgreSQL + Redis |
| `deploy` | Self-hosted (ct102) | after `test` | `git pull` + `deploy.sh` — runs directly on the server |
| `validate` | Self-hosted (ct102) | after `deploy` | Captures Minecraft startup logs, fails on `[ERROR]`/`[FATAL]` |
| `deploy-plugins` | Self-hosted (ct102) | after `test` + `deploy`, `plugins/` changed | Builds JARs → rebuilds minecraft image → restarts container |

### 6.2 Required GitHub Secrets

**None.** All jobs run on the CT102 self-hosted runner using local Docker. No SSH keys or external service tokens are needed.

---

## 7. Backup Strategy

### 7.1 Database backups (PostgreSQL)

```bash
make backup
# Creates: deploymentV2/backups/craftcontrol_YYYYMMDD_HHMMSS.sql.gz
```

Automate with cron on CT102:

```cron
0 3 * * * cd /opt/craftcontrol/deploymentV2 && make backup >> /var/log/craftcontrol-backup.log 2>&1
```

Retain 14 days:

```bash
find /opt/craftcontrol/deploymentV2/backups/ -name '*.sql.gz' -mtime +14 -delete
```

Restore:

```bash
make restore
# Or: make restore BACKUP=backups/craftcontrol_20260101_030000.sql.gz
```

### 7.2 Minecraft world backups

The `minecraft_data` Docker volume contains the world. Back it up with:

```bash
docker run --rm \
  -v craftcontrol_minecraft_data:/data:ro \
  -v /opt/craftcontrol/backups/worlds:/backup \
  alpine \
  tar czf /backup/world_$(date +%Y%m%d).tar.gz -C /data world
```

Add to cron for daily backups.

### 7.3 Proxmox Container Snapshots

Take a Proxmox snapshot of CT102 **before every major deployment**:

```bash
# On Proxmox host
pct snapshot 102 pre-deploy-$(date +%Y%m%d)
```

Weekly automated snapshot:

```bash
# /etc/cron.weekly/craftcontrol-snapshot
vzdump 102 --compress zstd --storage local --mode snapshot
```

### 7.4 Recovery Time Objectives

| Scenario | Recovery Method | Target RTO |
|---|---|---|
| Minecraft plugin crash | Docker container auto-restart | < 2 min |
| Minecraft data corruption | Restore world backup | < 30 min |
| API crash | Docker container auto-restart | < 1 min |
| Full container failure | `make deploy` on fresh CT102 | < 15 min |
| CT102 disk failure | Restore Proxmox snapshot | < 30 min |

---

## 8. Monitoring & Alerting

### 8.1 Container health

```bash
make status       # docker compose ps
make logs         # tail all logs
make logs-api     # api container only
make logs-minecraft  # minecraft container only
```

### 8.2 API health endpoint

```bash
curl http://localhost/api/health
# {"status":"ok","db":"connected","redis":"connected"}
```

### 8.3 Uptime monitoring

Point an external uptime monitor (UptimeRobot, Betterstack, etc.) at:
- `http://<server-ip>/api/health` — API health
- `<server-ip>:25565` — Minecraft port (TCP check)

---

## 9. Secrets Management

All secrets live in `deploymentV2/.env` (generated by `make setup`, gitignored, chmod 600):

| Secret | Description |
|---|---|
| `POSTGRES_PASSWORD` | PostgreSQL password (auto-generated) |
| `REDIS_PASSWORD` | Redis password (auto-generated) |
| `JWT_SECRET` | JWT signing key (auto-generated) |
| `JWT_REFRESH_SECRET` | JWT refresh signing key (auto-generated) |
| `BRIDGE_SECRET` | Shared secret between API and BridgePlugin (auto-generated) |
| `RCON_PASSWORD` | Minecraft RCON password (auto-generated or entered) |
| `ADMIN_EMAIL` | First SUPER_ADMIN account email |
| `ADMIN_PASSWORD` | First SUPER_ADMIN account password |
| `MCP_AUTH_TOKEN` | Bearer token for MCP server (auto-generated or entered) |

**Rules:**
- Never commit `.env` to git (it is in `.gitignore`)
- Back up `.env` securely (password manager or encrypted offsite copy)
- Rotate secrets by editing `.env` and running `make deploy`

---

## 10. Runbooks

### Restart a specific service

```bash
docker compose -f /opt/craftcontrol/deploymentV2/docker-compose.yml restart minecraft
# Or via make:
make restart
```

### Rollback after a bad deploy

```bash
cd /opt/craftcontrol/deploymentV2
make rollback
```

Rolls back `api`, `web`, `mcp`, and `minecraft` images to the previous tagged version in under 30 seconds. Database migrations are **not** reversed — if the migration was destructive, restore from a backup.

### Reset admin password

```bash
cd /opt/craftcontrol/deploymentV2
docker compose exec api node -e "
  const {PrismaClient} = require('@prisma/client');
  const bcrypt = require('bcryptjs');
  const p = new PrismaClient();
  bcrypt.hash('newpassword',12).then(h =>
    p.user.update({where:{email:'admin@example.com'},data:{passwordHash:h}})
  ).then(() => { console.log('done'); p.\$disconnect(); });
"
```

### View Minecraft console

```bash
make logs-minecraft   # tail live logs
# Or drop into RCON:
make shell-minecraft
# then: rcon-cli (if installed in image)
```

### Run database migrations manually

```bash
cd /opt/craftcontrol/deploymentV2
make migrate
```

### Wipe everything and start fresh

```bash
cd /opt/craftcontrol/deploymentV2
make nuke    # ⚠ destroys all data volumes — type 'DELETE EVERYTHING' to confirm
make deploy
```
