FROM itzg/minecraft-server

# Defaults — all can be overridden in docker-compose environment
ENV EULA=TRUE \
    TYPE=PAPER \
    VERSION=1.21.4 \
    MEMORY=4G \
    ENABLE_RCON=true \
    RCON_PORT=25575 \
    REPLACE_ENV_VARIABLES=TRUE

# Plugin JARs are pre-built by CI and placed in jars/ before this build runs
COPY jars/ /config/plugins/

# Plugin config templates — env vars (${BRIDGE_SECRET} etc.) are substituted
# by itzg at startup before the server reads them
COPY minecraft/config/ /config/
