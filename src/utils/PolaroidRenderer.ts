import type { PackageAsset } from '../assets/AssetRegistry';
import { addGrain, FONTS, makeCanvas } from './TextureGenerator';

// Composites a captured frame into a keepsake Polaroid: warm paper, vintage grade,
// handwritten caption, printed date and the pataka's own artwork as a postage stamp.

export const POLAROID = { w: 880, h: 1070, photo: 790, margin: 45 };

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

/** "12 Nov '26", the way a date is pencilled on a print. */
export function shortDate(ts: number) {
  const d = new Date(ts);
  const m = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getMonth()];
  return `${d.getDate()} ${m} '${String(d.getFullYear()).slice(-2)}`;
}

/**
 * A real instant print: an ivory frame with the classic proportions (square picture, deep
 * bottom margin) and nothing on it but the date. The frame is the captured game frame,
 * centre-cropped, with a gentle warm print grade.
 */
export async function composePolaroid(photoUrl: string, _pkg: PackageAsset, _caption: string, ts: number) {
  void _pkg;
  void _caption;
  const { w, h, photo, margin } = POLAROID;
  const { c, ctx } = makeCanvas(w, h);
  // ivory paper with a faint tooth
  ctx.fillStyle = '#FBF6EA';
  ctx.fillRect(0, 0, w, h);
  const sheen = ctx.createLinearGradient(0, 0, w, h);
  sheen.addColorStop(0, 'rgba(255,255,255,0.35)');
  sheen.addColorStop(1, 'rgba(214,196,160,0.22)');
  ctx.fillStyle = sheen;
  ctx.fillRect(0, 0, w, h);
  const img = await loadImg(photoUrl);
  await document.fonts?.load(`700 46px Kalam`).catch(() => null);
  const s = Math.max(photo / img.width, photo / img.height);
  ctx.save();
  ctx.beginPath();
  ctx.rect(margin, margin, photo, photo);
  ctx.clip();
  ctx.fillStyle = '#120a10';
  ctx.fillRect(margin, margin, photo, photo);
  // a square from the upper middle of the frame, a touch closer: the burst rises, the
  // parapet and floor in front of the camera are trimmed
  const side = Math.min(img.width, img.height) * 0.8;
  ctx.drawImage(img, (img.width - side) / 2, img.height * 0.02, side, side, margin, margin, photo, photo);
  void s;
  // print grade: warm mids, lifted blacks, soft corners
  ctx.globalCompositeOperation = 'soft-light';
  ctx.fillStyle = 'rgba(255,196,130,0.32)';
  ctx.fillRect(margin, margin, photo, photo);
  ctx.globalCompositeOperation = 'lighten';
  ctx.fillStyle = 'rgba(28,16,24,1)';
  ctx.fillRect(margin, margin, photo, photo);
  ctx.globalCompositeOperation = 'source-over';
  const vg = ctx.createRadialGradient(margin + photo / 2, margin + photo / 2, photo * 0.35, margin + photo / 2, margin + photo / 2, photo * 0.78);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(20,8,16,0.38)');
  ctx.fillStyle = vg;
  ctx.fillRect(margin, margin, photo, photo);
  ctx.restore();
  // the picture sits a hair below the paper
  ctx.strokeStyle = 'rgba(70,50,30,0.22)';
  ctx.lineWidth = 2;
  ctx.strokeRect(margin, margin, photo, photo);
  // only the date, pencilled at the bottom right
  ctx.fillStyle = '#5b2a2a';
  ctx.font = `700 46px ${FONTS.hand}`;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(shortDate(ts), w - margin - 10, margin + photo + (h - margin - photo) * 0.6);
  addGrain(ctx, w, h, 9, ts % 1000);
  return c.toDataURL('image/jpeg', 0.92);
}
