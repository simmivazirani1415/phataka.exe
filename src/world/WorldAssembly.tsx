import { useEffect, useMemo, useRef } from 'react';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { BLOCK_DURATION, PHASES, type Block, type BlockMat, type BlockShape } from './BlockBuilder';
import { getWorld } from './WorldBuilder';
import { runtime } from '../game/Runtime';
import { useGame } from '../game/GameState';
import { audio } from '../audio/AudioEngine';
import { closeActive } from '../game/DiscoverySystem';

// Renders every Block through a handful of InstancedMeshes. One shared clock uniform
// drives the whole construction animation in the vertex shader, so thousands of blocks
// assemble without thousands of tweens.

export const assemblyUniforms = {
  uTime: { value: 0 },
  uDur: { value: BLOCK_DURATION },
  uGhost: { value: 1 },
};

const HIDDEN_DELAY = 1e6;

// Live instanced groups, so the intro ident can re-time one building's assembly.
interface Registered {
  group: Group;
  mesh: THREE.InstancedMesh;
}
const registry = new Set<Registered>();

export interface AssemblyOverride {
  delay: number;
  offset: [number, number, number];
}

/**
 * Re-times the assembly of selected blocks (blocks with an appearStage are left alone).
 * `fn` returns new timing for a block, or null to keep it. Passing null restores every block.
 */
export function overrideAssembly(fn: ((b: Block, index: number) => AssemblyOverride | null) | null) {
  for (const { group, mesh } of registry) {
    const dAttr = mesh.geometry.getAttribute('aDelay') as THREE.InstancedBufferAttribute;
    const oAttr = mesh.geometry.getAttribute('aOffset') as THREE.InstancedBufferAttribute;
    const d = dAttr.array as Float32Array;
    const o = oAttr.array as Float32Array;
    let changed = false;
    group.blocks.forEach((b, i) => {
      if (b.appearStage) return;
      const ov = fn ? fn(b, i) : null;
      const delay = ov ? ov.delay : b.delay;
      const off = ov ? ov.offset : b.offset;
      if (d[i] !== delay || o[i * 3] !== off[0] || o[i * 3 + 1] !== off[1] || o[i * 3 + 2] !== off[2]) {
        d[i] = delay;
        o.set(off, i * 3);
        changed = true;
      }
    });
    if (changed) {
      dAttr.needsUpdate = true;
      oAttr.needsUpdate = true;
    }
  }
}

const VERT_HEAD = /* glsl */ `
uniform float uTime;
uniform float uDur;
uniform float uGhost;
attribute vec3 aOffset;
attribute float aDelay;
varying vec3 vAsmW;
#ifdef ASM_NORMAL
varying vec3 vAsmN;
#endif
float asmBack(float t) { float c1 = 1.25; float c3 = c1 + 1.0; return 1.0 + c3 * pow(t - 1.0, 3.0) + c1 * pow(t - 1.0, 2.0); }
`;

const VERT_PROJECT = /* glsl */ `
vec4 mvPosition = vec4(transformed, 1.0);
vec3 asmC = vec3(0.0);
#ifdef USE_INSTANCING
mvPosition = instanceMatrix * mvPosition;
asmC = instanceMatrix[3].xyz;
#endif
float asmT = clamp((uTime - aDelay) / uDur, 0.0, 1.0);
float asmE = asmBack(asmT);
float asmS = smoothstep(0.0, 0.28, asmT);
float asmVisible = step(aDelay, 1000.0);
float asmSc = max(asmS, uGhost * asmVisible);
vec3 asmOff = aOffset * mix(1.0 - asmE, 0.32, uGhost);
// blocks rising from below never overshoot up through the ground
if (aOffset.y < 0.0) asmOff.y = aOffset.y * mix(max(0.0, 1.0 - asmE), 0.32, uGhost);
mvPosition.xyz = asmC + (mvPosition.xyz - asmC) * asmSc + asmOff;
vAsmW = (modelMatrix * mvPosition).xyz;
#ifdef ASM_NORMAL
vAsmN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * objectNormal);
#endif
mvPosition = modelViewMatrix * mvPosition;
gl_Position = projectionMatrix * mvPosition;
`;

const FRAG_HEAD = /* glsl */ `
uniform float uGhost;
varying vec3 vAsmW;
#ifdef ASM_NORMAL
varying vec3 vAsmN;
#endif
`;

const FRAG_COLOR = /* glsl */ `
#ifdef ASM_GRAIN
float asmG = fract(sin(dot(floor(vAsmW * 10.0), vec3(12.9898, 78.233, 37.719))) * 43758.5453);
diffuseColor.rgb *= 0.955 + 0.07 * asmG;
#endif
#ifdef ASM_SEAMS
if (vAsmN.y > 0.9) {
  vec2 asmF = abs(fract(vAsmW.xz) - 0.5);
  diffuseColor.rgb *= 1.0 - smoothstep(0.465, 0.5, max(asmF.x, asmF.y)) * 0.22;
}
#endif
#ifdef ASM_TILES
float asmRow = abs(fract(vAsmW.y * 5.0 + vAsmW.x * 0.0) - 0.5);
diffuseColor.rgb *= 0.9 + 0.12 * smoothstep(0.0, 0.25, asmRow);
#endif
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.045, 0.07, 0.15), uGhost * 0.92);
`;

function patch(material: THREE.Material, defines: Record<string, string>) {
  material.defines = { ...(material.defines ?? {}), ...defines };
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = assemblyUniforms.uTime;
    shader.uniforms.uDur = assemblyUniforms.uDur;
    shader.uniforms.uGhost = assemblyUniforms.uGhost;
    shader.vertexShader = VERT_HEAD + shader.vertexShader.replace('#include <project_vertex>', VERT_PROJECT);
    shader.fragmentShader = FRAG_HEAD + shader.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\n' + FRAG_COLOR);
  };
  material.customProgramCacheKey = () => 'asm' + JSON.stringify(defines);
  return material;
}

function makeMaterial(mat: BlockMat): THREE.Material {
  const std = (p: THREE.MeshStandardMaterialParameters, defines: Record<string, string> = {}) =>
    patch(new THREE.MeshStandardMaterial(p), { ASM_NORMAL: '', ASM_GRAIN: '', ...defines });
  switch (mat) {
    case 'paint':
      return std({ roughness: 0.86, metalness: 0 });
    case 'stone':
      return std({ roughness: 0.95, metalness: 0 }, { ASM_SEAMS: '' });
    case 'tile':
      return std({ roughness: 0.8, metalness: 0 }, { ASM_TILES: '' });
    case 'wood':
      return std({ roughness: 0.74, metalness: 0 });
    case 'metal':
      return std({ roughness: 0.42, metalness: 0.55 });
    case 'leaf':
      return std({ roughness: 0.9, metalness: 0, flatShading: true });
    case 'clay':
    case 'diya':
      return std({ roughness: 1, metalness: 0 });
    case 'fabric':
      return std({ roughness: 1, metalness: 0 });
    case 'tank':
      return std({ roughness: 0.45, metalness: 0.1 });
    case 'glass':
    case 'glow':
      return patch(new THREE.MeshBasicMaterial({ toneMapped: false }), {});
  }
}

function triGeometry() {
  // triangular prism: base on y=-0.5, apex at y=+0.5, extruded along z
  const shape = new THREE.Shape();
  shape.moveTo(-0.5, -0.5);
  shape.lineTo(0.5, -0.5);
  shape.lineTo(0, 0.5);
  shape.closePath();
  const g = new THREE.ExtrudeGeometry(shape, { depth: 1, bevelEnabled: false });
  g.translate(0, 0, -0.5);
  return g;
}

let geoCache: Record<string, THREE.BufferGeometry> | null = null;
function geometries() {
  if (geoCache) return geoCache;
  geoCache = {
    box: new RoundedBoxGeometry(1, 1, 1, 1, 0.06),
    sharp: new THREE.BoxGeometry(1, 1, 1),
    cyl: new THREE.CylinderGeometry(0.5, 0.5, 1, 14),
    tri: triGeometry(),
    sphere: new THREE.IcosahedronGeometry(0.5, 1),
  };
  return geoCache;
}

const geoKey = (b: Block) => (b.shape === 'box' ? (b.bevel > 0.025 ? 'box' : 'sharp') : (b.shape as Exclude<BlockShape, 'box'>));

interface Group {
  key: string;
  mat: BlockMat;
  blocks: Block[];
  lightAt?: Float32Array;
  lit?: Uint8Array;
}

const EMISSIVE: BlockMat[] = ['glass', 'glow'];

export function WorldBlocks() {
  const world = getWorld();
  const groups = useMemo(() => {
    const map = new Map<string, Group>();
    for (const b of world.blocks) {
      const key = `${b.mat}|${geoKey(b)}`;
      if (!map.has(key)) map.set(key, { key, mat: b.mat, blocks: [] });
      map.get(key)!.blocks.push(b);
    }
    const out = [...map.values()];
    for (const g of out) {
      if (EMISSIVE.includes(g.mat)) {
        const [l0, l1] = PHASES.lights;
        g.lightAt = new Float32Array(g.blocks.map((b) => l0 + ((b.x + 24) / 48) * (l1 - l0) + Math.random() * 0.3));
        g.lit = new Uint8Array(g.blocks.length);
      }
    }
    return out;
  }, [world]);

  return (
    <group>
      {groups.map((g) => (
        <BlockGroup key={g.key} group={g} />
      ))}
    </group>
  );
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();
const _box = new THREE.Box3();
const _hit = new THREE.Vector3();

function BlockGroup({ group }: { group: Group }) {
  const mesh = useMemo(() => {
    const geo = geometries()[group.key.split('|')[1]];
    const material = makeMaterial(group.mat);
    const n = group.blocks.length;
    const mesh = new THREE.InstancedMesh(geo, material, n);
    const offsets = new Float32Array(n * 3);
    const delays = new Float32Array(n);
    const aabbs = new Float32Array(n * 6);
    group.blocks.forEach((b, i) => {
      _p.set(b.x, b.y, b.z);
      _q.setFromEuler(_e.set(b.rx, b.ry, b.rz));
      _s.set(Math.max(0.001, b.w), Math.max(0.001, b.h), Math.max(0.001, b.d));
      _m.compose(_p, _q, _s);
      mesh.setMatrixAt(i, _m);
      _c.set(b.color);
      mesh.setColorAt(i, _c);
      offsets.set(b.offset, i * 3);
      delays[i] = b.appearStage ? HIDDEN_DELAY : b.delay;
      _box.set(new THREE.Vector3(-0.5, -0.5, -0.5), new THREE.Vector3(0.5, 0.5, 0.5)).applyMatrix4(_m);
      aabbs.set([_box.min.x, _box.min.y, _box.min.z, _box.max.x, _box.max.y, _box.max.z], i * 6);
    });
    mesh.geometry = geo.clone();
    mesh.geometry.setAttribute('aOffset', new THREE.InstancedBufferAttribute(offsets, 3));
    mesh.geometry.setAttribute('aDelay', new THREE.InstancedBufferAttribute(delays, 1));
    mesh.frustumCulled = false;
    mesh.receiveShadow = group.mat !== 'glass' && group.mat !== 'glow';
    mesh.castShadow = false;
    // Cheap analytic raycast against per-instance bounding boxes (used only for occlusion
    // and diya clicks), instead of testing every triangle of every instance.
    mesh.raycast = (raycaster, intersects) => {
      const ray = raycaster.ray;
      const dAttr = mesh.geometry.getAttribute('aDelay') as THREE.InstancedBufferAttribute;
      for (let i = 0; i < n; i++) {
        if ((dAttr.array as Float32Array)[i] > 1000) continue;
        _box.min.set(aabbs[i * 6], aabbs[i * 6 + 1], aabbs[i * 6 + 2]);
        _box.max.set(aabbs[i * 6 + 3], aabbs[i * 6 + 4], aabbs[i * 6 + 5]);
        if (ray.intersectBox(_box, _hit)) {
          const distance = ray.origin.distanceTo(_hit);
          if (distance < raycaster.near || distance > raycaster.far) continue;
          intersects.push({ distance, point: _hit.clone(), object: mesh, instanceId: i });
        }
      }
    };
    return mesh;
  }, [group]);

  useEffect(() => {
    const entry = { group, mesh };
    registry.add(entry);
    return () => {
      registry.delete(entry);
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
      mesh.dispose();
    };
  }, [mesh, group]);

  const graphics = useGame((s) => s.settings.graphics);
  useEffect(() => {
    mesh.castShadow = !['glass', 'glow', 'stone', 'diya'].includes(group.mat) && graphics === 'high';
  }, [graphics, mesh, group.mat]);

  // progression: hidden blocks appear, emissive blocks light up
  const stage = useGame((s) => Object.values(s.packages).filter((p) => p === 'MEMORY_CAPTURED').length);
  const stageRef = useRef(stage);
  useEffect(() => {
    stageRef.current = stage;
    const attr = mesh.geometry.getAttribute('aDelay') as THREE.InstancedBufferAttribute;
    let changed = false;
    group.blocks.forEach((b, i) => {
      if (!b.appearStage) return;
      const want = stage >= b.appearStage;
      const arr = attr.array as Float32Array;
      if (want && arr[i] > 1000) {
        arr[i] = Math.max(runtime.assemblyTime, b.delay) + i * 0.04;
        changed = true;
      } else if (!want && arr[i] < 1000) {
        arr[i] = HIDDEN_DELAY;
        changed = true;
      }
    });
    if (changed) attr.needsUpdate = true;
  }, [stage, group, mesh]);

  const acc = useRef(0);
  useFrame((_, dt) => {
    if (!group.lit || !group.lightAt) return;
    acc.current += dt;
    if (acc.current < 0.08) return;
    acc.current = 0;
    let dirty = false;
    const t = runtime.assemblyTime;
    for (let i = 0; i < group.blocks.length; i++) {
      const b = group.blocks[i];
      const want = t >= group.lightAt[i] && stageRef.current >= (b.stage ?? 0) ? 1 : 0;
      if (want !== group.lit[i]) {
        group.lit[i] = want;
        _c.set(want && b.litColor ? b.litColor : b.color);
        mesh.setColorAt(i, _c);
        dirty = true;
      }
    }
    if (dirty && mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  });

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    if (e.delta > 8) return;
    // tapping the world outside a presented package puts it back
    if (useGame.getState().active) {
      closeActive();
      return;
    }
    if (group.mat === 'diya' && e.instanceId !== undefined) {
      const d = getWorld().diyas[e.instanceId];
      if (d) {
        runtime.diyaBoost.set(d.glow, performance.now());
        audio.ting();
      }
    }
  };

  return (
    <primitive
      object={mesh}
      onClick={onClick}
      onPointerOver={(e: ThreeEvent<PointerEvent>) => {
        e.stopPropagation();
        if (group.mat === 'diya') document.body.style.cursor = 'pointer';
      }}
      onPointerOut={() => {
        if (group.mat === 'diya') document.body.style.cursor = '';
      }}
    />
  );
}
