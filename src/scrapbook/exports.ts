import { downloadBlob } from '../utils/PDFGenerator';
import { canvasBlob, PAGE_KEYS, pageFilename, renderPage, type BookData, type Format } from './render';
import type { PageKey } from './notes';
import { THEME_BY_ID } from './themes';

// Sharing one page and exporting the whole book. Everything is made in the browser from the
// player's own Polaroids, photos and words; nothing is uploaded anywhere.

const tick = () => new Promise((r) => setTimeout(r, 0));

/** The whole book as a 9-page PDF, each page a 4:5 card at print resolution. */
export async function exportPdf(data: BookData, onProgress?: (p: number) => void) {
  const { jsPDF } = await import('jspdf');
  const W = 160;
  const H = 200;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: [W, H], compress: true });
  for (let i = 0; i < PAGE_KEYS.length; i++) {
    const c = await renderPage(PAGE_KEYS[i], data, 'post', 1.5);
    if (i > 0) doc.addPage([W, H], 'portrait');
    doc.addImage(c.toDataURL('image/jpeg', 0.9), 'JPEG', 0, 0, W, H, undefined, 'FAST');
    onProgress?.((i + 1) / PAGE_KEYS.length);
    await tick();
  }
  doc.setProperties({ title: 'Phataka Party: a Diwali scrapbook', creator: 'Phataka Party' });
  return downloadBlob(doc.output('blob'), 'phataka-party-scrapbook.pdf');
}

/** All nine pages as images, in one zip so the browser asks only once. */
export async function exportPages(data: BookData, onProgress?: (p: number) => void) {
  const files: { name: string; data: Uint8Array }[] = [];
  for (let i = 0; i < PAGE_KEYS.length; i++) {
    const c = await renderPage(PAGE_KEYS[i], data, 'post', 2);
    files.push({ name: pageFilename(PAGE_KEYS[i]), data: new Uint8Array(await (await canvasBlob(c)).arrayBuffer()) });
    onProgress?.((i + 1) / PAGE_KEYS.length);
    await tick();
  }
  return downloadBlob(zip(files), 'phataka-party-pages.zip');
}

/** The cover, sized for a social post. */
export async function exportCover(data: BookData) {
  const c = await renderPage('cover', data, 'post', 1);
  return downloadBlob(await canvasBlob(c), 'phataka-party-cover.jpg');
}

export async function pageImage(key: PageKey, data: BookData, format: Format) {
  const c = await renderPage(key, data, format, format === 'x' ? 1 : 1);
  const blob = await canvasBlob(c);
  return { blob, file: new File([blob], pageFilename(key, format), { type: 'image/jpeg' }) };
}

export function shareText(key: PageKey) {
  return key === 'cover' ? 'Our Diwali, in one little scrapbook. 🪔 #PhatakaParty' : `${THEME_BY_ID[key].pkg.name}, this one's for you. 🪔 #PhatakaParty`;
}

type Nav = Navigator & { canShare?: (d: ShareData) => boolean };
export function canShareFiles(file?: File) {
  const nav = navigator as Nav;
  const probe = file ?? new File([new Uint8Array(1)], 'x.jpg', { type: 'image/jpeg' });
  return !!nav.share && !!nav.canShare?.({ files: [probe] });
}

/** The phone's own share sheet with the image attached. */
export async function shareNative(file: File, text: string): Promise<'shared' | 'cancelled' | 'unsupported'> {
  if (!canShareFiles(file)) return 'unsupported';
  try {
    await (navigator as Nav).share({ files: [file], text, title: 'Phataka Party' });
    return 'shared';
  } catch (e) {
    return (e as Error).name === 'AbortError' ? 'cancelled' : 'unsupported';
  }
}

/**
 * WhatsApp can't take an image through a link, so: where the phone can share files, its share
 * sheet carries the image (WhatsApp is in it); everywhere else the image is saved first and
 * WhatsApp opens with the message, ready for the saved picture to be attached.
 */
export async function shareWhatsApp(file: File, text: string): Promise<'shared' | 'cancelled' | 'saved-and-opened'> {
  const r = await shareNative(file, text);
  if (r !== 'unsupported') return r;
  await downloadBlob(file, file.name);
  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
  return 'saved-and-opened';
}

// ---- a tiny "stored" zip writer (the JPEGs are already compressed) ----

const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(d: Uint8Array) {
  let c = 0xffffffff;
  for (let i = 0; i < d.length; i++) c = CRC[(c ^ d[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function zip(files: { name: string; data: Uint8Array }[]) {
  const enc = new TextEncoder();
  const parts: BlobPart[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const f of files) {
    const name = enc.encode(f.name);
    const crc = crc32(f.data);
    const h = new DataView(new ArrayBuffer(30));
    h.setUint32(0, 0x04034b50, true);
    h.setUint16(4, 20, true);
    h.setUint16(8, 0, true);
    h.setUint32(14, crc, true);
    h.setUint32(18, f.data.length, true);
    h.setUint32(22, f.data.length, true);
    h.setUint16(26, name.length, true);
    parts.push(h.buffer, name, f.data as BlobPart);
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true);
    c.setUint16(4, 20, true);
    c.setUint16(6, 20, true);
    c.setUint32(16, crc, true);
    c.setUint32(20, f.data.length, true);
    c.setUint32(24, f.data.length, true);
    c.setUint16(28, name.length, true);
    c.setUint32(42, offset, true);
    const entry = new Uint8Array(46 + name.length);
    entry.set(new Uint8Array(c.buffer), 0);
    entry.set(name, 46);
    central.push(entry);
    offset += 30 + name.length + f.data.length;
  }
  const size = central.reduce((s, e) => s + e.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, size, true);
  end.setUint32(16, offset, true);
  return new Blob([...parts, ...(central as BlobPart[]), end.buffer], { type: 'application/zip' });
}
