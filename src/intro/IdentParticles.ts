import * as THREE from 'three';
import gsap from 'gsap';
import { mulberry32 } from '../utils/TextureGenerator';
import { identLayout, rocketDir, rocketPath } from './identLayout';
import { ident } from './identState';

// Every spark in the ident lives in one reused point buffer. Positions are closed-form
// functions of the film time, so scrubbing, skipping or replaying the timeline always shows
// exactly the same frame (no simulation state to reset).

const vert = /* glsl */ `
attribute float aSize;
attribute vec3 aColor;
attribute float aAlpha;
uniform float uPx;
varying vec3 vColor;
varying float vA;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = aSize > 0.0 ? clamp(aSize * uPx / max(0.05, -mv.z), 1.5, 220.0) : 0.0;
  vColor = aColor;
  vA = aAlpha;
}`;
const frag = /* glsl */ `
varying vec3 vColor;
varying float vA;
uniform float uIntensity;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c) * 2.0;
  if (d > 1.0 || vA <= 0.0) discard;
  float a = pow(1.0 - d, 1.6);
  float core = smoothstep(0.32, 0.0, d);
  gl_FragColor = vec4((vColor * a + vec3(core) * 0.55 * a) * vA * uIntensity, 1.0);
}`;

// group sizes
const N = {
  sparkler: 40,
  chakri: 240,
  spiral: 48,
  anaar: 400,
  fuse: 30,
  trail: 340,
  head: 1,
  flash: 1,
  free: 240,
  frame: 420,
  diyas: 4,
};
const TOTAL = Object.values(N).reduce((a, b) => a + b, 0);

/** Film times shared with the master timeline. */
export const FX_T = {
  chakri: [1.0, 1.62] as const,
  chakriTravel: [1.1, 1.45] as const,
  spiral: [1.33, 1.52] as const,
  anaar: [1.43, 2.55] as const,
  fuse: [1.9, 2.07] as const,
  rocket: [2.06, 2.94] as const,
  burst: 3.0,
};

const chakriEase = gsap.parseEase('sine.inOut');
const rocketEase = gsap.parseEase('power2.out');
const expandEase = gsap.parseEase('expo.out');
const resolveEase = gsap.parseEase('power3.inOut');
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (a: number, b: number, v: number) => {
  const k = clamp01((v - a) / (b - a));
  return k * k * (3 - 2 * k);
};
export const chakriU = (t: number) => chakriEase(clamp01((t - FX_T.chakriTravel[0]) / (FX_T.chakriTravel[1] - FX_T.chakriTravel[0])));
export const rocketU = (t: number) => rocketEase(clamp01((t - FX_T.rocket[0]) / (FX_T.rocket[1] - FX_T.rocket[0])));
/** Chakri spin angle: fast at ignition, easing as it burns down. */
export const chakriSpin = (t: number) => {
  const k = Math.max(0, t - FX_T.chakri[0]);
  return 30 * k - 7 * k * k;
};

const C = (hex: string) => new THREE.Color(hex);
const GOLD = C('#FFD15A');
const CREAM = C('#FFF1CC');
const AMBER = C('#FFB547');
const EMBER = C('#FF6A1A');
const RANI = C('#FF5FA8');
const TURQ = C('#45E0D0');
const VERMILION = C('#FF5A36');

export interface ParticleInputs {
  t: number;
  sparklerHand: THREE.Vector3 | null;
  diyaPos: THREE.Vector3[];
  diyaLight: number[];
  burstNormal: THREE.Vector3;
}

const _p = new THREE.Vector3();
const _q = new THREE.Vector3();
const _d = new THREE.Vector3();
const _c = new THREE.Color();
const _ay = new THREE.Vector3();

export class IdentParticles {
  points: THREE.Points;
  uniforms = { uPx: { value: 600 }, uIntensity: { value: 1 } };
  private pos = new Float32Array(TOTAL * 3);
  private col = new Float32Array(TOTAL * 3);
  private size = new Float32Array(TOTAL);
  private alpha = new Float32Array(TOTAL);
  private rnd = new Float32Array(TOTAL * 6);
  /** burst frame: slot polar coords (angle, radius), size and colour, plus burst direction */
  private slots: { a: number; r: number; s: number; color: THREE.Color; spin: number }[] = [];
  private burstDir: THREE.Vector3[] = [];
  private freeDir: THREE.Vector3[] = [];
  private freeCol: THREE.Color[] = [];

  constructor() {
    const r = mulberry32(5005);
    for (let i = 0; i < this.rnd.length; i++) this.rnd[i] = r();
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aColor', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    const mat = new THREE.ShaderMaterial({ vertexShader: vert, fragmentShader: frag, uniforms: this.uniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 12;
    this.points.raycast = () => {};
    this.buildFrame(r);
  }

  /** The decorative circular frame the burst resolves into: rings, lotus petals and bindus. */
  private buildFrame(r: () => number) {
    const R = identLayout().ringR;
    const add = (a: number, rad: number, s: number, color: THREE.Color, spin: number) => this.slots.push({ a, r: rad, s, color, spin });
    for (let k = 0; k < 132; k++) add((k / 132) * Math.PI * 2, R, 0.07, CREAM, 0.12);
    for (let k = 0; k < 66; k++) add(((k + 0.5) / 66) * Math.PI * 2, R * 0.86, 0.095, GOLD, -0.18);
    for (let j = 0; j < 16; j++) {
      const c = ((j + 0.5) / 16) * Math.PI * 2;
      for (const s of [0, 0.25, 0.5, 0.75, 1]) {
        const half = 0.075 * Math.sin(Math.PI * s);
        const rad = R * (1.05 + 0.17 * s);
        add(c - half, rad, 0.06, AMBER, 0.12);
        if (s > 0 && s < 1) add(c + half, rad, 0.06, AMBER, 0.12);
      }
      add(c, R * 1.12, 0.08, GOLD, 0.12);
    }
    for (let j = 0; j < 16; j++) add((j / 16) * Math.PI * 2, R * 0.93, 0.13, j % 2 ? TURQ : RANI, -0.18);
    while (this.slots.length < N.frame) {
      const k = this.slots.length;
      add((k / 62) * Math.PI * 2 + 0.05, R * 1.3, 0.045, CREAM, 0.08);
    }
    for (let k = 0; k < N.frame; k++) {
      const u = r() * 2 - 1;
      const th = r() * Math.PI * 2;
      const s = Math.sqrt(1 - u * u);
      this.burstDir.push(new THREE.Vector3(s * Math.cos(th), u, s * Math.sin(th) * 0.35).normalize().multiplyScalar(0.75 + r() * 0.75));
    }
    const pal = [GOLD, GOLD, AMBER, RANI, TURQ, VERMILION, CREAM];
    for (let k = 0; k < N.free; k++) {
      const u = r() * 2 - 1;
      const th = r() * Math.PI * 2;
      const s = Math.sqrt(1 - u * u);
      this.freeDir.push(new THREE.Vector3(s * Math.cos(th), u, s * Math.sin(th)));
      this.freeCol.push(pal[Math.floor(r() * pal.length)]);
    }
  }

  private put(i: number, p: THREE.Vector3, c: THREE.Color, size: number, alpha: number) {
    this.pos[i * 3] = p.x;
    this.pos[i * 3 + 1] = p.y;
    this.pos[i * 3 + 2] = p.z;
    this.col[i * 3] = c.r;
    this.col[i * 3 + 1] = c.g;
    this.col[i * 3 + 2] = c.b;
    this.size[i] = size;
    this.alpha[i] = alpha;
  }
  private hide(i: number) {
    this.size[i] = 0;
    this.alpha[i] = 0;
  }
  private r(i: number, j: number) {
    return this.rnd[i * 6 + j];
  }

  update(inp: ParticleInputs) {
    const { t } = inp;
    const L = identLayout();
    const fx = ident.fx;
    let i = 0;

    // window B: a child's phuljhadi
    for (let k = 0; k < N.sparkler; k++, i++) {
      const hand = inp.sparklerHand;
      const period = 0.2;
      const age = (t + this.r(i, 0) * period) % period;
      if (!hand || t < L.windows[1].light + 0.05 || t > 1.05) {
        this.hide(i);
        continue;
      }
      const a = this.r(i, 1) * Math.PI * 2;
      const sp = 0.6 + this.r(i, 2) * 0.8;
      _p.set(hand.x + Math.cos(a) * sp * age, hand.y + Math.sin(a) * sp * age - 0.6 * age * age, hand.z + 0.02);
      _c.copy(CREAM).lerp(AMBER, age / period);
      this.put(i, _p, _c, 0.018 * (1 - age / period) + 0.006, 1);
    }

    // chakri: sparks thrown off the spinning rim leave a circular trail across the roof
    const [c0, c1] = FX_T.chakri;
    for (let k = 0; k < N.chakri; k++, i++) {
      const te = c0 + ((k + this.r(i, 0) * 0.8) / N.chakri) * (c1 - c0);
      const life = 0.3 + this.r(i, 1) * 0.22;
      const age = t - te;
      if (age < 0 || age > life) {
        this.hide(i);
        continue;
      }
      const centre = _q.lerpVectors(L.chakriStart, L.chakriEnd, chakriU(te));
      const ang = chakriSpin(te) + (k % 2) * Math.PI;
      const rim = L.medallionR;
      const cx = Math.cos(ang);
      const sz = Math.sin(ang);
      // tangent of the spin, plus a little outward and upward kick
      const sp = 1.6 + this.r(i, 2) * 1.4;
      const drag = (1 - Math.exp(-3 * age)) / 3;
      _p.set(centre.x + cx * rim + (-sz * sp + cx * 0.5) * drag, centre.y + 0.04 + (0.5 + this.r(i, 3)) * drag - 1.5 * age * age, centre.z + sz * rim + (cx * sp + sz * 0.5) * drag);
      const k01 = age / life;
      _c.copy(CREAM).lerp(GOLD, Math.min(1, k01 * 2)).lerp(EMBER, Math.max(0, k01 * 2 - 1));
      this.put(i, _p, _c, 0.05 * (1 - k01 * 0.7), 1 - k01 * k01);
    }

    // the chakri's ring of fire spirals into the anaar's mouth
    const [s0, s1] = FX_T.spiral;
    const sk = clamp01((t - s0) / (s1 - s0));
    for (let k = 0; k < N.spiral; k++, i++) {
      if (t < s0 || t > s1 + 0.05) {
        this.hide(i);
        continue;
      }
      const e = sk * sk;
      const ang = (k / N.spiral) * Math.PI * 2 + sk * 9;
      const rad = (0.62 + this.r(i, 0) * 0.08) * (1 - e);
      _p.set(L.anaar.x + Math.cos(ang) * rad, L.anaar.y + 0.05 + (L.anaarMouth.y - L.anaar.y) * e, L.anaar.z + Math.sin(ang) * rad);
      _c.copy(GOLD).lerp(CREAM, e);
      this.put(i, _p, _c, 0.045, 1 - smooth(0.85, 1.1, sk));
    }

    // anaar: a golden fountain whose spray arcs towards the rocket on the parapet
    const [a0, a1] = FX_T.anaar;
    _d.subVectors(L.rocketBase, L.anaar).setY(0).normalize();
    for (let k = 0; k < N.anaar; k++, i++) {
      const te = a0 + ((k + this.r(i, 0)) / N.anaar) * (a1 - a0);
      const life = 0.55 + this.r(i, 1) * 0.35;
      const age = t - te;
      if (age < 0 || age > life) {
        this.hide(i);
        continue;
      }
      const power = smooth(a0, a0 + 0.14, te) * (1 - smooth(a1 - 0.25, a1, te));
      const up = (3.4 + this.r(i, 2) * 1.6) * (0.55 + 0.45 * power);
      const spread = 0.38 * up;
      const th = this.r(i, 3) * Math.PI * 2;
      const rr = Math.sqrt(this.r(i, 4)) * spread;
      const vx = Math.cos(th) * rr + _d.x * up * 0.2;
      const vz = Math.sin(th) * rr + _d.z * up * 0.2;
      const drag = (1 - Math.exp(-1.2 * age)) / 1.2;
      _p.set(L.anaarMouth.x + vx * drag, L.anaarMouth.y + up * drag - 3.6 * age * age, L.anaarMouth.z + vz * drag);
      const k01 = age / life;
      _c.copy(CREAM).lerp(GOLD, Math.min(1, k01 * 1.6)).lerp(EMBER, Math.max(0, k01 * 1.6 - 0.6));
      this.put(i, _p, _c, 0.055 * (1 - k01 * 0.6), (1 - k01 * k01) * Math.min(1, power * 3));
    }

    // fuse catching on the rocket
    const tail = (u: number, out: THREE.Vector3) => {
      rocketPath(u, out);
      rocketDir(u, _d);
      return out.addScaledVector(_d, 0.62).add(_q.set(0.09, 0, 0));
    };
    const [f0, f1] = FX_T.fuse;
    for (let k = 0; k < N.fuse; k++, i++) {
      const te = f0 + ((k + this.r(i, 0)) / N.fuse) * (f1 - f0);
      const age = t - te;
      if (age < 0 || age > 0.2) {
        this.hide(i);
        continue;
      }
      tail(0, _p);
      const a = this.r(i, 1) * Math.PI * 2;
      _p.x += Math.cos(a) * age * 1.1;
      _p.y += age * 0.4 - 2 * age * age;
      _p.z += Math.sin(a) * age * 1.1;
      this.put(i, _p, GOLD, 0.035, 1 - age / 0.2);
    }

    // rocket trail
    const [r0, r1] = FX_T.rocket;
    for (let k = 0; k < N.trail; k++, i++) {
      const te = r0 + ((k + this.r(i, 0)) / N.trail) * (r1 - r0);
      const life = 0.4 + this.r(i, 1) * 0.45;
      const age = t - te;
      if (age < 0 || age > life) {
        this.hide(i);
        continue;
      }
      const u = rocketU(te);
      tail(u, _p);
      rocketDir(u, _d);
      const jx = (this.r(i, 2) - 0.5) * 0.5;
      const jz = (this.r(i, 3) - 0.5) * 0.5;
      _p.x += (jx - _d.x * 0.5) * age;
      _p.y += (-_d.y * 0.5 + 0.1) * age - 1.4 * age * age;
      _p.z += (jz - _d.z * 0.5) * age;
      const k01 = age / life;
      _c.copy(CREAM).lerp(GOLD, Math.min(1, k01 * 2)).lerp(EMBER, Math.max(0, k01 * 2 - 0.9));
      this.put(i, _p, _c, 0.075 * (1 - k01 * 0.75), (1 - k01) * (1 - k01 * 0.3));
    }

    // rocket head glow
    for (let k = 0; k < N.head; k++, i++) {
      if (t < r0 || t > r1) {
        this.hide(i);
        continue;
      }
      tail(rocketU(t), _p);
      this.put(i, _p, CREAM, 0.2 + Math.sin(t * 90) * 0.03, 1);
    }

    // burst: a soft bloom of light, never a hard flash
    const B = L.burst;
    for (let k = 0; k < N.flash; k++, i++) {
      const age = t - FX_T.burst;
      if (age < 0 || age > 0.4) {
        this.hide(i);
        continue;
      }
      const f = 1 - age / 0.4;
      this.put(i, B, AMBER, 4.2 * (0.4 + 0.6 * f), 0.35 * f * f);
    }

    // burst: free sparks falling away in festival colours
    for (let k = 0; k < N.free; k++, i++) {
      const age = t - FX_T.burst;
      const life = 0.9 + this.r(i, 0) * 0.45;
      if (age < 0 || age > life) {
        this.hide(i);
        continue;
      }
      const sp = 6.2 + this.r(i, 1) * 2.4;
      const drag = (1 - Math.exp(-2.6 * age)) / 2.6;
      const d = this.freeDir[k];
      _p.set(B.x + d.x * sp * drag, B.y + d.y * sp * drag - 1.0 * age * age, B.z + d.z * sp * drag);
      const k01 = age / life;
      _c.copy(this.freeCol[k]).lerp(EMBER, k01 * 0.6);
      const tw = 0.75 + 0.25 * Math.sin(t * 40 + k);
      this.put(i, _p, _c, 0.11 * (1 - k01 * 0.6), (1 - k01) * tw * fx);
    }

    // burst: particles expand, then resolve into the decorative frame around the wordmark
    const n = inp.burstNormal;
    // plane basis facing the camera at the reveal
    const ax = _q.set(1, 0, 0).sub(_d.copy(n).multiplyScalar(n.x)).normalize();
    const ay = _ay.crossVectors(ax, n);
    for (let k = 0; k < N.frame; k++, i++) {
      const age = t - FX_T.burst;
      if (age < 0) {
        this.hide(i);
        continue;
      }
      const sl = this.slots[k];
      const ex = expandEase(clamp01(age / 0.42));
      const sweep = (((sl.a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) / (Math.PI * 2);
      const res = resolveEase(clamp01((age - 0.2 - sweep * 0.16) / 0.5));
      const bd = this.burstDir[k];
      const R = L.ringR;
      const ang = sl.a + Math.max(0, age - 0.2) * sl.spin;
      const sx = Math.cos(ang) * sl.r;
      const sy = Math.sin(ang) * sl.r;
      // expanded position keeps drifting outward a little while it waits to resolve
      const bx = bd.x * R * (ex + age * 0.08);
      const by = bd.y * R * (ex + age * 0.08) - 0.3 * age * age;
      const bz = bd.z * R * ex;
      _p.copy(B)
        .addScaledVector(ax, bx + (sx - bx) * res)
        .addScaledVector(ay, by + (sy - by) * res)
        .addScaledVector(n, bz * (1 - res));
      _c.copy(GOLD).lerp(sl.color, res);
      const tw = 0.82 + 0.18 * Math.sin(t * 6 + k * 1.7);
      const bright = 1 + (1 - res) * 0.4;
      this.put(i, _p, _c, (0.07 + (sl.s - 0.07) * res) * bright, tw * fx);
    }

    // diyas on window C's sill
    for (let k = 0; k < N.diyas; k++, i++) {
      const p = inp.diyaPos[k];
      const lit = inp.diyaLight[k];
      if (!p || lit <= 0 || t > 1.05) {
        this.hide(i);
        continue;
      }
      const fl = 1 + Math.sin(t * 31 + k * 2.1) * 0.12 + Math.sin(t * 17 + k) * 0.08;
      this.put(i, p, AMBER, 0.06 * fl * lit, lit);
    }

    const geo = this.points.geometry;
    (geo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (geo.getAttribute('aColor') as THREE.BufferAttribute).needsUpdate = true;
    (geo.getAttribute('aSize') as THREE.BufferAttribute).needsUpdate = true;
    (geo.getAttribute('aAlpha') as THREE.BufferAttribute).needsUpdate = true;
  }

  dispose() {
    this.points.geometry.dispose();
    (this.points.material as THREE.Material).dispose();
  }
}
