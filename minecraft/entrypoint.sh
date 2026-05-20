#!/bin/sh
# Paper's PluginRemapper writes original-*.jar backups in two places across restarts:
#   1. /data/plugins/original-*.jar          (source-dir backup)
#   2. /data/plugins/.paper-remapped/original-*.jar  (remapped-dir backup)
# Both must be removed before start; leaving the source backups causes Paper to
# remap them again, which recreates the .paper-remapped copies that trigger
# ModernPluginLoadingStrategy "Ambiguous plugin name" errors.
rm -f /data/plugins/original-*.jar 2>/dev/null
rm -f /data/plugins/.paper-remapped/original-*.jar 2>/dev/null
exec /start "$@"
