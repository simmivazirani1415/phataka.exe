import { PACKAGES, PACKAGE_BY_ID } from '../assets/AssetRegistry';
import type { Memory, PackageState } from '../game/GameState';
import type { PackageId } from '../assets/AssetRegistry';
import { getStampSource } from '../assets/PackageTextures';
import { addGrain, FONTS, makeCanvas, mulberry32 } from './TextureGenerator';
import { drawStamp, formatDate, loadImg } from './PolaroidRenderer';

// A5 landscape scrapbook (210 x 148 mm). Each page is painted on a canvas at ~200 dpi,
// compressed as JPEG and placed full-bleed, so typography and artwork never clip.

const MM = 8; // px per mm
const PW = 210 * MM;
const PH = 148 * MM;
export const PDF_FILENAME = 'pataka-exe-my-diwali-memories.pdf';

function paper(ctx: CanvasRenderingContext2D, seed: number, tint = '#F7EEDA') {
  ctx.fillStyle = tint;
  ctx.fillRect(0, 0, PW, PH);
  const r = mulberry32(seed);
  // soft fibres and foxing
  for (let i = 0; i < 70; i++) {
    ctx.fillStyle = `rgba(150,110,60,${0.02 + r() * 0.04})`;
    ctx.beginPath();
    ctx.arc(r() * PW, r() * PH, 20 + r() * 120, 0, Math.PI * 2);
    ctx.fill();
  }
  const vg = ctx.createRadialGradient(PW / 2, PH / 2, PH * 0.4, PW / 2, PH / 2, PW * 0.65);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(90,50,20,0.18)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, PW, PH);
}

function border(ctx: CanvasRenderingContext2D) {
  const m = 7 * MM;
  ctx.strokeStyle = '#CE382A';
  ctx.lineWidth = 2.2 * MM;
  ctx.strokeRect(m, m, PW - m * 2, PH - m * 2);
  ctx.strokeStyle = '#F5A623';
  ctx.lineWidth = 0.7 * MM;
  ctx.strokeRect(m + 3 * MM, m + 3 * MM, PW - m * 2 - 6 * MM, PH - m * 2 - 6 * MM);
  // corner paisley-ish dots
  const corners = [[m, m], [PW - m, m], [m, PH - m], [PW - m, PH - m]];
  for (const [x, y] of corners) {
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      ctx.fillStyle = i % 2 ? '#148C88' : '#D64A91';
      ctx.beginPath();
      ctx.arc(x + Math.cos(a) * 3.4 * MM, y + Math.sin(a) * 3.4 * MM, 1.1 * MM, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#FFD15A';
    ctx.beginPath();
    ctx.arc(x, y, 1.8 * MM, 0, Math.PI * 2);
    ctx.fill();
  }
}

function tape(ctx: CanvasRenderingContext2D, x: number, y: number, rot: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.fillStyle = 'rgba(245,215,150,0.75)';
  ctx.fillRect(-14 * MM, -3.5 * MM, 28 * MM, 7 * MM);
  ctx.restore();
}

function center(ctx: CanvasRenderingContext2D, text: string, y: number, font: string, color: string, maxW = PW * 0.8) {
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, PW / 2, y, maxW);
}

function diya(ctx: CanvasRenderingContext2D, x: number, y: number, s: number) {
  ctx.fillStyle = '#A9573B';
  ctx.beginPath();
  ctx.ellipse(x, y, 7 * s, 3 * s, 0, 0, Math.PI);
  ctx.fill();
  const g = ctx.createRadialGradient(x, y - 5 * s, 0, x, y - 5 * s, 14 * s);
  g.addColorStop(0, 'rgba(255,220,130,0.9)');
  g.addColorStop(1, 'rgba(255,180,80,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y - 5 * s, 14 * s, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#FFD15A';
  ctx.beginPath();
  ctx.ellipse(x, y - 5 * s, 1.8 * s, 4 * s, 0, 0, Math.PI * 2);
  ctx.fill();
}

async function photoPrint(ctx: CanvasRenderingContext2D, url: string, x: number, y: number, w: number, h: number, rot: number, padBottom = 0) {
  const img = await loadImg(url);
  ctx.save();
  ctx.translate(x + w / 2, y + h / 2);
  ctx.rotate(rot);
  ctx.shadowColor = 'rgba(40,20,10,0.35)';
  ctx.shadowBlur = 4 * MM;
  ctx.shadowOffsetY = 1.5 * MM;
  ctx.fillStyle = '#FFFBF1';
  const pad = 3 * MM;
  ctx.fillRect(-w / 2 - pad, -h / 2 - pad, w + pad * 2, h + pad * 2 + padBottom);
  ctx.shadowColor = 'transparent';
  const s = Math.max(w / img.width, h / img.height);
  ctx.beginPath();
  ctx.rect(-w / 2, -h / 2, w, h);
  ctx.clip();
  ctx.drawImage(img, -img.width * s / 2, -img.height * s / 2, img.width * s, img.height * s);
  ctx.restore();
}

export interface PdfInput {
  memories: Memory[];
  packages: Record<PackageId, PackageState>;
  worldPhoto: string | null;
  onProgress?: (p: number) => void;
}

export async function generateMemoryBook({ memories, packages, worldPhoto, onProgress }: PdfInput) {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a5', compress: true });
  const { c, ctx } = makeCanvas(PW, PH);
  const discovered = PACKAGES.filter((p) => packages[p.id] !== 'HIDDEN');
  const year = new Date().getFullYear();
  const pages: (() => Promise<void>)[] = [];

  // 1. cover
  pages.push(async () => {
    paper(ctx, 1, '#FBEFD6');
    border(ctx);
    center(ctx, 'MY DIWALI,', PH * 0.32, `${17 * MM}px ${FONTS.display}`, '#CE382A');
    center(ctx, 'MY MOHALLA', PH * 0.47, `${17 * MM}px ${FONTS.display}`, '#101A32');
    center(ctx, 'A little collection of big memories.', PH * 0.6, `${7 * MM}px ${FONTS.hand}`, '#5A3A22');
    for (let i = 0; i < 7; i++) diya(ctx, PW * (0.3 + i * 0.067), PH * 0.73, MM * 0.9);
    center(ctx, `Pataka.exe  ·  Diwali ${year}`, PH * 0.84, `600 ${4 * MM}px ${FONTS.ui}`, '#8A6A4A');
    const r = mulberry32(3);
    const shown = discovered.slice(0, 4);
    for (let i = 0; i < shown.length; i++) {
      const art = await getStampSource(shown[i].id);
      const left = i % 2 === 0;
      const x = left ? PW * 0.06 + r() * 20 : PW * 0.82 + r() * 20;
      const y = i < 2 ? PH * 0.14 : PH * 0.6;
      drawStamp(ctx, art, x, y, 24 * MM, 30 * MM, (r() - 0.5) * 0.4, shown[i].palette[0]);
    }
  });

  // 2. world photograph
  pages.push(async () => {
    paper(ctx, 2);
    center(ctx, 'Hamara Mohalla', 18 * MM, `${9 * MM}px ${FONTS.display}`, '#101A32');
    if (worldPhoto) {
      await photoPrint(ctx, worldPhoto, PW * 0.14, 30 * MM, PW * 0.72, PH * 0.6, -0.012);
      tape(ctx, PW * 0.16, 31 * MM, -0.5);
      tape(ctx, PW * 0.84, 31 * MM, 0.5);
    }
    center(ctx, `${discovered.length} of 8 patakas found  ·  ${memories.length} memories made`, PH - 16 * MM, `${5.5 * MM}px ${FONTS.hand}`, '#5A3A22');
  });

  // 3. collection overview
  pages.push(async () => {
    paper(ctx, 3);
    border(ctx);
    center(ctx, 'The Pataka Parivaar', 22 * MM, `${9 * MM}px ${FONTS.display}`, '#CE382A');
    const cols = 4;
    const cw = 38 * MM;
    const ch = 48 * MM;
    const gx = (PW - cols * cw) / (cols + 1);
    for (let i = 0; i < PACKAGES.length; i++) {
      const p = PACKAGES[i];
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = gx + col * (cw + gx);
      const y = 32 * MM + row * (ch + 4 * MM);
      if (packages[p.id] !== 'HIDDEN') {
        const art = await getStampSource(p.id);
        drawStamp(ctx, art, x + 6 * MM, y, cw - 12 * MM, ch - 16 * MM, (i % 2 ? 1 : -1) * 0.04, p.palette[0]);
        ctx.textAlign = 'center';
        ctx.fillStyle = '#2B1A12';
        ctx.font = `${4.2 * MM}px ${FONTS.display}`;
        ctx.fillText(p.name, x + cw / 2, y + ch - 9 * MM, cw);
        ctx.fillStyle = '#6A4A2A';
        ctx.font = `${3.2 * MM}px ${FONTS.hand}`;
        ctx.fillText(`“${p.copy}”`, x + cw / 2, y + ch - 3.5 * MM, cw);
      } else {
        ctx.setLineDash([2 * MM, 1.6 * MM]);
        ctx.strokeStyle = 'rgba(90,60,30,0.45)';
        ctx.lineWidth = 0.5 * MM;
        ctx.strokeRect(x + 6 * MM, y, cw - 12 * MM, ch - 16 * MM);
        ctx.setLineDash([]);
        ctx.textAlign = 'center';
        ctx.fillStyle = 'rgba(90,60,30,0.55)';
        ctx.font = `${3.4 * MM}px ${FONTS.hand}`;
        ctx.fillText('Agli Diwali...', x + cw / 2, y + (ch - 16 * MM) / 2, cw);
      }
    }
  });

  // 4. Polaroid pages, two per page
  for (let i = 0; i < memories.length; i += 2) {
    const pair = memories.slice(i, i + 2);
    pages.push(async () => {
      paper(ctx, 10 + i, i % 4 === 0 ? '#F7EEDA' : '#F4EADA');
      const r = mulberry32(i + 5);
      for (let k = 0; k < pair.length; k++) {
        const m = pair[k];
        const pkg = PACKAGE_BY_ID[m.packageId];
        const img = await loadImg(m.polaroid);
        const h = PH * 0.78;
        const w = (h * img.width) / img.height;
        const x = pair.length === 1 ? PW / 2 - w / 2 : k === 0 ? PW * 0.08 : PW * 0.92 - w;
        const y = PH * 0.1;
        ctx.save();
        ctx.translate(x + w / 2, y + h / 2);
        ctx.rotate((k === 0 ? -1 : 1) * (0.02 + r() * 0.03));
        ctx.shadowColor = 'rgba(40,20,10,0.35)';
        ctx.shadowBlur = 4 * MM;
        ctx.shadowOffsetY = 1.5 * MM;
        ctx.drawImage(img, -w / 2, -h / 2, w, h);
        ctx.restore();
        tape(ctx, x + w / 2, y + 1 * MM, (r() - 0.5) * 0.3);
        if (pair.length === 1 || k === 1) {
          ctx.save();
          ctx.translate(pair.length === 1 ? PW * 0.82 : PW * 0.5, PH * 0.86);
          ctx.rotate(-0.06);
          ctx.textAlign = 'center';
          ctx.fillStyle = '#5A3A22';
          ctx.font = `${4.4 * MM}px ${FONTS.hand}`;
          ctx.fillText(pkg.personality.length < 40 ? pkg.personality : '', 0, 0);
          ctx.restore();
        }
      }
      ctx.textAlign = 'right';
      ctx.fillStyle = 'rgba(90,60,30,0.6)';
      ctx.font = `${3 * MM}px ${FONTS.ui}`;
      ctx.fillText(formatDate(pair[0].createdAt), PW - 10 * MM, PH - 6 * MM);
    });
  }

  // 5. closing page
  pages.push(async () => {
    paper(ctx, 99, '#101A32');
    const r = mulberry32(8);
    for (let i = 0; i < 120; i++) {
      ctx.fillStyle = `rgba(255,220,150,${0.15 + r() * 0.5})`;
      ctx.beginPath();
      ctx.arc(r() * PW, r() * PH * 0.6, r() * 2.4, 0, Math.PI * 2);
      ctx.fill();
    }
    center(ctx, 'Patake toh khatam ho gaye.', PH * 0.42, `${10 * MM}px ${FONTS.display}`, '#FFF0D2');
    center(ctx, 'Yaadein nahi.', PH * 0.56, `${10 * MM}px ${FONTS.display}`, '#F5A623');
    for (let i = 0; i < 9; i++) diya(ctx, PW * (0.26 + i * 0.06), PH * 0.75, MM * 0.9);
    center(ctx, `Shubh Deepavali  ·  Pataka.exe ${year}`, PH * 0.88, `600 ${3.8 * MM}px ${FONTS.ui}`, 'rgba(255,240,210,0.7)');
  });

  for (let i = 0; i < pages.length; i++) {
    await pages[i]();
    addGrain(ctx, PW, PH, 10, i);
    const data = c.toDataURL('image/jpeg', 0.84);
    if (i > 0) doc.addPage('a5', 'landscape');
    doc.addImage(data, 'JPEG', 0, 0, 210, 148, undefined, 'FAST');
    onProgress?.((i + 1) / pages.length);
    await new Promise((r) => setTimeout(r, 0));
  }
  doc.setProperties({ title: 'My Diwali, My Mohalla — Pataka.exe', subject: 'A little collection of big memories.', creator: 'Pataka.exe' });
  return doc.output('blob');
}

type ClaudeHost = { use?: (name: string) => Promise<{ save: (r: { filename: string; data: Blob }) => Promise<unknown> } | null> };

/** Saves a file. Inside a claude.ai Artifact the viewer's download prompt is used; elsewhere a normal link download. Resolves false if the viewer declined. */
export async function downloadBlob(blob: Blob, name: string): Promise<boolean> {
  const host = (window as unknown as { claude?: ClaudeHost }).claude;
  if (host?.use) {
    const downloads = await host.use('downloads').catch(() => null);
    if (downloads) {
      try {
        await downloads.save({ filename: name, data: blob });
        return true;
      } catch (e) {
        if ((e as { code?: string }).code === 'declined') return false;
        throw e;
      }
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return true;
}

export async function dataUrlToPngBlob(dataUrl: string): Promise<Blob> {
  const img = await loadImg(dataUrl);
  const c = document.createElement('canvas');
  c.width = img.width;
  c.height = img.height;
  c.getContext('2d')!.drawImage(img, 0, 0);
  return new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error('png failed'))), 'image/png'));
}
