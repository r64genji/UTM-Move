#!/usr/bin/env bash
# Rebuild the self-hosted campus basemap under public/basemap/.
# Output is committed, so CI and the app never call Protomaps at build or run time.
# Usage: pipeline/basemap/fetch-basemap.sh [YYYYMMDD]   (default: latest Protomaps daily build)
set -euo pipefail
cd "$(dirname "$0")/../.."

PMTILES_VERSION=1.31.2
BBOX=103.608,1.540,103.668,1.584   # UTM boundary (data/campus-boundary.geojson) + ~800 m margin
ASSETS=https://raw.githubusercontent.com/protomaps/basemaps-assets/main
OUT=public/basemap
BIN=data/raw/bin/pmtiles

if [ ! -x "$BIN" ]; then
  mkdir -p data/raw/bin
  curl -sL "https://github.com/protomaps/go-pmtiles/releases/download/v${PMTILES_VERSION}/go-pmtiles_${PMTILES_VERSION}_Linux_x86_64.tar.gz" \
    | tar xz -C data/raw/bin pmtiles
fi

BUILD=${1:-$(curl -s https://build-metadata.protomaps.dev/builds.json | grep -o '"key":"[0-9]*\.pmtiles"' | tail -1 | grep -o '[0-9]*')}
mkdir -p "$OUT"
# Protomaps planet builds stop at z15; MapLibre overzooms past that.
"$BIN" extract "https://build.protomaps.com/${BUILD}.pmtiles" "$OUT/campus.pmtiles" --bbox="$BBOX" --maxzoom=15

# Sprites (light flavor).
mkdir -p "$OUT/sprites"
for f in light.json light.png light@2x.json light@2x.png; do
  curl -sfL --retry 3 "$ASSETS/sprites/v4/$f" -o "$OUT/sprites/$f"
done

# Glyphs. Only the non-ideograph ranges found in the campus tiles' label fields
# (Latin, Cyrillic, Arabic/Jawi, Indic, Thai, Myanmar, Khmer, punctuation).
# CJK and Hangul are drawn with a local font (localIdeographFontFamily), so they never hit the network.
RANGES=$(for s in 0 256 512 768 1024 1536 2304 2816 3328 3584 3840 4096 5888 6144 7680 8192 63488; do echo "$s-$((s + 255))"; done)
for font in "Noto Sans Regular" "Noto Sans Medium" "Noto Sans Italic"; do
  mkdir -p "$OUT/fonts/$font"
  for r in $RANGES; do
    curl -sfL --retry 3 "$ASSETS/fonts/${font// /%20}/$r.pbf" -o "$OUT/fonts/$font/$r.pbf" || rm -f "$OUT/fonts/$font/$r.pbf"
  done
done
du -sh "$OUT"
