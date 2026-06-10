#!/bin/sh
# tile.sh — slice a PDF into crisp, screen-sized PNG strips for Claude to read.
#
# Why: when Claude views a PDF/image it is downscaled to a fixed resolution
# budget (~1500px on the long edge), so a tall page (e.g. a 1920x8000 mockup)
# blurs. Rendering it as a column of strips, each ~the display width, keeps
# small text and pixel spacing legible. Read the strips in order.
#
# Requires poppler: pdftoppm, pdfinfo.
#
# Usage: tile.sh <file.pdf> [width=1500] [strip_height=900] [out_dir=pdf-tiles]

set -eu

PDF="${1:-}"
WIDTH="${2:-1500}"      # render width in px — keep ≤ ~1500 so strips aren't downscaled
STRIP_H="${3:-900}"     # strip height in px
OUT="${4:-pdf-tiles}"
OVERLAP=80              # px of overlap between strips so nothing is bisected

if [ -z "$PDF" ] || [ ! -f "$PDF" ]; then
  echo "usage: tile.sh <file.pdf> [width=1500] [strip_height=900] [out_dir=pdf-tiles]" >&2
  exit 2
fi
command -v pdftoppm >/dev/null 2>&1 || { echo "error: pdftoppm (poppler) not found" >&2; exit 1; }
command -v pdfinfo  >/dev/null 2>&1 || { echo "error: pdfinfo (poppler) not found"  >&2; exit 1; }

mkdir -p "$OUT"
rm -f "$OUT"/tile_*.png "$OUT"/tiles.txt 2>/dev/null || true
manifest="$OUT/tiles.txt"
: > "$manifest"

PAGES=$(pdfinfo "$PDF" | awk '/^Pages:/{print $2; exit}')
[ -n "${PAGES:-}" ] || PAGES=1

step=$((STRIP_H - OVERLAP))
[ "$step" -lt 1 ] && step="$STRIP_H"

idx=0
p=1
while [ "$p" -le "$PAGES" ]; do
  # page size in points (anchor on the "size:" token; robust to "(rotated …)")
  set -- $(pdfinfo -f "$p" -l "$p" "$PDF" | awk '/size:/{for(i=1;i<=NF;i++) if($i=="size:"){print $(i+1), $(i+3); exit}}')
  WPT="${1:-612}"; HPT="${2:-792}"

  # DPI so the page renders at WIDTH px wide, then the full pixel dimensions
  R=$(awk  -v w="$WIDTH" -v pt="$WPT" 'BEGIN{ r=w*72.0/pt; if(r<1)r=1; printf "%.3f", r }')
  WPX=$(awk -v pt="$WPT" -v r="$R" 'BEGIN{ printf "%d", (pt*r/72.0)+0.5 }')
  HPX=$(awk -v pt="$HPT" -v r="$R" 'BEGIN{ printf "%d", (pt*r/72.0)+0.5 }')

  y=0
  while :; do
    h="$STRIP_H"
    rem=$((HPX - y))
    [ "$h" -gt "$rem" ] && h="$rem"
    [ "$h" -le 0 ] && break
    name=$(printf "tile_%02d" "$idx")
    pdftoppm -png -singlefile -r "$R" -x 0 -y "$y" -W "$WPX" -H "$h" -f "$p" -l "$p" "$PDF" "$OUT/$name" >/dev/null 2>&1
    echo "$OUT/$name.png   page $p, y ${y}–$((y + h)) of ${HPX}px" >> "$manifest"
    idx=$((idx + 1))
    [ "$rem" -le "$STRIP_H" ] && break
    y=$((y + step))
  done
  p=$((p + 1))
done

echo "Wrote $idx strip(s) to $OUT/ at ${WIDTH}px wide. Read them in order:"
cat "$manifest"
