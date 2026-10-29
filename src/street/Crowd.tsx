import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { runtime, type WorldEvent } from '../game/Runtime';
import { useGame } from '../game/GameState';
import { audio } from '../audio/AudioEngine';
import { chunkOf, getVariants, isOpen, STREET, variantAt, type PersonAnim, type PersonKind, type Rect } from './StreetLayout';
import { makeCanvas, toTexture } from '../utils/TextureGenerator';

// The people of the mohalla, drawn as instanced body parts: every leg in the street is one
// InstancedMesh, every head another, and so on, so a crowd of ~180 costs a dozen draw calls.
// Each agent is posed procedurally every frame (far ones less often, very far ones not at all).
//
// Kinds of agents: walkers on the sidewalks (they stream with the player so the gali never
// empties), the regulars of each chunk (chai uncles, aunties on balconies, shopkeepers,
// chatting groups, kids at play, dogs), and riders that the traffic system carries.
//
// Safety: crackers on the ground are "hazards". Everyone keeps clear of them, and people
// only ever react to a burst (flinch, cover ears, step back, cheer, film, run off).

const GH = STREET.galiHalf;

export type ReactKind = 'none' | 'flinch' | 'ears' | 'step' | 'cheer' | 'film' | 'clap' | 'watch' | 'flee';

export interface Agent {
  idx: number;
  kind: PersonKind;
  owner: number | 'walker' | 'rider';
  x: number;
  y: number;
  z: number;
  ry: number;
  sit: boolean;
  anim: PersonAnim | 'walk' | 'ride';
  zone?: Rect;
  scale: number;
  female: boolean;
  phase: number;
  speed: number;
  /** walkers: sidewalk lane and direction */
  lane: number;
  dir: number;
  laneOff: number;
  tx: number;
  tz: number;
  wait: number;
  moving: number;
  react: ReactKind;
  reactT: number;
  reactDur: number;
  fx: number;
  fz: number;
  baseRy: number;
  lookUp: number;
  hidden: boolean;
  /** rider pose details */
  pillion?: boolean;
}

interface Part {
  geo: THREE.BufferGeometry;
  mat: 'solid' | 'glow';
}

const UNIT = new THREE.BoxGeometry(1, 1, 1);
const SKIRT = new THREE.CylinderGeometry(0.4, 0.5, 1, 10);
const PARTS: Part[] = [
  { geo: UNIT, mat: 'solid' }, // 0 legL
  { geo: UNIT, mat: 'solid' }, // 1 legR
  { geo: SKIRT, mat: 'solid' }, // 2 skirt / saree
  { geo: UNIT, mat: 'solid' }, // 3 torso
  { geo: UNIT, mat: 'solid' }, // 4 armL
  { geo: UNIT, mat: 'solid' }, // 5 armR
  { geo: UNIT, mat: 'solid' }, // 6 head
  { geo: UNIT, mat: 'solid' }, // 7 hair (top)
  { geo: UNIT, mat: 'solid' }, // 8 hair (back) / dog ears
  { geo: UNIT, mat: 'solid' }, // 9 dupatta / shawl / tail
  { geo: UNIT, mat: 'glow' }, // 10 phone screen
];

const SKIN = ['#8d5a3b', '#a86b4a', '#c68a64', '#7a4b31', '#b97a56', '#9a6142'];
const HAIR = ['#1e1a1a', '#2b2220', '#3a2a20', '#161212'];
const GREY = ['#d9d2c5', '#bfb8ab', '#e6e0d6'];
const TOPS = ['#ce382a', '#d64a91', '#148c88', '#3446a4', '#f5a623', '#ffd15a', '#2f6b4f', '#7a1f4f', '#fff0d2', '#e8702a', '#6b4a8a', '#1e5f8a', '#f2e3c4', '#8a3b2a'];
const BOTTOMS = ['#f2e3c4', '#2b2f3d', '#3a4a6a', '#fff0d2', '#5a4632', '#23242a', '#e7dcc6'];
const DOGS = ['#c9925a', '#8a5a3a', '#e8d2b0', '#3a2a20', '#d8b07a'];

const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];
const rnd = (a: number, b: number) => a + Math.random() * (b - a);

// ------------------------------------------------------------------------------------------
// Agent store

const CAP_HIGH = 220;
const CAP_LOW = 120;

class CrowdStore {
  agents: Agent[] = [];
  free: number[] = [];
  cap = 0;
  colorsDirty = new Set<number>();
  colors: string[][] = [];
  reset(cap: number) {
    this.cap = cap;
    this.agents = [];
    this.free = [];
    this.colors = [];
    for (let i = cap - 1; i >= 0; i--) this.free.push(i);
  }
  spawn(kind: PersonKind, x: number, y: number, z: number, ry: number, anim: Agent['anim'], owner: Agent['owner'], extra: Partial<Agent> = {}): Agent | null {
    const idx = this.free.pop();
    if (idx === undefined) return null;
    const female = kind === 'woman' || (kind === 'elder' && Math.random() < 0.5);
    const a: Agent = {
      idx,
      kind,
      owner,
      x,
      y,
      z,
      ry,
      sit: false,
      anim,
      scale: kind === 'child' ? rnd(0.58, 0.68) : kind === 'dog' ? 1 : female ? rnd(0.93, 0.98) : rnd(0.98, 1.04),
      female,
      phase: Math.random() * 10,
      speed: kind === 'child' ? rnd(1.8, 2.6) : kind === 'dog' ? 1.2 : kind === 'elder' ? rnd(0.8, 1.0) : rnd(1.1, 1.45),
      lane: z,
      dir: 1,
      laneOff: 0,
      tx: x,
      tz: z,
      wait: rnd(0, 3),
      moving: 0,
      react: 'none',
      reactT: 0,
      reactDur: 0,
      fx: 0,
      fz: 0,
      baseRy: ry,
      lookUp: 0,
      hidden: false,
      ...extra,
    };
    this.agents.push(a);
    this.colors[idx] = paletteFor(a);
    this.colorsDirty.add(idx);
    return a;
  }
  remove(a: Agent) {
    const i = this.agents.indexOf(a);
    if (i < 0) return;
    this.agents.splice(i, 1);
    this.free.push(a.idx);
    this.colorsDirty.add(-1 - a.idx); // hide its instances
  }
}

export const crowd = new CrowdStore();

/** Colours for each part of an agent. */
function paletteFor(a: Agent): string[] {
  const skin = pick(SKIN);
  if (a.kind === 'dog') {
    const c = pick(DOGS);
    const dark = '#2a1a10';
    return [c, c, c, c, c, c, c, dark, c, c, '#000'];
  }
  const hair = a.kind === 'elder' ? pick(GREY) : pick(HAIR);
  let top = pick(TOPS);
  let bottom = pick(BOTTOMS);
  let drape = pick(TOPS);
  if (a.female) {
    // saree or salwar: the lower and the pallu share a colour
    bottom = Math.random() < 0.6 ? top : pick(TOPS);
    drape = Math.random() < 0.5 ? pick(['#ffd15a', '#f5a623', '#fff0d2', '#d64a91']) : bottom;
  }
  if (a.kind === 'chaiwala') {
    top = '#e7dcc6';
    bottom = '#5a4632';
  }
  const cap = a.kind === 'chaiwala' ? '#fff0d2' : hair;
  return [bottom, bottom, bottom, top, top, top, skin, cap, hair, drape, '#cfe6ff'];
}

// ------------------------------------------------------------------------------------------
// Posing

interface Pose {
  bob: number;
  lean: number;
  turn: number;
  legL: number;
  legR: number;
  armLx: number;
  armLz: number;
  armRx: number;
  armRz: number;
  headY: number;
  headX: number;
  sit: boolean;
  phone: boolean;
  tail: number;
}

const P0 = (): Pose => ({ bob: 0, lean: 0, turn: 0, legL: 0, legR: 0, armLx: 0, armLz: 0.07, armRx: 0, armRz: -0.07, headY: 0, headX: 0, sit: false, phone: false, tail: 0 });

function poseFor(a: Agent, t: number, out: Pose, reduced: boolean) {
  Object.assign(out, P0());
  out.sit = a.sit;
  const ph = a.phase + t;
  const k = reduced ? 0.4 : 1;
  out.lean = Math.sin(ph * 1.9) * 0.01;
  out.headY = Math.sin(ph * 0.43) * 0.35;
  if (a.kind === 'dog') {
    out.tail = Math.sin(ph * (a.moving > 0.2 ? 12 : 3)) * 0.5;
    if (a.moving > 0.1) {
      const s = Math.sin(a.phase * 2.2) * 0.6 * Math.min(1, a.moving);
      out.legL = s;
      out.legR = -s;
      out.armLx = -s;
      out.armRx = s;
      out.bob = Math.abs(Math.sin(a.phase * 2.2)) * 0.03;
    }
    if (a.anim === 'sleep' && a.react === 'none') out.bob = -0.2;
    out.headX = a.anim === 'sleep' && a.react === 'none' ? 0.35 : 0;
    return out;
  }
  // locomotion
  if (a.moving > 0.05 || a.anim === 'walk') {
    const run = a.speed > 1.9 || a.react === 'flee';
    const amp = (run ? 0.85 : 0.5) * Math.min(1, a.moving / 0.6 + (a.anim === 'walk' ? 0.4 : 0));
    const s = Math.sin(a.phase * (run ? 2.6 : 2.0));
    out.legL = s * amp;
    out.legR = -s * amp;
    out.armLx = -s * amp * 0.8;
    out.armRx = s * amp * 0.8;
    out.bob = Math.abs(Math.cos(a.phase * (run ? 2.6 : 2.0))) * (run ? 0.06 : 0.025) * k;
    out.headY *= 0.3;
  } else {
    switch (a.anim) {
      case 'talk':
        out.armRx = -0.5 + Math.sin(ph * 3.1) * 0.35 * k;
        out.armRz = -0.2;
        out.headX = Math.sin(ph * 4.1) * 0.06 * k;
        if (Math.sin(ph * 0.7) > 0.6) out.armLx = -0.4 + Math.sin(ph * 2.3) * 0.25 * k;
        break;
      case 'look':
        out.headX = -0.3 + Math.sin(ph * 0.3) * 0.12;
        break;
      case 'wave': {
        const c = ph % 7;
        if (c < 2) {
          out.armRz = -2.6;
          out.armRx = Math.sin(ph * 9) * 0.35 * k;
        }
        break;
      }
      case 'sip': {
        const c = ph % 6;
        out.armRx = c < 1.6 ? -2.0 : -0.6;
        out.armRz = c < 1.6 ? 0.35 : -0.1;
        out.headX = c < 1.6 ? -0.12 : 0;
        break;
      }
      case 'shop':
        out.armLx = -0.6;
        out.armRx = -0.6 + Math.sin(ph * 1.3) * 0.2 * k;
        break;
      case 'pray':
        out.armLx = -1.15;
        out.armRx = -1.15;
        out.armLz = -0.42;
        out.armRz = 0.42;
        out.headX = 0.12;
        break;
      case 'lean':
        out.lean = 0.18;
        out.armLx = -0.75;
        out.armRx = -0.75;
        out.headX = 0.2;
        break;
      case 'ride':
        out.sit = true;
        out.armLx = -1.1;
        out.armRx = -1.1;
        out.armLz = -0.12;
        out.armRz = 0.12;
        out.lean = 0.12;
        out.headY = 0;
        if (a.pillion) {
          out.armLx = -0.35;
          out.armRx = -0.35;
          out.lean = 0.05;
        }
        break;
    }
  }
  // reactions take over
  if (a.react !== 'none') {
    const u = a.reactT / a.reactDur;
    const env = Math.sin(Math.min(1, u * 1.4) * Math.PI) ** 0.6;
    switch (a.react) {
      case 'flinch':
      case 'step':
        out.lean = -0.28 * env;
        out.armLx = -1.1 * env;
        out.armRx = -1.1 * env;
        out.armLz = -0.3 * env;
        out.armRz = 0.3 * env;
        out.headX = 0.25 * env;
        break;
      case 'ears':
        out.armLz = -2.45 * env;
        out.armRz = 2.45 * env;
        out.armLx = -0.25;
        out.armRx = -0.25;
        out.lean = -0.12 * env;
        out.headX = 0.18 * env;
        break;
      case 'cheer':
        out.bob = Math.abs(Math.sin(a.reactT * 9)) * 0.28 * k;
        out.armLz = -2.8;
        out.armRz = 2.8;
        out.armLx = Math.sin(a.reactT * 9) * 0.3 * k;
        out.armRx = -Math.sin(a.reactT * 9) * 0.3 * k;
        out.headX = -0.2;
        break;
      case 'film':
        out.armRx = -1.55;
        out.armRz = 0.25;
        out.phone = true;
        out.headX = -a.lookUp * 0.5;
        break;
      case 'clap': {
        const c = Math.sin(a.reactT * 14) * 0.2 * k;
        out.armLx = -1.25;
        out.armRx = -1.25;
        out.armLz = -0.35 - c;
        out.armRz = 0.35 + c;
        break;
      }
      case 'watch':
        out.headX = -a.lookUp * 0.6;
        out.headY = 0;
        break;
    }
    if (!a.sit && (a.react === 'watch' || a.react === 'film' || a.react === 'clap')) out.headX -= a.lookUp * 0.2;
  }
  return out;
}

// local layout (metres) for a standing adult; the agent's scale shrinks children
const HIP = 0.84;
const SHOULDER = 1.4;

const _base = new THREE.Matrix4();
const _body = new THREE.Matrix4();
const _m1 = new THREE.Matrix4();
const _m2 = new THREE.Matrix4();
const _out = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

/** parent * T(pivot) * R(rx, ry, rz) * T(center) * S(dims) */
function partMatrix(parent: THREE.Matrix4, px: number, py: number, pz: number, rx: number, ry: number, rz: number, cx: number, cy: number, cz: number, w: number, h: number, d: number, out: THREE.Matrix4) {
  _e.set(rx, ry, rz, 'XYZ');
  _m1.makeRotationFromEuler(_e);
  _m1.setPosition(px, py, pz);
  _m2.makeScale(w, h, d);
  _m2.setPosition(cx, cy, cz);
  return out.multiplyMatrices(parent, _m1).multiply(_m2);
}

function writeAgent(a: Agent, pose: Pose, meshes: THREE.InstancedMesh[], shadow: THREE.InstancedMesh) {
  const i = a.idx;
  _q.setFromAxisAngle(_p.set(0, 1, 0), a.ry);
  _base.compose(_p.set(a.x, a.y, a.z), _q, _s.setScalar(a.scale));
  const set = (pi: number, m: THREE.Matrix4) => meshes[pi].setMatrixAt(i, m);
  if (a.kind === 'dog') {
    const by = 0.4 + pose.bob;
    _body.copy(_base);
    partMatrix(_body, 0, by, 0, 0, 0, 0, 0, 0, 0, 0.3, 0.26, 0.66, _out);
    set(3, _out);
    partMatrix(_body, 0, by + 0.16, 0.36, pose.headX, 0, 0, 0, 0, 0.06, 0.22, 0.2, 0.26, _out);
    set(6, _out);
    partMatrix(_body, 0, by + 0.16, 0.36, pose.headX, 0, 0, 0, 0.13, 0.01, 0.24, 0.06, 0.08, _out);
    set(7, _out);
    partMatrix(_body, 0, by + 0.16, 0.36, pose.headX, 0, 0, 0, -0.02, 0.2, 0.08, 0.07, 0.08, _out);
    set(8, _out);
    partMatrix(_body, 0, by + 0.05, -0.33, -0.7, pose.tail, 0, 0, 0, -0.13, 0.05, 0.05, 0.26, _out);
    set(9, _out);
    const leg = (pi: number, x: number, z: number, r: number) => {
      partMatrix(_body, x, by - 0.06, z, r, 0, 0, 0, -0.17, 0, 0.07, 0.34, 0.07, _out);
      set(pi, _out);
    };
    const sleep = pose.bob < -0.1;
    leg(0, -0.1, -0.24, sleep ? 1.4 : pose.legL);
    leg(1, 0.1, -0.24, sleep ? 1.4 : pose.legR);
    leg(4, -0.1, 0.24, sleep ? -1.4 : pose.armLx);
    leg(5, 0.1, 0.24, sleep ? -1.4 : pose.armRx);
    set(2, ZERO);
    set(10, ZERO);
  } else {
    const sit = pose.sit;
    // the body pivots at the hip: bob lifts it, lean tips it
    const hipY = sit ? HIP - 0.36 : HIP;
    _m1.makeRotationX(pose.lean);
    _m1.setPosition(0, hipY + pose.bob, 0);
    _body.multiplyMatrices(_base, _m1);
    // legs hang from the hip
    const legLen = sit ? 0.5 : 0.86;
    const legRot = sit ? -1.45 : 0;
    const kurta = a.kind === 'man' || a.kind === 'elder' || a.kind === 'chaiwala';
    if (a.female && !sit) {
      partMatrix(_base, 0, pose.bob, 0, 0, 0, 0, 0, HIP / 2 + 0.02, 0, 0.52, HIP + 0.04, 0.42, _out);
      set(2, _out);
      meshes[0].setMatrixAt(i, ZERO);
      meshes[1].setMatrixAt(i, ZERO);
    } else {
      set(2, ZERO);
      partMatrix(_body, -0.1, 0, 0, legRot + pose.legL, 0, 0, 0, -legLen / 2, 0, 0.15, legLen, 0.17, _out);
      set(0, _out);
      partMatrix(_body, 0.1, 0, 0, legRot + pose.legR, 0, 0, 0, -legLen / 2, 0, 0.15, legLen, 0.17, _out);
      set(1, _out);
    }
    // torso (a kurta hangs lower than a shirt)
    const tH = kurta ? 0.76 : 0.6;
    partMatrix(_body, 0, 0, 0, 0, pose.turn, 0, 0, SHOULDER - HIP + 0.04 - tH / 2, 0, 0.42, tH, 0.25, _out);
    set(3, _out);
    // arms from the shoulders
    const sh = SHOULDER - HIP;
    partMatrix(_body, -0.27, sh, 0, pose.armLx, 0, pose.armLz, 0, -0.29, 0, 0.11, 0.6, 0.12, _out);
    set(4, _out);
    partMatrix(_body, 0.27, sh, 0, pose.armRx, 0, pose.armRz, 0, -0.29, 0, 0.11, 0.6, 0.12, _out);
    set(5, _out);
    // phone in the right hand while filming
    if (pose.phone) {
      partMatrix(_body, 0.27, sh, 0, pose.armRx, 0, pose.armRz, 0, -0.6, 0.05, 0.08, 0.14, 0.02, _out);
      set(10, _out);
    } else set(10, ZERO);
    // head and hair
    const hx = pose.headX;
    const hy = pose.headY;
    partMatrix(_body, 0, sh + 0.04, 0, hx, hy, 0, 0, 0.15, 0.01, 0.22, 0.25, 0.23, _out);
    set(6, _out);
    partMatrix(_body, 0, sh + 0.04, 0, hx, hy, 0, 0, 0.29, -0.005, 0.24, 0.06, 0.25, _out);
    set(7, _out);
    if (a.female) {
      partMatrix(_body, 0, sh + 0.04, 0, hx, hy, 0, 0, 0.1, -0.12, 0.24, 0.32, 0.07, _out);
      set(8, _out);
    } else set(8, ZERO);
    // dupatta across the chest, or a shawl on an elder's shoulders
    if (a.female) {
      partMatrix(_body, 0.06, sh - 0.3, 0.005, 0, pose.turn, 0.55, 0, 0, 0, 0.12, 0.72, 0.265, _out);
      set(9, _out);
    } else if (a.kind === 'elder') {
      partMatrix(_body, 0, sh - 0.08, 0, 0, pose.turn, 0, 0, 0, 0, 0.45, 0.22, 0.27, _out);
      set(9, _out);
    } else set(9, ZERO);
  }
  // soft contact shadow
  _q.identity();
  _m1.compose(_p.set(a.x, a.y + 0.015, a.z), _q, _s.set(a.kind === 'dog' ? 0.6 : 0.75 * a.scale, 1, a.kind === 'dog' ? 0.9 : 0.75 * a.scale));
  shadow.setMatrixAt(i, _m1);
}

/** People are drawn as illustrated cut-outs (CastSprites); only their contact shadow is ours. */
function writeShadowOnly(a: Agent, meshes: THREE.InstancedMesh[], shadow: THREE.InstancedMesh) {
  const i = a.idx;
  for (const m of meshes) m.setMatrixAt(i, ZERO);
  _q.identity();
  _m1.compose(_p.set(a.x, a.y + 0.015, a.z), _q, _s.set(0.8, 1, 0.8));
  shadow.setMatrixAt(i, _m1);
}

function hideAgent(i: number, meshes: THREE.InstancedMesh[], shadow: THREE.InstancedMesh) {
  for (const m of meshes) m.setMatrixAt(i, ZERO);
  shadow.setMatrixAt(i, ZERO);
}

export function shadowTexture() {
  const { c, ctx } = makeCanvas(64, 64);
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(0,0,0,0.55)');
  g.addColorStop(0.6, 'rgba(0,0,0,0.25)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return toTexture(c);
}

// ------------------------------------------------------------------------------------------
// Lines people say (short, occasional)

export const LINES = {
  close: ['Arre dhyaan se!', 'Bachke!', 'Oye, thoda door!', 'Arre baap re!', 'Sambhal ke!'],
  bomb: ['Kaan phat gaye!', 'Dhamaka!', 'Baap re baap!', 'Poori gali hil gayi!'],
  wow: ['Waah!', 'Kya baat hai!', 'Ek aur!', 'Mast hai!', 'Waah ji waah!', 'Happy Diwali!'],
  kid: ['Waah!', 'Ek aur, ek aur!', 'Mujhe bhi!', 'Yayyy!', 'Phir se!'],
  film: ['Reel banegi!', 'Ruko, video le raha hoon!', 'Story pe daalunga!'],
  rocket: ['Upar dekho!', 'Seedha chaand tak!', 'Woh gaya!'],
  dog: ['Bhow bhow!'],
  rider: ['Arre bhai!', 'Dhyaan se, bhaiya!'],
};

let lastLine = 0;
export function sayLine(text: string, x: number, y: number, z: number, force = false) {
  const now = performance.now();
  if (!force && now - lastLine < 2200) return;
  lastLine = now;
  useGame.getState().say(text, [x, y, z], 1900);
}

// ------------------------------------------------------------------------------------------

export function Crowd() {
  const graphics = useGame((s) => s.settings.graphics);
  const high = graphics === 'high';
  const cap = high ? CAP_HIGH : CAP_LOW;
  const group = useRef<THREE.Group>(null!);
  const frame = useRef(0);
  const pose = useMemo(P0, []);

  const { meshes, shadow, mats } = useMemo(() => {
    crowd.reset(cap);
    const solid = high ? new THREE.MeshStandardMaterial({ roughness: 0.82 }) : new THREE.MeshLambertMaterial();
    const glow = new THREE.MeshBasicMaterial({ toneMapped: false });
    const meshes = PARTS.map((p) => {
      const m = new THREE.InstancedMesh(p.geo, p.mat === 'glow' ? glow : solid, cap);
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.setColorAt(0, new THREE.Color(1, 1, 1));
      for (let i = 0; i < cap; i++) m.setMatrixAt(i, ZERO);
      m.frustumCulled = false;
      m.raycast = () => {};
      return m;
    });
    const smat = new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 });
    const sgeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    const shadow = new THREE.InstancedMesh(sgeo, smat, cap);
    shadow.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < cap; i++) shadow.setMatrixAt(i, ZERO);
    shadow.frustumCulled = false;
    shadow.raycast = () => {};
    shadow.renderOrder = 2;
    return { meshes, shadow, mats: [solid, glow, smat] };
  }, [cap, high]);
  useEffect(() => () => mats.forEach((m) => m.dispose()), [mats]);

  // which chunks have their regulars spawned
  const spawned = useRef(new Map<number, true>());
  useEffect(() => {
    spawned.current.clear();
  }, [meshes]);

  // people block the player's way
  useEffect(() => {
    const solid = (x: number, z: number, r: number, y = 0) => {
      for (const a of crowd.agents) {
        if (a.owner === 'rider' || Math.abs(a.y - y) > 0.6 || a.hidden) continue;
        const rr = r + (a.kind === 'dog' ? 0.25 : a.kind === 'child' ? 0.2 : 0.26);
        if (Math.abs(a.x - x) < rr && Math.abs(a.z - z) < rr && Math.hypot(a.x - x, a.z - z) < rr) return true;
      }
      return false;
    };
    runtime.solids.set('person', solid);
    return () => {
      runtime.solids.delete('person');
    };
  }, []);

  // reactions to bursts
  useEffect(
    () =>
      runtime.on((e: WorldEvent) => {
        if (e.kind === 'interaction' || e.kind === 'stage') return;
        react(e);
      }),
    [],
  );

  useFrame((st, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const t = st.clock.elapsedTime;
    const p = runtime.player;
    const reduced = useGame.getState().settings.reducedMotion;
    const kp = chunkOf(p.x);
    const V = getVariants();
    frame.current++;

    // regulars come and go with their chunk
    for (const k of [...spawned.current.keys()]) {
      if (Math.abs(k - kp) > 2) {
        spawned.current.delete(k);
        for (const a of [...crowd.agents]) if (a.owner === k) crowd.remove(a);
      }
    }
    for (let k = kp - 2; k <= kp + 2; k++) {
      if (spawned.current.has(k)) continue;
      spawned.current.set(k, true);
      const ox = k * STREET.chunk;
      for (const s of V[variantAt(k)].spawns) {
        if (!high && (s.anim === 'wander' || s.anim === 'talk') && Math.random() < 0.4) continue;
        const zone = s.zone ? { x0: s.zone.x0 + ox, x1: s.zone.x1 + ox, z0: s.zone.z0, z1: s.zone.z1 } : undefined;
        const a = crowd.spawn(s.kind, s.x + ox, s.y, s.z, s.ry, s.anim, k, { sit: !!s.sit, zone });
        if (a && s.sit) a.y = s.y - 0.45 + 0.04;
      }
    }
    // walkers stream along the sidewalks around the player
    const wantWalkers = high ? 34 : 16;
    let walkers = 0;
    for (const a of crowd.agents) if (a.owner === 'walker') walkers++;
    while (walkers < wantWalkers) {
      const first = frame.current < 3;
      const side = Math.random() < 0.5 ? 1 : -1;
      const x = first ? p.x + rnd(-60, 60) : p.x + (Math.random() < 0.5 ? -1 : 1) * rnd(55, 68);
      const lane = side * rnd(GH - 0.95, GH - 0.7);
      const kind = pick<PersonKind>(['man', 'woman', 'woman', 'man', 'elder', 'child', 'woman', 'man']);
      const a = crowd.spawn(kind, x, 0, lane, 0, 'walk', 'walker', { lane, dir: Math.random() < 0.5 ? 1 : -1 });
      if (!a) break;
      if (kind === 'child') a.speed = rnd(1.3, 1.7);
      walkers++;
    }

    for (const a of [...crowd.agents]) {
      const dx = a.x - p.x;
      const dz = a.z - p.z;
      const d = Math.hypot(dx, dz);
      if (a.owner === 'walker' && Math.abs(dx) > 72) {
        crowd.remove(a);
        continue;
      }
      if (a.react !== 'none') {
        a.reactT += dt;
        if (a.reactT >= a.reactDur) {
          a.react = 'none';
          if (a.owner !== 'walker' && a.anim !== 'wander' && a.anim !== 'play') a.ry = a.baseRy;
        }
      }
      if (a.owner !== 'rider') move(a, dt);
      const far = d > (high ? 72 : 52);
      if (far) {
        if (!a.hidden) {
          hideAgent(a.idx, meshes, shadow);
          a.hidden = true;
        }
        continue;
      }
      a.hidden = false;
      // far agents are posed every third frame only
      if (d > 38 && (frame.current + a.idx) % 3 !== 0) continue;
      if (a.kind !== 'dog') {
        writeShadowOnly(a, meshes, shadow);
        continue;
      }
      poseFor(a, t, pose, reduced);
      writeAgent(a, pose, meshes, shadow);
    }
    // colours of newly spawned agents
    if (crowd.colorsDirty.size) {
      const c = new THREE.Color();
      for (const code of crowd.colorsDirty) {
        if (code < 0) {
          hideAgent(-1 - code, meshes, shadow);
          continue;
        }
        const cols = crowd.colors[code];
        meshes.forEach((m, pi) => m.setColorAt(code, c.set(cols[pi]).multiplyScalar(pi === 10 ? 2.2 : 1)));
      }
      crowd.colorsDirty.clear();
      meshes.forEach((m) => m.instanceColor && (m.instanceColor.needsUpdate = true));
    }
    meshes.forEach((m) => (m.instanceMatrix.needsUpdate = true));
    shadow.instanceMatrix.needsUpdate = true;
  });

  return (
    <group ref={group}>
      {meshes.map((m, i) => (
        <primitive key={i} object={m} />
      ))}
      <primitive object={shadow} />
    </group>
  );
}

// ------------------------------------------------------------------------------------------
// Movement

/** How hard a hazard (a cracker on the ground) pushes this point away; 0 when clear. */
function hazardPush(x: number, z: number, margin: number) {
  let px = 0;
  let pz = 0;
  for (const h of runtime.hazards) {
    const dx = x - h.pos[0];
    const dz = z - h.pos[2];
    const d = Math.hypot(dx, dz);
    const R = h.radius + margin;
    if (d < R) {
      const k = (R - d) / R + 0.2;
      px += (dx / Math.max(d, 0.01)) * k;
      pz += (dz / Math.max(d, 0.01)) * k;
    }
  }
  return [px, pz] as const;
}

function stepTo(a: Agent, nx: number, nz: number) {
  if (isOpen(nx, nz, 0.25)) {
    a.x = nx;
    a.z = nz;
    return true;
  }
  return false;
}

function move(a: Agent, dt: number) {
  const prevX = a.x;
  const prevZ = a.z;
  // keep clear of crackers on the ground, always
  if (a.y < 0.3) {
    const [hx, hz] = hazardPush(a.x, a.z, 0.9);
    if (hx || hz) {
      const len = Math.hypot(hx, hz);
      const s = 1.6 * dt;
      if (!stepTo(a, a.x + (hx / len) * s, a.z + (hz / len) * s)) stepTo(a, a.x + (hx / len) * s, a.z);
      a.ry = Math.atan2(hx, hz);
      a.tx = a.x;
      a.tz = a.z;
      a.wait = 0.8;
    }
  }
  // reactions that move
  if (a.react === 'step') {
    const k = Math.min(1, a.reactT / (a.reactDur * 0.6));
    const s = (1 - k) * 2.2 * dt;
    stepTo(a, a.x + a.fx * s, a.z + a.fz * s);
  } else if (a.react === 'flee') {
    const s = 4.2 * dt;
    if (!stepTo(a, a.x + a.fx * s, a.z + a.fz * s)) {
      // turn along the wall
      const t = a.fx;
      a.fx = -a.fz;
      a.fz = t;
    }
    a.ry = Math.atan2(a.fx, a.fz);
    a.phase += dt * 9;
  } else if (a.react === 'none') {
    if (a.owner === 'walker') walker(a, dt);
    else if (a.anim === 'wander' || a.anim === 'play') wanderer(a, dt);
  }
  const moved = Math.hypot(a.x - prevX, a.z - prevZ) / Math.max(dt, 1e-4);
  a.moving += (moved - a.moving) * Math.min(1, dt * 8);
  if (a.react !== 'flee') a.phase += dt * a.moving * 2.4;
}

function walker(a: Agent, dt: number) {
  const p = runtime.player;
  // sidestep towards the road when something blocks the sidewalk, and wait for the player
  const ahead = a.x + a.dir * 0.9;
  const blockedAhead = !isOpen(ahead, a.lane + a.laneOff, 0.3) || runtime.hazards.some((h) => Math.abs(h.pos[0] - ahead) < h.radius + 0.6 && Math.abs(h.pos[2] - a.z) < h.radius + 0.6);
  const toRoad = -Math.sign(a.lane);
  const want = blockedAhead ? toRoad * 1.1 : 0;
  a.laneOff += (want - a.laneOff) * Math.min(1, dt * 2.5);
  const pd = Math.hypot(p.x - (a.x + a.dir * 0.7), p.z - a.z);
  const sp = pd < 0.9 ? 0 : a.speed;
  const nx = a.x + a.dir * sp * dt;
  const nz = a.lane + a.laneOff;
  if (!stepTo(a, nx, nz)) {
    if (!stepTo(a, nx, a.z)) a.dir *= Math.random() < 0.02 ? -1 : 1;
  }
  a.ry = a.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
}

function wanderer(a: Agent, dt: number) {
  const z = a.zone;
  if (!z) return;
  if (a.wait > 0) {
    a.wait -= dt;
    return;
  }
  const dx = a.tx - a.x;
  const dz = a.tz - a.z;
  const d = Math.hypot(dx, dz);
  if (d < 0.3) {
    // pick a new spot in the zone that is open and away from crackers
    for (let i = 0; i < 6; i++) {
      const tx = rnd(z.x0, z.x1);
      const tz = rnd(z.z0, z.z1);
      if (isOpen(tx, tz, 0.4) && !runtime.hazards.some((h) => Math.hypot(h.pos[0] - tx, h.pos[2] - tz) < h.radius + 1.5)) {
        a.tx = tx;
        a.tz = tz;
        break;
      }
    }
    a.wait = a.kind === 'child' ? rnd(0, 0.8) : a.kind === 'dog' ? rnd(1, 5) : rnd(1.5, 6);
    return;
  }
  const s = Math.min(d, a.speed * dt);
  // never walk into a cracker's circle
  const nx = a.x + (dx / d) * s;
  const nz = a.z + (dz / d) * s;
  if (runtime.hazards.some((h) => Math.hypot(h.pos[0] - nx, h.pos[2] - nz) < h.radius + 0.8)) {
    a.tx = a.x;
    a.tz = a.z;
    return;
  }
  if (!stepTo(a, nx, nz)) {
    a.tx = a.x;
    a.tz = a.z;
  }
  a.ry = Math.atan2(dx, dz);
}

// ------------------------------------------------------------------------------------------
// Reactions

function react(e: WorldEvent) {
  const big = e.kind === 'bomb' || e.kind === 'bigBurst';
  const R = e.kind === 'bomb' ? 18 : big ? 15 : e.kind === 'launch' ? 9 : 10;
  const ex = e.pos[0];
  const ez = e.pos[2];
  const up = e.kind === 'bigBurst' && e.pos[1] > 6;
  let filmer: Agent | null = null;
  let filmerD = Infinity;
  let talker: { a: Agent; d: number } | null = null;
  for (const a of crowd.agents) {
    if (a.owner === 'rider' || a.hidden) continue;
    const dx = a.x - ex;
    const dz = a.z - ez;
    const d = Math.hypot(dx, dz);
    if (d > R) continue;
    const away = d > 0.01 ? [dx / d, dz / d] : [1, 0];
    const face = Math.atan2(-dx, -dz);
    const start = (k: ReactKind, dur: number) => {
      if (a.react !== 'none' && a.react !== 'watch' && k === 'watch') return;
      a.react = k;
      a.reactT = 0;
      a.reactDur = dur;
      a.fx = away[0];
      a.fz = away[1];
      a.lookUp = up ? 1 : e.pos[1] > 2 ? 0.6 : 0;
    };
    if (a.kind === 'dog') {
      if (d < 12 || e.kind === 'bomb') {
        start('flee', rnd(2.2, 3.2));
        if (Math.random() < 0.5) window.setTimeout(() => audio.woof(), 120);
      }
      continue;
    }
    if (a.owner === 'walker' || (a.anim !== 'sip' && !a.sit)) a.ry = face;
    if (a.kind === 'child') {
      start(d < 3 ? 'flinch' : 'cheer', d < 3 ? 0.7 : rnd(1.8, 2.6));
      if (!talker || Math.random() < 0.3) talker = { a, d };
      continue;
    }
    if (d < 3.6 && a.y < 0.3 && !a.sit) {
      start(e.kind === 'bomb' ? 'ears' : 'step', e.kind === 'bomb' ? 1.6 : 1.1);
      if (!talker || d < talker.d) talker = { a, d };
    } else if (e.kind === 'bomb' && d < 9) {
      start('ears', rnd(1.2, 1.8));
    } else {
      start(Math.random() < 0.3 ? 'clap' : 'watch', rnd(2, 3.5));
      if (d > 3.5 && d < 11 && d < filmerD && !a.sit && a.y < 0.3) {
        filmer = a;
        filmerD = d;
      }
    }
  }
  if (filmer && Math.random() < 0.85) {
    filmer.react = 'film';
    filmer.reactT = 0;
    filmer.reactDur = rnd(4, 5.5);
    filmer.ry = Math.atan2(ex - filmer.x, ez - filmer.z);
  }
  // one short line, now and then
  const pickLine = () => {
    if (e.text && Math.random() < 0.6) return e.text;
    if (talker && talker.a.kind === 'child') return pick(LINES.kid);
    if (talker && talker.d < 3.6) return pick(LINES.close);
    if (e.kind === 'bomb') return pick(LINES.bomb);
    if (up) return pick(LINES.rocket);
    if (filmer && Math.random() < 0.4) return pick(LINES.film);
    return pick(LINES.wow);
  };
  const who = talker?.a ?? filmer;
  if (who && (e.kind !== 'firework' || Math.random() < 0.5)) {
    const line = pickLine();
    const h = who.kind === 'child' ? 1.25 : 1.95;
    window.setTimeout(() => sayLine(line, who.x, who.y + h, who.z), 260);
  }
}
