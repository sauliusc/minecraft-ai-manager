#!/usr/bin/env bash
# backup.sh — Dump PostgreSQL to a timestamped file in ./backups/
set -euo pipefail

GREEN='\033[0;32m'; BOLD='\033[1m'; RESET='\033[0m'
ok()   { echo -e "  ${GREEN}✓${RESET} $*"; }
step() { echo -e "\n${BOLD}▶ $*${RESET}"; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_DIR="$(dirname "$SCRIPT_DIR")"
ENV_FILE="$DEPLOY_DIR/.env"

source "$ENV_FILE"

BACKUP_DIR="$DEPLOY_DIR/backups"
mkdir -p "$BACKUP_DIR"

TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="$BACKUP_DIR/craftcontrol_${TIMESTAMP}.sql.gz"

step "Backing up PostgreSQL database"

docker compose --env-file "$ENV_FILE" -f "$DEPLOY_DIR/docker-compose.yml" \
  exec -T db pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" \
  | gzip > "$BACKUP_FILE"

ok "Backup saved → ${BACKUP_FILE}"

# ── Prune old backups (keep last 14) ─────────────────────────────────────────
KEPT=14
TOTAL=$(ls "$BACKUP_DIR"/*.sql.gz 2>/dev/null | wc -l)
if [[ $TOTAL -gt $KEPT ]]; then
  ls -t "$BACKUP_DIR"/*.sql.gz | tail -n +$((KEPT + 1)) | xargs rm -f
  ok "Pruned old backups (keeping latest ${KEPT})"
fi

echo ""
echo -e "${GREEN}${BOLD}Backup complete!${RESET}"
echo -e "  File: ${BOLD}${BACKUP_FILE}${RESET}"
echo -e "  Size: $(du -sh "$BACKUP_FILE" | cut -f1)"
echo ""
