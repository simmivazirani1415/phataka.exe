import * as THREE from 'three';
import { getWorld } from '../world/WorldBuilder';

// Where the ident happens, derived from the real mohalla so the film and the game share one
// world: the tall cream house with rani-pink trim on the north side of the gali (building n3).

export const HERO_ID = 'n3';

export interface StoryWindow {
  x: number;
  y: number;
  z: number; // facade plane
  w: number;
  h: number;
  /** when the window's pieces land, and when its lamp comes on */
  land: number;
  light: number;
}

export interface IdentLayout {
  x0: number;
  x1: number;
  /** facade plane (fronts face +z, towards the gali) */
  zF: number;
  zB: number;
  roofY: number;
  windows: StoryWindow[];
  /** the round marigold medallion hung in window C (match-cuts into the chakri) */
  medallion: THREE.Vector3;
  medallionR: number;
  chakriStart: THREE.Vector3;
  chakriEnd: THREE.Vector3;
  anaar: THREE.Vector3;
  anaarMouth: THREE.Vector3;
  rocketBase: THREE.Vector3;
  burst: THREE.Vector3;
  ringR: number;
}

let cached: IdentLayout | null = null;

export function identLayout(): IdentLayout {
  if (cached) return cached;
  const b = getWorld().buildings[HERO_ID];
  const win = (floor: number, side: 'left' | 'right') => {
    const list = b.windows.filter((w) => w.floor === floor).sort((p, q) => p.pos[0] - q.pos[0]);
    return side === 'left' ? list[0] : list[list.length - 1];
  };
  const zF = b.zFront;
  const spec = [
    { w: win(1, 'left'), land: 0.16, light: 0.34 },
    { w: win(1, 'right'), land: 0.32, light: 0.52 },
    { w: win(2, 'right'), land: 0.48, light: 0.7 },
  ];
  const windows = spec.map(({ w, land, light }) => ({ x: w.pos[0], y: w.pos[1], z: zF, w: w.w, h: w.h, land, light }));
  const C = windows[2];
  const roofY = b.roofY;
  const chakriStart = new THREE.Vector3(b.x0 + 1.75, roofY + 0.05, zF - 2.7);
  const anaar = new THREE.Vector3(b.x0 + 3.05, roofY, zF - 1.75);
  const chakriEnd = new THREE.Vector3(anaar.x - 0.62, roofY + 0.05, anaar.z - 0.12);
  cached = {
    x0: b.x0,
    x1: b.x1,
    zF,
    zB: b.zBack,
    roofY,
    windows,
    medallion: new THREE.Vector3(C.x, C.y + 0.08, zF + 0.2),
    medallionR: 0.21,
    chakriStart,
    chakriEnd,
    anaar,
    anaarMouth: anaar.clone().add(new THREE.Vector3(0, 0.62, 0)),
    // a glass bottle on the front parapet, near the right-hand corner
    rocketBase: new THREE.Vector3(b.x1 - 0.95, roofY + 0.7, zF - 0.11),
    burst: new THREE.Vector3(-3.1, 21.6, zF + 2.0),
    ringR: 3.0,
  };
  return cached;
}

const _a = new THREE.Vector3();

/** Rocket flight: a gentle arc from the bottle to the burst point; u runs 0..1. */
export function rocketPath(u: number, out: THREE.Vector3) {
  const L = identLayout();
  const k = THREE.MathUtils.clamp(u, 0, 1);
  out.lerpVectors(L.rocketBase, L.burst, k);
  // a slight drift towards the gali, strongest mid-flight, and a little wobble off the stick
  out.x += Math.sin(k * Math.PI) * 0.55 + Math.sin(k * 23) * 0.025 * (1 - k);
  out.z += Math.sin(k * Math.PI) * 0.35;
  return out;
}

/** Unit direction of travel at u. */
export function rocketDir(u: number, out: THREE.Vector3) {
  const e = 0.004;
  rocketPath(Math.min(1, u + e), out);
  rocketPath(Math.max(0, u - e), _a);
  return out.sub(_a).normalize();
}

/** Asymmetric "snap" ease used by the block assembly shader, mirrored for non-instanced pieces. */
export function asmBack(t: number) {
  const c1 = 1.25;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

/** Vertical field of view for the film camera: portrait screens widen it so the frame still fits. */
export function filmFov(aspect: number) {
  const base = 38;
  const k = Math.min(2.3, Math.pow(Math.max(1, 1 / aspect), 0.85));
  return THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(base / 2)) * k));
}

/** Camera distance at which the burst frame fills ~60% of the shorter side (at the 38° base fov). */
export function ringDistance() {
  const L = identLayout();
  return L.ringR / (0.6 * Math.tan(THREE.MathUtils.degToRad(19)));
}
