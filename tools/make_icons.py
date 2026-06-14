#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
make_icons.py — generate the app icons from the header's Material "school" cap.

Renders the same graduation-cap glyph used in the site header (accent colour on a
dark tile) at the sizes iOS/Android/PWA need, with 4x supersampling for clean edges.
Outputs: icons/apple-touch-icon.png (180), icons/icon-192.png, icons/icon-512.png,
and icons/icon.svg (crisp browser favicon).
"""
import os
from PIL import Image, ImageDraw

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ICONS = os.path.join(REPO, "icons")

BG = (21, 24, 29)          # #15181d — dark tile (matches the site surface)
ACCENT = (110, 168, 216)   # #6ea8d8 — --accent

# The two sub-paths of the Material "school" glyph (24x24 viewBox), as polygons.
# All commands in the source path are straight lines, so they map directly to points.
CAP_BAND = [(5, 13.18), (5, 17.18), (12, 21), (19, 17.18), (19, 13.18), (12, 17)]
CAP_TOP  = [(12, 3), (1, 9), (12, 15), (21, 10.09), (21, 17), (23, 17), (23, 9)]

SS = 4          # supersampling factor
ICON_FRAC = 0.62  # glyph occupies ~62% of the tile, centred

def render(size):
    n = size * SS
    img = Image.new("RGB", (n, n), BG)
    d = ImageDraw.Draw(img)
    scale = (n * ICON_FRAC) / 24.0
    off = (n - 24 * scale) / 2.0
    def tx(p):
        return (off + p[0] * scale, off + p[1] * scale)
    for poly in (CAP_BAND, CAP_TOP):
        d.polygon([tx(p) for p in poly], fill=ACCENT)
    return img.resize((size, size), Image.LANCZOS)

def main():
    os.makedirs(ICONS, exist_ok=True)
    targets = {"apple-touch-icon.png": 180, "icon-192.png": 192, "icon-512.png": 512}
    for name, size in targets.items():
        render(size).save(os.path.join(ICONS, name))
        print("wrote", name, f"({size}x{size})")
    svg = (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" role="img" aria-label="Masters">\n'
        '  <rect width="48" height="48" rx="11" fill="#15181d"/>\n'
        '  <path transform="translate(9 9) scale(1.25)" fill="#6ea8d8" '
        'd="M5 13.18v4L12 21l7-3.82v-4L12 17l-7-3.82zM12 3 1 9l11 6 9-4.91V17h2V9L12 3z"/>\n'
        '</svg>\n'
    )
    open(os.path.join(ICONS, "icon.svg"), "w", encoding="utf-8").write(svg)
    print("wrote icon.svg")

if __name__ == "__main__":
    main()
