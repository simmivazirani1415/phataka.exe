import * as THREE from 'three';
import type { PackageAsset, PackageId } from './AssetRegistry';
import { PACKAGE_BY_ID, PACKAGES } from './AssetRegistry';
import { addGrain, FONTS, makeCanvas, mulberry32, toTexture } from '../utils/TextureGenerator';

// Canvas-generated packaging faces. Front artwork comes from the registry image when present;
// sides, back and top are always printed procedurally from the package palette so the box
// stays readable (the reference crops are not UV-unwrapped).

function drawBorders(ctx: CanvasRenderingContext2D, w: number, h: number, p: string[]) {
  const [primary, secondary, accent] = p;
  ctx.fillStyle = primary;
  ctx.fillRect(0, 0, w, h);
  const m = Math.min(w, h);
  ctx.strokeStyle = secondary;
  ctx.lineWidth = m * 0.06;
  ctx.strokeRect(m * 0.05, m * 0.05, w - m * 0.1, h - m * 0.1);
  ctx.strokeStyle = '#FFF0D2';
  ctx.lineWidth = m * 0.018;
  ctx.strokeRect(m * 0.11, m * 0.11, w - m * 0.22, h - m * 0.22);
  // little printed dots along the outer border
  ctx.fillStyle = accent;
  const step = m * 0.09;
  for (let x = m * 0.08; x < w - m * 0.05; x += step) {
    ctx.beginPath();
    ctx.arc(x, m * 0.05, m * 0.014, 0, Math.PI * 2);
    ctx.arc(x, h - m * 0.05, m * 0.014, 0, Math.PI * 2);
    ctx.fill();
  }
  for (let y = m * 0.08; y < h - m * 0.05; y += step) {
    ctx.beginPath();
    ctx.arc(m * 0.05, y, m * 0.014, 0, Math.PI * 2);
    ctx.arc(w - m * 0.05, y, m * 0.014, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawStar(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, points = 8) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const rad = i % 2 ? r * 0.42 : r;
    const a = (i / (points * 2)) * Math.PI * 2;
    ctx.lineTo(Math.cos(a) * rad, Math.sin(a) * rad);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function fitFont(ctx: CanvasRenderingContext2D, text: string, font: string, maxW: number, start: number) {
  let size = start;
  ctx.font = `${size}px ${font}`;
  while (ctx.measureText(text).width > maxW && size > 8) {
    size -= 2;
    ctx.font = `${size}px ${font}`;
  }
  return size;
}

export function drawSide(pkg: PackageAsset, w = 160, h = 512) {
  const { c, ctx } = makeCanvas(w, h);
  drawBorders(ctx, w, h, pkg.palette);
  ctx.save();
  ctx.translate(w / 2, h / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const name = pkg.name.toUpperCase();
  const size = fitFont(ctx, name, FONTS.display, h * 0.78, w * 0.42);
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.fillText(name, 3, 3);
  ctx.fillStyle = pkg.palette[2] === '#FFF0D2' ? '#FFD15A' : pkg.palette[2];
  ctx.fillText(name, 0, 0);
  ctx.font = `${Math.round(size * 0.36)}px ${FONTS.ui}`;
  ctx.fillStyle = '#FFF0D2';
  ctx.fillText(pkg.crackerLabel.toUpperCase() + ' · VIRTUAL', 0, size * 0.62);
  ctx.restore();
  drawStar(ctx, w / 2, h * 0.07 + 10, w * 0.16, pkg.palette[1]);
  drawStar(ctx, w / 2, h * 0.93 - 10, w * 0.16, pkg.palette[1]);
  addGrain(ctx, w, h, 16, w + h);
  return c;
}

export function drawBack(pkg: PackageAsset, index: number, w = 400, h = 512) {
  const { c, ctx } = makeCanvas(w, h);
  drawBorders(ctx, w, h, pkg.palette);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  // mandala
  ctx.save();
  ctx.translate(w / 2, h * 0.3);
  for (let i = 0; i < 12; i++) {
    ctx.rotate(Math.PI / 6);
    ctx.fillStyle = i % 2 ? pkg.palette[1] : '#FFF0D2';
    ctx.beginPath();
    ctx.ellipse(0, w * 0.13, w * 0.035, w * 0.09, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.beginPath();
  ctx.arc(0, 0, w * 0.08, 0, Math.PI * 2);
  ctx.fillStyle = pkg.palette[2];
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = '#FFF0D2';
  fitFont(ctx, `“${pkg.copy}”`, FONTS.hand, w * 0.78, 40);
  ctx.fillText(`“${pkg.copy}”`, w / 2, h * 0.58);
  ctx.font = `20px ${FONTS.ui}`;
  ctx.fillStyle = pkg.palette[1];
  const words = pkg.personality.split(' ');
  let line = '';
  let y = h * 0.67;
  for (const word of words) {
    const test = line ? line + ' ' + word : word;
    if (ctx.measureText(test).width > w * 0.74) {
      ctx.fillText(line, w / 2, y);
      line = word;
      y += 24;
    } else line = test;
  }
  ctx.fillText(line, w / 2, y);
  ctx.font = `17px ${FONTS.ui}`;
  ctx.fillStyle = '#FFF0D2';
  ctx.fillText(`Contains: 1 ${pkg.crackerLabel.toLowerCase()} (100% virtual)`, w / 2, h * 0.83);
  ctx.fillText(`Collectible ${index + 1} of 8 · Pataka.exe Mohalla`, w / 2, h * 0.87);
  addGrain(ctx, w, h, 16, index * 31);
  return c;
}

export function drawTop(pkg: PackageAsset, w = 256, h = 160) {
  const { c, ctx } = makeCanvas(w, h);
  drawBorders(ctx, w, h, pkg.palette);
  const r = mulberry32(w * 3 + pkg.name.length);
  for (let i = 0; i < 9; i++) drawStar(ctx, w * (0.15 + r() * 0.7), h * (0.2 + r() * 0.6), 6 + r() * 8, i % 2 ? pkg.palette[1] : '#FFF0D2', 6);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  fitFont(ctx, 'PATAKA.EXE', FONTS.display, w * 0.7, 34);
  ctx.fillStyle = '#FFF0D2';
  ctx.fillText('PATAKA.EXE', w / 2, h / 2);
  addGrain(ctx, w, h, 16, 99);
  return c;
}

/** Procedural front used until (or instead of) the illustrated artwork. */
export function drawFallbackFront(pkg: PackageAsset, w = 400, h = 512) {
  const { c, ctx } = makeCanvas(w, h);
  drawBorders(ctx, w, h, pkg.palette);
  ctx.save();
  ctx.translate(w / 2, h * 0.42);
  for (let i = 0; i < 24; i++) {
    ctx.rotate(Math.PI / 12);
    ctx.fillStyle = i % 2 ? pkg.palette[1] : pkg.palette[2];
    ctx.globalAlpha = 0.55;
    ctx.beginPath();
    ctx.moveTo(-12, 0);
    ctx.lineTo(12, 0);
    ctx.lineTo(0, w * 0.4);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.beginPath();
  ctx.arc(0, 0, w * 0.17, 0, Math.PI * 2);
  ctx.fillStyle = '#FFF0D2';
  ctx.fill();
  ctx.font = `${w * 0.16}px ${FONTS.display}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = pkg.palette[0];
  ctx.fillText(pkg.name.split(' ').map((s) => s[0]).join(''), 0, 4);
  ctx.restore();
  // speech bubble
  ctx.fillStyle = '#FFF0D2';
  ctx.beginPath();
  ctx.roundRect(w * 0.14, h * 0.07, w * 0.72, h * 0.12, 18);
  ctx.fill();
  ctx.fillStyle = pkg.palette[3];
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  fitFont(ctx, pkg.copy, FONTS.hand, w * 0.66, 30);
  ctx.fillText(pkg.copy, w / 2, h * 0.13);
  // title banner
  ctx.fillStyle = pkg.palette[2] === '#FFF0D2' ? '#CE382A' : '#CE382A';
  ctx.fillRect(w * 0.08, h * 0.7, w * 0.84, h * 0.17);
  ctx.fillStyle = '#FFD15A';
  fitFont(ctx, pkg.name.toUpperCase(), FONTS.display, w * 0.78, 52);
  ctx.fillText(pkg.name.toUpperCase(), w / 2, h * 0.79);
  ctx.font = `18px ${FONTS.ui}`;
  ctx.fillStyle = '#FFF0D2';
  ctx.fillText(pkg.crackerLabel.toUpperCase(), w / 2, h * 0.92);
  addGrain(ctx, w, h, 18, 5);
  return c;
}

// ---------------------------------------------------------------------------
// Image loading with procedural fallback

const imageCache = new Map<string, Promise<HTMLImageElement | null>>();
export function loadImage(url: string | null): Promise<HTMLImageElement | null> {
  if (!url) return Promise.resolve(null);
  let p = imageCache.get(url);
  if (!p) {
    p = new Promise((resolve) => {
      const img = new Image();
      img.decoding = 'async';
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = url;
    });
    imageCache.set(url, p);
  }
  return p;
}

export interface PackageMaterialSet {
  body: THREE.Material[]; // BoxGeometry order: +x, -x, +y, -y, +z(front), -z(back)
  lid: THREE.Material[];
  dispose: () => void;
}

const materialCache = new Map<PackageId, PackageMaterialSet>();

function printMat(map: THREE.Texture, metal = false) {
  return new THREE.MeshStandardMaterial({ map, roughness: metal ? 0.42 : 0.72, metalness: metal ? 0.25 : 0.02 });
}

export function getPackageMaterials(id: PackageId): PackageMaterialSet {
  const cached = materialCache.get(id);
  if (cached) return cached;
  const pkg = PACKAGE_BY_ID[id];
  const index = PACKAGES.indexOf(pkg);
  const side = toTexture(drawSide(pkg));
  const back = toTexture(drawBack(pkg, index));
  const top = toTexture(drawTop(pkg));
  const fallback = toTexture(drawFallbackFront(pkg));
  const inside = new THREE.MeshStandardMaterial({ color: '#9C7E58', roughness: 0.95 });
  const sideM = printMat(side, true);
  const backM = printMat(back);
  const topM = printMat(top, true);
  const frontM = printMat(fallback);
  const set: PackageMaterialSet = {
    body: [sideM, sideM, inside, inside, frontM, backM],
    lid: [sideM, sideM, topM, inside, frontM, backM],
    dispose: () => {
      [side, back, top, fallback].forEach((t) => t.dispose());
      [inside, sideM, backM, topM, frontM].forEach((m) => m.dispose());
    },
  };
  // Swap in the illustrated front when it loads; geometry and interaction are unaffected.
  loadImage(pkg.image.front).then((img) => {
    if (!img) return;
    const t = new THREE.Texture(img);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    t.needsUpdate = true;
    frontM.map = t;
    frontM.needsUpdate = true;
    fallback.dispose();
  });
  materialCache.set(id, set);
  return set;
}

/** Artwork for stamps/thumbnails. Prefers the flat front, then the reference crop, then procedural. */
export async function getStampSource(id: PackageId): Promise<CanvasImageSource> {
  const pkg = PACKAGE_BY_ID[id];
  const img = (await loadImage(pkg.image.front)) ?? (await loadImage(pkg.image.reference));
  return img ?? drawFallbackFront(pkg);
}

export function getThumbUrl(id: PackageId): string {
  const pkg = PACKAGE_BY_ID[id];
  return pkg.image.front ?? pkg.image.reference ?? drawFallbackFront(pkg).toDataURL('image/png');
}
