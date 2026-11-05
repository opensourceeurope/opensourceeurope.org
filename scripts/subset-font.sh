#!/usr/bin/env bash
# Rebuilds the Manrope files in public/fonts/manrope/ from the Manrope variable font in
# google/fonts. Each file holds every weight. The browser downloads latin-ext only for a
# page that uses one of its characters. Keep the ranges in step with unicode-range in
# src/styles/base.css. Needs uv.
set -euo pipefail

COMMIT=b31870aff700ab7a1d74fa0c6887d95beb9e0037
SHA256=3ae11c49db0455a3cc33e37d380f20fdb8c7f8b41dc07625c177e3d87a9d6ae6
LATIN='U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD'
LATIN_EXT='U+0100-0130,U+0132-0151,U+0154-024F,U+0259,U+1E00-1EFF,U+20A0-20AB,U+20AD-20CF,U+2113,U+2116,U+2190,U+2192,U+2194-21FF'

root=$(cd "$(dirname "$0")/.." && pwd)
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

curl -fsSL -o "$tmp/Manrope.ttf" "https://raw.githubusercontent.com/google/fonts/$COMMIT/ofl/manrope/Manrope%5Bwght%5D.ttf"
echo "$SHA256  $tmp/Manrope.ttf" | shasum -a 256 -c -

subset() {
  uvx --from fonttools==4.60.1 --with brotli==1.1.0 pyftsubset "$tmp/Manrope.ttf" \
    --unicodes="$2" --layout-features='*' --flavor=woff2 \
    --output-file="$root/public/fonts/manrope/Manrope-$1.woff2"
}
subset latin "$LATIN"
subset latin-ext "$LATIN_EXT"
