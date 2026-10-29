import * as THREE from 'three';

export const FONTS = {
  display: '"Rozha One", "Georgia", serif',
  hand: '"Kalam", "Comic Sans MS", cursive',
  ui: '"Baloo 2", "Trebuchet MS", sans-serif',
};

export function makeCanvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  return { c, ctx };
}

/** Deterministic PRNG so procedural details are stable between visits. */
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function addGrain(ctx: CanvasRenderingContext2D, w: number, h: number, amount = 18, seed = 7) {
  const img = ctx.getImageData(0, 0, w, h);
  const r = mulberry32(seed);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (r() - 0.5) * amount;
    img.data[i] += n;
    img.data[i + 1] += n;
    img.data[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);
}

export function toTexture(c: HTMLCanvasElement, srgb = true) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  t.needsUpdate = true;
  return t;
}

let glowTex: THREE.Texture | null = null;
export function getGlowTexture() {
  if (glowTex) return glowTex;
  const { c, ctx } = makeCanvas(128, 128);
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.18, 'rgba(255,236,190,0.85)');
  g.addColorStop(0.45, 'rgba(255,190,90,0.25)');
  g.addColorStop(1, 'rgba(255,160,60,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  glowTex = toTexture(c);
  return glowTex;
}

/** A radial rangoli drawn on canvas, used as a decal on the ground. */
export function makeRangoliTexture(seed: number, colors: string[]) {
  const S = 512;
  const { c, ctx } = makeCanvas(S, S);
  const r = mulberry32(seed);
  ctx.translate(S / 2, S / 2);
  const rings = 5;
  for (let ring = rings; ring >= 1; ring--) {
    const rad = (ring / rings) * (S / 2 - 8);
    const petals = 8 + ring * 4;
    const col = colors[ring % colors.length];
    ctx.fillStyle = col;
    for (let p = 0; p < petals; p++) {
      const a = (p / petals) * Math.PI * 2;
      ctx.save();
      ctx.rotate(a);
      ctx.beginPath();
      ctx.moveTo(0, rad * 0.55);
      ctx.quadraticCurveTo(rad * 0.22, rad * 0.8, 0, rad);
      ctx.quadraticCurveTo(-rad * 0.22, rad * 0.8, 0, rad * 0.55);
      ctx.fill();
      ctx.restore();
    }
    ctx.beginPath();
    ctx.arc(0, 0, rad * 0.62, 0, Math.PI * 2);
    ctx.fillStyle = colors[(ring + 2) % colors.length];
    ctx.fill();
    // dotted chalk ring
    ctx.fillStyle = '#FFF6E2';
    const dots = petals * 2;
    for (let d = 0; d < dots; d++) {
      const a = (d / dots) * Math.PI * 2 + r() * 0.02;
      ctx.beginPath();
      ctx.arc(Math.cos(a) * rad * 0.6, Math.sin(a) * rad * 0.6, 2.4 + ring * 0.3, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.beginPath();
  ctx.arc(0, 0, 26, 0, Math.PI * 2);
  ctx.fillStyle = '#FFF6E2';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(0, 0, 14, 0, Math.PI * 2);
  ctx.fillStyle = colors[0];
  ctx.fill();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  // powder texture: knock out random specks so it looks hand-sprinkled
  const img = ctx.getImageData(0, 0, S, S);
  for (let i = 0; i < img.data.length; i += 4) {
    if (img.data[i + 3] > 0 && r() < 0.08) img.data[i + 3] = 120;
  }
  ctx.putImageData(img, 0, 0);
  return toTexture(c);
}

/** Hand-painted signboard text. */
export function makeSignTexture(opts: {
  w: number;
  h: number;
  bg: string;
  border: string;
  lines: { text: string; color: string; font: string; size: number; y: number }[];
}) {
  const { c, ctx } = makeCanvas(opts.w, opts.h);
  ctx.fillStyle = opts.bg;
  ctx.fillRect(0, 0, opts.w, opts.h);
  ctx.strokeStyle = opts.border;
  ctx.lineWidth = opts.h * 0.07;
  ctx.strokeRect(opts.h * 0.06, opts.h * 0.06, opts.w - opts.h * 0.12, opts.h - opts.h * 0.12);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const l of opts.lines) {
    ctx.font = `${l.size}px ${l.font}`;
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillText(l.text, opts.w / 2 + 3, l.y + 3);
    ctx.fillStyle = l.color;
    ctx.fillText(l.text, opts.w / 2, l.y);
  }
  addGrain(ctx, opts.w, opts.h, 22, opts.w);
  return toTexture(c);
}

/** Small cracker poster: simple shapes, vintage print feel. */
export function makePosterTexture(seed: number, bg: string, fg: string, title: string) {
  const { c, ctx } = makeCanvas(160, 220);
  const r = mulberry32(seed);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 160, 220);
  ctx.strokeStyle = fg;
  ctx.lineWidth = 6;
  ctx.strokeRect(8, 8, 144, 204);
  ctx.save();
  ctx.translate(80, 90);
  for (let i = 0; i < 16; i++) {
    ctx.rotate(Math.PI / 8);
    ctx.fillStyle = i % 2 ? fg : '#FFF0D2';
    ctx.fillRect(-3, 10, 6, 30 + r() * 20);
  }
  ctx.beginPath();
  ctx.arc(0, 0, 14, 0, Math.PI * 2);
  ctx.fillStyle = '#FFD15A';
  ctx.fill();
  ctx.restore();
  ctx.font = `30px ${FONTS.display}`;
  ctx.textAlign = 'center';
  ctx.fillStyle = '#FFF0D2';
  ctx.fillText(title, 80, 190);
  addGrain(ctx, 160, 220, 30, seed);
  return toTexture(c);
}

/** A family silhouette shown behind a lit window. */
export function makeSilhouetteTexture(kind: number) {
  const { c, ctx } = makeCanvas(128, 160);
  ctx.fillStyle = '#FFC861';
  ctx.fillRect(0, 0, 128, 160);
  ctx.fillStyle = '#2A1A10';
  const figs = kind % 2 === 0 ? [[44, 1], [86, 0.8]] : [[64, 1]];
  for (const [x, s] of figs) {
    ctx.beginPath();
    ctx.arc(x, 70 - 20 * (1 - s), 16 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(x, 160, 32 * s, 74 * s, 0, Math.PI, 0);
    ctx.fill();
  }
  if (kind === 1) {
    // raised arm with a sparkler
    ctx.fillRect(76, 40, 6, 50);
    ctx.fillStyle = '#FFF6D0';
    ctx.beginPath();
    ctx.arc(79, 36, 8, 0, Math.PI * 2);
    ctx.fill();
  }
  return toTexture(c);
}
