import { mulberry32 } from '../utils/TextureGenerator';
import type { Vec3 } from '../assets/AssetRegistry';

// The street-level mohalla, described as data. The main gali runs along +x forever and is cut
// into chunks of STREET.chunk metres. Each chunk index maps to one of a handful of prebuilt
// variants (the chowk, the chai stall, the temple corner, houses, shops, side galis), so the
// renderer only ever moves a few prebuilt groups around while the player walks.
//
// Units are metres. Facades face the street; y = 0 is the road surface.

export const STREET = {
  chunk: 36,
  /** half width of the gali, house front to house front (road + sidewalks) */
  galiHalf: 3.6,
  /** half width of the carriageway */
  roadHalf: 2.5,
  floorH: 3.1,
  eye: 1.6,
  chowkHalf: 14,
  sideHalf: 2.0,
  sideLen: 26,
  /** player collision radius */
  radius: 0.32,
};

const C = STREET.chunk;
const GH = STREET.galiHalf;
const FH = STREET.floorH;

export type VariantKind = 'chowk' | 'chai' | 'temple' | 'houses' | 'shops' | 'sideN' | 'sideS';
export const VARIANTS: VariantKind[] = ['chowk', 'chai', 'temple', 'houses', 'shops', 'sideN', 'sideS'];

/** 0 box, 1 cylinder, 2 sphere */
export type Shape = 0 | 1 | 2;
export interface Inst {
  x: number;
  y: number;
  z: number;
  w: number;
  h: number;
  d: number;
  ry: number;
  rx?: number;
  rz?: number;
  color: number;
  shape: Shape;
}
export interface GlowPoint {
  x: number;
  y: number;
  z: number;
  color: number;
  size: number;
  /** 0 = steady, 1 = twinkle, 2 = diya flicker */
  tw: number;
}
export interface SignSpot {
  x: number;
  y: number;
  z: number;
  w: number;
  h: number;
  ry: number;
  slot: number;
}
export interface Rect {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}
export type PersonKind = 'man' | 'woman' | 'elder' | 'child' | 'chaiwala' | 'dog';
export type PersonAnim = 'idle' | 'talk' | 'look' | 'wave' | 'sip' | 'shop' | 'pray' | 'lean' | 'play' | 'wander' | 'sleep';
export interface Spawn {
  kind: PersonKind;
  x: number;
  y: number;
  z: number;
  ry: number;
  sit?: boolean;
  anim: PersonAnim;
  /** wander / play area */
  zone?: Rect;
}
export interface LampSpot {
  x: number;
  y: number;
  z: number;
  color: number;
}

export interface VariantData {
  kind: VariantKind;
  shell: Inst[];
  detail: Inst[];
  glow: Inst[];
  points: GlowPoint[];
  signs: SignSpot[];
  rangolis: { x: number; z: number; size: number; seed: number; y?: number }[];
  walk: Rect[];
  /** open road, chowk and side-gali lanes: the only places a cracker may be put down */
  burst: Rect[];
  /** paved ground (sidewalks, the chowk, lanes) drawn over the asphalt */
  pave: Rect[];
  obstacles: Rect[];
  lamps: LampSpot[];
  spawns: Spawn[];
  /** parked vehicles, drawn as illustrated cut-outs */
  props: { x: number; z: number; ry: number; sprite: 'parkedScooter' }[];
}

// ------------------------------------------------------------------------------------------
// Which variant lives at chunk k

const CANON: Record<number, VariantKind> = { [-3]: 'shops', [-2]: 'sideN', [-1]: 'chai', 0: 'chowk', 1: 'temple', 2: 'houses', 3: 'sideS' };
const FAR: VariantKind[] = ['houses', 'shops', 'sideN', 'houses', 'sideS', 'shops', 'chai', 'temple'];

export function variantAt(k: number): VariantKind {
  if (k in CANON) return CANON[k];
  const h = Math.imul(k ^ 0x9e3779b9, 0x85ebca6b) >>> 0;
  return FAR[(h >>> 7) % FAR.length];
}

export const chunkOf = (x: number) => Math.floor((x + C / 2) / C);

// ------------------------------------------------------------------------------------------
// Palette

const WALLS = [0xf3e3c3, 0xf2c7c2, 0x9fd6cd, 0xf6d48a, 0xb9d3ee, 0xd9a07a, 0xd8c6ea, 0xfaf3e6, 0xc9e2a6, 0xf0b27a, 0xe8d9b5, 0xf7b6c8];
const TRIMS = [0xce382a, 0x148c88, 0x3446a4, 0xd64a91, 0xa9573b, 0xf5a623, 0xfff0d2, 0x2f6b4f];
const SHUTTERS = [0x2f6b4f, 0x1e5f8a, 0x8a3b2a, 0x6b4a8a, 0x148c88];
const LIT = [0xffb85c, 0xffc874, 0xffa64a, 0xffd27a, 0xff9e5a, 0xffe0a0];
const DARK_WIN = 0x1b2442;
export const FAIRY = [0xffd15a, 0xff8a5b, 0xffe7a3, 0xf5a623, 0xff6f91, 0x7fe3d6, 0xfff3d0];
const CLOTH = [0xce382a, 0xd64a91, 0x148c88, 0x3446a4, 0xf5a623, 0xffd15a, 0x2f6b4f, 0x7a1f4f, 0xfff0d2, 0xe8702a, 0x6b4a8a, 0x1e5f8a];

// ------------------------------------------------------------------------------------------
// Builder

class Builder {
  d: VariantData;
  r: () => number;
  constructor(kind: VariantKind, seed: number) {
    this.d = { kind, shell: [], detail: [], glow: [], points: [], signs: [], rangolis: [], walk: [], burst: [], pave: [], obstacles: [], lamps: [], spawns: [], props: [] };
    this.r = mulberry32(seed);
  }
  pick<T>(a: T[]) {
    return a[Math.floor(this.r() * a.length)];
  }
  rr(a: number, b: number) {
    return a + this.r() * (b - a);
  }
  box(list: 'shell' | 'detail' | 'glow', x: number, y: number, z: number, w: number, h: number, d: number, color: number, ry = 0, shape: Shape = 0, rx = 0, rz = 0) {
    this.d[list].push({ x, y, z, w, h, d, ry, color, shape, rx, rz });
  }
  point(x: number, y: number, z: number, color: number, size = 0.32, tw = 1) {
    this.d.points.push({ x, y, z, color, size, tw });
  }
  /** a sagging string of fairy lights */
  fairy(a: Vec3, b: Vec3, spacing = 0.33, sag = 0.4, palette = FAIRY, size = 0.3) {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    const n = Math.max(2, Math.round(len / spacing));
    const off = Math.floor(this.r() * palette.length);
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      this.point(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - Math.sin(t * Math.PI) * sag, a[2] + (b[2] - a[2]) * t, palette[(i + off) % palette.length], size, 1);
    }
  }
  /** a string of marigold flowers */
  garland(a: Vec3, b: Vec3, sag = 0.18) {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    const n = Math.max(3, Math.round(len / 0.13));
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      this.box('detail', a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - Math.sin(t * Math.PI) * sag, a[2] + (b[2] - a[2]) * t, 0.11, 0.11, 0.11, i % 3 === 0 ? 0xffd15a : 0xf28c28, 0, 2);
    }
  }
  diya(x: number, y: number, z: number) {
    this.box('detail', x, y + 0.035, z, 0.14, 0.07, 0.14, 0xb8613a, 0, 1);
    this.point(x, y + 0.13, z, 0xffb547, 0.42, 2);
  }
  /** akash kandil: a paper lantern hung from a bracket */
  kandil(x: number, y: number, z: number, color: number) {
    this.box('detail', x, y + 0.45, z, 0.02, 0.5, 0.02, 0x2a2a2a);
    this.box('glow', x, y, z, 0.36, 0.36, 0.36, color, Math.PI / 4, 0, Math.PI / 4, 0);
    this.box('detail', x, y - 0.42, z, 0.04, 0.32, 0.04, color);
    this.point(x, y, z, color, 1.3, 0);
  }
  lampPost(x: number, z: number, armDir: number) {
    this.box('detail', x, 2.6, z, 0.14, 5.2, 0.14, 0x3b4152);
    this.box('detail', x, 5.2, z + armDir * 0.5, 0.08, 0.08, 1.0, 0x3b4152);
    this.box('glow', x, 5.08, z + armDir * 0.95, 0.42, 0.12, 0.24, 0xffe2a8);
    this.point(x, 5.0, z + armDir * 0.95, 0xffd59a, 2.2, 0);
    this.d.lamps.push({ x, y: 4.8, z: z + armDir * 0.95, color: 0xffc27a });
    this.d.obstacles.push({ x0: x - 0.2, x1: x + 0.2, z0: z - 0.2, z1: z + 0.2 });
  }
  pottedPlant(x: number, y: number, z: number, s = 1) {
    this.box('detail', x, y + 0.2 * s, z, 0.4 * s, 0.4 * s, 0.4 * s, 0xa9573b, 0, 1);
    this.box('detail', x, y + 0.55 * s, z, 0.5 * s, 0.45 * s, 0.5 * s, this.pick([0x3c8d4f, 0x2f7a43, 0x4f9a52]), 0, 2);
    if (this.r() > 0.5) this.box('detail', x + 0.1 * s, y + 0.75 * s, z, 0.12, 0.12, 0.12, 0xe83f7a, 0, 2);
  }
  rangoli(x: number, z: number, size: number, y = 0) {
    this.d.rangolis.push({ x, z, size, y, seed: Math.floor(this.r() * 1000) });
  }
  sign(x: number, y: number, z: number, w: number, h: number, ry: number, slot: number) {
    this.d.signs.push({ x, y, z, w, h, ry, slot });
  }
  person(kind: PersonKind, x: number, y: number, z: number, ry: number, anim: PersonAnim, extra: Partial<Spawn> = {}) {
    this.d.spawns.push({ kind, x, y, z, ry, anim, ...extra });
  }
}

/** Local building frame: a runs along the facade, b goes into the building, y is up. */
interface Frame {
  ox: number;
  oz: number;
  th: number;
}
function toWorld(f: Frame, a: number, b: number): [number, number] {
  const ux = Math.cos(f.th);
  const uz = -Math.sin(f.th);
  const nx = Math.sin(f.th);
  const nz = Math.cos(f.th);
  return [f.ox + a * ux + b * nx, f.oz + a * uz + b * nz];
}

interface HouseOpts {
  floors?: number;
  shop?: number; // sign slot, or -1 for a plain shop, undefined for a house
  depth?: number;
  balcony?: boolean;
  people?: boolean;
  boxSpot?: boolean;
  kind?: 'house' | 'shop' | 'pataka' | 'mithai' | 'temple';
  /** a clear family terrace on the roof (no tank, antenna or watchers) */
  terrace?: boolean;
  /** leave out the roof parapet on this end, where a terrace runs on over the next roof */
  openA0?: boolean;
  openA1?: boolean;
}

/** One building with its street-facing facade on the frame's a axis from a0 to a1. */
function building(B: Builder, f: Frame, a0: number, a1: number, o: HouseOpts = {}) {
  const r = B.r;
  const w = a1 - a0;
  const floors = o.floors ?? 2 + Math.floor(r() * 3.2);
  const D = o.depth ?? 10;
  const H = floors * FH + 0.25;
  const wall = B.pick(WALLS);
  const trim = B.pick(TRIMS);
  const shutterCol = B.pick(SHUTTERS);
  const am = (a0 + a1) / 2;
  const P = (a: number, b: number) => toWorld(f, a, b);
  const bx = (list: 'shell' | 'detail' | 'glow', a: number, y: number, b: number, ww: number, h: number, dd: number, color: number, shape: Shape = 0, rx = 0) => {
    const [x, z] = P(a, b);
    B.box(list, x, y, z, ww, h, dd, color, f.th, shape, rx);
  };
  const pt = (a: number, y: number, b: number, color: number, size = 0.3, tw = 1) => {
    const [x, z] = P(a, b);
    B.point(x, y, z, color, size, tw);
  };
  // body
  bx('shell', am, H / 2, D / 2, w - 0.04, H, D, wall);
  // plinth and floor bands
  bx('shell', am, 0.25, -0.05, w, 0.5, 0.1, darken(wall, 0.25));
  for (let fl = 1; fl < floors; fl++) bx('shell', am, fl * FH, -0.12, w, 0.18, 0.26, trim);
  // parapet with a coloured coping
  bx('shell', am, H + 0.45, 0.1, w, 0.9, 0.2, wall);
  bx('shell', am, H + 0.93, 0.1, w + 0.06, 0.08, 0.28, trim);
  if (!o.openA0) bx('shell', a0 + 0.1, H + 0.45, D / 2, 0.2, 0.9, D, wall);
  if (!o.openA1) bx('shell', a1 - 0.1, H + 0.45, D / 2, 0.2, 0.9, D, wall);
  bx('shell', am, H + 0.45, D - 0.1, w, 0.9, 0.2, wall);
  // corner pilasters
  bx('detail', a0 + 0.12, H / 2, -0.06, 0.24, H, 0.12, darken(wall, 0.08));
  bx('detail', a1 - 0.12, H / 2, -0.06, 0.24, H, 0.12, darken(wall, 0.08));

  // ground floor
  const kind = o.kind ?? (o.shop !== undefined ? 'shop' : 'house');
  if (kind === 'house') {
    const da = am + B.rr(-w * 0.2, w * 0.2);
    bx('detail', da, 1.08, -0.03, 1.1, 2.16, 0.08, B.pick([0x6b3d24, 0x8a5233, 0x5a2e1c]));
    bx('detail', da, 2.24, -0.06, 1.34, 0.16, 0.14, trim);
    bx('detail', da - 0.62, 1.1, -0.06, 0.1, 2.2, 0.14, trim);
    bx('detail', da + 0.62, 1.1, -0.06, 0.1, 2.2, 0.14, trim);
    // two steps and a toran of marigolds over the door
    bx('detail', da, 0.06, -0.22, 1.5, 0.12, 0.34, 0xc9b79a);
    bx('detail', da, 0.17, -0.12, 1.3, 0.1, 0.18, 0xd8c8aa);
    const [gx0, gz0] = P(da - 0.6, -0.12);
    const [gx1, gz1] = P(da + 0.6, -0.12);
    B.garland([gx0, 2.15, gz0], [gx1, 2.15, gz1], 0.16);
    // diyas either side of the door, a rangoli in front
    pt(da - 0.65, 0.2, -0.3, 0xffb547, 0.45, 2);
    pt(da + 0.65, 0.2, -0.3, 0xffb547, 0.45, 2);
    bx('detail', da - 0.65, 0.04, -0.3, 0.14, 0.07, 0.14, 0xb8613a, 1);
    bx('detail', da + 0.65, 0.04, -0.3, 0.14, 0.07, 0.14, 0xb8613a, 1);
    const [rx, rz] = P(da, -0.95);
    if (r() < 0.75) B.rangoli(rx, rz, 0.9 + r() * 0.3);
    // a ground floor window
    const wa = da < am ? da + 1.7 : da - 1.7;
    if (Math.abs(wa - am) < w / 2 - 0.8) groundWindow(wa);
    if (r() < 0.5) {
      const [px, pz] = P(da + (da < am ? -1.1 : 1.1), -0.35);
      B.pottedPlant(px, 0, pz, 0.8);
    }
  } else {
    // shop front: a lit interior behind an open rolling shutter, a counter and an awning
    const sw = Math.min(w - 0.8, 4.4);
    bx('glow', am, 1.25, -0.012, sw, 2.5, 0.02, B.pick([0xffc874, 0xffd9a0, 0xfff0d2]));
    bx('detail', am, 2.62, -0.1, sw + 0.1, 0.28, 0.2, 0x8d8f97);
    bx('detail', am, 0.45, -0.32, sw * 0.9, 0.9, 0.5, kind === 'mithai' ? 0xfff0d2 : 0x8a5233);
    // goods on shelves (visible against the glow) and on the counter
    for (let i = 0; i < 9; i++) {
      const ga = am - sw / 2 + 0.3 + (i / 8) * (sw - 0.6);
      const col = kind === 'pataka' ? B.pick([0xce382a, 0xf5a623, 0x3446a4, 0xd64a91, 0x2f6b4f]) : kind === 'mithai' ? B.pick([0xffd15a, 0xf28c28, 0xfff0d2, 0xd64a91]) : B.pick(CLOTH);
      bx('detail', ga, 0.98, -0.42, 0.24, 0.16 + r() * 0.12, 0.2, col);
      bx('detail', ga, 1.7 + (i % 3) * 0.3, -0.04, 0.3, 0.22, 0.06, col);
    }
    // awning: a striped tarp sloping down to the street
    for (let i = 0; i < 6; i++) bx('detail', am - sw / 2 + (i + 0.5) * (sw / 6), 2.88, -0.6, sw / 6, 0.05, 1.2, i % 2 ? 0xfff0d2 : B.pick([0xce382a, 0x148c88, 0xf5a623]), 0, -0.32);
    // a bare bulb under the awning
    pt(am, 2.55, -0.55, 0xfff0c8, 0.9, 0);
    bx('glow', am, 2.55, -0.55, 0.09, 0.12, 0.09, 0xfff0c8, 2);
    if (o.shop !== undefined && o.shop >= 0) {
      const [sx, sz] = P(am, -0.3);
      B.sign(sx, 3.4, sz, Math.min(w - 0.4, 4.6), 0.9, f.th, o.shop);
    }
    const [lx, lz] = P(am, -0.6);
    B.d.lamps.push({ x: lx, y: 2.5, z: lz, color: 0xffe0a8 });
  }

  function groundWindow(a: number) {
    const lit = r() < 0.8;
    bx('glow', a, 1.45, -0.012, 1.0, 1.1, 0.02, lit ? B.pick(LIT) : DARK_WIN);
    bx('detail', a, 0.86, -0.07, 1.2, 0.08, 0.14, trim);
    bx('detail', a, 2.06, -0.12, 1.4, 0.08, 0.36, trim);
    for (let i = -1; i <= 1; i++) bx('detail', a + i * 0.33, 1.45, -0.03, 0.03, 1.1, 0.03, 0x3a3a3a);
  }

  // upper floors
  const nWin = Math.max(1, Math.floor((w - 0.6) / 2.1));
  const balconyFloor = o.balcony === false ? -1 : 1 + Math.floor(r() * Math.max(1, floors - 1));
  for (let fl = 1; fl < floors; fl++) {
    const y0 = fl * FH;
    const hasBalcony = fl === balconyFloor && w > 4.2;
    for (let i = 0; i < nWin; i++) {
      const a = a0 + (w / nWin) * (i + 0.5);
      const lit = r() < 0.72;
      const color = lit ? B.pick(LIT) : DARK_WIN;
      bx('glow', a, y0 + 1.45, -0.012, 1.05, 1.3, 0.02, color);
      // frame, sill and chajja (sunshade)
      bx('detail', a, y0 + 0.76, -0.07, 1.25, 0.08, 0.14, trim);
      bx('shell', a, y0 + 2.2, -0.24, 1.5, 0.07, 0.5, trim);
      // wooden shutters, open, on some windows
      if (r() < 0.5) {
        bx('detail', a - 0.82, y0 + 1.45, -0.05, 0.5, 1.3, 0.05, shutterCol);
        bx('detail', a + 0.82, y0 + 1.45, -0.05, 0.5, 1.3, 0.05, shutterCol);
      } else {
        // a curtain half drawn across the light
        if (lit) bx('detail', a + (r() < 0.5 ? -0.3 : 0.3), y0 + 1.45, -0.03, 0.42, 1.25, 0.02, B.pick(CLOTH));
      }
      for (let j = -1; j <= 1; j++) bx('detail', a + j * 0.34, y0 + 1.45, -0.035, 0.025, 1.3, 0.025, 0x2e2e33);
      if (lit && r() < 0.35) pt(a, y0 + 0.86, -0.2, 0xffb547, 0.4, 2);
      // a lantern hung in a window
      if (lit && r() < 0.18) {
        const [kx, kz] = P(a, -0.35);
        B.kandil(kx, y0 + 1.9, kz, B.pick([0xff6f91, 0xffd15a, 0xff8a3d, 0x7fe3d6]));
      }
      // an AC unit or a pipe on some
      if (r() < 0.15) bx('detail', a + 0.95, y0 + 0.5, -0.25, 0.8, 0.55, 0.45, 0xe7e7e2);
    }
    if (hasBalcony) {
      const bw = Math.min(w - 1, 4.2);
      const ba = am + B.rr(-0.3, 0.3);
      bx('shell', ba, y0 + 0.05, -0.55, bw, 0.14, 1.1, darken(wall, 0.1));
      // railing: posts, top rail and a fairy string along it
      const posts = Math.round(bw / 0.28);
      for (let i = 0; i <= posts; i++) bx('detail', ba - bw / 2 + (i / posts) * bw, y0 + 0.55, -1.06, 0.035, 0.9, 0.035, 0x2e2e33);
      bx('detail', ba, y0 + 1.02, -1.06, bw, 0.06, 0.08, trim);
      bx('detail', ba - bw / 2, y0 + 0.55, -0.55, 0.05, 0.9, 1.0, 0x2e2e33);
      bx('detail', ba + bw / 2, y0 + 0.55, -0.55, 0.05, 0.9, 1.0, 0x2e2e33);
      const [f0x, f0z] = P(ba - bw / 2, -1.1);
      const [f1x, f1z] = P(ba + bw / 2, -1.1);
      B.fairy([f0x, y0 + 1.0, f0z], [f1x, y0 + 1.0, f1z], 0.22, 0.12);
      // a saree drying on the rail, or a pot of tulsi
      if (r() < 0.4) bx('detail', ba + bw * 0.25, y0 + 0.62, -1.1, 0.9, 0.75, 0.03, B.pick(CLOTH));
      const [px, pz] = P(ba - bw / 2 + 0.35, -0.6);
      B.pottedPlant(px, y0 + 0.12, pz, 0.7);
      // a balcony door behind
      bx('glow', ba, y0 + 1.15, -0.012, 0.95, 2.0, 0.02, B.pick(LIT));
      if (o.people !== false && r() < 0.85) {
        const [hx, hz] = P(ba + B.rr(-0.6, 0.6), -0.7);
        const kind = B.pick<PersonKind>(['woman', 'woman', 'elder', 'man', 'child', 'woman']);
        B.person(kind, hx, y0 + 0.12, hz, f.th + Math.PI, B.pick<PersonAnim>(['lean', 'look', 'wave', 'talk']));
      }
    }
  }
  // roof: water tank, antenna, a string of lights along the parapet
  if (!o.terrace && r() < 0.75) {
    const [tx, tz] = P(a0 + B.rr(1, Math.max(1.2, w - 1)), D * B.rr(0.4, 0.7));
    B.box('shell', tx, H + 0.4 + 0.65, tz, 1.15, 1.3, 1.15, 0x23242a, 0, 1);
    B.box('detail', tx, H + 0.2, tz, 1.25, 0.4, 1.25, darken(wall, 0.2));
  }
  if (!o.terrace && r() < 0.4) {
    const [ax, az] = P(a0 + w * 0.7, D * 0.3);
    B.box('detail', ax, H + 1.6, az, 0.04, 2.2, 0.04, 0x8d8f97);
    B.box('detail', ax, H + 2.4, az, 0.9, 0.03, 0.03, 0x8d8f97);
  }
  if (o.terrace || r() < 0.65) {
    const [px0, pz0] = P(a0 + 0.1, -0.02);
    const [px1, pz1] = P(a1 - 0.1, -0.02);
    B.fairy([px0, H + 0.98, pz0], [px1, H + 0.98, pz1], 0.3, 0.05);
    if (r() < 0.6) {
      // a vertical cascade down the front
      for (let i = 0; i < 3; i++) {
        const a = a0 + w * (0.25 + i * 0.25);
        const [cx, cz] = P(a, -0.03);
        B.fairy([cx, H + 0.9, cz], [cx, Math.max(2.8, H - 3.5), cz], 0.3, 0, FAIRY, 0.26);
      }
    }
  }
  // rooftop watchers
  if (!o.terrace && o.people !== false && r() < 0.18) {
    const [hx, hz] = P(a0 + B.rr(0.8, w - 0.8), 0.6);
    B.person(B.pick<PersonKind>(['man', 'child', 'woman']), hx, H, hz, f.th + Math.PI, 'look');
  }
  return { H, floors };
}

/** A row of buildings along a facade line, with gaps left open (side galis, recesses). */
function row(B: Builder, f: Frame, a0: number, a1: number, gaps: [number, number][], o: HouseOpts & { shops?: number[]; shopChance?: number } = {}) {
  const segs: [number, number][] = [];
  let s = a0;
  for (const [g0, g1] of [...gaps].sort((p, q) => p[0] - q[0])) {
    if (g0 > s) segs.push([s, g0]);
    s = Math.max(s, g1);
  }
  if (a1 > s) segs.push([s, a1]);
  const shops = [...(o.shops ?? [])];
  for (const [s0, s1] of segs) {
    let a = s0;
    while (a < s1 - 0.5) {
      let w = B.rr(5, 8.5);
      if (s1 - (a + w) < 4) w = s1 - a;
      const isShop = shops.length > 0 && B.r() < (o.shopChance ?? 0.5);
      const slot = isShop ? shops.shift()! : undefined;
      building(B, f, a, a + w, { ...o, shop: slot, kind: slot === 0 ? 'pataka' : slot === 1 ? 'mithai' : slot !== undefined ? 'shop' : 'house' });
      a += w;
    }
  }
}

// main gali frames
const NORTH: Frame = { ox: 0, oz: GH, th: 0 };
const SOUTH: Frame = { ox: 0, oz: -GH, th: Math.PI };

function streetBasics(B: Builder, gapsN: [number, number][], gapsS: [number, number][], o: { shopsN?: number[]; shopsS?: number[]; shopChance?: number } = {}) {
  row(B, NORTH, -C / 2, C / 2, gapsN, { shops: o.shopsN, shopChance: o.shopChance });
  // the south row's a axis runs towards -x
  row(B, SOUTH, -C / 2, C / 2, gapsS.map(([g0, g1]) => [-g1, -g0] as [number, number]), { shops: o.shopsS, shopChance: o.shopChance });
  B.d.walk.push({ x0: -C / 2 - 0.5, x1: C / 2 + 0.5, z0: -GH + 0.42, z1: GH - 0.42 });
  B.d.burst.push({ x0: -C / 2 - 0.5, x1: C / 2 + 0.5, z0: -STREET.roadHalf + 0.3, z1: STREET.roadHalf - 0.3 });
  sidewalks(B, -C / 2, C / 2);
  // street lights, alternating sides
  for (let x = -C / 2 + 6; x < C / 2; x += 12) {
    const side = Math.round((x + 100) / 12) % 2 ? 1 : -1;
    B.lampPost(x, side * (GH - 0.5), -side);
  }
  // strings of lights and buntings criss-crossing the gali
  for (let x = -C / 2 + 3; x < C / 2; x += 6) {
    const y0 = B.rr(5.6, 6.8);
    B.fairy([x, y0, GH], [x + B.rr(-2, 2), y0 + B.rr(-0.4, 0.4), -GH], 0.3, 0.9);
  }
  for (let x = -C / 2 + 6; x < C / 2; x += 12) bunting(B, [x, 4.6, GH], [x + 3, 4.6, -GH]);
  // a hanging lantern mid-gali now and then
  B.kandil(B.rr(-C / 2 + 4, C / 2 - 4), 5.3, B.rr(-0.6, 0.6), B.pick([0xff6f91, 0xffd15a, 0xff8a3d]));
}

function sidewalks(B: Builder, x0: number, x1: number) {
  const RH = STREET.roadHalf;
  B.d.pave.push({ x0, x1, z0: RH, z1: GH + 0.2 });
  B.d.pave.push({ x0, x1, z0: -GH - 0.2, z1: -RH });
  // kerb stones with the odd painted stripe
  for (let x = x0; x < x1 - 0.01; x += 1.2) {
    const col = Math.round(x / 1.2) % 2 ? 0xd8d2c4 : 0x9a958a;
    B.box('detail', x + 0.6, 0.05, RH, 1.18, 0.1, 0.16, col);
    B.box('detail', x + 0.6, 0.05, -RH, 1.18, 0.1, 0.16, col);
  }
}

function bunting(B: Builder, a: Vec3, b: Vec3) {
  const n = 14;
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const x = a[0] + (b[0] - a[0]) * t;
    const z = a[2] + (b[2] - a[2]) * t;
    const y = a[1] - Math.sin(t * Math.PI) * 0.7;
    const ry = Math.atan2(b[0] - a[0], b[2] - a[2]) + Math.PI / 2;
    B.box('detail', x, y - 0.14, z, 0.3, 0.3, 0.01, B.pick([0xce382a, 0xffd15a, 0x148c88, 0xd64a91, 0xf5a623]), ry, 0, 0, Math.PI / 4);
  }
}

function parkedScooter(B: Builder, x: number, z: number, ry: number) {
  // the gift-laden scooter from the cast, standing on its side stand
  B.d.props.push({ x, z, ry, sprite: 'parkedScooter' });
  B.d.obstacles.push({ x0: x - 0.9, x1: x + 0.9, z0: z - 0.4, z1: z + 0.4 });
}

function bench(B: Builder, x: number, z: number, len: number, alongX: boolean) {
  const ry = alongX ? 0 : Math.PI / 2;
  B.box('detail', x, 0.45, z, len, 0.07, 0.42, 0x8a5233, ry);
  B.box('detail', x - (alongX ? len / 2 - 0.1 : 0), 0.22, z - (alongX ? 0 : len / 2 - 0.1), 0.08, 0.44, 0.38, 0x5a2e1c, ry);
  B.box('detail', x + (alongX ? len / 2 - 0.1 : 0), 0.22, z + (alongX ? 0 : len / 2 - 0.1), 0.08, 0.44, 0.38, 0x5a2e1c, ry);
  const hw = alongX ? len / 2 : 0.25;
  const hd = alongX ? 0.25 : len / 2;
  B.d.obstacles.push({ x0: x - hw, x1: x + hw, z0: z - hd, z1: z + hd });
}

function tree(B: Builder, x: number, z: number, r = 2) {
  // a raised chabutra platform with a neem tree
  B.box('shell', x, 0.25, z, r * 2, 0.5, r * 2, 0xd8c8aa, 0, 1);
  B.box('detail', x, 0.52, z, r * 2 + 0.1, 0.06, r * 2 + 0.1, 0xce382a, 0, 1);
  B.box('shell', x, 2.2, z, 0.45, 4, 0.45, 0x6b4a32, 0, 1);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    B.box('shell', x + Math.cos(a) * 1.3, 4.6 + B.rr(-0.4, 0.6), z + Math.sin(a) * 1.3, 2.6, 1.9, 2.6, B.pick([0x2f6b43, 0x3c7d4f, 0x285c3a]), 0, 2);
  }
  B.box('shell', x, 5.6, z, 3, 2.2, 3, 0x336f45, 0, 2);
  // fairy lights wound round the canopy
  for (let i = 0; i < 40; i++) {
    const a = (i / 40) * Math.PI * 6;
    const rr = 1.5 + (i / 40) * 0.8;
    B.point(x + Math.cos(a) * rr, 3.8 + (i / 40) * 2.6, z + Math.sin(a) * rr, FAIRY[i % FAIRY.length], 0.3, 1);
  }
  B.d.obstacles.push({ x0: x - r, x1: x + r, z0: z - r, z1: z + r });
  B.d.lamps.push({ x, y: 4.2, z, color: 0xffcf7a });
}

// ------------------------------------------------------------------------------------------
// Variants

function buildChowk(B: Builder) {
  const H = STREET.chowkHalf;
  // the square's four sides; the gali enters from the west and leaves to the east
  const north: Frame = { ox: 0, oz: H, th: 0 };
  building(B, north, -C / 2, -11.5, { floors: 4 });
  building(B, north, -11.5, -5.5, { shop: 7, kind: 'shop', floors: 3 });
  // the pataka and mithai shops share one long roof: the family's big terrace
  building(B, north, -5.5, 1.5, { shop: 0, kind: 'pataka', floors: 2, terrace: true, openA1: true });
  building(B, north, 1.5, 8, { shop: 1, kind: 'mithai', floors: 2, terrace: true, openA0: true });
  building(B, north, 8, C / 2, { floors: 4, balcony: false });
  terraceAndBalcony(B);
  aangan(B);
  societyCompound(B);
  row(B, { ox: 0, oz: -H, th: Math.PI }, -C / 2, C / 2, [], { shops: [4, 6, 8], shopChance: 0.7 });
  const west: Frame = { ox: -H, oz: 0, th: -Math.PI / 2 };
  const east: Frame = { ox: H, oz: 0, th: Math.PI / 2 };
  building(B, west, GH, H, { depth: C / 2 - H, floors: 3 });
  building(B, west, -H, -GH, { depth: C / 2 - H, floors: 4 });
  building(B, east, -H, -GH, { depth: C / 2 - H, floors: 3 });
  building(B, east, GH, H, { depth: C / 2 - H, floors: 4 });
  B.d.walk.push({ x0: -H + 0.42, x1: H - 0.42, z0: -H + 0.42, z1: H - 0.42 });
  B.d.walk.push({ x0: -C / 2 - 0.5, x1: C / 2 + 0.5, z0: -GH + 0.42, z1: GH - 0.42 });
  B.d.burst.push({ x0: -H + 1.2, x1: H - 1.2, z0: -H + 1.2, z1: H - 1.2 });
  B.d.pave.push({ x0: -H - 0.2, x1: H + 0.2, z0: -H - 0.2, z1: H + 0.2 });
  sidewalks(B, -C / 2, -H);
  sidewalks(B, H, C / 2);
  B.d.burst.push({ x0: -C / 2 - 0.5, x1: C / 2 + 0.5, z0: -STREET.roadHalf + 0.3, z1: STREET.roadHalf - 0.3 });
  // a neem tree on its chabutra, benches, lamp posts at the corners
  tree(B, -8.5, 8.5);
  bench(B, -8.5, 5.4, 2.2, true);
  for (const [x, z] of [[-12.5, -12.5], [12.5, -12.5], [12.5, 10.4], [-12.5, 12.5]]) B.lampPost(x, z, 0);
  // a canopy of fairy lights strung across the whole square
  for (let i = 0; i < 9; i++) {
    const x = -H + 1.5 + i * ((2 * H - 3) / 8);
    B.fairy([x, 8.6, H], [x + B.rr(-1, 1), 8.6, -H], 0.35, 1.6);
  }
  for (let i = 0; i < 4; i++) {
    const z = -H + 3 + i * ((2 * H - 6) / 3);
    B.fairy([-H, 9.2, z], [H, 9.2, z + B.rr(-1, 1)], 0.38, 1.8, [0xffd15a, 0xfff3d0, 0xf5a623]);
  }
  for (let i = 0; i < 6; i++) B.kandil(B.rr(-10, 10), B.rr(6.4, 7.2), B.rr(-10, 10), B.pick([0xff6f91, 0xffd15a, 0xff8a3d, 0x7fe3d6]));
  bunting(B, [-H, 6, -H], [H, 6, H]);
  bunting(B, [-H, 6, H], [H, 6, -H]);
  // rangolis on the paving, kept off the middle where crackers are lit
  B.rangoli(9, -9, 2.2);
  B.rangoli(-9, -9, 1.6);
  B.rangoli(9, 9, 1.8);
  // the pataka shop's display table out front, under its own bulbs
  B.box('detail', -2, 0.42, H - 1.4, 3.2, 0.06, 1.0, 0x8a5233);
  for (const dx of [-1.5, 1.5]) for (const dz of [-0.45, 0.45]) B.box('detail', -2 + dx, 0.2, H - 1.4 + dz, 0.06, 0.4, 0.06, 0x5a2e1c);
  for (let i = 0; i < 12; i++) B.box('detail', -3.3 + (i % 6) * 0.5, 0.56 + Math.floor(i / 6) * 0.06, H - 1.7 + Math.floor(i / 6) * 0.5, 0.36, 0.22, 0.26, B.pick([0xce382a, 0xf5a623, 0x3446a4, 0xd64a91, 0x2f6b4f]));
  B.d.obstacles.push({ x0: -3.7, x1: -0.3, z0: H - 2, z1: H - 0.8 });
  B.fairy([-3.8, 2.6, H - 0.4], [-0.2, 2.6, H - 0.4], 0.2, 0.2);
  // parked scooters along the south side
  parkedScooter(B, -11, -12.3, 0.2);
  parkedScooter(B, -9.4, -12.4, -0.1);
  parkedScooter(B, 6, 12.5, Math.PI + 0.15);
  // people: a shopkeeper, groups chatting, kids playing in the corners, a dog asleep
  B.person('man', -4.3, 0, H - 1.3, Math.PI, 'shop');
  B.person('man', 4.5, 0, 9.5, 2.4, 'talk');
  B.person('woman', 5.3, 0, 8.7, -0.7, 'talk');
  B.person('elder', 5.6, 0, 9.8, -2.2, 'look');
  B.person('woman', -10.5, 0, -6, 0.6, 'talk');
  B.person('woman', -9.6, 0, -5.2, -2.6, 'talk');
  B.person('elder', -8.5, 0.5, 5.4, 0, 'sip', { sit: true });
  B.person('man', -9.4, 0.5, 5.4, 0, 'talk', { sit: true });
  const kidsN: Rect = { x0: 2, x1: 12, z0: 5, z1: 12 };
  const kidsS: Rect = { x0: -12, x1: -3, z0: -12, z1: -6 };
  for (let i = 0; i < 3; i++) B.person('child', B.rr(kidsN.x0, kidsN.x1), 0, B.rr(kidsN.z0, kidsN.z1), 0, 'play', { zone: kidsN });
  for (let i = 0; i < 2; i++) B.person('child', B.rr(kidsS.x0, kidsS.x1), 0, B.rr(kidsS.z0, kidsS.z1), 0, 'play', { zone: kidsS });
  B.person('dog', 11.5, 0, -11.8, 0.4, 'sleep');
  B.person('dog', -6, 0, 11, 2, 'wander', { zone: { x0: -12, x1: -4, z0: 7, z1: 12 } });
  // wanderers crossing the square
  const sq: Rect = { x0: -12, x1: 12, z0: -12, z1: 12 };
  for (let i = 0; i < 4; i++) B.person(B.pick<PersonKind>(['man', 'woman', 'woman', 'elder', 'man']), B.rr(-11, 11), 0, B.rr(-11, 11), 0, 'wander', { zone: sq });
}

function buildChai(B: Builder) {
  // a recess off the north side holds the chai stall
  const R0 = -6;
  const R1 = 4;
  const RD = 4.2;
  streetBasics(B, [[R0, R1]], [], { shopsS: [5, 13], shopChance: 0.6 });
  building(B, { ox: 0, oz: GH + RD, th: 0 }, R0, R1, { floors: 3, depth: 8 });
  // side walls of the recess
  B.box('shell', R0 - 0.1, 2, GH + RD / 2, 0.2, 4, RD, 0xe8d9b5);
  B.box('shell', R1 + 0.1, 2, GH + RD / 2, 0.2, 4, RD, 0xe8d9b5);
  B.d.walk.push({ x0: R0 + 0.42, x1: R1 - 0.42, z0: GH - 1, z1: GH + RD - 0.42 });
  B.d.pave.push({ x0: R0, x1: R1, z0: GH, z1: GH + RD });
  // the stall: a counter, a stove with a kettle, glasses, a tarp roof and a hanging bulb
  const cz = GH + RD - 0.9;
  B.box('detail', -1.5, 0.5, cz, 3.4, 1.0, 0.8, 0x8a5233);
  B.box('detail', -1.5, 1.02, cz, 3.5, 0.05, 0.85, 0xc9b79a);
  B.box('detail', -2.4, 1.15, cz, 0.36, 0.2, 0.36, 0x3a3a3a, 0, 1);
  B.box('glow', -2.4, 1.07, cz, 0.3, 0.05, 0.3, 0xff7a2e, 0, 1);
  B.box('detail', -2.4, 1.38, cz, 0.3, 0.3, 0.3, 0xb8b8b8, 0, 1);
  for (let i = 0; i < 6; i++) B.box('detail', -1.6 + i * 0.16, 1.1, cz - 0.2, 0.07, 0.1, 0.07, 0xfff3d0, 0, 1);
  B.box('detail', -1.5, 2.65, cz - 0.2, 4.4, 0.06, 2.4, 0x1e5f8a, 0, 0, -0.18);
  B.box('glow', -1.5, 2.25, cz - 0.6, 0.1, 0.13, 0.1, 0xfff0c8, 0, 2);
  B.point(-1.5, 2.25, cz - 0.6, 0xfff0c8, 1.1, 0);
  B.d.lamps.push({ x: -1.5, y: 2.2, z: cz - 0.6, color: 0xffd9a0 });
  B.sign(-1.5, 3.25, GH + RD - 0.05, 3.6, 0.85, 0, 2);
  B.d.obstacles.push({ x0: -3.3, x1: 0.3, z0: cz - 0.45, z1: GH + RD });
  // benches and the regulars
  bench(B, -4.9, GH + 1.6, 2.4, false);
  bench(B, 2.9, GH + 1.6, 2.4, false);
  B.person('chaiwala', -1.6, 0, cz + 0.6, Math.PI, 'shop');
  B.person('elder', -4.9, 0.5, GH + 1.0, Math.PI / 2, 'sip', { sit: true });
  B.person('man', -4.9, 0.5, GH + 2.0, Math.PI / 2, 'talk', { sit: true });
  B.person('man', 2.9, 0.5, GH + 1.2, -Math.PI / 2, 'sip', { sit: true });
  B.person('elder', 2.9, 0.5, GH + 2.2, -Math.PI / 2, 'talk', { sit: true });
  // three regulars standing round their chai in a loose semicircle, open to the street
  B.person('man', 0.3, 0, GH + 1.65, Math.PI / 2 + 0.2, 'sip');
  B.person('elder', 1.0, 0, GH + 2.3, Math.PI, 'talk');
  B.person('woman', 1.7, 0, GH + 1.6, -Math.PI / 2 - 0.2, 'sip');
  B.person('dog', 1.6, 0, GH + 3.1, 2.6, 'sleep');
  parkedScooter(B, 7.5, GH - 1.0, 0.05);
  parkedScooter(B, -10, -GH + 1.0, Math.PI);
  B.person('woman', 10, 0, -GH + 1.2, 0.3, 'talk');
  B.person('woman', 10.7, 0, -GH + 1.6, -2.6, 'talk');
  // two neighbours meeting on the far sidewalk, hands joined in a namaste
  B.person('elder', -5.2, 0, -GH + 0.95, Math.PI / 2, 'pray');
  B.person('woman', -4.25, 0, -GH + 0.95, -Math.PI / 2, 'pray');
  // a family out at their decorated door
  B.person('man', 1.2, 0, -GH + 0.6, 0.2, 'look');
  B.person('woman', 2.0, 0, -GH + 0.55, -0.2, 'wave');
  B.person('child', 1.6, 0, -GH + 1.0, 0, 'talk');
}

function buildTemple(B: Builder) {
  const T0 = -12;
  const T1 = -4;
  const TD = 5.2;
  const SX = 8;
  const SH = STREET.sideHalf;
  streetBasics(B, [[T0, T1]], [[SX - SH, SX + SH]], { shopsN: [9], shopsS: [10, 14] });
  // back wall of the temple court and its side walls
  B.box('shell', (T0 + T1) / 2, 2.2, GH + TD + 0.2, T1 - T0, 4.4, 0.4, 0xfff0d2);
  B.box('shell', T0 - 0.15, 1.6, GH + TD / 2, 0.3, 3.2, TD, 0xfff0d2);
  B.box('shell', T1 + 0.15, 1.6, GH + TD / 2, 0.3, 3.2, TD, 0xfff0d2);
  B.box('shell', (T0 + T1) / 2, 4.5, GH + TD + 0.2, T1 - T0 + 0.3, 0.2, 0.6, 0xf5a623);
  B.d.walk.push({ x0: T0 + 0.42, x1: T1 - 0.42, z0: GH - 1, z1: GH + 2.3 });
  B.d.pave.push({ x0: T0, x1: T1, z0: GH, z1: GH + TD });
  // the shrine: stepped plinth, white body, saffron shikhara, kalash and flag
  const sx = (T0 + T1) / 2;
  const sz = GH + 3.9;
  B.box('shell', sx, 0.15, sz, 5.6, 0.3, 2.6, 0xd8c8aa);
  B.box('shell', sx, 0.45, sz + 0.2, 5.0, 0.3, 2.2, 0xe8dcc0);
  B.box('shell', sx, 1.9, sz + 0.4, 3.2, 2.6, 1.8, 0xfaf3e6);
  B.box('glow', sx, 1.6, sz - 0.52, 1.1, 1.6, 0.04, 0xffb85c);
  B.box('detail', sx, 1.45, sz - 0.4, 0.36, 0.7, 0.2, 0xce382a);
  B.box('detail', sx, 1.95, sz - 0.4, 0.3, 0.3, 0.2, 0xf5a623, 0, 2);
  for (let i = 0; i < 5; i++) {
    const s = 3.2 - i * 0.55;
    B.box('shell', sx, 3.35 + i * 0.55, sz + 0.4, s, 0.55, s * 0.62, i % 2 ? 0xf5a623 : 0xfff0d2);
  }
  B.box('detail', sx, 6.25, sz + 0.4, 0.3, 0.4, 0.3, 0xffd15a, 0, 2);
  B.box('detail', sx + 0.2, 7.0, sz + 0.4, 0.03, 1.4, 0.03, 0x5a2e1c);
  B.box('detail', sx + 0.5, 7.4, sz + 0.4, 0.6, 0.38, 0.01, 0xf28c28, 0, 0, 0, -0.1);
  // bell, garlands, diyas along the steps
  B.box('detail', sx + 1.9, 2.5, sz - 0.9, 0.24, 0.26, 0.24, 0xc9a24a, 0, 1);
  B.garland([sx - 1.6, 3.15, sz - 0.5], [sx + 1.6, 3.15, sz - 0.5], 0.35);
  B.garland([sx - 1.6, 3.1, sz - 0.5], [sx - 1.6, 1.0, sz - 0.5], 0);
  B.garland([sx + 1.6, 3.1, sz - 0.5], [sx + 1.6, 1.0, sz - 0.5], 0);
  for (let i = 0; i < 11; i++) B.diya(sx - 2.5 + i * 0.5, 0.3, sz - 1.25);
  for (let i = 0; i < 7; i++) B.diya(sx - 1.8 + i * 0.6, 0.6, sz - 0.85);
  B.rangoli(sx, GH + 1.2, 1.7);
  B.d.lamps.push({ x: sx, y: 2.4, z: sz - 1.5, color: 0xffb85c });
  B.sign(sx, 4.95, GH + TD - 0.05, 4.2, 0.8, 0, 11);
  B.d.obstacles.push({ x0: sx - 2.85, x1: sx + 2.85, z0: sz - 1.35, z1: GH + TD });
  B.person('elder', sx - 0.9, 0, GH + 2.1, Math.PI, 'pray');
  B.person('woman', sx + 0.8, 0, GH + 2.0, Math.PI, 'pray');
  B.person('child', sx + 1.5, 0, GH + 1.4, Math.PI - 0.4, 'look');
  sideGali(B, SX, -1);
}

/** A side gali leaving the main gali at x = sx on the north (+1) or south (-1) side. */
function sideGali(B: Builder, sx: number, side: 1 | -1) {
  const SH = STREET.sideHalf;
  const L = STREET.sideLen;
  const z0 = side * GH;
  const zEnd = side * (GH + L);
  B.d.walk.push(side > 0 ? { x0: sx - SH + 0.42, x1: sx + SH - 0.42, z0: GH - 1, z1: GH + L - 0.42 } : { x0: sx - SH + 0.42, x1: sx + SH - 0.42, z0: -GH - L + 0.42, z1: -GH + 1 });
  B.d.pave.push(side > 0 ? { x0: sx - SH - 0.2, x1: sx + SH + 0.2, z0: GH, z1: GH + L + 0.2 } : { x0: sx - SH - 0.2, x1: sx + SH + 0.2, z0: -GH - L - 0.2, z1: -GH });
  B.d.burst.push(side > 0 ? { x0: sx - SH + 0.9, x1: sx + SH - 0.9, z0: GH + 1, z1: GH + L - 1.5 } : { x0: sx - SH + 0.9, x1: sx + SH - 0.9, z0: -GH - L + 1.5, z1: -GH - 1 });
  // buildings along both sides (beyond the main row's depth), facing into the side gali
  const startB = GH + 10;
  const west: Frame = { ox: sx - SH, oz: 0, th: -Math.PI / 2 };
  const east: Frame = { ox: sx + SH, oz: 0, th: Math.PI / 2 };
  if (side > 0) {
    row(B, west, startB, GH + L, [], { depth: 8 });
    row(B, east, -(GH + L), -startB, [], { depth: 8 });
  } else {
    row(B, west, -(GH + L), -startB, [], { depth: 8 });
    row(B, east, startB, GH + L, [], { depth: 8 });
  }
  // the main row's side walls line the first stretch: give them a few windows and a door
  for (const wx of [sx - SH, sx + SH]) {
    const facing = wx < sx ? 1 : -1;
    for (let i = 0; i < 3; i++) {
      const z = z0 + side * (2 + i * 3);
      B.box('glow', wx + facing * 0.012, 4.55, z, 0.02, 1.2, 1.0, B.r() < 0.7 ? B.pick(LIT) : DARK_WIN);
      B.box('detail', wx + facing * 0.07, 3.85, z, 0.14, 0.08, 1.2, 0xfff0d2);
    }
  }
  // the house closing the end of the side gali, its doorway glowing down the lane
  building(B, side > 0 ? { ox: 0, oz: zEnd, th: 0 } : { ox: 0, oz: zEnd, th: Math.PI }, side > 0 ? sx - SH - 1 : -(sx + SH + 1), side > 0 ? sx + SH + 1 : -(sx - SH - 1), { floors: 3, depth: 8 });
  // strings of lights across the lane, kids and a dog
  for (let i = 1; i < 8; i++) {
    const z = z0 + side * i * 3.2;
    B.fairy([sx - SH, B.rr(4.2, 5.2), z], [sx + SH, B.rr(4.2, 5.2), z + side * 0.4], 0.24, 0.45);
  }
  B.kandil(sx, 4.4, z0 + side * 9, 0xff6f91);
  B.kandil(sx, 4.6, z0 + side * 17, 0xffd15a);
  const zone: Rect = side > 0 ? { x0: sx - SH + 0.6, x1: sx + SH - 0.6, z0: GH + 4, z1: GH + L - 2 } : { x0: sx - SH + 0.6, x1: sx + SH - 0.6, z0: -GH - L + 2, z1: -GH - 4 };
  for (let i = 0; i < 3; i++) B.person('child', B.rr(zone.x0, zone.x1), 0, B.rr(zone.z0, zone.z1), 0, 'play', { zone });
  B.person('dog', sx + 0.8, 0, z0 + side * 20, side > 0 ? Math.PI : 0, 'wander', { zone });
  B.person('woman', sx - SH + 0.6, 0, z0 + side * 14, side > 0 ? Math.PI / 2 : -Math.PI / 2, 'talk');
  B.person('elder', sx - SH + 1.2, 0, z0 + side * 14.6, -Math.PI / 2, 'talk');
  for (let i = 0; i < 5; i++) B.diya(sx + SH - 0.3, 0, z0 + side * (5 + i * 0.9));
  B.rangoli(sx, z0 + side * 7, 1.3);
  B.lampPost(sx + SH - 0.4, z0 + side * 12, 0);
  B.d.lamps.push({ x: sx, y: 3.4, z: zEnd - side * 1, color: 0xffc874 });
}

function buildHouses(B: Builder) {
  streetBasics(B, [], [], { shopsN: [], shopsS: [] });
  // doorsteps get extra diyas and rangolis in a house lane
  for (let x = -C / 2 + 3; x < C / 2 - 2; x += B.rr(3.5, 6)) {
    const s = B.r() < 0.5 ? 1 : -1;
    B.diya(x, 0, s * (GH - 0.25));
    B.diya(x + 0.35, 0, s * (GH - 0.25));
  }
  B.person('woman', -8, 0, GH - 1.2, Math.PI + 0.3, 'talk');
  B.person('woman', -7.3, 0, GH - 1.6, -0.6, 'talk');
  B.person('elder', 9, 0, -GH + 1.1, 0.2, 'look');
  B.person('man', 9.7, 0, -GH + 1.4, -2.4, 'talk');
  const zone: Rect = { x0: -4, x1: 6, z0: -1.8, z1: 1.8 };
  B.person('child', 1, 0, 0.5, 0, 'play', { zone });
  B.person('child', 2, 0, -0.8, 0, 'play', { zone });
  parkedScooter(B, 14, -GH + 1.0, Math.PI);
}

function buildShops(B: Builder) {
  streetBasics(B, [], [], { shopsN: [3, 13, 15, 12], shopsS: [1, 4, 0, 6], shopChance: 0.85 });
  B.person('man', -6, 0, GH - 1.1, Math.PI, 'shop');
  B.person('woman', -5.2, 0, GH - 1.4, Math.PI + 0.6, 'talk');
  B.person('woman', 7, 0, -GH + 1.2, 0, 'shop');
  B.person('child', 7.6, 0, -GH + 1.3, -0.4, 'look');
  B.person('man', 12, 0, GH - 1.0, Math.PI, 'sip');
  parkedScooter(B, -14, GH - 1.0, 0);
  parkedScooter(B, 2, -GH + 1.0, Math.PI + 0.1);
}

let cache: Record<VariantKind, VariantData> | null = null;

export function getVariants() {
  if (cache) return cache;
  const seeds: Record<VariantKind, number> = { chowk: 11, chai: 23, temple: 37, houses: 41, shops: 53, sideN: 67, sideS: 79 };
  const out = {} as Record<VariantKind, VariantData>;
  for (const v of VARIANTS) {
    const B = new Builder(v, seeds[v]);
    if (v === 'chowk') buildChowk(B);
    else if (v === 'chai') buildChai(B);
    else if (v === 'temple') buildTemple(B);
    else if (v === 'houses') buildHouses(B);
    else if (v === 'shops') buildShops(B);
    else if (v === 'sideN') {
      streetBasics(B, [[-1 - STREET.sideHalf, -1 + STREET.sideHalf]], [], { shopsN: [], shopsS: [12, 3], shopChance: 0.5 });
      sideGali(B, -1, 1);
    } else {
      streetBasics(B, [], [[3 - STREET.sideHalf, 3 + STREET.sideHalf]], { shopsN: [15, 5], shopsS: [], shopChance: 0.5 });
      sideGali(B, 3, -1);
    }
    out[v] = B.d;
  }
  cache = out;
  return out;
}

// ------------------------------------------------------------------------------------------
// Collision and placement queries (world coordinates)

export const inRect = (r: Rect, x: number, z: number, m: number) => x > r.x0 + m && x < r.x1 - m && z > r.z0 + m && z < r.z1 - m;
const nearRect = (r: Rect, x: number, z: number, m: number) => x > r.x0 - m && x < r.x1 + m && z > r.z0 - m && z < r.z1 + m;

/** Is (x, z) open ground (gali, chowk, side gali, courtyards), at least `m` from walls and props? */
export function isOpen(x: number, z: number, m = STREET.radius) {
  const V = getVariants();
  const k = chunkOf(x);
  let inside = false;
  for (const kk of [k - 1, k, k + 1]) {
    const v = V[variantAt(kk)];
    const lx = x - kk * C;
    if (lx < -C / 2 - 2 || lx > C / 2 + 2) continue;
    if (!inside) for (const r of v.walk) if (inRect(r, lx, z, m - STREET.radius)) inside = true;
    for (const o of v.obstacles) if (nearRect(o, lx, z, m)) return false;
  }
  return inside;
}

/** Any open ground (road, chowk, pavement, side gali) with room around it: walls, stalls
 * and props must stay a little clear of the cracker. */
export function isBurstGround(x: number, z: number, clearance: number) {
  return isOpen(x, z, Math.max(0.55, Math.min(0.9, clearance * 0.5)));
}

/** Off the main gali and the chowk, in one of the side galis (which run along z). */
export function inSideGali(x: number, z: number) {
  const k = chunkOf(x);
  const lx = x - k * C;
  if (Math.abs(z) < GH + 0.3) return false;
  if (variantAt(k) === 'chowk' && Math.abs(lx) < STREET.chowkHalf && Math.abs(z) < STREET.chowkHalf) return false;
  return true;
}


// ------------------------------------------------------------------------------------------
// The five places. The Pataka Store sits in front of the pataka shop in the chowk; above
// the chowk are the family's big terrace (Chhat) and a long balcony that looks down on the
// square. The Society Compound and the Aangan are walled courtyards of their own, north and
// south of the chowk.

export type LevelId = 'store' | 'terrace' | 'balcony' | 'society' | 'aangan';

export interface Level {
  id: LevelId;
  name: string;
  /** floor height; 0 is the road */
  floor: number;
  /** where you can walk */
  walk: Rect;
  /** where crackers can go down (null: none here) */
  burst: Rect | null;
  spawn: { x: number; z: number; yaw: number; pitch: number };
}

const TERRACE_Y = 2 * FH + 0.25;
const BALCONY_Y = FH + 0.12;
const CH = STREET.chowkHalf;
/** the aangan sits on its own, south of the chowk, walled in by the family's house */
const FZ = -62;
const FW = 8;
const FD = 7;
/** the society compound, north of the chowk, walled in by its apartment blocks */
const SZ = 64;
const SW = 11;
const SD = 9;

export const LEVELS: Record<LevelId, Level> = {
  store: {
    id: 'store',
    name: 'Pataka Store',
    floor: 0,
    walk: { x0: -9, x1: 5, z0: 1, z1: CH - 2.3 },
    burst: null,
    spawn: { x: -2, z: CH - 8.2, yaw: Math.PI, pitch: 0.06 },
  },
  terrace: {
    id: 'terrace',
    name: 'Chhat',
    floor: TERRACE_Y,
    walk: { x0: -5.15, x1: 7.65, z0: CH + 0.3, z1: CH + 9.7 },
    burst: { x0: -4.9, x1: 7.4, z0: CH + 0.5, z1: CH + 8.4 },
    spawn: { x: 1.25, z: CH + 9.3, yaw: 0, pitch: -0.22 },
  },
  balcony: {
    id: 'balcony',
    name: 'Balcony',
    floor: BALCONY_Y,
    walk: { x0: 8.5, x1: 13.5, z0: CH - 2.05, z1: CH - 0.05 },
    burst: { x0: 8.7, x1: 13.3, z0: CH - 1.9, z1: CH - 0.25 },
    // in the middle of the railing, looking down on the chowk
    spawn: { x: 11.0, z: CH - 1.72, yaw: 0.38, pitch: -0.3 },
  },
  society: {
    id: 'society',
    name: 'Society Compound',
    floor: 0,
    walk: { x0: -SW + 0.6, x1: SW - 0.6, z0: SZ - SD + 0.6, z1: SZ + SD - 0.6 },
    burst: { x0: -SW + 2.2, x1: SW - 2.2, z0: SZ - SD + 2.6, z1: SZ + SD - 2.2 },
    spawn: { x: 0, z: SZ - SD + 1.0, yaw: Math.PI, pitch: -0.1 },
  },
  aangan: {
    id: 'aangan',
    name: 'Aangan',
    floor: 0,
    walk: { x0: -FW + 0.6, x1: FW - 0.6, z0: FZ - FD + 0.6, z1: FZ + FD - 0.6 },
    burst: { x0: -FW + 1.4, x1: FW - 1.4, z0: FZ - FD + 1.6, z1: FZ + FD - 2.0 },
    spawn: { x: 0, z: FZ - FD + 0.9, yaw: Math.PI, pitch: -0.12 },
  },
};

/** The place the player is in now. */
export const levelState: { id: LevelId } = { id: 'store' };
export const currentLevel = () => LEVELS[levelState.id];

/** Walkable here, on the current floor? */
export function openOnLevel(x: number, z: number, m = STREET.radius) {
  const L = currentLevel();
  return inRect(L.walk, x, z, m) && (L.floor > 0.5 || isOpen(x, z, m));
}

/** May a cracker go here, on the current floor? Raised floors only keep it off the railing. */
export function burstOnLevel(x: number, z: number, clearance: number) {
  const L = currentLevel();
  if (!L.burst) return false;
  if (L.floor > 0.5) return inRect(L.burst, x, z, Math.min(clearance, 0.3));
  return inRect(L.burst, x, z, 0) && isBurstGround(x, z, clearance);
}

/** A candle: a short white stick and its flame. */
function candle(B: Builder, x: number, y: number, z: number, h = 0.22) {
  B.box('detail', x, y + h / 2, z, 0.06, h, 0.06, 0xfff3d8, 0, 1);
  B.point(x, y + h + 0.06, z, 0xffc760, 0.34, 2);
}

function terraceAndBalcony(B: Builder) {
  // the big terrace over the pataka and mithai shops: a tiled floor with room to spare,
  // a canopy of fairy lights on bamboo poles, rangolis, rows of diyas and candles, kandils,
  // and the family out on the durrie at the back
  const y = TERRACE_Y;
  const x0 = -5.35;
  const x1 = 7.85;
  const xm = (x0 + x1) / 2;
  const w = x1 - x0;
  const z0 = CH + 0.2;
  const z1 = CH + 9.8;
  const zm = (z0 + z1) / 2;
  B.box('shell', xm, y + 0.005, zm, w, 0.01, z1 - z0, 0xc9a27e);
  for (let i = 1; i < 13; i++) B.box('detail', x0 + i * (w / 13), y + 0.012, zm, 0.03, 0.006, z1 - z0, 0xa9876a);
  for (let i = 1; i < 9; i++) B.box('detail', xm, y + 0.012, z0 + i * ((z1 - z0) / 9), w, 0.006, 0.03, 0xa9876a);
  // rangolis: a big one in the middle, two either side
  B.rangoli(xm, CH + 4.4, 3.4, y);
  B.rangoli(xm - 4.4, CH + 4.4, 1.9, y);
  B.rangoli(xm + 4.4, CH + 4.4, 1.9, y);
  // diyas the whole length of the front parapet and down both sides
  for (let i = 0; i < 22; i++) B.diya(x0 + 0.3 + i * ((w - 0.6) / 21), y + 0.92, CH + 0.1);
  for (let i = 0; i < 9; i++) {
    B.diya(x0 + 0.1, y + 0.92, z0 + 0.6 + i * 1.05);
    B.diya(x1 - 0.1, y + 0.92, z0 + 0.6 + i * 1.05);
  }
  // diyas ringing the big rangoli, candles in clusters at its corners
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    B.diya(xm + Math.cos(a) * 2.05, y, CH + 4.4 + Math.sin(a) * 2.05);
  }
  for (const [cx, cz] of [[x0 + 0.6, z0 + 0.5], [x1 - 0.6, z0 + 0.5], [x0 + 0.6, z1 - 0.6], [x1 - 0.6, z1 - 0.6], [xm - 4.4, CH + 3], [xm + 4.4, CH + 3]]) {
    for (let k = 0; k < 5; k++) candle(B, cx + B.rr(-0.25, 0.25), y, cz + B.rr(-0.25, 0.25), B.rr(0.14, 0.3));
  }
  // bamboo poles at the corners and the middle, with a canopy of lights between them
  const poles: Vec3[] = [];
  for (const px of [x0 + 0.25, xm, x1 - 0.25]) {
    for (const pz of [z0 + 0.25, z1 - 0.25]) {
      B.box('detail', px, y + 1.5, pz, 0.08, 3.0, 0.08, 0xc8a46a);
      poles.push([px, y + 2.95, pz]);
    }
  }
  for (let i = 0; i < 7; i++) {
    const fz = z0 + 0.3 + i * ((z1 - z0 - 0.6) / 6);
    B.fairy([x0 + 0.25, y + 2.9, fz], [x1 - 0.25, y + 2.9, fz + B.rr(-0.3, 0.3)], 0.32, 0.5);
  }
  for (let i = 0; i < 5; i++) {
    const fx = x0 + 0.5 + i * ((w - 1) / 4);
    B.fairy([fx, y + 2.95, z0 + 0.25], [fx, y + 2.95, z1 - 0.25], 0.34, 0.6, [0xffd15a, 0xfff3d0, 0xf5a623]);
  }
  B.fairy([x0 + 0.1, y + 1.0, z0], [x1 - 0.1, y + 1.0, z0], 0.24, 0.12);
  // kandils hung from the canopy
  for (const [kx, kz, kc] of [[xm - 3.6, CH + 2.6, 0xff6f91], [xm + 3.6, CH + 2.6, 0xffd15a], [xm - 2, CH + 6.6, 0xff8a3d], [xm + 2, CH + 6.6, 0x7fe3d6], [xm, CH + 4.4, 0xff6f91]] as const) B.kandil(kx, y + 2.3, kz, kc);
  for (const [lx, lz] of [[xm - 3.5, CH + 3], [xm + 3.5, CH + 3], [xm, CH + 7.5]]) B.d.lamps.push({ x: lx, y: y + 2.6, z: lz, color: 0xffd9a0 });
  B.point(xm, y + 0.5, CH + 4.4, 0xffb547, 0.8, 2);
  // potted plants and a durrie at the back, the family on it
  for (const [px, pz] of [[x0 + 0.5, CH + 2.4], [x1 - 0.5, CH + 2.4], [x0 + 0.5, CH + 7.4], [x1 - 0.5, CH + 7.4]]) B.pottedPlant(px, y, pz, 0.9);
  B.box('detail', xm, y + 0.014, CH + 8.6, 5.2, 0.02, 1.6, 0xce382a);
  B.box('detail', xm, y + 0.018, CH + 8.6, 4.6, 0.02, 1.1, 0xf5a623);
  B.box('detail', xm + 1.6, y + 0.1, CH + 8.6, 0.6, 0.16, 0.4, 0xf2e2c4);
  B.person('woman', xm - 2.0, y, CH + 9.1, Math.PI + 0.3, 'wave');
  B.person('elder', xm - 0.8, y + 0.02, CH + 8.8, Math.PI, 'sip', { sit: true });
  B.person('man', xm + 2.6, y, CH + 9.2, Math.PI - 0.3, 'look');
  B.person('child', xm + 3.4, y, CH + 8.2, Math.PI - 0.6, 'talk');
  B.person('child', xm - 3.4, y, CH + 8.4, Math.PI + 0.5, 'wave');
  B.person('woman', x0 + 1.0, y, CH + 1.0, -0.5, 'lean');

  // a long balcony on the first floor next door, with a railing and its own lights
  const by = FH;
  const bx0 = 8.3;
  const bx1 = 13.7;
  const bxm = (bx0 + bx1) / 2;
  const bz0 = CH - 2.2;
  B.box('shell', bxm, by + 0.05, CH - 1.1, bx1 - bx0, 0.14, 2.2, 0xd9c7a3);
  B.box('shell', bxm, by - 0.08, CH - 1.1, bx1 - bx0, 0.12, 2.2, 0xa9573b);
  const posts = 20;
  for (let i = 0; i <= posts; i++) B.box('detail', bx0 + (i / posts) * (bx1 - bx0), by + 0.6, bz0 + 0.05, 0.04, 0.95, 0.04, 0x2e2e33);
  B.box('detail', bxm, by + 1.08, bz0 + 0.05, bx1 - bx0, 0.07, 0.09, 0xf5a623);
  for (const x of [bx0, bx1]) B.box('detail', x, by + 0.6, CH - 1.1, 0.05, 0.95, 2.2, 0x2e2e33);
  B.fairy([bx0, by + 1.08, bz0], [bx1, by + 1.08, bz0], 0.22, 0.14);
  B.fairy([bx0, by + 2.7, bz0 + 0.1], [bx1, by + 2.7, bz0 + 0.1], 0.3, 0.3);
  B.box('glow', 9.8, by + 1.15, CH - 0.012, 1.0, 2.0, 0.02, 0xffc874);
  B.box('glow', 12.4, by + 1.15, CH - 0.012, 1.0, 2.0, 0.02, 0xffd27a);
  B.pottedPlant(8.6, BALCONY_Y, CH - 0.3, 0.7);
  for (let i = 0; i < 6; i++) B.diya(bx0 + 0.4 + i * 0.95, by + 1.13, bz0 + 0.05);
  B.d.lamps.push({ x: bxm, y: by + 2.4, z: CH - 0.6, color: 0xffd9a0 });
  B.person('woman', 8.9, BALCONY_Y, CH - 0.5, 0.6, 'lean');
}

function aangan(B: Builder) {
  // the family's aangan, walled in by the house and its neighbours, lit for the party
  const x0 = -FW;
  const x1 = FW;
  const z0 = FZ - FD;
  const z1 = FZ + FD;
  building(B, { ox: 0, oz: z1, th: 0 }, x0 - 0.5, x1 + 0.5, { floors: 2, kind: 'house', depth: 6, people: false });
  building(B, { ox: 0, oz: z0, th: Math.PI }, x0 - 0.5, x1 + 0.5, { floors: 2, depth: 6, people: false });
  building(B, { ox: x0, oz: FZ, th: -Math.PI / 2 }, -FD, FD, { floors: 2, depth: 6, people: false });
  building(B, { ox: x1, oz: FZ, th: Math.PI / 2 }, -FD, FD, { floors: 2, depth: 6, people: false });
  B.box('shell', 0, -0.02, FZ, 2 * FW + 1, 0.04, 2 * FD + 1, 0x8a7a68);
  B.d.pave.push({ x0, x1, z0, z1 });
  B.d.walk.push({ x0: x0 + 0.42, x1: x1 - 0.42, z0: z0 + 0.42, z1: z1 - 0.42 });
  B.d.burst.push({ x0: x0 + 1.4, x1: x1 - 1.4, z0: z0 + 1.6, z1: z1 - 2.0 });
  // a big rangoli ringed with diyas in the middle, smaller ones by the doors
  B.rangoli(0, FZ, 3.0);
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    B.diya(Math.cos(a) * 1.8, 0, FZ + Math.sin(a) * 1.8);
  }
  tulsi(B, -4.6, z1 - 1.5);
  B.rangoli(4.5, z1 - 1.4, 1.4);
  // diyas along the foot of every wall, candles in the corners
  for (let i = 0; i < 18; i++) {
    const t = x0 + 0.5 + i * ((2 * FW - 1) / 17);
    B.diya(t, 0, z1 - 0.25);
    B.diya(t, 0, z0 + 0.25);
  }
  for (let i = 0; i < 14; i++) {
    const t = z0 + 0.6 + i * ((2 * FD - 1.2) / 13);
    B.diya(x0 + 0.25, 0, t);
    B.diya(x1 - 0.25, 0, t);
  }
  for (const [cx, cz] of [[x0 + 0.7, z0 + 0.7], [x1 - 0.7, z0 + 0.7], [x0 + 0.7, z1 - 0.7], [x1 - 0.7, z1 - 0.7]]) {
    for (let k = 0; k < 6; k++) candle(B, cx + B.rr(-0.3, 0.3), 0, cz + B.rr(-0.3, 0.3), B.rr(0.16, 0.34));
  }
  // fairy lights criss-crossing the courtyard, marigold garlands on the front house
  for (let i = 0; i < 6; i++) {
    const fx = x0 + 1 + i * ((2 * FW - 2) / 5);
    B.fairy([fx, 6.2, z0], [fx + B.rr(-1, 1), 6.2, z1], 0.32, 1.1);
  }
  B.fairy([x0, 6.6, z0], [x1, 6.6, z1], 0.34, 1.3, [0xffd15a, 0xfff3d0, 0xf5a623]);
  B.fairy([x0, 6.6, z1], [x1, 6.6, z0], 0.34, 1.3, [0xffd15a, 0xfff3d0, 0xf5a623]);
  for (let i = 0; i < 4; i++) B.garland([x0 + 1 + i * 3.8, 3.2, z1 - 0.05], [x0 + 4.4 + i * 3.8, 3.2, z1 - 0.05], 0.35);
  for (const [kx, kz, kc] of [[-4, FZ - 2.5, 0xff6f91], [4, FZ - 2.5, 0xffd15a], [-4, FZ + 3, 0x7fe3d6], [4, FZ + 3, 0xff8a3d]] as const) B.kandil(kx, 4.6, kz, kc);
  for (const [lx, lz] of [[-4, FZ], [4, FZ], [0, FZ + 4]]) B.d.lamps.push({ x: lx, y: 3.6, z: lz, color: 0xffd9a0 });
  // a jhoola on the left, a table of mithai on the right, a charpai by the back wall
  const jx = x0 + 2;
  const jz = FZ + 2.6;
  for (const dx of [-0.9, 0.9]) B.box('detail', jx + dx, 1.25, jz, 0.1, 2.5, 0.1, 0x6b3d24);
  B.box('detail', jx, 2.5, jz, 2.0, 0.1, 0.12, 0x6b3d24);
  for (const dx of [-0.55, 0.55]) B.box('detail', jx + dx, 1.5, jz, 0.02, 1.95, 0.02, 0xd8c8aa);
  B.box('detail', jx, 0.52, jz, 1.3, 0.06, 0.45, 0xce382a);
  B.garland([jx - 0.9, 2.45, jz - 0.07], [jx + 0.9, 2.45, jz - 0.07], 0.12);
  B.d.obstacles.push({ x0: jx - 1, x1: jx + 1, z0: jz - 0.4, z1: jz + 0.4 });
  const tx = x1 - 2;
  const tz = FZ + 2.6;
  B.box('detail', tx, 0.42, tz, 1.8, 0.06, 0.8, 0x8a5233);
  for (const dx of [-0.8, 0.8]) for (const dz of [-0.32, 0.32]) B.box('detail', tx + dx, 0.2, tz + dz, 0.06, 0.4, 0.06, 0x5a2e1c);
  for (let i = 0; i < 4; i++) {
    B.box('detail', tx - 0.6 + i * 0.4, 0.47, tz, 0.32, 0.03, 0.32, 0xd8d8d8, 0, 1);
    for (let k = 0; k < 4; k++) B.box('detail', tx - 0.65 + i * 0.4 + (k % 2) * 0.1, 0.52, tz - 0.05 + Math.floor(k / 2) * 0.1, 0.08, 0.06, 0.08, B.pick([0xf5a623, 0xfff0d2, 0xd64a91, 0x8a5233]), 0, 2);
  }
  B.d.obstacles.push({ x0: tx - 1, x1: tx + 1, z0: tz - 0.5, z1: tz + 0.5 });
  B.box('detail', 0, 0.38, z1 - 1.2, 2.2, 0.1, 0.9, 0xd8c8aa);
  for (const dx of [-1.0, 1.0]) for (const dz of [-0.4, 0.4]) B.box('detail', dx, 0.18, z1 - 1.2 + dz, 0.08, 0.36, 0.08, 0x6b3d24);
  B.d.obstacles.push({ x0: -1.2, x1: 1.2, z0: z1 - 1.7, z1: z1 - 0.7 });
  for (const [px, pz] of [[x0 + 0.6, FZ - 2], [x1 - 0.6, FZ - 2]]) B.pottedPlant(px, 0, pz, 1);
  // the friends: on the charpai, at the jhoola, round the mithai, kids running about
  B.person('elder', -0.5, 0.45, z1 - 1.2, Math.PI, 'sip', { sit: true });
  B.person('woman', 0.5, 0.45, z1 - 1.2, Math.PI, 'talk', { sit: true });
  B.person('child', jx, 0, jz - 0.9, 0.2, 'wave');
  B.person('woman', jx + 1.6, 0, jz - 0.6, -0.6, 'talk');
  B.person('man', tx - 0.4, 0, tz - 1.0, 0.3, 'talk');
  B.person('woman', tx + 0.6, 0, tz - 0.9, -0.3, 'look');
  B.person('man', 3.2, 0, FZ - 3.6, 0.6, 'wave');
  const kids: Rect = { x0: -5, x1: 5, z0: FZ - 5, z1: FZ - 2.6 };
  for (let i = 0; i < 3; i++) B.person('child', B.rr(kids.x0, kids.x1), 0, B.rr(kids.z0, kids.z1), 0, 'play', { zone: kids });
  B.person('dog', -5.6, 0, FZ - 4.2, 0.8, 'sleep');
}


/** A tulsi chaura: a whitewashed pedestal with a red border, the plant on top, a diya at its foot. */
function tulsi(B: Builder, x: number, z: number) {
  B.box('shell', x, 0.45, z, 0.8, 0.9, 0.8, 0xf2e6d0, 0, 1);
  B.box('detail', x, 0.86, z, 0.86, 0.08, 0.86, 0xce382a);
  B.box('detail', x, 0.3, z - 0.405, 0.42, 0.42, 0.01, 0xf5a623, 0, 0, 0, Math.PI / 4);
  B.box('detail', x, 0.95, z, 0.6, 0.1, 0.6, 0x6b4a32);
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    B.box('shell', x + Math.cos(a) * 0.14, 1.12 + (i % 3) * 0.1, z + Math.sin(a) * 0.14, 0.2, 0.26, 0.2, B.pick([0x2f6b43, 0x3c7d4f, 0x285c3a]), 0, 2);
  }
  B.box('shell', x, 1.42, z, 0.22, 0.3, 0.22, 0x336f45, 0, 2);
  B.diya(x, 0, z - 0.62);
  B.diya(x - 0.25, 0, z - 0.58);
  B.diya(x + 0.25, 0, z - 0.58);
  B.rangoli(x, z - 1.3, 1.1);
  B.d.obstacles.push({ x0: x - 0.5, x1: x + 0.5, z0: z - 0.5, z1: z + 0.5 });
}

function societyCompound(B: Builder) {
  // an apartment society's compound: four-storey blocks on three sides and a gate wall on
  // the south, scooters parked in rows, neighbours out on the lawn, kids running about
  const x0 = -SW;
  const x1 = SW;
  const z0 = SZ - SD;
  const z1 = SZ + SD;
  building(B, { ox: 0, oz: z1, th: 0 }, x0 - 0.5, -3.6, { floors: 4, depth: 7 });
  building(B, { ox: 0, oz: z1, th: 0 }, -3.6, 3.6, { floors: 4, depth: 7 });
  building(B, { ox: 0, oz: z1, th: 0 }, 3.6, x1 + 0.5, { floors: 4, depth: 7 });
  building(B, { ox: x0, oz: SZ, th: -Math.PI / 2 }, -SD, SD, { floors: 4, depth: 7 });
  building(B, { ox: x1, oz: SZ, th: Math.PI / 2 }, -SD, SD, { floors: 4, depth: 7 });
  building(B, { ox: 0, oz: z0, th: Math.PI }, x0 - 0.5, x1 + 0.5, { floors: 2, depth: 6, people: false });
  B.box('shell', 0, -0.02, SZ, 2 * SW + 1, 0.04, 2 * SD + 1, 0x8f8576);
  B.d.pave.push({ x0, x1, z0, z1 });
  B.d.walk.push({ x0: x0 + 0.42, x1: x1 - 0.42, z0: z0 + 0.42, z1: z1 - 0.42 });
  B.d.burst.push({ x0: x0 + 2.2, x1: x1 - 2.2, z0: z0 + 2.6, z1: z1 - 2.2 });
  // a patch of lawn in the middle with potted plants at its corners, rangolis at the block entrances
  B.box('detail', 0, 0.012, SZ + 1, 8, 0.02, 6, 0x5f9a52);
  for (const [px, pz] of [[-4.2, SZ - 2.2], [4.2, SZ - 2.2], [-4.2, SZ + 4.2], [4.2, SZ + 4.2]]) B.pottedPlant(px, 0, pz, 1);
  B.rangoli(-7.2, z1 - 1.6, 1.4);
  B.rangoli(0, z1 - 1.6, 1.6);
  B.rangoli(7.2, z1 - 1.6, 1.4);
  // the scooters in rows along the east and west walls
  for (let i = 0; i < 4; i++) parkedScooter(B, x0 + 1.2, z0 + 3 + i * 1.6, Math.PI / 2 + 0.1);
  for (let i = 0; i < 3; i++) parkedScooter(B, x1 - 1.2, z0 + 3.4 + i * 1.6, -Math.PI / 2 - 0.1);
  // benches, lamp posts, a canopy of lights between the blocks, kandils on the balconies
  bench(B, -4.5, z1 - 3.4, 2.2, true);
  bench(B, 4.5, z1 - 3.4, 2.2, true);
  for (const [x, z] of [[x0 + 0.8, z0 + 0.8], [x1 - 0.8, z0 + 0.8], [x0 + 0.8, z1 - 0.8], [x1 - 0.8, z1 - 0.8]]) B.lampPost(x, z, 0);
  for (let i = 0; i < 7; i++) {
    const fx = x0 + 1 + i * ((2 * SW - 2) / 6);
    B.fairy([fx, 9.5, z0], [fx + B.rr(-1, 1), 9.5, z1], 0.34, 1.8);
  }
  B.fairy([x0, 10, z0], [x1, 10, z1], 0.36, 2, [0xffd15a, 0xfff3d0, 0xf5a623]);
  B.fairy([x0, 10, z1], [x1, 10, z0], 0.36, 2, [0xffd15a, 0xfff3d0, 0xf5a623]);
  for (let i = 0; i < 6; i++) B.kandil(B.rr(-8, 8), B.rr(6.5, 7.5), SZ + B.rr(-6, 6), B.pick([0xff6f91, 0xffd15a, 0xff8a3d, 0x7fe3d6]));
  for (const [lx, lz] of [[-5, SZ], [5, SZ], [0, SZ + 5]]) B.d.lamps.push({ x: lx, y: 4.2, z: lz, color: 0xffd9a0 });
  // neighbours: chatting by the benches, an elder on one, kids on the lawn
  B.person('elder', -4.5, 0.5, z1 - 3.4, Math.PI, 'sip', { sit: true });
  B.person('woman', -3.4, 0, z1 - 4.4, -2.6, 'talk');
  B.person('woman', -2.6, 0, z1 - 3.8, 2.2, 'talk');
  B.person('man', 4.4, 0, z1 - 4.6, Math.PI + 0.4, 'talk');
  B.person('man', 5.4, 0, z1 - 4.2, -2.4, 'look');
  B.person('woman', x1 - 2.6, 0, z0 + 6, -1.2, 'wave');
  const kids: Rect = { x0: -4, x1: 4, z0: SZ - 2, z1: SZ + 4 };
  for (let i = 0; i < 4; i++) B.person('child', B.rr(kids.x0, kids.x1), 0, B.rr(kids.z0, kids.z1), 0, 'play', { zone: kids });
  B.person('dog', x0 + 2.4, 0, z1 - 1.8, 0.4, 'sleep');
}

/** Where the player stands when the doors open: in the Pataka Store. */
export const START = { x: LEVELS.store.spawn.x, z: LEVELS.store.spawn.z, yaw: LEVELS.store.spawn.yaw };

function darken(c: number, k: number) {
  const r = ((c >> 16) & 255) * (1 - k);
  const g = ((c >> 8) & 255) * (1 - k);
  const b = (c & 255) * (1 - k);
  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b);
}
