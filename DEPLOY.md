# CraftControl — Deployment & Infrastructure Guide

## Overview

CraftControl runs on two separate virtual machines:

| VM | Role | Minimum Specs |
|----|------|---------------|
| **mgmt-vm** | API server, React SPA, PostgreSQL, Redis | 2 vCPU, 4 GB RAM, 40 GB SSD |
| **game-vm** | Minecraft Paper server, Bukkit plugins | 4 vCPU, 8 GB RAM, 60 GB SSD |

GitHub Actions handles CI and all deployments. You never SSH into VMs manually after initial setup.

---

## 1. Proxmox VM Setup

### 1.1 Create mgmt-vm

In the Proxmox web UI (or via `pvesh`):

```bash
# Download Ubuntu 24.04 LTS cloud image
pveam update
pveam download local ubuntu-24.04-standard_24.04-1_amd64.tar.zst

# Or use ISO installer — upload to Proxmox storage, create VM manually
# Recommended: 2 vCPU, 4096 MB RAM, 40 GB virtio disk, VirtIO network
```

**VM settings:**

```
VM ID:        100
Name:         mgmt-vm
OS:           Ubuntu 24.04 LTS
CPU:          2 cores (host type)
RAM:          4096 MB (no ballooning)
Disk:         40 GB, virtio, SSD emulation enabled
Network:      vmbr0, VirtIO, set a static IP
```

After installation, enable the QEMU guest agent:

```bash
apt install qemu-guest-agent
systemctl enable --now qemu-guest-agent
```

### 1.2 Create game-vm

```
VM ID:        101
Name:         game-vm
OS:           Ubuntu 24.04 LTS
CPU:          4 cores (host type)
RAM:          8192 MB
Disk:         60 GB, virtio, SSD emulation enabled
Network:      vmbr0, VirtIO
Ports:        25565/tcp (Minecraft), 25580/tcp (BridgePlugin HTTP)
```

### 1.3 Static IP configuration

On each VM edit `/etc/netplan/50-cloud-init.yaml`:

```yaml
network:
  version: 2
  ethernets:
    ens18:
      addresses: [192.168.1.10/24]   # mgmt-vm — adjust to your subnet
      routes:
        - to: default
          via: 192.168.1.1
      nameservers:
        addresses: [1.1.1.1, 8.8.8.8]
```

Apply:

```bash
netplan apply
```

Use `192.168.1.10` for **mgmt-vm** and `192.168.1.11` for **game-vm** throughout this guide.

---

## 2. mgmt-vm — Software Installation

SSH in as root (or a sudo user):

### 2.1 System packages

```bash
apt update && apt upgrade -y
apt install -y curl git build-essential ufw fail2ban
```

### 2.2 Node.js 22

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt install -y nodejs
node --version   # should print v22.x.x
```

### 2.3 PM2 (process manager)

```bash
npm install -g pm2
pm2 startup systemd -u www-data --hp /var/www
```

### 2.4 PostgreSQL 16

```bash
apt install -y postgresql-16
systemctl enable --now postgresql

sudo -u postgres psql <<'SQL'
CREATE USER craftcontrol WITH PASSWORD 'your_strong_password_here';
CREATE DATABASE craftcontrol OWNER craftcontrol;
GRANT ALL PRIVILEGES ON DATABASE craftcontrol TO craftcontrol;
SQL
```

Test connection:

```bash
psql postgresql://craftcontrol:your_strong_password_here@localhost:5432/craftcontrol -c '\conninfo'
```

### 2.5 Redis 7

```bash
apt install -y redis-server
# Bind to localhost only (default)
systemctl enable --now redis-server
redis-cli ping   # → PONG
```

### 2.6 Nginx (reverse proxy + static hosting)

```bash
apt install -y nginx certbot python3-certbot-nginx

cat > /etc/nginx/sites-available/craftcontrol <<'EOF'
server {
    listen 80;
    server_name panel.example.com;   # replace with your domain

    # React SPA
    root /var/www/craftcontrol/public;
    index index.html;
    location / {
        try_files $uri $uri/ /index.html;
    }

    # API proxy
    location /api/ {
        proxy_pass http://127.0.0.1:3000/api/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
EOF

ln -s /etc/nginx/sites-available/craftcontrol /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx

# TLS (skip if using a local/private domain)
certbot --nginx -d panel.example.com
```

### 2.7 App directories & permissions

```bash
mkdir -p /var/www/craftcontrol/api /var/www/craftcontrol/public
chown -R www-data:www-data /var/www/craftcontrol
```

### 2.8 First API deployment (manual bootstrap)

Clone the repo as `www-data`:

```bash
su - www-data -s /bin/bash
cd /var/www/craftcontrol/api
git clone https://github.com/sauliusc/minecraft-ai-manager.git .
cd server
npm ci --omit=dev
cp .env.example .env   # edit DATABASE_URL, JWT secrets, etc.
npx prisma migrate deploy
pm2 start dist/index.js --name craftcontrol-api
pm2 save
exit
```

**`.env` variables:**

```dotenv
DATABASE_URL=postgresql://craftcontrol:your_strong_password_here@localhost:5432/craftcontrol
REDIS_URL=redis://127.0.0.1:6379
JWT_SECRET=<random 64-char hex>
JWT_REFRESH_SECRET=<random 64-char hex>
SERVICE_TOKEN=<random 64-char hex — must match game-vm config>
MINECRAFT_BRIDGE_URL=http://192.168.1.11:25580
MINECRAFT_BRIDGE_SECRET=<same SERVICE_TOKEN>
PORT=3000
NODE_ENV=production
```

Generate secrets:

```bash
openssl rand -hex 32   # run twice for JWT_SECRET and JWT_REFRESH_SECRET
openssl rand -hex 32   # SERVICE_TOKEN
```

### 2.9 Firewall (mgmt-vm)

```bash
ufw default deny incoming
ufw allow ssh
ufw allow 80/tcp
ufw allow 443/tcp
ufw enable
```

---

## 3. game-vm — Software Installation

### 3.1 Java 21

```bash
apt update && apt upgrade -y
apt install -y curl ufw
apt install -y openjdk-21-jre-headless
java -version   # openjdk 21.x.x
```

### 3.2 Minecraft Paper server

```bash
mkdir -p /server && cd /server
# Download Paper 1.21.4 from https://papermc.io/downloads
curl -Lo paper.jar 'https://api.papermc.io/v2/projects/paper/versions/1.21.4/builds/LATEST/downloads/paper-1.21.4-LATEST.jar'

# Accept EULA
echo 'eula=true' > eula.txt

# server.properties — key settings
cat >> server.properties <<'EOF'
online-mode=true
resource-pack=
resource-pack-sha1=
resource-pack-required=false
EOF
```

### 3.3 Systemd service

```bash
cat > /etc/systemd/system/minecraft.service <<'EOF'
[Unit]
Description=CraftControl Minecraft Server
After=network.target

[Service]
User=minecraft
WorkingDirectory=/server
ExecStart=/usr/bin/java -Xms2G -Xmx6G -jar paper.jar nogui
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

useradd -r -d /server -s /bin/false minecraft
chown -R minecraft:minecraft /server
systemctl enable --now minecraft
```

### 3.4 Plugin config (`plugins/BridgePlugin/config.yml`)

```yaml
api_url: http://192.168.1.10:3000    # mgmt-vm internal IP
service_token: <same SERVICE_TOKEN from .env>
```

### 3.5 Firewall (game-vm)

```bash
ufw default deny incoming
ufw allow ssh
ufw allow 25565/tcp   # Minecraft
ufw allow 25580/tcp   # BridgePlugin inbound (from mgmt-vm only)
# Restrict bridge port to mgmt-vm IP:
ufw delete allow 25580/tcp
ufw allow from 192.168.1.10 to any port 25580
ufw enable
```

---

## 4. GitHub Secrets Configuration

Navigate to **GitHub → your repo → Settings → Secrets and variables → Actions → New repository secret**.

| Secret | Value | Used by |
|--------|-------|---------|
| `DATABASE_URL` | `postgresql://craftcontrol:pass@192.168.1.10:5432/craftcontrol` | API CI, deploy-api |
| `MGMT_VM_HOST` | `192.168.1.10` (or your public IP) | deploy-api, deploy-spa |
| `MGMT_VM_SSH_KEY` | Private key content (see §5) | deploy-api, deploy-spa |
| `GAME_VM_HOST` | `192.168.1.11` | deploy-plugin |
| `DISCOPANEL_SFTP_USER` | SSH username on game-vm (e.g. `minecraft`) | deploy-plugin |
| `DISCOPANEL_SFTP_PASS` | SSH password **or** leave blank (use key) | deploy-plugin |
| `DISCOPANEL_SFTP_PORT` | `22` | deploy-plugin |
| `DISCOPANEL_API_TOKEN` | Token for Minecraft restart API (if using DiscoPanel) | deploy-plugin |
| `VITE_API_BASE_URL` | `https://panel.example.com` | deploy-spa |

> **Note on `DISCOPANEL_API_TOKEN`**: If you're not using DiscoPanel, replace the restart step in `deploy.yml` with a direct `systemctl restart minecraft` SSH command and remove this secret.

---

## 5. SSH Key Setup for GitHub Actions

### 5.1 mgmt-vm deploy key

```bash
# On your local machine
ssh-keygen -t ed25519 -C "github-actions-mgmt" -f ~/.ssh/craftcontrol_mgmt -N ""

# Copy public key to mgmt-vm
ssh-copy-id -i ~/.ssh/craftcontrol_mgmt.pub www-data@192.168.1.10

# Add private key as MGMT_VM_SSH_KEY secret in GitHub
cat ~/.ssh/craftcontrol_mgmt
```

On mgmt-vm, lock down the `authorized_keys` entry to only allow git pull + pm2:

```bash
# /var/www/.ssh/authorized_keys
command="cd /var/www/craftcontrol/api && git pull origin main && npm ci --omit=dev && npx prisma migrate deploy && pm2 reload craftcontrol-api",no-port-forwarding,no-X11-forwarding,no-agent-forwarding ssh-ed25519 AAAA...
```

Or use the general key + restrict via `appleboy/ssh-action` (already wired in `deploy.yml`).

### 5.2 game-vm deploy key (SCP for JARs)

The `appleboy/scp-action` in `deploy.yml` uses `DISCOPANEL_SFTP_USER` + `DISCOPANEL_SFTP_PASS`. If you prefer key-based auth, add a second ed25519 key:

```bash
ssh-keygen -t ed25519 -C "github-actions-game" -f ~/.ssh/craftcontrol_game -N ""
ssh-copy-id -i ~/.ssh/craftcontrol_game.pub minecraft@192.168.1.11
```

Then change `deploy.yml` to use `key:` instead of `password:` in `appleboy/scp-action`.

---

## 6. Exposing VMs to the Internet (optional)

If your VMs are behind NAT (home lab), you have several options:

### Option A — Cloudflare Tunnel (recommended, no open ports)

```bash
# On mgmt-vm
curl -L https://pkg.cloudflare.com/cloudflare-main.gpg | tee /usr/share/keyrings/cloudflare-main.gpg
echo "deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared any main" | tee /etc/apt/sources.list.d/cloudflared.list
apt install cloudflared

cloudflared tunnel login
cloudflared tunnel create craftcontrol
cloudflared tunnel route dns craftcontrol panel.example.com

# /etc/cloudflared/config.yml
cat > /etc/cloudflared/config.yml <<'EOF'
tunnel: <tunnel-id>
credentials-file: /root/.cloudflared/<tunnel-id>.json
ingress:
  - hostname: panel.example.com
    service: http://localhost:80
  - service: http_status:404
EOF

systemctl enable --now cloudflared
```

### Option B — Port forwarding

Forward ports 80, 443, and 25565 from your router to the respective VM IPs. Use a DDNS service (DuckDNS, Cloudflare) if you don't have a static public IP.

### Option C — WireGuard VPN + public VPS

Run a small VPS (€3/month) as a WireGuard hub. GitHub Actions connects via the VPN tunnel, players connect to the VPS which forwards port 25565 to your home game-vm.

---

## 7. First Full Deployment

Once secrets are configured:

1. Push any change to `main` that touches `plugins/`, `server/`, or `client/`
2. GitHub Actions triggers the matching deploy job
3. Check progress in **Actions → Deploy**

To trigger all three jobs at once:

```bash
git commit --allow-empty -m "chore: trigger full deploy" && git push
```

---

## 8. Branch Preview for the Admin Panel

### Option A — Vercel (recommended, free, automatic PR previews)

Every pull request automatically gets a unique preview URL like `https://craftcontrol-git-feature-xyz-yourname.vercel.app`.

**Setup:**

1. Go to [vercel.com](https://vercel.com) → **New Project** → Import `sauliusc/minecraft-ai-manager`
2. Set **Root Directory** to `client`
3. Set **Framework Preset** to Vite
4. Add environment variable:

   ```
   VITE_API_BASE_URL = https://panel.example.com
   ```

5. Click **Deploy**

From now on, every PR gets a preview comment from the Vercel bot with a live URL. No configuration needed per-branch.

**To use a dev/mock API on previews**, add a second env var in Vercel's Preview environment:

```
VITE_API_BASE_URL = https://panel.example.com   # or a staging API URL
```

### Option B — Cloudflare Pages (free, unlimited bandwidth)

1. **Pages → Create a project** → Connect to Git → select repo
2. Build settings:
   ```
   Root:         client/
   Build command: npm run build
   Output:       dist/
   ```
3. Add `VITE_API_BASE_URL` in **Settings → Environment Variables → Preview**

Each PR branch gets a URL like `https://<branch>.craftcontrol.pages.dev`.

### Option C — GitHub Actions + GitHub Pages (no third-party)

Add a workflow file `.github/workflows/preview.yml`:

```yaml
name: PR Preview

on:
  pull_request:
    paths: [client/**]

permissions:
  contents: write
  pull-requests: write

jobs:
  preview:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '22'

      - name: Build
        run: npm ci && npm run build
        working-directory: client
        env:
          VITE_API_BASE_URL: ${{ secrets.VITE_API_BASE_URL }}

      - name: Deploy to GitHub Pages (branch preview)
        uses: peaceiris/actions-gh-pages@v4
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          publish_dir: client/dist
          destination_dir: pr-${{ github.event.number }}
          keep_files: true

      - name: Comment preview URL
        uses: actions/github-script@v7
        with:
          script: |
            const url = `https://${{ github.repository_owner }}.github.io/${{ github.event.repository.name }}/pr-${{ github.event.number }}/`;
            github.rest.issues.createComment({
              issue_number: context.issue.number,
              owner: context.repo.owner,
              repo: context.repo.repo,
              body: `## Preview deployed\n\n**URL:** ${url}\n\n> Updated on every push to this PR.`
            });
```

Requires **GitHub Pages** enabled on the repo (Settings → Pages → Source: `gh-pages` branch).

> **Note:** GitHub Pages previews are public even on private repos if Pages is enabled. Use Vercel or Cloudflare Pages for private repos.

### Comparison

| | Vercel | Cloudflare Pages | GitHub Pages |
|---|---|---|---|
| Cost | Free | Free | Free |
| PR preview URLs | ✅ automatic | ✅ automatic | ✅ with workflow |
| Private repo support | ✅ | ✅ | ⚠️ public only |
| Custom domain | ✅ | ✅ | ✅ |
| Setup effort | Minimal | Minimal | Medium |
| API proxy on preview | ✅ rewrites | ✅ `_redirects` | ❌ need CORS |

**Recommendation:** Use Vercel. Connect once, get preview URLs on every PR automatically, zero ongoing maintenance.

---

## 9. Local Development

### Prerequisites

- Node.js 22+, Java 21, Maven 3.9+
- Docker (for PostgreSQL + Redis)

### Start infrastructure

```bash
docker run -d --name pg \
  -e POSTGRES_USER=craftcontrol \
  -e POSTGRES_PASSWORD=testpass \
  -e POSTGRES_DB=craftcontrol \
  -p 5432:5432 postgres:16-alpine

docker run -d --name redis -p 6379:6379 redis:7-alpine
```

### Start API server

```bash
cd server
cp .env.example .env   # set DATABASE_URL and secrets
npm install
npx prisma migrate dev
npm run dev            # http://localhost:3000
```

### Start React dev server

```bash
cd client
npm install
VITE_API_BASE_URL=http://localhost:3000 npm run dev
# Opens http://localhost:5173
```

### Build plugins

```bash
cd plugins
mvn clean package -DskipTests
# JARs in plugins/*/target/*.jar
```

### Run resource pack build

```bash
cd resourcepack
npm install
npm run pack:build
# Output: resourcepack/dist/craftcontrol-pack.zip + .sha1
```

---

## 10. Secrets Cheat Sheet

```bash
# Generate all required secrets in one go
echo "DATABASE_URL=postgresql://craftcontrol:$(openssl rand -hex 12)@192.168.1.10:5432/craftcontrol"
echo "JWT_SECRET=$(openssl rand -hex 32)"
echo "JWT_REFRESH_SECRET=$(openssl rand -hex 32)"
echo "SERVICE_TOKEN=$(openssl rand -hex 32)"
```

Copy the output, save it somewhere secure, and configure:
- The `.env` file on mgmt-vm
- The `config.yml` files in `plugins/BridgePlugin/`
- GitHub repository secrets (§4)

---

## 11. Troubleshooting

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| API returns 502 | PM2 process down | `pm2 status` → `pm2 restart craftcontrol-api` |
| Plugin can't reach API | Wrong `api_url` in BridgePlugin config | Check `192.168.1.10:3000` reachable from game-vm |
| DB migration fails in CI | `DATABASE_URL` secret wrong | Verify secret value, check Postgres is running |
| Minecraft can't get resource pack | `resource-pack` URL not reachable from internet | Use a public URL (GitHub Releases, Cloudflare R2) |
| GitHub Actions SCP fails | Firewall blocking port 22 on game-vm | `ufw allow from <GitHub Actions IP range> to any port 22` |
| Vercel preview shows blank page | `VITE_API_BASE_URL` not set on Preview env | Add it in Vercel Project → Settings → Environment Variables → Preview |
