FROM itzg/minecraft-server

# Defaults — all can be overridden in docker-compose environment
ENV EULA=TRUE \
    TYPE=PAPER \
    VERSION=1.21.4 \
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

# Plugin config templates land in /data/plugins/ alongside the JARs.
# REPLACE_ENV_VARIABLES=TRUE with the default CFG_ prefix replaces ${CFG_*}
# tokens in all files under /data/ before the server starts.
COPY minecraft/config/plugins/ /plugins/

COPY minecraft/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
ENTRYPOINT ["/entrypoint.sh"]
