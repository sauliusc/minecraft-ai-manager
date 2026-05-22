#!/usr/bin/env bash
# Downloads third-party Paper-compatible plugins from Modrinth into jars/.
# Run from repo root:  bash minecraft/download-plugins.sh
# Or from CI before docker build.
#
# Plugins NOT included (incompatible with Paper 1.21.11):
#   BuildCraft             — Forge only, last updated 1.12.2
#   Waystones              — Forge/Fabric/NeoForge only (no Bukkit port)
#   Domestication Innovation — Forge/NeoForge only, last updated 1.20.1
#   Bigger Beacons         — Fabric only, CurseForge only
#   Sophisticated Backpacks — Forge/Fabric only (no Paper port)
set -euo pipefail

OUTDIR="${1:-jars}"
MC_VERSION="1.21.11"

mkdir -p "$OUTDIR"

modrinth_download() {
  local slug="$1" loader="$2" label="$3"
  echo "  → ${label} (${slug}, ${loader})..."
  local url
  url=$(curl -sf \
    "https://api.modrinth.com/v2/project/${slug}/version?loaders=%5B%22${loader}%22%5D&game_versions=%5B%22${MC_VERSION}%22%5D" \
    | jq -r '[.[] | select(.version_type == "release")] | .[0].files[] | select(.primary // true) | .url' \
    | head -1) || true
  if [ -n "$url" ] && [ "$url" != "null" ]; then
    local filename
    filename="$(basename "${url%%\?*}")"
    curl -fsSL -o "${OUTDIR}/${filename}" "${url}"
    echo "    ✓ ${filename}"
  else
    echo "    ⚠ No ${loader} ${MC_VERSION} release found for ${slug}" >&2
  fi
}

echo "Downloading Paper ${MC_VERSION} plugins to ${OUTDIR}/..."

# ClickVillagers — right-click a villager to open trade UI without conversing
modrinth_download clickvillagers paper "ClickVillagers"

# Simple Voice Chat — proximity voice chat (use 'bukkit' loader for Paper)
modrinth_download simple-voice-chat bukkit "Simple Voice Chat"

# JustTpa — /tpa and /tpahere teleport requests between players
modrinth_download just-tpa paper "JustTpa"

echo "Done."
ls -lh "${OUTDIR}"/*.jar 2>/dev/null || echo "(no JARs found — check curl/jq output above)"
