FROM itzg/minecraft-server

# Defaults — all can be overridden in docker-compose environment
ENV EULA=TRUE \
    TYPE=PAPER \
    VERSION=26.1.2 \
    MEMORY=4G \
    ENABLE_RCON=true \
    RCON_PORT=25575 \
    REPLACE_ENV_VARIABLES=TRUE

# Plugin JARs placed in jars/ by CI before this build:
#   - BridgePlugin (Maven, from plugins/)
#   - ClickVillagers   (Modrinth: clickvillagers)
#   - Simple Voice Chat (Modrinth: simple-voice-chat, bukkit loader)
#   - JustTpa          (Modrinth: just-tpa)
# Excluded (Forge/Fabric — incompatible with Paper):
#   BuildCraft, Waystones, Domestication Innovation, Bigger Beacons, Sophisticated Backpacks
#
# NOTE: itzg copies /plugins/ -> /data/plugins/ (where Paper loads plugins from).
#       /config/ goes to /data/config/ — Paper never looks there for plugin JARs.
COPY jars/ /plugins/
# Remove maven-shade-plugin artifact backups (original-*.jar) that end up in
# jars/ from the CI build.  itzg copies /plugins/ → /data/plugins/ on every
# restart, so if these are left in the image the entrypoint cleanup is
# immediately overwritten and Paper tries to remap both the shaded and
# unshaded JARs, causing "Ambiguous plugin name" errors.
RUN find /plugins -name 'original-*.jar' -delete 2>/dev/null || true

# Plugin config templates land in /data/plugins/ alongside the JARs.
# REPLACE_ENV_VARIABLES=TRUE with the default CFG_ prefix replaces ${CFG_*}
# tokens in all files under /data/ before the server starts.
COPY minecraft/config/plugins/ /plugins/

# Paper world config — shipped in the image so itzg copies it to /data/config/
# on startup (via "Copying any configs from /config to /data/config").
# Must NOT be a bind mount: Paper uses atomic rename() to save the file and
# Linux returns EBUSY if the target is bind-mounted.
COPY minecraft/config/paper-world-defaults.yml /config/paper-world-defaults.yml

COPY minecraft/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
ENTRYPOINT ["/entrypoint.sh"]
