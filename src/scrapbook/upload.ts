// A photo the player adds to a page: checked, decoded, resized and re-encoded as a JPEG so it
// stays small in the browser's storage. Nothing leaves the device.

export const ACCEPT = 'image/jpeg,image/png,image/webp';
const TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_BYTES = 20 * 1024 * 1024;
const MAX_SIDE = 1600;

export class UploadError extends Error {}

export async function readPhoto(file: File): Promise<string> {
  if (!TYPES.includes(file.type)) throw new UploadError('Please choose a JPG, PNG or WebP photo.');
  if (file.size > MAX_BYTES) throw new UploadError('That photo is over 20 MB. Please choose a smaller one.');
  let src: CanvasImageSource & { width: number; height: number };
  let close = () => {};
  try {
    if ('createImageBitmap' in window) {
      const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' } as ImageBitmapOptions);
      src = bmp;
      close = () => bmp.close();
    } else {
      const url = URL.createObjectURL(file);
      src = await new Promise<HTMLImageElement>((resolve, reject) => {
        const i = new Image();
        i.onload = () => resolve(i);
        i.onerror = reject;
        i.src = url;
      });
      close = () => URL.revokeObjectURL(url);
    }
  } catch {
    throw new UploadError("We couldn't open that photo. Try another one.");
  }
  try {
    const s = Math.min(1, MAX_SIDE / Math.max(src.width, src.height));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(src.width * s));
    c.height = Math.max(1, Math.round(src.height * s));
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(src, 0, 0, c.width, c.height);
    const out = c.toDataURL('image/jpeg', 0.85);
    if (out.length < 100) throw new Error('empty');
    return out;
  } catch {
    throw new UploadError("We couldn't prepare that photo. Try another one.");
  } finally {
    close();
  }
}
