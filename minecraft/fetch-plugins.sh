#!/usr/bin/env bash
# fetch-plugins.sh — Download the pinned third-party Paper plugins into jars/.
#
# Run before `docker build` for the Minecraft image. The CraftControl plugins
# are produced by Maven and land in jars/ from the CI artifact; these three come
# from Modrinth and used to be missing from the image entirely, surviving only
# because they sat in the ct102 volume (#336).
#
# Each artifact is verified against the sha512 pinned in the manifest. A URL on
# its own is not a pin — the bytes behind it can change.
#
# Usage: minecraft/fetch-plugins.sh [dest_dir]   (default: jars/)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"
MANIFEST="$SCRIPT_DIR/third-party-plugins.tsv"
DEST="${1:-$REPO_ROOT/jars}"

[[ -f "$MANIFEST" ]] || { echo "ERROR: manifest not found at $MANIFEST" >&2; exit 1; }
mkdir -p "$DEST"

sha512_of() {
  if command -v sha512sum >/dev/null 2>&1; then
    sha512sum "$1" | awk '{print $1}'
  else
    shasum -a 512 "$1" | awk '{print $1}'
  fi
}

count=0
while IFS=$'\t' read -r name version filename sha url; do
  # Skip comments and blank lines.
  [[ -z "${name:-}" || "${name:0:1}" == "#" ]] && continue

  if [[ -z "${version:-}" || -z "${filename:-}" || -z "${sha:-}" || -z "${url:-}" ]]; then
    echo "ERROR: malformed manifest row for '$name' — expected 5 tab-separated fields" >&2
    exit 1
  fi

  target="$DEST/$filename"

  # Already present and correct (e.g. a re-run, or a warm CI cache).
  if [[ -f "$target" ]] && [[ "$(sha512_of "$target")" == "$sha" ]]; then
    echo "  ok       $filename (cached)"
    count=$((count + 1))
    continue
  fi

  echo "  fetching $name $version"
  tmp="$(mktemp)"
  if ! curl -fsSL --retry 3 --retry-delay 2 -o "$tmp" "$url"; then
    rm -f "$tmp"
    echo "ERROR: download failed for $name ($url)" >&2
    exit 1
  fi

  actual="$(sha512_of "$tmp")"
  if [[ "$actual" != "$sha" ]]; then
    rm -f "$tmp"
    echo "ERROR: checksum mismatch for $filename" >&2
    echo "  expected $sha" >&2
    echo "  actual   $actual" >&2
    echo "The artifact behind this URL changed. Verify it on Modrinth before updating the manifest." >&2
    exit 1
  fi

  mv "$tmp" "$target"
  chmod 644 "$target"
  echo "  ok       $filename"
  count=$((count + 1))
done < "$MANIFEST"

if [[ "$count" -eq 0 ]]; then
  echo "ERROR: no plugins listed in $MANIFEST" >&2
  exit 1
fi

echo "Fetched $count third-party plugin(s) into $DEST"
