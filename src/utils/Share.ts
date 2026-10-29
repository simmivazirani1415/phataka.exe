import type { Memory } from '../game/GameState';
import { PACKAGE_BY_ID } from '../assets/AssetRegistry';
import { dataUrlToPngBlob, downloadBlob } from './PDFGenerator';

export const SHARE_TEXT = 'Maine apni Diwali Pataka.exe mein banayi! Har ghar mein ek pataka hai. 🪔';

export function polaroidFilename(m: Memory) {
  return `pataka-exe-${m.packageId.replace(/_/g, '-')}-polaroid.png`;
}

export async function savePolaroid(m: Memory) {
  const blob = await dataUrlToPngBlob(m.polaroid);
  return downloadBlob(blob, polaroidFilename(m));
}

/** Web Share with the PNG when supported; otherwise downloads the image. Returns what happened. */
export async function sharePolaroid(m: Memory): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const blob = await dataUrlToPngBlob(m.polaroid);
  const file = new File([blob], polaroidFilename(m), { type: 'image/png' });
  const text = `${PACKAGE_BY_ID[m.packageId].name}: “${m.caption}” — ${SHARE_TEXT}`;
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (nav.share && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: 'My Diwali, My Mohalla', text });
      return 'shared';
    } catch (e) {
      if ((e as Error).name === 'AbortError') return 'cancelled';
    }
  }
  return (await downloadBlob(blob, polaroidFilename(m))) ? 'downloaded' : 'cancelled';
}

export async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
