import type { PackageId } from '../assets/AssetRegistry';
import { runtime } from '../game/Runtime';
import { BOX_SPOTS, STREET, chunkOf } from './StreetLayout';

// The way to a cracker's box from where the player stands, along the mohalla's walkable
// ground: into the middle of the gali, along it, then up to the box (in the chowk, which is
// open, straight across). Used for the arrows on the ground and the arrow on screen.

const GH = STREET.galiHalf;
const CH = STREET.chowkHalf;

const inChowk = (x: number, z: number) => chunkOf(x) === 0 && Math.abs(x) < CH - 0.5 && Math.abs(z) < CH - 0.5;

export function guidePath(id: PackageId): [number, number][] {
  const b = BOX_SPOTS[id].pos;
  const p = runtime.player;
  const pts: [number, number][] = [[p.x, p.z]];
  if (!(inChowk(p.x, p.z) && inChowk(b[0], b[2]))) {
    // out to the gali's middle, along it, and in to the box
    if (Math.abs(p.z) > GH - 1 && !inChowk(p.x, p.z)) pts.push([p.x, 0]);
    if (Math.abs(b[2]) > GH - 1 && !inChowk(b[0], b[2])) pts.push([b[0], 0]);
  }
  pts.push([b[0], b[2]]);
  return pts;
}

export function pathLength(pts: [number, number][]) {
  let d = 0;
  for (let i = 1; i < pts.length; i++) d += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  return d;
}

/** The point `ahead` metres along the path (for the on-screen arrow to point at). */
export function pointAlong(pts: [number, number][], ahead: number): [number, number] {
  let left = ahead;
  for (let i = 1; i < pts.length; i++) {
    const [x0, z0] = pts[i - 1];
    const [x1, z1] = pts[i];
    const seg = Math.hypot(x1 - x0, z1 - z0);
    if (seg >= left) {
      const t = seg > 0 ? left / seg : 0;
      return [x0 + (x1 - x0) * t, z0 + (z1 - z0) * t];
    }
    left -= seg;
  }
  return pts[pts.length - 1];
}
