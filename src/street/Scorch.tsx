import { useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { Vec3 } from '../assets/AssetRegistry';
import { poolTexture, scorchTexture } from './StreetTextures';

// Marks a burst leaves on the ground: a scorch of burnt powder and paper shreds that slowly
// fades, and a quick flash of light on the road at the moment of the burst. Both are pooled.

const SCORCH = 28;
const FLASH = 8;
const LIFE = 40;

interface Mark {
  mesh: THREE.Mesh;
  age: number;
  life: number;
  peak: number;
}

const scorches: Mark[] = [];
const flashes: Mark[] = [];
let nextS = 0;
let nextF = 0;

export const groundMarks = {
  /** a scorch mark that fades over ~40 s */
  scorch(pos: Vec3, size: number, strength = 0.85) {
    const m = scorches[nextS++ % SCORCH];
    if (!m) return;
    m.mesh.position.set(pos[0], 0.02 + (nextS % 7) * 0.0015, pos[2]);
    m.mesh.rotation.z = Math.random() * Math.PI * 2;
    m.mesh.scale.setScalar(size);
    m.age = 0;
    m.life = LIFE;
    m.peak = strength;
    m.mesh.visible = true;
  },
  /** a short, bright pool of light on the ground */
  flash(pos: Vec3, size: number, color: THREE.ColorRepresentation, strength = 1, life = 0.6) {
    const m = flashes[nextF++ % FLASH];
    if (!m) return;
    m.mesh.position.set(pos[0], 0.03, pos[2]);
    m.mesh.scale.setScalar(size);
    (m.mesh.material as THREE.MeshBasicMaterial).color.set(color);
    m.age = 0;
    m.life = life;
    m.peak = strength;
    m.mesh.visible = true;
  },
  clear() {
    [...scorches, ...flashes].forEach((m) => (m.mesh.visible = false));
  },
};

export function Scorch() {
  const group = useMemo(() => {
    const g = new THREE.Group();
    const geo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    scorches.length = 0;
    flashes.length = 0;
    for (let i = 0; i < SCORCH; i++) {
      const mat = new THREE.MeshLambertMaterial({ map: scorchTexture(), transparent: true, depthWrite: false, opacity: 0, polygonOffset: true, polygonOffsetFactor: -4 });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.rotation.order = 'YXZ';
      mesh.visible = false;
      mesh.renderOrder = 3;
      mesh.raycast = () => {};
      g.add(mesh);
      scorches.push({ mesh, age: 0, life: LIFE, peak: 0 });
    }
    for (let i = 0; i < FLASH; i++) {
      const mat = new THREE.MeshBasicMaterial({ map: poolTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -5 });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.visible = false;
      mesh.renderOrder = 4;
      mesh.raycast = () => {};
      g.add(mesh);
      flashes.push({ mesh, age: 0, life: 1, peak: 0 });
    }
    return g;
  }, []);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    for (const m of scorches) {
      if (!m.mesh.visible) continue;
      m.age += dt;
      const k = m.age / m.life;
      if (k >= 1) {
        m.mesh.visible = false;
        continue;
      }
      // darkens in quickly, then fades away
      const a = Math.min(1, m.age / 0.4) * (1 - Math.pow(k, 1.6));
      (m.mesh.material as THREE.MeshLambertMaterial).opacity = a * m.peak;
    }
    for (const m of flashes) {
      if (!m.mesh.visible) continue;
      m.age += dt;
      const k = m.age / m.life;
      if (k >= 1) {
        m.mesh.visible = false;
        continue;
      }
      (m.mesh.material as THREE.MeshBasicMaterial).opacity = (1 - k) * (1 - k) * m.peak;
    }
  });

  return <primitive object={group} />;
}
