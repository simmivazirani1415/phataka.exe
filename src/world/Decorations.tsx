import { useMemo, useRef } from 'react';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { getWorld, type SignSpec } from './WorldBuilder';
import { FONTS, makePosterTexture, makeRangoliTexture, makeSignTexture, makeSilhouetteTexture } from '../utils/TextureGenerator';
import { runtime } from '../game/Runtime';
import { useGame } from '../game/GameState';
import { appearScale, propDelay } from './Appear';
import { audio } from '../audio/AudioEngine';

// Canvas-textured decals and signs, interactive windows and light strings, and the
// short dialogue captions that float above characters.

function Rangolis() {
  const world = getWorld();
  const items = useMemo(() => world.rangolis.map((r) => ({ r, tex: makeRangoliTexture(r.seed, r.colors) })), [world]);
  const refs = useRef<(THREE.Mesh | null)[]>([]);
  useFrame(() => {
    items.forEach(({ r }, i) => {
      const m = refs.current[i];
      if (!m) return;
      const s = appearScale(propDelay(r.pos[0], -0.4), runtime.assemblyTime, 0.9);
      m.visible = s > 0;
      m.scale.setScalar(Math.max(0.001, Math.min(s, 1)) * r.size);
      m.rotation.z = (1 - Math.min(1, s)) * 1.5;
    });
  });
  return (
    <>
      {items.map(({ r, tex }, i) => (
        <mesh key={i} ref={(m) => (refs.current[i] = m)} position={r.pos} rotation={[-Math.PI / 2, 0, 0]} receiveShadow renderOrder={1} raycast={() => {}}>
          <circleGeometry args={[0.5, 48]} />
          <meshStandardMaterial map={tex} transparent roughness={1} polygonOffset polygonOffsetFactor={-2} />
        </mesh>
      ))}
    </>
  );
}

function signTexture(s: SignSpec) {
  switch (s.kind) {
    case 'shop':
      return makeSignTexture({
        w: 1024,
        h: 164,
        bg: '#CE382A',
        border: '#FFD15A',
        lines: [
          { text: 'पटाका भंडार', color: '#FFD15A', font: FONTS.display, size: 74, y: 70 },
          { text: 'MOHALLA PATAKA BHANDAR  ·  SINCE 1987  ·  KHUSHIYON KA KHAZANA', color: '#FFF0D2', font: FONTS.ui, size: 30, y: 128 },
        ],
      });
    case 'chai':
      return makeSignTexture({
        w: 512,
        h: 118,
        bg: '#148C88',
        border: '#FFF0D2',
        lines: [
          { text: 'CHAI · चाय · MITHAI', color: '#FFF0D2', font: FONTS.display, size: 52, y: 52 },
          { text: 'garam garam, pyaar se', color: '#FFD15A', font: FONTS.hand, size: 26, y: 96 },
        ],
      });
    case 'mithai':
      return makeSignTexture({
        w: 640,
        h: 132,
        bg: '#FFF0D2',
        border: '#D64A91',
        lines: [
          { text: 'MEETHA GHAR', color: '#D64A91', font: FONTS.display, size: 62, y: 58 },
          { text: 'laddoo · barfi · jalebi', color: '#A9573B', font: FONTS.hand, size: 28, y: 106 },
        ],
      });
    case 'gate':
      return makeSignTexture({
        w: 720,
        h: 160,
        bg: '#F5A623',
        border: '#CE382A',
        lines: [
          { text: 'स्वागत है', color: '#CE382A', font: FONTS.display, size: 70, y: 66 },
          { text: 'SHUBH DEEPAVALI · MOHALLA GALI NO. 8', color: '#101A32', font: FONTS.ui, size: 28, y: 126 },
        ],
      });
    case 'poster':
    default: {
      const sets: [string, string, string][] = [
        ['#3446A4', '#FFD15A', 'ROCKET'],
        ['#D64A91', '#FFF0D2', 'CHAKRI'],
        ['#1F5B3A', '#F5A623', 'ANAAR'],
      ];
      const [bg, fg, title] = sets[((s.seed ?? 1) - 1) % sets.length];
      return makePosterTexture(s.seed ?? 1, bg, fg, title);
    }
  }
}

function Sign({ s }: { s: SignSpec }) {
  const tex = useMemo(() => signTexture(s), [s]);
  const mat = useRef<THREE.MeshStandardMaterial>(null!);
  const ref = useRef<THREE.Mesh>(null!);
  const lit = useRef(0);
  useFrame((_, dt) => {
    const sc = appearScale(propDelay(s.pos[0], -0.6), runtime.assemblyTime);
    ref.current.visible = sc > 0;
    ref.current.scale.set(sc, sc, 1);
    const stage = useGame.getState().stage();
    const want = s.stage !== undefined ? (stage >= s.stage ? 1 : 0.06) : runtime.assemblyTime > 11.5 ? 0.35 : 0;
    lit.current += (want - lit.current) * Math.min(1, dt * 2);
    if (mat.current) mat.current.emissiveIntensity = lit.current * (s.kind === 'shop' ? 0.9 + Math.sin(performance.now() / 300) * 0.05 : 0.6);
  });
  return (
    <mesh ref={ref} position={s.pos} rotation={[0, s.rotY, 0]} raycast={() => {}}>
      <planeGeometry args={[s.w, s.h]} />
      <meshStandardMaterial ref={mat} map={tex} emissiveMap={tex} emissive="#ffffff" emissiveIntensity={0} roughness={0.8} polygonOffset polygonOffsetFactor={-1} />
    </mesh>
  );
}

function Signs() {
  const world = getWorld();
  return (
    <>
      {world.signs.map((s) => (
        <Sign key={s.id} s={s} />
      ))}
    </>
  );
}

/** A few windows reveal a family silhouette when clicked. */
function SilhouetteWindows() {
  const world = getWorld();
  const picks = useMemo(() => world.windows.filter((_, i) => i % 7 === 3).slice(0, 14), [world]);
  const texs = useMemo(() => [0, 1, 2].map((k) => makeSilhouetteTexture(k)), []);
  const mats = useRef<(THREE.MeshBasicMaterial | null)[]>([]);
  const until = useRef<number[]>(picks.map(() => 0));
  useFrame(() => {
    const now = performance.now();
    picks.forEach((_, i) => {
      const m = mats.current[i];
      if (!m) return;
      const left = until.current[i] - now;
      const target = left > 0 ? Math.min(1, left / 300) : 0;
      m.opacity += (target - m.opacity) * 0.25;
    });
  });
  const click = (i: number) => (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    if (e.delta > 8 || runtime.assemblyTime < 11) return;
    until.current[i] = performance.now() + 2200;
    audio.ting();
    const w = picks[i];
    if (Math.random() < 0.5) useGame.getState().say(['Kaun hai?', 'Happy Diwali!', 'Mithai lo!'][i % 3], [w.pos[0], w.pos[1] + 0.9, w.pos[2]], 1500);
  };
  return (
    <>
      {picks.map((w, i) => (
        <mesh key={i} position={w.pos} rotation={[0, w.rotY, 0]} onClick={click(i)} onPointerOver={(e) => { e.stopPropagation(); document.body.style.cursor = 'pointer'; }} onPointerOut={() => (document.body.style.cursor = '')}>
          <planeGeometry args={[w.w, w.h]} />
          <meshBasicMaterial ref={(m) => (mats.current[i] = m)} map={texs[i % 3]} transparent opacity={0} depthWrite={false} toneMapped={false} />
        </mesh>
      ))}
    </>
  );
}

/** Invisible tap targets along each fairy-light string: clicking plays a chase animation. */
function StringTargets() {
  const world = getWorld();
  const segs = useMemo(() => {
    const out: { id: number; stage: number; pos: THREE.Vector3; len: number; quat: THREE.Quaternion }[] = [];
    for (const s of world.strings) {
      for (let i = 0; i < s.points.length - 1; i++) {
        const a = new THREE.Vector3(...s.points[i]);
        const b = new THREE.Vector3(...s.points[i + 1]);
        const mid = a.clone().add(b).multiplyScalar(0.5);
        mid.y -= 0.15;
        const dir = b.clone().sub(a);
        const len = dir.length();
        const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), dir.normalize());
        out.push({ id: s.id, stage: s.stage, pos: mid, len, quat });
      }
    }
    return out;
  }, [world]);
  const stage = useGame((s) => Object.values(s.packages).filter((p) => p === 'MEMORY_CAPTURED').length);
  return (
    <>
      {segs
        .filter((s) => stage >= s.stage)
        .map((s, i) => (
          <mesh
            key={i}
            position={s.pos}
            quaternion={s.quat}
            visible={false}
            onClick={(e) => {
              e.stopPropagation();
              if (e.delta > 8) return;
              runtime.stringChase.set(s.id, performance.now());
              audio.chime();
            }}
            onPointerOver={(e) => {
              e.stopPropagation();
              document.body.style.cursor = 'pointer';
            }}
            onPointerOut={() => (document.body.style.cursor = '')}
          >
            <boxGeometry args={[s.len, 0.45, 0.45]} />
          </mesh>
        ))}
    </>
  );
}

function Captions() {
  const captions = useGame((s) => s.captions);
  return (
    <>
      {captions.map((c) => (
        <Html key={c.id} position={c.pos} center zIndexRange={[20, 0]} pointerEvents="none">
          <div className="bubble">{c.text}</div>
        </Html>
      ))}
    </>
  );
}

export function Decorations() {
  return (
    <>
      <Rangolis />
      <Signs />
      <SilhouetteWindows />
      <StringTargets />
      <Captions />
    </>
  );
}
