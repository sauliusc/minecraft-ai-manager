#!/usr/bin/env bash
# rollback.sh — Switch back to the previous deployed version.
# Usage: make rollback   OR   bash scripts/rollback.sh
set -euo pipefail

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'
BOLD='\033[1m'; RESET='\033[0m'

ok()    { echo -e "  ${GREEN}✓${RESET} $*"; }
step()  { echo -e "\n${BOLD}▶ $*${RESET}"; }
err()   { echo -e "  ${RED}✗ ERROR:${RESET} $*" >&2; }
warn()  { echo -e "  ${YELLOW}⚠${RESET} $*"; }

SILENT="${1:-}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_DIR="$(dirname "$SCRIPT_DIR")"
ENV_FILE="$DEPLOY_DIR/.env"
PREV_VERSION_FILE="$DEPLOY_DIR/.previous-version"

if [[ "$SILENT" != "--silent" ]]; then
  echo ""
  echo -e "${BOLD}════ Rolling back deployment ════════════════════${RESET}"
fi

# ── Check a previous version exists ─────────────────────────────────────────
if [[ ! -f "$PREV_VERSION_FILE" ]]; then
  err "No previous version found. Cannot rollback."
  warn "This is likely the first ever deployment."
  exit 1
fi

PREV_TAG=$(cat "$PREV_VERSION_FILE")
step "Rolling back to version: ${PREV_TAG}"

# ── Switch images back ───────────────────────────────────────────────────────
ROLLED_BACK=0
for svc in api web mcp minecraft; do
  img="craftcontrol-${svc}"
  if docker image inspect "${img}:previous" &>/dev/null; then
    docker tag "${img}:previous" "${img}:latest"
    ok "Restored ${img}"
    ROLLED_BACK=$((ROLLED_BACK + 1))
  else
    warn "No 'previous' image found for ${img}, skipping."
  fi
done

if [[ $ROLLED_BACK -eq 0 ]]; then
  err "No previous images were found. Rollback cannot proceed."
  exit 1
fi

# ── Restart containers with the old images ──────────────────────────────────
step "Restarting services with previous images"
docker compose --env-file "$ENV_FILE" -f "$DEPLOY_DIR/docker-compose.yml" \
  up -d --remove-orphans
ok "Services restarted"

# ── Swap version files ───────────────────────────────────────────────────────
CURRENT_VERSION_FILE="$DEPLOY_DIR/.deployed-version"
if [[ -f "$CURRENT_VERSION_FILE" ]]; then
  cp "$CURRENT_VERSION_FILE" "$DEPLOY_DIR/.rolled-back-from"
fi
cp "$PREV_VERSION_FILE" "$CURRENT_VERSION_FILE"

echo ""
echo -e "${GREEN}${BOLD}════ Rollback complete! ════════════════════════${RESET}"
echo -e "  Restored to version: ${BOLD}${PREV_TAG}${RESET}"
echo ""
warn "Note: database migrations are NOT reversed automatically."
warn "If the migration was destructive, restore from a backup: make restore"
echo ""
