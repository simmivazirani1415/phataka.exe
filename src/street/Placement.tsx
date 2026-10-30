import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { create } from 'zustand';
import { PACKAGE_BY_ID, type PackageId } from '../assets/AssetRegistry';
import { useGame } from '../game/GameState';
import { runtime } from '../game/Runtime';
import { checkSpot, CLEARANCE, placeFloor, placeNear, type PlaceCheck } from '../game/DiscoverySystem';
import { audio } from '../audio/AudioEngine';

// Carrying a cracker from the tray to the ground. A reticle follows the pointer (or the
// finger) over the road: a gold ring where it may go, an orange one where it is too tight
// (walls, people, vehicles). Releasing a drag, or tapping, puts it down, at the nearest good
// spot if that one is too tight.

interface PlaceStore {
  check: PlaceCheck | null;
}
export const usePlace = create<PlaceStore>(() => ({ check: null }));

/** Screen-space pointer, shared with the tray's drag. */
export const pointer = { x: 0, y: 0, has: false, overUi: false };

const _ray = new THREE.Raycaster();
const _ndc = new THREE.Vector2();
const _hit = new THREE.Vector3();
const GROUND = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

/** Where on the ground is the pointer (or, without one, the middle of the view ahead)? */
function groundUnder(camera: THREE.Camera, w: number, h: number, id: PackageId): THREE.Vector3 | null {
  const x = pointer.has ? pointer.x : w / 2;
  const y = pointer.has ? pointer.y : h * 0.72;
  _ndc.set((x / w) * 2 - 1, -(y / h) * 2 + 1);
  _ray.setFromCamera(_ndc, camera);
  GROUND.constant = -placeFloor(id);
  return _ray.ray.intersectPlane(GROUND, _hit);
}

/** Try to put the carried cracker down under the pointer. */
export function dropHere(): boolean {
  const g = useGame.getState();
  const id = g.placing;
  const r = runtime.reticle;
  if (!id || !r) return false;
  // a bad spot never blocks: it goes down at the nearest good one instead
  if (r.check !== 'ok') audio.tap();
  void placeNear(id, r.x, r.z);
  return true;
}

export function Placement() {
  const placing = useGame((s) => s.placing);
  const { camera, size, gl } = useThree();
  const group = useRef<THREE.Group>(null!);
  const ring = useRef<THREE.Mesh>(null!);
  const disc = useRef<THREE.Mesh>(null!);
  const cross = useRef<THREE.Group>(null!);
  const arrow = useRef<THREE.Mesh>(null!);
  const last = useRef<{ id: PackageId | null; x: number; z: number } | null>(null);
  /** the latest reticle update, so the pointer listeners (bound once) never use a stale view size */
  const update = useRef<() => unknown>(() => null);

  const mats = useMemo(
    () => ({
      ok: new THREE.Color('#FFD15A'),
      bad: new THREE.Color('#F08A3C'),
    }),
    [],
  );

  // track the pointer over the canvas; a tap on the ground puts the cracker down
  useEffect(() => {
    const el = gl.domElement;
    let down: { x: number; y: number; id: number } | null = null;
    const move = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      pointer.x = e.clientX - r.left;
      pointer.y = e.clientY - r.top;
      pointer.has = true;
      // touch drags stay captured by the element they started on, so look at what is under the finger
      pointer.overUi = document.elementFromPoint(e.clientX, e.clientY) !== el;
    };
    const pd = (e: PointerEvent) => {
      move(e);
      down = { x: e.clientX, y: e.clientY, id: e.pointerId };
    };
    const pu = (e: PointerEvent) => {
      if (!down || down.id !== e.pointerId) return;
      const tap = Math.hypot(e.clientX - down.x, e.clientY - down.y) < 8;
      down = null;
      if (tap && useGame.getState().placing) {
        move(e);
        // re-evaluate exactly under the finger before deciding
        update.current();
        dropHere();
      }
    };
    window.addEventListener('pointermove', move);
    el.addEventListener('pointerdown', pd);
    el.addEventListener('pointerup', pu);
    return () => {
      window.removeEventListener('pointermove', move);
      el.removeEventListener('pointerdown', pd);
      el.removeEventListener('pointerup', pu);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gl]);

  const updateReticle = () => {
    const id = useGame.getState().placing;
    if (!id) {
      runtime.reticle = null;
      return null;
    }
    const hit = groundUnder(camera, size.width, size.height, id);
    if (!hit) {
      // pointing at the sky: aim a few steps ahead instead
      const p = runtime.player;
      const l = last.current?.id === id ? last.current : { x: p.x - Math.sin(p.yaw) * 3.5, z: p.z - Math.cos(p.yaw) * 3.5 };
      runtime.reticle = { x: l.x, z: l.z, check: 'far' };
      return runtime.reticle;
    }
    const check = checkSpot(id, hit.x, hit.z);
    runtime.reticle = { x: hit.x, z: hit.z, check };
    last.current = { id, x: hit.x, z: hit.z };
    if (usePlace.getState().check !== check) usePlace.setState({ check });
    return runtime.reticle;
  };
  update.current = updateReticle;

  useEffect(() => {
    if (!placing) {
      usePlace.setState({ check: null });
      runtime.reticle = null;
    }
  }, [placing]);

  useFrame((st) => {
    const g = group.current;
    const id = useGame.getState().placing;
    g.visible = !!id && !pointer.overUi;
    if (!id) return;
    const r = updateReticle();
    if (!r) return;
    const R = CLEARANCE[PACKAGE_BY_ID[id].crackerType];
    const ok = r.check === 'ok';
    g.position.set(r.x, placeFloor(id) + 0.04, r.z);
    const t = st.clock.elapsedTime;
    ring.current.scale.setScalar(R * (1 + Math.sin(t * 5) * 0.03));
    const c = ok ? mats.ok : mats.bad;
    (ring.current.material as THREE.MeshBasicMaterial).color.copy(c);
    (disc.current.material as THREE.MeshBasicMaterial).color.copy(c);
    (disc.current.material as THREE.MeshBasicMaterial).opacity = ok ? 0.22 : 0.16;
    disc.current.scale.setScalar(R);
    cross.current.visible = false;
    cross.current.rotation.y = t * 0.5;
    arrow.current.visible = ok;
    arrow.current.position.y = 0.55 + Math.sin(t * 4) * 0.08;
    arrow.current.rotation.y = t * 1.5;
  });

  return (
    <group ref={group} visible={false}>
      <mesh ref={disc} rotation-x={-Math.PI / 2} renderOrder={7} raycast={() => {}}>
        <circleGeometry args={[1, 40]} />
        <meshBasicMaterial transparent opacity={0.2} depthWrite={false} toneMapped={false} polygonOffset polygonOffsetFactor={-6} />
      </mesh>
      <mesh ref={ring} rotation-x={-Math.PI / 2} renderOrder={8} raycast={() => {}}>
        <ringGeometry args={[0.9, 1, 48]} />
        <meshBasicMaterial transparent opacity={0.95} depthWrite={false} toneMapped={false} polygonOffset polygonOffsetFactor={-7} />
      </mesh>
      <group ref={cross}>
        <mesh rotation={[-Math.PI / 2, 0, Math.PI / 4]} position-y={0.02} renderOrder={8} raycast={() => {}}>
          <planeGeometry args={[1.1, 0.14]} />
          <meshBasicMaterial color="#FF4D3D" transparent opacity={0.95} depthWrite={false} toneMapped={false} />
        </mesh>
        <mesh rotation={[-Math.PI / 2, 0, -Math.PI / 4]} position-y={0.02} renderOrder={8} raycast={() => {}}>
          <planeGeometry args={[1.1, 0.14]} />
          <meshBasicMaterial color="#FF4D3D" transparent opacity={0.95} depthWrite={false} toneMapped={false} />
        </mesh>
      </group>
      <mesh ref={arrow} rotation-x={Math.PI} raycast={() => {}}>
        <coneGeometry args={[0.14, 0.32, 4]} />
        <meshBasicMaterial color="#FFD15A" toneMapped={false} />
      </mesh>
    </group>
  );
}
