#!/usr/bin/env bash
# restore.sh — Restore PostgreSQL from a backup file.
# Usage: make restore BACKUP=backups/craftcontrol_20240101_120000.sql.gz
set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BOLD='\033[1m'; RESET='\033[0m'

ok()   { echo -e "  ${GREEN}✓${RESET} $*"; }
step() { echo -e "\n${BOLD}▶ $*${RESET}"; }
err()  { echo -e "  ${RED}✗ ERROR:${RESET} $*" >&2; exit 1; }
warn() { echo -e "  ${YELLOW}⚠${RESET} $*"; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_DIR="$(dirname "$SCRIPT_DIR")"
ENV_FILE="$DEPLOY_DIR/.env"

BACKUP_FILE="${BACKUP:-}"

if [[ -z "$BACKUP_FILE" ]]; then
  # Show available backups and pick the latest
  LATEST=$(ls -t "$DEPLOY_DIR/backups/"*.sql.gz 2>/dev/null | head -1)
  if [[ -z "$LATEST" ]]; then
    err "No backups found in deploymentV2/backups/"
  fi
  echo -e "${YELLOW}No backup file specified. Available backups:${RESET}"
  ls -t "$DEPLOY_DIR/backups/"*.sql.gz | nl -ba
  echo ""
  echo "Usage: make restore BACKUP=backups/craftcontrol_YYYYMMDD_HHMMSS.sql.gz"
  echo "   or: make restore   (to restore the most recent: $(basename "$LATEST"))"
  echo ""
  read -r -p "Restore most recent backup? [y/N]: " answer
  [[ "$answer" =~ ^[Yy]$ ]] || exit 0
  BACKUP_FILE="$LATEST"
fi

[[ -f "$BACKUP_FILE" ]] || err "Backup file not found: $BACKUP_FILE"

source "$ENV_FILE"

echo ""
warn "This will OVERWRITE the current database with: $(basename "$BACKUP_FILE")"
warn "All data added since this backup was taken will be LOST."
echo ""
read -r -p "Type 'yes' to continue: " confirm
[[ "$confirm" == "yes" ]] || { echo "Aborted."; exit 0; }

step "Restoring from $(basename "$BACKUP_FILE")"

# Drop and recreate the database
docker compose --env-file "$ENV_FILE" -f "$DEPLOY_DIR/docker-compose.yml" \
  exec -T db psql -U "$POSTGRES_USER" -c \
  "DROP DATABASE IF EXISTS ${POSTGRES_DB}; CREATE DATABASE ${POSTGRES_DB};"

# Restore
zcat "$BACKUP_FILE" | docker compose --env-file "$ENV_FILE" \
  -f "$DEPLOY_DIR/docker-compose.yml" \
  exec -T db psql -U "$POSTGRES_USER" "$POSTGRES_DB"

ok "Database restored"

step "Re-running migrations to apply any schema changes"
docker compose --env-file "$ENV_FILE" -f "$DEPLOY_DIR/docker-compose.yml" \
  exec -T api npx prisma migrate deploy
ok "Migrations applied"

echo ""
echo -e "${GREEN}${BOLD}Restore complete!${RESET}"
echo ""
