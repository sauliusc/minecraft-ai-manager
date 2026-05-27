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

# ── Pre-download Paper using Fill v3 API ─────────────────────────────────────
# itzg/minecraft-server uses api.papermc.io/v2 which is dead for versions
# released after Dec 31, 2025 (fully disabled July 1, 2026). Paper 26.1.2+
# must be fetched from fill.papermc.io/v3 instead.
#
# The container runs on ct102 which has unrestricted network access to
# fill.papermc.io, so we download the correct Paperclip JAR here before
# /start is called. If /data/paper-${VERSION}.jar already matches the
# target version, we skip the download.
MC_VERSION="${VERSION:-26.1.2}"
PAPER_JAR="/data/paper-${MC_VERSION}.jar"
PAPERMC_UA="craftcontrol-entrypoint/1.0 (https://github.com/sauliusc/minecraft-ai-manager)"

# Remove any old Paper JARs from previous versions to avoid confusion.
find /data -maxdepth 1 -name "paper-*.jar" ! -name "paper-${MC_VERSION}.jar" \
    -exec rm -f {} + 2>/dev/null || true

if [ ! -f "$PAPER_JAR" ]; then
    echo "[entrypoint] Paper ${MC_VERSION} JAR not found — fetching from fill.papermc.io..."

    BUILD_INFO=$(curl -sf --max-time 30 \
        -H "User-Agent: ${PAPERMC_UA}" \
        "https://fill.papermc.io/v3/projects/paper/versions/${MC_VERSION}/builds") || {
        echo "[entrypoint] ERROR: Fill v3 API request failed for version '${MC_VERSION}'"
        exit 1
    }

    # Builds are returned newest-first; grep the first 'server:default' block for its url.
    PAPER_URL=$(echo "$BUILD_INFO" \
        | grep -A 5 '"server:default"' \
        | grep '"url"' \
        | head -1 \
        | sed -E 's/.*"url"[[:space:]]*:[[:space:]]*"([^"]+)".*/\1/' || true)

    if [ -z "$PAPER_URL" ]; then
        echo "[entrypoint] ERROR: Could not parse Paper download URL from Fill v3 response"
        exit 1
    fi

    echo "[entrypoint] Downloading: $PAPER_URL"
    curl -fsSL --max-time 300 \
        -H "User-Agent: ${PAPERMC_UA}" \
        -o "$PAPER_JAR" "$PAPER_URL"
    echo "[entrypoint] Downloaded Paper ${MC_VERSION}: $(du -sh "$PAPER_JAR" | cut -f1)"
else
    echo "[entrypoint] Paper ${MC_VERSION} JAR already present ($(du -sh "$PAPER_JAR" | cut -f1)), skipping download"
fi

exec /start "$@"
