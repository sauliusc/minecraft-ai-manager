#!/bin/sh
set -e

# ── Clean up Paper plugin-remapper backup JARs from previous runs ────────────
# Paper's PluginRemapper writes original-*.jar backups in two places:
#   1. /data/plugins/original-*.jar          (source-dir backup)
#   2. /data/plugins/.paper-remapped/original-*.jar  (remapped-dir backup)
# Both must be removed before start; leaving the source backups causes Paper to
# remap them again, which recreates the .paper-remapped copies that trigger
# ModernPluginLoadingStrategy "Ambiguous plugin name" errors.
rm -f /data/plugins/original-*.jar 2>/dev/null || true
rm -f /data/plugins/.paper-remapped/original-*.jar 2>/dev/null || true

# ── Force correct Paper version ───────────────────────────────────────────────
# itzg/minecraft-server uses api.papermc.io/v2 (dead for post-2025 versions)
# AND may reuse /data/cache/patched_*.jar from a previous run, causing a stale
# Paper 1.21.4 JAR to be used instead of 26.1.2.
#
# Fix strategy:
#   1. Clear /data/cache/patched_*.jar so itzg must re-download and re-patch.
#   2. Set PAPER_DOWNLOAD_URL to the fill.papermc.io URL for Paper 26.1.2 so
#      itzg fetches from the correct (live) endpoint instead of the dead v2 API.
#
# ct102 has unrestricted network access to fill.papermc.io; Docker containers
# on ct102 inherit the same network by default.

MC_VERSION="${VERSION:-26.1.2}"
PAPERMC_UA="craftcontrol-entrypoint/1.0 (https://github.com/sauliusc/minecraft-ai-manager)"

echo "[entrypoint] Clearing stale Paper patch cache for version ${MC_VERSION}..."
# Remove patched JARs that don't belong to the target version so itzg can't
# fall back to a cached patched_1.21.4.jar.
find /data/cache -maxdepth 1 \( -name "patched_*.jar" -o -name "mojang_*.jar" \) \
    ! -name "patched_${MC_VERSION}.jar" \
    -exec rm -f {} + 2>/dev/null || true
# Also remove top-level paper JARs for wrong versions.
find /data -maxdepth 1 -name "paper-*.jar" ! -name "paper-${MC_VERSION}*.jar" \
    -exec rm -f {} + 2>/dev/null || true

echo "[entrypoint] Fetching Paper ${MC_VERSION} build URL from fill.papermc.io..."
BUILD_INFO=$(curl -sf --max-time 30 \
    -H "User-Agent: ${PAPERMC_UA}" \
    "https://fill.papermc.io/v3/projects/paper/versions/${MC_VERSION}/builds") || {
    echo "[entrypoint] WARNING: fill.papermc.io unreachable — proceeding without PAPER_DOWNLOAD_URL override"
    exec /start "$@"
}

PAPER_URL=$(echo "$BUILD_INFO" \
    | grep -A 5 '"server:default"' \
    | grep '"url"' \
    | head -1 \
    | sed -E 's/.*"url"[[:space:]]*:[[:space:]]*"([^"]+)".*/\1/' || true)

if [ -z "$PAPER_URL" ]; then
    echo "[entrypoint] WARNING: Could not parse Paper URL from Fill v3 — proceeding without override"
    exec /start "$@"
fi

echo "[entrypoint] PAPER_DOWNLOAD_URL=${PAPER_URL}"
export PAPER_DOWNLOAD_URL="${PAPER_URL}"

exec /start "$@"
