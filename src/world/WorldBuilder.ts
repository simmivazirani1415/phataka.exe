import { BlockBuilder, type Block, type BlockInput } from './BlockBuilder';
import { PALETTE, type Vec3 } from '../assets/AssetRegistry';
import { mulberry32 } from '../utils/TextureGenerator';

// The whole mohalla is described here as data: blocks for geometry plus lists of lights,
// characters, strings of fairy lights and named anchors used by gameplay.

export const WORLD = { width: 48, depth: 36, floorH: 2.4, wall: 0.3 };
const FH = WORLD.floorH;
const WT = WORLD.wall;

/** Centre line of the winding gali. */
export const roadZ = (x: number) => 0.9 * Math.sin(x / 6.2 + 0.6);
const ROAD_HALF = 2.2;

export type GlowKind = 'diya' | 'bulb' | 'fairy' | 'lantern' | 'lamp' | 'sign';
export interface GlowSpec {
  pos: Vec3;
  color: string;
  size: number;
  flicker: number;
  stage: number; // lit from this progression stage
  appearStage: number; // geometry appears at this stage (diyas)
  group: number; // string id for chase animations (-1 = none)
  kind: GlowKind;
}
export interface StringSpec {
  id: number;
  points: Vec3[];
  stage: number;
  glowStart: number;
  glowCount: number;
}
export type CharKind = 'man' | 'woman' | 'elder' | 'child' | 'chaiwala' | 'dog';
export interface CharacterSpec {
  id: string;
  kind: CharKind;
  pos: Vec3;
  rotY: number;
  pose: 'stand' | 'sit' | 'sleep';
  anim: 'idle' | 'talk' | 'wave' | 'walk' | 'look';
  stage: number;
  colors: { top: string; bottom: string; drape?: string; hair: string; skin: string };
  walk?: [Vec3, Vec3];
  interactive?: 'child' | 'dog';
  name: string;
}
export interface WindowSpot {
  pos: Vec3;
  rotY: number;
  w: number;
  h: number;
}
export interface SignSpec {
  id: string;
  pos: Vec3;
  rotY: number;
  w: number;
  h: number;
  kind: 'shop' | 'chai' | 'gate' | 'poster' | 'mithai';
  seed?: number;
  stage?: number;
}
export interface PointLightSpec {
  id: string;
  pos: Vec3;
  color: string;
  intensity: number;
  distance: number;
  stage: number;
  lowGraphics: boolean; // kept in Low Graphics mode
}
export interface RangoliSpec {
  pos: Vec3;
  size: number;
  seed: number;
  colors: string[];
}
export interface DiyaSpec {
  pos: Vec3;
  glow: number;
  appearStage: number;
}
export interface Anchor {
  pos: Vec3;
  rotY?: number;
}

export interface World {
  blocks: Block[];
  glows: GlowSpec[];
  strings: StringSpec[];
  characters: CharacterSpec[];
  windows: WindowSpot[];
  signs: SignSpec[];
  lights: PointLightSpec[];
  rangolis: RangoliSpec[];
  diyas: DiyaSpec[];
  anchors: Record<string, Anchor>;
}

const WARM = ['#FFC35C', '#FFB347', '#FFD98A', '#FFCF70', '#FFA94D'];
const FAIRY = ['#FFD15A', '#FF8A5B', '#FFE7A3', '#F5A623', '#FF6F91', '#7FE3D6'];

export function buildWorld(): World {
  const b = new BlockBuilder();
  const rand = mulberry32(2026);
  const glows: GlowSpec[] = [];
  const strings: StringSpec[] = [];
  const characters: CharacterSpec[] = [];
  const windows: WindowSpot[] = [];
  const signs: SignSpec[] = [];
  const lights: PointLightSpec[] = [];
  const rangolis: RangoliSpec[] = [];
  const diyas: DiyaSpec[] = [];
  const anchors: Record<string, Anchor> = {};

  const glow = (g: Partial<GlowSpec> & { pos: Vec3; color: string; size: number }) => {
    glows.push({ flicker: 0.1, stage: 0, appearStage: 0, group: -1, kind: 'bulb', ...g });
    return glows.length - 1;
  };

  const diya = (x: number, y: number, z: number, appearStage = 0) => {
    b.add({ w: 0.2, h: 0.08, d: 0.2, x, y: y + 0.04, z, color: '#B8613A', mat: 'diya', shape: 'cyl', appearStage, bevel: 0 });
    const g = glow({ pos: [x, y + 0.17, z], color: '#FFB547', size: 0.75, flicker: 0.35, kind: 'diya', appearStage });
    diyas.push({ pos: [x, y, z], glow: g, appearStage });
  };

  /** A sagging string of fairy lights through the given points. */
  const fairyString = (pts: Vec3[], stage: number, spacing = 0.32, palette = FAIRY) => {
    const id = strings.length;
    const glowStart = glows.length;
    for (let s = 0; s < pts.length - 1; s++) {
      const [a, c] = [pts[s], pts[s + 1]];
      const len = Math.hypot(c[0] - a[0], c[1] - a[1], c[2] - a[2]);
      const n = Math.max(2, Math.round(len / spacing));
      const sag = Math.min(0.6, len * 0.08);
      for (let i = s === 0 ? 0 : 1; i <= n; i++) {
        const t = i / n;
        glow({
          pos: [a[0] + (c[0] - a[0]) * t, a[1] + (c[1] - a[1]) * t - Math.sin(t * Math.PI) * sag, a[2] + (c[2] - a[2]) * t],
          color: palette[(i + s) % palette.length],
          size: 0.42,
          flicker: 0.15,
          stage,
          group: id,
          kind: 'fairy',
        });
      }
    }
    strings.push({ id, points: pts, stage, glowStart, glowCount: glows.length - glowStart });
    return id;
  };

  const marigoldGarland = (x0: number, x1: number, y: number, fixed: number, axis: 'x' | 'z' = 'x') => {
    const n = Math.max(3, Math.round(Math.abs(x1 - x0) / 0.16));
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const p = x0 + (x1 - x0) * t;
      const sag = Math.sin(t * Math.PI) * 0.18;
      const col = i % 3 === 0 ? '#FFD15A' : '#F28C28';
      if (axis === 'x') b.add({ w: 0.13, h: 0.13, d: 0.13, x: p, y: y - sag, z: fixed, color: col, mat: 'fabric', shape: 'sphere', bevel: 0 });
      else b.add({ w: 0.13, h: 0.13, d: 0.13, x: fixed, y: y - sag, z: p, color: col, mat: 'fabric', shape: 'sphere', bevel: 0 });
    }
  };

  const pottedPlant = (x: number, y: number, z: number, s = 1, color = '#3C8D4F') => {
    b.add({ w: 0.42 * s, h: 0.4 * s, d: 0.42 * s, x, y: y + 0.2 * s, z, color: '#A9573B', mat: 'clay', shape: 'cyl' });
    b.add({ w: 0.5 * s, h: 0.06, d: 0.5 * s, x, y: y + 0.4 * s, z, color: '#8E4630', mat: 'clay', shape: 'cyl' });
    const n = 3 + Math.floor(rand() * 3);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rand();
      const r = 0.14 * s;
      b.add({
        w: 0.26 * s, h: (0.3 + rand() * 0.3) * s, d: 0.26 * s,
        x: x + Math.cos(a) * r, y: y + (0.6 + rand() * 0.15) * s, z: z + Math.sin(a) * r,
        color: shade(color, (rand() - 0.5) * 0.2), mat: 'leaf', ry: rand() * 3, rz: (rand() - 0.5) * 0.4,
      });
    }
    if (rand() > 0.5) b.add({ w: 0.12, h: 0.12, d: 0.12, x, y: y + 0.95 * s, z, color: '#E83F7A', mat: 'leaf', shape: 'sphere', bevel: 0 });
  };

  const lantern = (x: number, y: number, z: number, color: string, stage: number) => {
    b.add({ w: 0.02, h: 0.35, d: 0.02, x, y: y + 0.42, z, color: '#2A2A2A', mat: 'metal', bevel: 0 });
    b.add({ w: 0.42, h: 0.5, d: 0.42, x, y, z, color: shade(color, -0.45), litColor: color, stage, mat: 'glow', shape: 'cyl', ry: Math.PI / 8 });
    b.add({ w: 0.5, h: 0.06, d: 0.5, x, y: y + 0.27, z, color: '#F5D27A', mat: 'glow', litColor: '#FFE7A3', stage, shape: 'cyl' });
    b.add({ w: 0.5, h: 0.06, d: 0.5, x, y: y - 0.27, z, color: '#F5D27A', mat: 'glow', litColor: '#FFE7A3', stage, shape: 'cyl' });
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      b.add({ w: 0.03, h: 0.3, d: 0.03, x: x + Math.cos(a) * 0.18, y: y - 0.44, z: z + Math.sin(a) * 0.18, color: '#F5A623', mat: 'fabric', bevel: 0 });
    }
    glow({ pos: [x, y, z], color, size: 1.9, flicker: 0.12, stage, kind: 'lantern' });
  };

  const bicycle = (x: number, z: number, rotY: number, lean: number, color: string) => {
    const c = Math.cos(rotY);
    const s = Math.sin(rotY);
    const at = (u: number, v: number): [number, number] => [x + u * c + v * s, z - u * s + v * c];
    for (const u of [-0.42, 0.42]) {
      const [px, pz] = at(u, 0);
      b.add({ w: 0.62, h: 0.62, d: 0.05, x: px, y: 0.31, z: pz, color: '#1E1E22', mat: 'metal', shape: 'cyl', rx: Math.PI / 2, ry: rotY, rz: lean });
    }
    const [fx, fz] = at(0, 0);
    b.add({ w: 0.86, h: 0.05, d: 0.05, x: fx, y: 0.52, z: fz, color, mat: 'metal', ry: rotY, rz: lean });
    b.add({ w: 0.05, h: 0.42, d: 0.05, x: fx - 0.05 * c, y: 0.55, z: fz + 0.05 * s, color, mat: 'metal', ry: rotY, rz: lean + 0.3 });
    const [hx, hz] = at(0.38, 0);
    b.add({ w: 0.05, h: 0.4, d: 0.05, x: hx, y: 0.62, z: hz, color, mat: 'metal', ry: rotY, rz: lean });
    b.add({ w: 0.05, h: 0.05, d: 0.42, x: hx, y: 0.82, z: hz, color: '#222', mat: 'metal', ry: rotY });
    const [sx, sz] = at(-0.2, 0);
    b.add({ w: 0.22, h: 0.06, d: 0.12, x: sx, y: 0.8, z: sz, color: '#3A2A20', mat: 'fabric', ry: rotY });
  };

  // -------------------------------------------------------------------------
  // GROUND: a floating platform assembled in sections, with stepped soil layers below.
  b.setPhase('seed', 'seed', 0);
  b.box(-2, -0.5, -2, 2, 0, 2, '#D6CBB5', { mat: 'stone', bevel: 0.08 });
  b.setPhase('ground', 'slide');
  const W2 = WORLD.width / 2;
  const D2 = WORLD.depth / 2;
  for (let gx = -W2; gx < W2; gx += 4) {
    for (let gz = -D2; gz < D2; gz += 4) {
      if (gx === -2 && gz === -2) continue;
      const gz1 = Math.min(gz + 4, D2);
      const inCourt = gx >= -6 && gx < 6 && gz >= 4;
      const base = inCourt ? '#B98E64' : '#C4B79D';
      b.setOrder(Math.hypot(gx + 2, gz + 2));
      b.box(gx + 0.03, -0.5, gz + 0.03, gx + 3.97, 0, gz1 - 0.03, shade(base, (rand() - 0.5) * 0.07), { mat: 'stone', bevel: 0.07 });
    }
  }
  const layers: [number, number, number, string][] = [
    [-0.5, -1.7, 0, '#8F4E33'],
    [-1.7, -2.8, 1.6, '#733B28'],
    [-2.8, -3.7, 4.5, '#542C20'],
  ];
  layers.forEach(([y0, y1, inset, col], li) => {
    const sx = 8;
    for (let x = -W2 + inset; x < W2 - inset - 0.01; x += sx) {
      const x1 = Math.min(x + sx, W2 - inset);
      for (const [z0, z1] of [[-D2 + inset, 0], [0, D2 - inset]]) {
        b.setOrder(20 + li * 5 + Math.abs(x));
        b.box(x + 0.02, y1, z0, x1 - 0.02, y0, z1, shade(col, (rand() - 0.5) * 0.06), { mat: 'stone', bevel: 0.1 });
      }
    }
  });

  // -------------------------------------------------------------------------
  // ROADS: the winding central gali with a drainage edge and kerb.
  b.setPhase('road', 'drop');
  for (let x = -W2; x < W2; x += 1) {
    const zc = roadZ(x + 0.5);
    b.setOrder(x);
    b.box(x + 0.02, -0.02, zc - ROAD_HALF, x + 0.98, 0.06, zc - 0.02, shade('#5E6475', (rand() - 0.5) * 0.08), { mat: 'stone', bevel: 0.03 });
    b.box(x + 0.02, -0.02, zc + 0.02, x + 0.98, 0.06, zc + ROAD_HALF, shade('#5E6475', (rand() - 0.5) * 0.08), { mat: 'stone', bevel: 0.03 });
    if (x % 3 === 0) b.box(x + 0.25, 0.06, zc - 0.05, x + 0.75, 0.075, zc + 0.05, '#C9C2B0', { mat: 'stone', bevel: 0 });
    for (const side of [-1, 1]) {
      const edge = zc + side * ROAD_HALF;
      b.box(x + 0.01, -0.08, Math.min(edge, edge + side * 0.36), x + 0.99, 0.0, Math.max(edge, edge + side * 0.36), '#2C3140', { mat: 'stone', bevel: 0.02 });
      const k0 = edge + side * 0.36;
      b.box(x + 0.01, 0, Math.min(k0, k0 + side * 0.2), x + 0.99, 0.16, Math.max(k0, k0 + side * 0.2), '#B9B2A3', { mat: 'stone', bevel: 0.02 });
    }
  }
  const frontN = (x0: number, x1: number) => {
    let m = Infinity;
    for (let x = x0; x <= x1; x += 0.5) m = Math.min(m, roadZ(x));
    return m - ROAD_HALF - 1.35;
  };
  const frontS = (x0: number, x1: number) => {
    let m = -Infinity;
    for (let x = x0; x <= x1; x += 0.5) m = Math.max(m, roadZ(x));
    return m + ROAD_HALF + 1.55;
  };

  // -------------------------------------------------------------------------
  // BUILDINGS
  interface BOpts {
    id: string;
    x0: number;
    x1: number;
    zFront: number;
    depth: number;
    front: 1 | -1;
    floors: number;
    wall: string;
    trim: string;
    accent: string;
    order: number;
    windows?: number;
    door?: number;
    balcony?: { floor: number; w: number; offset?: number; decorated?: boolean; stage?: number };
    parapet?: 'solid' | 'jaali' | 'rail';
    roofRoom?: { kind: 'tile' | 'mumty'; side: 'left' | 'right' };
    tank?: 'left' | 'right';
    stairs?: 'left' | 'right';
    shop?: boolean;
    setback?: number;
    lightsStage?: number;
  }
  interface BInfo {
    roofY: number;
    zFront: number;
    zBack: number;
    xc: number;
    balcony?: { x: number; y: number; z: number; w: number };
    door?: { x: number; z: number };
    tank?: { x: number; z: number };
    roofRoomZone?: [number, number, number, number];
  }

  const windowStage = (forced?: number) => {
    if (forced !== undefined) return forced;
    const r = rand();
    return r < 0.4 ? 0 : 1 + Math.floor(rand() * 8);
  };

  function wallRun(axis: 'x' | 'z', a0: number, a1: number, fixed: number, y0: number, y1: number, color: string, extra: Partial<BlockInput> = {}) {
    const len = a1 - a0;
    const n = Math.max(1, Math.round(len / 2.2));
    for (let i = 0; i < n; i++) {
      const s0 = a0 + (len * i) / n;
      const s1 = a0 + (len * (i + 1)) / n;
      const col = shade(color, (rand() - 0.5) * 0.05);
      if (axis === 'x') b.box(s0, y0, fixed - WT / 2, s1, y1, fixed + WT / 2, col, { bevel: 0.04, ...extra });
      else b.box(fixed - WT / 2, y0, s0, fixed + WT / 2, y1, s1, col, { bevel: 0.04, ...extra });
    }
  }

  function addWindow(x: number, yc: number, zPlane: number, front: 1 | -1, trim: string, accent: string, tile: string, stage: number, opts: { shutters?: boolean; chajja?: boolean; w?: number; h?: number } = {}) {
    const w = opts.w ?? 0.78;
    const h = opts.h ?? 1.05;
    b.add({ w: w + 0.2, h: h + 0.2, d: 0.1, x, y: yc, z: zPlane + front * 0.03, color: trim, bevel: 0.02 });
    b.add({ w, h, d: 0.1, x, y: yc, z: zPlane + front * 0.05, color: '#18213A', litColor: WARM[Math.floor(rand() * WARM.length)], stage, mat: 'glass', bevel: 0 });
    b.add({ w: 0.05, h, d: 0.04, x, y: yc, z: zPlane + front * 0.11, color: trim, bevel: 0 });
    b.add({ w: w + 0.3, h: 0.1, d: 0.16, x, y: yc - h / 2 - 0.12, z: zPlane + front * 0.08, color: trim, bevel: 0.02 });
    if (opts.shutters) {
      for (const s of [-1, 1]) b.add({ w: w * 0.45, h: h + 0.05, d: 0.05, x: x + s * (w * 0.5 + w * 0.27), y: yc, z: zPlane + front * 0.07, color: accent, mat: 'wood', bevel: 0.01 });
    }
    if (opts.chajja !== false) {
      b.add({ w: w + 0.45, h: 0.07, d: 0.42, x, y: yc + h / 2 + 0.2, z: zPlane + front * 0.2, rx: front * 0.24, color: tile, mat: 'tile', bevel: 0.01 });
    }
    windows.push({ pos: [x, yc, zPlane + front * 0.12], rotY: front === 1 ? 0 : Math.PI, w, h });
  }

  function addSideWindow(xPlane: number, yc: number, z: number, side: 1 | -1, trim: string, stage: number) {
    b.add({ w: 0.1, h: 1.15, d: 0.9, x: xPlane + side * 0.03, y: yc, z, color: trim, bevel: 0.02 });
    b.add({ w: 0.1, h: 0.95, d: 0.7, x: xPlane + side * 0.05, y: yc, z, color: '#18213A', litColor: WARM[Math.floor(rand() * WARM.length)], stage, mat: 'glass', bevel: 0 });
  }

  function railing(axis: 'x' | 'z', a0: number, a1: number, fixed: number, y: number, h: number, color: string, postColor = color) {
    const len = a1 - a0;
    const n = Math.max(2, Math.round(len / 0.3));
    for (let i = 0; i <= n; i++) {
      const p = a0 + (len * i) / n;
      const big = i === 0 || i === n || i % 5 === 0;
      const s = big ? 0.09 : 0.045;
      if (axis === 'x') b.add({ w: s, h, d: s, x: p, y: y + h / 2, z: fixed, color: big ? postColor : color, mat: 'metal', bevel: 0 });
      else b.add({ w: s, h, d: s, x: fixed, y: y + h / 2, z: p, color: big ? postColor : color, mat: 'metal', bevel: 0 });
    }
    if (axis === 'x') b.box(a0, y + h, fixed - 0.05, a1, y + h + 0.07, fixed + 0.05, postColor, { mat: 'metal', bevel: 0.01 });
    else b.box(fixed - 0.05, y + h, a0, fixed + 0.05, y + h + 0.07, a1, postColor, { mat: 'metal', bevel: 0.01 });
  }

  function waterTank(x: number, y: number, z: number) {
    b.setPhase('details', 'drop');
    for (const [dx, dz] of [[-0.55, -0.55], [0.55, -0.55], [-0.55, 0.55], [0.55, 0.55]]) b.add({ w: 0.09, h: 0.8, d: 0.09, x: x + dx, y: y + 0.4, z: z + dz, color: '#4A4F5A', mat: 'metal', bevel: 0 });
    b.add({ w: 1.4, h: 0.1, d: 1.4, x, y: y + 0.85, z, color: '#5A606C', mat: 'metal', bevel: 0.01 });
    b.add({ w: 1.15, h: 1.15, d: 1.15, x, y: y + 1.48, z, color: '#23262E', mat: 'tank', shape: 'cyl' });
    b.add({ w: 1.15, h: 0.05, d: 1.15, x, y: y + 1.75, z, color: '#2E323B', mat: 'tank', shape: 'cyl' });
    b.add({ w: 0.42, h: 0.12, d: 0.42, x, y: y + 2.1, z, color: '#2E323B', mat: 'tank', shape: 'cyl' });
    b.add({ w: 0.06, h: 0.9, d: 0.06, x: x + 0.5, y: y + 0.6, z: z + 0.5, color: '#9AA0A8', mat: 'metal', shape: 'cyl', bevel: 0 });
  }

  function createBuilding(o: BOpts): BInfo {
    const { x0, x1, front, floors, wall, trim, accent } = o;
    const zF = o.zFront;
    const zB = zF - front * o.depth;
    const xc = (x0 + x1) / 2;
    const width = x1 - x0;
    const tile = shade(PALETTE.terracotta, -0.05);
    const info: BInfo = { roofY: floors * FH + 0.2, zFront: zF, zBack: zB, xc };
    const doorX = xc + (o.door ?? 0) * width;

    for (let f = 0; f < floors; f++) {
      const y0 = f * FH;
      const y1 = y0 + FH - 0.2;
      const top = f === floors - 1 && o.setback ? o.setback : 0;
      const zFf = zF - front * top; // front plane for this floor
      const zInMin = Math.min(zFf, zB) + WT;
      const zInMax = Math.max(zFf, zB) - WT;
      b.setPhase('walls', 'rise', f * 10 + o.order * 0.4);
      // front
      if (!(o.shop && f === 0)) wallRun('x', x0, x1, zFf - front * (WT / 2), y0, y1, wall);
      // back
      wallRun('x', x0, x1, zB + front * (WT / 2), y0, y1, shade(wall, -0.06));
      // sides
      wallRun('z', zInMin - WT, zInMax + WT, x0 + WT / 2, y0, y1, shade(wall, -0.03));
      wallRun('z', zInMin - WT, zInMax + WT, x1 - WT / 2, y0, y1, shade(wall, -0.03));
      // floor band / cornice
      b.box(x0 - 0.08, y1, Math.min(zFf, zB) - 0.08, x1 + 0.08, y1 + 0.2, Math.max(zFf, zB) + 0.08, trim, { bevel: 0.04 });
      if (top) {
        // terrace slab in front of a set-back top floor
        b.box(x0, y0 - 0.2, Math.min(zF, zFf), x1, y0, Math.max(zF, zFf), '#B8AB94', { mat: 'stone', bevel: 0.03 });
      }

      // windows and doors
      b.setPhase('details', 'scatter', f * 10 + o.order * 0.4);
      const n = o.windows ?? Math.max(1, Math.floor(width / 2.1));
      const isBalconyFloor = o.balcony && o.balcony.floor === f;
      for (let i = 0; i < n; i++) {
        const wx = x0 + ((i + 0.5) * width) / n;
        if (f === 0 && !o.shop && Math.abs(wx - doorX) < 1.15) continue;
        if (o.shop && f === 0) continue;
        if (isBalconyFloor && Math.abs(wx - (xc + (o.balcony!.offset ?? 0))) < o.balcony!.w / 2) continue;
        addWindow(wx, y0 + 1.15, zFf, front, trim, accent, tile, windowStage(o.lightsStage), { shutters: rand() < 0.35 });
      }
      // back windows
      const nb = Math.max(1, Math.floor(width / 3));
      for (let i = 0; i < nb; i++) {
        const wx = x0 + ((i + 0.5) * width) / nb;
        addWindow(wx, y0 + 1.15, zB, (-front) as 1 | -1, trim, accent, tile, windowStage(), { chajja: false, w: 0.7, h: 0.9 });
      }
      // side windows
      if (o.depth > 5.5) {
        const zm = (zFf + zB) / 2;
        if (o.stairs !== 'left') addSideWindow(x0, y0 + 1.15, zm, -1, trim, windowStage());
        if (o.stairs !== 'right') addSideWindow(x1, y0 + 1.15, zm, 1, trim, windowStage());
      }
    }

    // door
    if (!o.shop) {
      b.setPhase('details', 'scatter', o.order * 0.4);
      b.add({ w: 1.32, h: 2.15, d: 0.1, x: doorX, y: 1.075, z: zF + front * 0.03, color: trim, bevel: 0.02 });
      b.add({ w: 1.02, h: 1.95, d: 0.12, x: doorX, y: 0.975, z: zF + front * 0.06, color: accent, mat: 'wood', bevel: 0.02 });
      b.add({ w: 0.04, h: 1.9, d: 0.04, x: doorX, y: 0.98, z: zF + front * 0.13, color: shade(accent, -0.3), mat: 'wood', bevel: 0 });
      b.add({ w: 1.6, h: 0.14, d: 0.55, x: doorX, y: 0.07, z: zF + front * 0.27, color: '#BDB5A4', mat: 'stone', bevel: 0.03 });
      b.setPhase('props', 'drop', o.order);
      marigoldGarland(doorX - 0.62, doorX + 0.62, 2.12, zF + front * 0.14);
      for (let i = 0; i < 5; i++) b.add({ w: 0.1, h: 0.16, d: 0.03, x: doorX - 0.5 + i * 0.25, y: 1.92, z: zF + front * 0.15, color: '#3E8E3A', mat: 'leaf', shape: 'tri', rz: Math.PI, bevel: 0 });
      info.door = { x: doorX, z: zF + front * 0.6 };
    }

    // balcony
    if (o.balcony) {
      const bl = o.balcony;
      const bx = xc + (bl.offset ?? 0);
      const y = bl.floor * FH;
      b.setPhase('details', 'scatter', bl.floor * 10 + o.order * 0.4);
      b.box(bx - bl.w / 2, y - 0.2, Math.min(zF, zF + front * 1.05), bx + bl.w / 2, y, Math.max(zF, zF + front * 1.05), shade(trim, -0.08), { bevel: 0.03 });
      const zr = zF + front * 1.0;
      railing('x', bx - bl.w / 2 + 0.05, bx + bl.w / 2 - 0.05, zr, y, 0.8, '#2E3440', accent);
      railing('z', Math.min(zF, zr), Math.max(zF, zr), bx - bl.w / 2 + 0.05, y, 0.8, '#2E3440', accent);
      railing('z', Math.min(zF, zr), Math.max(zF, zr), bx + bl.w / 2 - 0.05, y, 0.8, '#2E3440', accent);
      b.add({ w: 1.0, h: 1.85, d: 0.1, x: bx, y: y + 0.95, z: zF + front * 0.04, color: trim });
      b.add({ w: 0.82, h: 1.7, d: 0.1, x: bx, y: y + 0.9, z: zF + front * 0.07, color: '#18213A', litColor: '#FFC35C', stage: bl.stage ?? windowStage(), mat: 'glass', bevel: 0 });
      b.add({ w: bl.w + 0.4, h: 0.08, d: 1.35, x: bx, y: y + 2.05, z: zF + front * 0.62, rx: front * 0.16, color: tile, mat: 'tile', bevel: 0.02 });
      info.balcony = { x: bx, y, z: zF + front * 0.55, w: bl.w };
      if (bl.decorated) {
        b.setPhase('props', 'drop', o.order);
        marigoldGarland(bx - bl.w / 2, bx + bl.w / 2, y - 0.26, zr + front * 0.05);
        fairyString([[bx - bl.w / 2, y + 0.92, zr], [bx + bl.w / 2, y + 0.92, zr]], bl.stage ?? 0, 0.24);
        fairyString([[bx - bl.w / 2, y + 1.98, zr + front * 0.18], [bx + bl.w / 2, y + 1.98, zr + front * 0.18]], bl.stage ?? 0, 0.26);
        lantern(bx + bl.w / 2 - 0.35, y + 1.45, zr - front * 0.05, '#FF8A3D', bl.stage ?? 0);
        diya(bx - bl.w / 2 + 0.15, y + 0.87, zr);
        diya(bx + bl.w / 2 - 0.15, y + 0.87, zr);
      }
    }

    // roof
    const roofY = floors * FH;
    const topF = o.setback ? zF - front * o.setback : zF;
    const rzMin = Math.min(topF, zB);
    const rzMax = Math.max(topF, zB);
    b.setPhase('details', 'drop', floors * 10 + o.order * 0.4);
    b.box(x0 - 0.05, roofY - 0.2, rzMin - 0.05, x1 + 0.05, roofY + 0.2, rzMax + 0.05, shade('#BDB09A', (rand() - 0.5) * 0.08), { mat: 'stone', bevel: 0.04 });
    const py = roofY + 0.2;
    if (o.parapet === 'rail') {
      railing('x', x0 + 0.1, x1 - 0.1, topF - front * 0.12, py, 0.8, '#FFF0D2', accent);
      railing('x', x0 + 0.1, x1 - 0.1, zB + front * 0.12, py, 0.8, '#FFF0D2', accent);
      railing('z', rzMin + 0.1, rzMax - 0.1, x0 + 0.12, py, 0.8, '#FFF0D2', accent);
      railing('z', rzMin + 0.1, rzMax - 0.1, x1 - 0.12, py, 0.8, '#FFF0D2', accent);
    } else {
      const ph = 0.7;
      const jaali = o.parapet === 'jaali';
      const runX = (zz: number) => {
        if (!jaali) return wallRun('x', x0, x1, zz, py, py + ph, trim, { bevel: 0.03 });
        const n = Math.round((x1 - x0) / 0.55);
        for (let i = 0; i < n; i++) {
          const s0 = x0 + ((x1 - x0) * i) / n;
          b.box(s0 + 0.04, py, zz - 0.11, s0 + (x1 - x0) / n - 0.04, py + ph, zz + 0.11, i % 2 ? trim : shade(trim, -0.08), { bevel: 0.03 });
        }
        b.box(x0, py + ph, zz - 0.13, x1, py + ph + 0.08, zz + 0.13, shade(trim, -0.1), { bevel: 0.02 });
      };
      runX(topF - front * 0.11);
      runX(zB + front * 0.11);
      wallRun('z', rzMin, rzMax, x0 + 0.11, py, py + ph, trim, { bevel: 0.03 });
      wallRun('z', rzMin, rzMax, x1 - 0.11, py, py + ph, trim, { bevel: 0.03 });
    }
    if (o.setback) {
      railing('x', x0 + 0.1, x1 - 0.1, zF - front * 0.1, (floors - 1) * FH, 0.75, '#FFF0D2', accent);
    }

    if (o.roofRoom) {
      const rw = 3.0;
      const rd = Math.min(3.0, o.depth - 1.2);
      const rx0 = o.roofRoom.side === 'left' ? x0 + 0.35 : x1 - 0.35 - rw;
      const rx1 = rx0 + rw;
      const rzb = zB + front * 0.35;
      const rzf = rzb + front * rd;
      const zz0 = Math.min(rzb, rzf);
      const zz1 = Math.max(rzb, rzf);
      const rh = 2.2;
      b.setPhase('details', 'rise', floors * 10 + 5 + o.order * 0.4);
      b.box(rx0, py, zz0, rx1, py + rh, zz1, shade(wall, 0.04), { bevel: 0.05 });
      b.add({ w: 0.8, h: 1.7, d: 0.1, x: (rx0 + rx1) / 2, y: py + 0.85, z: rzf + front * 0.04, color: accent, mat: 'wood' });
      if (o.roofRoom.kind === 'tile') {
        const half = rd / 2 + 0.3;
        const ang = 0.5;
        const zm = (zz0 + zz1) / 2;
        const ridge = py + rh + Math.tan(ang) * (rd / 2);
        for (const s of [-1, 1]) {
          b.add({ w: rw + 0.5, h: 0.12, d: half / Math.cos(ang), x: (rx0 + rx1) / 2, y: ridge - (Math.tan(ang) * half) / 2 - 0.02, z: zm + (s * half) / 2, rx: s * ang, color: shade(tile, s * 0.06), mat: 'tile', bevel: 0.02 });
        }
        for (const ex of [rx0 + 0.06, rx1 - 0.06]) {
          b.add({ w: rd, h: ridge - (py + rh), d: 0.12, x: ex, y: py + rh + (ridge - py - rh) / 2, z: zm, ry: Math.PI / 2, color: shade(wall, 0.04), shape: 'tri', bevel: 0 });
        }
        b.add({ w: rw + 0.6, h: 0.12, d: 0.14, x: (rx0 + rx1) / 2, y: ridge + 0.02, z: zm, color: shade(tile, -0.15), mat: 'tile', bevel: 0.02 });
      } else {
        b.box(rx0 - 0.1, py + rh, zz0 - 0.1, rx1 + 0.1, py + rh + 0.18, zz1 + 0.1, trim, { bevel: 0.03 });
        b.box(rx0, py + rh + 0.18, zz0, rx1, py + rh + 0.45, zz0 + 0.15, trim, { bevel: 0.02 });
      }
      info.roofRoomZone = [rx0, zz0, rx1, zz1];
    }
    if (o.tank) {
      const tx = o.tank === 'left' ? x0 + 1.1 : x1 - 1.1;
      const tz = zB + front * 1.1;
      waterTank(tx, py, tz);
      info.tank = { x: tx, z: tz };
    }

    if (o.stairs) {
      b.setPhase('details', 'scatter', o.order * 0.4 + 3);
      const sx = o.stairs === 'right' ? x1 + 0.5 : x0 - 0.5;
      const out = o.stairs === 'right' ? 1 : -1;
      const steps = 8;
      const run = 0.34;
      const rise = FH / steps;
      for (let f = 0; f < floors; f++) {
        const even = f % 2 === 0;
        const t0 = 0.5;
        for (let i = 0; i < steps; i++) {
          const t = even ? t0 + i * run : t0 + (steps - 1 - i) * run;
          const z = zF - front * (t + run / 2);
          b.add({ w: 0.95, h: 0.1, d: run, x: sx, y: f * FH + (i + 1) * rise - 0.05, z, color: '#BDB5A4', mat: 'stone', bevel: 0.01 });
          b.add({ w: 0.05, h: 0.85, d: 0.05, x: sx + out * 0.45, y: f * FH + (i + 1) * rise + 0.42, z, color: '#2E3440', mat: 'metal', bevel: 0 });
        }
        const zA = zF - front * t0;
        const zE = zF - front * (t0 + steps * run);
        const [za, ze] = even ? [zA, zE] : [zE, zA];
        const dy = FH;
        const dz = ze - za;
        const L = Math.hypot(dy, dz);
        b.add({ w: 0.35, h: 0.18, d: L, x: sx, y: f * FH + dy / 2 - 0.25, z: (za + ze) / 2, rx: Math.atan2(-dy, dz), color: shade(trim, -0.2) });
        b.add({ w: 0.06, h: 0.06, d: L, x: sx + out * 0.45, y: f * FH + dy / 2 + 0.85, z: (za + ze) / 2, rx: Math.atan2(-dy, dz), color: accent, mat: 'metal', bevel: 0 });
        const landZ = even ? zE - front * 0.5 : zA + front * 0.5;
        b.add({ w: 0.95, h: 0.14, d: 1.0, x: sx, y: (f + 1) * FH - 0.07, z: landZ, color: '#BDB5A4', mat: 'stone' });
        b.add({ w: 0.1, h: (f + 1) * FH, d: 0.1, x: sx + out * 0.4, y: ((f + 1) * FH) / 2, z: landZ, color: shade(trim, -0.2), bevel: 0 });
      }
    }
    info.roofY = py;
    return info;
  }

  // ---- North side (fronts face +z) ----
  const n1 = createBuilding({ id: 'n1', x0: -23.5, x1: -17.9, zFront: frontN(-23.5, -17.9), depth: 7.6, front: 1, floors: 3, wall: '#A9573B', trim: '#F2E3C4', accent: '#148C88', order: 0, windows: 2, parapet: 'solid', roofRoom: { kind: 'tile', side: 'left' }, door: 0.2 });
  const n2 = createBuilding({ id: 'n2', x0: -16.7, x1: -10.6, zFront: frontN(-16.7, -10.6), depth: 6.6, front: 1, floors: 2, wall: '#2F8F86', trim: '#FFF0D2', accent: '#F5A623', order: 1, parapet: 'jaali', tank: 'right', balcony: { floor: 1, w: 2.8, offset: -1 }, door: 0.25 });
  const n3 = createBuilding({ id: 'n3', x0: -9.4, x1: -3.6, zFront: frontN(-9.4, -3.6), depth: 8.2, front: 1, floors: 4, wall: '#EFDDBA', trim: '#D64A91', accent: '#3446A4', order: 2, parapet: 'solid', roofRoom: { kind: 'mumty', side: 'right' }, door: -0.2 });
  const shop = createBuilding({ id: 'shop', x0: -2.3, x1: 6.2, zFront: frontN(-2.3, 6.2), depth: 6.6, front: 1, floors: 2, wall: '#E7A23C', trim: '#CE382A', accent: '#3446A4', order: 3, parapet: 'solid', tank: 'left', shop: true, windows: 3 });
  createBuilding({ id: 'n5', x0: 7.6, x1: 13.6, zFront: frontN(7.6, 13.6), depth: 7.2, front: 1, floors: 3, wall: '#3F55A8', trim: '#FFF0D2', accent: '#FFD15A', order: 4, parapet: 'jaali', stairs: 'left', setback: 1.7, balcony: { floor: 1, w: 3.2, decorated: true, stage: 1 } });
  const n6 = createBuilding({ id: 'n6', x0: 15.0, x1: 19.3, zFront: frontN(15.0, 19.3), depth: 5.6, front: 1, floors: 2, wall: '#C65286', trim: '#FFF0D2', accent: '#148C88', order: 5, parapet: 'rail', door: 0.15 });
  const n7 = createBuilding({ id: 'n7', x0: 20.1, x1: 22.9, zFront: frontN(20.1, 22.9), depth: 7.0, front: 1, floors: 3, wall: '#E8B84A', trim: '#A9573B', accent: '#3446A4', order: 6, windows: 1, parapet: 'solid', tank: 'left' });

  // ---- South side (fronts face -z) ----
  const fam = createBuilding({ id: 'family', x0: -23.6, x1: -14.3, zFront: frontS(-23.6, -14.3), depth: 9.4, front: -1, floors: 3, wall: '#F2B544', trim: '#CE382A', accent: '#148C88', order: 0.5, windows: 3, parapet: 'rail', tank: 'right', balcony: { floor: 1, w: 4.2, offset: 0.6, decorated: true, stage: 0 }, door: -0.25 });
  const s2 = createBuilding({ id: 's2', x0: -12.7, x1: -7.0, zFront: frontS(-12.7, -7.0), depth: 7.2, front: -1, floors: 2, wall: '#C8664B', trim: '#FFF0D2', accent: '#148C88', order: 1.5, parapet: 'solid', roofRoom: { kind: 'tile', side: 'right' }, balcony: { floor: 1, w: 3.4, offset: 0.4, decorated: true, stage: 0 }, door: -0.3 });
  const s4 = createBuilding({ id: 's4', x0: 7.8, x1: 13.2, zFront: frontS(7.8, 13.2), depth: 8.0, front: -1, floors: 3, wall: '#EFE0C0', trim: '#3446A4', accent: '#F5A623', order: 3.5, parapet: 'jaali', stairs: 'right', tank: 'left', door: -0.1 });
  const d2 = createBuilding({ id: 'd2', x0: 15.4, x1: 23.6, zFront: 10.6, depth: 5.6, front: -1, floors: 2, wall: '#D9895B', trim: '#FFF0D2', accent: '#148C88', order: 5.5, parapet: 'solid', door: 0.3, windows: 3 });

  // -------------------------------------------------------------------------
  // ZONE A — family terrace details
  {
    const y = fam.roofY;
    const zF = fam.zFront;
    const zB = fam.zBack;
    b.setPhase('props', 'drop', 0);
    // charpai
    const cx = -19.6;
    const cz = zF + 5.2;
    for (const [dx, dz] of [[-0.9, -0.45], [0.9, -0.45], [-0.9, 0.45], [0.9, 0.45]]) b.add({ w: 0.09, h: 0.42, d: 0.09, x: cx + dx, y: y + 0.21, z: cz + dz, color: '#7A4A2A', mat: 'wood', bevel: 0 });
    b.add({ w: 1.95, h: 0.08, d: 1.05, x: cx, y: y + 0.44, z: cz, color: '#8C5A33', mat: 'wood' });
    b.add({ w: 1.75, h: 0.05, d: 0.88, x: cx, y: y + 0.49, z: cz, color: '#E9D3A0', mat: 'fabric', bevel: 0 });
    b.add({ w: 0.5, h: 0.12, d: 0.7, x: cx - 0.6, y: y + 0.56, z: cz, color: '#D64A91', mat: 'fabric' });
    // stool with mithai boxes
    const sx = -17.6;
    const sz = zF + 5.4;
    b.add({ w: 0.6, h: 0.45, d: 0.6, x: sx, y: y + 0.225, z: sz, color: '#3446A4', mat: 'wood', shape: 'cyl' });
    b.add({ w: 0.42, h: 0.14, d: 0.32, x: sx, y: y + 0.52, z: sz, color: '#F5A623', mat: 'paint' });
    b.add({ w: 0.36, h: 0.12, d: 0.28, x: sx + 0.02, y: y + 0.65, z: sz + 0.02, color: '#D64A91', mat: 'paint', ry: 0.3 });
    b.add({ w: 0.3, h: 0.04, d: 0.24, x: sx + 0.02, y: y + 0.73, z: sz + 0.02, color: '#FFD15A', mat: 'paint', ry: 0.3 });
    // clothesline with clothes
    const lx0 = -23.0;
    const lx1 = -18.8;
    const lz = zB - 1.6;
    for (const lx of [lx0, lx1]) b.add({ w: 0.08, h: 1.9, d: 0.08, x: lx, y: y + 0.95, z: lz, color: '#5A606C', mat: 'metal', bevel: 0 });
    b.box(lx0, y + 1.82, lz - 0.015, lx1, y + 1.85, lz + 0.015, '#DDD5C5', { mat: 'metal', bevel: 0 });
    const clothes = ['#D64A91', '#FFF0D2', '#3446A4', '#F5A623', '#148C88'];
    clothes.forEach((c, i) => {
      const w = 0.5 + rand() * 0.3;
      b.add({ w, h: 0.55 + rand() * 0.4, d: 0.03, x: lx0 + 0.5 + i * 0.82, y: y + 1.45 - rand() * 0.15, z: lz, color: c, mat: 'fabric', rz: (rand() - 0.5) * 0.08, bevel: 0.01 });
    });
    // four potted plants (Anaar Maasi hides behind the last one)
    const pots: Vec3[] = [[-23.0, y, zF + 0.7], [-21.2, y, zF + 0.7], [-15.0, y, zF + 0.7], [-22.9, y, zB - 3.1]];
    pots.forEach((p, i) => pottedPlant(p[0], p[1], p[2], i === 3 ? 1.35 : 1.05));
    anchors['family.terracePot'] = { pos: [-22.95, y, zB - 2.45], rotY: 0.9 };
    anchors['family.terraceOpen'] = { pos: [-18.4, y, zF + 2.6] };
    anchors['family.terrace'] = { pos: [-19, y, (zF + zB) / 2] };
    // string lights across the terrace + diyas on the parapet rail
    fairyString([[-23.4, y + 0.9, zF + 0.15], [-19, y + 2.1, (zF + zB) / 2], [-14.5, y + 0.9, zB - 0.15]], 0, 0.34);
    fairyString([[-23.4, y + 0.9, zB - 0.15], [-14.5, y + 0.9, zF + 0.15]], 3, 0.34);
    for (let i = 0; i < 6; i++) diya(-23.0 + i * 1.6, y + 0.88, zF + 0.12);
    lights.push({ id: 'terrace', pos: [-19, y + 2.2, zF + 3], color: '#FFB25C', intensity: 7, distance: 9, stage: 0, lowGraphics: false });
    characters.push({ id: 'chacha', name: 'Chacha', kind: 'man', pos: [-20.2, y, zF + 3.6], rotY: -0.6, pose: 'stand', anim: 'idle', stage: 0, colors: { top: '#FFF0D2', bottom: '#F2E6CC', drape: '#CE382A', hair: '#2B2522', skin: '#B97A56' } });
    characters.push({ id: 'chachi', name: 'Chachi', kind: 'woman', pos: [-19.0, y, zF + 5.2], rotY: -1.6, pose: 'sit', anim: 'talk', stage: 0, colors: { top: '#148C88', bottom: '#148C88', drape: '#F5A623', hair: '#1E1A1A', skin: '#A86B4A' } });
    // child looking over the balcony
    const bal = fam.balcony!;
    characters.push({ id: 'balconyChild', name: 'Chintu', kind: 'child', pos: [bal.x + 0.6, bal.y, bal.z - 0.15], rotY: Math.PI, pose: 'stand', anim: 'look', stage: 0, interactive: 'child', colors: { top: '#FFD15A', bottom: '#3446A4', hair: '#1E1A1A', skin: '#B97A56' } });
    anchors['family.balcony'] = { pos: [bal.x, bal.y, bal.z] };
  }

  // ZONE B — the central gali
  {
    b.setPhase('props', 'drop', 1);
    // rangoli at the S2 entrance and the N3 entrance
    rangolis.push({ pos: [s2.door!.x, 0.07, s2.door!.z - 0.55], size: 1.3, seed: 11, colors: ['#D64A91', '#F5A623', '#148C88', '#FFD15A'] });
    rangolis.push({ pos: [n3.door!.x, 0.07, n3.door!.z + 0.4], size: 1.1, seed: 17, colors: ['#CE382A', '#FFD15A', '#3446A4', '#FFF0D2'] });
    diya(s2.door!.x - 0.8, 0.0, s2.door!.z - 0.55);
    diya(s2.door!.x + 0.8, 0.0, s2.door!.z - 0.55);
    diya(n3.door!.x - 0.7, 0.0, n3.door!.z + 0.4);
    diya(n3.door!.x + 0.7, 0.0, n3.door!.z + 0.4);
    // bicycle leaning on S2
    bicycle(-7.9, s2.zFront - 0.35, 0, 0.14, '#CE382A');
    // streetlamps
    const lamp = (x: number, z: number, side: 1 | -1) => {
      b.add({ w: 0.14, h: 4.2, d: 0.14, x, y: 2.1, z, color: '#30343E', mat: 'metal', shape: 'cyl', bevel: 0 });
      b.add({ w: 0.08, h: 0.08, d: 1.0, x, y: 4.1, z: z + side * 0.45, color: '#30343E', mat: 'metal', bevel: 0 });
      b.add({ w: 0.38, h: 0.2, d: 0.5, x, y: 3.98, z: z + side * 0.9, color: '#30343E', mat: 'metal' });
      b.add({ w: 0.3, h: 0.08, d: 0.4, x, y: 3.86, z: z + side * 0.9, color: '#8A7A50', litColor: '#FFE4A8', stage: 0, mat: 'glow', bevel: 0 });
      glow({ pos: [x, 3.75, z + side * 0.9], color: '#FFD38A', size: 3.2, flicker: 0.04, kind: 'lamp' });
      lights.push({ id: `lamp${x}`, pos: [x, 3.6, z + side * 0.9], color: '#FFCB7A', intensity: 10, distance: 11, stage: 0, lowGraphics: true });
    };
    lamp(-13.6, roadZ(-13.6) - ROAD_HALF - 0.75, 1);
    lamp(14.3, roadZ(14.3) + ROAD_HALF + 0.75, -1);
    // bunting across the street
    const bunting = (x: number, h: number) => {
      const zA = roadZ(x) - ROAD_HALF - 1.2;
      const zB2 = roadZ(x) + ROAD_HALF + 1.4;
      const n = 14;
      const cols = ['#CE382A', '#F5A623', '#148C88', '#D64A91', '#FFD15A', '#3446A4'];
      b.box(x - 0.01, h - 0.01, zA, x + 0.01, h + 0.01, zB2, '#E8E0CC', { mat: 'metal', bevel: 0 });
      for (let i = 0; i < n; i++) {
        const t = (i + 0.5) / n;
        b.add({ w: 0.3, h: 0.34, d: 0.02, x, y: h - 0.2 - Math.sin(t * Math.PI) * 0.35, z: zA + (zB2 - zA) * t, ry: Math.PI / 2, rz: Math.PI, color: cols[i % cols.length], mat: 'fabric', shape: 'tri', bevel: 0 });
      }
    };
    [-19.5, -10.0, -1.0, 8.6, 17.2].forEach((x, i) => bunting(x, 4.2 + (i % 2) * 0.5));
    // lanterns strung across the street (light up at stage 6)
    const lanternLine = (x: number, cols: string[]) => {
      const zA = roadZ(x) - ROAD_HALF - 1.1;
      const zB2 = roadZ(x) + ROAD_HALF + 1.3;
      b.box(x - 0.01, 5.2 - 0.01, zA, x + 0.01, 5.2 + 0.01, zB2, '#D9D2C0', { mat: 'metal', bevel: 0 });
      cols.forEach((c, i) => lantern(x, 4.55, zA + ((zB2 - zA) * (i + 1)) / (cols.length + 1), c, 6));
    };
    lanternLine(-14.8, ['#FF8A3D', '#D64A91', '#FFD15A']);
    lanternLine(3.6, ['#D64A91', '#FF8A3D', '#7FE3D6']);
    lanternLine(13.0, ['#FFD15A', '#FF6F91', '#FF8A3D']);
    // zig-zag lights between the facades for the final celebration
    const zig: Vec3[] = [];
    for (let x = -22; x <= 22; x += 4) zig.push([x, 5.6 + (x % 8 === 0 ? 0.3 : 0), roadZ(x) + (zig.length % 2 ? 1 : -1) * (ROAD_HALF + 1.0)]);
    fairyString(zig, 8, 0.4);
    // neighbours chatting by N3
    characters.push({ id: 'auntyA', name: 'Sharma Aunty', kind: 'woman', pos: [n3.door!.x + 1.2, 0.16, n3.door!.z + 0.35], rotY: -1.2, pose: 'stand', anim: 'talk', stage: 0, colors: { top: '#D64A91', bottom: '#D64A91', drape: '#FFD15A', hair: '#1E1A1A', skin: '#C08A66' } });
    characters.push({ id: 'auntyB', name: 'Verma Aunty', kind: 'woman', pos: [n3.door!.x + 2.15, 0.16, n3.door!.z + 0.3], rotY: 1.5, pose: 'stand', anim: 'talk', stage: 0, colors: { top: '#3446A4', bottom: '#3446A4', drape: '#F5A623', hair: '#2B2522', skin: '#A86B4A' } });
    characters.push({ id: 'bua', name: 'Bua', kind: 'woman', pos: [s2.door!.x + 1.4, 0.0, s2.zFront - 0.7], rotY: Math.PI - 0.3, pose: 'stand', anim: 'wave', stage: 0, colors: { top: '#F5A623', bottom: '#CE382A', drape: '#D64A91', hair: '#1E1A1A', skin: '#B97A56' } });
    characters.push({ id: 'walker', name: 'Pappu', kind: 'child', pos: [-4, 0.06, roadZ(-4) + 0.9], rotY: 0, pose: 'stand', anim: 'walk', stage: 0, walk: [[-6.5, 0.06, roadZ(-6.5) + 1.1], [-1.5, 0.06, roadZ(-1.5) + 1.1]], colors: { top: '#CE382A', bottom: '#2E3440', hair: '#1E1A1A', skin: '#A86B4A' } });
    const bal2 = s2.balcony!;
    anchors['s2.balcony'] = { pos: [bal2.x - 1.15, bal2.y, bal2.z - 0.2], rotY: Math.PI + 0.3 };
    anchors['s2.balconyRail'] = { pos: [bal2.x + 0.6, bal2.y + 0.95, bal2.z - 0.4] };
    anchors['gali.center'] = { pos: [-2, 0, roadZ(-2)] };
    // scooter spot (scooter itself is an interactive object)
    const scx = 9.6;
    anchors['scooter'] = { pos: [scx, 0.06, roadZ(scx) + ROAD_HALF - 0.55], rotY: 0.05 };
    anchors['scooter.side'] = { pos: [scx + 1.05, 0.16, roadZ(scx) + ROAD_HALF + 0.75], rotY: 0.4 };
    anchors['gali.scooterRoad'] = { pos: [scx - 3.4, 0.06, roadZ(scx - 3.4) - 0.2] };
    // street entrance gate (east)
    const gx = 23.45;
    const gzA = roadZ(gx) - ROAD_HALF - 0.85;
    const gzB = roadZ(gx) + ROAD_HALF + 0.85;
    b.setPhase('details', 'rise', 20);
    for (const gz of [gzA, gzB]) {
      b.add({ w: 0.6, h: 4.6, d: 0.6, x: gx, y: 2.3, z: gz, color: '#CE382A' });
      b.add({ w: 0.8, h: 0.3, d: 0.8, x: gx, y: 4.75, z: gz, color: '#FFD15A' });
      b.add({ w: 0.8, h: 0.3, d: 0.8, x: gx, y: 0.15, z: gz, color: '#FFD15A' });
    }
    b.box(gx - 0.25, 4.3, gzA, gx + 0.25, 4.6, gzB, '#F5A623');
    signs.push({ id: 'gate', pos: [gx - 0.27, 3.85, (gzA + gzB) / 2], rotY: -Math.PI / 2, w: 3.6, h: 0.8, kind: 'gate' });
    b.setPhase('props', 'drop', 20);
    marigoldGarland(gzA + 0.3, gzB - 0.3, 3.35, gx - 0.3, 'z');
    anchors['gate.pillar'] = { pos: [gx - 0.35, 0.16, gzA - 0.7], rotY: -0.5 };
    anchors['gali.east'] = { pos: [gx - 4.2, 0.06, roadZ(gx - 4.2) + 0.6] };
  }

  // ZONE C — the pataka shop
  {
    const x0 = -2.3;
    const x1 = 6.2;
    const zF = shop.zFront;
    const zB = shop.zBack;
    b.setPhase('details', 'scatter', 30);
    // interior skins
    b.box(x0 + WT, 0, zB + WT, x1 - WT, FH - 0.2, zB + WT + 0.05, '#F0DDB5', { bevel: 0 });
    b.box(x0 + WT, 0.005, zB + WT, x1 - WT, 0.05, zF, '#9C6B4E', { mat: 'stone', bevel: 0 });
    // pillars and lintel
    for (const px of [x0 + 0.2, x1 - 0.2]) b.box(px - 0.2, 0, zF - 0.4, px + 0.2, FH - 0.2, zF, '#CE382A');
    b.box(x0, FH - 0.75, zF - 0.32, x1, FH - 0.2, zF, '#E7A23C');
    // rolling shutter, rolled up
    b.add({ w: 0.34, h: x1 - x0 - 0.6, d: 0.34, x: (x0 + x1) / 2, y: FH - 0.92, z: zF - 0.2, rz: Math.PI / 2, color: '#7D8590', mat: 'metal', shape: 'cyl' });
    for (let i = 0; i < 2; i++) b.box(x0 + 0.4, FH - 1.2 - i * 0.16, zF - 0.24, x1 - 0.4, FH - 1.06 - i * 0.16, zF - 0.17, '#9AA3AE', { mat: 'metal', bevel: 0.01 });
    // shelves with colourful boxes
    b.setPhase('props', 'drop', 30);
    const boxCols = ['#CE382A', '#F5A623', '#148C88', '#D64A91', '#3446A4', '#FFD15A', '#1F5B3A', '#E8702A'];
    for (let s = 0; s < 3; s++) {
      const sy = 0.55 + s * 0.6;
      b.box(x0 + 0.5, sy - 0.06, zB + 0.35, x1 - 0.5, sy, zB + 0.85, '#7A4A2A', { mat: 'wood', bevel: 0.01 });
      let cx = x0 + 0.6;
      while (cx < x1 - 0.8) {
        const w = 0.22 + rand() * 0.3;
        const h = 0.18 + rand() * 0.28;
        b.add({ w, h, d: 0.3 + rand() * 0.12, x: cx + w / 2, y: sy + h / 2, z: zB + 0.6, ry: (rand() - 0.5) * 0.2, color: boxCols[Math.floor(rand() * boxCols.length)], mat: 'paint', bevel: 0.015 });
        cx += w + 0.06;
      }
    }
    // side shelf
    for (let s = 0; s < 2; s++) {
      const sy = 0.7 + s * 0.65;
      b.box(x1 - 0.85, sy - 0.06, zB + 1.1, x1 - 0.35, sy, zF - 1.4, '#7A4A2A', { mat: 'wood', bevel: 0.01 });
      for (let k = 0; k < 4; k++) b.add({ w: 0.32, h: 0.24, d: 0.36, x: x1 - 0.6, y: sy + 0.12, z: zB + 1.35 + k * 0.5, color: boxCols[(k + s * 3) % boxCols.length], mat: 'paint', bevel: 0.015 });
    }
    // counter
    const cz0 = zF - 1.35;
    b.box(x0 + 0.6, 0, cz0 - 0.65, x1 - 2.2, 0.95, cz0, '#7A4A2A', { mat: 'wood' });
    b.box(x0 + 0.55, 0.95, cz0 - 0.7, x1 - 2.15, 1.02, cz0 + 0.05, '#C9A36A', { mat: 'wood', bevel: 0.01 });
    b.box(x0 + 0.65, 0.15, cz0 - 0.02, x1 - 2.25, 0.8, cz0 + 0.02, '#CE382A', { bevel: 0.01 });
    // weighing scale
    const wx = x0 + 3.5;
    b.add({ w: 0.36, h: 0.1, d: 0.22, x: wx, y: 1.07, z: cz0 - 0.3, color: '#5A606C', mat: 'metal' });
    b.add({ w: 0.04, h: 0.42, d: 0.04, x: wx, y: 1.31, z: cz0 - 0.3, color: '#8A8F98', mat: 'metal', bevel: 0 });
    b.add({ w: 0.7, h: 0.03, d: 0.03, x: wx, y: 1.52, z: cz0 - 0.3, color: '#8A8F98', mat: 'metal', bevel: 0 });
    for (const s of [-1, 1]) b.add({ w: 0.26, h: 0.03, d: 0.26, x: wx + s * 0.33, y: 1.3, z: cz0 - 0.3, color: '#C9A36A', mat: 'metal', shape: 'cyl', bevel: 0 });
    // hanging bulb
    b.add({ w: 0.02, h: 0.6, d: 0.02, x: (x0 + x1) / 2 - 0.6, y: FH - 0.5, z: (zF + zB) / 2, color: '#222', mat: 'metal', bevel: 0 });
    b.add({ w: 0.16, h: 0.2, d: 0.16, x: (x0 + x1) / 2 - 0.6, y: FH - 0.88, z: (zF + zB) / 2, color: '#9A8A5A', litColor: '#FFF1C4', stage: 0, mat: 'glow', shape: 'sphere', bevel: 0 });
    glow({ pos: [(x0 + x1) / 2 - 0.6, FH - 0.9, (zF + zB) / 2], color: '#FFE2A0', size: 2.2, flicker: 0.05 });
    lights.push({ id: 'shop', pos: [(x0 + x1) / 2 - 0.6, FH - 1.0, (zF + zB) / 2 + 0.6], color: '#FFC46B', intensity: 9, distance: 8, stage: 0, lowGraphics: true });
    // signboard and posters
    signs.push({ id: 'shopSign', pos: [(x0 + x1) / 2, FH + 0.25, zF + 0.17], rotY: 0, w: 6.6, h: 1.05, kind: 'shop', stage: 4 });
    b.setPhase('details', 'scatter', 31);
    b.box((x0 + x1) / 2 - 3.45, FH - 0.32, zF + 0.02, (x0 + x1) / 2 + 3.45, FH + 0.82, zF + 0.14, '#5A3A22', { mat: 'wood', bevel: 0.02 });
    for (let i = 0; i < 18; i++) {
      const t = i / 17;
      glow({ pos: [(x0 + x1) / 2 - 3.4 + t * 6.8, FH + 0.86, zF + 0.2], color: i % 2 ? '#FFD15A' : '#FF8A3D', size: 0.5, flicker: 0.1, stage: 4, group: -1, kind: 'sign' });
      glow({ pos: [(x0 + x1) / 2 - 3.4 + t * 6.8, FH - 0.36, zF + 0.2], color: i % 2 ? '#FF8A3D' : '#FFD15A', size: 0.5, flicker: 0.1, stage: 4, group: -1, kind: 'sign' });
    }
    signs.push({ id: 'poster1', pos: [x0 + WT + 0.03, 1.5, zB + 2.4], rotY: Math.PI / 2, w: 0.75, h: 1.0, kind: 'poster', seed: 1 });
    signs.push({ id: 'poster2', pos: [x0 + WT + 0.03, 1.5, zB + 3.4], rotY: Math.PI / 2, w: 0.75, h: 1.0, kind: 'poster', seed: 2 });
    signs.push({ id: 'poster3', pos: [x1 + 0.03, 1.4, zF - 1.6], rotY: Math.PI / 2, w: 0.85, h: 1.15, kind: 'poster', seed: 3 });
    anchors['shop.behindCounter'] = { pos: [x0 + 1.3, 0.05, cz0 - 1.25], rotY: 0.25 };
    anchors['shop.front'] = { pos: [1.4, 0.06, roadZ(1.4) + 0.3] };
    anchors['shop'] = { pos: [(x0 + x1) / 2, 1, zF] };
    characters.push({ id: 'shopkeeper', name: 'Gupta ji', kind: 'elder', pos: [x0 + 2.6, 0.05, cz0 - 1.0], rotY: 0, pose: 'stand', anim: 'idle', stage: 0, colors: { top: '#FFF0D2', bottom: '#F2E6CC', drape: '#A9573B', hair: '#D9D4CC', skin: '#B07A58' } });
  }

  // ZONE D — chai and mithai corner
  {
    const zc = 6.2;
    b.setPhase('details', 'rise', 40);
    // counter
    b.box(15.3, 0, zc - 0.45, 18.7, 0.95, zc + 0.35, '#2F8F86', { mat: 'wood' });
    b.box(15.25, 0.95, zc - 0.5, 18.75, 1.02, zc + 0.4, '#C9A36A', { mat: 'wood', bevel: 0.01 });
    for (let i = 0; i < 6; i++) b.box(15.4 + i * 0.56, 0.2, zc - 0.47, 15.6 + i * 0.56, 0.75, zc - 0.44, i % 2 ? '#FFD15A' : '#CE382A', { bevel: 0 });
    // canopy
    for (const [px, pz] of [[15.1, zc - 1.4], [18.9, zc - 1.4], [15.1, zc + 1.4], [18.9, zc + 1.4]]) b.add({ w: 0.09, h: 2.6, d: 0.09, x: px, y: 1.3, z: pz, color: '#5A606C', mat: 'metal', bevel: 0 });
    for (let i = 0; i < 6; i++) {
      const x = 15.0 + i * 0.67;
      b.add({ w: 0.67, h: 0.08, d: 3.2, x: x + 0.33, y: 2.68, z: zc, rx: -0.12, color: i % 2 ? '#FFF0D2' : '#CE382A', mat: 'fabric', bevel: 0.01 });
    }
    b.setPhase('props', 'drop', 40);
    // stove + glasses + mithai display
    b.add({ w: 0.5, h: 0.22, d: 0.4, x: 16.0, y: 1.13, z: zc - 0.05, color: '#3A3D45', mat: 'metal' });
    for (let i = 0; i < 6; i++) b.add({ w: 0.09, h: 0.14, d: 0.09, x: 17.1 + (i % 3) * 0.14, y: 1.09, z: zc - 0.2 + Math.floor(i / 3) * 0.14, color: '#F4E3C1', mat: 'glow', litColor: '#F7E6C4', stage: 0, shape: 'cyl', bevel: 0 });
    b.add({ w: 0.5, h: 0.12, d: 0.3, x: 18.2, y: 1.08, z: zc - 0.05, color: '#F5A623', mat: 'paint' });
    // mithai display case
    b.box(19.4, 0, zc - 0.45, 21.6, 0.8, zc + 0.35, '#FFF0D2');
    b.box(19.45, 0.8, zc - 0.4, 21.55, 1.35, zc + 0.3, '#B5D6D2', { mat: 'glass', litColor: '#DFF1EC', stage: 0, bevel: 0 });
    b.box(19.35, 1.35, zc - 0.48, 21.65, 1.42, zc + 0.38, '#D64A91', { bevel: 0.01 });
    const mithai = ['#F5A623', '#FFD15A', '#FFF0D2', '#D64A91', '#E8702A'];
    for (let i = 0; i < 10; i++) b.add({ w: 0.13, h: 0.13, d: 0.13, x: 19.65 + (i % 5) * 0.42, y: 0.92, z: zc - 0.15 + Math.floor(i / 5) * 0.22, color: mithai[i % 5], mat: 'glow', litColor: mithai[i % 5], stage: 0, shape: 'sphere', bevel: 0 });
    // stools and bench
    for (const sx of [15.7, 16.9, 18.1]) {
      b.add({ w: 0.36, h: 0.48, d: 0.36, x: sx, y: 0.24, z: zc - 1.25, color: '#3446A4', mat: 'wood', shape: 'cyl' });
    }
    b.box(19.4, 0.38, zc - 1.5, 21.4, 0.48, zc - 1.0, '#7A4A2A', { mat: 'wood' });
    for (const lx of [19.55, 21.25]) b.box(lx - 0.05, 0, zc - 1.45, lx + 0.05, 0.38, zc - 1.05, '#5A3A22', { mat: 'wood', bevel: 0 });
    bicycle(22.7, zc - 0.2, Math.PI / 2 + 0.1, -0.16, '#148C88');
    // bulb
    b.add({ w: 0.02, h: 0.4, d: 0.02, x: 17.0, y: 2.42, z: zc, color: '#222', mat: 'metal', bevel: 0 });
    b.add({ w: 0.16, h: 0.2, d: 0.16, x: 17.0, y: 2.16, z: zc, color: '#9A8A5A', litColor: '#FFF1C4', stage: 0, mat: 'glow', shape: 'sphere', bevel: 0 });
    glow({ pos: [17.0, 2.14, zc], color: '#FFE2A0', size: 2.4, flicker: 0.05 });
    lights.push({ id: 'chai', pos: [17.0, 2.0, zc - 0.4], color: '#FFC46B', intensity: 9, distance: 8, stage: 0, lowGraphics: true });
    fairyString([[15.1, 2.55, zc - 1.45], [18.9, 2.55, zc - 1.45]], 0, 0.26);
    signs.push({ id: 'chaiSign', pos: [17.0, 3.05, zc - 1.5], rotY: Math.PI, w: 2.6, h: 0.6, kind: 'chai' });
    signs.push({ id: 'mithaiSign', pos: [19.5, 2.15, d2.zFront - 0.17], rotY: Math.PI, w: 3.4, h: 0.7, kind: 'mithai' });
    anchors['chai.kettle'] = { pos: [16.0, 1.24, zc - 0.05] };
    anchors['chai.tucked'] = { pos: [21.95, 0.0, zc + 1.05], rotY: -1.9 };
    anchors['chai.front'] = { pos: [20.6, 0.0, zc - 2.55] };
    anchors['chai'] = { pos: [18.5, 1, zc] };
    characters.push({ id: 'chaiwala', name: 'Chaiwala Bhaiya', kind: 'chaiwala', pos: [16.6, 0, zc + 0.85], rotY: Math.PI, pose: 'stand', anim: 'idle', stage: 0, colors: { top: '#F2E6CC', bottom: '#5A4A3A', drape: '#CE382A', hair: '#1E1A1A', skin: '#9C6644' } });
    characters.push({ id: 'chaiCustomer', name: 'Mishra ji', kind: 'elder', pos: [16.9, 0.48, zc - 1.25], rotY: 0, pose: 'sit', anim: 'talk', stage: 0, colors: { top: '#3446A4', bottom: '#F2E6CC', hair: '#D9D4CC', skin: '#B07A58' } });
    characters.push({ id: 'chaiFriend', name: 'Raju', kind: 'man', pos: [18.1, 0.48, zc - 1.25], rotY: 0.2, pose: 'sit', anim: 'idle', stage: 0, colors: { top: '#148C88', bottom: '#2E3440', hair: '#1E1A1A', skin: '#A86B4A' } });
  }

  // ZONE E — rooftops
  {
    b.setPhase('props', 'drop', 50);
    // N1: rooftop seating, plants and lanterns
    const y1 = n1.roofY;
    const z1 = n1.zFront;
    for (const [cx, cz, c] of [[-21.6, z1 - 1.5, '#CE382A'], [-20.6, z1 - 1.4, '#148C88']] as [number, number, string][]) {
      b.add({ w: 0.5, h: 0.42, d: 0.5, x: cx, y: y1 + 0.21, z: cz, color: c, mat: 'paint' });
      b.add({ w: 0.5, h: 0.5, d: 0.08, x: cx, y: y1 + 0.66, z: cz - 0.22, color: c, mat: 'paint' });
    }
    b.add({ w: 0.6, h: 0.45, d: 0.6, x: -21.1, y: y1 + 0.22, z: z1 - 2.3, color: '#FFF0D2', mat: 'paint', shape: 'cyl' });
    pottedPlant(-18.5, y1, z1 - 0.6);
    pottedPlant(-23.0, y1, z1 - 0.6, 0.9, '#4E9A58');
    lantern(-19.4, y1 + 1.6, z1 - 0.4, '#FF8A3D', 0);
    fairyString([[-23.4, y1 + 0.75, z1 - 0.1], [-17.9, y1 + 0.75, z1 - 0.1]], 3, 0.3);
    characters.push({ id: 'famDad', name: 'Rajesh', kind: 'man', pos: [-21.8, y1, z1 - 2.6], rotY: 0.4, pose: 'stand', anim: 'look', stage: 2, colors: { top: '#3446A4', bottom: '#F2E6CC', hair: '#1E1A1A', skin: '#B07A58' } });
    characters.push({ id: 'famMom', name: 'Sunita', kind: 'woman', pos: [-20.9, y1, z1 - 3.2], rotY: 0.2, pose: 'stand', anim: 'wave', stage: 2, colors: { top: '#D64A91', bottom: '#D64A91', drape: '#FFD15A', hair: '#1E1A1A', skin: '#C08A66' } });
    characters.push({ id: 'famKid', name: 'Munni', kind: 'child', pos: [-20.2, y1, z1 - 2.4], rotY: -0.2, pose: 'stand', anim: 'look', stage: 2, colors: { top: '#FFD15A', bottom: '#CE382A', hair: '#1E1A1A', skin: '#B97A56' } });
    // N2: water tank (Rocket Bua), plants
    const y2 = n2.roofY;
    anchors['n2.tankSide'] = { pos: [n2.tank!.x - 1.15, y2, n2.tank!.z + 0.3], rotY: 0.5 };
    anchors['n2.roofOpen'] = { pos: [-14.6, y2, n2.zFront - 2.2] };
    anchors['rooftops'] = { pos: [-12, y2, n2.zFront - 3] };
    pottedPlant(-16.0, y2, n2.zFront - 0.6, 0.9);
    pottedPlant(-15.2, y2, n2.zFront - 0.6, 0.8, '#5BAE62');
    fairyString([[-16.6, y2 + 0.85, n2.zFront + 0.02], [-10.6, y2 + 0.85, n2.zFront + 0.02]], 3, 0.3);
    // N3: Dadi on the rooftop with marigold planters
    const y3 = n3.roofY;
    characters.push({ id: 'dadi', name: 'Dadi', kind: 'elder', pos: [-7.6, y3 + 0.42, n3.zFront - 1.6], rotY: 0.3, pose: 'sit', anim: 'talk', stage: 0, colors: { top: '#FFF0D2', bottom: '#FFF0D2', drape: '#D64A91', hair: '#E6E1D8', skin: '#B07A58' } });
    b.add({ w: 0.6, h: 0.42, d: 0.6, x: -7.6, y: y3 + 0.21, z: n3.zFront - 1.6, color: '#7A4A2A', mat: 'wood', shape: 'cyl' });
    pottedPlant(-9.0, y3, n3.zFront - 0.6, 0.9, '#3C8D4F');
    pottedPlant(-6.2, y3, n3.zFront - 0.6, 0.9, '#3C8D4F');
    lantern(-8.2, y3 + 1.7, n3.zFront - 0.5, '#D64A91', 0);
    fairyString([[-9.4, y3 + 0.75, n3.zFront + 0.02], [-3.6, y3 + 0.75, n3.zFront + 0.02]], 0, 0.3);
    // N6 rooftop family sitting
    const y6 = n6.roofY;
    b.add({ w: 1.6, h: 0.4, d: 0.5, x: 17.2, y: y6 + 0.2, z: n6.zFront - 2.2, color: '#FFF0D2', mat: 'paint' });
    characters.push({ id: 'n6a', name: 'Ritu', kind: 'woman', pos: [16.8, y6 + 0.4, n6.zFront - 2.2], rotY: 0, pose: 'sit', anim: 'look', stage: 0, colors: { top: '#148C88', bottom: '#148C88', drape: '#F5A623', hair: '#1E1A1A', skin: '#B97A56' } });
    characters.push({ id: 'n6b', name: 'Golu', kind: 'child', pos: [17.7, y6 + 0.4, n6.zFront - 2.2], rotY: 0, pose: 'sit', anim: 'look', stage: 0, colors: { top: '#CE382A', bottom: '#3446A4', hair: '#1E1A1A', skin: '#A86B4A' } });
    lantern(18.6, y6 + 1.5, n6.zFront - 0.4, '#FFD15A', 0);
    pottedPlant(15.6, y6, n6.zFront - 0.6, 0.9);
    // other parapet lights (stage 3)
    fairyString([[7.8, s4.roofY + 0.8, s4.zFront - 0.05], [13.2, s4.roofY + 0.8, s4.zFront - 0.05]], 3, 0.3);
    fairyString([[15.4, d2.roofY + 0.8, d2.zFront - 0.05], [23.6, d2.roofY + 0.8, d2.zFront - 0.05]], 3, 0.3);
    fairyString([[-2.3, shop.roofY + 0.8, shop.zFront + 0.05], [6.2, shop.roofY + 0.8, shop.zFront + 0.05]], 0, 0.3);
    fairyString([[20.1, n7.roofY + 0.8, n7.zFront + 0.05], [22.9, n7.roofY + 0.8, n7.zFront + 0.05]], 5, 0.3);
    fairyString([[-12.7, s2.roofY + 0.8, s2.zFront - 0.05], [-7.0, s2.roofY + 0.8, s2.zFront - 0.05]], 3, 0.3);
    pottedPlant(12.4, s4.roofY, s4.zFront - 0.7, 0.9);
    pottedPlant(22.8, d2.roofY, d2.zFront - 0.7, 1.0);
    pottedPlant(16.2, d2.roofY, d2.zFront - 0.7, 0.9, '#4E9A58');
  }

  // ZONE F — the quiet courtyard
  {
    const cx0 = -5.5;
    const cx1 = 6.5;
    const cz0 = frontS(cx0, cx1);
    const cz1 = 16.6;
    const archX = 0.5;
    b.setPhase('details', 'rise', 60);
    const wallC = '#E9D8B4';
    wallRun('x', cx0, archX - 1.4, cz0 + 0.15, 0, 0.9, wallC);
    wallRun('x', archX + 1.4, cx1, cz0 + 0.15, 0, 0.9, wallC);
    wallRun('x', cx0, cx1, cz1 - 0.15, 0, 0.9, wallC);
    wallRun('z', cz0, cz1, cx0 + 0.15, 0, 0.9, wallC);
    wallRun('z', cz0, cz1, cx1 - 0.15, 0, 0.9, wallC);
    for (const [x0, x1] of [[cx0, archX - 1.4], [archX + 1.4, cx1]]) b.box(x0, 0.9, cz0 - 0.03, x1, 1.0, cz0 + 0.33, '#CE382A', { bevel: 0.02 });
    b.box(cx0, 0.9, cz1 - 0.33, cx1, 1.0, cz1 + 0.03, '#CE382A', { bevel: 0.02 });
    // archway
    for (const px of [archX - 1.25, archX + 1.25]) {
      b.add({ w: 0.5, h: 3.0, d: 0.5, x: px, y: 1.5, z: cz0 + 0.15, color: '#F2E3C4' });
      b.add({ w: 0.65, h: 0.2, d: 0.65, x: px, y: 0.1, z: cz0 + 0.15, color: '#CE382A' });
      b.add({ w: 0.65, h: 0.22, d: 0.65, x: px, y: 3.08, z: cz0 + 0.15, color: '#CE382A' });
    }
    b.add({ w: 3.0, h: 0.3, d: 0.55, x: archX, y: 3.32, z: cz0 + 0.15, color: '#F5A623' });
    b.add({ w: 2.2, h: 0.3, d: 0.5, x: archX, y: 3.62, z: cz0 + 0.15, color: '#F2E3C4' });
    b.add({ w: 1.2, h: 0.3, d: 0.45, x: archX, y: 3.92, z: cz0 + 0.15, color: '#CE382A' });
    b.add({ w: 0.36, h: 0.36, d: 0.36, x: archX, y: 4.25, z: cz0 + 0.15, color: '#FFD15A', mat: 'metal', shape: 'sphere' });
    b.add({ w: 1.0, h: 0.5, d: 0.08, x: archX, y: 2.55, z: cz0 - 0.15, color: '#FFD15A', litColor: '#FFE7A3', stage: 0, mat: 'glow', shape: 'tri', rz: Math.PI, bevel: 0 });
    b.setPhase('props', 'drop', 60);
    marigoldGarland(archX - 1.1, archX + 1.1, 3.0, cz0 - 0.12);
    marigoldGarland(archX - 1.1, archX + 1.1, 2.75, cz0 - 0.14);
    // tree on a chabutra
    const tx = -2.6;
    const tz = 12.4;
    b.setPhase('details', 'rise', 61);
    b.add({ w: 2.4, h: 0.45, d: 2.4, x: tx, y: 0.22, z: tz, color: '#CDBB98', mat: 'stone', shape: 'cyl' });
    b.add({ w: 2.55, h: 0.08, d: 2.55, x: tx, y: 0.47, z: tz, color: '#CE382A', mat: 'stone', shape: 'cyl' });
    for (let i = 0; i < 4; i++) b.add({ w: 0.42 - i * 0.04, h: 0.9, d: 0.42 - i * 0.04, x: tx + Math.sin(i) * 0.05, y: 0.95 + i * 0.85, z: tz, color: shade('#6B4A32', i * 0.03), mat: 'wood', ry: i * 0.4 });
    b.add({ w: 0.18, h: 1.2, d: 0.18, x: tx + 0.5, y: 2.9, z: tz + 0.1, rz: -0.7, color: '#6B4A32', mat: 'wood' });
    b.add({ w: 0.16, h: 1.0, d: 0.16, x: tx - 0.45, y: 3.3, z: tz - 0.2, rz: 0.6, color: '#6B4A32', mat: 'wood' });
    b.setPhase('props', 'drop', 61);
    for (let i = 0; i < 24; i++) {
      const a = rand() * Math.PI * 2;
      const r = 0.4 + rand() * 1.6;
      const yy = 3.6 + rand() * 2.0 - r * 0.3;
      const s = 0.7 + rand() * 0.6;
      b.add({ w: s, h: s * 0.8, d: s, x: tx + Math.cos(a) * r, y: yy, z: tz + Math.sin(a) * r, color: shade('#2F7A45', (rand() - 0.5) * 0.25), mat: 'leaf', ry: rand() * 3 });
    }
    // red thread and diyas around the tree (more at stage 7)
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      diya(tx + Math.cos(a) * 1.1, 0.51, tz + Math.sin(a) * 1.1, 7);
    }
    // rangoli
    const rg: Vec3 = [0.8, 0.06, 9.4];
    rangolis.push({ pos: rg, size: 2.7, seed: 5, colors: ['#D64A91', '#F5A623', '#148C88', '#CE382A', '#FFD15A', '#3446A4'] });
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      diya(rg[0] + Math.cos(a) * 1.6, 0, rg[2] + Math.sin(a) * 1.6);
    }
    for (let i = 0; i < 14; i++) {
      const t = i / 13;
      diya(cx0 + 0.6 + t * (cx1 - cx0 - 1.2), 1.0, cz1 - 0.15, 7);
    }
    for (let i = 0; i < 6; i++) diya(cx1 - 0.15, 1.0, cz0 + 1.6 + i * 1.8, 7);
    anchors['courtyard.rangoliSide'] = { pos: [rg[0] + 2.0, 0.06, rg[2] + 1.5], rotY: -0.6 };
    anchors['courtyard.rangoli'] = { pos: [rg[0] + 0.3, 0.06, rg[2] + 3.4] };
    anchors['courtyard'] = { pos: [0.5, 0.5, 10.5] };
    lights.push({ id: 'courtyard', pos: [rg[0], 1.6, rg[2]], color: '#FFB25C', intensity: 5, distance: 7, stage: 0, lowGraphics: false });
    // flower baskets
    const basket = (x: number, z: number) => {
      b.add({ w: 0.6, h: 0.32, d: 0.6, x, y: 0.16, z, color: '#B98B52', mat: 'fabric', shape: 'cyl' });
      for (let i = 0; i < 7; i++) {
        const a = rand() * Math.PI * 2;
        const r = rand() * 0.2;
        b.add({ w: 0.15, h: 0.15, d: 0.15, x: x + Math.cos(a) * r, y: 0.36 + rand() * 0.06, z: z + Math.sin(a) * r, color: ['#F28C28', '#FFD15A', '#D64A91', '#FFF0D2'][i % 4], mat: 'fabric', shape: 'sphere', bevel: 0 });
      }
    };
    basket(4.9, 14.6);
    basket(5.4, 6.4);
    basket(-4.4, 6.6);
    // low-poly plants
    pottedPlant(-4.6, 0, 15.6, 1.2, '#3C8D4F');
    pottedPlant(5.6, 0, 15.7, 1.0, '#5BAE62');
    pottedPlant(3.2, 0, 15.8, 0.9, '#E86C9A');
    pottedPlant(-4.6, 0, 9.6, 1.0, '#4E9A58');
    characters.push({ id: 'dog', name: 'Sheru', kind: 'dog', pos: [3.4, 0.0, 15.3], rotY: 0.3, pose: 'sleep', anim: 'idle', stage: 0, interactive: 'dog', colors: { top: '#C28A4E', bottom: '#C28A4E', hair: '#8A5A30', skin: '#C28A4E' } });
    characters.push({ id: 'courtKid', name: 'Pinky', kind: 'child', pos: [-1.2, 0.06, 8.0], rotY: 1.0, pose: 'stand', anim: 'wave', stage: 0, colors: { top: '#D64A91', bottom: '#FFD15A', hair: '#1E1A1A', skin: '#B97A56' } });
  }

  b.finalize();
  return { blocks: b.blocks, glows, strings, characters, windows, signs, lights, rangolis, diyas, anchors };
}

export function shade(hex: string, amt: number) {
  const c = parseInt(hex.slice(1), 16);
  let r = (c >> 16) & 255;
  let g = (c >> 8) & 255;
  let bl = c & 255;
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(amt >= 0 ? v + (255 - v) * amt : v * (1 + amt))));
  r = f(r);
  g = f(g);
  bl = f(bl);
  return '#' + ((1 << 24) | (r << 16) | (g << 8) | bl).toString(16).slice(1);
}

let cached: World | null = null;
export function getWorld() {
  if (!cached) cached = buildWorld();
  return cached;
}
