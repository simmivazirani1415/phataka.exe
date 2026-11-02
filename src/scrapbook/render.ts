import { PACKAGES, type PackageId } from '../assets/AssetRegistry';
import type { Memory } from '../game/GameState';
import { mulberry32 } from '../utils/TextureGenerator';
import { loadImg, shortDate } from '../utils/PolaroidRenderer';
import { THEME_BY_ID, WASHI, type Band, type Theme } from './themes';
import type { PageKey, PageNote } from './notes';

// Paints scrapbook pages onto a canvas for sharing and downloading. Every page is laid out on
// a 1080 x 1350 card (4:5), the shape that reads well as an Instagram post, inside a Story
// and on X; Story (9:16) and X (16:9) frames place that card on the scrapbook's maroon cloth.

export type Format = 'post' | 'story' | 'x';
export const SIZES: Record<Format, [number, number]> = { post: [1080, 1350], story: [1080, 1920], x: [1600, 900] };
const CW = 1080;
const CH = 1350;

const DISPLAY = '"Rozha One", Georgia, serif';
const HAND = 'Kalam, "Comic Sans MS", cursive';
const UI = '"DM Sans", system-ui, sans-serif';
const MAROON = '#5a1226';
const INK = '#3a1620';

export interface BookData {
  memories: Memory[];
  notes: Partial<Record<PageKey, PageNote>>;
}

const LOGO = () => `${import.meta.env.BASE_URL}assets/intro/phataka_party_logo.webp`;
const LOGO_LIGHT = () => `${import.meta.env.BASE_URL}assets/intro/phataka_party_logo_light.webp`;

const cache = new Map<string, Promise<HTMLImageElement | null>>();
function img(src: string | null | undefined) {
  if (!src) return Promise.resolve(null);
  if (!cache.has(src)) cache.set(src, loadImg(src).catch(() => null));
  return cache.get(src)!;
}

let fontsReady: Promise<unknown> | null = null;
export function loadFonts() {
  if (!fontsReady) {
    const f = document.fonts;
    fontsReady = f
      ? Promise.all([`80px ${DISPLAY}`, `400 36px ${HAND}`, `700 36px ${HAND}`, `600 24px ${UI}`, `700 24px ${UI}`].map((s) => f.load(s).catch(() => null)))
      : Promise.resolve();
  }
  return fontsReady;
}

export const latest = (memories: Memory[], id: PackageId) =>
  memories.filter((m) => m.packageId === id).sort((a, b) => b.createdAt - a.createdAt)[0] ?? null;

// ---------- drawing helpers ----------

function paper(ctx: CanvasRenderingContext2D, w: number, h: number, tint: string, seed: number) {
  ctx.fillStyle = tint;
  ctx.fillRect(0, 0, w, h);
  const r = mulberry32(seed);
  for (let i = 0; i < 46; i++) {
    ctx.fillStyle = `rgba(140,100,55,${0.012 + r() * 0.03})`;
    ctx.beginPath();
    ctx.arc(r() * w, r() * h, 30 + r() * 160, 0, Math.PI * 2);
    ctx.fill();
  }
  // fibres
  ctx.strokeStyle = 'rgba(120,85,45,0.06)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 160; i++) {
    const x = r() * w;
    const y = r() * h;
    const a = r() * Math.PI;
    const l = 6 + r() * 18;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
    ctx.stroke();
  }
  // grain
  const id = ctx.getImageData(0, 0, w, h);
  const d = id.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (r() - 0.5) * 10;
    d[i] += n;
    d[i + 1] += n;
    d[i + 2] += n;
  }
  ctx.putImageData(id, 0, 0);
  const vg = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.45, w / 2, h / 2, Math.max(w, h) * 0.75);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(110,60,25,0.16)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, w, h);
}

function cloth(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.fillStyle = MAROON;
  ctx.fillRect(0, 0, w, h);
  const r = mulberry32(7);
  const id = ctx.getImageData(0, 0, w, h);
  const d = id.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (r() - 0.5) * 12;
    d[i] += n;
    d[i + 1] += n * 0.5;
    d[i + 2] += n * 0.6;
  }
  ctx.putImageData(id, 0, 0);
  const vg = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.75);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(20,0,8,0.45)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, w, h);
}

function band(ctx: CanvasRenderingContext2D, kind: Band, t: Theme, y: number, w: number) {
  const a = t.accent;
  const b = t.second;
  const c = t.third;
  ctx.save();
  ctx.globalAlpha = 0.9;
  const step = 54;
  switch (kind) {
    case 'scallop':
      ctx.fillStyle = a;
      for (let x = 0; x < w + step; x += step) {
        ctx.beginPath();
        ctx.arc(x, y, step / 2, 0, Math.PI);
        ctx.fill();
      }
      ctx.fillStyle = b;
      for (let x = 0; x < w + step; x += step) {
        ctx.beginPath();
        ctx.arc(x, y + 10, 5, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    case 'bunting':
      ctx.strokeStyle = 'rgba(60,30,20,0.4)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
      for (let x = 10, i = 0; x < w; x += step, i++) {
        ctx.fillStyle = [a, b, c][i % 3];
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + step - 10, y);
        ctx.lineTo(x + (step - 10) / 2, y + 40);
        ctx.closePath();
        ctx.fill();
      }
      break;
    case 'rays':
      for (let i = 0; i < 22; i++) {
        const x = (i / 21) * w;
        ctx.strokeStyle = i % 2 ? a : b;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(w / 2, y - 120);
        ctx.lineTo(x, y + 26);
        ctx.stroke();
      }
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillRect(0, y - 140, w, 130);
      ctx.globalCompositeOperation = 'source-over';
      break;
    case 'dots':
      for (let x = 24, i = 0; x < w; x += 36, i++) {
        ctx.fillStyle = [a, b, c][i % 3];
        ctx.beginPath();
        ctx.arc(x, y + 14 + (i % 2) * 10, 7, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    case 'zigzag':
      ctx.strokeStyle = a;
      ctx.lineWidth = 7;
      ctx.beginPath();
      for (let x = 0, i = 0; x <= w + 30; x += 30, i++) ctx.lineTo(x, y + (i % 2 ? 24 : 4));
      ctx.stroke();
      ctx.strokeStyle = b;
      ctx.lineWidth = 3;
      ctx.beginPath();
      for (let x = 0, i = 0; x <= w + 30; x += 30, i++) ctx.lineTo(x, y + 14 + (i % 2 ? 24 : 4));
      ctx.stroke();
      break;
    case 'stripes':
      ctx.fillStyle = a;
      ctx.fillRect(0, y, w, 16);
      ctx.fillStyle = b;
      ctx.fillRect(0, y + 22, w, 6);
      ctx.fillStyle = c;
      ctx.fillRect(0, y + 34, w, 3);
      break;
    case 'arches':
      ctx.strokeStyle = a;
      ctx.lineWidth = 5;
      for (let x = 0; x < w + 70; x += 70) {
        ctx.beginPath();
        ctx.arc(x, y + 40, 32, Math.PI, 0);
        ctx.stroke();
      }
      ctx.fillStyle = b;
      for (let x = 35; x < w; x += 70) {
        ctx.beginPath();
        ctx.arc(x, y + 14, 5, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    case 'confetti': {
      const r = mulberry32(11);
      for (let i = 0; i < 46; i++) {
        ctx.fillStyle = [a, b, c][i % 3];
        ctx.save();
        ctx.translate(r() * w, y + r() * 40);
        ctx.rotate(r() * Math.PI);
        ctx.fillRect(-7, -3, 14, 6);
        ctx.restore();
      }
      break;
    }
  }
  ctx.restore();
}

function shadowed(ctx: CanvasRenderingContext2D, fn: () => void, blur = 26, dy = 10) {
  ctx.save();
  ctx.shadowColor = 'rgba(40,18,10,0.32)';
  ctx.shadowBlur = blur;
  ctx.shadowOffsetY = dy;
  fn();
  ctx.restore();
}

function tape(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, rot: number, color: string) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.globalAlpha = 0.82;
  ctx.fillStyle = color;
  const h = w * 0.3;
  ctx.beginPath();
  ctx.moveTo(-w / 2, -h / 2);
  for (let i = 0; i <= 6; i++) ctx.lineTo(-w / 2 + (i % 2 ? 4 : 0), -h / 2 + (h * i) / 6);
  ctx.lineTo(w / 2, h / 2);
  for (let i = 6; i >= 0; i--) ctx.lineTo(w / 2 - (i % 2 ? 4 : 0), -h / 2 + (h * i) / 6);
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = 0.18;
  ctx.fillStyle = '#fff';
  ctx.fillRect(-w / 2, -h / 2, w, h * 0.35);
  ctx.restore();
}

function corners(ctx: CanvasRenderingContext2D, w: number, h: number, size: number, color = '#3a1a1a') {
  ctx.fillStyle = color;
  const pts: [number, number, number][] = [
    [-w / 2, -h / 2, 0],
    [w / 2, -h / 2, Math.PI / 2],
    [w / 2, h / 2, Math.PI],
    [-w / 2, h / 2, -Math.PI / 2],
  ];
  for (const [x, y, r] of pts) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(r);
    ctx.beginPath();
    ctx.moveTo(-6, -6);
    ctx.lineTo(size, -6);
    ctx.lineTo(-6, size);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}

/** Wraps text to a width; returns the lines. */
function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number) {
  const out: string[] = [];
  for (const para of text.split(/\n/)) {
    let line = '';
    for (const word of para.split(/\s+/)) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width > maxW && line) {
        out.push(line);
        line = word;
      } else line = test;
    }
    out.push(line);
  }
  return out;
}

/** Fits text into a box by shrinking the font; draws it and returns the height used. */
function fitText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, w: number, h: number, font: (px: number) => string, max: number, min: number, lh = 1.32) {
  let px = max;
  let lines: string[] = [];
  for (; px >= min; px -= 2) {
    ctx.font = font(px);
    lines = wrap(ctx, text, w);
    if (lines.length * px * lh <= h) break;
  }
  const maxLines = Math.max(1, Math.floor(h / (px * lh)));
  if (lines.length > maxLines) {
    lines = lines.slice(0, maxLines);
    lines[maxLines - 1] = lines[maxLines - 1].replace(/\s*\S*$/, '') + '…';
  }
  ctx.textBaseline = 'top';
  lines.forEach((l, i) => ctx.fillText(l, x, y + i * px * lh));
  return lines.length * px * lh;
}

async function drawPolaroid(ctx: CanvasRenderingContext2D, m: Memory | null, cx: number, cy: number, w: number, rot: number, tapeColor: string | null, cornerColor: string | null, emptyLine: string) {
  const h = w * (1070 / 880);
  const pic = m ? await img(m.polaroid) : null;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rot);
  shadowed(ctx, () => {
    if (pic) ctx.drawImage(pic, -w / 2, -h / 2, w, h);
    else {
      ctx.fillStyle = '#FBF6EA';
      ctx.fillRect(-w / 2, -h / 2, w, h);
    }
  });
  if (!pic) {
    const m2 = w * (45 / 880);
    const ps = w * (790 / 880);
    ctx.setLineDash([12, 10]);
    ctx.strokeStyle = 'rgba(90,50,40,0.35)';
    ctx.lineWidth = 3;
    ctx.strokeRect(-w / 2 + m2, -h / 2 + m2, ps, ps);
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(90,50,40,0.6)';
    ctx.font = `400 ${Math.round(w * 0.055)}px ${HAND}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(emptyLine, 0, -h / 2 + m2 + ps / 2);
  }
  if (cornerColor) corners(ctx, w, h, w * 0.09, cornerColor);
  ctx.restore();
  if (tapeColor) tape(ctx, cx + Math.sin(rot) * (h / 2), cy - Math.cos(rot) * (h / 2) + 4, w * 0.36, rot - 0.05, tapeColor);
}

async function drawPrint(ctx: CanvasRenderingContext2D, src: string | null | undefined, cx: number, cy: number, w: number, h: number, rot: number, border: number, cornerColor: string | null, cover = true) {
  const pic = await img(src);
  if (!pic) return;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rot);
  shadowed(ctx, () => {
    ctx.fillStyle = '#FFFBF2';
    ctx.fillRect(-w / 2 - border, -h / 2 - border, w + border * 2, h + border * 2);
  }, 20, 8);
  ctx.save();
  ctx.beginPath();
  ctx.rect(-w / 2, -h / 2, w, h);
  ctx.clip();
  const s = cover ? Math.max(w / pic.width, h / pic.height) : Math.min(w / pic.width, h / pic.height);
  ctx.drawImage(pic, -(pic.width * s) / 2, -(pic.height * s) / 2, pic.width * s, pic.height * s);
  ctx.restore();
  if (cornerColor) corners(ctx, w + border * 2, h + border * 2, Math.min(w, h) * 0.12, cornerColor);
  ctx.restore();
}

// ---------- the pages, on a 1080 x 1350 card ----------

async function relativeCard(ctx: CanvasRenderingContext2D, id: PackageId, data: BookData, year: number) {
  const t = THEME_BY_ID[id];
  const p = t.pkg;
  const i = PACKAGES.findIndex((x) => x.id === id);
  const m = latest(data.memories, id);
  const note = data.notes[id];
  paper(ctx, CW, CH, t.tint, 40 + i);
  band(ctx, t.band, t, 34, CW);
  // heading
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = t.accent;
  ctx.font = `92px ${DISPLAY}`;
  ctx.fillText(p.name, 70, 186, CW - 140);
  ctx.fillStyle = 'rgba(58,22,32,0.72)';
  ctx.font = `700 24px ${UI}`;
  ctx.letterSpacing = '3px';
  ctx.fillText(`${p.crackerLabel.toUpperCase()}  ·  ${p.copy.toUpperCase()}`, 74, 228, CW - 148);
  ctx.letterSpacing = '0px';

  const L = t.left;
  const polW = 560;
  const polX = L ? 70 + polW / 2 : CW - 70 - polW / 2;
  await drawPolaroid(ctx, m, polX, 270 + (polW * 1.216) / 2, polW, (t.tilt * Math.PI) / 180, t.attach === 'tape' ? WASHI[i % WASHI.length] : null, t.attach === 'corners' ? '#3a1a1a' : null, 'Not lit yet');

  // packaging label, pasted with corners
  const pkW = 300;
  const pkH = 400;
  const pkX = L ? CW - 70 - pkW / 2 - 10 : 70 + pkW / 2 + 10;
  await drawPrint(ctx, p.image.front ?? p.image.reference, pkX, 300 + pkH / 2, pkW, pkH, ((L ? 1 : -1) * 3.2 * Math.PI) / 180, 10, t.accent);
  // the playful line, from the packaging's own copy
  ctx.fillStyle = INK;
  ctx.textAlign = 'left';
  const lx = pkX - pkW / 2 - 4;
  fitText(ctx, `“${p.polaroidCaption}”`, lx, 740, pkW + 20, 120, (px) => `700 ${px}px ${HAND}`, 38, 26);
  ctx.fillStyle = 'rgba(58,22,32,0.7)';
  fitText(ctx, p.personality, lx, 850, pkW + 20, 80, (px) => `400 ${px}px ${HAND}`, 28, 20);

  // the note card and the player's own photo
  const photo = note?.photo ?? null;
  const ny = 1010;
  const nw = photo ? 650 : 940;
  const nh = 270;
  const nx = photo && !L ? CW - 70 - nw : 70;
  shadowed(ctx, () => {
    ctx.fillStyle = '#FFFBF3';
    ctx.fillRect(nx, ny, nw, nh);
  }, 16, 6);
  ctx.strokeStyle = 'rgba(160,120,90,0.25)';
  ctx.lineWidth = 2;
  for (let y = ny + 128; y < ny + nh - 10; y += 44) {
    ctx.beginPath();
    ctx.moveTo(nx + 28, y);
    ctx.lineTo(nx + nw - 28, y);
    ctx.stroke();
  }
  ctx.strokeStyle = t.accent;
  ctx.globalAlpha = 0.5;
  ctx.setLineDash([10, 8]);
  ctx.strokeRect(nx + 10, ny + 10, nw - 20, nh - 20);
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;
  ctx.fillStyle = t.accent;
  ctx.font = `700 40px ${HAND}`;
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(`To ${t.address} ♡`, nx + 34, ny + 70);
  const msg = note?.message?.trim();
  ctx.fillStyle = INK;
  if (msg) fitText(ctx, msg, nx + 34, ny + 86, nw - 68, nh - 104, (px) => `400 ${px}px ${HAND}`, 36, 22, 1.22);
  if (photo) {
    const px = nx === 70 ? CW - 70 - 130 : 70 + 130;
    await drawPrint(ctx, photo, px, ny + nh / 2 - 6, 240, 240, ((L ? 3 : -3) * Math.PI) / 180, 12, null);
    tape(ctx, px, ny + 8, 110, 0.08, WASHI[(i + 2) % WASHI.length]);
  }
  ctx.fillStyle = 'rgba(58,22,32,0.55)';
  ctx.font = `600 20px ${UI}`;
  ctx.textAlign = 'right';
  ctx.fillText(`Phataka Party  ·  Diwali ${year}`, CW - 70, CH - 32);
  ctx.textAlign = 'left';
  ctx.fillText(`${i + 2} / 9`, 70, CH - 32);
}

async function coverCard(ctx: CanvasRenderingContext2D, data: BookData, year: number) {
  paper(ctx, CW, CH, '#f6eddb', 3);
  // a thin double rule in the book's maroon and gold
  ctx.strokeStyle = MAROON;
  ctx.lineWidth = 5;
  ctx.strokeRect(40, 40, CW - 80, CH - 80);
  ctx.strokeStyle = '#c9932e';
  ctx.lineWidth = 2;
  ctx.strokeRect(54, 54, CW - 108, CH - 108);
  const logo = await img(LOGO());
  if (logo) {
    const w = 640;
    const h = (logo.height / logo.width) * w;
    ctx.drawImage(logo, CW / 2 - w / 2, 110, w, h);
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = MAROON;
  ctx.font = `700 26px ${UI}`;
  ctx.letterSpacing = '8px';
  ctx.fillText('A DIWALI SCRAPBOOK', CW / 2, 304);
  ctx.letterSpacing = '0px';
  const name = data.notes.cover?.message?.trim();
  ctx.fillStyle = INK;
  ctx.font = `700 52px ${HAND}`;
  ctx.fillText(name ? `${name}'s Phataka Memories` : 'Our Family Phataka Memories', CW / 2, 392, CW - 200);
  // the eight prints
  const cols = 4;
  const w = 200;
  const h = w * (1070 / 880);
  const gx = (CW - 140 - cols * w) / (cols - 1);
  for (let k = 0; k < PACKAGES.length; k++) {
    const p = PACKAGES[k];
    const col = k % cols;
    const row = Math.floor(k / cols);
    const cx = 70 + w / 2 + col * (w + gx);
    const cy = 470 + h / 2 + row * (h + 110);
    const m = latest(data.memories, p.id);
    await drawPolaroid(ctx, m, cx, cy, w, ((k % 2 ? 1.6 : -1.8) * Math.PI) / 180, WASHI[k % WASHI.length], null, '');
    ctx.fillStyle = m ? INK : 'rgba(58,22,32,0.45)';
    ctx.font = `700 26px ${HAND}`;
    ctx.textAlign = 'center';
    ctx.fillText(p.name, cx, cy + h / 2 + 44, w + 30);
  }
  const n = PACKAGES.filter((p) => latest(data.memories, p.id)).length;
  ctx.fillStyle = MAROON;
  ctx.font = `46px ${DISPLAY}`;
  ctx.fillText(`${n} Phataka ${n === 1 ? 'Memory' : 'Memories'}`, CW / 2, CH - 104);
  ctx.fillStyle = 'rgba(58,22,32,0.6)';
  ctx.font = `600 22px ${UI}`;
  ctx.fillText(`Diwali ${year}`, CW / 2, CH - 66);
}

async function card(key: PageKey, data: BookData, scale: number) {
  await loadFonts();
  const c = document.createElement('canvas');
  c.width = Math.round(CW * scale);
  c.height = Math.round(CH * scale);
  const ctx = c.getContext('2d')!;
  ctx.scale(scale, scale);
  const year = new Date().getFullYear();
  if (key === 'cover') await coverCard(ctx, data, year);
  else await relativeCard(ctx, key, data, year);
  return c;
}

/** One scrapbook page as a canvas, framed for a social format. */
export async function renderPage(key: PageKey, data: BookData, format: Format = 'post', scale = 1) {
  if (format === 'post') return card(key, data, scale);
  const [W, H] = SIZES[format];
  const c = document.createElement('canvas');
  c.width = W * scale;
  c.height = H * scale;
  const ctx = c.getContext('2d')!;
  ctx.scale(scale, scale);
  cloth(ctx, W, H);
  const pg = await card(key, data, scale * 1.2);
  const logo = await img(LOGO_LIGHT());
  if (format === 'story') {
    const w = 940;
    const h = (w * CH) / CW;
    const y = (H - h) / 2 + 30;
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.45)';
    ctx.shadowBlur = 40;
    ctx.shadowOffsetY = 16;
    ctx.drawImage(pg, (W - w) / 2, y, w, h);
    ctx.restore();
    if (logo) {
      const lw = 420;
      ctx.drawImage(logo, W / 2 - lw / 2, y - 60 - (logo.height / logo.width) * lw, lw, (logo.height / logo.width) * lw);
    }
    ctx.fillStyle = 'rgba(255,241,215,0.8)';
    ctx.font = `700 24px ${UI}`;
    ctx.textAlign = 'center';
    ctx.letterSpacing = '6px';
    ctx.fillText('A DIWALI SCRAPBOOK', W / 2, y + h + 70);
    ctx.letterSpacing = '0px';
  } else {
    const h = 820;
    const w = (h * CW) / CH;
    const x = W - w - 120;
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.45)';
    ctx.shadowBlur = 36;
    ctx.shadowOffsetY = 14;
    ctx.drawImage(pg, x, (H - h) / 2, w, h);
    ctx.restore();
    const lx = (x - 40) / 2 + 20;
    if (logo) {
      const lw = 520;
      ctx.drawImage(logo, lx - lw / 2, 300, lw, (logo.height / logo.width) * lw);
    }
    ctx.fillStyle = 'rgba(255,241,215,0.85)';
    ctx.font = `700 24px ${UI}`;
    ctx.textAlign = 'center';
    ctx.letterSpacing = '6px';
    ctx.fillText('A DIWALI SCRAPBOOK', lx, 470);
    ctx.letterSpacing = '0px';
    if (key !== 'cover') {
      ctx.fillStyle = '#f6c56a';
      ctx.font = `700 46px ${HAND}`;
      ctx.fillText(`For ${THEME_BY_ID[key].pkg.name}`, lx, 560, x - 80);
    }
  }
  return c;
}

export function canvasBlob(c: HTMLCanvasElement, type = 'image/jpeg', q = 0.92): Promise<Blob> {
  return new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not make the image'))), type, q));
}

export const PAGE_KEYS: PageKey[] = ['cover', ...PACKAGES.map((p) => p.id)];
export function pageFilename(key: PageKey, format: Format | 'page' = 'page') {
  const n = PAGE_KEYS.indexOf(key) + 1;
  const name = key === 'cover' ? 'cover' : key.replace(/_/g, '-');
  return `phataka-party-${String(n).padStart(2, '0')}-${name}${format === 'page' || format === 'post' ? '' : '-' + format}.jpg`;
}

export { shortDate };

// ---------- textures for the on-screen book, painted with the same hand ----------

const tex = new Map<string, string>();
/** The page's paper (and its relative's band) as an image, for the on-screen pages. */
export function pageTexture(key: PageKey | 'endpaper') {
  const k = String(key);
  if (tex.has(k)) return tex.get(k)!;
  const w = 540;
  const h = 675;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  if (key === 'endpaper') cloth(ctx, w, h);
  else if (key === 'cover') paper(ctx, w, h, '#f6eddb', 3);
  else {
    const t = THEME_BY_ID[key];
    paper(ctx, w, h, t.tint, 40 + PACKAGES.findIndex((p) => p.id === key));
    ctx.save();
    ctx.scale(0.5, 0.5);
    band(ctx, t.band, t, 34, CW);
    ctx.restore();
  }
  const url = c.toDataURL('image/jpeg', 0.86);
  tex.set(k, url);
  return url;
}
