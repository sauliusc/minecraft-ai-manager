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

# ── Self-patch Paper to guarantee the correct version boots ──────────────────
# itzg/minecraft-server doesn't recognise calendar-versioned strings like
# "26.1.2" for TYPE=PAPER; it falls back to whatever patched_*.jar is cached in
# the persistent minecraft_data Docker volume (typically 1.21.4).
#
# Strategy:
#   1. Fetch the latest STABLE Paperclip JAR URL from fill.papermc.io/v3.
#   2. Download the JAR to /tmp (ephemeral; not in the data volume).
#   3. Nuke /data/cache/ so Paperclip writes a fresh patched JAR.
#   4. Run Paperclip with --patchOnly to pre-patch without starting the server.
#   5. Boot with TYPE=CUSTOM pointing at the patched JAR.
#   6. If any step fails, fall back to PAPER_DOWNLOAD_URL + itzg native.

MC_VERSION="${VERSION:-26.1.2}"
PAPERMC_UA="craftcontrol-entrypoint/1.0 (https://github.com/sauliusc/minecraft-ai-manager)"
PAPER_JAR="/tmp/paperclip-${MC_VERSION}.jar"

echo "[entrypoint] Fetching Paper ${MC_VERSION} build info from fill.papermc.io..."
BUILD_INFO=$(curl -sf --max-time 30 \
    -H "User-Agent: ${PAPERMC_UA}" \
    "https://fill.papermc.io/v3/projects/paper/versions/${MC_VERSION}/builds") || {
    echo "[entrypoint] WARNING: fill.papermc.io unreachable — falling back to itzg native"
    exec /start "$@"
}

# Extract URL of the latest build's server:default download.
# The builds array is ordered oldest-first; tail -1 selects the newest.
PAPER_URL=$(echo "$BUILD_INFO" \
    | grep -A 5 '"server:default"' \
    | grep '"url"' \
    | tail -1 \
    | sed -E 's/.*"url"[[:space:]]*:[[:space:]]*"([^"]+)".*/\1/' || true)

if [ -z "$PAPER_URL" ]; then
    echo "[entrypoint] WARNING: Could not parse Paper URL from Fill v3 — falling back to itzg native"
    exec /start "$@"
fi

echo "[entrypoint] Downloading Paperclip ${MC_VERSION} from ${PAPER_URL}..."
curl -fsSL --max-time 300 \
    -H "User-Agent: ${PAPERMC_UA}" \
    -o "$PAPER_JAR" \
    "$PAPER_URL" || {
    echo "[entrypoint] WARNING: Download failed — falling back to itzg native"
    exec /start "$@"
}

# Nuclear-clear stale patched JARs so Paperclip always writes a fresh one.
echo "[entrypoint] Clearing stale patch cache..."
rm -rf /data/cache 2>/dev/null || true
mkdir -p /data/cache

echo "[entrypoint] Patching Paper ${MC_VERSION} (--patchOnly)..."
# Paperclip writes /data/cache/patched_<mc-version>*.jar then exits.
# Guard with timeout: if --patchOnly isn't honoured the JAR would start a full
# server and block indefinitely; 180 s is plenty for patching on ct102.
( cd /data && timeout 180 java -jar "$PAPER_JAR" --patchOnly ) 2>&1 | head -40 || true

PATCHED=$(find /data/cache -maxdepth 2 -name "patched_*.jar" 2>/dev/null | head -1)
if [ -n "$PATCHED" ]; then
    echo "[entrypoint] TYPE=CUSTOM → ${PATCHED}"
    export TYPE=CUSTOM
    export CUSTOM_SERVER="$PATCHED"
else
    # Patch-only produced no cached JAR (new Paper bootstrapper?).
    # Use the Paperclip JAR directly; it will re-patch on first run and then
    # start the server — itzg TYPE=CUSTOM just executes it as-is.
    echo "[entrypoint] No pre-patched JAR found — using Paperclip JAR directly"
    export TYPE=CUSTOM
    export CUSTOM_SERVER="$PAPER_JAR"
fi

exec /start "$@"
