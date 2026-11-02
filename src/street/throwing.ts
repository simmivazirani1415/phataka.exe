import { create } from 'zustand';
import { PACKAGE_BY_ID, type PackageId, type Vec3 } from '../assets/AssetRegistry';
import { useGame } from '../game/GameState';
import { runtime } from '../game/Runtime';
import { audio } from '../audio/AudioEngine';
import { checkSpot, CLEARANCE, lightPlaced, ladiAxis, type PlaceCheck } from '../game/DiscoverySystem';
import { currentLevel, inRect, levelState, STREET } from './StreetLayout';

// Throwing: pick a cracker in the stash and it is in your hand. Press and hold on the scene
// (or on the cracker in your hand), aim with the pointer or finger, let go to throw. It flies
// on a real arc, bounces, settles and goes off where it lands. Only open, empty ground is a
// target: never people, animals, vehicles, balconies or homes.

export interface ThrowState {
  /** the cracker in the player's hand */
  armed: PackageId | null;
  /** holding to aim */
  aiming: boolean;
  /** where it would land, and whether that is allowed */
  target: { x: number; z: number; ok: boolean; snapped: boolean } | null;
  /** in the air */
  flying: boolean;
  hintSeen: boolean;
}

const HINT_KEY = 'phataka.throwHint';
const seen = (() => {
  try {
    return localStorage.getItem(HINT_KEY) === '1';
  } catch {
    return false;
  }
})();

export const useThrow = create<ThrowState>(() => ({ armed: null, aiming: false, target: null, flying: false, hintSeen: seen }));

export const THROW_PLACES = ['society', 'balcony'] as const;
export const canThrowHere = () => (THROW_PLACES as readonly string[]).includes(levelState.id);

export function arm(id: PackageId | null) {
  useThrow.setState({ armed: id, aiming: false, target: null });
  if (id) {
    audio.tap();
    buzz(8);
  }
}

export function markHintSeen() {
  if (useThrow.getState().hintSeen) return;
  useThrow.setState({ hintSeen: true });
  try {
    localStorage.setItem(HINT_KEY, '1');
  } catch {
    /* ignore */
  }
}

export function buzz(ms: number | number[]) {
  try {
    if (useGame.getState().settings.reducedMotion) return;
    navigator.vibrate?.(ms);
  } catch {
    /* not supported */
  }
}

/** How far a throw can reach from here (horizontal metres). */
export function reach() {
  return levelState.id === 'balcony' ? { min: 3.5, max: 17 } : { min: 2.2, max: 12.5 };
}

/** The floor a thrown cracker lands on: the road below the balcony, the courtyard in the society. */
export const landFloor = () => 0;

/** May a thrown cracker land here? Open ground, clear of people, animals and vehicles. */
export function checkThrow(id: PackageId, x: number, z: number): PlaceCheck {
  const L = currentLevel();
  const p = runtime.player;
  const d = Math.hypot(x - p.x, z - p.z);
  const r = reach();
  if (d > r.max + 0.01) return 'far';
  if (d < r.min - 0.01) return 'near';
  if (levelState.id === 'balcony') {
    // onto the chowk in front: not under the balcony, not on anyone's doorstep
    if (inRect(L.walk, x, z, 1.4) || z > STREET.chowkHalf - 3.2) return 'ground';
  }
  const base = checkSpot(id, x, z);
  if (base !== 'ok') return base;
  // nobody and nothing gets hit: keep the blast clear of people, animals and vehicles
  const type = PACKAGE_BY_ID[id].crackerType;
  const R = type === 'popPop' ? 1.1 : Math.max(1.4, CLEARANCE[type] * 0.85);
  for (const [kind, s] of runtime.solids) if (s(x, z, R, 0)) return kind;
  return 'ok';
}

/**
 * The landing spot for an aim at (x, z): there if allowed; otherwise the nearest allowed spot
 * close by, when it is close enough that the player would expect it to go there.
 */
export function resolveTarget(id: PackageId, x: number, z: number) {
  const p = runtime.player;
  // keep the aim inside the throwing range, along the line from the player
  const r = reach();
  let dx = x - p.x;
  let dz = z - p.z;
  const d = Math.hypot(dx, dz) || 1;
  const cd = Math.min(r.max, Math.max(r.min, d));
  dx = (dx / d) * cd;
  dz = (dz / d) * cd;
  const tx = p.x + dx;
  const tz = p.z + dz;
  if (checkThrow(id, tx, tz) === 'ok') return { x: tx, z: tz, ok: true, snapped: false };
  for (let rr = 0.4; rr <= 1.8; rr += 0.35) {
    const n = Math.max(8, Math.round(rr * 7));
    let best: [number, number] | null = null;
    let bd = Infinity;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const px = tx + Math.cos(a) * rr;
      const pz = tz + Math.sin(a) * rr;
      if (checkThrow(id, px, pz) !== 'ok') continue;
      // prefer spots on the same side as the aim, so it never feels like it jumped
      const k = Math.hypot(px - tx, pz - tz) - ((px - p.x) * dx + (pz - p.z) * dz) / (cd * cd) * 0.01;
      if (k < bd) {
        bd = k;
        best = [px, pz];
      }
    }
    if (best) return { x: best[0], z: best[1], ok: true, snapped: true };
  }
  return { x: tx, z: tz, ok: false, snapped: false };
}

/** A projectile arc from `from` to `to`, sampled at u in [0, 1]. */
export function arcHeight(from: Vec3, to: Vec3) {
  const d = Math.hypot(to[0] - from[0], to[2] - from[2]);
  // a lob: higher for longer throws, and from the balcony only a gentle rise
  const drop = from[1] - to[1];
  return Math.max(0.35, 0.5 + d * 0.16 - Math.max(0, drop) * 0.25);
}
export function arcPoint(from: Vec3, to: Vec3, h: number, u: number, out: { x: number; y: number; z: number }) {
  out.x = from[0] + (to[0] - from[0]) * u;
  out.z = from[2] + (to[2] - from[2]) * u;
  // a parabola through both ends with its extra height h at the middle (gravity's shape)
  out.y = from[1] + (to[1] - from[1]) * u + 4 * h * u * (1 - u);
  return out;
}
/** Flight time for a throw: what gravity gives for that arc, so it reads as real. */
export function flightTime(from: Vec3, to: Vec3, h: number) {
  const g = 9.8;
  // time to rise h above the straight line and fall back, with a little extra for the drop
  const t = 2 * Math.sqrt((2 * h) / g) + Math.max(0, from[1] - to[1]) * 0.035;
  return Math.max(0.55, Math.min(1.6, t));
}

let hazardId = 1000;

/**
 * The cracker has landed and settled at `pos`: it is lit where it lies and goes off with its
 * own effect and sound. The existing burst pipeline does the rest (Polaroid, scrapbook, uses).
 */
export async function landAndBurst(id: PackageId, pos: Vec3) {
  const g = useGame.getState();
  const type = PACKAGE_BY_ID[id].crackerType;
  runtime.hazards.push({ id: ++hazardId, pos, radius: CLEARANCE[type] });
  runtime.thrownAt = null;
  runtime.fireworks?.stage(id, pos, ladiAxis(pos[0], pos[2], true));
  if (g.active) g.setStep('spotlight');
  // people nearby hear it land and look over before it goes off
  runtime.emit({ kind: 'landed', pos, strength: 0.3 });
  await lightPlaced();
}
