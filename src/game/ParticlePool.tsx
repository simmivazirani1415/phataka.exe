import { useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useGame } from './GameState';
import { runtime } from './Runtime';

// One pooled point cloud for every spark, ember and puff of smoke. Particles are recycled
// through a free list and always die at the end of their lifetime.

export interface ParticleOpts {
  pos: [number, number, number];
  vel: [number, number, number];
  life: number;
  color: THREE.ColorRepresentation;
  color2?: THREE.ColorRepresentation;
  size: number;
  size2?: number;
  gravity?: number;
  drag?: number;
  flicker?: number;
  additive?: boolean; // smoke uses alpha < 0 trick via colour; kept simple
}

const vert = /* glsl */ `
attribute float aSize;
attribute vec3 aColor;
attribute float aAlpha;
uniform float uScale;
varying vec3 vColor;
varying float vA;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  // perspective: world-size sparks, bigger up close
  gl_PointSize = aSize > 0.0 ? clamp(aSize * uScale / max(-mv.z, 0.3), 1.5, 160.0) : 0.0;
  vColor = aColor;
  vA = aAlpha;
}`;
const smokeFrag = /* glsl */ `
varying vec3 vColor;
varying float vA;
uniform vec3 uGlow;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c) * 2.0;
  if (d > 1.0 || vA <= 0.0) discard;
  float a = pow(1.0 - d, 1.6) * vA * 0.42;
  gl_FragColor = vec4(vColor + uGlow * (1.0 - d), a);
}`;
const frag = /* glsl */ `
varying vec3 vColor;
varying float vA;
uniform float uIntensity;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c) * 2.0;
  if (d > 1.0 || vA <= 0.0) discard;
  float a = pow(1.0 - d, 1.5);
  float core = smoothstep(0.35, 0.0, d);
  gl_FragColor = vec4((vColor * a + vec3(core) * 0.5 * a) * vA * uIntensity, 1.0);
}`;

class Pool {
  cap: number;
  pos: Float32Array;
  vel: Float32Array;
  col: Float32Array;
  c1: Float32Array;
  c2: Float32Array;
  age: Float32Array;
  life: Float32Array;
  s0: Float32Array;
  s1: Float32Array;
  size: Float32Array;
  alpha: Float32Array;
  grav: Float32Array;
  drag: Float32Array;
  flick: Float32Array;
  bounce = true;
  free: number[] = [];
  alive = 0;
  density = 1;
  constructor(cap: number) {
    this.cap = cap;
    this.pos = new Float32Array(cap * 3);
    this.vel = new Float32Array(cap * 3);
    this.col = new Float32Array(cap * 3);
    this.c1 = new Float32Array(cap * 3);
    this.c2 = new Float32Array(cap * 3);
    this.age = new Float32Array(cap);
    this.life = new Float32Array(cap);
    this.s0 = new Float32Array(cap);
    this.s1 = new Float32Array(cap);
    this.size = new Float32Array(cap);
    this.alpha = new Float32Array(cap);
    this.grav = new Float32Array(cap);
    this.drag = new Float32Array(cap);
    this.flick = new Float32Array(cap);
    for (let i = cap - 1; i >= 0; i--) this.free.push(i);
  }
  emit(o: ParticleOpts) {
    const i = this.free.pop();
    if (i === undefined) return;
    const c = _c.set(o.color);
    const c2 = _c2.set(o.color2 ?? o.color);
    this.pos.set(o.pos, i * 3);
    this.vel.set(o.vel, i * 3);
    this.c1.set([c.r, c.g, c.b], i * 3);
    this.c2.set([c2.r, c2.g, c2.b], i * 3);
    this.age[i] = 0;
    this.life[i] = o.life;
    this.s0[i] = o.size;
    this.s1[i] = o.size2 ?? o.size * 0.3;
    this.grav[i] = o.gravity ?? 3;
    this.drag[i] = o.drag ?? 0.8;
    this.flick[i] = o.flicker ?? 0;
    this.alive++;
  }
  update(dt: number) {
    for (let i = 0; i < this.cap; i++) {
      if (this.life[i] <= 0) continue;
      this.age[i] += dt;
      if (this.age[i] >= this.life[i]) {
        this.life[i] = 0;
        this.size[i] = 0;
        this.alpha[i] = 0;
        this.free.push(i);
        this.alive--;
        continue;
      }
      const t = this.age[i] / this.life[i];
      const k = i * 3;
      const damp = Math.max(0, 1 - this.drag[i] * dt);
      this.vel[k] *= damp;
      this.vel[k + 1] = this.vel[k + 1] * damp - this.grav[i] * dt;
      this.vel[k + 2] *= damp;
      this.pos[k] += this.vel[k] * dt;
      this.pos[k + 1] += this.vel[k + 1] * dt;
      this.pos[k + 2] += this.vel[k + 2] * dt;
      // sparks hit the road and skitter along it
      if (this.bounce && this.pos[k + 1] < 0.02 && this.vel[k + 1] < 0 && this.grav[i] > 0) {
        this.pos[k + 1] = 0.02;
        this.vel[k + 1] *= -0.32;
        this.vel[k] *= 0.6;
        this.vel[k + 2] *= 0.6;
      }
      this.col[k] = this.c1[k] + (this.c2[k] - this.c1[k]) * t;
      this.col[k + 1] = this.c1[k + 1] + (this.c2[k + 1] - this.c1[k + 1]) * t;
      this.col[k + 2] = this.c1[k + 2] + (this.c2[k + 2] - this.c1[k + 2]) * t;
      this.size[i] = this.s0[i] + (this.s1[i] - this.s0[i]) * t;
      const f = this.flick[i] > 0 ? 1 - this.flick[i] + Math.random() * this.flick[i] * 1.6 : 1;
      this.alpha[i] = Math.pow(1 - t, 1.1) * f;
    }
  }
  clear() {
    this.free = [];
    for (let i = this.cap - 1; i >= 0; i--) {
      this.life[i] = 0;
      this.size[i] = 0;
      this.alpha[i] = 0;
      this.free.push(i);
    }
    this.alive = 0;
  }
}

const _c = new THREE.Color();
const _c2 = new THREE.Color();

export let particles: Pool = new Pool(1);
/** soft smoke drawn with normal blending, so it can darken as well as glow */
export let smokePool: Pool = new Pool(1);

function makePoints(pool: Pool, frag: string, uniforms: Record<string, THREE.IUniform>, additive: boolean) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pool.pos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('aColor', new THREE.BufferAttribute(pool.col, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('aSize', new THREE.BufferAttribute(pool.size, 1).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('aAlpha', new THREE.BufferAttribute(pool.alpha, 1).setUsage(THREE.DynamicDrawUsage));
  const mat = new THREE.ShaderMaterial({ vertexShader: vert, fragmentShader: frag, uniforms, transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  points.renderOrder = additive ? 10 : 9;
  points.raycast = () => {};
  return points;
}

function flagDirty(points: THREE.Points) {
  const geo = points.geometry;
  (geo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
  (geo.getAttribute('aColor') as THREE.BufferAttribute).needsUpdate = true;
  (geo.getAttribute('aSize') as THREE.BufferAttribute).needsUpdate = true;
  (geo.getAttribute('aAlpha') as THREE.BufferAttribute).needsUpdate = true;
}

export function ParticleSystem() {
  const graphics = useGame((s) => s.settings.graphics);
  const { gl, size } = useThree();
  const { points, pool, uniforms, smokePoints, sPool, sUniforms } = useMemo(() => {
    const cap = graphics === 'high' ? 7000 : 2600;
    const pool = new Pool(cap);
    pool.density = graphics === 'high' ? 1 : 0.45;
    const uniforms = { uScale: { value: 400 }, uIntensity: { value: 1 } };
    const points = makePoints(pool, frag, uniforms, true);
    const sPool = new Pool(graphics === 'high' ? 900 : 400);
    sPool.density = graphics === 'high' ? 1 : 0.6;
    sPool.bounce = false;
    const sUniforms = { uScale: { value: 400 }, uGlow: { value: new THREE.Color(0, 0, 0) } };
    const smokePoints = makePoints(sPool, smokeFrag, sUniforms, false);
    return { points, pool, uniforms, smokePoints, sPool, sUniforms };
  }, [graphics]);

  useEffect(() => {
    particles = pool;
    smokePool = sPool;
    return () => {
      points.geometry.dispose();
      (points.material as THREE.Material).dispose();
      smokePoints.geometry.dispose();
      (smokePoints.material as THREE.Material).dispose();
    };
  }, [pool, points, sPool, smokePoints]);

  useFrame(({ camera }, dt) => {
    pool.update(Math.min(dt, 0.05));
    sPool.update(Math.min(dt, 0.05));
    const fov = (camera as THREE.PerspectiveCamera).fov ?? 60;
    const px = (size.height * gl.getPixelRatio()) / (2 * Math.tan(THREE.MathUtils.degToRad(fov / 2)));
    uniforms.uScale.value = px * 0.5;
    sUniforms.uScale.value = px * 0.5;
    // smoke catches the light of whatever is burning
    const fl = runtime.fireworkLight;
    sUniforms.uGlow.value.setRGB(fl.color[0], fl.color[1], fl.color[2]).multiplyScalar(Math.min(0.35, fl.intensity * 0.12));
    // HDR sparks so the bloom pass picks them up on High graphics
    uniforms.uIntensity.value = runtime.composer ? 2.1 : 1;
    flagDirty(points);
    flagDirty(smokePoints);
  });

  return (
    <>
      <primitive object={smokePoints} />
      <primitive object={points} />
    </>
  );
}

// ---------------------------------------------------------------------------
// Emission patterns

const rnd = (a: number, b: number) => a + Math.random() * (b - a);
export const pick = <T,>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)];

export function sphereBurst(center: [number, number, number], n: number, speed: number, colors: string[], o: Partial<ParticleOpts> = {}) {
  const count = Math.round(n * particles.density);
  for (let i = 0; i < count; i++) {
    const u = Math.random() * 2 - 1;
    const th = Math.random() * Math.PI * 2;
    const r = Math.sqrt(1 - u * u);
    const s = speed * rnd(0.75, 1.05);
    particles.emit({
      pos: [...center],
      vel: [r * Math.cos(th) * s, u * s, r * Math.sin(th) * s],
      life: rnd(1.1, 1.8),
      color: pick(colors),
      color2: '#FF7A2E',
      size: 0.22,
      size2: 0.05,
      gravity: 2.2,
      drag: 1.3,
      ...o,
    });
  }
}

export function ringBurst(center: [number, number, number], n: number, speed: number, colors: string[], o: Partial<ParticleOpts> = {}) {
  const count = Math.round(n * particles.density);
  for (let i = 0; i < count; i++) {
    const th = (i / count) * Math.PI * 2;
    particles.emit({ pos: [...center], vel: [Math.cos(th) * speed, rnd(-0.2, 0.4), Math.sin(th) * speed], life: rnd(0.5, 0.9), color: pick(colors), size: 0.16, gravity: 0.5, drag: 2.5, ...o });
  }
}

export function sparks(pos: [number, number, number], n: number, speed: number, colors: string[], o: Partial<ParticleOpts> = {}) {
  const count = Math.max(1, Math.round(n * particles.density));
  for (let i = 0; i < count; i++) {
    const u = Math.random() * 2 - 1;
    const th = Math.random() * Math.PI * 2;
    const r = Math.sqrt(1 - u * u);
    const s = speed * rnd(0.3, 1);
    particles.emit({ pos: [...pos], vel: [r * Math.cos(th) * s, u * s, r * Math.sin(th) * s], life: rnd(0.25, 0.55), color: pick(colors), color2: '#FF6A1A', size: 0.09, size2: 0.02, gravity: 3, drag: 2, flicker: 0.5, ...o });
  }
}

export function smoke(pos: [number, number, number], n: number, o: Partial<ParticleOpts> = {}) {
  const count = Math.max(1, Math.round(n * smokePool.density));
  for (let i = 0; i < count; i++) {
    smokePool.emit({ pos: [pos[0] + rnd(-0.2, 0.2), pos[1], pos[2] + rnd(-0.2, 0.2)], vel: [rnd(-0.25, 0.25), rnd(0.35, 0.9), rnd(-0.25, 0.25)], life: rnd(2.2, 3.6), color: '#9A9AA6', color2: '#4A4E5E', size: 0.6, size2: 1.8, gravity: -0.06, drag: 0.7, ...o });
  }
}

export { rnd };
