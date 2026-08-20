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

# ── Remove superseded third-party plugin JARs ────────────────────────────────
# itzg copies /plugins/ -> /data/plugins/ on every start but never deletes what
# is already there. When a bundled plugin is upgraded its filename changes with
# the version (e.g. voicechat-bukkit-2.6.17.jar -> voicechat-bukkit-2.6.21.jar),
# so BOTH versions end up in /data/plugins/ and Paper aborts the load with an
# "Ambiguous plugin name" error. For every JAR we are about to install, drop any
# JAR already present that shares its base name but not its exact filename.
# See minecraft-ai-manager#297.
for src in /plugins/*.jar; do
  [ -e "$src" ] || continue
  base=$(basename "$src")
  stem=$(echo "$base" | sed -E 's/-[0-9][0-9A-Za-z.]*\.jar$//')
  [ "$stem" = "$base" ] && continue
  for old in /data/plugins/"$stem"-*.jar; do
    [ -e "$old" ] || continue
    [ "$(basename "$old")" = "$base" ] && continue
    echo "[entrypoint] Removing superseded plugin JAR $(basename "$old") (replaced by $base)"
    rm -f "$old"
  done
done

# ── Download Paperclip + boot via TYPE=CUSTOM ─────────────────────────────────
# itzg/minecraft-server does not recognise calendar-versioned strings like
# "26.2" for TYPE=PAPER; it falls back to a cached patched_1.21.4-*.jar in
# the persistent minecraft_data volume.
#
# Previous fix (PR #243) attempted --patchOnly but piped output through
# "| head -40", which sends SIGPIPE to the JVM after 40 lines and kills it
# before patching finishes.  If the bootstrapper doesn't honour --patchOnly
# it starts a full server, partially remaps plugins, renames them to
# original-*.jar, and then dies — leaving stale backups for the next real run.
#
# Fix: skip --patchOnly entirely.  Download the Paperclip JAR, nuclear-clear
# /data/cache/, then boot with TYPE=CUSTOM.  itzg runs
# "java -jar $CUSTOM_SERVER" and Paperclip handles patching + startup with no
# partial-run side-effects.

# Hardcode the target Paper version — do NOT read from $VERSION.
# deploymentV2/docker-compose.yml sets VERSION=${MINECRAFT_VERSION:-26.2} and
# ct102's .env has MINECRAFT_VERSION=1.21.4, so $VERSION resolves to 1.21.4 in
# the container.  "${VERSION:-26.2}" only uses the default when VERSION is
# *unset*, not when it is set to another value.
MC_VERSION="26.2"
PAPERMC_UA="craftcontrol-entrypoint/1.0 (https://github.com/sauliusc/minecraft-ai-manager)"
PAPER_JAR="/tmp/paperclip-${MC_VERSION}.jar"

echo "[entrypoint] Fetching Paper ${MC_VERSION} build info from fill.papermc.io..."
BUILD_INFO=$(curl -sf --max-time 30 \
    -H "User-Agent: ${PAPERMC_UA}" \
    "https://fill.papermc.io/v3/projects/paper/versions/${MC_VERSION}/builds") || {
    echo "[entrypoint] WARNING: fill.papermc.io unreachable — falling back to itzg TYPE=PAPER"
    exec /start "$@"
}

# Fill v3 returns builds newest-first; head -1 picks the most recent build.
# (install-paper-api/action.yml documents the same — do NOT change to tail -1.)
PAPER_URL=$(echo "$BUILD_INFO" \
    | grep -A 5 '"server:default"' \
    | grep '"url"' \
    | head -1 \
    | sed -E 's/.*"url"[[:space:]]*:[[:space:]]*"([^"]+)".*/\1/' || true)

if [ -z "$PAPER_URL" ]; then
    echo "[entrypoint] WARNING: Could not parse Paper URL from Fill v3 — falling back to itzg TYPE=PAPER"
    exec /start "$@"
fi

echo "[entrypoint] Downloading Paperclip ${MC_VERSION} from ${PAPER_URL}..."
curl -fsSL --max-time 300 \
    -H "User-Agent: ${PAPERMC_UA}" \
    -o "$PAPER_JAR" \
    "$PAPER_URL" || {
    echo "[entrypoint] WARNING: Download failed — falling back to itzg TYPE=PAPER"
    exec /start "$@"
}

# Nuclear-clear the patched JAR cache; Paperclip will create a fresh one.
echo "[entrypoint] Clearing stale patch cache..."
rm -rf /data/cache 2>/dev/null || true
mkdir -p /data/cache
# The entrypoint runs as root; Paperclip runs as uid=1000.  Without the chown
# Paperclip gets AccessDeniedException trying to write cache/mojang_*.jar.
chown 1000:1000 /data/cache 2>/dev/null || true

# TYPE=CUSTOM bypasses all itzg version-resolution logic.  Paperclip patches
# the server and starts it directly — no partial-run side-effects.
echo "[entrypoint] Booting Paper ${MC_VERSION} via TYPE=CUSTOM (Paperclip)..."
export TYPE=CUSTOM
export CUSTOM_SERVER="${PAPER_JAR}"
exec /start "$@"
