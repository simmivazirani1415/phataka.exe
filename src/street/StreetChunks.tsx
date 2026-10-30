import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { runtime } from '../game/Runtime';
import { useGame } from '../game/GameState';
import { chunkOf, getVariants, STREET, VARIANTS, variantAt, type Inst, type VariantData, type VariantKind } from './StreetLayout';
import { asphaltTexture, pavingTexture, RANGOLI_N, rangoliAtlas, SIGN_COLS, SIGN_ROWS, signAtlas } from './StreetTextures';

// Draws the endless gali. Every variant is turned into a handful of instanced layers once;
// a chunk "slot" is just a group that points at those shared GPU buffers, moved to k * chunk.
// LOD: far chunks keep only their shell (walls, slabs, tanks) and lit windows; nearby chunks
// add the small detail layer and the fairy lights.

const C = STREET.chunk;
const GEOS = [new THREE.BoxGeometry(1, 1, 1), new THREE.CylinderGeometry(0.5, 0.5, 1, 14), new THREE.SphereGeometry(0.5, 12, 8)];

interface Layer {
  shape: number;
  count: number;
  matrix: THREE.InstancedBufferAttribute;
  color: THREE.InstancedBufferAttribute;
  sphere: THREE.Sphere;
}

interface Template {
  shell: Layer[];
  detail: Layer[];
  glow: Layer[];
  points: THREE.BufferGeometry | null;
  signs: THREE.BufferGeometry | null;
  rangolis: THREE.BufferGeometry | null;
  pave: THREE.BufferGeometry | null;
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();

function layers(list: Inst[], boost = 1): Layer[] {
  const out: Layer[] = [];
  for (let shape = 0; shape < 3; shape++) {
    const items = list.filter((i) => i.shape === shape);
    if (!items.length) continue;
    const matrix = new THREE.InstancedBufferAttribute(new Float32Array(items.length * 16), 16);
    const color = new THREE.InstancedBufferAttribute(new Float32Array(items.length * 3), 3);
    const box = new THREE.Box3();
    items.forEach((it, i) => {
      _e.set(it.rx ?? 0, it.ry, it.rz ?? 0, 'YXZ');
      _q.setFromEuler(_e);
      _m.compose(_p.set(it.x, it.y, it.z), _q, _s.set(it.w, it.h, it.d));
      _m.toArray(matrix.array as Float32Array, i * 16);
      _c.setHex(it.color, THREE.SRGBColorSpace);
      color.setXYZ(i, _c.r * boost, _c.g * boost, _c.b * boost);
      box.expandByPoint(_p.set(it.x - it.w, it.y - it.h, it.z - it.d));
      box.expandByPoint(_p.set(it.x + it.w, it.y + it.h, it.z + it.d));
    });
    out.push({ shape, count: items.length, matrix, color, sphere: box.getBoundingSphere(new THREE.Sphere()) });
  }
  return out;
}

function pointsGeometry(v: VariantData) {
  if (!v.points.length) return null;
  const n = v.points.length;
  const pos = new Float32Array(n * 3);
  const col = new Float32Array(n * 3);
  const size = new Float32Array(n);
  const tw = new Float32Array(n);
  const seed = new Float32Array(n);
  v.points.forEach((p, i) => {
    pos.set([p.x, p.y, p.z], i * 3);
    _c.setHex(p.color, THREE.SRGBColorSpace);
    col.set([_c.r, _c.g, _c.b], i * 3);
    size[i] = p.size;
    tw[i] = p.tw;
    seed[i] = (Math.sin(i * 12.9898 + p.x * 78.233) * 43758.5453) % 1;
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
  g.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  g.setAttribute('aTw', new THREE.BufferAttribute(tw, 1));
  g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  g.computeBoundingSphere();
  return g;
}

/** Quads merged into one geometry: corners from a centre, size and yaw; uv from an atlas cell. */
function quads(items: { x: number; y: number; z: number; w: number; h: number; ry: number; flat?: boolean; uv: [number, number, number, number] }[]) {
  if (!items.length) return null;
  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  items.forEach((q, i) => {
    const ux = Math.cos(q.ry);
    const uz = -Math.sin(q.ry);
    const hw = q.w / 2;
    const hh = q.h / 2;
    let corners: number[][];
    let n: number[];
    if (q.flat) {
      // lying on the ground: w along x, h along z
      corners = [
        [q.x - hw, q.y, q.z + hh],
        [q.x + hw, q.y, q.z + hh],
        [q.x + hw, q.y, q.z - hh],
        [q.x - hw, q.y, q.z - hh],
      ];
      n = [0, 1, 0];
    } else {
      // facing the street: the front normal is -N of the building frame
      const nx = -Math.sin(q.ry);
      const nz = -Math.cos(q.ry);
      // reading direction runs along -U so text is not mirrored from the street
      corners = [
        [q.x + hw * ux, q.y - hh, q.z + hw * uz],
        [q.x - hw * ux, q.y - hh, q.z - hw * uz],
        [q.x - hw * ux, q.y + hh, q.z - hw * uz],
        [q.x + hw * ux, q.y + hh, q.z + hw * uz],
      ];
      n = [nx, 0, nz];
    }
    const [u0, v0, u1, v1] = q.uv;
    corners.forEach((c) => {
      pos.push(...c);
      nor.push(...n);
    });
    uv.push(u0, v0, u1, v0, u1, v1, u0, v1);
    const o = i * 4;
    idx.push(o, o + 1, o + 2, o, o + 2, o + 3);
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

function buildTemplate(v: VariantData): Template {
  const signs = quads(
    v.signs.map((s) => {
      const col = s.slot % SIGN_COLS;
      const row = Math.floor(s.slot / SIGN_COLS);
      // the canvas is drawn top-down; flipY puts row 0 at the top of the texture
      const u0 = col / SIGN_COLS;
      const v1 = 1 - row / SIGN_ROWS;
      return { x: s.x, y: s.y, z: s.z, w: s.w, h: s.h, ry: s.ry, uv: [u0, v1 - 1 / SIGN_ROWS, u0 + 1 / SIGN_COLS, v1] as [number, number, number, number] };
    }),
  );
  const rangolis = quads(
    v.rangolis.map((r) => {
      const i = r.seed % RANGOLI_N;
      const u0 = (i % 2) / 2;
      const v0 = 1 - (Math.floor(i / 2) + 1) / 2;
      return { x: r.x, y: 0.025, z: r.z, w: r.size, h: r.size, ry: 0, flat: true, uv: [u0, v0, u0 + 0.5, v0 + 0.5] as [number, number, number, number] };
    }),
  );
  // paving uses world-space uvs so the stones line up across chunks
  const pave = quads(v.pave.map((p) => ({ x: (p.x0 + p.x1) / 2, y: 0.012, z: (p.z0 + p.z1) / 2, w: p.x1 - p.x0, h: p.z1 - p.z0, ry: 0, flat: true, uv: [p.x0 / 2.4, -p.z1 / 2.4, p.x1 / 2.4, -p.z0 / 2.4] as [number, number, number, number] })));
  return { shell: layers(v.shell), detail: layers(v.detail), glow: layers(v.glow, 1.7), points: pointsGeometry(v), signs, rangolis, pave };
}

export const pointsVert = /* glsl */ `
attribute vec3 aColor;
attribute float aSize;
attribute float aTw;
attribute float aSeed;
uniform float uTime;
uniform float uPx;
uniform float uFar;
varying vec3 vColor;
varying float vA;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  float k = 1.0;
  if (aTw > 0.5 && aTw < 1.5) k = 0.6 + 0.4 * sin(uTime * (1.3 + aSeed * 2.2) + aSeed * 40.0);
  else if (aTw > 1.5) k = 0.82 + 0.18 * sin(uTime * 13.0 + aSeed * 50.0) * sin(uTime * 7.3 + aSeed * 20.0);
  float depth = -mv.z;
  // fade into the haze at the far end of the gali
  vA = k * (1.0 - smoothstep(uFar * 0.55, uFar, depth));
  vColor = aColor;
  gl_PointSize = clamp(aSize * 0.55 * uPx / max(depth, 0.5), 1.5, 90.0);
}`;
export const pointsFrag = /* glsl */ `
varying vec3 vColor;
varying float vA;
uniform float uIntensity;
void main() {
  float d = length(gl_PointCoord - 0.5) * 2.0;
  if (d > 1.0 || vA <= 0.0) discard;
  float a = pow(1.0 - d, 2.2);
  float core = smoothstep(0.28, 0.0, d);
  gl_FragColor = vec4((vColor * a + vec3(core) * 0.7) * vA * uIntensity, 1.0);
}`;

export const glowUniforms = { uTime: { value: 0 }, uPx: { value: 800 }, uIntensity: { value: 1 }, uFar: { value: 110 } };

interface Mats {
  solid: THREE.Material;
  glow: THREE.MeshBasicMaterial;
  points: THREE.ShaderMaterial;
  sign: THREE.MeshBasicMaterial;
  rangoli: THREE.Material;
  pave: THREE.Material;
}

function makeSlot(t: Template, mats: Mats) {
  const group = new THREE.Group();
  const lod: THREE.Object3D[] = [];
  const fairy: THREE.Object3D[] = [];
  const add = (ls: Layer[], mat: THREE.Material, near: boolean) => {
    for (const l of ls) {
      const m = new THREE.InstancedMesh(GEOS[l.shape], mat, l.count);
      m.instanceMatrix = l.matrix;
      m.instanceColor = l.color;
      m.boundingSphere = l.sphere.clone();
      m.raycast = () => {};
      m.matrixAutoUpdate = false;
      group.add(m);
      if (near) lod.push(m);
    }
  };
  add(t.shell, mats.solid, false);
  add(t.glow, mats.glow, false);
  add(t.detail, mats.solid, true);
  const flat = (g: THREE.BufferGeometry | null, mat: THREE.Material, list?: THREE.Object3D[], order = 0) => {
    if (!g) return;
    const m = new THREE.Mesh(g, mat);
    m.raycast = () => {};
    m.matrixAutoUpdate = false;
    m.renderOrder = order;
    group.add(m);
    list?.push(m);
  };
  flat(t.pave, mats.pave);
  flat(t.rangolis, mats.rangoli, lod, 1);
  flat(t.signs, mats.sign);
  if (t.points) {
    const p = new THREE.Points(t.points, mats.points);
    p.raycast = () => {};
    p.renderOrder = 5;
    group.add(p);
    fairy.push(p);
  }
  return { group, lod, fairy };
}

/** Every variant's template, built once (the debug hook and tests read them too). */
let templates: Record<VariantKind, Template> | null = null;
export function getTemplates() {
  if (!templates) {
    const V = getVariants();
    templates = Object.fromEntries(VARIANTS.map((k) => [k, buildTemplate(V[k])])) as Record<VariantKind, Template>;
  }
  return templates;
}

export function StreetChunks() {
  const graphics = useGame((s) => s.settings.graphics);
  const stage = useGame((s) => s.stage());
  const root = useRef<THREE.Group>(null!);
  const { size, gl } = useThree();
  const high = graphics === 'high';

  const mats = useMemo<Mats>(() => {
    const solid = high ? new THREE.MeshStandardMaterial({ roughness: 0.86, metalness: 0 }) : new THREE.MeshLambertMaterial();
    const glow = new THREE.MeshBasicMaterial({ toneMapped: false });
    const points = new THREE.ShaderMaterial({ vertexShader: pointsVert, fragmentShader: pointsFrag, uniforms: glowUniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    const sign = new THREE.MeshBasicMaterial({ map: signAtlas(), toneMapped: false, color: new THREE.Color(1.15, 1.15, 1.15) });
    const rangoli = new THREE.MeshLambertMaterial({ map: rangoliAtlas(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    const pave = new THREE.MeshLambertMaterial({ map: pavingTexture(), polygonOffset: true, polygonOffsetFactor: -1 });
    return { solid, glow, points, sign, rangoli, pave };
  }, [high]);
  useEffect(() => () => Object.values(mats).forEach((m) => m.dispose()), [mats]);

  const slots = useRef(new Map<number, ReturnType<typeof makeSlot>>());
  // rebuild slots when the materials change (graphics toggle)
  useEffect(() => {
    const map = slots.current;
    map.forEach((s) => root.current?.remove(s.group));
    map.clear();
  }, [mats]);

  useFrame((st) => {
    const T = getTemplates();
    const g = root.current;
    const kp = chunkOf(runtime.player.x);
    const range = high ? 3 : 2;
    const map = slots.current;
    for (const [k, s] of map) {
      if (Math.abs(k - kp) > range + 1) {
        g.remove(s.group);
        map.delete(k);
      }
    }
    for (let k = kp - range; k <= kp + range; k++) {
      let s = map.get(k);
      if (!s) {
        s = makeSlot(T[variantAt(k)], mats);
        s.group.position.x = k * C;
        s.group.updateMatrixWorld(true);
        g.add(s.group);
        map.set(k, s);
      }
      const dk = Math.abs(k - kp);
      s.group.visible = dk <= range;
      const near = dk <= 1;
      s.lod.forEach((o) => (o.visible = near));
      s.fairy.forEach((o) => (o.visible = dk <= (high ? 2 : 1)));
    }
    const cam = st.camera as THREE.PerspectiveCamera;
    glowUniforms.uTime.value = st.clock.elapsedTime;
    glowUniforms.uPx.value = (size.height * gl.getPixelRatio()) / (2 * Math.tan(THREE.MathUtils.degToRad((cam.fov ?? 60) / 2)));
    // the mohalla glows brighter as more of it celebrates
    glowUniforms.uIntensity.value = (runtime.composer ? 1.6 : 1.1) * (0.8 + 0.25 * (stage / 8));
  });

  return (
    <group ref={root}>
      <Ground />
    </group>
  );
}

/** One big asphalt plane that follows the player, its texture locked to world space. */
function Ground() {
  const mesh = useRef<THREE.Mesh>(null!);
  const tex = useMemo(() => {
    const t = asphaltTexture().clone();
    t.needsUpdate = true;
    t.repeat.set(320 / 8, 320 / 8);
    return t;
  }, []);
  useFrame(() => {
    const m = mesh.current;
    const x = Math.round(runtime.player.x / 8) * 8;
    const z = Math.round(runtime.player.z / 8) * 8;
    m.position.set(x, 0, z);
    tex.offset.set(x / 8, -z / 8);
  });
  return (
    <mesh ref={mesh} rotation-x={-Math.PI / 2} receiveShadow name="ground">
      <planeGeometry args={[320, 320]} />
      <meshStandardMaterial map={tex} roughness={0.92} metalness={0} color="#c9c4cf" />
    </mesh>
  );
}
