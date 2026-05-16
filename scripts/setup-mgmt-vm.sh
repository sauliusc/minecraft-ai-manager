#!/usr/bin/env bash
# =============================================================================
# CraftControl — mgmt-vm bootstrap script
# Sets up the complete management VM environment in one call.
#
# Usage:
#   sudo bash setup-mgmt-vm.sh --domain panel.example.com \
#                               --email  admin@example.com
#
# Options:
#   --domain   <host>   Public hostname for the web panel (required)
#   --email    <email>  Let's Encrypt notification email (required unless --skip-ssl)
#   --db-pass  <pass>   PostgreSQL password for craftcontrol user (auto-generated if omitted)
#   --skip-ssl          Skip certbot; configure Nginx for plain HTTP only
#   --game-vm  <ip>     Internal IP of game-vm (default: 10.10.10.10)
#
# What this script does:
#   1.  System update
#   2.  Install: Node.js 22 LTS, PostgreSQL 16, Redis 7, Nginx, Certbot, PM2, fail2ban
#   3.  Configure PostgreSQL (create db/user, performance tuning)
#   4.  Configure Redis (memory cap, eviction policy)
#   5.  Set up app directories + ownership
#   6.  Configure PM2 systemd startup
#   7.  Configure Nginx reverse proxy (SPA + /api/ proxy, rate limiting)
#   8.  Obtain Let's Encrypt certificate + enable auto-renewal
#   9.  Configure UFW firewall
#   10. Write .env template with generated secrets
#   11. Enable fail2ban
#   12. Print summary of credentials and next steps
# =============================================================================

set -euo pipefail

# ── Colour helpers ─────────────────────────────────────────────────────────────
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
    --domain)   DOMAIN="$2";    shift 2 ;;
    --email)    EMAIL="$2";     shift 2 ;;
    --db-pass)  DB_PASS="$2";   shift 2 ;;
    --skip-ssl) SKIP_SSL=true;  shift   ;;
    --game-vm)  GAME_VM_IP="$2"; shift 2 ;;
    --repo)     REPO_URL="$2";  shift 2 ;;
    *) err "Unknown option: $1\nUsage: sudo bash setup-mgmt-vm.sh --domain <host> --email <email> [--db-pass <pass>] [--skip-ssl] [--game-vm <ip>] [--repo <git-url>]" ;;
  esac
done

[[ -n "$DOMAIN" ]] || err "--domain is required."
[[ "$SKIP_SSL" == true || -n "$EMAIL" ]] || err "--email is required unless --skip-ssl is set."
[[ $EUID -eq 0 ]] || err "Run as root: sudo bash $0"

# Auto-generate DB password if not provided
if [[ -z "$DB_PASS" ]]; then
  DB_PASS=$(openssl rand -hex 24)
  warn "No --db-pass supplied. Generated: $DB_PASS"
fi

# Pre-generate secrets (used in .env at the end)
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

# PostgreSQL 16 via official APT repo
if ! command -v psql &>/dev/null; then
  log "  Adding PostgreSQL 16 APT repository..."
  curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc \
    | gpg --dearmor -o /etc/apt/trusted.gpg.d/postgresql.gpg
  echo "deb https://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" \
    > /etc/apt/sources.list.d/pgdg.list
  apt-get update -qq
fi
apt-get install -y -qq postgresql-16

# Node.js 22 LTS via NodeSource
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

# Create user + database (idempotent)
sudo -u postgres psql -tc \
  "SELECT 1 FROM pg_roles WHERE rolname='craftcontrol'" | grep -q 1 \
  || sudo -u postgres psql -c "CREATE USER craftcontrol WITH PASSWORD '$DB_PASS';"

sudo -u postgres psql -tc \
  "SELECT 1 FROM pg_database WHERE datname='craftcontrol'" | grep -q 1 \
  || sudo -u postgres psql -c "CREATE DATABASE craftcontrol OWNER craftcontrol;"

sudo -u postgres psql -c \
  "GRANT ALL PRIVILEGES ON DATABASE craftcontrol TO craftcontrol;"

# Performance tuning (safe defaults for 6 GB RAM)
PG_CONF=/etc/postgresql/16/main/postgresql.conf
declare -A PG_SETTINGS=(
  ["shared_buffers"]="1536MB"
  ["effective_cache_size"]="4GB"
  ["work_mem"]="16MB"
  ["maintenance_work_mem"]="256MB"
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

# Ensure maxmemory and eviction are set
grep -q "^maxmemory " "$REDIS_CONF" \
  && sed -i "s|^maxmemory .*|maxmemory 512mb|" "$REDIS_CONF" \
  || echo "maxmemory 512mb" >> "$REDIS_CONF"

grep -q "^maxmemory-policy " "$REDIS_CONF" \
  && sed -i "s|^maxmemory-policy .*|maxmemory-policy allkeys-lru|" "$REDIS_CONF" \
  || echo "maxmemory-policy allkeys-lru" >> "$REDIS_CONF"

systemctl enable redis-server
systemctl restart redis-server
log "  Redis configured and running."

# ── 5. App directories + code ──────────────────────────────────────────────────
log "Step 5/12 — Creating application directories..."
mkdir -p /var/www/craftcontrol/public
mkdir -p /var/backups/craftcontrol

if [[ -n "$REPO_URL" ]]; then
  if [[ -d /var/www/craftcontrol/api/.git ]]; then
    log "  Repo already cloned — pulling latest..."
    sudo -u www-data git -C /var/www/craftcontrol/api pull --ff-only
  else
    log "  Cloning repository from $REPO_URL..."
    sudo -u www-data git clone "$REPO_URL" /var/www/craftcontrol/api
  fi
else
  mkdir -p /var/www/craftcontrol/api
  warn "No --repo supplied. Code directory created but empty."
  warn "Clone manually: sudo -u www-data git clone <your-repo-url> /var/www/craftcontrol/api"
fi

chown -R www-data:www-data /var/www/craftcontrol
chmod 750 /var/www/craftcontrol/api  # restrict .env from other users

# ── 6. PM2 startup ─────────────────────────────────────────────────────────────
log "Step 6/12 — Configuring PM2 systemd startup..."
env PATH="$PATH:/usr/bin" \
  pm2 startup systemd -u www-data --hp /var/www 2>&1 | tail -1
systemctl enable pm2-www-data 2>/dev/null || true

# ── 7. Nginx ───────────────────────────────────────────────────────────────────
log "Step 7/12 — Configuring Nginx for $DOMAIN..."
rm -f /etc/nginx/sites-enabled/default

cat > /etc/nginx/sites-available/craftcontrol <<NGINX_CONF
# CraftControl — generated by setup-mgmt-vm.sh
limit_req_zone \$binary_remote_addr zone=api:10m rate=30r/m;

server {
    listen 80;
    server_name ${DOMAIN};

    root /var/www/craftcontrol/public;
    index index.html;

    # React SPA — client-side routing fallback
    location / {
        try_files \$uri \$uri/ /index.html;
    }

    # Node.js API reverse proxy
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

    # Security headers (applied even on HTTP; certbot will upgrade to HTTPS)
    add_header X-Frame-Options       "SAMEORIGIN"   always;
    add_header X-Content-Type-Options "nosniff"     always;
    add_header Referrer-Policy       "strict-origin" always;
}
NGINX_CONF

ln -sf /etc/nginx/sites-available/craftcontrol /etc/nginx/sites-enabled/craftcontrol
nginx -t
systemctl enable nginx
systemctl reload nginx
log "  Nginx configured."

# ── 8. SSL / TLS ───────────────────────────────────────────────────────────────
if [[ "$SKIP_SSL" == false ]]; then
  log "Step 8/12 — Obtaining Let's Encrypt certificate for $DOMAIN..."
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
  warn "Step 8/12 — Skipping SSL (--skip-ssl). Configure TLS manually before production use."
fi

# ── 9. UFW firewall ────────────────────────────────────────────────────────────
log "Step 9/12 — Configuring UFW firewall..."
ufw --force reset  >/dev/null
ufw default deny incoming  >/dev/null
ufw default allow outgoing >/dev/null
ufw allow 22/tcp    comment 'SSH'        >/dev/null
ufw allow 80/tcp    comment 'HTTP'       >/dev/null
ufw allow 443/tcp   comment 'HTTPS'      >/dev/null
# Node.js API port is localhost-only — no UFW rule needed
ufw --force enable >/dev/null
log "  UFW enabled: 22, 80, 443 open. All other inbound blocked."

# ── 10. .env file ──────────────────────────────────────────────────────────────
log "Step 10/12 — Writing /var/www/craftcontrol/api/.env..."
cat > /var/www/craftcontrol/api/.env <<ENV
# CraftControl — generated by setup-mgmt-vm.sh on $(date -u +"%Y-%m-%dT%H:%M:%SZ")
# DO NOT commit this file to version control.

DATABASE_URL=postgresql://craftcontrol:${DB_PASS}@localhost:5432/craftcontrol
REDIS_URL=redis://localhost:6379

JWT_SECRET=${JWT_SECRET}
JWT_REFRESH_SECRET=${JWT_REFRESH_SECRET}

MINECRAFT_BRIDGE_URL=http://${GAME_VM_IP}:25580
MINECRAFT_BRIDGE_SECRET=${BRIDGE_SECRET}

NODE_ENV=production
PORT=3000
ENV

chmod 640 /var/www/craftcontrol/api/.env
chown www-data:www-data /var/www/craftcontrol/api/.env
log "  .env written (permissions: 640, owner: www-data)."

# ── 11. fail2ban ───────────────────────────────────────────────────────────────
log "Step 11/12 — Enabling fail2ban..."
systemctl enable fail2ban
systemctl start fail2ban

# ── 12. Verification ───────────────────────────────────────────────────────────
log "Step 12/12 — Verifying services..."
FAILED=()
for svc in postgresql redis-server nginx fail2ban; do
  systemctl is-active --quiet "$svc" || FAILED+=("$svc")
done

if [[ ${#FAILED[@]} -gt 0 ]]; then
  warn "The following services are NOT running: ${FAILED[*]}"
  warn "Check logs with: journalctl -u <service> -n 50"
else
  log "All services are running."
fi

# ── Summary ────────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}=================================================================${NC}"
echo -e "${GREEN}  mgmt-vm setup complete!${NC}"
echo -e "${GREEN}=================================================================${NC}"
echo ""
printf "  %-28s %s\n" "Domain:"          "$DOMAIN"
printf "  %-28s %s\n" "DB user:"         "craftcontrol"
printf "  %-28s %s\n" "DB password:"     "$DB_PASS"
printf "  %-28s %s\n" "JWT secret:"      "$JWT_SECRET"
printf "  %-28s %s\n" "JWT refresh:"     "$JWT_REFRESH_SECRET"
printf "  %-28s %s\n" "Bridge secret:"   "$BRIDGE_SECRET"
printf "  %-28s %s\n" "Game-VM IP:"      "$GAME_VM_IP"
echo ""
echo -e "${YELLOW}  !! Save these values now — they will not be shown again !!${NC}"
echo ""
echo "  .env location:  /var/www/craftcontrol/api/.env"
echo ""
echo "  Next steps:"
echo "  1. Copy BRIDGE_SECRET to DiscoPanel env vars on game-vm (BRIDGE_SECRET variable)"
echo ""
if [[ -z "$REPO_URL" ]]; then
echo "  2. Clone the repo (--repo was not supplied — do this manually):"
echo "       sudo -u www-data git clone <your-repo-url> /var/www/craftcontrol/api"
echo ""
else
echo "  2. Code already cloned to /var/www/craftcontrol/api"
echo ""
fi
echo "  3. Build and start the API:"
echo "       cd /var/www/craftcontrol/api/server"
echo "       sudo -u www-data npm ci --omit=dev"
echo "       sudo -u www-data npm run build"
echo "       sudo -u www-data npx prisma migrate deploy"
echo "       sudo -u www-data pm2 start dist/index.js --name craftcontrol-api"
echo "       sudo -u www-data pm2 save"
echo ""
echo "  4. Build and deploy the React panel:"
echo "       cd /var/www/craftcontrol/api/client"
echo "       sudo -u www-data npm ci"
echo "       sudo -u www-data VITE_API_BASE_URL=/api npm run build"
echo "       sudo cp -r dist/. /var/www/craftcontrol/public/"
echo ""
if [[ "$SKIP_SSL" == true ]]; then
echo "  5. Open the panel at:  http://${DOMAIN}"
else
echo "  5. Open the panel at:  https://${DOMAIN}"
fi
echo -e "${GREEN}=================================================================${NC}"
