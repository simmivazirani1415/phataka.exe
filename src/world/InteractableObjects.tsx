import { useMemo, useRef } from 'react';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import { getWorld } from './WorldBuilder';
import { paint } from '../assets/ProceduralModels';
import { runtime } from '../game/Runtime';
import { useGame } from '../game/GameState';
import { appearScale, propDelay } from './Appear';
import { audio } from '../audio/AudioEngine';
import { DIALOGUE, PROPS } from '../assets/AssetRegistry';

const hoverOn = (e: ThreeEvent<PointerEvent>) => {
  e.stopPropagation();
  document.body.style.cursor = 'pointer';
};
const hoverOff = () => (document.body.style.cursor = '');

/** Procedural scooter factory (registry: PROPS.scooter). */
function buildScooter(palette: string[]) {
  const g = new THREE.Group();
  const [body, trim] = palette;
  const add = (geo: THREE.BufferGeometry, color: string, p: [number, number, number], r: [number, number, number] = [0, 0, 0], s: [number, number, number] = [1, 1, 1], rough = 0.5) => {
    const m = new THREE.Mesh(geo, paint(color, rough, rough < 0.5 ? 0.3 : 0));
    m.position.set(...p);
    m.rotation.set(...r);
    m.scale.set(...s);
    m.castShadow = true;
    g.add(m);
    return m;
  };
  const box = new THREE.BoxGeometry(1, 1, 1);
  const wheel = new THREE.CylinderGeometry(0.22, 0.22, 0.12, 16);
  add(wheel, '#1E1E22', [-0.55, 0.22, 0], [Math.PI / 2, 0, 0]);
  add(wheel, '#1E1E22', [0.6, 0.22, 0], [Math.PI / 2, 0, 0]);
  add(box, body, [-0.35, 0.5, 0], [0, 0, 0], [0.75, 0.42, 0.48], 0.4);
  add(box, body, [0.05, 0.3, 0], [0, 0, 0], [0.5, 0.14, 0.4], 0.4);
  add(box, body, [0.52, 0.62, 0], [0, 0, -0.25], [0.18, 0.7, 0.42], 0.4);
  add(box, '#2B2522', [-0.35, 0.76, 0], [0, 0, 0], [0.62, 0.1, 0.36], 0.9);
  add(box, trim, [0.58, 0.96, 0], [0, 0, 0], [0.12, 0.08, 0.7], 0.4);
  add(box, '#9AA0A8', [0.62, 1.0, 0], [0, 0, 0], [0.05, 0.25, 0.05], 0.3);
  add(box, trim, [0.62, 0.36, 0], [0, 0, 0], [0.3, 0.08, 0.36], 0.4);
  const lamp = add(new THREE.SphereGeometry(0.09, 10, 8), '#FFF3C4', [0.7, 0.9, 0]);
  lamp.material = new THREE.MeshStandardMaterial({ color: '#FFF3C4', emissive: '#FFE7A3', emissiveIntensity: 0.4 });
  return { g, lamp };
}

function Scooter() {
  const a = getWorld().anchors['scooter'];
  const { g, lamp } = useMemo(() => buildScooter(PROPS.scooter.palette!), []);
  const ref = useRef<THREE.Group>(null!);
  const bounce = useRef(0);
  useFrame(() => {
    const sc = appearScale(propDelay(a.pos[0]), runtime.assemblyTime);
    ref.current.visible = sc > 0;
    ref.current.scale.setScalar(sc * PROPS.scooter.scale);
    const left = bounce.current - performance.now();
    const k = left > 0 ? left / 700 : 0;
    g.position.y = Math.abs(Math.sin(k * Math.PI * 3)) * 0.12 * k;
    g.rotation.z = Math.sin(k * Math.PI * 4) * 0.04 * k;
    (lamp.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.4 + k * 3;
  });
  return (
    <group
      ref={ref}
      position={a.pos}
      rotation={[0, a.rotY ?? 0, 0]}
      onClick={(e) => {
        e.stopPropagation();
        if (e.delta > 8) return;
        bounce.current = performance.now() + 700;
        audio.horn();
        runtime.emit({ kind: 'interaction', pos: a.pos, strength: 0.3 });
        useGame.getState().say('Peep peep!', [a.pos[0], 1.5, a.pos[2]], 1200);
      }}
      onDoubleClick={(e) => {
        e.stopPropagation();
        runtime.camera?.goTo({ target: [a.pos[0], 0.8, a.pos[2]], zoom: 3.4 }, 0.9);
      }}
      onPointerOver={hoverOn}
      onPointerOut={hoverOff}
    >
      <primitive object={g} />
      <mesh position={[0, 0.6, 0]} visible={false}>
        <boxGeometry args={[1.8, 1.3, 0.9]} />
      </mesh>
    </group>
  );
}

/** Kettle on the chai stall: click for a whistle and a puff of steam. */
function ChaiKettle() {
  const a = getWorld().anchors['chai.kettle'];
  const ref = useRef<THREE.Group>(null!);
  const lid = useRef<THREE.Mesh>(null!);
  const puffs = useRef<THREE.Mesh[]>([]);
  const until = useRef(0);
  const steamMat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#E8EEF5', transparent: true, opacity: 0.0, depthWrite: false }), []);
  useFrame((st) => {
    const sc = appearScale(propDelay(a.pos[0], 0.2), runtime.assemblyTime);
    ref.current.visible = sc > 0;
    ref.current.scale.setScalar(sc);
    const left = until.current - performance.now();
    const k = left > 0 ? left / 1800 : 0;
    lid.current.position.y = 0.3 + Math.abs(Math.sin(st.clock.elapsedTime * 30)) * 0.03 * k;
    const t = st.clock.elapsedTime;
    puffs.current.forEach((p, i) => {
      const ph = (t * 0.6 + i / puffs.current.length) % 1;
      p.position.set(0.22 + ph * 0.3, 0.32 + ph * 1.2, Math.sin(ph * 6 + i) * 0.08);
      p.scale.setScalar(0.08 + ph * 0.22);
    });
    steamMat.opacity = 0.12 + k * 0.45;
  });
  return (
    <group
      ref={ref}
      position={a.pos}
      onClick={(e) => {
        e.stopPropagation();
        if (e.delta > 8) return;
        until.current = performance.now() + 1800;
        audio.kettle();
        useGame.getState().say(DIALOGUE.chai[Math.floor(Math.random() * DIALOGUE.chai.length)], [a.pos[0] + 0.6, a.pos[1] + 1.1, a.pos[2]], 1600);
      }}
      onPointerOver={hoverOn}
      onPointerOut={hoverOff}
    >
      <mesh castShadow position={[0, 0.14, 0]}>
        <cylinderGeometry args={[0.14, 0.18, 0.26, 12]} />
        <meshStandardMaterial color="#B9BEC6" metalness={0.7} roughness={0.3} />
      </mesh>
      <mesh ref={lid} position={[0, 0.3, 0]}>
        <cylinderGeometry args={[0.1, 0.13, 0.06, 12]} />
        <meshStandardMaterial color="#A0A6AF" metalness={0.7} roughness={0.3} />
      </mesh>
      <mesh position={[0.2, 0.2, 0]} rotation={[0, 0, -0.9]}>
        <cylinderGeometry args={[0.025, 0.04, 0.2, 8]} />
        <meshStandardMaterial color="#B9BEC6" metalness={0.7} roughness={0.3} />
      </mesh>
      {[0, 1, 2, 3, 4].map((i) => (
        <mesh key={i} ref={(m) => { if (m) puffs.current[i] = m; }} material={steamMat}>
          <sphereGeometry args={[1, 8, 6]} />
        </mesh>
      ))}
      <mesh position={[0.5, 0.0, 0]} visible={false}>
        <boxGeometry args={[2.2, 1.0, 1.0]} />
      </mesh>
    </group>
  );
}

export function InteractableObjects() {
  return (
    <>
      <Scooter />
      <ChaiKettle />
    </>
  );
}
