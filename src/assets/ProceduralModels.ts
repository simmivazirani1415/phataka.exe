import * as THREE from 'three';
import type { CrackerType, UVQuad } from './AssetRegistry';

const RECT: UVQuad = [[0, 0], [1, 0], [1, 1], [0, 1]];

type P3 = [number, number, number];

/**
 * A slice (y0..y1 as fractions of h) of a box that can taper towards the top.
 * Material groups follow BoxGeometry order: +x, -x, +y, -y, +z (front), -z (back).
 * The front face UVs follow `frontUV`, so a trapezoid artwork maps onto a frustum face.
 */
export function makeBoxPiece(w: number, h: number, d: number, taper: number, f0: number, f1: number, frontUV: UVQuad = RECT) {
  const k = (f: number) => 1 - (1 - taper) * f;
  const y0 = f0 * h;
  const y1 = f1 * h;
  const hw0 = (w / 2) * k(f0);
  const hw1 = (w / 2) * k(f1);
  const hd0 = (d / 2) * k(f0);
  const hd1 = (d / 2) * k(f1);
  const lerp2 = (a: [number, number], b: [number, number], t: number): [number, number] => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  const [BL, BR, TR, TL] = frontUV;
  const rect = (u0: number, v0: number, u1: number, v1: number): [number, number][] => [[u0, v0], [u1, v0], [u1, v1], [u0, v1]];

  const faces: { v: P3[]; uv: [number, number][] }[] = [
    // +x
    { v: [[hw0, y0, hd0], [hw0, y0, -hd0], [hw1, y1, -hd1], [hw1, y1, hd1]], uv: rect(0, f0, 1, f1) },
    // -x
    { v: [[-hw0, y0, -hd0], [-hw0, y0, hd0], [-hw1, y1, hd1], [-hw1, y1, -hd1]], uv: rect(0, f0, 1, f1) },
    // +y
    { v: [[-hw1, y1, hd1], [hw1, y1, hd1], [hw1, y1, -hd1], [-hw1, y1, -hd1]], uv: rect(0, 0, 1, 1) },
    // -y
    { v: [[-hw0, y0, -hd0], [hw0, y0, -hd0], [hw0, y0, hd0], [-hw0, y0, hd0]], uv: rect(0, 0, 1, 1) },
    // +z front
    {
      v: [[-hw0, y0, hd0], [hw0, y0, hd0], [hw1, y1, hd1], [-hw1, y1, hd1]],
      uv: [lerp2(BL, TL, f0), lerp2(BR, TR, f0), lerp2(BR, TR, f1), lerp2(BL, TL, f1)],
    },
    // -z back
    { v: [[hw0, y0, -hd0], [-hw0, y0, -hd0], [-hw1, y1, -hd1], [hw1, y1, -hd1]], uv: rect(0, f0, 1, f1) },
  ];
  const pos: number[] = [];
  const uvs: number[] = [];
  const idx: number[] = [];
  const g = new THREE.BufferGeometry();
  faces.forEach((f, i) => {
    const o = i * 4;
    f.v.forEach((p) => pos.push(...p));
    f.uv.forEach((u) => uvs.push(...u));
    idx.push(o, o + 1, o + 2, o, o + 2, o + 3);
    g.addGroup(i * 6, 6, i);
  });
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// ---------------------------------------------------------------------------
// Simplified 3D crackers revealed inside each box and used by the effects.

const matCache = new Map<string, THREE.MeshStandardMaterial>();
export function paint(color: string, rough = 0.6, metal = 0, emissive?: string) {
  const key = color + rough + metal + (emissive ?? '');
  let m = matCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });
    if (emissive) {
      m.emissive = new THREE.Color(emissive);
      m.emissiveIntensity = 0.8;
    }
    matCache.set(key, m);
  }
  return m;
}

function mesh(geo: THREE.BufferGeometry, mat: THREE.Material, p: P3 = [0, 0, 0], r: P3 = [0, 0, 0]) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(...p);
  m.rotation.set(...r);
  m.castShadow = true;
  return m;
}

export function createCrackerModel(type: CrackerType, palette: string[]): THREE.Group {
  const g = new THREE.Group();
  const [a, b, c] = palette;
  switch (type) {
    case 'rocket': {
      g.add(mesh(new THREE.BoxGeometry(0.025, 0.7, 0.025), paint('#C9A36A', 0.9), [0, 0.35, 0]));
      g.add(mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.28, 12), paint(a, 0.5, 0.1), [0.07, 0.62, 0]));
      g.add(mesh(new THREE.CylinderGeometry(0.062, 0.062, 0.06, 12), paint(c, 0.4, 0.4), [0.07, 0.56, 0]));
      g.add(mesh(new THREE.ConeGeometry(0.065, 0.14, 12), paint(b, 0.5), [0.07, 0.83, 0]));
      break;
    }
    case 'bomb': {
      g.add(mesh(new THREE.SphereGeometry(0.17, 16, 12), paint('#1F5B3A', 0.55), [0, 0.17, 0]));
      g.add(mesh(new THREE.TorusGeometry(0.172, 0.022, 6, 24), paint('#C4302B', 0.5), [0, 0.17, 0], [Math.PI / 2, 0, 0]));
      const fuse = mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.16, 6), paint('#E3B23C', 0.8), [0.03, 0.39, 0], [0, 0, -0.4]);
      g.add(fuse);
      break;
    }
    case 'chakri': {
      g.add(mesh(new THREE.TorusGeometry(0.2, 0.06, 8, 28), paint(a, 0.5), [0, 0.07, 0], [Math.PI / 2, 0, 0]));
      g.add(mesh(new THREE.TorusGeometry(0.13, 0.035, 8, 24), paint(b, 0.5), [0, 0.07, 0], [Math.PI / 2, 0, 0]));
      g.add(mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.06, 12), paint(c, 0.5), [0, 0.07, 0]));
      break;
    }
    case 'sparkler': {
      for (let i = 0; i < 3; i++) {
        const s = mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.75, 6), paint('#8D8F97', 0.4, 0.6), [(i - 1) * 0.05, 0.375, 0], [0, 0, (i - 1) * 0.12]);
        g.add(s);
      }
      g.add(mesh(new THREE.BoxGeometry(0.16, 0.1, 0.05), paint(a, 0.6), [0, 0.05, 0]));
      break;
    }
    case 'anaar': {
      g.add(mesh(new THREE.CylinderGeometry(0.045, 0.17, 0.38, 14), paint('#B5683F', 0.9), [0, 0.19, 0]));
      g.add(mesh(new THREE.CylinderGeometry(0.11, 0.15, 0.11, 14), paint(a, 0.6), [0, 0.12, 0]));
      g.add(mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.05, 6), paint('#3A2A1A', 0.9), [0, 0.4, 0]));
      break;
    }
    case 'ladi': {
      const n = 12;
      for (let i = 0; i < n; i++) {
        const side = i % 2 ? 1 : -1;
        g.add(mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.12, 8), paint(i % 3 === 0 ? b : a, 0.55), [side * 0.05, 0.05 + i * 0.045, 0], [0, 0, side * 1.1]));
      }
      g.add(mesh(new THREE.CylinderGeometry(0.006, 0.006, n * 0.045, 4), paint('#E3D7B0', 0.9), [0, 0.05 + (n * 0.045) / 2, 0]));
      break;
    }
    case 'snake': {
      for (let i = 0; i < 3; i++) g.add(mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.04, 14), paint('#262019', 0.95), [(i - 1) * 0.14, 0.02, 0]));
      break;
    }
    case 'popPop': {
      for (let i = 0; i < 7; i++) {
        const ang = (i / 7) * Math.PI * 2;
        g.add(mesh(new THREE.SphereGeometry(0.045, 8, 6), paint(i % 2 ? a : b, 0.7), [Math.cos(ang) * 0.1, 0.05 + (i % 3) * 0.03, Math.sin(ang) * 0.1]));
      }
      break;
    }
  }
  return g;
}
