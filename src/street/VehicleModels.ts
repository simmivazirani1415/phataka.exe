import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// Simple low-poly 3D versions of the illustrated vehicles, coloured after Simran's art: the
// blue scooter with its marigold garland and rider, the pink bicycle with the flower basket,
// the green-and-yellow auto, the painted cycle-rickshaw and the green gift scooter. The
// illustrations are side views (the auto a three-quarter view), so these models take over
// whenever a vehicle is seen from the front, from behind or from high above.
// All models face +z, wheels on y = 0, baked vertex colours.

export type VehicleModel = 'scooter' | 'bicycle' | 'auto' | 'rickshaw' | 'parkedScooter';

function part(geo: THREE.BufferGeometry, color: string | number, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0) {
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  geo.dispose();
  g.rotateX(rx);
  g.rotateY(ry);
  g.rotateZ(rz);
  g.translate(x, y, z);
  const c = new THREE.Color(color);
  const n = g.getAttribute('position').count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.deleteAttribute('uv');
  return g;
}
const B = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
const CY = (r: number, h: number, s = 12, r2 = r) => new THREE.CylinderGeometry(r2, r, h, s);
const S = (r: number) => new THREE.IcosahedronGeometry(r, 1);
const TYRE = '#1c1c20';
const RIM = '#c9ccd2';
const SKIN = '#c98d68';
const HAIR = '#1d1714';
const MARIGOLD = ['#ff9a1f', '#ffc21a', '#ff7a12'];

class Builder {
  ps: THREE.BufferGeometry[] = [];
  add(geo: THREE.BufferGeometry, color: string, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0) {
    this.ps.push(part(geo, color, x, y, z, rx, ry, rz));
  }
  wheel(r: number, w: number, x: number, z: number, rim = RIM) {
    this.add(CY(r, w, 16), TYRE, x, r, z, 0, 0, Math.PI / 2);
    this.add(CY(r * 0.62, w + 0.01, 12), rim, x, r, z, 0, 0, Math.PI / 2);
    this.add(CY(r * 0.16, w + 0.03, 8), '#7d8088', x, r, z, 0, 0, Math.PI / 2);
  }
  /** a thin tube between two points */
  tube(a: [number, number, number], b: [number, number, number], r: number, color: string) {
    const d = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    const len = d.length();
    const g = CY(r, len, 6).toNonIndexed();
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
    g.applyQuaternion(q);
    this.add(g, color, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
  }
  /** a string of marigolds from a to b */
  garland(a: [number, number, number], b: [number, number, number], n: number, r = 0.045, sag = 0) {
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const y = a[1] + (b[1] - a[1]) * t - Math.sin(t * Math.PI) * sag;
      this.add(S(r), MARIGOLD[i % 3], a[0] + (b[0] - a[0]) * t, y, a[2] + (b[2] - a[2]) * t);
    }
  }
  /** a seated rider: hips at (0, hipY, hipZ), hands on a bar at (barY, barZ) */
  rider(o: { hipY: number; hipZ: number; barY: number; barZ: number; footY: number; footZ: number; top: string; legs: string; shoes: string; scale?: number; lean?: number; hair?: 'short' | 'long' | 'turban' }) {
    const k = o.scale ?? 1;
    const lean = o.lean ?? 0.08;
    // legs: thigh forward from the hip, shin down to the foot
    for (const sx of [-0.1, 0.1]) {
      this.tube([sx * k, o.hipY, o.hipZ], [sx * k, o.hipY + 0.02, o.hipZ + 0.38 * k], 0.075 * k, o.legs);
      this.tube([sx * k, o.hipY + 0.02, o.hipZ + 0.38 * k], [sx * k, o.footY + 0.06, o.footZ], 0.06 * k, o.legs);
      this.add(B(0.1 * k, 0.07, 0.22 * k), o.shoes, sx * k, o.footY + 0.035, o.footZ + 0.06);
    }
    // torso (kurta), a little forward
    const ty = o.hipY + 0.3 * k;
    this.add(CY(0.19 * k, 0.62 * k, 10, 0.16 * k), o.top, 0, ty, o.hipZ + 0.02, lean);
    const sh: [number, number] = [o.hipY + 0.56 * k, o.hipZ + 0.06 + lean * 0.5];
    for (const sx of [-0.21, 0.21]) this.tube([sx * k, sh[0], sh[1]], [sx * 1.2 * k, o.barY, o.barZ], 0.05 * k, o.top);
    for (const sx of [-0.25, 0.25]) this.add(S(0.045 * k), SKIN, sx * k, o.barY, o.barZ);
    // neck, head, hair
    const hy = sh[0] + 0.2 * k;
    const hz = sh[1] + 0.02;
    this.add(CY(0.05 * k, 0.1 * k, 6), SKIN, 0, sh[0] + 0.05 * k, hz);
    this.add(S(0.12 * k), SKIN, 0, hy, hz);
    if (o.hair === 'turban') {
      this.add(CY(0.14 * k, 0.13 * k, 10, 0.15 * k), '#f07a12', 0, hy + 0.1 * k, hz - 0.01);
      this.add(CY(0.143 * k, 0.035 * k, 10), '#d8262a', 0, hy + 0.08 * k, hz - 0.01);
      this.add(S(0.06 * k), '#2f9a46', 0, hy + 0.2 * k, hz - 0.03);
    } else {
      this.add(S(0.125 * k), HAIR, 0, hy + 0.04 * k, hz - 0.03);
      if (o.hair === 'long') this.add(B(0.22 * k, 0.42 * k, 0.1 * k), HAIR, 0, hy - 0.2 * k, hz - 0.1 * k);
    }
    return { sh, hy };
  }
  done() {
    const g = mergeGeometries(this.ps, false);
    this.ps.forEach((p) => p.dispose());
    return g;
  }
}

function scooter(body: string, trim: string, rider: boolean, gifts: boolean) {
  const b = new Builder();
  b.wheel(0.22, 0.12, 0, 0.62);
  b.wheel(0.22, 0.12, 0, -0.6);
  // rear cowl, seat, floorboard, leg shield, front fender, steering column
  b.add(S(0.3), body, 0, 0.5, -0.38);
  b.add(B(0.5, 0.36, 0.72), body, 0, 0.48, -0.3);
  b.add(B(0.38, 0.11, 0.7), '#3a2a22', 0, 0.72, -0.26);
  b.add(B(0.38, 0.06, 0.5), '#3a3d44', 0, 0.3, 0.18);
  b.add(B(0.46, 0.72, 0.1), body, 0, 0.64, 0.48, -0.22);
  b.add(B(0.26, 0.13, 0.42), body, 0, 0.46, 0.62);
  b.add(B(0.1, 0.42, 0.1), body, 0, 1.0, 0.6, -0.15);
  b.add(B(0.62, 0.05, 0.05), TYRE, 0, 1.2, 0.6);
  b.add(CY(0.07, 0.06, 12), '#fff3cf', 0, 1.1, 0.67, Math.PI / 2);
  b.add(B(0.52, 0.03, 0.03), trim, 0, 0.3, -0.05);
  for (const sx of [-0.24, 0.24]) b.tube([sx * 0.6, 1.2, 0.6], [sx, 1.4, 0.55], 0.012, RIM);
  for (const sx of [-0.24, 0.24]) b.add(S(0.04), RIM, sx, 1.42, 0.55);
  // the garland down the leg shield and round the back
  b.garland([-0.24, 1.08, 0.56], [-0.24, 0.4, 0.68], 7);
  b.garland([0.24, 1.08, 0.56], [0.24, 0.4, 0.68], 7);
  b.garland([-0.27, 0.62, -0.05], [-0.27, 0.6, -0.68], 7, 0.045, 0.06);
  b.garland([0.27, 0.62, -0.05], [0.27, 0.6, -0.68], 7, 0.045, 0.06);
  if (rider) {
    const r = b.rider({ hipY: 0.84, hipZ: -0.24, barY: 1.2, barZ: 0.5, footY: 0.33, footZ: 0.24, top: '#efe1c4', legs: '#f3ecdf', shoes: '#e9dcc0' });
    // the pink dupatta over the shoulders, hanging front and back
    b.add(B(0.44, 0.5, 0.04), '#c8166f', 0, r.sh[0] - 0.2, r.sh[1] + 0.17, 0.12);
    b.add(B(0.44, 0.45, 0.04), '#c8166f', 0, r.sh[0] - 0.22, r.sh[1] - 0.18, -0.08);
  }
  if (gifts) {
    // the stack of gift boxes tied on the back
    const boxes: [number, number, number, number, number, number, string][] = [
      [0, 0.92, -0.42, 0.5, 0.3, 0.42, '#2f8a4a'],
      [0, 1.14, -0.3, 0.42, 0.16, 0.32, '#e2372b'],
      [0, 1.3, -0.4, 0.38, 0.17, 0.3, '#8b3fb5'],
      [0.02, 1.47, -0.36, 0.3, 0.16, 0.26, '#f3c21a'],
      [0, 1.6, -0.42, 0.26, 0.11, 0.22, '#e2372b'],
      [-0.02, 1.27, -0.12, 0.3, 0.26, 0.2, '#f07a2b'],
    ];
    for (const [x, y, z, w, h, d, c] of boxes) {
      b.add(B(w, h, d), c, x, y, z);
      b.add(B(w + 0.01, h + 0.01, 0.04), '#f0c24a', x, y, z);
    }
    b.add(S(0.06), '#f0c24a', 0, 1.69, -0.42);
  }
  return b.done();
}

function bicycle() {
  const b = new Builder();
  const P = '#f29bb3';
  b.wheel(0.33, 0.04, 0, 0.58, '#f4efe3');
  b.wheel(0.33, 0.04, 0, -0.58, '#f4efe3');
  const hub = (z: number): [number, number, number] => [0, 0.33, z];
  const crank: [number, number, number] = [0, 0.32, -0.02];
  const seat: [number, number, number] = [0, 0.86, -0.22];
  const head: [number, number, number] = [0, 0.9, 0.42];
  b.tube(hub(-0.58), crank, 0.022, P);
  b.tube(hub(-0.58), seat, 0.02, P);
  b.tube(crank, seat, 0.025, P);
  b.tube(crank, head, 0.028, P);
  b.tube([0, 0.78, -0.2], [0, 0.82, 0.4], 0.024, P);
  b.tube(head, hub(0.58), 0.022, P);
  b.tube(head, [0, 1.06, 0.45], 0.02, '#9aa0a8');
  b.add(B(0.56, 0.03, 0.03), '#9aa0a8', 0, 1.06, 0.45);
  b.add(B(0.16, 0.06, 0.26), '#2a2420', 0, 0.9, -0.24);
  b.add(B(0.24, 0.04, 0.4), P, 0, 0.68, -0.52);
  b.add(B(0.04, 0.03, 0.6), P, 0.06, 0.62, -0.5, 0.15);
  b.add(CY(0.09, 0.04, 12), '#c7c9cf', 0, 0.32, -0.02, 0, 0, Math.PI / 2);
  // the basket of flowers on the front
  b.add(CY(0.17, 0.22, 10, 0.14), '#b98a4e', 0, 0.98, 0.64);
  const fl = ['#ff9a1f', '#ffd0dc', '#e2306c', '#ffc21a', '#fff6e8'];
  for (let i = 0; i < 9; i++) b.add(S(0.055), fl[i % fl.length], Math.cos(i * 2.4) * 0.1, 1.12 + (i % 3) * 0.025, 0.64 + Math.sin(i * 2.4) * 0.1);
  b.garland([0, 0.7, -0.14], [0, 0.88, 0.38], 6, 0.035);
  const r = b.rider({ hipY: 0.94, hipZ: -0.22, barY: 1.07, barZ: 0.42, footY: 0.28, footZ: 0.05, top: '#1c9c97', legs: '#178a86', shoes: '#e6d3a5', lean: 0.18, hair: 'long' });
  // the dupatta streaming back
  b.add(B(0.34, 0.06, 0.55), '#21aaa4', 0, r.sh[0] - 0.05, r.sh[1] - 0.42, -0.35);
  return b.done();
}

function auto() {
  const b = new Builder();
  const G = '#1f8a3b';
  const Yl = '#f5c21a';
  b.wheel(0.22, 0.14, -0.6, -0.75);
  b.wheel(0.22, 0.14, 0.6, -0.75);
  b.wheel(0.22, 0.14, 0, 1.0);
  // green tub and cowl, yellow canopy and cab
  b.add(B(1.34, 0.56, 1.62), G, 0, 0.62, -0.38);
  b.add(B(1.38, 0.08, 0.5), G, 0, 0.92, -1.0);
  b.add(B(0.98, 0.58, 0.62), G, 0, 0.66, 0.74);
  b.add(B(0.4, 0.12, 0.5), G, 0, 0.5, 1.02);
  b.add(B(1.06, 0.54, 0.5), Yl, 0, 1.22, 0.88);
  b.add(B(0.92, 0.44, 0.03), '#a9c8d8', 0, 1.24, 1.14, 0.1);
  b.add(B(1.42, 0.1, 2.36), Yl, 0, 1.84, -0.18);
  b.add(B(1.42, 0.9, 0.06), Yl, 0, 1.38, -1.33);
  for (const sx of [-0.69, 0.69]) b.add(B(0.04, 0.26, 1.9), Yl, sx, 1.68, -0.3);
  for (const sx of [-0.68, 0.68]) for (const z of [-1.28, 0.62]) b.add(B(0.05, 0.95, 0.05), '#22242a', sx, 1.32, z);
  // seat, headlights, the black grille, mirrors
  b.add(B(1.2, 0.12, 0.5), '#7a4428', 0, 0.96, -0.72);
  b.add(B(1.2, 0.42, 0.1), '#7a4428', 0, 1.2, -1.0);
  for (const sx of [-0.28, 0.28]) b.add(CY(0.08, 0.06, 12), '#fff3cf', sx, 0.86, 1.06, Math.PI / 2);
  b.add(B(0.3, 0.32, 0.04), '#1c1c20', 0, 0.82, 1.06);
  for (const sx of [-0.62, 0.62]) b.add(S(0.06), '#1c1c20', sx, 1.42, 1.0);
  // marigolds round the cab and down the posts, fairy lights along the canopy
  b.garland([-0.52, 1.5, 1.14], [0.52, 1.5, 1.14], 11, 0.045, 0.12);
  b.garland([-0.5, 0.98, 1.08], [0.5, 0.98, 1.08], 10, 0.04, 0.08);
  for (const sx of [-0.68, 0.68]) b.garland([sx, 1.76, 0.6], [sx, 0.98, 0.6], 8, 0.04);
  for (let i = 0; i < 12; i++) for (const sx of [-0.72, 0.72]) b.add(S(0.022), '#fff1b0', sx, 1.56, -1.25 + i * 0.17);
  // the driver
  b.rider({ hipY: 0.98, hipZ: 0.3, barY: 1.1, barZ: 0.7, footY: 0.36, footZ: 0.62, top: '#c9b48a', legs: '#4a4033', shoes: '#3a2a22', scale: 0.92 });
  return b.done();
}

function rickshaw() {
  const b = new Builder();
  const F = '#2f6b3f';
  b.wheel(0.34, 0.05, -0.55, -0.55, '#e7e2d6');
  b.wheel(0.34, 0.05, 0.55, -0.55, '#e7e2d6');
  b.wheel(0.34, 0.05, 0, 0.92, '#e7e2d6');
  b.add(B(1.2, 0.04, 0.04), F, 0, 0.34, -0.55);
  // the painted seat box, cushion and back, the hood
  b.add(B(1.0, 0.36, 0.6), '#f1b81c', 0, 0.62, -0.56);
  b.add(B(1.02, 0.08, 0.62), '#2f8a4a', 0, 0.44, -0.56);
  b.add(B(0.96, 0.14, 0.52), '#d42a2a', 0, 0.86, -0.56);
  b.add(B(0.96, 0.46, 0.1), '#d42a2a', 0, 1.12, -0.84);
  b.add(B(1.0, 0.05, 0.5), '#d42a2a', 0, 0.42, -0.14);
  b.add(B(1.06, 0.06, 0.86), '#d42a2a', 0, 1.82, -0.6, -0.12);
  b.add(B(1.02, 0.76, 0.05), '#22328a', 0, 1.46, -1.0);
  for (const sx of [-0.52, 0.52]) b.add(B(0.04, 0.62, 0.86), '#22328a', sx, 1.52, -0.62, -0.12);
  for (const sx of [-0.52, 0.52]) b.tube([sx, 0.9, -0.2], [sx, 1.82, -0.18], 0.015, '#c9ccd2');
  const tas = ['#f2c21a', '#e2306c', '#20a9a0', '#f07a12'];
  for (let i = 0; i < 8; i++) b.add(B(0.04, 0.1, 0.04), tas[i % 4], -0.46 + i * 0.13, 1.72, -0.17);
  // frame to the front wheel, the cyclist's seat and handlebar
  b.tube([0, 0.5, -0.25], [0, 0.98, 0.3], 0.03, F);
  b.tube([0, 0.5, -0.25], [0, 0.36, 0.25], 0.03, F);
  b.tube([0, 0.36, 0.25], [0, 0.98, 0.3], 0.028, F);
  b.tube([0, 0.98, 0.3], [0, 1.0, 0.82], 0.028, F);
  b.tube([0, 1.0, 0.82], [0, 0.34, 0.92], 0.025, F);
  b.tube([0, 1.0, 0.82], [0, 1.16, 0.8], 0.02, '#c9ccd2');
  b.add(B(0.56, 0.03, 0.03), '#c9ccd2', 0, 1.16, 0.8);
  b.add(CY(0.07, 0.05, 10), '#fff3cf', 0, 1.08, 0.9, Math.PI / 2);
  b.add(B(0.18, 0.06, 0.26), '#2a2420', 0, 1.02, 0.28);
  b.rider({ hipY: 1.06, hipZ: 0.28, barY: 1.16, barZ: 0.76, footY: 0.3, footZ: 0.42, top: '#f2c440', legs: '#f4f1ea', shoes: '#6b4a2e', lean: 0.15, hair: 'turban' });
  return b.done();
}

export function vehicleModel(m: VehicleModel) {
  switch (m) {
    case 'scooter':
      return scooter('#1f5fc4', '#d7dbe2', true, false);
    case 'parkedScooter':
      return scooter('#21803f', '#e0b84a', false, true);
    case 'bicycle':
      return bicycle();
    case 'auto':
      return auto();
    default:
      return rickshaw();
  }
}
