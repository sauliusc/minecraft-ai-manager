#!/usr/bin/env bash
# deploy.sh — Build, migrate, and start all services.
# Safe to run on first deploy AND on every update.
set -euo pipefail

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'
CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'

ok()    { echo -e "  ${GREEN}✓${RESET} $*"; }
step()  { echo -e "\n${BOLD}▶ $*${RESET}"; }
err()   { echo -e "  ${RED}✗ ERROR:${RESET} $*" >&2; }
warn()  { echo -e "  ${YELLOW}⚠${RESET} $*"; }
info()  { echo -e "  ${CYAN}ℹ${RESET} $*"; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_DIR="$(dirname "$SCRIPT_DIR")"
ENV_FILE="$DEPLOY_DIR/.env"
VERSION_FILE="$DEPLOY_DIR/.deployed-version"

# ── Sanity checks ────────────────────────────────────────────────────────────
step "Pre-flight checks"

if [[ ! -f "$ENV_FILE" ]]; then
  err ".env not found. Run 'make setup' first."
  exit 1
fi
ok ".env found"

if ! docker info &>/dev/null; then
  err "Docker daemon is not running."
  exit 1
fi
ok "Docker daemon is running"

# ── Tag current version for rollback ─────────────────────────────────────────
CURRENT_TAG=$(git -C "$DEPLOY_DIR/.." rev-parse --short HEAD 2>/dev/null || echo "unknown")
IMAGE_TAG="${CURRENT_TAG}"

# Save previous deployed version for rollback
if [[ -f "$VERSION_FILE" ]]; then
  cp "$VERSION_FILE" "$DEPLOY_DIR/.previous-version"
fi
echo "$IMAGE_TAG" > "$VERSION_FILE"

# Export IMAGE_TAG so docker compose picks it up
export IMAGE_TAG

step "Building Docker images  [tag: ${IMAGE_TAG}]"
docker compose --env-file "$ENV_FILE" -f "$DEPLOY_DIR/docker-compose.yml" \
  build --pull 2>&1 | grep -E "(Step|Successfully|ERROR|=>)" || true
ok "Images built"

# ── Tag images as 'previous' before replacing 'latest' ───────────────────────
for svc in api web mcp minecraft; do
  img="craftcontrol-${svc}"
  if docker image inspect "${img}:latest" &>/dev/null; then
    docker tag "${img}:latest" "${img}:previous" 2>/dev/null || true
  fi
  docker tag "${img}:${IMAGE_TAG}" "${img}:latest" 2>/dev/null || true
done

step "Starting services"
docker compose --env-file "$ENV_FILE" -f "$DEPLOY_DIR/docker-compose.yml" \
  up -d --remove-orphans
ok "Services started"

step "Waiting for database to be ready"
RETRIES=20
until docker compose --env-file "$ENV_FILE" -f "$DEPLOY_DIR/docker-compose.yml" \
    exec -T db pg_isready -q 2>/dev/null; do
  RETRIES=$((RETRIES - 1))
  if [[ $RETRIES -le 0 ]]; then
    err "Database did not become ready in time."
    bash "$SCRIPT_DIR/rollback.sh" --silent
    exit 1
  fi
  sleep 3
done
ok "Database is ready"

step "Running database migrations"
docker compose --env-file "$ENV_FILE" -f "$DEPLOY_DIR/docker-compose.yml" \
  exec -T api npx prisma migrate deploy
ok "Migrations applied"

step "Waiting for API health check"
RETRIES=24   # 24 × 5s = 2 minutes
until docker compose --env-file "$ENV_FILE" -f "$DEPLOY_DIR/docker-compose.yml" \
    exec -T api wget -qO- http://localhost:3000/api/health &>/dev/null; do
  RETRIES=$((RETRIES - 1))
  if [[ $RETRIES -le 0 ]]; then
    err "API health check failed after 2 minutes."
    warn "Check logs: make logs"
    bash "$SCRIPT_DIR/rollback.sh" --silent
    exit 1
  fi
  sleep 5
done
ok "API is healthy"

# ── Print summary ─────────────────────────────────────────────────────────────
source "$ENV_FILE"
HTTP_PORT="${HTTP_PORT:-80}"

echo ""
echo -e "${GREEN}${BOLD}════ Deployment complete! ══════════════════════${RESET}"
echo ""
echo -e "  Web panel:   ${BOLD}http://$(hostname -I | awk '{print $1}'):${HTTP_PORT}${RESET}"
echo -e "  Version:     ${BOLD}${IMAGE_TAG}${RESET}"
echo ""
echo -e "  Useful commands:"
echo -e "    make logs       — tail all logs"
echo -e "    make status     — show running containers"
echo -e "    make rollback   — revert to previous version"
echo ""
