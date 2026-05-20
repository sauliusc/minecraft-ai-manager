#!/bin/sh
# Paper's PluginRemapper keeps original-*.jar backups in .paper-remapped/ across
# restarts, causing ModernPluginLoadingStrategy to log "Ambiguous plugin name" errors.
# Remove them before each start so only the remapped JARs remain.
rm -f /data/plugins/.paper-remapped/original-*.jar 2>/dev/null
exec /start "$@"
