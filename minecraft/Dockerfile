FROM itzg/minecraft-server

# Defaults — all can be overridden in docker-compose environment
ENV EULA=TRUE \
    TYPE=PAPER \
    VERSION=26.2 \
    MEMORY=2G \
    ENABLE_RCON=true \
    RCON_PORT=25575 \
    REPLACE_ENV_VARIABLES=TRUE

# Plugin JARs placed in jars/ by CI before this build:
#   - CraftControl plugins — built by Maven from plugins/, uploaded as the
#     plugin-jars artifact by the build-plugins job.
#   - Third-party plugins  — fetched by minecraft/fetch-plugins.sh from the
#     pinned entries in minecraft/third-party-plugins.tsv (voice chat,
#     ClickVillagers, JustTPA). These used to be absent from the image and
#     survive only in the ct102 volume; see #336.
# Excluded (Forge/Fabric — incompatible with Paper):
#   BuildCraft, Waystones, Domestication Innovation, Bigger Beacons, Sophisticated Backpacks
#
# NOTE: itzg copies /plugins/ -> /data/plugins/ (where Paper loads plugins from).
#       /config/ goes to /data/config/ — Paper never looks there for plugin JARs.
# ── Third-party plugins, fetched and checksum-verified at build time ────────
# Done here rather than in CI so that *any* build of this image produces a
# complete server. These three used to exist only in ct102's minecraft_data
# volume — the image shipped without them, and losing the volume lost them
# silently (#336). The manifest is copied first so this layer caches on its
# contents: the fetch re-runs only when a pinned version actually changes.
COPY minecraft/third-party-plugins.tsv minecraft/fetch-plugins.sh /tmp/tpp/
RUN bash /tmp/tpp/fetch-plugins.sh /plugins \
    && rm -rf /tmp/tpp

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
