import { useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { CAST_PEOPLE, CAST_PEOPLE_STAND, CAST_VEHICLES, type CastSprite } from '../assets/AssetRegistry';
import { runtime } from '../game/Runtime';
import { useGame } from '../game/GameState';
import { crowd, shadowTexture, type Agent } from './Crowd';
import { trafficState, type Vehicle } from './Traffic';
import { chunkOf, getVariants, STREET, variantAt } from './StreetLayout';
import { vehicleModel } from './VehicleModels';
import { addFade, modelWeight, threeQuarterWeight, withFade } from './castFade';

// The mohalla's people and vehicles, drawn from Simran's illustrations as upright cut-outs.
// One InstancedMesh per illustration, so the whole cast is a handful of draw calls.
//
// People are cylindrical billboards: each cut-out stands on its feet (the pivot is the
// bottom centre of the visible figure, the images are cropped to it) and turns about the
// world's vertical axis only, so it never tips with the camera's pitch or roll. It is
// Walkers use the walking illustrations, mirrored to look the way they go (turning like a
// paper cut-out when that changes); anyone standing about crosses over to the front-facing
// standing illustration. Motion is positional and restrained: a step bob, breathing, a hop
// when kids cheer.
//
// Vehicles are drawn from the side (the auto from three-quarters), so a cut-out is only
// used while the camera sees the vehicle from about that angle. From the front, from behind
// or from high above, a matching low-poly model (VehicleModels) takes over, the two crossing
// over with a dither. Wheels stay on the road; nothing tilts.

const SIDE_TURN = THREE.MathUtils.degToRad(12);
/** lift off the road, only to keep shadows from z-fighting */
const GROUND_EPS = 0.004;
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const Y = new THREE.Vector3(0, 1, 0);
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
/** footprint of each vehicle's shadow: width, length */
const FOOT: Record<Vehicle['type'] | 'parked', [number, number]> = { scooter: [0.75, 1.9], bicycle: [0.55, 1.8], auto: [1.5, 2.8], rickshaw: [1.3, 2.4], parked: [0.75, 1.9] };

interface Layer {
  sprite: CastSprite;
  mesh: THREE.InstancedMesh;
  fade: THREE.InstancedBufferAttribute | null;
  n: number;
}

function makeLayer(sprite: CastSprite, cap: number, loader: THREE.TextureLoader, maxAniso: number, fading: boolean): Layer {
  const tex = loader.load(sprite.url);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = Math.min(4, maxAniso);
  // pivot at the bottom centre: the plane stands up from y = 0
  const geo = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0);
  // a touch below white so the cut-outs sit in the night scene; fog still applies
  const base = new THREE.MeshBasicMaterial({ map: tex, alphaTest: 0.42, side: THREE.DoubleSide, color: new THREE.Color(0.9, 0.86, 0.82) });
  const mat = fading ? withFade(base) : base;
  const mesh = new THREE.InstancedMesh(geo, mat, cap);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const fade = fading ? addFade(mesh, cap) : null;
  mesh.frustumCulled = false;
  mesh.raycast = () => {};
  mesh.count = 0;
  return { sprite, mesh, fade, n: 0 };
}

/** Put one cut-out in its layer: standing at (x, y, z), turned to `yaw` about the vertical. */
function put(L: Layer, x: number, y: number, z: number, yaw: number, sx: number, sy = 1, fade = 1) {
  if (L.n >= L.mesh.instanceMatrix.count) return;
  const h = L.sprite.height * sy;
  const w = L.sprite.height * L.sprite.aspect * sx;
  _q.setFromAxisAngle(Y, yaw);
  _m.compose(_p.set(x, y, z), _q, _s.set(w, h, 1));
  L.fade?.setX(L.n, fade);
  L.mesh.setMatrixAt(L.n++, _m);
}

const wrap = (a: number) => {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
};

/**
 * The yaw for a side-view cut-out of something heading along (hx, hz): its side turned to
 * the camera, and at most SIDE_TURN further. Returns the yaw and whether to mirror it.
 */
function sideOn(hx: number, hz: number, x: number, z: number, cx: number, cz: number, faces: number) {
  // the side facing the camera
  let nx = hz;
  let nz = -hx;
  if (nx * (cx - x) + nz * (cz - z) < 0) {
    nx = -nx;
    nz = -nz;
  }
  const side = Math.atan2(nx, nz);
  const view = Math.atan2(cx - x, cz - z);
  const yaw = side + THREE.MathUtils.clamp(wrap(view - side), -SIDE_TURN, SIDE_TURN);
  // the plane's +x runs along (cos yaw, -sin yaw); the art looks along +x times `faces`
  const mirror = (Math.cos(yaw) * hx - Math.sin(yaw) * hz) * faces < 0;
  return { yaw, mirror };
}

export function CastSprites() {
  const graphics = useGame((s) => s.settings.graphics);
  const high = graphics === 'high';
  const { camera, gl } = useThree();

  const { people, standing, vehicles, parked, parkedFade, shadow } = useMemo(() => {
    const loader = new THREE.TextureLoader();
    const aniso = gl.capabilities.getMaxAnisotropy();
    const people = {} as Record<PeopleKey, Layer>;
    const standing = {} as Record<PeopleKey, Layer>;
    for (const k of Object.keys(CAST_PEOPLE) as PeopleKey[]) {
      people[k] = makeLayer(CAST_PEOPLE[k], high ? 140 : 80, loader, aniso, true);
      standing[k] = makeLayer(CAST_PEOPLE_STAND[k], high ? 140 : 80, loader, aniso, true);
    }
    const vehicles = {} as Record<VehicleKey, Layer>;
    for (const k of Object.keys(CAST_VEHICLES) as VehicleKey[]) vehicles[k] = makeLayer(CAST_VEHICLES[k], 24, loader, aniso, true);
    // the parked gift scooters' 3D model, for when they are seen end-on
    const pmat = withFade(high ? new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0.08 }) : new THREE.MeshLambertMaterial({ vertexColors: true }));
    const parked = new THREE.InstancedMesh(vehicleModel('parkedScooter'), pmat, 24);
    parked.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const parkedFade = addFade(parked, 24);
    parked.frustumCulled = false;
    parked.raycast = () => {};
    parked.count = 0;
    // soft oval contact shadows under everyone and everything, flat on the ground
    const smat = new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 });
    const shadow = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), smat, 420);
    shadow.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    shadow.frustumCulled = false;
    shadow.raycast = () => {};
    shadow.renderOrder = 2;
    shadow.count = 0;
    return { people, standing, vehicles, parked, parkedFade, shadow };
  }, [gl, high]);
  useEffect(
    () => () => {
      for (const L of [...Object.values(people), ...Object.values(standing), ...Object.values(vehicles)]) {
        (L.mesh.material as THREE.MeshBasicMaterial).map?.dispose();
        (L.mesh.material as THREE.Material).dispose();
        L.mesh.geometry.dispose();
      }
      (parked.material as THREE.Material).dispose();
      parked.geometry.dispose();
      (shadow.material as THREE.Material).dispose();
      shadow.geometry.dispose();
    },
    [people, standing, vehicles, parked, shadow],
  );

  // the way each person currently looks (-1..1), eased so a turn reads like a paper cut-out
  const facing = useMemo(() => new Map<Agent, number>(), []);
  // how far each person is into standing still (0 walking .. 1 standing)
  const still = useMemo(() => new Map<Agent, number>(), []);

  const update = useMemo(() => {
    let clock = 0;
    return (cx: number, cy: number, cz: number, dt: number, player: boolean) => {
      clock += dt;
      const t = clock;
      const reduced = useGame.getState().settings.reducedMotion;
      const far = high ? 72 : 52;
      for (const L of Object.values(people)) L.n = 0;
      for (const L of Object.values(standing)) L.n = 0;
      for (const L of Object.values(vehicles)) L.n = 0;
      let ns = 0;
      let np = 0;
      const shade = (x: number, y: number, z: number, yaw: number, w: number, l: number) => {
        if (ns >= shadow.instanceMatrix.count) return;
        _q.setFromAxisAngle(Y, yaw);
        _m.compose(_p.set(x, y + GROUND_EPS * 3, z), _q, _s.set(w, 1, l));
        shadow.setMatrixAt(ns++, _m);
      };

      // ---- people
      for (const a of crowd.agents) {
        if (a.kind === 'dog' || a.owner === 'rider' || a.hidden) continue;
        // where the feet go: the floor under the agent (a sitter's seat is lifted off it).
        // A cut-out cannot sit, so sitters stand just in front of their seat.
        const floor = a.sit ? a.y - 0.04 : a.y;
        let x = a.x;
        let z = a.z;
        if (a.sit) {
          // step off the bench on the side towards the gali (forward when both are the same)
          const ox = Math.sin(a.ry) * 0.5;
          const oz = Math.cos(a.ry) * 0.5;
          const back = Math.abs(z - oz) < Math.abs(z + oz) - 0.05;
          x += back ? -ox : ox;
          z += back ? -oz : oz;
        }
        const dx = x - cx;
        const dz = z - cz;
        const d2 = dx * dx + dz * dz;
        // too close to the lens (a spotlight framing beside someone) or too far to matter
        if (d2 > far * far || (player && d2 < 1.7 * 1.7)) continue;
        const key = personSprite(a);
        const L = people[key];
        const S = standing[key];
        // turn about the vertical only, towards the camera
        const yaw = Math.atan2(cx - x, cz - z);
        const fx = Math.sin(a.ry);
        const fz = Math.cos(a.ry);
        // the walking art looks along the plane's x axis (times `faces`); mirror it to look ahead
        const look = (Math.cos(yaw) * fx - Math.sin(yaw) * fz) * L.sprite.faces;
        const want = look < -0.05 ? -1 : 1;
        const mv = Math.min(1, a.moving);
        const f0 = facing.get(a) ?? want;
        const f = reduced || dt === 0 ? want : f0 + (want - f0) * Math.min(1, dt * 9);
        const sw0 = still.get(a) ?? (mv < 0.05 ? 1 : 0);
        const swWant = mv < 0.05 ? 1 : 0;
        const sw = reduced || dt === 0 ? (dt === 0 ? sw0 : swWant) : sw0 + Math.sign(swWant - sw0) * Math.min(Math.abs(swWant - sw0), dt * 4);
        if (dt > 0) {
          facing.set(a, f);
          still.set(a, sw);
        }
        let y = floor;
        let sy = a.scale;
        let sx = a.scale;
        if (!reduced) {
          if (mv > 0.05) {
            // a light step bob, no rocking
            y += Math.abs(Math.sin(a.phase * 2.2)) * 0.03 * mv;
          } else {
            sy *= 1 + Math.sin(t * 1.6 + a.idx) * 0.006;
          }
          const k = a.reactDur > 0 ? a.reactT / a.reactDur : 1;
          if (a.react === 'cheer' || a.react === 'clap') y += Math.max(0, Math.sin(a.reactT * 11)) * (a.kind === 'child' ? 0.22 : 0.08) * (1 - k);
          else if (a.react === 'flinch' || a.react === 'step' || a.react === 'ears') {
            sy *= 1 - 0.05 * (1 - k);
            sx *= 1 + 0.025 * (1 - k);
          }
        }
        // a paper turn: the width passes through zero; keep a sliver so it never vanishes
        const fs = (f < 0 ? -1 : 1) * Math.max(0.06, Math.abs(f));
        if (sw < 0.998) put(L, x, y + GROUND_EPS, z, yaw, sx * fs, sy, 1 - sw);
        if (sw > 0.002) put(S, x, y + GROUND_EPS, z, yaw, sx, sy, sw);
        const w = L.sprite.height * L.sprite.aspect * a.scale;
        shade(x, floor, z, a.ry, Math.min(0.75, 0.28 + w * 0.45), 0.42 * a.scale * (1 - Math.min(0.3, (y - floor) * 1.5)));
      }

      // ---- vehicles on the road
      const fades = trafficState.fades;
      for (const v of trafficState.list) {
        const z = v.z + v.off;
        const hx = Math.sin(v.yaw);
        const hz = Math.cos(v.yaw);
        const L = vehicles[VEHICLE_SPRITE[v.type]];
        const dx = v.x - cx;
        const dz = z - cz;
        // the three-quarter auto suits a view from about 45° off its nose; the rest are side views
        const w3d = v.type === 'auto' ? 1 - threeQuarterWeight(hx, hz, v.x, z, cx, cy, cz) : modelWeight(hx, hz, v.x, z, cx, cy, cz);
        fades?.[v.type].setX(v.slot, w3d);
        if (dx * dx + dz * dz > far * far) continue;
        if (w3d < 0.998) {
          if (v.type === 'auto') {
            const yaw = Math.atan2(cx - v.x, cz - z);
            const mirror = (Math.cos(yaw) * hx - Math.sin(yaw) * hz) * L.sprite.faces < 0;
            put(L, v.x, GROUND_EPS, z, yaw, mirror ? -1 : 1, 1, 1 - w3d);
          } else {
            const { yaw, mirror } = sideOn(hx, hz, v.x, z, cx, cz, L.sprite.faces);
            put(L, v.x, GROUND_EPS, z, yaw, mirror ? -1 : 1, 1, 1 - w3d);
          }
        }
        const [fw, fl] = FOOT[v.type];
        shade(v.x, 0, z, v.yaw, fw, fl);
      }
      if (fades) for (const k of Object.keys(fades) as Vehicle['type'][]) fades[k].needsUpdate = true;

      // ---- parked scooters, chunk by chunk
      const kp = chunkOf(cx);
      const vars = getVariants();
      const P = vehicles.parkedScooter;
      for (let k = kp - 2; k <= kp + 2; k++) {
        const ox = k * STREET.chunk;
        for (const pr of vars[variantAt(k)].props) {
          const x = pr.x + ox;
          const dx = x - cx;
          const dz = pr.z - cz;
          if (dx * dx + dz * dz > far * far) continue;
          // its length runs along the prop's ry (the sprite's width); the model faces +z
          const heading = pr.ry + Math.PI / 2;
          const hx = Math.sin(heading);
          const hz = Math.cos(heading);
          const w3d = modelWeight(hx, hz, x, pr.z, cx, cy, cz);
          if (w3d < 0.998) {
            const { yaw, mirror } = sideOn(hx, hz, x, pr.z, cx, cz, P.sprite.faces);
            put(P, x, GROUND_EPS, pr.z, yaw, mirror ? -1 : 1, 1, 1 - w3d);
          }
          if (w3d > 0.002 && np < parked.instanceMatrix.count) {
            _q.setFromAxisAngle(Y, heading);
            _m.compose(_p.set(x, 0, pr.z), _q, _s.set(1, 1, 1));
            parkedFade.setX(np, w3d);
            parked.setMatrixAt(np++, _m);
          }
          shade(x, 0, pr.z, heading, FOOT.parked[0], FOOT.parked[1]);
        }
      }

      for (const L of [...Object.values(people), ...Object.values(standing), ...Object.values(vehicles)]) {
        for (let i = L.n; i < L.mesh.count; i++) L.mesh.setMatrixAt(i, ZERO);
        L.mesh.count = L.n;
        L.mesh.instanceMatrix.needsUpdate = true;
        if (L.fade) L.fade.needsUpdate = true;
      }
      parked.count = np;
      parked.instanceMatrix.needsUpdate = true;
      parkedFade.needsUpdate = true;
      shadow.count = ns;
      shadow.instanceMatrix.needsUpdate = true;
    };
  }, [people, standing, vehicles, parked, parkedFade, shadow, facing, still, high]);

  // other cameras (the overview photo) turn the cast towards themselves for their render
  useEffect(() => {
    runtime.billboard = (x, y, z) => update(x, y, z, 0, false);
    return () => {
      runtime.billboard = null;
    };
  }, [update]);

  useFrame((_, dt) => {
    update(camera.position.x, camera.position.y, camera.position.z, Math.min(dt, 0.1), true);
  });

  return (
    <group>
      {Object.values(people).map((L) => (
        <primitive key={L.sprite.id} object={L.mesh} />
      ))}
      {Object.values(standing).map((L) => (
        <primitive key={L.sprite.id} object={L.mesh} />
      ))}
      {Object.values(vehicles).map((L) => (
        <primitive key={L.sprite.id} object={L.mesh} />
      ))}
      <primitive object={parked} />
      <primitive object={shadow} />
    </group>
  );
}
