"""Clean and size the cut-out people and vehicle images for the street.

Usage: python3 tools/prepare_cast.py <source-dir>

Each source PNG has a transparent background, but the cut-out edges carry a red/orange
fringe from the background removal. For every image this script:
  1. drops near-transparent noise and erodes the alpha by a pixel,
  2. replaces the colour of the edge band with colour pulled in from the solid interior
     (so the fringe disappears instead of being darkened),
  3. crops to the figure, scales it to 640 px tall and writes a WebP to public/assets/.
"""
import os
import sys

import numpy as np
from PIL import Image, ImageFilter

# source file prefix -> (kind, output name)
CAST = {
    '1db83ec6': ('people', 'boy_gift'),
    '6efd6e1e': ('people', 'aunty_diya'),
    '8f3cf5f9': ('people', 'girl_marigold'),
    'b70e61e0': ('people', 'uncle_mithai'),
    'cde2f3c6': ('people', 'grandpa_lantern'),
    '1dc7d037': ('vehicles', 'scooter_gifts'),
    '66938547': ('vehicles', 'rickshaw'),
    '9db438b2': ('vehicles', 'auto'),
    'ac328e04': ('vehicles', 'scooter_rider'),
    'c19a5329': ('vehicles', 'bicycle_girl'),
}
OUT_H = 640


def fill_from_interior(rgb: np.ndarray, known: np.ndarray, passes=6) -> np.ndarray:
    """Pull interior colours outward: normalised blurs of the known pixels at growing radii."""
    out = rgb.copy()
    filled = known.copy()
    for r in [1, 2, 3, 5, 8, 12][:passes]:
        m = Image.fromarray((filled * 255).astype(np.uint8))
        mb = np.asarray(m.filter(ImageFilter.BoxBlur(r)), dtype=np.float32) / 255
        acc = np.zeros_like(out)
        for c in range(3):
            ch = Image.fromarray(np.clip(out[:, :, c] * filled, 0, 255).astype(np.uint8))
            acc[:, :, c] = np.asarray(ch.filter(ImageFilter.BoxBlur(r)), dtype=np.float32)
        est = acc / np.maximum(mb[:, :, None], 1e-4)
        new = (~filled.astype(bool)) & (mb > 0.02)
        out[new] = est[new]
        filled = np.where(new, 1.0, filled)
    return out


def clean(path: str) -> Image.Image:
    im = Image.open(path).convert('RGBA')
    a = np.asarray(im, dtype=np.float32)
    rgb, alpha = a[:, :, :3], a[:, :, 3]
    alpha = np.where(alpha < 40, 0, alpha)
    # erode the alpha by one pixel to cut off the outermost fringe
    am = Image.fromarray(alpha.astype(np.uint8)).filter(ImageFilter.MinFilter(3))
    alpha = np.asarray(am, dtype=np.float32)
    # solid interior = fully opaque and at least 3 px from any transparency
    solid = Image.fromarray(((alpha >= 250) * 255).astype(np.uint8)).filter(ImageFilter.MinFilter(7))
    known = np.asarray(solid, dtype=np.float32) / 255
    fixed = fill_from_interior(rgb, known)
    # in the edge band, use the interior colour; keep the original inside
    band = (alpha > 0) & (known < 0.5)
    rgb = np.where(band[:, :, None], fixed, rgb)
    # a soft, slightly tighter edge
    soft = Image.fromarray(alpha.astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.6))
    alpha = np.minimum(alpha, np.asarray(soft, dtype=np.float32))
    out = np.dstack([np.clip(rgb, 0, 255), alpha]).astype(np.uint8)
    img = Image.fromarray(out, 'RGBA')
    bbox = Image.fromarray((alpha > 8).astype(np.uint8) * 255).getbbox()
    img = img.crop(bbox)
    s = OUT_H / img.height
    return img.resize((max(1, round(img.width * s)), OUT_H), Image.LANCZOS)


def main(src: str):
    root = os.path.join(os.path.dirname(__file__), '..', 'public', 'assets')
    for f in sorted(os.listdir(src)):
        key = f[:8]
        if key not in CAST:
            continue
        kind, name = CAST[key]
        os.makedirs(os.path.join(root, kind), exist_ok=True)
        img = clean(os.path.join(src, f))
        dst = os.path.join(root, kind, name + '.webp')
        img.save(dst, 'WEBP', quality=88, method=6)
        print(f'{dst}  {img.width}x{img.height}  aspect {img.width / img.height:.3f}')


if __name__ == '__main__':
    main(sys.argv[1])
