import { useEffect, useMemo, useRef } from 'react';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import { getWorld, type CharacterSpec } from './WorldBuilder';
import { paint } from '../assets/ProceduralModels';
import { runtime, type WorldEvent } from '../game/Runtime';
import { useGame } from '../game/GameState';
import { appearScale, propDelay } from './Appear';
import { DIALOGUE, PROPS } from '../assets/AssetRegistry';
import { audio } from '../audio/AudioEngine';

// Small voxel cast with simple procedural animation. Characters are ambient detail:
// they breathe, look around, chat, wave and react to nearby fireworks.

const unit = new THREE.BoxGeometry(1, 1, 1);
const skirtGeo = new THREE.CylinderGeometry(0.17, 0.26, 1, 8);

interface Rig {
  root: THREE.Group;
  body: THREE.Group;
  head: THREE.Group;
  armL: THREE.Group;
  armR: THREE.Group;
  legL?: THREE.Group;
  legR?: THREE.Group;
  torso: THREE.Mesh;
}

function part(geo: THREE.BufferGeometry, color: string, s: [number, number, number], p: [number, number, number], r: [number, number, number] = [0, 0, 0]) {
  const m = new THREE.Mesh(geo, paint(color, 0.85));
  m.scale.set(...s);
  m.position.set(...p);
  m.rotation.set(...r);
  m.castShadow = true;
  return m;
}

function buildPerson(spec: CharacterSpec): Rig {
  const { colors, kind, pose } = spec;
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const female = kind === 'woman' || (kind === 'elder' && spec.id === 'dadi');
  const sitting = pose === 'sit';
  const hipY = sitting ? 0.06 : 0.62;
  let legL: THREE.Group | undefined;
  let legR: THREE.Group | undefined;
  if (female && !sitting) {
    body.add(part(skirtGeo, colors.bottom, [1, 0.64, 1], [0, 0.32, 0]));
  } else {
    legL = new THREE.Group();
    legR = new THREE.Group();
    legL.position.set(-0.1, hipY, 0);
    legR.position.set(0.1, hipY, 0);
    const legCol = female ? colors.bottom : colors.bottom;
    legL.add(part(unit, legCol, [0.15, 0.6, 0.17], [0, -0.3, 0]));
    legR.add(part(unit, legCol, [0.15, 0.6, 0.17], [0, -0.3, 0]));
    legL.add(part(unit, '#3A2A20', [0.16, 0.06, 0.22], [0, -0.6, 0.03]));
    legR.add(part(unit, '#3A2A20', [0.16, 0.06, 0.22], [0, -0.6, 0.03]));
    if (sitting) {
      legL.rotation.x = -1.45;
      legR.rotation.x = -1.45;
    }
    body.add(legL, legR);
    if (female) body.add(part(unit, colors.bottom, [0.4, 0.18, 0.5], [0, hipY - 0.02, 0.15]));
  }
  const torsoY = hipY + 0.28;
  // kurta is longer than a shirt
  const kurta = kind === 'man' || kind === 'elder' || kind === 'chaiwala';
  const torso = part(unit, colors.top, [0.4, kurta ? 0.72 : 0.5, 0.25], [0, torsoY + (kurta ? 0.0 : 0.08), 0]);
  body.add(torso);
  if (colors.drape) {
    if (female) body.add(part(unit, colors.drape, [0.12, 0.66, 0.27], [0.08, torsoY + 0.12, 0], [0, 0, 0.55]));
    else body.add(part(unit, colors.drape, [0.42, 0.3, 0.27], [0, torsoY + 0.2, 0.002]));
  }
  const shoulderY = torsoY + 0.3;
  const armL = new THREE.Group();
  const armR = new THREE.Group();
  armL.position.set(-0.26, shoulderY, 0);
  armR.position.set(0.26, shoulderY, 0);
  armL.add(part(unit, colors.top, [0.11, 0.46, 0.13], [0, -0.22, 0]));
  armR.add(part(unit, colors.top, [0.11, 0.46, 0.13], [0, -0.22, 0]));
  armL.add(part(unit, colors.skin, [0.1, 0.1, 0.11], [0, -0.48, 0]));
  armR.add(part(unit, colors.skin, [0.1, 0.1, 0.11], [0, -0.48, 0]));
  body.add(armL, armR);
  const head = new THREE.Group();
  head.position.set(0, shoulderY + 0.06, 0);
  head.add(part(unit, colors.skin, [0.08, 0.08, 0.08], [0, 0.02, 0]));
  head.add(part(unit, colors.skin, [0.28, 0.3, 0.27], [0, 0.2, 0]));
  head.add(part(unit, colors.hair, [0.3, 0.1, 0.29], [0, 0.37, -0.01]));
  head.add(part(unit, colors.hair, [0.3, 0.22, 0.07], [0, 0.26, -0.13]));
  if (female) {
    head.add(part(unit, colors.hair, [0.14, 0.14, 0.12], [0, 0.26, -0.2]));
    head.add(part(unit, '#CE382A', [0.03, 0.03, 0.01], [0, 0.27, 0.136]));
    if (colors.drape) head.add(part(unit, colors.drape, [0.31, 0.08, 0.31], [0, 0.4, -0.03]));
  }
  if (kind === 'man' || kind === 'chaiwala') head.add(part(unit, '#2B2522', [0.16, 0.03, 0.01], [0, 0.15, 0.137]));
  if (kind === 'elder') {
    head.add(part(unit, '#2A2A2A', [0.08, 0.05, 0.01], [-0.065, 0.22, 0.14]));
    head.add(part(unit, '#2A2A2A', [0.08, 0.05, 0.01], [0.065, 0.22, 0.14]));
  }
  head.add(part(unit, '#1A1412', [0.035, 0.035, 0.01], [-0.06, 0.22, 0.136]));
  head.add(part(unit, '#1A1412', [0.035, 0.035, 0.01], [0.06, 0.22, 0.136]));
  body.add(head);
  if (kind === 'child') root.scale.setScalar(0.66);
  if (kind === 'chaiwala') head.add(part(unit, '#FFF0D2', [0.32, 0.07, 0.31], [0, 0.42, 0]));
  return { root, body, head, armL, armR, legL, legR, torso };
}

function buildDog(spec: CharacterSpec): Rig {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const c = spec.colors.top;
  const torso = part(unit, c, [0.72, 0.26, 0.32], [0, 0.14, 0]);
  body.add(torso);
  body.add(part(unit, '#F2E3C4', [0.4, 0.06, 0.26], [0.05, 0.02, 0]));
  const head = new THREE.Group();
  head.position.set(0.45, 0.14, 0.05);
  head.add(part(unit, c, [0.26, 0.2, 0.24], [0, 0, 0]));
  head.add(part(unit, '#2A1A10', [0.06, 0.05, 0.06], [0.14, -0.02, 0]));
  head.add(part(unit, spec.colors.hair, [0.08, 0.1, 0.05], [-0.04, 0.1, 0.1]));
  head.add(part(unit, spec.colors.hair, [0.08, 0.1, 0.05], [-0.04, 0.1, -0.1]));
  body.add(head);
  const tail = new THREE.Group();
  tail.position.set(-0.36, 0.18, 0);
  tail.add(part(unit, c, [0.22, 0.06, 0.06], [-0.1, 0, 0.08], [0, 0.6, 0]));
  body.add(tail);
  return { root, body, head, armL: tail, armR: tail, torso };
}

function Character({ spec, delay }: { spec: CharacterSpec; delay: number }) {
  const rig = useMemo(() => (spec.kind === 'dog' ? buildDog(spec) : buildPerson(spec)), [spec]);
  const holder = useRef<THREE.Group>(null!);
  const state = useRef({ phase: Math.random() * 10, react: 0, reactKind: 0, walkT: Math.random(), dir: 1, appearAt: -1, waveUntil: 0 });

  useEffect(() => {
    const off = runtime.on((e: WorldEvent) => {
      const p = spec.pos;
      const d = Math.hypot(e.pos[0] - p[0], e.pos[2] - p[2]);
      if (d < (e.kind === 'bigBurst' || e.kind === 'bomb' ? 22 : 12)) {
        state.current.react = performance.now() + (900 + Math.random() * 500);
        state.current.reactKind = e.kind === 'bigBurst' ? 1 : 0;
      }
    });
    return off;
  }, [spec]);

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    if (e.delta > 8) return;
    state.current.react = performance.now() + 900;
    const head: [number, number, number] = [spec.pos[0], spec.pos[1] + 1.6, spec.pos[2]];
    if (spec.interactive === 'dog') {
      audio.woof();
      useGame.getState().say('Bhow! ...zzz', [spec.pos[0], spec.pos[1] + 0.8, spec.pos[2]], 1600);
    } else {
      audio.boing();
      const lines = spec.interactive === 'child' ? PROPS.balconyChild.interaction!.caption! : DIALOGUE.wow;
      useGame.getState().say(lines[Math.floor(Math.random() * lines.length)], head, 1800);
    }
  };

  useFrame((st, dt) => {
    const g = holder.current;
    if (!g) return;
    const s = state.current;
    const stage = useGame.getState().stage();
    // appearance: during assembly or when unlocked by progression
    let sc: number;
    if (spec.stage > 0) {
      if (stage >= spec.stage) {
        if (s.appearAt < 0) s.appearAt = Math.max(runtime.assemblyTime, delay);
        sc = appearScale(s.appearAt, runtime.assemblyTime);
      } else sc = 0;
    } else sc = appearScale(delay, runtime.assemblyTime);
    g.visible = sc > 0.001;
    if (!g.visible) return;
    g.scale.setScalar(sc);
    const t = st.clock.elapsedTime + s.phase;
    const now = performance.now();
    const reacting = s.react > now;
    const reduced = useGame.getState().settings.reducedMotion;
    const { body, head, armL, armR, legL, legR } = rig;
    // idle breathing
    body.scale.y = 1 + Math.sin(t * 2.1) * (spec.pose === 'sleep' ? 0.04 : 0.012);
    if (spec.kind === 'dog') {
      head.rotation.z = reacting ? Math.sin(t * 20) * 0.15 : 0;
      armL.rotation.y = 0.6 + Math.sin(t * (reacting ? 18 : 1.5)) * (reacting ? 0.5 : 0.1);
      body.position.y = 0;
      return;
    }
    head.rotation.y = Math.sin(t * 0.45) * 0.35;
    head.rotation.x = 0;
    armL.rotation.set(0, 0, 0.08);
    armR.rotation.set(0, 0, -0.08);
    body.position.y = 0;
    let rotY = spec.rotY;
    switch (spec.anim) {
      case 'talk':
        armR.rotation.x = -0.5 + Math.sin(t * 3.2) * 0.35;
        armR.rotation.z = -0.2;
        head.rotation.x = Math.sin(t * 4.1) * 0.06;
        break;
      case 'wave': {
        const cycle = t % 7;
        if (cycle < 2) {
          armR.rotation.z = -2.6;
          armR.rotation.x = Math.sin(t * 9) * 0.35;
        }
        break;
      }
      case 'look':
        head.rotation.x = -0.25 + Math.sin(t * 0.3) * 0.15;
        if (spec.interactive === 'child') {
          armL.rotation.x = -1.2;
          armR.rotation.x = -1.2;
        }
        break;
      case 'walk': {
        if (!spec.walk || reduced) break;
        const [a, b] = spec.walk;
        const len = Math.hypot(b[0] - a[0], b[2] - a[2]);
        s.walkT += Math.min(dt, 0.1) * (0.55 / len) * s.dir;
        if (s.walkT > 1 || s.walkT < 0) {
          s.dir *= -1;
          s.walkT = THREE.MathUtils.clamp(s.walkT, 0, 1);
        }
        g.position.set(a[0] + (b[0] - a[0]) * s.walkT, a[1], a[2] + (b[2] - a[2]) * s.walkT);
        rotY = Math.atan2((b[0] - a[0]) * s.dir, (b[2] - a[2]) * s.dir);
        if (legL && legR) {
          legL.rotation.x = Math.sin(t * 8) * 0.5;
          legR.rotation.x = -Math.sin(t * 8) * 0.5;
        }
        armL.rotation.x = -Math.sin(t * 8) * 0.4;
        armR.rotation.x = Math.sin(t * 8) * 0.4;
        break;
      }
    }
    if (reacting) {
      const k = (s.react - now) / 1200;
      if (!reduced) body.position.y = Math.abs(Math.sin(k * Math.PI * 2)) * 0.18;
      armL.rotation.z = 2.5;
      armR.rotation.z = -2.5;
      head.rotation.x = -0.45;
    }
    g.rotation.y = rotY;
  });

  return (
    <group ref={holder} position={spec.pos} rotation={[0, spec.rotY, 0]} onClick={onClick} onPointerOver={(e) => { e.stopPropagation(); document.body.style.cursor = 'pointer'; }} onPointerOut={() => (document.body.style.cursor = '')}>
      <primitive object={rig.root} />
      {/* generous invisible hit volume for easy tapping */}
      <mesh position={[0, 0.8, 0]} visible={false}>
        <boxGeometry args={[0.8, 1.7, 0.8]} />
      </mesh>
    </group>
  );
}

export function Characters() {
  const world = getWorld();
  const graphics = useGame((s) => s.settings.graphics);
  const list = useMemo(() => world.characters.filter((c, i) => graphics === 'high' || c.stage > 0 || c.interactive || i % 3 !== 2), [world, graphics]);
  // pick one nearby character to speak per firework so speech never piles up
  useEffect(() => {
    let last = 0;
    return runtime.on((e) => {
      if (e.kind === 'interaction' || e.kind === 'stage') return;
      const now = performance.now();
      if (now - last < 2500) return;
      const stage = useGame.getState().stage();
      const near = world.characters
        .filter((c) => c.kind !== 'dog' && stage >= c.stage)
        .map((c) => ({ c, d: Math.hypot(c.pos[0] - e.pos[0], c.pos[2] - e.pos[2]) }))
        .sort((a, b) => a.d - b.d)[0];
      if (!near || near.d > 16) return;
      last = now;
      const lines = e.text ? [e.text] : e.kind === 'bomb' ? DIALOGUE.bomb : DIALOGUE.wow;
      window.setTimeout(() => useGame.getState().say(lines[Math.floor(Math.random() * lines.length)], [near.c.pos[0], near.c.pos[1] + 1.7, near.c.pos[2]], 2000), 350);
    });
  }, [world]);
  return (
    <group>
      {list.map((c) => (
        <Character key={c.id} spec={c} delay={propDelay(c.pos[0], 0.3)} />
      ))}
    </group>
  );
}
