import { PACKAGE_BY_ID, type PackageId } from '../assets/AssetRegistry';
import type { Memory } from './GameState';
import { composePolaroid } from '../utils/PolaroidRenderer';

/** Turns a real captured frame into a Polaroid memory. Never fabricates a memory. */
export async function createMemory(id: PackageId, photo: string): Promise<Memory> {
  const pkg = PACKAGE_BY_ID[id];
  const createdAt = Date.now();
  const polaroid = await composePolaroid(photo, pkg, pkg.polaroidCaption, createdAt);
  return { id: `${id}-${createdAt}`, packageId: id, caption: pkg.polaroidCaption, createdAt, polaroid, photo };
}
