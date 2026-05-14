# CraftControl — Deployment Guide

**Environment:** Proxmox VE (bare metal) + DiscoPanel
**Last Updated:** 2026-05-12
**Status:** Pre-production

---

## Quick Start

After creating mgmt-vm in Proxmox (see §2), run the one-call setup script:

```bash
sudo bash scripts/setup-mgmt-vm.sh \
  --domain panel.yourdomain.com \
  --email  admin@yourdomain.com \
  --game-vm 10.10.10.10
```

This single command installs and configures Node.js 22, PostgreSQL 16, Redis 7, Nginx, Let's Encrypt SSL, UFW, fail2ban, PM2, all app directories, and a ready-to-use `.env` with generated secrets. See [§4 mgmt-vm (Web Stack)](#4-vm-2--mgmt-vm-web-stack) for the complete reference, or jump to [§4.1](#41-automated-setup-script) for script options.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Proxmox Host Setup](#2-proxmox-host-setup)
3. [VM 1 — game-vm (Minecraft + DiscoPanel)](#3-vm-1--game-vm-minecraft--discopanel)
4. [VM 2 — mgmt-vm (Web Stack)](#4-vm-2--mgmt-vm-web-stack)
   - 4.1 [Automated Setup Script](#41-automated-setup-script)
   - 4.2 [Manual Steps Reference](#42-manual-steps-reference)
5. [Networking & Firewall](#5-networking--firewall)
6. [SSL/TLS Configuration](#6-ssltls-configuration)
7. [DiscoPanel Configuration](#7-discopanel-configuration)
8. [CI/CD Pipeline](#8-cicd-pipeline)
9. [Backup Strategy](#9-backup-strategy)
10. [Monitoring & Alerting](#10-monitoring--alerting)
11. [Secrets Management](#11-secrets-management)
12. [Runbooks](#12-runbooks)

---

## 1. Architecture Overview

```
┌──────────────────────────────────────────────────────────────────┐
│                      PROXMOX VE HOST                             │
│                    (bare metal, Ubuntu)                          │
│                                                                  │
│  ┌──────────────────────────────┐  ┌─────────────────────────┐  │
│  │  VM 1 — game-vm              │  │  VM 2 — mgmt-vm         │  │
│  │  4 vCPU  /  8 GB RAM         │  │  2 vCPU  /  6 GB RAM    │  │
│  │  40 GB SSD  (world data)     │  │  40 GB SSD              │  │
│  │  Ubuntu 24.04 LTS            │  │  Ubuntu 24.04 LTS       │  │
│  │                              │  │                         │  │
│  │  ┌─ DiscoPanel               │  │  ┌─ Nginx :443          │  │
│  │  │  :3001 (internal only)    │  │  ├─ Node.js API :3000   │  │
│  │  └─ Minecraft Paper 1.21.x   │  │  ├─ React SPA           │  │
│  │     :25565 (public)          │  │  │   /var/www/craftcontrol│ │
│  │     BridgePlugin: :25580     │  │  ├─ PostgreSQL :5432    │  │
│  │     (internal only)          │  │  │   (socket only)      │  │
│  │                              │  │  └─ Redis :6379         │  │
│  │  Internal IP: 10.10.10.10   │  │     (socket only)       │  │
│  └──────────────────────────────┘  │  Internal IP:10.10.10.20│  │
│                                    └─────────────────────────┘  │
│              Proxmox Internal Bridge: vmbr1 (10.10.10.0/24)     │
└──────────────────────────────────────────────────────────────────┘
                               │
                  Public bridge: vmbr0 (NAT / public IP)
                    Minecraft :25565  |  HTTPS :443
```

### Why two separate VMs

Minecraft's JVM generates stop-the-world GC pauses that compete with OS I/O scheduling. PostgreSQL, Redis, and the Node.js API are all sensitive to I/O latency. Running them on the same VM risks cascading latency spikes: a GC pause delays I/O, which delays API responses, which causes BridgePlugin timeouts, which degrades in-game experience. Separating the workloads onto two VMs eliminates this coupling at the cost of one additional VM — a trivial overhead on Proxmox.

Additional benefits: independent snapshots before updates, separate monitoring thresholds, and a smaller blast radius if either VM is compromised.

---

## 2. Proxmox Host Setup

### 2.1 Minimum Host Requirements

| Resource | Minimum | Recommended |
|---|---|---|
| CPU | 4 cores (physical) | 8 cores |
| RAM | 20 GB | 32 GB |
| Storage | 120 GB SSD | 250 GB NVMe |
| OS | Proxmox VE 8.x | Proxmox VE 8.x (latest) |
| NICs | 1 (1 Gbit) | 2 (1 Gbit each — separate for public/internal) |

### 2.2 Network Bridges

Create two Linux bridges on the Proxmox host:

| Bridge | CIDR | Purpose |
|---|---|---|
| `vmbr0` | Public IP / NAT | Internet-facing traffic (Minecraft port, HTTPS) |
| `vmbr1` | `10.10.10.0/24` | Internal VM-to-VM communication |

```bash
# /etc/network/interfaces snippet (Proxmox host)
auto vmbr1
iface vmbr1 inet static
    address 10.10.10.1/24
    bridge-ports none
    bridge-stp off
    bridge-fd 0
```

### 2.3 VM Creation Summary

| Setting | game-vm | mgmt-vm |
|---|---|---|
| VM ID | 100 | 101 |
| OS | Ubuntu 24.04 LTS (cloud-init) | Ubuntu 24.04 LTS (cloud-init) |
| vCPU | 4 | 2 |
| RAM | 8 GB | 6 GB |
| Disk | 40 GB (local-lvm) | 40 GB (local-lvm) |
| NIC 1 | vmbr0 (public) | vmbr0 (public) |
| NIC 2 | vmbr1, IP `10.10.10.10/24` | vmbr1, IP `10.10.10.20/24` |
| QEMU Agent | enabled | enabled |

---

## 3. VM 1 — game-vm (Minecraft + DiscoPanel)

### 3.1 Base OS Setup

```bash
# Update system
apt update && apt upgrade -y
apt install -y curl wget unzip ufw fail2ban openjdk-21-jre-headless

# Set hostname
hostnamectl set-hostname game-vm
echo "10.10.10.20 mgmt-vm" >> /etc/hosts
```

### 3.2 DiscoPanel Installation

DiscoPanel is installed on game-vm and manages the Minecraft server process.

```bash
# Install dependencies
apt install -y docker.io docker-compose

# Download and install DiscoPanel
curl -sSL https://get.discopanel.io | bash

# DiscoPanel web UI runs on port 3001 — bind to internal IP only
# Edit /etc/discopanel/config.yml:
#   listen: "10.10.10.10:3001"
```

DiscoPanel admin panel is accessible only from the internal network (`http://10.10.10.10:3001`). It is **not** exposed publicly. Access it via an SSH tunnel if needed remotely:

```bash
ssh -L 3001:10.10.10.10:3001 user@<proxmox-host-ip>
# Then open http://localhost:3001 in browser
```

### 3.3 Minecraft Server via DiscoPanel

1. Log in to DiscoPanel at `http://10.10.10.10:3001`.
2. Create a new server instance:
   - **Type:** Java (Paper)
   - **Version:** 1.21.x (latest stable)
   - **RAM allocation:** 6 GB (`-Xms2G -Xmx6G`)
   - **Port:** 25565
   - **Server directory:** `/opt/discopanel/servers/craftcontrol/`
3. Upload the built `CraftControl-1.0.0.jar` plugin to the `plugins/` directory via DiscoPanel file manager.
4. Configure each plugin's `config.yml` via DiscoPanel file manager (see Section 3.4).

**Recommended JVM flags (Paper):**

```
-Xms2G -Xmx6G
-XX:+UseG1GC
-XX:+ParallelRefProcEnabled
-XX:MaxGCPauseMillis=200
-XX:+UnlockExperimentalVMOptions
-XX:+DisableExplicitGC
-XX:+AlwaysPreTouch
-XX:G1NewSizePercent=30
-XX:G1MaxNewSizePercent=40
-XX:G1HeapRegionSize=8M
-XX:G1ReservePercent=20
-XX:G1HeapWastePercent=5
-XX:G1MixedGCCountTarget=4
-XX:InitiatingHeapOccupancyPercent=15
-XX:G1MixedGCLiveThresholdPercent=90
-XX:G1RSetUpdatingPauseTimePercent=5
-XX:SurvivorRatio=32
-XX:+PerfDisableSharedMem
-XX:MaxTenuringThreshold=1
-Dusing.aikars.flags=https://mcflags.emc.gs
-Daikars.new.flags=true
```

### 3.4 BridgePlugin Configuration

`/opt/discopanel/servers/craftcontrol/plugins/BridgePlugin/config.yml`:

```yaml
bridge:
  port: 25580
  bind: "0.0.0.0"   # UFW restricts access to mgmt-vm IP (10.10.10.20)
  secret: "${BRIDGE_SECRET}"

api:
  base_url: "http://10.10.10.20:3000/api"
  service_token: "${SERVICE_TOKEN}"
  timeout_ms: 5000
  retry_max: 3
  retry_backoff_ms: 500
```

Secrets are injected via DiscoPanel's environment variable settings (stored encrypted). Never commit secrets to the repository.

### 3.5 DiscoPanel Scheduled Tasks

Configure in DiscoPanel → Schedules:

| Task | Schedule | Command |
|---|---|---|
| Daily restart | `0 4 * * *` (04:00 server time) | `restart` |
| World backup | `0 3 * * *` (03:00 server time) | `backup create` |
| Log rotation | `0 0 * * 0` (weekly) | shell: `find /opt/discopanel/servers/craftcontrol/logs -name "*.log.gz" -mtime +30 -delete` |

---

## 4. VM 2 — mgmt-vm (Web Stack)

### 4.1 Automated Setup Script

**Script location:** `scripts/setup-mgmt-vm.sh`

Run once on a fresh Ubuntu 24.04 VM:

```bash
# Full setup with SSL
sudo bash scripts/setup-mgmt-vm.sh \
  --domain  panel.yourdomain.com \
  --email   admin@yourdomain.com \
  --game-vm 10.10.10.10

# Skip SSL (for internal/staging environments)
sudo bash scripts/setup-mgmt-vm.sh \
  --domain  panel.yourdomain.com \
  --skip-ssl \
  --game-vm 10.10.10.10

# Supply your own DB password (otherwise auto-generated)
sudo bash scripts/setup-mgmt-vm.sh \
  --domain  panel.yourdomain.com \
  --email   admin@yourdomain.com \
  --db-pass mySecurePassword123
```

**Options:**

| Flag | Default | Description |
|---|---|---|
| `--domain <host>` | required | Public hostname for the web panel |
| `--email <email>` | required unless `--skip-ssl` | Let's Encrypt notification email |
| `--db-pass <pass>` | auto-generated | PostgreSQL password for `craftcontrol` user |
| `--skip-ssl` | false | Skip certbot; configure Nginx for HTTP only |
| `--game-vm <ip>` | `10.10.10.10` | Internal IP of game-vm (written into `.env`) |

**What the script configures (12 steps):**

1. System package update
2. Install Node.js 22 LTS, PostgreSQL 16, Redis 7, Nginx, Certbot, fail2ban, PM2
3. PostgreSQL: create `craftcontrol` user + database, apply performance tuning (`shared_buffers`, `work_mem`, slow query log)
4. Redis: set `maxmemory 512mb`, `allkeys-lru` eviction
5. App directories: `/var/www/craftcontrol/{api,public}`, `/var/backups/craftcontrol`
6. PM2 systemd startup for `www-data` user
7. Nginx: reverse proxy config with rate limiting (`30r/m`, burst 50), SPA fallback routing, security headers
8. Let's Encrypt certificate + HSTS + auto-renewal timer
9. UFW: deny all inbound except ports 22, 80, 443
10. `.env` file at `/var/www/craftcontrol/api/.env` with all generated secrets (permissions `640`, owner `www-data`)
11. fail2ban enabled
12. Service health check + printed summary of all credentials and next steps

**Output:** The script prints a summary table with all generated secrets. **Copy these immediately** — the `BRIDGE_SECRET` must be entered into DiscoPanel's environment variables on game-vm.

### 4.2 Manual Steps Reference

The sections below document each step individually for reference, troubleshooting, or partial re-runs. For a fresh VM, prefer the automated script above.

### Base OS Setup

```bash
apt update && apt upgrade -y
apt install -y curl wget unzip ufw fail2ban nginx certbot python3-certbot-nginx

# Set hostname
hostnamectl set-hostname mgmt-vm
echo "10.10.10.10 game-vm" >> /etc/hosts
```

### 4.2 Node.js 22 LTS

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt install -y nodejs
npm install -g pm2
pm2 startup systemd -u www-data --hp /var/www
```

### 4.3 PostgreSQL 16

```bash
apt install -y postgresql-16

sudo -u postgres psql <<'SQL'
CREATE USER craftcontrol WITH PASSWORD 'CHANGE_ME';
CREATE DATABASE craftcontrol OWNER craftcontrol;
GRANT ALL PRIVILEGES ON DATABASE craftcontrol TO craftcontrol;
SQL

# pg_hba.conf — local socket only, no TCP
# Verify: grep -E "^local|^host" /etc/postgresql/16/main/pg_hba.conf
```

Edit `/etc/postgresql/16/main/postgresql.conf`:

```
# Memory (adjust if mgmt-vm has 6 GB RAM)
shared_buffers = 1536MB
effective_cache_size = 4GB
work_mem = 16MB
maintenance_work_mem = 256MB

# Logging
log_min_duration_statement = 500
log_checkpoints = on
```

```bash
systemctl restart postgresql
```

### 4.4 Redis 7

```bash
apt install -y redis-server

# /etc/redis/redis.conf
# bind 127.0.0.1          ← already default, keep it
# maxmemory 512mb
# maxmemory-policy allkeys-lru

systemctl enable redis-server
systemctl restart redis-server
```

### 4.5 CraftControl API Deployment

```bash
# Create app directory
mkdir -p /var/www/craftcontrol/api
chown -R www-data:www-data /var/www/craftcontrol

# Deploy (done by CI/CD — see Section 8)
# Manual first-time deploy:
cd /var/www/craftcontrol/api
npm ci --omit=dev
npx prisma migrate deploy
pm2 start dist/index.js --name craftcontrol-api --user www-data
pm2 save
```

Environment file `/var/www/craftcontrol/api/.env` (permissions `640`, owned by `www-data`):

```env
DATABASE_URL=postgresql://craftcontrol:CHANGE_ME@localhost:5432/craftcontrol
REDIS_URL=redis://localhost:6379
JWT_SECRET=CHANGE_ME_256_BIT_RANDOM
JWT_REFRESH_SECRET=CHANGE_ME_256_BIT_RANDOM
MINECRAFT_BRIDGE_URL=http://10.10.10.10:25580
MINECRAFT_BRIDGE_SECRET=CHANGE_ME_256_BIT_RANDOM
NODE_ENV=production
PORT=3000
```

Generate secrets:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 4.6 React SPA Deployment

```bash
# Build artifact produced by CI, deployed via rsync
rsync -av --delete dist/ /var/www/craftcontrol/public/
```

### 4.7 Nginx Configuration

`/etc/nginx/sites-available/craftcontrol`:

```nginx
# Redirect HTTP to HTTPS
server {
    listen 80;
    server_name panel.yourdomain.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name panel.yourdomain.com;

    ssl_certificate     /etc/letsencrypt/live/panel.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/panel.yourdomain.com/privkey.pem;
    ssl_protocols       TLSv1.2 TLSv1.3;
    ssl_ciphers         ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;
    add_header Strict-Transport-Security "max-age=63072000" always;

    # React SPA
    root /var/www/craftcontrol/public;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    # Node.js API proxy
    location /api/ {
        proxy_pass         http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade $http_upgrade;
        proxy_set_header   Connection 'upgrade';
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 30s;

        # Rate limiting
        limit_req zone=api burst=50 nodelay;
    }
}

# Rate limiting zone
limit_req_zone $binary_remote_addr zone=api:10m rate=30r/m;
```

```bash
ln -s /etc/nginx/sites-available/craftcontrol /etc/nginx/sites-enabled/
nginx -t
systemctl reload nginx
```

---

## 5. Networking & Firewall

### 5.1 game-vm UFW Rules

```bash
ufw default deny incoming
ufw default allow outgoing

# SSH (restrict to known admin IPs in production)
ufw allow 22/tcp

# Minecraft Java Edition
ufw allow 25565/tcp

# BridgePlugin — allow ONLY from mgmt-vm internal IP
ufw allow from 10.10.10.20 to any port 25580 proto tcp

# DiscoPanel web UI — allow ONLY from internal network
ufw allow from 10.10.10.0/24 to any port 3001 proto tcp

ufw enable
```

### 5.2 mgmt-vm UFW Rules

```bash
ufw default deny incoming
ufw default allow outgoing

ufw allow 22/tcp
ufw allow 80/tcp    # certbot HTTP challenge + redirect
ufw allow 443/tcp   # HTTPS (Nginx — SPA + API)

# PostgreSQL and Redis — no external access (local socket only, no TCP rule needed)

ufw enable
```

### 5.3 Proxmox Host Firewall

Enable Proxmox datacenter-level firewall:
- Drop all inbound traffic to the Proxmox management interface except from trusted admin IP.
- Allow vmbr1 (internal bridge) traffic between VM 100 and VM 101 only.

### 5.4 Port Summary

| Port | Protocol | Host | Accessible From | Purpose |
|---|---|---|---|---|
| 22 | TCP | game-vm, mgmt-vm | Admin IPs only | SSH |
| 25565 | TCP | game-vm | Public internet | Minecraft Java Edition |
| 25580 | TCP | game-vm | mgmt-vm (10.10.10.20) only | BridgePlugin HTTP |
| 3001 | TCP | game-vm | Internal network (10.10.10.0/24) | DiscoPanel UI |
| 80 | TCP | mgmt-vm | Public internet | HTTP → HTTPS redirect |
| 443 | TCP | mgmt-vm | Public internet | HTTPS (SPA + API) |
| 3000 | TCP | mgmt-vm | localhost only | Node.js API (behind Nginx) |
| 5432 | TCP | mgmt-vm | localhost socket only | PostgreSQL |
| 6379 | TCP | mgmt-vm | localhost socket only | Redis |

---

## 6. SSL/TLS Configuration

```bash
# On mgmt-vm — obtain certificate for the web panel domain
certbot --nginx -d panel.yourdomain.com --email admin@yourdomain.com --agree-tos --non-interactive

# Auto-renewal (already set up by certbot as a systemd timer)
systemctl status certbot.timer
```

The Minecraft server does not need SSL — Minecraft's protocol handles its own encryption and the Java Edition client connects directly on TCP 25565.

---

## 7. DiscoPanel Configuration

### 7.1 Initial Setup

After installing DiscoPanel on game-vm:

1. Access `http://10.10.10.10:3001` over the internal network (or via SSH tunnel).
2. Create the admin account.
3. Set the panel URL to `http://10.10.10.10:3001` (internal only — no public URL for DiscoPanel).
4. Under **Settings → Security**, enable two-factor authentication for all admin accounts.

### 7.2 Creating the CraftControl Server Instance

| Field | Value |
|---|---|
| Server name | `CraftControl` |
| Server type | `Paper` |
| Minecraft version | `1.21.x` (latest stable) |
| Memory | `6144 MB` |
| CPU limit | `300%` (3 cores max) |
| Port | `25565` |
| Directory | `/opt/discopanel/servers/craftcontrol/` |
| Startup command | `java {JVM_FLAGS} -jar paper.jar --nogui` |

### 7.3 Environment Variables in DiscoPanel

Set the following in DiscoPanel → Server → Startup → Variables (stored encrypted):

| Variable | Value |
|---|---|
| `BRIDGE_SECRET` | 256-bit hex token |
| `SERVICE_TOKEN` | 256-bit hex token |

### 7.4 SFTP Access

DiscoPanel provides an SFTP endpoint for uploading plugin JARs and editing configs. CI/CD uses this for automated plugin deployment. Credentials are managed per-user in DiscoPanel's user settings.

### 7.5 Roles

| Role | Permissions |
|---|---|
| `super_admin` | Full access — start/stop/restart, file manager, console, config, backups |
| `moderator` | Console access, log viewer, no file manager, no config changes |

---

## 8. CI/CD Pipeline

### 8.1 GitHub Actions Workflows

```
.github/workflows/
├── minecraft-plugin.yml    # PR check: Maven build + JUnit tests
├── api.yml                 # PR check: npm test + eslint + type-check
└── deploy.yml              # Push to main: build + deploy to both VMs
```

### 8.2 deploy.yml Overview

```yaml
name: Deploy

on:
  push:
    branches: [main]

jobs:
  deploy-plugin:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-java@v4
        with: { java-version: '21', distribution: 'temurin' }
      - name: Build plugin JAR
        run: mvn clean package -DskipTests -f plugins/pom.xml
      - name: Upload plugin via DiscoPanel SFTP
        uses: appleboy/scp-action@v0.1.7
        with:
          host: ${{ secrets.GAME_VM_HOST }}
          username: ${{ secrets.DISCOPANEL_SFTP_USER }}
          password: ${{ secrets.DISCOPANEL_SFTP_PASS }}
          port: ${{ secrets.DISCOPANEL_SFTP_PORT }}
          source: "plugins/target/CraftControl-*.jar"
          target: "/plugins/"
          strip_components: 2
      - name: Restart Minecraft via DiscoPanel API
        run: |
          curl -s -X POST \
            -H "Authorization: Bearer ${{ secrets.DISCOPANEL_API_TOKEN }}" \
            http://10.10.10.10:3001/api/servers/craftcontrol/power \
            -d '{"signal":"restart"}'

  deploy-api:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '22' }
      - name: Build API
        working-directory: server
        run: npm ci && npm run build
      - name: Run DB migrations
        working-directory: server
        run: npx prisma migrate deploy
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL }}
      - name: Deploy API to mgmt-vm
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.MGMT_VM_HOST }}
          username: deploy
          key: ${{ secrets.MGMT_VM_SSH_KEY }}
          script: |
            rsync -av --delete /tmp/api-build/ /var/www/craftcontrol/api/
            pm2 reload craftcontrol-api

  deploy-spa:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '22' }
      - name: Build SPA
        working-directory: client
        run: npm ci && npm run build
        env:
          VITE_API_BASE_URL: ${{ secrets.VITE_API_BASE_URL }}
      - name: Deploy SPA to mgmt-vm
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.MGMT_VM_HOST }}
          username: deploy
          key: ${{ secrets.MGMT_VM_SSH_KEY }}
          script: rsync -av --delete /tmp/spa-dist/ /var/www/craftcontrol/public/
```

### 8.3 Required GitHub Secrets

| Secret | Description |
|---|---|
| `GAME_VM_HOST` | game-vm public IP or hostname |
| `DISCOPANEL_SFTP_USER` | DiscoPanel SFTP username |
| `DISCOPANEL_SFTP_PASS` | DiscoPanel SFTP password |
| `DISCOPANEL_SFTP_PORT` | DiscoPanel SFTP port (default: 2022) |
| `DISCOPANEL_API_TOKEN` | DiscoPanel API bearer token |
| `MGMT_VM_HOST` | mgmt-vm public IP or hostname |
| `MGMT_VM_SSH_KEY` | SSH private key for `deploy` user on mgmt-vm |
| `DATABASE_URL` | Full PostgreSQL connection string (for migrations) |
| `VITE_API_BASE_URL` | Public API URL (e.g., `https://panel.yourdomain.com/api`) |

---

## 9. Backup Strategy

### 9.1 Minecraft World Backups (game-vm)

Managed by DiscoPanel's built-in backup scheduler:

- **Frequency:** Daily at 03:00 server time (before the 04:00 restart).
- **Retention:** 7 daily backups kept locally in `/opt/discopanel/backups/craftcontrol/`.
- **Offsite:** Weekly backup synced to an S3-compatible object store via rclone:

```bash
# /etc/cron.weekly/craftcontrol-world-backup
rclone sync /opt/discopanel/backups/craftcontrol/ remote:craftcontrol-backups/world/ --max-age 7d
```

### 9.2 PostgreSQL Backups (mgmt-vm)

```bash
# /etc/cron.daily/craftcontrol-pg-backup
#!/bin/bash
DATE=$(date +%Y%m%d)
pg_dump craftcontrol | gzip > /var/backups/craftcontrol/pg_$DATE.sql.gz
# Retain 14 days
find /var/backups/craftcontrol/ -name "pg_*.sql.gz" -mtime +14 -delete
# Sync to offsite
rclone copy /var/backups/craftcontrol/pg_$DATE.sql.gz remote:craftcontrol-backups/postgres/
```

### 9.3 Proxmox VM Snapshots

- Take a Proxmox snapshot of both VMs **before every major deployment** (plugin update, schema migration, OS upgrade).
- Weekly automated snapshot via Proxmox Backup Server or `vzdump`:

```bash
# /etc/cron.weekly/proxmox-snapshots
vzdump 100 101 --compress zstd --storage local --mode snapshot
```

- Retain last 3 weekly snapshots per VM.

### 9.4 Recovery Time Objectives

| Scenario | Recovery Method | Target RTO |
|---|---|---|
| Minecraft plugin crash | DiscoPanel auto-restart | < 2 min |
| Minecraft data corruption | Restore from daily world backup | < 30 min |
| mgmt-vm API crash | PM2 auto-restart | < 1 min |
| mgmt-vm disk failure | Restore Proxmox snapshot | < 1 hour |
| Full host failure | Restore to new Proxmox host from offsite backups | < 4 hours |

---

## 10. Monitoring & Alerting

### 10.1 PM2 Monitoring (mgmt-vm)

```bash
pm2 monit                    # local real-time view
pm2 logs craftcontrol-api    # live log tail
```

Configure PM2 to alert on crashes:

```bash
pm2 install pm2-logrotate
# In ecosystem.config.js:
# max_restarts: 10, restart_delay: 5000
```

### 10.2 Nginx Access Logs

```bash
# /etc/logrotate.d/nginx already handles rotation
# Monitor for 5xx errors:
tail -f /var/log/nginx/access.log | grep " 5[0-9][0-9] "
```

### 10.3 PostgreSQL Slow Query Log

Already configured in Section 4.3 (`log_min_duration_statement = 500`). Log location: `/var/log/postgresql/`.

### 10.4 DiscoPanel Resource Monitoring

DiscoPanel's dashboard shows per-instance CPU%, RAM usage, and TPS for the Minecraft server. Set alert thresholds in DiscoPanel → Alerts:

| Metric | Warning | Critical |
|---|---|---|
| Server RAM | 80% | 95% |
| TPS | < 18 | < 15 |
| CPU usage | 70% | 90% |

### 10.5 Uptime Monitoring (External)

Use an external uptime monitoring service (e.g., UptimeRobot, Betterstack) to monitor:
- `panel.yourdomain.com` (HTTPS 200 check every 1 min).
- Minecraft port `25565` (TCP check every 1 min).

Configure email/Discord webhook alerts on downtime.

---

## 11. Secrets Management

All secrets follow this lifecycle:

1. **Generated** with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` (32 bytes = 256 bits).
2. **Stored** in:
   - DiscoPanel encrypted environment variables (plugin secrets on game-vm).
   - `/var/www/craftcontrol/api/.env` (permissions `640`, owner `www-data`) on mgmt-vm.
   - GitHub Actions encrypted secrets (for CI/CD).
3. **Never** committed to the repository. `.env` is in `.gitignore`.
4. **Rotated** every 90 days or immediately after any suspected compromise.

### Rotation Procedure

1. Generate new secret value.
2. Update in DiscoPanel (for `BRIDGE_SECRET` / `SERVICE_TOKEN`) and redeploy Minecraft server.
3. Update `/var/www/craftcontrol/api/.env` and run `pm2 reload craftcontrol-api`.
4. Update in GitHub Actions secrets for CI/CD.
5. Verify end-to-end: a reward grant triggered from the dashboard should successfully call BridgePlugin and execute in-game.

---

## 12. Runbooks

### 12.1 Deploy a Plugin Update

1. Push changes to `main`.
2. GitHub Actions `deploy.yml` automatically builds the JAR and uploads it via DiscoPanel SFTP.
3. DiscoPanel API call restarts the Minecraft server.
4. Verify via DiscoPanel console: `[BridgePlugin] Bridge started on port 25580` should appear in server logs.

### 12.2 Run a Database Migration

```bash
# On mgmt-vm as www-data
cd /var/www/craftcontrol/api
npx prisma migrate deploy
pm2 reload craftcontrol-api
```

For destructive migrations, take a PostgreSQL backup first (see Section 9.2).

### 12.3 Emergency Minecraft Server Restart

```bash
# Via DiscoPanel UI: Server → Power → Restart
# OR via API (from admin machine connected to internal network):
curl -X POST \
  -H "Authorization: Bearer <DISCOPANEL_API_TOKEN>" \
  http://10.10.10.10:3001/api/servers/craftcontrol/power \
  -d '{"signal":"restart"}'
```

### 12.4 Restore World from Backup

1. Stop Minecraft server via DiscoPanel → Power → Stop.
2. Identify backup: `ls /opt/discopanel/backups/craftcontrol/`.
3. Restore via DiscoPanel → Backups → Restore, or manually:

```bash
cd /opt/discopanel/servers/craftcontrol/
cp -r world world.bak.$(date +%s)   # keep current as safety copy
tar -xzf /opt/discopanel/backups/craftcontrol/<backup-file>.tar.gz world/
```

4. Start server via DiscoPanel → Power → Start.
5. Verify in console that world loaded without errors.

### 12.5 Roll Back a Bad Deployment

```bash
# mgmt-vm: PM2 rollback (if using PM2 deploy)
pm2 deploy production revert 1

# OR: restore Proxmox snapshot taken before deployment
# Via Proxmox web UI: Datacenter → VM 101 → Snapshots → Rollback
```

---

*This document covers all operational aspects of the CraftControl production environment. For development setup instructions, see [TECHNICAL_DOCS.md](./TECHNICAL_DOCS.md) Section 8.*

## 8.3 GitHub Actions Secrets

Configure these secrets in **GitHub → Settings → Secrets and variables → Actions** before the deploy pipeline can run.

| Secret | Used by | Description |
|---|---|---|
| `GAME_VM_HOST` | deploy-plugin | Hostname/IP of game-vm (10.10.10.10) |
| `DISCOPANEL_SFTP_USER` | deploy-plugin | SFTP username for DiscoPanel file manager |
| `DISCOPANEL_SFTP_PASS` | deploy-plugin | SFTP password for DiscoPanel file manager |
| `DISCOPANEL_SFTP_PORT` | deploy-plugin | SFTP port exposed by DiscoPanel (default: 2022) |
| `DISCOPANEL_API_TOKEN` | deploy-plugin | DiscoPanel API bearer token (Power management) |
| `MGMT_VM_HOST` | deploy-api, deploy-spa | Hostname/IP of mgmt-vm (10.10.10.20) |
| `MGMT_VM_SSH_KEY` | deploy-api, deploy-spa | Private SSH key for `www-data` on mgmt-vm |
| `DATABASE_URL` | deploy-api | PostgreSQL connection string for `prisma migrate deploy` |
| `VITE_API_BASE_URL` | deploy-spa | Public API URL injected into the built SPA (e.g. `https://panel.yourdomain.com`) |

### Generating the SSH key pair

**Recommended: use a GitHub Deploy Key** (repository-scoped, cannot access other repos).

1. Generate a dedicated deploy keypair — do **not** reuse personal SSH keys:

```bash
ssh-keygen -t ed25519 -C "craftcontrol-deploy-$(date +%Y%m%d)" -f ~/.ssh/craftcontrol_deploy -N ""
```

2. Add the **public** key to mgmt-vm's `authorized_keys`:

```bash
ssh-copy-id -i ~/.ssh/craftcontrol_deploy.pub www-data@10.10.10.20
```

Restrict the key to only the commands the deploy job needs:

```
# /var/www/.ssh/authorized_keys
command="cd /var/www/craftcontrol/api && git pull origin main && npm ci --omit=dev && npx prisma migrate deploy && pm2 reload craftcontrol-api",no-port-forwarding,no-X11-forwarding,no-agent-forwarding ssh-ed25519 AAAA...
```

3. Add the **private** key content as the `MGMT_VM_SSH_KEY` GitHub secret:

```bash
cat ~/.ssh/craftcontrol_deploy   # copy output → GitHub → Settings → Secrets → MGMT_VM_SSH_KEY
```

4. **Rotate the key every 90 days** — generate a new pair, update `authorized_keys` on the VM, update the GitHub secret, then delete the old public key from `authorized_keys`.

> **Security note:** Never commit SSH private keys to the repository or share them outside GitHub Secrets. If a key is accidentally exposed, rotate it immediately using the steps above.
