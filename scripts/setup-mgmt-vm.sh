#!/usr/bin/env bash
# =============================================================================
# CraftControl — mgmt-vm bootstrap script
# Sets up the complete management VM environment in one call.
#
# Usage:
#   sudo bash setup-mgmt-vm.sh --domain panel.example.com \
#                               --email  admin@example.com \
#                               --repo   https://github.com/you/minecraft-ai-manager
#
# Options:
#   --domain   <host>   Public hostname or LAN IP (required)
#   --email    <email>  Let's Encrypt email (required unless --skip-ssl)
#   --db-pass  <pass>   PostgreSQL password (auto-generated if omitted)
#   --skip-ssl          Skip certbot — use for LAN / local installs
#   --game-vm  <ip>     IP of the Minecraft server (default: 10.10.10.10)
#   --repo     <url>    Git URL to clone automatically
#
# What this script does:
#   1.  System update
#   2.  Install: Node.js 22 LTS, PostgreSQL 16, Redis 7, Nginx, Certbot, PM2, fail2ban
#   3.  Configure PostgreSQL (create db/user, performance tuning)
#   4.  Configure Redis (memory cap, eviction policy)
#   5.  Set up app directories, npm/pm2 cache dirs, clone repo
#   6.  Write .env to server/ directory (where the API reads it)
#   7.  Configure PM2 systemd startup
#   8.  Configure Nginx reverse proxy (SPA + /api/ proxy, rate limiting)
#   9.  Obtain Let's Encrypt certificate + enable auto-renewal
#   10. Configure UFW firewall
#   11. Enable fail2ban
#   12. Build API + client, run migrations, seed admin, start PM2
# =============================================================================

set -euo pipefail

GREEN='\033[1;32m'; RED='\033[1;31m'; YELLOW='\033[1;33m'; NC='\033[0m'
log()  { echo -e "\n${GREEN}[setup]${NC} $*"; }
warn() { echo -e "${YELLOW}[warn]${NC}  $*"; }
err()  { echo -e "${RED}[error]${NC} $*" >&2; exit 1; }

# ── Argument parsing ───────────────────────────────────────────────────────────
DOMAIN=""
EMAIL=""
DB_PASS=""
SKIP_SSL=false
GAME_VM_IP="10.10.10.10"
REPO_URL=""

while [[ $# -gt 0 ]]; do
  case $1 in
    --domain)   DOMAIN="$2";     shift 2 ;;
    --email)    EMAIL="$2";      shift 2 ;;
    --db-pass)  DB_PASS="$2";    shift 2 ;;
    --skip-ssl) SKIP_SSL=true;   shift   ;;
    --game-vm)  GAME_VM_IP="$2"; shift 2 ;;
    --repo)     REPO_URL="$2";   shift 2 ;;
    *) err "Unknown option: $1" ;;
  esac
done

[[ -n "$DOMAIN" ]]                          || err "--domain is required."
[[ "$SKIP_SSL" == true || -n "$EMAIL" ]]    || err "--email is required unless --skip-ssl is set."
[[ $EUID -eq 0 ]]                           || err "Run as root: sudo bash $0"

if [[ -z "$DB_PASS" ]]; then
  DB_PASS=$(openssl rand -hex 24)
  warn "No --db-pass supplied. Generated: $DB_PASS"
fi

JWT_SECRET=$(openssl rand -hex 32)
JWT_REFRESH_SECRET=$(openssl rand -hex 32)
BRIDGE_SECRET=$(openssl rand -hex 32)

export DEBIAN_FRONTEND=noninteractive

# ── 1. System update ───────────────────────────────────────────────────────────
log "Step 1/12 — Updating system packages..."
apt-get update -qq
apt-get upgrade -y -qq

# ── 2. Base packages ───────────────────────────────────────────────────────────
log "Step 2/12 — Installing base packages..."
apt-get install -y -qq \
  curl wget unzip git gnupg ca-certificates lsb-release \
  ufw fail2ban \
  nginx certbot python3-certbot-nginx \
  redis-server

# PostgreSQL 16
if ! command -v psql &>/dev/null; then
  log "  Adding PostgreSQL 16 APT repository..."
  curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc \
    | gpg --dearmor -o /etc/apt/trusted.gpg.d/postgresql.gpg
  echo "deb https://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" \
    > /etc/apt/sources.list.d/pgdg.list
  apt-get update -qq
fi
apt-get install -y -qq postgresql-16

# Node.js 22 LTS
if ! command -v node &>/dev/null || [[ "$(node --version 2>/dev/null)" != v22* ]]; then
  log "  Adding NodeSource repository for Node.js 22 LTS..."
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash - >/dev/null 2>&1
  apt-get install -y -qq nodejs
fi

log "  Installing PM2 globally..."
npm install -g pm2 --silent

# ── 3. PostgreSQL ──────────────────────────────────────────────────────────────
log "Step 3/12 — Configuring PostgreSQL 16..."
systemctl enable postgresql
systemctl start postgresql

sudo -u postgres psql -tc \
  "SELECT 1 FROM pg_roles WHERE rolname='craftcontrol'" | grep -q 1 \
  || sudo -u postgres psql -c "CREATE USER craftcontrol WITH PASSWORD '$DB_PASS';"

# Always update password in case script is re-run with a new --db-pass
sudo -u postgres psql -c "ALTER USER craftcontrol WITH PASSWORD '$DB_PASS';" >/dev/null 2>&1 || true

sudo -u postgres psql -tc \
  "SELECT 1 FROM pg_database WHERE datname='craftcontrol'" | grep -q 1 \
  || sudo -u postgres psql -c "CREATE DATABASE craftcontrol OWNER craftcontrol;"

sudo -u postgres psql -c \
  "GRANT ALL PRIVILEGES ON DATABASE craftcontrol TO craftcontrol;" >/dev/null

PG_CONF=/etc/postgresql/16/main/postgresql.conf
declare -A PG_SETTINGS=(
  ["shared_buffers"]="512MB"
  ["effective_cache_size"]="1GB"
  ["work_mem"]="8MB"
  ["maintenance_work_mem"]="128MB"
  ["log_min_duration_statement"]="500"
  ["log_checkpoints"]="on"
  ["max_connections"]="100"
)
for key in "${!PG_SETTINGS[@]}"; do
  val="${PG_SETTINGS[$key]}"
  if grep -qE "^#?${key}\s*=" "$PG_CONF"; then
    sed -i "s|^#*${key}\s*=.*|${key} = ${val}|" "$PG_CONF"
  else
    echo "${key} = ${val}" >> "$PG_CONF"
  fi
done

systemctl restart postgresql
log "  PostgreSQL configured and running."

# ── 4. Redis ───────────────────────────────────────────────────────────────────
log "Step 4/12 — Configuring Redis 7..."
REDIS_CONF=/etc/redis/redis.conf

grep -q "^maxmemory " "$REDIS_CONF" \
  && sed -i "s|^maxmemory .*|maxmemory 256mb|" "$REDIS_CONF" \
  || echo "maxmemory 256mb" >> "$REDIS_CONF"

grep -q "^maxmemory-policy " "$REDIS_CONF" \
  && sed -i "s|^maxmemory-policy .*|maxmemory-policy allkeys-lru|" "$REDIS_CONF" \
  || echo "maxmemory-policy allkeys-lru" >> "$REDIS_CONF"

systemctl enable redis-server
systemctl restart redis-server
log "  Redis configured and running."

# ── 5. Directories, npm/pm2 cache, repo clone ─────────────────────────────────
log "Step 5/12 — Creating directories and cloning repository..."

mkdir -p /var/www/craftcontrol/public
mkdir -p /var/backups/craftcontrol

# Pre-create npm and pm2 cache dirs so www-data can use them without errors
mkdir -p /var/www/.npm
mkdir -p /var/www/.pm2/logs
mkdir -p /var/www/.pm2/pids

if [[ -n "$REPO_URL" ]]; then
  if [[ -d /var/www/craftcontrol/api/.git ]]; then
    log "  Repo already cloned — pulling latest..."
    chown -R www-data:www-data /var/www/craftcontrol/api
    sudo -u www-data git -C /var/www/craftcontrol/api pull --ff-only
  else
    # Ensure the target directory is owned by www-data before cloning
    rm -rf /var/www/craftcontrol/api
    mkdir -p /var/www/craftcontrol/api
    chown www-data:www-data /var/www/craftcontrol/api
    log "  Cloning repository from $REPO_URL..."
    sudo -u www-data git clone "$REPO_URL" /var/www/craftcontrol/api
  fi
else
  mkdir -p /var/www/craftcontrol/api
  warn "No --repo supplied. Code directory created but empty."
  warn "Clone manually: sudo -u www-data git clone <url> /var/www/craftcontrol/api"
fi

chown -R www-data:www-data /var/www/craftcontrol
chown -R www-data:www-data /var/www/.npm
chown -R www-data:www-data /var/www/.pm2
log "  Directories ready."

# ── 6. Write .env (server/ subdirectory — where the API process reads it) ──────
log "Step 6/12 — Writing .env..."
SERVER_ENV=/var/www/craftcontrol/api/server/.env

mkdir -p "$(dirname "$SERVER_ENV")"

cat > "$SERVER_ENV" <<ENV
# CraftControl — generated by setup-mgmt-vm.sh on $(date -u +"%Y-%m-%dT%H:%M:%SZ")
# DO NOT commit this file to version control.

DATABASE_URL=postgresql://craftcontrol:${DB_PASS}@localhost:5432/craftcontrol
REDIS_URL=redis://localhost:6379

JWT_SECRET=${JWT_SECRET}
JWT_REFRESH_SECRET=${JWT_REFRESH_SECRET}
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

MINECRAFT_BRIDGE_URL=http://${GAME_VM_IP}:25580
BRIDGE_SECRET=${BRIDGE_SECRET}

NODE_ENV=production
PORT=3000
ENV

chmod 640 "$SERVER_ENV"
chown www-data:www-data "$SERVER_ENV"
log "  .env written to $SERVER_ENV"

# ── 7. PM2 startup ─────────────────────────────────────────────────────────────
log "Step 7/12 — Configuring PM2 systemd startup..."
env PATH="$PATH:/usr/bin" HOME=/var/www \
  pm2 startup systemd -u www-data --hp /var/www 2>&1 | tail -1 || true
systemctl enable pm2-www-data 2>/dev/null || true

# ── 8. Nginx ───────────────────────────────────────────────────────────────────
log "Step 8/12 — Configuring Nginx for $DOMAIN..."
rm -f /etc/nginx/sites-enabled/default

cat > /etc/nginx/sites-available/craftcontrol <<NGINX_CONF
# CraftControl — generated by setup-mgmt-vm.sh
limit_req_zone \$binary_remote_addr zone=api:10m rate=30r/m;

server {
    listen 80;
    server_name ${DOMAIN};

    root /var/www/craftcontrol/public;
    index index.html;

    location / {
        try_files \$uri \$uri/ /index.html;
    }

    location /api/ {
        proxy_pass         http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade      \$http_upgrade;
        proxy_set_header   Connection   'upgrade';
        proxy_set_header   Host         \$host;
        proxy_set_header   X-Real-IP    \$remote_addr;
        proxy_set_header   X-Forwarded-For   \$proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        proxy_read_timeout 30s;
        limit_req          zone=api burst=50 nodelay;
    }

    add_header X-Frame-Options        "SAMEORIGIN"    always;
    add_header X-Content-Type-Options "nosniff"       always;
    add_header Referrer-Policy        "strict-origin"  always;
}
NGINX_CONF

ln -sf /etc/nginx/sites-available/craftcontrol /etc/nginx/sites-enabled/craftcontrol
nginx -t
systemctl enable nginx
systemctl reload nginx
log "  Nginx configured."

# ── 9. SSL / TLS ───────────────────────────────────────────────────────────────
if [[ "$SKIP_SSL" == false ]]; then
  log "Step 9/12 — Obtaining Let's Encrypt certificate for $DOMAIN..."
  certbot --nginx \
    -d "$DOMAIN" \
    --email "$EMAIL" \
    --agree-tos \
    --non-interactive \
    --redirect \
    --hsts
  systemctl enable certbot.timer
  log "  SSL certificate installed. Auto-renewal enabled."
else
  warn "Step 9/12 — Skipping SSL (--skip-ssl). Add TLS before exposing to the internet."
fi

# ── 10. UFW firewall ───────────────────────────────────────────────────────────
log "Step 10/12 — Configuring UFW firewall..."
ufw --force reset  >/dev/null
ufw default deny incoming  >/dev/null
ufw default allow outgoing >/dev/null
ufw allow 22/tcp    comment 'SSH'   >/dev/null
ufw allow 80/tcp    comment 'HTTP'  >/dev/null
ufw allow 443/tcp   comment 'HTTPS' >/dev/null
ufw --force enable >/dev/null
log "  UFW enabled: 22, 80, 443 open."

# ── 11. fail2ban ───────────────────────────────────────────────────────────────
log "Step 11/12 — Enabling fail2ban..."
systemctl enable fail2ban
systemctl start fail2ban

# ── 12. Build, migrate, start ──────────────────────────────────────────────────
log "Step 12/12 — Building application and starting services..."

if [[ -d /var/www/craftcontrol/api/server ]]; then

  # Build API (full npm ci needed — TypeScript is a devDependency)
  log "  Installing API dependencies..."
  cd /var/www/craftcontrol/api/server
  sudo -u www-data npm ci

  log "  Compiling TypeScript..."
  sudo -u www-data npm run build

  # Run migrations; fall back to db push when no migrations directory exists
  log "  Running database migrations..."
  if ls prisma/migrations/*/migration.sql &>/dev/null; then
    sudo -u www-data npx prisma migrate deploy
  else
    warn "  No migrations found — using prisma db push (creates tables from schema)."
    sudo -u www-data npx prisma db push --accept-data-loss
  fi

  # Build client
  log "  Building React panel..."
  cd /var/www/craftcontrol/api/client
  sudo -u www-data npm ci
  sudo -u www-data VITE_API_BASE_URL=/api npm run build
  cp -r dist/. /var/www/craftcontrol/public/

  # Start API with PM2 (--cwd ensures .env is found relative to server/)
  log "  Starting API with PM2..."
  sudo -u www-data pm2 delete craftcontrol-api 2>/dev/null || true
  sudo -u www-data pm2 start /var/www/craftcontrol/api/server/dist/index.js \
    --name craftcontrol-api \
    --cwd  /var/www/craftcontrol/api/server
  sudo -u www-data pm2 save

  log "  API started successfully."
else
  warn "  server/ directory not found — skipping build (repo not cloned yet)."
fi

# ── Verify services ────────────────────────────────────────────────────────────
FAILED=()
for svc in postgresql redis-server nginx fail2ban; do
  systemctl is-active --quiet "$svc" || FAILED+=("$svc")
done

if [[ ${#FAILED[@]} -gt 0 ]]; then
  warn "The following services are NOT running: ${FAILED[*]}"
  warn "Check with: journalctl -u <service> -n 50"
else
  log "All services are running."
fi

# ── Summary ────────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}=================================================================${NC}"
echo -e "${GREEN}  Setup complete!${NC}"
echo -e "${GREEN}=================================================================${NC}"
echo ""
printf "  %-28s %s\n" "Domain:"        "$DOMAIN"
printf "  %-28s %s\n" "DB user:"       "craftcontrol"
printf "  %-28s %s\n" "DB password:"   "$DB_PASS"
printf "  %-28s %s\n" "JWT secret:"    "$JWT_SECRET"
printf "  %-28s %s\n" "JWT refresh:"   "$JWT_REFRESH_SECRET"
printf "  %-28s %s\n" "Bridge secret:" "$BRIDGE_SECRET"
printf "  %-28s %s\n" "Game-VM IP:"    "$GAME_VM_IP"
echo ""
echo -e "${YELLOW}  !! Save these values now — they will not be shown again !!${NC}"
echo ""
echo "  .env location: /var/www/craftcontrol/api/server/.env"
echo ""
echo "  Next steps:"
echo "  1. Copy BRIDGE_SECRET to DiscoPanel → Startup → Environment Variables"
echo "     on your Minecraft server (variable name: BRIDGE_SECRET)"
echo ""
echo "  2. Create your admin account:"
echo "       cd /var/www/craftcontrol/api/server"
echo "       DATABASE_URL=\"postgresql://craftcontrol:${DB_PASS}@localhost:5432/craftcontrol\" \\"
echo "       node -e \""
echo "         const {PrismaClient}=require('@prisma/client');"
echo "         const bcrypt=require('bcryptjs');"
echo "         const p=new PrismaClient();"
echo "         bcrypt.hash('YourPassword',12)"
echo "           .then(h=>p.user.create({data:{email:'admin@example.com',passwordHash:h,role:'SUPER_ADMIN'}}))"
echo "           .then(()=>{console.log('Done');p.\\\$disconnect()});"
echo "       \""
echo ""
if [[ "$SKIP_SSL" == true ]]; then
echo "  3. Open the panel at:  http://${DOMAIN}"
else
echo "  3. Open the panel at:  https://${DOMAIN}"
fi
echo -e "${GREEN}=================================================================${NC}"
