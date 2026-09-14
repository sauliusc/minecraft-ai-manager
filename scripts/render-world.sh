#!/usr/bin/env bash
# render-world.sh — isometric picture of part of the live world.
#
# Flushes the world to disk first. Region files lag the running server: a block
# placed seconds earlier reads as air on disk, even in a loaded chunk, so
# skipping the flush renders a stale world and "verifies" something that is not
# there any more.
#
# Usage: render-world.sh X0 X1 Y0 Y1 Z0 Z1 [OUT.png] [TILE] [ROTATION]
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE="docker compose -f $REPO/deploymentV2/docker-compose.yml"
DIM="${DIM:-overworld}"

[[ $# -ge 6 ]] || { sed -n '2,12p' "${BASH_SOURCE[0]}"; exit 1; }
X0=$1 X1=$2 Y0=$3 Y1=$4 Z0=$5 Z1=$6
OUT="${7:-$REPO/renders/world.png}"
TILE="${8:-6}"
ROT="${9:-0}"

# Region files are 512 blocks square; copy every one the area touches.
floordiv() { local n=$1 d=$2; if (( n >= 0 )); then echo $(( n / d )); else echo $(( (n - d + 1) / d )); fi; }
RX0=$(floordiv "$X0" 512); RX1=$(floordiv "$X1" 512)
RZ0=$(floordiv "$Z0" 512); RZ1=$(floordiv "$Z1" 512)

echo "▶ flushing the world to disk"
$COMPOSE exec -T minecraft rcon-cli "save-all flush" >/dev/null
sleep 3

mkdir -p "$(dirname "$OUT")"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

MC="$($COMPOSE ps -q minecraft)"
for (( rx=RX0; rx<=RX1; rx++ )); do
  for (( rz=RZ0; rz<=RZ1; rz++ )); do
    name="r.$rx.$rz.mca"
    if docker cp "$MC:/data/world/dimensions/minecraft/$DIM/region/$name" "$TMP/$name" 2>/dev/null; then
      echo "▶ copied $name"
    else
      # Never-generated regions are normal at the edge of an area.
      echo "▷ $name not present (ungenerated), skipping"
    fi
  done
done

echo "▶ rendering"
python3 "$REPO/scripts/render_world.py" "$TMP" "$X0" "$X1" "$Y0" "$Y1" "$Z0" "$Z1" \
  "$OUT" "$TILE" "$ROT"
echo "✓ $OUT"
