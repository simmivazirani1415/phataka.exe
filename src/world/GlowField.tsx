import { useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { getWorld } from './WorldBuilder';
import { PHASES } from './BlockBuilder';
import { runtime } from '../game/Runtime';
import { useGame } from '../game/GameState';

// All decorative light (diyas, fairy lights, lanterns, lamps) is drawn as camera-facing
// additive sprites in one instanced draw call. No per-diya point lights.

const vert = /* glsl */ `
attribute vec3 aColor;
attribute float aSize;
attribute float aPhase;
attribute float aFlicker;
attribute float aOn;
uniform float uTime;
varying vec3 vColor;
varying float vI;
varying vec2 vUv;
void main() {
  vec4 c = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  float fl = 1.0 + aFlicker * (sin(uTime * 9.0 + aPhase * 13.0) * 0.55 + sin(uTime * 23.0 + aPhase * 7.0) * 0.3);
  c.xy += position.xy * aSize * (0.88 + 0.12 * fl) * (0.6 + 0.4 * min(aOn, 1.6));
  c.z += 0.25;
  gl_Position = projectionMatrix * c;
  vI = aOn * fl;
  vColor = aColor;
  vUv = uv;
}`;

const frag = /* glsl */ `
varying vec3 vColor;
varying float vI;
varying vec2 vUv;
uniform float uGlobal;
void main() {
  float d = length(vUv - 0.5) * 2.0;
  if (d > 1.0) discard;
  float halo = pow(1.0 - d, 2.4) * 0.75;
  float core = smoothstep(0.22, 0.0, d);
  vec3 col = vColor * halo + mix(vColor, vec3(1.0, 0.97, 0.88), 0.6) * core;
  gl_FragColor = vec4(col * vI * uGlobal, 1.0);
}`;

export const glowUniforms = { uTime: { value: 0 }, uGlobal: { value: 1 } };

export function GlowField() {
  const world = getWorld();
  const n = world.glows.length;
  const { mesh, on, lightAt } = useMemo(() => {
    const geo = new THREE.PlaneGeometry(1, 1);
    const mat = new THREE.ShaderMaterial({
      vertexShader: vert,
      fragmentShader: frag,
      uniforms: glowUniforms,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const mesh = new THREE.InstancedMesh(geo, mat, n);
    const colors = new Float32Array(n * 3);
    const sizes = new Float32Array(n);
    const phases = new Float32Array(n);
    const flick = new Float32Array(n);
    const on = new Float32Array(n);
    const lightAt = new Float32Array(n);
    const m = new THREE.Matrix4();
    const c = new THREE.Color();
    world.glows.forEach((g, i) => {
      m.makeTranslation(g.pos[0], g.pos[1], g.pos[2]);
      mesh.setMatrixAt(i, m);
      c.set(g.color);
      colors.set([c.r, c.g, c.b], i * 3);
      sizes[i] = g.size;
      phases[i] = Math.random() * 10;
      flick[i] = g.flicker;
      const [l0, l1] = PHASES.lights;
      lightAt[i] = l0 + ((g.pos[0] + 24) / 48) * (l1 - l0) + Math.random() * 0.4;
    });
    geo.setAttribute('aColor', new THREE.InstancedBufferAttribute(colors, 3));
    geo.setAttribute('aSize', new THREE.InstancedBufferAttribute(sizes, 1));
    geo.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phases, 1));
    geo.setAttribute('aFlicker', new THREE.InstancedBufferAttribute(flick, 1));
    const onAttr = new THREE.InstancedBufferAttribute(on, 1);
    onAttr.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aOn', onAttr);
    mesh.frustumCulled = false;
    mesh.renderOrder = 5;
    mesh.raycast = () => {};
    return { mesh, on, lightAt };
  }, [world, n]);

  useEffect(() => () => {
    mesh.geometry.dispose();
    (mesh.material as THREE.Material).dispose();
  }, [mesh]);

  const stringOf = useMemo(() => {
    const arr = new Int32Array(n).fill(-1);
    const idx = new Int32Array(n);
    world.strings.forEach((s) => {
      for (let k = 0; k < s.glowCount; k++) {
        arr[s.glowStart + k] = s.id;
        idx[s.glowStart + k] = k;
      }
    });
    return { arr, idx };
  }, [world, n]);

  useFrame((state, dt) => {
    const t = runtime.assemblyTime;
    const now = performance.now();
    glowUniforms.uTime.value = state.clock.elapsedTime;
    // with bloom on High graphics the glows run hotter than 1.0 so they spill light
    glowUniforms.uGlobal.value = (1 - runtime.ghost) * (runtime.composer ? 1.45 : 1) * (0.25 + 0.75 * runtime.intro.world);
    const stage = useGame.getState().stage();
    const k = Math.min(1, dt * 4);
    for (let i = 0; i < n; i++) {
      const g = world.glows[i];
      let target = t >= lightAt[i] && stage >= g.stage && stage >= g.appearStage ? 1 : 0;
      if (g.appearStage && stage >= g.appearStage && t < lightAt[i]) target = 0;
      const boost = runtime.diyaBoost.get(i);
      if (boost !== undefined) {
        const age = (now - boost) / 1000;
        if (age > 2.5) runtime.diyaBoost.delete(i);
        else target += 1.4 * Math.max(0, 1 - age / 2.5);
      }
      const sid = stringOf.arr[i];
      if (sid >= 0 && target > 0) {
        const chase = runtime.stringChase.get(sid);
        if (chase !== undefined) {
          const age = (now - chase) / 1000;
          if (age > 2.6) runtime.stringChase.delete(sid);
          else {
            const wave = Math.sin(stringOf.idx[i] * 0.9 - age * 14);
            target = 0.25 + Math.max(0, wave) * 1.5;
          }
        }
      }
      on[i] += (target - on[i]) * k;
    }
    (mesh.geometry.getAttribute('aOn') as THREE.InstancedBufferAttribute).needsUpdate = true;
  });

  return <primitive object={mesh} />;
}
