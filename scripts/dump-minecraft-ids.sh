#!/usr/bin/env bash
# Regenerates server/src/lib/minecraftIds.ts from the running server's own jar.
#
# The identifiers are read out of the vanilla registry rather than written from
# memory, because a target the game does not have never matches anything and the
# challenge silently sits at zero (#373). Run this after a Minecraft version bump.
set -euo pipefail

COMPOSE="${COMPOSE:-deploymentV2/docker-compose.yml}"
MC_VERSION="${MC_VERSION:-26.2}"
JAR="/data/cache/mojang_${MC_VERSION}.jar"

docker compose -f "$COMPOSE" exec -T minecraft sh -c "
  set -e
  cd /tmp && rm -rf idx && mkdir idx && cd idx
  unzip -o -q '$JAR' 'META-INF/versions/${MC_VERSION}/server-${MC_VERSION}.jar'
  unzip -l 'META-INF/versions/${MC_VERSION}/server-${MC_VERSION}.jar' | awk '{print \$4}' > all.txt
  echo '###BLOCKS';   grep -oE 'loot_table/blocks/[a-z0-9_]+\.json'   all.txt | sed 's|.*/||;s|\.json||' | sort -u
  echo '###ENTITIES'; grep -oE 'loot_table/entities/[a-z0-9_]+\.json' all.txt | sed 's|.*/||;s|\.json||' | sort -u
  echo '###RECIPES';  grep -oE 'recipe/[a-z0-9_]+\.json'              all.txt | sed 's|.*/||;s|\.json||' | sort -u
"
