"""Rectify the front face of each packaging reference crop into a clean flat texture.
Quads are (TL, TR, BR, BL) pixel corners of the printed front panel in each source image."""
import sys, json, os
from PIL import Image, ImageFilter, ImageEnhance

QUADS = {
    "rocket_bua":       [(10, 5), (272, 5), (270, 478), (5, 478)],
    "bomb_wale_chacha": [(56, 10), (360, 4), (362, 392), (64, 392)],
    "chakri_dadi":      [(10, 10), (290, 10), (290, 388), (5, 388)],
    "ladi_tauji":       [(46, 10), (306, 5), (306, 346), (46, 346)],
    "phuljhadi_mami":   [(5, 5), (326, 5), (322, 360), (5, 360)],
    "pop_pop_chotu":    [(50, 8), (340, 8), (345, 345), (55, 345)],
    "snake_wale_nana":  [(50, 25), (330, 25), (330, 360), (55, 360)],
}
src, out = sys.argv[1], sys.argv[2]
for pid, q in QUADS.items():
    im = Image.open(os.path.join(src, pid + ".png")).convert("RGB")
    (tl, tr, br, bl) = q
    w = int(round(((tr[0]-tl[0]) + (br[0]-bl[0])) / 2))
    h = int(round(((bl[1]-tl[1]) + (br[1]-tr[1])) / 2))
    scale = 512 / max(w, h)
    W, H = int(w*scale), int(h*scale)
    flat = im.transform((W, H), Image.QUAD, data=(*tl, *bl, *br, *tr), resample=Image.BICUBIC)
    flat = ImageEnhance.Sharpness(flat).enhance(1.15)
    flat.save(os.path.join(out, pid + "_front.jpg"), optimize=True)
    print(pid, W, H)
# Anaar Maasi is a tapered (frustum) box: keep the trapezoid and map it with UVs.
im = Image.open(os.path.join(src, "anaar_maasi.png")).convert("RGB")
box = (16, 6, 281, 500)
crop = im.crop(box)
s = 512 / crop.size[1]
crop = crop.resize((int(crop.size[0]*s), 512), Image.BICUBIC)
crop.save(os.path.join(out, "anaar_maasi_front.jpg"), optimize=True)
cw, ch = box[2]-box[0], box[3]-box[1]
tl, tr, br, bl = (100, 8), (188, 8), (279, 500), (18, 500)
uv = [((x-box[0])/cw, 1-(y-box[1])/ch) for (x, y) in (bl, br, tr, tl)]
print("anaar", crop.size, "uv(BL,BR,TR,TL)=", [tuple(round(v, 3) for v in p) for p in uv])
