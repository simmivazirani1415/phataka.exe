import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { runtime, simStep, type WorldEvent } from '../game/Runtime';
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

export type ReactKind = 'none' | 'flinch' | 'ears' | 'step' | 'cheer' | 'film' | 'clap' | 'watch' | 'flee' | 'notice' | 'jump' | 'annoyed' | 'laugh' | 'point' | 'shake';

export interface Agent {
  idx: number;
  kind: PersonKind;
  owner: number | 'walker' | 'rider' | 'player';
  /** a reaction on its way (NOTICING), and the one after the current (follow-up) */
  pend?: { k: ReactKind; dur: number; at: number; ex: number; ez: number; up: number; then?: ReactKind; thenDur?: number };
  next?: { k: ReactKind; dur: number };
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
  /** how far round the colour wheel this person's clothes are turned (0 = as drawn) */
  hue: number;
  /** drawn as the posed 3D figure this frame (walking away or across), not the cut-out */
  solid?: boolean;
  /** rider pose details */
  pillion?: boolean;
  /** what a walker is doing right now (for the street's own bookkeeping and for tests) */
  state: AgentState;
  /** walkers: the person they stopped to greet, and until when */
  meet: Agent | null;
  meetUntil: number;
  meetFrom: number;
  greetCd: number;
  /** walkers: speed this frame, and how long they have been held up */
  cur: number;
  blockT: number;
}

export type AgentState = 'idle' | 'walking' | 'approaching' | 'greeting' | 'talking' | 'waiting' | 'avoiding' | 'reacting' | 'returning';

interface Part {
  geo: THREE.BufferGeometry;
  mat: 'solid' | 'glow';
}

const UNIT = new THREE.BoxGeometry(1, 1, 1);
const SKIRT = new THREE.CylinderGeometry(0.4, 0.5, 1, 14);
// rounded parts, each filling a unit box so the posing maths is the same as for blocks
const LIMB = new THREE.CylinderGeometry(0.5, 0.4, 1, 10);
const TORSO = new THREE.CylinderGeometry(0.46, 0.5, 1, 14);
const HEAD = new THREE.SphereGeometry(0.5, 16, 12);
// a cap over the crown and down the back of the head, open at the face
const HAIR_TOP = new THREE.SphereGeometry(0.5, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.6).rotateX(-0.6);
const BUN = new THREE.SphereGeometry(0.5, 12, 10);
const PARTS: Part[] = [
  { geo: LIMB, mat: 'solid' }, // 0 legL
  { geo: LIMB, mat: 'solid' }, // 1 legR
  { geo: SKIRT, mat: 'solid' }, // 2 skirt / saree
  { geo: TORSO, mat: 'solid' }, // 3 torso
  { geo: LIMB, mat: 'solid' }, // 4 armL
  { geo: LIMB, mat: 'solid' }, // 5 armR
  { geo: HEAD, mat: 'solid' }, // 6 head
  { geo: HAIR_TOP, mat: 'solid' }, // 7 hair (top)
  { geo: BUN, mat: 'solid' }, // 8 hair (back) / dog ears
  { geo: UNIT, mat: 'solid' }, // 9 dupatta / shawl / vest / tail
  { geo: UNIT, mat: 'glow' }, // 10 phone screen
];

const DOGS = ['#c9925a', '#8a5a3a', '#e8d2b0', '#3a2a20', '#d8b07a'];

const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];
const rnd = (a: number, b: number) => a + Math.random() * (b - a);

// ------------------------------------------------------------------------------------------
// Agent store

const CAP_HIGH = 220;
const CAP_LOW = 140;

class CrowdStore {
  agents: Agent[] = [];
  free: number[] = [];
  cap = 0;
  colorsDirty = new Set<number>();
  colors: string[][] = [];
  /** debug: draw everyone as the posed 3D figure */
  force3d = false;
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
      state: anim === 'walk' ? 'walking' : 'idle',
      meet: null,
      meetUntil: 0,
      meetFrom: 0,
      greetCd: 0,
      cur: 0,
      blockT: 0,
      hue: HUES[(idx * 7 + Math.floor(Math.random() * HUES.length)) % HUES.length],
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
    if (a.meet) a.meet.meet = null;
    this.agents.splice(i, 1);
    this.free.push(a.idx);
    this.colorsDirty.add(-1 - a.idx); // hide its instances
  }
}

export const crowd = new CrowdStore();

/** Turns of the colour wheel for clothes; a few people keep the colours as drawn. */
const HUES = [0, 0, 0, 0.1, -0.09, 0.2, 0.33, 0.45, 0.55, 0.66, -0.22, 0.8];

/** Which of Simran's five illustrations an agent wears (shared with the cut-outs). */
export type Look = 'aunty' | 'boy' | 'girl' | 'uncle' | 'grandpa';
export function lookOf(a: Agent): Look {
  const h = (a.idx * 2654435761) >>> 0;
  const r = (h % 100) / 100;
  switch (a.kind) {
    case 'woman':
      return r < 0.62 ? 'aunty' : 'girl';
    case 'elder':
      return a.female ? 'aunty' : 'grandpa';
    case 'child':
      return r < 0.5 ? 'boy' : 'girl';
    default:
      return r < 0.6 ? 'uncle' : r < 0.82 ? 'grandpa' : 'boy';
  }
}

/** Each illustration's clothes: legs, skirt, top, drape (vest, pallu, shawl). */
const LOOK_COLORS: Record<Look, { legs: string; skirt: string; top: string; drape: string; hair: string }> = {
  uncle: { legs: '#efe4cc', skirt: '#efe4cc', top: '#f0b12c', drape: '#b8327a', hair: '#3a3330' },
  aunty: { legs: '#c8246e', skirt: '#c8246e', top: '#c8246e', drape: '#e9a93a', hair: '#1e1a1a' },
  grandpa: { legs: '#f2ead8', skirt: '#f2ead8', top: '#f2ead8', drape: '#8a4a2e', hair: '#d9d2c5' },
  boy: { legs: '#fff3e0', skirt: '#fff3e0', top: '#f2b632', drape: '#f2b632', hair: '#2b2220' },
  girl: { legs: '#f2b632', skirt: '#f2b632', top: '#e0508e', drape: '#f06aa0', hair: '#2b2220' },
};
const ILLUSTRATED_SKIN = ['#e3a982', '#d89a74', '#c98a62', '#e8b48e'];

/** Colours for each part of an agent: the 3D figure matches the cut-out it stands in for. */
function paletteFor(a: Agent): string[] {
  if (a.kind === 'dog') {
    const c = pick(DOGS);
    const dark = '#2a1a10';
    return [c, c, c, c, c, c, c, dark, c, c, '#000'];
  }
  const L = LOOK_COLORS[lookOf(a)];
  const turn = (hex: string) => {
    const c = new THREE.Color(hex);
    const hsl = { h: 0, s: 0, l: 0 };
    c.getHSL(hsl);
    // only the strong colours turn, as in the cut-out's shader
    return hsl.s > 0.5 && a.hue ? '#' + c.offsetHSL(a.hue, 0, 0).getHexString() : hex;
  };
  const skin = pick(ILLUSTRATED_SKIN);
  const legs = turn(L.legs);
  const skirt = turn(L.skirt);
  const top = turn(L.top);
  const drape = turn(L.drape);
  const cap = a.kind === 'chaiwala' ? '#fff0d2' : L.hair;
  return [legs, legs, skirt, top, top, top, skin, cap, L.hair, drape, '#cfe6ff'];
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
      case 'notice':
        // a turn of the head toward the sound
        out.headX = -a.lookUp * 0.4 - 0.05 * env;
        out.lean = -0.05 * env;
        break;
      case 'jump': {
        // a little hop of surprise, arms flung up
        const hop = Math.sin(Math.min(1, u * 2.2) * Math.PI);
        out.bob = Math.max(0, hop) * 0.22 * k;
        out.armLz = -1.6 * env;
        out.armRz = 1.6 * env;
        out.armLx = -0.5 * env;
        out.armRx = -0.5 * env;
        out.lean = -0.15 * env;
        out.headX = 0.2 * env;
        break;
      }
      case 'annoyed':
        // hands on hips, a tilt of the head
        out.armLz = -0.75 * env;
        out.armRz = 0.75 * env;
        out.armLx = 0.35 * env;
        out.armRx = 0.35 * env;
        out.headY = Math.sin(a.reactT * 7) * 0.16 * env * k;
        out.lean = 0.04 * env;
        break;
      case 'shake':
        out.headY = Math.sin(a.reactT * 11) * 0.32 * env * k;
        out.armLx = -0.2 * env;
        out.armRx = -0.2 * env;
        break;
      case 'laugh':
        // doubled over a little, shoulders going, a hand on the tummy
        out.lean = 0.16 * env + Math.sin(a.reactT * 16) * 0.03 * k;
        out.bob = Math.abs(Math.sin(a.reactT * 16)) * 0.04 * k;
        out.armLx = -0.9 * env;
        out.armLz = -0.15;
        out.armRx = -1.6 * env;
        out.armRz = 0.5 * env;
        out.headX = -0.25 * env;
        break;
      case 'point':
        // an arm out toward whoever threw it, a wag of the finger
        out.armRx = -1.5 * env + Math.sin(a.reactT * 9) * 0.12 * k;
        out.armRz = 0.15;
        out.headX = -0.1;
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
    const look = lookOf(a);
    const kurta = look === 'uncle' || look === 'grandpa' || look === 'boy' || a.kind === 'chaiwala';
    const skirted = look === 'aunty' || look === 'girl';
    if (skirted && !sit) {
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
    partMatrix(_body, 0, sh + 0.04, 0, hx, hy, 0, 0, 0.16, 0.01, 0.25, 0.28, 0.26, _out);
    set(6, _out);
    partMatrix(_body, 0, sh + 0.04, 0, hx, hy, 0, 0, 0.17, -0.012, 0.27, 0.3, 0.28, _out);
    set(7, _out);
    if (skirted) {
      // a bun at the back of the head
      partMatrix(_body, 0, sh + 0.04, 0, hx, hy, 0, 0, 0.17, -0.13, 0.15, 0.14, 0.12, _out);
      set(8, _out);
    } else set(8, ZERO);
    // pallu or dupatta across the chest, a vest on the uncles, a shawl on the grandpas
    if (skirted) {
      partMatrix(_body, 0.06, sh - 0.3, 0.005, 0, pose.turn, 0.55, 0, 0, 0, 0.12, 0.72, 0.265, _out);
      set(9, _out);
    } else if (look === 'uncle') {
      partMatrix(_body, 0, sh - 0.22, 0, 0, pose.turn, 0, 0, 0, 0, 0.44, 0.46, 0.27, _out);
      set(9, _out);
    } else if (look === 'grandpa') {
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
  // the cut-out (CastSprites) draws its own contact shadow
  shadow.setMatrixAt(i, ZERO);
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
  rider: ['Arre bhai!', 'Dhyaan se, bhaiya!', 'Meri gaadi pe nahi!', 'Oye, gaadi pe kyun?!'],
  bump: ['Arre, sambhal ke!', 'Arre bhai!', 'Dekh ke!'],
  sorry: ['Sorry, sorry!', 'Koi baat nahi!'],
  scared: ['Aaaah! Bhaago!', 'Upar se kaun phenk raha hai?!', 'Bachaooo!', 'Arre baap re, bhaago!', 'Kaun hai upar?!', 'Mummyyy!'],
  greet: ['Happy Diwali!', 'Ram Ram ji!', 'Arre, kaise ho?', 'Namaste aunty ji!', 'Mithai khayi?'],
};

let lastLine = 0;
export function sayLine(text: string, x: number, y: number, z: number, force = false) {
  const now = performance.now();
  if (!force && now - lastLine < 2200) return;
  lastLine = now;
  useGame.getState().say(text, [x, y, z], 1900);
}

// ------------------------------------------------------------------------------------------

const lastPlayer = { x: 0, z: 0 };
let lastBump = -1e9;
let lastGreet = -1e9;

/** A small collision: a line, a sorry back, a step aside. Rare, with a long cooldown. */
function bump(a: Agent, b: Agent | null) {
  const now = performance.now();
  if (now - lastBump < 25000) return;
  lastBump = now;
  const say = (who: Agent, line: string, delay: number) => window.setTimeout(() => sayLine(line, who.x, who.y + (who.kind === 'child' ? 1.25 : 1.95), who.z, true), delay);
  const nudge = (who: Agent, from: { x: number; z: number }) => {
    if (who.react !== 'none') return;
    const dx = who.x - from.x;
    const dz = who.z - from.z;
    const d = Math.hypot(dx, dz) || 1;
    who.react = 'step';
    who.reactT = 0;
    who.reactDur = 0.9;
    who.fx = dx / d;
    who.fz = dz / d;
  };
  const line = LINES.bump[(a.idx + Math.floor(now / 1000)) % LINES.bump.length];
  say(a, line, 120);
  nudge(a, b ?? runtime.player);
  if (b) {
    nudge(b, a);
    say(b, LINES.sorry[(b.idx + a.idx) % LINES.sorry.length], 1300);
  }
}

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
    const dt = Math.min(rawDt, simStep());
    const t = st.clock.elapsedTime;
    const p = runtime.player;
    const cam = st.camera.position;
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
    // nearest chunks first, so the one you stand in is never short of its people
    for (const k of [kp, kp - 1, kp + 1, kp - 2, kp + 2]) {
      if (spawned.current.has(k)) continue;
      spawned.current.set(k, true);
      const ox = k * STREET.chunk;
      for (const s of V[variantAt(k)].spawns) {
        // always leave room for the walkers
        if (crowd.agents.length >= cap - (high ? 18 : 10)) break;
        // a calmer mohalla: only some of each chunk's passers-by and chatters turn up
        if ((s.anim === 'wander' || s.anim === 'talk' || s.anim === 'play') && Math.random() < (high ? 0.4 : 0.55)) continue;
        const zone = s.zone ? { x0: s.zone.x0 + ox, x1: s.zone.x1 + ox, z0: s.zone.z0, z1: s.zone.z1 } : undefined;
        const a = crowd.spawn(s.kind, s.x + ox, s.y, s.z, s.ry, s.anim, k, { sit: !!s.sit, zone });
        if (a && s.sit) a.y = s.y - 0.45 + 0.04;
      }
    }
    // walkers stream along the sidewalks around the player
    const wantWalkers = high ? 8 : 5;
    let walkers = 0;
    for (const a of crowd.agents) if (a.owner === 'walker') walkers++;
    while (walkers < wantWalkers) {
      const first = frame.current < 3;
      const side = Math.random() < 0.5 ? 1 : -1;
      // at the start they are already about, but never right beside the camera
      const x = p.x + (Math.random() < 0.5 ? -1 : 1) * (first ? rnd(14, 60) : rnd(55, 68));
      const lane = side * rnd(GH - 0.95, GH - 0.7);
      const kind = pick<PersonKind>(['man', 'woman', 'woman', 'man', 'elder', 'child', 'woman', 'man']);
      const a = crowd.spawn(kind, x, 0, lane, 0, 'walk', 'walker', { lane, dir: Math.random() < 0.5 ? 1 : -1, wait: first ? rnd(0, 4) : 0 });
      if (!a) break;
      if (kind === 'child') a.speed = rnd(1.3, 1.7);
      walkers++;
    }


    const pm = Math.hypot(p.x - lastPlayer.x, p.z - lastPlayer.z);
    lastPlayer.x = p.x;
    lastPlayer.z = p.z;
    for (const a of [...crowd.agents]) {
      const dx = a.x - p.x;
      const dz = a.z - p.z;
      const d = Math.hypot(dx, dz);
      // walking into someone gets a word (rarely: there is a long cooldown)
      if (d < 0.75 && pm > 0.004 && a.kind !== 'dog' && a.owner !== 'rider' && a.owner !== 'player' && Math.abs(a.y - (p.floor ?? 0)) < 0.6) bump(a, null);
      if (a.owner === 'walker' && Math.abs(dx) > 72) {
        crowd.remove(a);
        continue;
      }
      if (a.pend && performance.now() >= a.pend.at) begin(a);
      if (a.react !== 'none') {
        a.reactT += dt;
        a.state = 'reacting';
        if (a.reactT >= a.reactDur && !finish(a)) {
          a.react = 'none';
          a.state = a.owner === 'walker' ? 'returning' : 'idle';
          if (a.owner !== 'walker' && a.anim !== 'wander' && a.anim !== 'play') a.ry = a.baseRy;
        }
      }
      if (a.owner !== 'rider' && a.owner !== 'player') move(a, dt);
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
        // Simran's art only shows people from the front. Walking away from the camera, the posed
        // 3D figure takes over (like the vehicles' low-poly models), seen from behind, with some
        // hysteresis so nobody flickers. Across and towards the camera stay illustrations.
        const mv = a.moving > 0.25 && !a.sit && a.owner !== 'rider';
        if (mv) {
          const vx = a.x - cam.x;
          const vz = a.z - cam.z;
          const vl = Math.hypot(vx, vz) || 1;
          const along = (Math.sin(a.ry) * vx + Math.cos(a.ry) * vz) / vl;
          a.solid = crowd.force3d || (a.solid ? along > 0.42 : along > 0.6);
        } else a.solid = crowd.force3d;
        if (!a.solid) {
          writeShadowOnly(a, meshes, shadow);
          continue;
        }
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

/** A step that never walks into anybody else. */
function stepClear(a: Agent, nx: number, nz: number) {
  for (const o of crowd.agents) {
    if (o === a || o.hidden || Math.abs(o.y - a.y) > 0.5) continue;
    const r = a.kind === 'dog' || o.kind === 'dog' ? 0.45 : 0.55;
    const dn = Math.hypot(o.x - nx, o.z - nz);
    if (dn < r && dn < Math.hypot(o.x - a.x, o.z - a.z)) return false;
  }
  return stepTo(a, nx, nz);
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
  if (a.react === 'step' || a.react === 'jump') {
    const k = Math.min(1, a.reactT / (a.reactDur * 0.6));
    const s = (1 - k) * (a.react === 'jump' ? 0.9 : 2.2) * dt;
    stepClear(a, a.x + a.fx * s, a.z + a.fz * s);
  } else if (a.react === 'flee') {
    const s = 4.2 * dt;
    if (!stepClear(a, a.x + a.fx * s, a.z + a.fz * s)) {
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

/** Someone standing near (x, z) on this floor, other than `self` (riders do not count). */
function personAt(x: number, z: number, y: number, r: number, self: Agent) {
  for (const o of crowd.agents) {
    if (o === self || o.owner === 'rider' || o.hidden || Math.abs(o.y - y) > 0.5) continue;
    if (Math.abs(o.x - x) < r && Math.abs(o.z - z) < r && Math.hypot(o.x - x, o.z - z) < r) return o;
  }
  return null;
}

// Walkers keep to the left of their sidewalk, follow slower people, step aside (or wait) for
// anyone standing or coming the other way, and now and then stop to greet someone they meet.
function walker(a: Agent, dt: number) {
  const p = runtime.player;
  const now = performance.now();
  // a greeting: walk up to about a metre apart, wave, chat, then carry on
  if (a.meet) {
    const b = a.meet;
    const d = Math.hypot(b.x - a.x, b.z - a.z);
    a.ry = Math.atan2(b.x - a.x, b.z - a.z);
    a.cur = 0;
    if (now > a.meetUntil || b.meet !== a || b.react !== 'none') {
      a.meet = null;
      a.meetFrom = 0;
      a.anim = 'walk';
      a.state = 'returning';
      a.greetCd = now + 45000;
      return;
    }
    if (d > 1.05) {
      a.state = 'approaching';
      const s = Math.min(d - 1.0, a.speed * 0.6 * dt);
      const nx = a.x + ((b.x - a.x) / d) * s;
      if (!personAt(nx, a.z, a.y, 0.45, a) || personAt(nx, a.z, a.y, 0.45, a) === b) stepTo(a, nx, a.z);
      a.cur = s / Math.max(dt, 1e-4);
      return;
    }
    if (!a.meetFrom) a.meetFrom = now;
    a.state = now - a.meetFrom < 1800 ? 'greeting' : 'talking';
    a.anim = a.state === 'greeting' ? 'wave' : 'talk';
    return;
  }
  if (a.wait > 0) {
    a.wait -= dt;
    a.state = 'idle';
    a.cur = 0;
    return;
  }
  // keep left: walking +x that is towards -z
  const keep = -a.dir * 0.2;
  let want = keep;
  let sp = a.speed;
  let blocked = false;
  for (const o of crowd.agents) {
    if (o === a || o.owner === 'rider' || o.hidden || Math.abs(o.y - a.y) > 0.5) continue;
    const ahead = (o.x - a.x) * a.dir;
    if (ahead <= 0 || ahead > 2.6) continue;
    const lat = o.z - a.z;
    if (Math.abs(lat) > 0.9) continue;
    // somebody coming the other way: maybe it is someone to greet
    if (o.owner === 'walker' && o.dir !== a.dir && !o.meet && ahead < 2.4 && o.kind !== 'dog' && a.kind !== 'dog' && now > a.greetCd && now > o.greetCd && now - lastGreet > 10000 && o.react === 'none') {
      lastGreet = now;
      const dur = 6000 + ((a.idx + o.idx) % 4) * 900;
      a.meet = o;
      o.meet = a;
      a.meetUntil = o.meetUntil = now + dur;
      const line = LINES.greet[(a.idx + o.idx) % LINES.greet.length];
      window.setTimeout(() => sayLine(line, a.x, a.y + (a.kind === 'child' ? 1.25 : 1.95), a.z, true), 900);
      return;
    }
    if (Math.abs(lat) > 0.5) continue;
    if (o.owner === 'walker' && o.dir === a.dir && !o.meet && o.react === 'none') {
      // the same way: fall in behind
      if (ahead < 1.3) sp = Math.min(sp, ahead < 0.7 ? 0 : o.cur * 0.95);
    } else if (ahead < 1.8) blocked = true;
  }
  // a cracker on the sidewalk, or a wall ahead, blocks too
  const look = a.x + a.dir * 0.9;
  if (!isOpen(look, a.lane + a.laneOff, 0.3) || runtime.hazards.some((h) => Math.abs(h.pos[0] - look) < h.radius + 0.6 && Math.abs(h.pos[2] - a.z) < h.radius + 0.6)) blocked = true;
  if (blocked) {
    // step out towards the road if that side is clear, otherwise wait
    const toRoad = -Math.sign(a.lane) * 0.75;
    if (!personAt(a.x + a.dir * 0.8, a.lane + toRoad, a.y, 0.5, a) && isOpen(a.x + a.dir * 0.8, a.lane + toRoad, 0.3)) {
      want = toRoad;
      a.state = 'avoiding';
    } else {
      sp = 0;
      a.state = 'waiting';
    }
  } else if (a.state !== 'returning' || Math.abs(a.laneOff - keep) < 0.05) a.state = 'walking';
  // wait for the player too
  const pd = Math.hypot(p.x - (a.x + a.dir * 0.7), p.z - a.z);
  if (pd < 0.9) {
    sp = 0;
    a.state = 'waiting';
  }
  a.laneOff += (want - a.laneOff) * Math.min(1, dt * 2.5);
  const nx = a.x + a.dir * sp * dt;
  const nz = a.lane + a.laneOff;
  // never through another person: hold position until there is room
  const other = personAt(nx + a.dir * 0.15, nz, a.y, 0.42, a);
  if (other) {
    if (other.owner === 'walker' && other.dir !== a.dir && Math.hypot(other.x - a.x, other.z - a.z) < 0.5 && (a.idx + other.idx) % 3 === 0) bump(a, other);
    sp = 0;
  }
  const px = a.x;
  if (sp > 0 && !stepTo(a, nx, nz) && !stepTo(a, nx, a.z)) a.blockT += dt;
  else if (sp === 0) {
    a.blockT += dt;
    // sideways only
    if (!personAt(a.x, nz, a.y, 0.42, a)) stepTo(a, a.x, nz);
  } else a.blockT = 0;
  // held up for a while (a wall, a group that won't budge, a vehicle waiting on them): turn
  // back the way they came rather than stand there forever
  if (a.blockT > 3) {
    a.dir *= -1;
    a.blockT = 0;
    a.laneOff = keep;
    a.state = 'returning';
  }
  a.cur = Math.abs(a.x - px) / Math.max(dt, 1e-4);
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

/** A cracker dropped among people from the balcony or terrace: everyone close runs, yelling. */
function scatter(e: WorldEvent, R: number) {
  const ex = e.pos[0];
  const ez = e.pos[2];
  let loud: Agent | null = null;
  let ld = Infinity;
  let n = 0;
  for (const a of crowd.agents) {
    if (a.owner === 'rider' || a.hidden || a.y > 0.3) continue;
    const dx = a.x - ex;
    const dz = a.z - ez;
    const d = Math.hypot(dx, dz);
    if (d > R) continue;
    const away = d > 0.01 ? [dx / d, dz / d] : [Math.random() - 0.5, Math.random() - 0.5];
    const k = Math.hypot(away[0], away[1]) || 1;
    a.react = 'flee';
    a.reactT = 0;
    a.reactDur = rnd(1.6, 2.6) + (R - d) * 0.12;
    a.fx = away[0] / k;
    a.fz = away[1] / k;
    a.lookUp = 0.4;
    n++;
    if (a.kind !== 'dog' && d < ld) {
      ld = d;
      loud = a;
    }
    if (a.kind === 'dog' && Math.random() < 0.7) window.setTimeout(() => audio.woof(), 150);
  }
  if (n > 0) {
    audio.yelp(Math.min(3, n));
    if (loud) {
      const who = loud;
      sayLine(pick(LINES.scared), who.x, who.y + (who.kind === 'child' ? 1.25 : 1.95), who.z, true);
    }
  }
}

function react(e: WorldEvent) {
  if (e.kind === 'thrown') {
    scatter(e, 6.5);
    return;
  }
  // a cracker lands with a clatter: people close by look over before it goes off
  if (e.kind === 'landed') {
    for (const a of crowd.agents) {
      if (a.owner === 'rider' || a.owner === 'player' || a.hidden || a.react !== 'none' || a.kind === 'dog') continue;
      const d = Math.hypot(a.x - e.pos[0], a.z - e.pos[2]);
      if (d > 7) continue;
      schedule(a, 'notice', rnd(0.7, 1.1), 60 + d * 40, e);
    }
    return;
  }
  // the burst of a cracker thrown down among people sends them running again
  const t = runtime.thrownAt;
  if (t && Math.hypot(e.pos[0] - t[0], e.pos[2] - t[2]) < 3) {
    scatter(e, e.kind === 'bomb' ? 12 : 8);
    return;
  }
  const big = e.kind === 'bomb' || e.kind === 'bigBurst';
  const R = e.kind === 'bomb' ? 18 : big ? 15 : e.kind === 'launch' ? 9 : 11;
  const ex = e.pos[0];
  const ez = e.pos[2];
  let filmer: Agent | null = null;
  let filmerD = Infinity;
  const speakers: { a: Agent; d: number; mood: Mood }[] = [];
  const p = runtime.player;
  for (const a of crowd.agents) {
    if (a.owner === 'rider' || a.owner === 'player' || a.hidden) continue;
    const d = Math.hypot(a.x - ex, a.z - ez);
    if (d > R) continue;
    // sound reaches the far ones a moment later, and everyone takes their own beat to react
    const delay = 40 + d * 30 + rnd(0, 220);
    if (a.kind === 'dog') {
      if (d < 12 || e.kind === 'bomb') {
        schedule(a, 'flee', rnd(2.2, 3.2), delay, e);
        if (Math.random() < 0.5) window.setTimeout(() => audio.woof(), delay + 120);
      }
      continue;
    }
    const near = d < (big ? 5 : 3.8) && a.y < 0.3;
    const mid = d < 10;
    const plan = planFor(a, near, mid, e.kind === 'bomb');
    schedule(a, plan.first, plan.firstDur, delay, e, plan.then, plan.thenDur);
    if (plan.mood) speakers.push({ a, d, mood: plan.mood });
    if (!near && d > 3.5 && d < 11 && d < filmerD && !a.sit && a.y < 0.3 && plan.first === 'watch') {
      filmer = a;
      filmerD = d;
    }
  }
  const f = filmer as Agent | null;
  if (f && Math.random() < 0.6) {
    f.pend = { k: 'film', dur: rnd(4, 5.5), at: performance.now() + 300, ex, ez, up: e.pos[1] };
  }
  // one short line, from whoever is closest and has something to say
  speakers.sort((x, y) => x.d - y.d);
  const s0 = speakers[0];
  if (s0 && (e.kind !== 'firework' || Math.random() < 0.7)) {
    const line = lineFor(s0.a, s0.mood, e);
    const h = s0.a.kind === 'child' ? 1.25 : 1.95;
    window.setTimeout(() => {
      sayLine(line, s0.a.x, s0.a.y + h, s0.a.z);
      voice(line, s0.a, Math.hypot(s0.a.x - p.x, s0.a.z - p.z));
    }, 380 + s0.d * 30);
  }
}

type Mood = 'startled' | 'annoyed' | 'happy';

/** How this person takes a burst: by who they are, how close it was, and a little chance. */
function planFor(a: Agent, near: boolean, mid: boolean, bomb: boolean): { first: ReactKind; firstDur: number; then?: ReactKind; thenDur?: number; mood?: Mood } {
  const r = Math.random();
  if (a.kind === 'child') {
    if (near) return { first: 'jump', firstDur: 0.7, then: r < 0.6 ? 'laugh' : 'cheer', thenDur: rnd(1.4, 2.2), mood: 'happy' };
    return { first: 'cheer', firstDur: rnd(1.6, 2.4), mood: r < 0.5 ? 'happy' : undefined };
  }
  if (a.sit) return { first: near ? 'ears' : 'watch', firstDur: rnd(1.2, 2), then: near && r < 0.6 ? 'shake' : undefined, thenDur: 1.2, mood: near ? 'annoyed' : undefined };
  if (a.kind === 'elder') {
    if (near) return { first: bomb ? 'ears' : 'jump', firstDur: bomb ? 1.4 : 0.8, then: r < 0.55 ? 'shake' : 'annoyed', thenDur: rnd(1.3, 1.8), mood: 'annoyed' };
    if (mid) return { first: 'watch', firstDur: rnd(1.6, 2.4), then: r < 0.3 ? 'shake' : undefined, thenDur: 1.2 };
    return { first: 'notice', firstDur: rnd(0.9, 1.4) };
  }
  if (near) {
    const first: ReactKind = bomb ? 'ears' : r < 0.55 ? 'jump' : 'step';
    const r2 = Math.random();
    const talking = a.anim === 'talk' || a.state === 'talking';
    const then: ReactKind = talking && r2 < 0.6 ? 'laugh' : r2 < 0.35 ? 'annoyed' : r2 < 0.65 ? 'point' : r2 < 0.85 ? 'laugh' : 'shake';
    return { first, firstDur: first === 'ears' ? 1.3 : 0.8, then, thenDur: rnd(1.3, 2), mood: then === 'laugh' ? 'happy' : then === 'point' || then === 'annoyed' || then === 'shake' ? 'annoyed' : 'startled' };
  }
  if (mid) {
    if (bomb) return { first: 'ears', firstDur: rnd(1.1, 1.6), mood: 'startled' };
    return { first: r < 0.25 ? 'clap' : r < 0.45 ? 'laugh' : 'watch', firstDur: rnd(1.8, 3) };
  }
  return { first: 'notice', firstDur: rnd(0.9, 1.5) };
}

const VOICE_LINES = {
  startled: ['Arre baap re!', 'Oye hoye!', 'Arre baap re!'],
  annoyed: ['Arey sambhal ke!', 'Kya yaar!', 'Arey sambhal ke!'],
  happy: ['Diwali hai bhai!', 'Oye hoye!', 'Diwali hai bhai!'],
};
function lineFor(a: Agent, mood: Mood, e: WorldEvent) {
  if (e.text && Math.random() < 0.3) return e.text;
  if (a.kind === 'child' && mood === 'happy') return pick(['Oye hoye!', 'Ek aur, ek aur!', 'Diwali hai bhai!']);
  return pick(VOICE_LINES[mood]);
}

/** Start a reaction after a beat (the NOTICING state), with an optional follow-up. */
function schedule(a: Agent, k: ReactKind, dur: number, delayMs: number, e: WorldEvent, then?: ReactKind, thenDur?: number) {
  // somebody already mid-reaction only picks up a bigger one
  if (a.react !== 'none' && a.react !== 'notice' && a.react !== 'watch' && (k === 'notice' || k === 'watch')) return;
  a.pend = { k, dur, at: performance.now() + delayMs, ex: e.pos[0], ez: e.pos[2], up: e.pos[1], then, thenDur };
}

/** Bring a scheduled reaction in: face the sound, set the move, keep the follow-up. */
function begin(a: Agent) {
  const q = a.pend!;
  a.pend = undefined;
  const dx = a.x - q.ex;
  const dz = a.z - q.ez;
  const d = Math.hypot(dx, dz);
  a.react = q.k;
  a.reactT = 0;
  a.reactDur = q.dur;
  a.fx = d > 0.01 ? dx / d : 1;
  a.fz = d > 0.01 ? dz / d : 0;
  a.lookUp = q.up > 6 ? 1 : q.up > 2 ? 0.6 : 0;
  a.next = q.then ? { k: q.then, dur: q.thenDur ?? 1.4 } : undefined;
  // turn toward the sound (sitters and sippers only turn their heads)
  if (a.kind === 'dog' || q.k === 'flee') return;
  if (a.owner === 'walker' || (a.anim !== 'sip' && !a.sit)) a.ry = Math.atan2(-dx, -dz);
}

/** The REACTING → RECOVERING → IDLE end of a reaction, or its follow-up. */
function finish(a: Agent) {
  if (a.next) {
    const n = a.next;
    a.next = undefined;
    a.react = n.k;
    a.reactT = 0;
    a.reactDur = n.dur;
    // pointing and shaking a finger are aimed at whoever threw it
    if (n.k === 'point' || n.k === 'annoyed') {
      const p = runtime.player;
      if (!a.sit) a.ry = Math.atan2(p.x - a.x, p.z - a.z);
    }
    return true;
  }
  return false;
}

/** Where a person is in their reaction, for tests and the debug overlay. */
export function reactionState(a: Agent): 'IDLE' | 'NOTICING' | 'STARTLED' | 'REACTING' | 'RECOVERING' {
  if (a.pend) return 'NOTICING';
  if (a.react === 'none') return 'IDLE';
  const u = a.reactT / Math.max(0.01, a.reactDur);
  if ((a.react === 'jump' || a.react === 'flinch' || a.react === 'step' || a.react === 'ears') && u < 0.5) return 'STARTLED';
  if (u > 0.75 && !a.next) return 'RECOVERING';
  return 'REACTING';
}

// ------------------------------------------------------------------------------------------
// Voices: a short spoken line now and then, quieter further away, never two at once.

let lastVoice = 0;
const voiceCd = new WeakMap<Agent, number>();
let hiVoice: SpeechSynthesisVoice | null | undefined;
function pickVoice() {
  if (hiVoice !== undefined) return hiVoice;
  const vs = window.speechSynthesis?.getVoices?.() ?? [];
  if (!vs.length) return null;
  hiVoice = vs.find((v) => v.lang === 'hi-IN') ?? vs.find((v) => v.lang === 'en-IN') ?? vs.find((v) => /hindi|india/i.test(v.name)) ?? null;
  return hiVoice;
}
export function voice(line: string, a: Agent, dist: number) {
  try {
    const g = useGame.getState();
    if (!g.settings.sound || !('speechSynthesis' in window)) return;
    const now = performance.now();
    if (now - lastVoice < 3800 || (voiceCd.get(a) ?? 0) > now || dist > 22) return;
    const v = pickVoice();
    if (!v) return;
    lastVoice = now + rnd(0, 1200);
    voiceCd.set(a, now + 14000);
    const u = new SpeechSynthesisUtterance(line);
    u.voice = v;
    u.lang = v.lang;
    u.volume = Math.max(0.15, Math.min(0.9, 1 - dist / 24));
    u.rate = a.kind === 'child' ? 1.15 : a.kind === 'elder' ? 0.9 : 1.05;
    u.pitch = a.kind === 'child' ? 1.7 : a.female ? 1.3 : a.kind === 'elder' ? 0.8 : 0.9;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  } catch {
    /* no voice here */
  }
}
