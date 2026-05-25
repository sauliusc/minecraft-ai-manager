#!/usr/bin/env bash
# deploy.sh — Pull pre-built images from GHCR and start all services.
# Images are built by GitHub Actions and pushed to ghcr.io before this runs.
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

# IMAGE_TAG is passed in from the CI deploy job (short git SHA).
# Fall back to 'latest' for manual runs.
IMAGE_TAG="${IMAGE_TAG:-latest}"

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

# ── Save version for rollback ─────────────────────────────────────────────────
if [[ -f "$VERSION_FILE" ]]; then
  cp "$VERSION_FILE" "$DEPLOY_DIR/.previous-version"
fi
echo "$IMAGE_TAG" > "$VERSION_FILE"

export IMAGE_TAG

# ── Pull images from GHCR ─────────────────────────────────────────────────────
step "Pulling Docker images from GHCR  [tag: ${IMAGE_TAG}]"
docker compose --env-file "$ENV_FILE" -f "$DEPLOY_DIR/docker-compose.yml" pull
ok "Images pulled"

# ── Start services ────────────────────────────────────────────────────────────
step "Starting services"
docker compose --env-file "$ENV_FILE" -f "$DEPLOY_DIR/docker-compose.yml" \
  up -d --remove-orphans
ok "Services started"

# ── Wait for database ─────────────────────────────────────────────────────────
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

# ── Run migrations ────────────────────────────────────────────────────────────
step "Running database migrations"

# Baseline: if the DB has schema but no migration history (P3005 — happens on first
# deploy after the project switched from db push to migrate), auto-mark every
# migration as applied so migrate deploy doesn't fail.
MIGRATE_STATUS=$(docker compose --env-file "$ENV_FILE" -f "$DEPLOY_DIR/docker-compose.yml" \
  exec -T api npx prisma migrate status 2>&1 || true)

if echo "$MIGRATE_STATUS" | grep -q "P3005"; then
  warn "DB schema exists with no migration history — baselining all migrations..."
  # List migration directories from inside the container
  MIGRATIONS=$(docker compose --env-file "$ENV_FILE" -f "$DEPLOY_DIR/docker-compose.yml" \
    exec -T api sh -c "ls prisma/migrations/ 2>/dev/null" | grep -E '^[0-9]' || true)
  for migration_name in $MIGRATIONS; do
    info "Baselining: $migration_name"
    docker compose --env-file "$ENV_FILE" -f "$DEPLOY_DIR/docker-compose.yml" \
      exec -T api npx prisma migrate resolve --applied "$migration_name"
  done
  ok "Baseline complete"
fi

# Run migrations; P3009 (a previous migration left a "failed" record in _prisma_migrations)
# only surfaces in `migrate deploy` output — not in `migrate status` — so we catch it here.
# Migrations use IF NOT EXISTS DDL, so re-running after resolving as rolled-back is safe.
_run_migrate_deploy() {
  docker compose --env-file "$ENV_FILE" -f "$DEPLOY_DIR/docker-compose.yml" \
    exec -T api npx prisma migrate deploy
}

if ! DEPLOY_OUT=$(_run_migrate_deploy 2>&1); then
  printf '%s\n' "$DEPLOY_OUT"
  if echo "$DEPLOY_OUT" | grep -q "P3009"; then
    warn "P3009: failed migration record detected — resolving and retrying..."
    while IFS= read -r failed_name; do
      [[ -z "$failed_name" ]] && continue
      info "Resolving failed migration: $failed_name"
      docker compose --env-file "$ENV_FILE" -f "$DEPLOY_DIR/docker-compose.yml" \
        exec -T api npx prisma migrate resolve --rolled-back "$failed_name" || true
    done < <(echo "$DEPLOY_OUT" | grep -oP "(?<=The \`)[^\`]+(?=\` migration started at)" || true)
    ok "Resolved — retrying migrations..."
    _run_migrate_deploy
  else
    exit 1
  fi
fi
ok "Migrations applied"

# ── Wait for API health ───────────────────────────────────────────────────────
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

# ── Record deployment in update history ───────────────────────────────────────
step "Recording deployment"
BRIDGE_SECRET_VAL=$(grep '^BRIDGE_SECRET=' "$ENV_FILE" | cut -d= -f2-)
ACTOR="${TRIGGERED_BY:-ci}"
NOTES="${DEPLOY_NOTES:-}"
docker compose --env-file "$ENV_FILE" -f "$DEPLOY_DIR/docker-compose.yml" \
  exec -T \
  -e CC_IMAGE_TAG="${IMAGE_TAG}" \
  -e CC_ACTOR="${ACTOR}" \
  -e CC_NOTES="${NOTES}" \
  -e CC_SECRET="${BRIDGE_SECRET_VAL}" \
  api node -e "
    const http = require('http');
    const body = JSON.stringify({imageTag:process.env.CC_IMAGE_TAG,triggeredBy:process.env.CC_ACTOR,action:'deploy',notes:process.env.CC_NOTES||undefined});
    const req = http.request({hostname:'localhost',port:3000,path:'/api/deployments',method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+process.env.CC_SECRET,'Content-Length':Buffer.byteLength(body)}},r=>{process.exit(r.statusCode>=200&&r.statusCode<300?0:1)});
    req.on('error',()=>process.exit(1));req.write(body);req.end();
  " && ok "Deployment recorded" || warn "Failed to record deployment (non-fatal)"

# ── Summary ───────────────────────────────────────────────────────────────────
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
