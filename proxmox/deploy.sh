#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════════
#  CraftControl — Proxmox one-click LXC deployment
#
#  Run on the Proxmox host root shell:
#    bash proxmox/deploy.sh
#
#  Override defaults with environment variables before running:
#    CTID=150 CT_RAM=8192 bash proxmox/deploy.sh
# ═══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

# ─── Tunables ──────────────────────────────────────────────────────────────────
CTID="${CTID:-200}"                   # LXC container ID
CT_HOSTNAME="${CT_HOSTNAME:-craftcontrol}"
CT_DISK="${CT_DISK:-32}"              # GB  (Docker images + Minecraft data)
CT_RAM="${CT_RAM:-6144}"              # MB  (4 GB Minecraft JVM + services)
CT_SWAP="${CT_SWAP:-2048}"            # MB
CT_CORES="${CT_CORES:-4}"
STORAGE="${STORAGE:-local-lvm}"       # Proxmox storage for the rootfs
TPL_STORAGE="${TPL_STORAGE:-local}"   # Proxmox storage for templates
BRIDGE="${BRIDGE:-vmbr0}"

# First-run admin account (change password after first login)
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@example.com}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-changeme123}"

# ─── Colours ───────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; BOLD='\033[1m'; NC='\033[0m'
log()  { echo -e "${GREEN}[+]${NC} $*"; }
warn() { echo -e "${YELLOW}[!]${NC} $*"; }
die()  { echo -e "${RED}[✗]${NC} $*" >&2; exit 1; }
hdr()  { echo -e "\n${BOLD}${BLUE}══ $* ══${NC}"; }

# ─── Pre-flight checks ─────────────────────────────────────────────────────────
hdr "Pre-flight checks"

[[ $EUID -ne 0 ]]           && die "Must run as root on the Proxmox host"
command -v pct   &>/dev/null || die "pct not found — run this on the Proxmox host"
command -v pveam &>/dev/null || die "pveam not found — run this on the Proxmox host"
command -v openssl &>/dev/null || die "openssl not found (apt install openssl)"

# Check container ID is free
if pct status "$CTID" &>/dev/null; then
  die "Container $CTID already exists. Delete it first (pct destroy $CTID) or set CTID=<other_id>"
fi

# Check thin pool space (warn if > 80% full — 100% caused previous failures)
if command -v lvs &>/dev/null; then
  POOL_USAGE=$(lvs --noheadings -o data_percent pve/data 2>/dev/null | tr -d ' ' | head -1 || echo "0")
  if [[ -n "$POOL_USAGE" && "$POOL_USAGE" != "0" ]]; then
    INT_USAGE=${POOL_USAGE%%.*}
    if (( INT_USAGE > 80 )); then
      die "LVM thin pool is ${POOL_USAGE}% full. Free space before deploying (containers need ~20 GB)."
    elif (( INT_USAGE > 65 )); then
      warn "LVM thin pool is ${POOL_USAGE}% full. Continuing, but monitor space."
    fi
  fi
fi

log "CTID=$CTID  disk=${CT_DISK}G  ram=${CT_RAM}MB  storage=$STORAGE"

# ─── Debian 12 template ────────────────────────────────────────────────────────
hdr "Preparing Debian 12 template"

log "Refreshing template list..."
pveam update 2>&1 | tail -1

TEMPLATE=$(pveam available --section system 2>/dev/null \
  | awk '/debian-12-standard/ {print $2}' \
  | sort -V | tail -1)
[[ -z "$TEMPLATE" ]] && die "No debian-12-standard template found. Check: pveam available --section system"

# Download only if not already cached
if pveam list "$TPL_STORAGE" 2>/dev/null | grep -q "$TEMPLATE"; then
  log "Template already cached: $TEMPLATE"
else
  log "Downloading template: $TEMPLATE"
  pveam download "$TPL_STORAGE" "$TEMPLATE"
fi

# ─── Create LXC container ──────────────────────────────────────────────────────
hdr "Creating container CT${CTID}"

# Using privileged container for reliable Docker support.
# nesting=1 enables overlay filesystem inside the container.
pct create "$CTID" "${TPL_STORAGE}:vztmpl/${TEMPLATE}" \
  --hostname   "$CT_HOSTNAME" \
  --cores      "$CT_CORES" \
  --memory     "$CT_RAM" \
  --swap       "$CT_SWAP" \
  --rootfs     "${STORAGE}:${CT_DISK}" \
  --net0       "name=eth0,bridge=${BRIDGE},ip=dhcp,ip6=dhcp,firewall=1" \
  --ostype     debian \
  --unprivileged 0 \
  --features   "nesting=1" \
  --onboot     1

log "Starting container..."
pct start "$CTID"

# Wait for networking to come up
log "Waiting for container network..."
for i in $(seq 1 30); do
  if pct exec "$CTID" -- ping -c1 -W2 8.8.8.8 &>/dev/null; then break; fi
  sleep 2
done
pct exec "$CTID" -- ping -c1 8.8.8.8 &>/dev/null || die "Container has no internet access. Check bridge/firewall settings."

# ─── Install Docker ────────────────────────────────────────────────────────────
hdr "Installing Docker"

pct exec "$CTID" -- bash -s << 'DOCKER_INSTALL'
set -e
export DEBIAN_FRONTEND=noninteractive

apt-get update -qq
apt-get install -y -qq curl ca-certificates gnupg

install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/debian/gpg \
  | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg

echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
  https://download.docker.com/linux/debian bookworm stable" \
  > /etc/apt/sources.list.d/docker.list

apt-get update -qq
apt-get install -y -qq \
  docker-ce docker-ce-cli containerd.io \
  docker-buildx-plugin docker-compose-plugin

systemctl enable --now docker
docker --version
docker compose version
DOCKER_INSTALL

# ─── Generate secrets ──────────────────────────────────────────────────────────
hdr "Generating secrets"

POSTGRES_PASSWORD=$(openssl rand -hex 20)
REDIS_PASSWORD=$(openssl rand -hex 20)
JWT_SECRET=$(openssl rand -hex 32)
JWT_REFRESH_SECRET=$(openssl rand -hex 32)
BRIDGE_SECRET=$(openssl rand -hex 16)
RCON_PASSWORD=$(openssl rand -hex 12)

log "All secrets generated."

# ─── Write deployment files ────────────────────────────────────────────────────
hdr "Writing deployment files"

pct exec "$CTID" -- mkdir -p /opt/craftcontrol

# docker-compose.yml
tmpfile=$(mktemp)
cat > "$tmpfile" << 'COMPOSE'
# One-click deployment — uses pre-built images from GitHub Container Registry.
# Start:  docker compose up -d
# Logs:   docker compose logs -f
# Stop:   docker compose down

services:

  db:
    image: postgres:16-alpine
    restart: unless-stopped
    volumes:
      - postgres_data:/var/lib/postgresql/data
    environment:
      POSTGRES_DB:       ${POSTGRES_DB}
      POSTGRES_USER:     ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER} -d ${POSTGRES_DB}"]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 20s

  redis:
    image: redis:7-alpine
    restart: unless-stopped
    command: >
      redis-server
      --requirepass ${REDIS_PASSWORD}
      --maxmemory 256mb
      --maxmemory-policy allkeys-lru
    volumes:
      - redis_data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "-a", "${REDIS_PASSWORD}", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 10s

  api:
    image: ghcr.io/sauliusc/minecraft-ai-manager/api:latest
    restart: unless-stopped
    depends_on:
      db:
        condition: service_healthy
      redis:
        condition: service_healthy
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
    environment:
      NODE_ENV:               production
      PORT:                   3000
      DATABASE_URL:           postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@db:5432/${POSTGRES_DB}
      REDIS_URL:              redis://:${REDIS_PASSWORD}@redis:6379
      JWT_SECRET:             ${JWT_SECRET}
      JWT_REFRESH_SECRET:     ${JWT_REFRESH_SECRET}
      JWT_EXPIRES_IN:         ${JWT_EXPIRES_IN:-15m}
      JWT_REFRESH_EXPIRES_IN: ${JWT_REFRESH_EXPIRES_IN:-7d}
      BRIDGE_SECRET:          ${BRIDGE_SECRET}
      MINECRAFT_BRIDGE_URL:   http://minecraft:25580
      MINECRAFT_HOST:         minecraft
      RCON_PORT:              ${RCON_PORT:-25575}
      RCON_PASSWORD:          ${RCON_PASSWORD}
      ADMIN_EMAIL:            ${ADMIN_EMAIL:-}
      ADMIN_PASSWORD:         ${ADMIN_PASSWORD:-}
    healthcheck:
      test: ["CMD-SHELL", "wget -qO- http://localhost:3000/api/health || exit 1"]
      interval: 30s
      timeout: 10s
      start_period: 60s
      retries: 3

  web:
    image: ghcr.io/sauliusc/minecraft-ai-manager/web:latest
    restart: unless-stopped
    depends_on:
      api:
        condition: service_healthy
    ports:
      - "${HTTP_PORT:-80}:80"

  minecraft:
    image: ghcr.io/sauliusc/minecraft-ai-manager/minecraft:latest
    restart: unless-stopped
    depends_on:
      api:
        condition: service_healthy
    ports:
      - "25565:25565"
    volumes:
      - minecraft_data:/data
    environment:
      EULA:          "TRUE"
      TYPE:          PAPER
      VERSION:       "1.21.4"
      MEMORY:        ${MINECRAFT_MEMORY:-4G}
      ENABLE_RCON:   "true"
      RCON_PORT:     ${RCON_PORT:-25575}
      RCON_PASSWORD: ${RCON_PASSWORD}
      BRIDGE_SECRET: ${BRIDGE_SECRET}
    healthcheck:
      test: ["CMD-SHELL", "mc-monitor status --host localhost --port 25565 || exit 1"]
      interval: 30s
      timeout: 10s
      retries: 5
      start_period: 120s

volumes:
  postgres_data:
  redis_data:
  minecraft_data:
COMPOSE
pct push "$CTID" "$tmpfile" /opt/craftcontrol/docker-compose.yml
rm -f "$tmpfile"

# .env
tmpfile=$(mktemp)
cat > "$tmpfile" << ENV
# ═══════════════════════════════════════════════════════════════
#  CraftControl — generated by proxmox/deploy.sh
#  Change ADMIN_EMAIL / ADMIN_PASSWORD, then re-run:
#    docker compose up -d
# ═══════════════════════════════════════════════════════════════

HTTP_PORT=80

POSTGRES_DB=craftcontrol
POSTGRES_USER=craftcontrol
POSTGRES_PASSWORD=${POSTGRES_PASSWORD}

REDIS_PASSWORD=${REDIS_PASSWORD}

JWT_SECRET=${JWT_SECRET}
JWT_REFRESH_SECRET=${JWT_REFRESH_SECRET}
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

BRIDGE_SECRET=${BRIDGE_SECRET}

MINECRAFT_MEMORY=4G
RCON_PORT=25575
RCON_PASSWORD=${RCON_PASSWORD}

ADMIN_EMAIL=${ADMIN_EMAIL}
ADMIN_PASSWORD=${ADMIN_PASSWORD}
ENV
pct push "$CTID" "$tmpfile" /opt/craftcontrol/.env
chmod 600 /tmp/"$(basename "$tmpfile")" 2>/dev/null || true
rm -f "$tmpfile"

log "Files written to /opt/craftcontrol/"

# ─── Pull images and start ─────────────────────────────────────────────────────
hdr "Pulling images and starting services"
warn "This may take several minutes depending on your connection speed..."

pct exec "$CTID" -- bash -s << 'START'
set -e
cd /opt/craftcontrol
docker compose pull
docker compose up -d
echo ""
echo "Waiting for services to become healthy..."
sleep 15
docker compose ps
START

# ─── Done ─────────────────────────────────────────────────────────────────────
hdr "Deployment complete"

CT_IP=$(pct exec "$CTID" -- hostname -I 2>/dev/null | awk '{print $1}' || echo "<container-ip>")

echo -e ""
echo -e "  ${BOLD}Web panel:${NC}   ${BLUE}http://${CT_IP}${NC}"
echo -e "  ${BOLD}Minecraft:${NC}   ${CT_IP}:25565"
echo -e "  ${BOLD}Container:${NC}   pct enter ${CTID}"
echo -e "  ${BOLD}Logs:${NC}        pct exec ${CTID} -- docker compose -f /opt/craftcontrol/docker-compose.yml logs -f"
echo -e ""
echo -e "  ${BOLD}Admin login:${NC} ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}"
echo -e "  ${YELLOW}Change the admin password immediately after first login.${NC}"
echo -e ""
echo -e "  Credentials saved to: /opt/craftcontrol/.env  (inside CT${CTID})"
