import { useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { CAST_PEOPLE, CAST_VEHICLES, type CastSprite } from '../assets/AssetRegistry';
import { useGame } from '../game/GameState';
import { crowd, shadowTexture, type Agent } from './Crowd';
import { trafficState, type Vehicle } from './Traffic';
import { chunkOf, getVariants, STREET, variantAt } from './StreetLayout';

// The mohalla's people and vehicles, drawn from Simran's illustrations as upright cut-outs.
// One InstancedMesh per illustration, so the whole cast is ten draw calls.
//
// People turn to face the camera (they are drawn from the front) and are mirrored to look
// the way they are walking. Vehicles are drawn from the side, so their cut-out stays side-on
// to the road, turning towards the camera only as far as it takes to stay readable when
// one comes straight at you. Motion is simple: a walking bob and sway, a hop when kids
// cheer, a flinch, a rattle for vehicles, a dip when they brake.

const MAX_TURN = THREE.MathUtils.degToRad(52);
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _qr = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const Y = new THREE.Vector3(0, 1, 0);
const Z = new THREE.Vector3(0, 0, 1);
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

type PeopleKey = keyof typeof CAST_PEOPLE;
type VehicleKey = keyof typeof CAST_VEHICLES;

/** Which illustration an agent wears. */
function personSprite(a: Agent): PeopleKey {
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

const VEHICLE_SPRITE: Record<Vehicle['type'], VehicleKey> = { scooter: 'scooter', bicycle: 'bicycle', auto: 'auto', rickshaw: 'rickshaw' };

interface Layer {
  sprite: CastSprite;
  mesh: THREE.InstancedMesh;
  n: number;
}

function makeLayer(sprite: CastSprite, cap: number, loader: THREE.TextureLoader, maxAniso: number): Layer {
  const tex = loader.load(sprite.url);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = Math.min(4, maxAniso);
  const geo = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0);
  // a touch below white so the cut-outs sit in the night scene; fog still applies
  const mat = new THREE.MeshBasicMaterial({ map: tex, alphaTest: 0.42, side: THREE.DoubleSide, color: new THREE.Color(0.9, 0.86, 0.82) });
  const mesh = new THREE.InstancedMesh(geo, mat, cap);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  mesh.raycast = () => {};
  mesh.count = 0;
  return { sprite, mesh, n: 0 };
}

/** Put one cut-out in its layer: standing at (x, y, z), its face turned to `yaw`. */
function put(L: Layer, x: number, y: number, z: number, yaw: number, mirror: boolean, sx = 1, sy = 1, roll = 0) {
  if (L.n >= L.mesh.instanceMatrix.count) return;
  const h = L.sprite.height * sy;
  const w = L.sprite.height * L.sprite.aspect * sx;
  _q.setFromAxisAngle(Y, yaw);
  if (roll) _q.multiply(_qr.setFromAxisAngle(Z, roll));
  _m.compose(_p.set(x, y, z), _q, _s.set(mirror ? -w : w, h, 1));
  L.mesh.setMatrixAt(L.n++, _m);
}

export function CastSprites() {
  const graphics = useGame((s) => s.settings.graphics);
  const high = graphics === 'high';
  const { camera, gl } = useThree();

  const { people, vehicles, shadow } = useMemo(() => {
    const loader = new THREE.TextureLoader();
    const aniso = gl.capabilities.getMaxAnisotropy();
    const people = {} as Record<PeopleKey, Layer>;
    for (const k of Object.keys(CAST_PEOPLE) as PeopleKey[]) people[k] = makeLayer(CAST_PEOPLE[k], high ? 140 : 80, loader, aniso);
    const vehicles = {} as Record<VehicleKey, Layer>;
    for (const k of Object.keys(CAST_VEHICLES) as VehicleKey[]) vehicles[k] = makeLayer(CAST_VEHICLES[k], 24, loader, aniso);
    // soft shadows under the vehicles
    const smat = new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 });
    const shadow = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), smat, 48);
    shadow.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    shadow.frustumCulled = false;
    shadow.raycast = () => {};
    shadow.renderOrder = 2;
    shadow.count = 0;
    return { people, vehicles, shadow };
  }, [gl, high]);
  useEffect(
    () => () => {
      for (const L of [...Object.values(people), ...Object.values(vehicles)]) {
        (L.mesh.material as THREE.MeshBasicMaterial).map?.dispose();
        (L.mesh.material as THREE.Material).dispose();
        L.mesh.geometry.dispose();
      }
      (shadow.material as THREE.Material).dispose();
      shadow.geometry.dispose();
    },
    [people, vehicles, shadow],
  );

  useFrame((st) => {
    const t = st.clock.elapsedTime;
    const reduced = useGame.getState().settings.reducedMotion;
    const cx = camera.position.x;
    const cz = camera.position.z;
    const far = high ? 72 : 52;
    for (const L of Object.values(people)) L.n = 0;
    for (const L of Object.values(vehicles)) L.n = 0;
    let ns = 0;

    // people
    for (const a of crowd.agents) {
      if (a.kind === 'dog' || a.owner === 'rider' || a.hidden) continue;
      const dx = a.x - cx;
      const dz = a.z - cz;
      const d2 = dx * dx + dz * dz;
      // too close to the lens (a spotlight framing beside someone) or too far to matter
      if (d2 > far * far || d2 < 1.7 * 1.7) continue;
      const L = people[personSprite(a)];
      // face the camera; mirror to look the way the person faces
      const yaw = Math.atan2(cx - a.x, cz - a.z);
      const fx = Math.sin(a.ry);
      const fz = Math.cos(a.ry);
      // the artwork looks along the plane's x axis (times `faces`); mirror it to look ahead
      const look = (Math.cos(yaw) * fx - Math.sin(yaw) * fz) * L.sprite.faces;
      const mirror = look < -0.05;
      let y = a.sit ? Math.max(0, a.y - 0.1) : a.y;
      let sy = a.scale;
      let sx = a.scale;
      let roll = 0;
      if (!reduced) {
        const mv = Math.min(1, a.moving);
        if (mv > 0.05) {
          const ph = a.phase * 2.2;
          y += Math.abs(Math.sin(ph)) * 0.045 * mv;
          roll = Math.sin(ph) * 0.035 * mv;
        } else {
          // breathing, a little sway
          sy *= 1 + Math.sin(t * 1.6 + a.idx) * 0.008;
          roll = Math.sin(t * 0.7 + a.idx * 1.7) * 0.012;
        }
        const k = a.reactDur > 0 ? a.reactT / a.reactDur : 1;
        if (a.react === 'cheer' || a.react === 'clap') y += Math.max(0, Math.sin(a.reactT * 11)) * (a.kind === 'child' ? 0.28 : 0.12) * (1 - k);
        else if (a.react === 'flinch' || a.react === 'step') {
          roll += (mirror ? -1 : 1) * 0.12 * (1 - k);
          sy *= 1 - 0.05 * (1 - k);
        } else if (a.react === 'ears') {
          sy *= 1 - 0.06 * (1 - k);
          sx *= 1 + 0.03 * (1 - k);
        }
      }
      put(L, a.x, y, a.z, yaw, mirror, sx, sy, roll);
    }

    // vehicles on the road
    const V = trafficState.list;
    const now = performance.now();
    for (const v of V) {
      const z = v.z + v.off;
      const dx = v.x - cx;
      const dz = z - cz;
      if (dx * dx + dz * dz > far * far) continue;
      const L = vehicles[VEHICLE_SPRITE[v.type]];
      // side-on to the road, turned towards the camera at most MAX_TURN past that
      const side = cz > z ? 0 : Math.PI;
      const view = Math.atan2(cx - v.x, cz - z);
      let d = view - side;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      const yaw = side + THREE.MathUtils.clamp(d, -MAX_TURN, MAX_TURN);
      const mirror = Math.cos(yaw) * v.dir * L.sprite.faces < 0;
      let y = 0;
      let roll = 0;
      if (!reduced) {
        y += Math.abs(Math.sin(t * 9 + v.x * 0.7)) * 0.012 * Math.min(1, v.speed / 2);
        // nose dips under braking
        if (now < v.brakeUntil && v.speed > 0.3) roll = (mirror ? 1 : -1) * 0.03;
      }
      put(L, v.x, y, z, yaw, mirror, 1, 1, roll);
      if (ns < shadow.instanceMatrix.count) {
        _q.identity();
        _m.compose(_p.set(v.x, 0.016, z), _q, _s.set(L.sprite.height * L.sprite.aspect * 0.95, 1, v.type === 'auto' || v.type === 'rickshaw' ? 1.5 : 0.8));
        shadow.setMatrixAt(ns++, _m);
      }
    }

    // parked scooters, chunk by chunk
    const kp = chunkOf(camera.position.x);
    const vars = getVariants();
    const P = vehicles.parkedScooter;
    for (let k = kp - 2; k <= kp + 2; k++) {
      const ox = k * STREET.chunk;
      for (const pr of vars[variantAt(k)].props) {
        const x = pr.x + ox;
        const dx = x - cx;
        const dz = pr.z - cz;
        if (dx * dx + dz * dz > far * far) continue;
        // a parked scooter's length runs along ry; keep its side towards the viewer
        const view = Math.atan2(cx - x, cz - pr.z);
        let d = view - pr.ry;
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        const base = Math.abs(d) > Math.PI / 2 ? pr.ry + Math.PI : pr.ry;
        let d2 = view - base;
        while (d2 > Math.PI) d2 -= Math.PI * 2;
        while (d2 < -Math.PI) d2 += Math.PI * 2;
        const yaw = base + THREE.MathUtils.clamp(d2, -MAX_TURN, MAX_TURN);
        put(P, x, 0, pr.z, yaw, false, 1, 1, 0);
        if (ns < shadow.instanceMatrix.count) {
          _q.setFromAxisAngle(Y, pr.ry);
          _m.compose(_p.set(x, 0.016, pr.z), _q, _s.set(1.4, 1, 0.7));
          shadow.setMatrixAt(ns++, _m);
        }
      }
    }

    for (const L of [...Object.values(people), ...Object.values(vehicles)]) {
      for (let i = L.n; i < L.mesh.count; i++) L.mesh.setMatrixAt(i, ZERO);
      L.mesh.count = L.n;
      L.mesh.instanceMatrix.needsUpdate = true;
    }
    shadow.count = ns;
    shadow.instanceMatrix.needsUpdate = true;
  });

  return (
    <group>
      {Object.values(people).map((L) => (
        <primitive key={L.sprite.id} object={L.mesh} />
      ))}
      {Object.values(vehicles).map((L) => (
        <primitive key={L.sprite.id} object={L.mesh} />
      ))}
      <primitive object={shadow} />
    </group>
  );
}
