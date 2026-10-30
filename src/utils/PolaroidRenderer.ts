import type { PackageAsset } from '../assets/AssetRegistry';
import { getStampSource } from '../assets/PackageTextures';
import { addGrain, FONTS, makeCanvas } from './TextureGenerator';
import { SITE } from '../config/site';

// Composites a captured frame into a keepsake Polaroid: warm paper, vintage grade,
// handwritten caption, printed date and the pataka's own artwork as a postage stamp.

export const POLAROID = { w: 900, h: 1090, photo: 800, margin: 50 };

export function loadImg(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

export function formatDate(ts: number) {
  try {
    return new Date(ts).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return new Date(ts).toDateString();
  }
}

/** Perforated postage stamp with the package artwork and a postmark. */
export function drawStamp(ctx: CanvasRenderingContext2D, art: CanvasImageSource, x: number, y: number, w: number, h: number, rot: number, color: string, label?: string) {
  ctx.save();
  ctx.translate(x + w / 2, y + h / 2);
  ctx.rotate(rot);
  ctx.shadowColor = 'rgba(40,20,10,0.25)';
  ctx.shadowBlur = 10;
  ctx.shadowOffsetY = 4;
  // stamp paper with scalloped edge
  ctx.fillStyle = '#FFF8EA';
  ctx.fillRect(-w / 2, -h / 2, w, h);
  ctx.shadowColor = 'transparent';
  ctx.globalCompositeOperation = 'destination-out';
  const r = 6;
  for (let px = -w / 2; px <= w / 2; px += r * 2.6) {
    ctx.beginPath();
    ctx.arc(px, -h / 2, r, 0, Math.PI * 2);
    ctx.arc(px, h / 2, r, 0, Math.PI * 2);
    ctx.fill();
  }
  for (let py = -h / 2; py <= h / 2; py += r * 2.6) {
    ctx.beginPath();
    ctx.arc(-w / 2, py, r, 0, Math.PI * 2);
    ctx.arc(w / 2, py, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';
  const pad = 14;
  ctx.fillStyle = color;
  ctx.fillRect(-w / 2 + pad - 4, -h / 2 + pad - 4, w - pad * 2 + 8, h - pad * 2 + 8);
  const aw = w - pad * 2;
  const ah = h - pad * 2 - (label ? 22 : 0);
  const iw = (art as HTMLImageElement).width || aw;
  const ih = (art as HTMLImageElement).height || ah;
  const s = Math.max(aw / iw, ah / ih);
  ctx.save();
  ctx.beginPath();
  ctx.rect(-w / 2 + pad, -h / 2 + pad, aw, ah);
  ctx.clip();
  ctx.drawImage(art, -iw * s / 2, -h / 2 + pad + ah / 2 - (ih * s) / 2, iw * s, ih * s);
  ctx.restore();
  if (label) {
    ctx.fillStyle = '#FFF8EA';
    ctx.font = `600 15px ${FONTS.ui}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, 0, h / 2 - pad - 8);
  }
  // postmark
  ctx.strokeStyle = 'rgba(40,30,60,0.45)';
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.arc(w * 0.32, -h * 0.28, w * 0.26, 0, Math.PI * 2);
  ctx.stroke();
  for (let i = 0; i < 4; i++) {
    ctx.beginPath();
    for (let k = 0; k <= 20; k++) {
      const px = w * 0.05 + k * (w * 0.05);
      const py = -h * 0.36 + i * 9 + Math.sin(k * 0.9) * 3;
      if (k === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();
  }
  ctx.font = `700 11px ${FONTS.ui}`;
  ctx.fillStyle = 'rgba(40,30,60,0.55)';
  ctx.textAlign = 'center';
  ctx.fillText('DIWALI', w * 0.32, -h * 0.3);
  ctx.fillText('MOHALLA', w * 0.32, -h * 0.25);
  ctx.restore();
}

export async function composePolaroid(photoUrl: string, pkg: PackageAsset, caption: string, ts: number) {
  const { w, h, photo, margin } = POLAROID;
  const { c, ctx } = makeCanvas(w, h);
  // paper
  const paper = ctx.createLinearGradient(0, 0, w, h);
  paper.addColorStop(0, '#FBF4E4');
  paper.addColorStop(1, '#F1E6CF');
  ctx.fillStyle = paper;
  ctx.fillRect(0, 0, w, h);
  // photo, centre-cropped to a square
  const img = await loadImg(photoUrl);
  const s = Math.max(photo / img.width, photo / img.height);
  ctx.save();
  ctx.beginPath();
  ctx.rect(margin, margin, photo, photo);
  ctx.clip();
  ctx.drawImage(img, margin + photo / 2 - (img.width * s) / 2, margin + photo / 2 - (img.height * s) / 2, img.width * s, img.height * s);
  // warm vintage grade + vignette
  ctx.globalCompositeOperation = 'soft-light';
  ctx.fillStyle = 'rgba(255,200,140,0.35)';
  ctx.fillRect(margin, margin, photo, photo);
  ctx.globalCompositeOperation = 'source-over';
  const vg = ctx.createRadialGradient(margin + photo / 2, margin + photo / 2, photo * 0.3, margin + photo / 2, margin + photo / 2, photo * 0.75);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(20,10,30,0.45)');
  ctx.fillStyle = vg;
  ctx.fillRect(margin, margin, photo, photo);
  ctx.restore();
  ctx.strokeStyle = 'rgba(60,40,20,0.18)';
  ctx.lineWidth = 2;
  ctx.strokeRect(margin, margin, photo, photo);
  // caption
  const by = margin + photo;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#2B1A12';
  ctx.font = `46px ${FONTS.display}`;
  ctx.fillText(pkg.name.toUpperCase(), margin + 12, by + 78);
  ctx.fillStyle = '#5A3A22';
  ctx.font = `36px ${FONTS.hand}`;
  ctx.fillText(`“${caption}”`, margin + 12, by + 132);
  ctx.fillStyle = 'rgba(70,55,40,0.7)';
  ctx.font = `500 21px ${FONTS.ui}`;
  ctx.fillText(`Diwali Night — ${SITE.name}  ·  ${formatDate(ts)}`, margin + 14, by + 182);
  // stamp, overlapping the photo corner
  const art = await getStampSource(pkg.id);
  drawStamp(ctx, art, w - margin - 150, by - 115, 140, 176, -0.09, pkg.palette[0]);
  addGrain(ctx, w, h, 14, ts % 1000);
  return c.toDataURL('image/jpeg', 0.9);
}
