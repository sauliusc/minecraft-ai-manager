# ── Stage 1: Build all plugins ────────────────────────────────────────────────
FROM maven:3.9-eclipse-temurin-21-alpine AS builder
WORKDIR /build
COPY plugins/ .
RUN mvn clean package -DskipTests --batch-mode --no-transfer-progress -q \
  && mkdir /jars \
  && find . -path '*/target/*-*.jar' \
       ! -name '*-sources.jar' \
       ! -name '*-javadoc.jar' \
       -exec cp {} /jars/ \;

# ── Stage 2: Minecraft server ─────────────────────────────────────────────────
FROM itzg/minecraft-server

# Defaults — all can be overridden in docker-compose environment
ENV EULA=TRUE \
    TYPE=PAPER \
    VERSION=1.21.4 \
    MEMORY=4G \
    ENABLE_RCON=true \
    RCON_PORT=25575 \
    REPLACE_ENV_VARIABLES=TRUE

# Plugin JARs — itzg copies /config -> /data on every startup
COPY --from=builder /jars/ /config/plugins/

# Plugin config templates — env vars (${BRIDGE_SECRET} etc.) are substituted
# by itzg at startup before the server reads them
COPY minecraft/config/ /config/
