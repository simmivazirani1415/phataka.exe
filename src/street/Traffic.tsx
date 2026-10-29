import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { runtime, type WorldEvent } from '../game/Runtime';
import { useGame } from '../game/GameState';
import { audio } from '../audio/AudioEngine';
import { STREET } from './StreetLayout';
import { crowd, LINES, sayLine, type Agent } from './Crowd';
import { glowUniforms, pointsFrag, pointsVert } from './StreetChunks';

// Slow mohalla traffic: scooters, cycles, autos and the odd small car, keeping left in two
// lanes along the gali. They follow each other, stop for the player, for anyone stepping
// into the road and for any cracker on the ground, swerve around crackers when there is
// room, and brake hard and swerve away when something bursts nearby.

export type VType = 'scooter' | 'bicycle' | 'auto' | 'rickshaw';
const TYPES: VType[] = ['scooter', 'bicycle', 'auto', 'rickshaw'];
const LANE = 1.25;
const SPEC: Record<VType, { len: number; wid: number; speed: [number, number]; tints: string[]; seat: number; riderZ: number }> = {
  scooter: { len: 1.8, wid: 0.75, speed: [4.2, 5.8], tints: ['#ce382a', '#1e5f8a', '#f2e3c4', '#2f6b4f', '#23242a', '#d64a91', '#8d8f97'], seat: 0.78, riderZ: -0.2 },
  bicycle: { len: 1.75, wid: 0.6, speed: [2.6, 3.4], tints: ['#23242a', '#ce382a', '#1e5f8a', '#2f6b4f'], seat: 0.92, riderZ: -0.25 },
  auto: { len: 2.7, wid: 1.4, speed: [3.4, 4.4], tints: ['#ffd15a', '#2f8a4a', '#ffd15a'], seat: 0.85, riderZ: 0.55 },
  rickshaw: { len: 2.3, wid: 1.1, speed: [2.2, 3.0], tints: ['#2f6b4f'], seat: 0, riderZ: 0 },
};

export interface Vehicle {
  type: VType;
  slot: number;
  x: number;
  z: number;
  dir: 1 | -1;
  speed: number;
  cruise: number;
  off: number;
  offTarget: number;
  brakeUntil: number;
  waitFor: number;
  honked: number;
  riders: Agent[];
}

// --- geometry: boxes and cylinders with baked vertex colours (white parts take the tint)

function part(geo: THREE.BufferGeometry, color: string, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0) {
  const g = geo.toNonIndexed();
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
const CY = (r: number, h: number, s = 14) => new THREE.CylinderGeometry(r, r, h, s);
const TINT = '#ffffff';
const DARK = '#1c1c20';
const CHROME = '#b8bcc4';

// all models face +z (the direction of travel)
function model(type: VType) {
  const ps: THREE.BufferGeometry[] = [];
  const wheel = (r: number, w: number, x: number, z: number) => ps.push(part(CY(r, w, 16), DARK, x, r, z, 0, 0, Math.PI / 2));
  if (type === 'scooter') {
    wheel(0.24, 0.12, 0, 0.62);
    wheel(0.24, 0.12, 0, -0.6);
    ps.push(part(B(0.42, 0.36, 1.0), TINT, 0, 0.5, -0.2));
    ps.push(part(B(0.36, 0.12, 0.62), '#2a2420', 0, 0.76, -0.25));
    ps.push(part(B(0.4, 0.75, 0.16), TINT, 0, 0.72, 0.45, -0.25));
    ps.push(part(B(0.3, 0.06, 0.5), DARK, 0, 0.36, 0.25));
    ps.push(part(B(0.08, 0.5, 0.08), CHROME, 0, 0.95, 0.56, -0.3));
    ps.push(part(B(0.7, 0.05, 0.05), DARK, 0, 1.18, 0.6));
    ps.push(part(B(0.16, 0.12, 0.08), '#fff6d8', 0, 1.02, 0.66));
  } else if (type === 'bicycle') {
    wheel(0.33, 0.04, 0, 0.55);
    wheel(0.33, 0.04, 0, -0.55);
    ps.push(part(B(0.04, 0.04, 1.0), TINT, 0, 0.62, 0, 0.35));
    ps.push(part(B(0.04, 0.6, 0.04), TINT, 0, 0.6, -0.25, 0.2));
    ps.push(part(B(0.04, 0.6, 0.04), TINT, 0, 0.66, 0.5, -0.3));
    ps.push(part(B(0.18, 0.06, 0.26), '#2a2420', 0, 0.94, -0.3));
    ps.push(part(B(0.6, 0.04, 0.04), DARK, 0, 1.0, 0.5));
    ps.push(part(B(0.36, 0.05, 0.3), DARK, 0, 0.72, -0.62));
  } else if (type === 'auto') {
    wheel(0.22, 0.14, -0.6, -0.75);
    wheel(0.22, 0.14, 0.6, -0.75);
    wheel(0.22, 0.14, 0, 0.95);
    // tub, cowl, black canopy on posts, a meter flag
    ps.push(part(B(1.36, 0.6, 1.7), TINT, 0, 0.58, -0.35));
    ps.push(part(B(1.0, 0.85, 0.7), TINT, 0, 0.72, 0.85, -0.12));
    ps.push(part(B(1.4, 0.08, 2.5), DARK, 0, 1.78, -0.05));
    ps.push(part(B(1.4, 0.55, 0.06), DARK, 0, 1.5, -1.28));
    for (const x of [-0.66, 0.66]) for (const z of [-1.2, 1.1]) ps.push(part(B(0.05, 0.95, 0.05), DARK, x, 1.3, z));
    ps.push(part(B(1.1, 0.5, 0.04), '#9bb4c9', 0, 1.42, 1.17, 0.15));
    ps.push(part(B(1.2, 0.1, 0.5), '#2a2420', 0, 0.92, -0.7));
    ps.push(part(B(0.2, 0.14, 0.06), '#fff6d8', 0, 0.9, 1.22));
  } else {
    wheel(0.3, 0.2, -0.72, 1.15);
    wheel(0.3, 0.2, 0.72, 1.15);
    wheel(0.3, 0.2, -0.72, -1.15);
    wheel(0.3, 0.2, 0.72, -1.15);
    ps.push(part(B(1.6, 0.6, 3.6), TINT, 0, 0.62, 0));
    ps.push(part(B(1.44, 0.55, 2.0), TINT, 0, 1.18, -0.25));
    ps.push(part(B(1.46, 0.42, 1.6), '#26303e', 0, 1.18, -0.25));
    ps.push(part(B(1.3, 0.4, 0.06), '#26303e', 0, 1.16, 0.77, -0.6));
    ps.push(part(B(1.62, 0.16, 0.08), DARK, 0, 0.42, 1.82));
    ps.push(part(B(1.62, 0.16, 0.08), DARK, 0, 0.42, -1.82));
    ps.push(part(B(0.3, 0.12, 0.04), '#fff6d8', -0.55, 0.72, 1.81));
    ps.push(part(B(0.3, 0.12, 0.04), '#fff6d8', 0.55, 0.72, 1.81));
    ps.push(part(B(0.3, 0.12, 0.04), '#c4302b', -0.55, 0.72, -1.81));
    ps.push(part(B(0.3, 0.12, 0.04), '#c4302b', 0.55, 0.72, -1.81));
  }
  const g = mergeGeometries(ps, false);
  ps.forEach((p) => p.dispose());
  return g;
}

const pickA = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3(1, 1, 1);
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
const Y = new THREE.Vector3(0, 1, 0);

const MIX: VType[] = ['scooter', 'scooter', 'bicycle', 'auto', 'rickshaw', 'scooter', 'bicycle', 'auto', 'rickshaw'];

/** The vehicles on the road right now, for the cut-out renderer. */
export const trafficState: { list: Vehicle[] } = { list: [] };

export function Traffic() {
  const graphics = useGame((s) => s.settings.graphics);
  const high = graphics === 'high';
  const count = high ? 14 : 8;
  const { camera } = useThree();
  const list = useRef<Vehicle[]>([]);

  const { meshes, mat, lights } = useMemo(() => {
    const mat = high ? new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.15 }) : new THREE.MeshLambertMaterial({ vertexColors: true });
    const meshes = {} as Record<VType, THREE.InstancedMesh>;
    for (const t of TYPES) {
      const m = new THREE.InstancedMesh(model(t), mat, count);
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      for (let i = 0; i < count; i++) m.setMatrixAt(i, ZERO);
      m.setColorAt(0, new THREE.Color(1, 1, 1));
      m.frustumCulled = false;
      m.raycast = () => {};
      meshes[t] = m;
    }
    // head and tail lights: two glowing points per vehicle
    const n = count * 3;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aColor', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(new Float32Array(n), 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aTw', new THREE.BufferAttribute(new Float32Array(n), 1));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(new Float32Array(n), 1));
    const pm = new THREE.ShaderMaterial({ vertexShader: pointsVert, fragmentShader: pointsFrag, uniforms: glowUniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    const lights = new THREE.Points(geo, pm);
    lights.frustumCulled = false;
    lights.raycast = () => {};
    lights.renderOrder = 6;
    return { meshes, mat, lights };
  }, [count, high]);
  useEffect(
    () => () => {
      mat.dispose();
      Object.values(meshes).forEach((m) => m.geometry.dispose());
      lights.geometry.dispose();
      (lights.material as THREE.Material).dispose();
      list.current.forEach((v) => v.riders.forEach((r) => crowd.remove(r)));
      list.current = [];
    },
    [mat, meshes, lights],
  );

  const spawn = (slot: number, first: boolean): Vehicle => {
    const p = runtime.player;
    const type = pickA(MIX);
    const dir: 1 | -1 = Math.random() < 0.5 ? 1 : -1;
    const sp = SPEC[type];
    const x = first ? p.x + rnd(-70, 70) : p.x - dir * rnd(68, 80) * (Math.random() < 0.7 ? 1 : -1);
    const v: Vehicle = { type, slot, x, z: -dir * LANE, dir, speed: 0, cruise: rnd(...sp.speed), off: 0, offTarget: 0, brakeUntil: 0, waitFor: 0, honked: 0, riders: [] };
    v.speed = v.cruise;
    // the riders are part of each vehicle's illustration
    return v;
  };

  const recycle = (v: Vehicle) => {
    v.riders.forEach((r) => crowd.remove(r));
    meshes[v.type].setMatrixAt(v.slot, ZERO);
    meshes[v.type].instanceMatrix.needsUpdate = true;
  };

  // the player cannot walk through traffic
  useEffect(() => {
    const solid = (x: number, z: number, r: number, y = 0) => {
      if (y > 0.5) return false;
      for (const v of list.current) {
        const s = SPEC[v.type];
        if (Math.abs(x - v.x) < s.len / 2 + r && Math.abs(z - (v.z + v.off)) < s.wid / 2 + r) return true;
      }
      return false;
    };
    runtime.solids.set('vehicle', solid);
    return () => {
      runtime.solids.delete('vehicle');
    };
  }, []);

  // brake and swerve away from a nearby burst
  useEffect(
    () =>
      runtime.on((e: WorldEvent) => {
        if (e.kind === 'interaction' || e.kind === 'stage') return;
        const R = e.kind === 'bomb' ? 16 : 11;
        const now = performance.now();
        let spoke = false;
        for (const v of list.current) {
          const d = Math.hypot(v.x - e.pos[0], v.z - e.pos[2]);
          if (d > R) continue;
          v.brakeUntil = now + rnd(1400, 2200);
          const away = Math.sign(v.z + v.off - e.pos[2]) || -v.dir;
          v.offTarget = THREE.MathUtils.clamp(v.offTarget + away * 0.8, -LANE - 0.9, LANE + 0.9) - 0;
          if (!spoke && d < 9 && Math.random() < 0.6) {
            spoke = true;
            window.setTimeout(() => sayLine(pickA(LINES.rider), v.x, 2.3, v.z + v.off), 400);
          }
        }
        // somebody always leans on the horn: the nearest vehicle, wherever the burst was
        let near: Vehicle | null = null;
        let nd = 34;
        for (const v of list.current) {
          const d = Math.hypot(v.x - e.pos[0], v.z - e.pos[2]);
          if (d < nd) {
            nd = d;
            near = v;
          }
        }
        if (near && now - near.honked > 1500) {
          near.honked = now;
          window.setTimeout(() => audio.horn(), 250 + Math.random() * 200);
          if (e.kind === 'bomb' && Math.random() < 0.6) window.setTimeout(() => audio.horn(), 900);
        }
      }),
    [],
  );

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const p = runtime.player;
    const now = performance.now();
    const L = list.current;
    trafficState.list = L;
    while (L.length < count) {
      const used = new Set(L.map((v) => v.type + v.slot));
      // find a free instance slot for a type
      let v: Vehicle | null = null;
      for (let tries = 0; tries < 8 && !v; tries++) {
        const cand = spawn(0, L.length === 0 || now < 4000);
        for (let s = 0; s < count; s++) {
          if (!used.has(cand.type + s)) {
            cand.slot = s;
            meshes[cand.type].setColorAt(s, new THREE.Color(pickA(SPEC[cand.type].tints)));
            const ic = meshes[cand.type].instanceColor;
            if (ic) ic.needsUpdate = true;
            v = cand;
            break;
          }
        }
        if (!v) cand.riders.forEach((r) => crowd.remove(r));
      }
      if (!v) break;
      // don't spawn on top of another vehicle in the same lane
      if (L.some((o) => o.dir === v!.dir && Math.abs(o.x - v!.x) < 8)) v.x -= v.dir * 10;
      L.push(v);
    }

    const camX = camera.position.x;
    const camZ = camera.position.z;
    const active = useGame.getState().active;
    const pos = lights.geometry.getAttribute('position') as THREE.BufferAttribute;
    const col = lights.geometry.getAttribute('aColor') as THREE.BufferAttribute;
    const size = lights.geometry.getAttribute('aSize') as THREE.BufferAttribute;

    for (let i = L.length - 1; i >= 0; i--) {
      const v = L[i];
      const s = SPEC[v.type];
      if (Math.abs(v.x - p.x) > 88) {
        recycle(v);
        L.splice(i, 1);
        continue;
      }
      const laneZ = -v.dir * LANE;
      let target = v.cruise;
      const front = v.x + v.dir * (s.len / 2);
      const ahead = (x: number) => (x - front) * v.dir;
      const inBand = (z: number, half: number) => Math.abs(z - (laneZ + v.off)) < s.wid / 2 + half;
      // follow the vehicle in front
      for (const o of L) {
        if (o === v || o.dir !== v.dir) continue;
        const gap = ahead(o.x - o.dir * (SPEC[o.type].len / 2));
        if (gap > 0 && gap < 10) target = Math.min(target, Math.max(0, (gap - 2.2) * 0.8));
      }
      // stop for the player (and for the camera while it frames a cracker)
      const stopFor = (x: number, z: number, half: number) => {
        const a = ahead(x);
        if (a > -0.5 && a < 7 && inBand(z, half)) {
          target = Math.min(target, Math.max(0, (a - 1.6) * 0.7));
          return true;
        }
        return false;
      };
      let forPlayer = stopFor(p.x, p.z, 0.6);
      if (active) forPlayer = stopFor(camX, camZ, 0.6) || forPlayer;
      // anyone who stepped into the road
      for (const a of crowd.agents) {
        if (a.owner === 'rider' || a.hidden || a.y > 0.3) continue;
        if (Math.abs(a.x - v.x) > 8) continue;
        stopFor(a.x, a.z, 0.5);
      }
      // crackers on the ground: swerve round when there is room, otherwise wait
      let want = 0;
      for (const h of runtime.hazards) {
        const a = ahead(h.pos[0]);
        if (a < -s.len - h.radius || a > h.radius + 9) continue;
        const clear = h.radius + s.wid / 2 + 0.6;
        if (Math.abs(laneZ - h.pos[2]) >= clear) continue;
        const side = laneZ >= h.pos[2] ? 1 : -1;
        const off = h.pos[2] + side * clear - laneZ;
        const zNew = laneZ + off;
        if (Math.abs(zNew) < STREET.galiHalf - 0.8 - s.wid / 2) want = Math.abs(off) > Math.abs(want) ? off : want;
        else if (a > 0) target = Math.min(target, Math.max(0, (a - h.radius - 1.5) * 0.7));
      }
      v.offTarget += ((now < v.brakeUntil ? v.offTarget : want) - v.offTarget) * Math.min(1, dt * 1.5);
      if (now >= v.brakeUntil && want === 0) v.offTarget *= Math.max(0, 1 - dt * 0.8);
      if (now < v.brakeUntil) target = Math.min(target, 0.3);
      v.off += (v.offTarget - v.off) * Math.min(1, dt * 2.2);
      // brake harder than you accelerate
      const acc = target < v.speed ? 7 : 1.6;
      v.speed += THREE.MathUtils.clamp(target - v.speed, -acc * dt, acc * dt);
      v.x += v.dir * v.speed * dt;
      // a polite honk when kept waiting by the player
      if (forPlayer && v.speed < 0.2) {
        v.waitFor += dt;
        if (v.waitFor > 2.2 && now - v.honked > 6000) {
          v.honked = now;
          audio.horn();
        }
      } else v.waitFor = 0;

      const z = laneZ + v.off;
      const yaw = (v.dir > 0 ? Math.PI / 2 : -Math.PI / 2) - (v.offTarget - v.off) * 0.25 * v.dir;
      _q.setFromAxisAngle(Y, yaw);
      _m.compose(_p.set(v.x, 0, z), _q, _s);
      meshes[v.type].setMatrixAt(v.slot, _m);
      // riders sit on the seat
      v.riders.forEach((r, ri) => {
        const back = ri === 0 ? s.riderZ : v.type === 'auto' ? -0.6 : s.riderZ - 0.42;
        r.x = v.x + Math.sin(yaw) * back;
        r.z = z + Math.cos(yaw) * back;
        r.y = (v.type === 'auto' ? (ri === 0 ? s.seat : 0.92) : s.seat) - (0.84 - 0.36) * r.scale;
        r.ry = yaw;
      });
      // lights: two headlights (one on two-wheelers), one tail light
      const k = i * 3;
      const fx = Math.sin(yaw);
      const fz = Math.cos(yaw);
      const hy = v.type === 'auto' ? 0.95 : 1.05;
      const headOff = s.len / 2;
      const wide = 0;
      pos.setXYZ(k, v.x + fx * headOff - fz * wide, hy, z + fz * headOff + fx * wide);
      pos.setXYZ(k + 1, v.x + fx * headOff + fz * wide, hy, z + fz * headOff - fx * wide);
      pos.setXYZ(k + 2, v.x - fx * (s.len / 2), 0.7, z - fz * (s.len / 2));
      col.setXYZ(k, 1, 0.93, 0.75);
      col.setXYZ(k + 1, 1, 0.93, 0.75);
      col.setXYZ(k + 2, 1, 0.15, 0.1);
      size.setX(k, v.type === 'bicycle' ? 0.25 : v.type === 'rickshaw' ? 0 : 0.6);
      size.setX(k + 1, wide ? 0.6 : 0);
      size.setX(k + 2, v.type === 'bicycle' ? 0.18 : v.speed < 1 ? 0.55 : 0.35);
    }
    for (let i = L.length * 3; i < count * 3; i++) size.setX(i, 0);
    pos.needsUpdate = true;
    col.needsUpdate = true;
    size.needsUpdate = true;
    for (const t of TYPES) meshes[t].instanceMatrix.needsUpdate = true;
  });

  return (
    <group>
      <primitive object={lights} />
    </group>
  );
}
