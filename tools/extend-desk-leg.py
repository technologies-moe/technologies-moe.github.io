#!/usr/bin/env python3
"""Regenerate assets/room/07-desk.webp with its right leg extended to the floor.

The desk sheet was drawn with the leg running straight off the bottom edge of
the frame. In the composite that never showed, because the character sat right
in front of it — but the room now has a sleep state with an empty chair, and the
cut-off post reads as hovering.

So the sheet grows downward and the post is continued into the new rows, keeping
the shear it already had. layers.json compensates with sy/ty so nothing else in
the sheet moves; see the `desk` layer there.

Run from the repo root:  python3 tools/extend-desk-leg.py
"""
from PIL import Image
import numpy as np

SRC   = 'assets/room/src/07-desk.png'   # untouched master
DST   = 'assets/room/07-desk.webp'
ROWS  = 170        # extra rows; 170 * 0.55 stage-px per row lands the foot on the floor
SHEAR = 0.225      # px the post drifts left per row, measured across rows 860-940
X0,X1 = 1197,1264  # the post's span on the sheet's last row
FADE  = 7          # rows of alpha softening so the foot is not a razor-sharp cut

im = Image.open(SRC).convert('RGBA')
W, H = im.size
src = np.array(im)

out = np.zeros((H + ROWS, W, 4), dtype=np.uint8)
out[:H] = src

post = src[H - 1, X0:X1 + 1].copy()
for r in range(1, ROWS + 1):
    dx = int(round(SHEAR * r))
    seg = post.copy()
    k = r / ROWS
    # ambient occlusion: the post darkens as it approaches the floor
    seg[:, :3] = np.clip(seg[:, :3].astype(np.float32) * (1.0 - 0.38 * k * k), 0, 255).astype(np.uint8)
    tail = ROWS - r
    if tail < FADE:                      # soften the very last rows
        seg[:, 3] = (seg[:, 3].astype(np.float32) * (0.35 + 0.65 * tail / FADE)).astype(np.uint8)
    out[H - 1 + r, X0 - dx:X1 - dx + 1] = seg

Image.fromarray(out, 'RGBA').save(DST, 'WEBP', quality=86, alpha_quality=92, method=5)

sy = round(0.55 * (H + ROWS) / H, 4)
ty = round(-27.9 + 50 * sy, 4)
print(f'{DST}: {W}x{H + ROWS}')
print(f'layers.json desk -> sy {sy}, ty {ty}')
print(f'  top stays {50 + ty - sy * 50:.2f}%, foot now {50 + ty + sy * 50:.2f}%')
