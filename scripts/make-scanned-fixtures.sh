#!/usr/bin/env sh
# Regenerates fixtures/sample_report_N_scanned.pdf: image-only PDFs (no text layer) rendered from
# the synthetic .txt fixtures, for testing the render + OCR path on a device.
# Needs ImageMagick 6 (`convert`). Output: A4, 200 dpi, 1-bit, white background, no alpha.
set -eu
cd "$(dirname "$0")/.."
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
for n in 1 2; do
  convert -density 200 -font DejaVu-Sans-Mono -pointsize 9 -page A4 "text:fixtures/sample_report_$n.txt" \
    -background white -alpha remove -alpha off -colorspace Gray -type bilevel "$tmp/r$n.png"
  # +repage drops the A4 page geometry so the PDF page size comes from pixels / 200 dpi (A4).
  convert "$tmp/r$n.png" +repage -units PixelsPerInch -density 200 -compress Group4 \
    "fixtures/sample_report_${n}_scanned.pdf"
done
