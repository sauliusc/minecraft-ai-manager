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
COPY jars/ /config/plugins/

# Plugin config templates — env vars (${BRIDGE_SECRET} etc.) are substituted
# by itzg at startup before the server reads them
COPY minecraft/config/ /config/
