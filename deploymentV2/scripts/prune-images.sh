#!/usr/bin/env bash
# prune-images.sh — Remove superseded CraftControl images from the local Docker
# store, keeping the tags rollback depends on.
#
# `docker image prune -f` (which deploy.sh already runs) only removes *dangling*
# images. Every GHCR image we pull is tagged with a git SHA, so none of them are
# ever dangling and none were ever removed — 78 old CraftControl images had
# accumulated on ct102, 12.4 GB of a 24 GB volume shared with Postgres and the
# Minecraft world. See #317.
#
# Kept:
#   - the tag in .deployed-version  (running now)
#   - the tag in .previous-version  (what `make rollback` reverts to)
#   - any tag currently used by a container, running or not
#
# Usage: prune-images.sh [--dry-run]
set -euo pipefail

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; RESET='\033[0m'
ok()   { echo -e "  ${GREEN}✓${RESET} $*"; }
warn() { echo -e "  ${YELLOW}⚠${RESET} $*"; }
info() { echo -e "  ${CYAN}ℹ${RESET} $*"; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_DIR="$(dirname "$SCRIPT_DIR")"

DRY_RUN=0
[[ "${1:-}" == "--dry-run" ]] && DRY_RUN=1

REPO_PREFIX="ghcr.io/sauliusc/minecraft-ai-manager/"

# ── Work out what must survive ───────────────────────────────────────────────
declare -A KEEP=()

for f in "$DEPLOY_DIR/.deployed-version" "$DEPLOY_DIR/.previous-version"; do
  if [[ -f "$f" ]]; then
    tag="$(tr -d '[:space:]' < "$f")"
    [[ -n "$tag" ]] && KEEP["$tag"]=1
  fi
done

# The tag pinned in .env is what a plain `docker compose up` would start.
if [[ -f "$DEPLOY_DIR/.env" ]]; then
  env_tag="$(grep -E '^IMAGE_TAG=' "$DEPLOY_DIR/.env" | tail -1 | cut -d= -f2- | tr -d '[:space:]')"
  [[ -n "$env_tag" ]] && KEEP["$env_tag"]=1
fi

# Containers are the source of truth: the version files can drift, and deleting
# the image out from under a running container is not recoverable by rollback.
while read -r image; do
  [[ "$image" == "$REPO_PREFIX"* ]] || continue
  KEEP["${image##*:}"]=1
done < <(docker ps -a --format '{{.Image}}' 2>/dev/null || true)

if [[ ${#KEEP[@]} -eq 0 ]]; then
  warn "Could not determine which tags are in use — refusing to prune."
  exit 0
fi

info "Keeping tags: ${!KEEP[*]}"

# ── Remove everything else under the CraftControl repos ──────────────────────
removed=0
while read -r ref; do
  [[ -n "$ref" ]] || continue
  tag="${ref##*:}"
  [[ -n "${KEEP[$tag]:-}" ]] && continue
  # A tag that is not a real build (e.g. <none>) is left to `docker image prune`.
  [[ "$tag" == "<none>" ]] && continue

  if [[ $DRY_RUN -eq 1 ]]; then
    echo "    would remove $ref"
  else
    docker rmi "$ref" >/dev/null 2>&1 && echo "    removed $ref" || true
  fi
  removed=$((removed + 1))
done < <(docker images --format '{{.Repository}}:{{.Tag}}' | grep "^${REPO_PREFIX}" || true)

if [[ $DRY_RUN -eq 1 ]]; then
  ok "Dry run: $removed image(s) would be removed"
else
  ok "Removed $removed superseded image(s)"
  df -h "$DEPLOY_DIR" | awk 'NR==2 {printf "  \033[0;36mℹ\033[0m Disk now %s used of %s (%s free)\n", $3, $2, $4}'
fi
