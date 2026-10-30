import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { runtime } from '../game/Runtime';
import { useGame } from '../game/GameState';
import { pick, rnd, sphereBurst } from '../game/ParticlePool';
import { audio } from '../audio/AudioEngine';
import { chunkOf, getVariants, STREET, variantAt } from './StreetLayout';
import { skyDomeTexture } from './StreetTextures';
import { glowUniforms } from './StreetChunks';

// A deep-indigo Diwali night: a sky dome with the moon and a warm city glow, haze down the
// gali, cool moonlight and a small pool of real point lights handed to the street lamps and
// shop bulbs nearest the player. Fireworks get one shared light that washes the walls.

export function StreetAtmosphere() {
  const { scene } = useThree();
  const graphics = useGame((s) => s.settings.graphics);
  const high = graphics === 'high';
  const fog = useMemo(() => new THREE.Fog('#151c3d', high ? 34 : 22, high ? 128 : 88), [high]);
  const night = useMemo(() => new THREE.Color('#080c1c'), []);
  const dome = useRef<THREE.Mesh>(null!);
  const hemi = useRef<THREE.HemisphereLight>(null!);
  const moon = useRef<THREE.DirectionalLight>(null!);
  const fw = useRef<THREE.PointLight>(null!);
  const reveal = useRef<THREE.PointLight>(null!);
  const lampCount = high ? 8 : 4;
  const lamps = useRef<(THREE.PointLight | null)[]>([]);
  const nextPick = useRef(0);
  const nextBurst = useRef(6);
  const stage = useGame((s) => s.stage());

  useEffect(() => {
    audio.setCelebration(stage >= 8 ? 1 : stage >= 5 ? 0.6 : stage * 0.06);
  }, [stage]);

  useEffect(
    () => () => {
      scene.fog = null;
      scene.background = null;
    },
    [scene],
  );

  useFrame((st, dt) => {
    if (scene.fog !== fog) scene.fog = fog;
    scene.background = night;
    glowUniforms.uFar.value = fog.far;
    const p = runtime.player;
    const cam = st.camera;
    dome.current.position.copy(cam.position);
    moon.current.position.set(p.x - 40, 70, p.z + 30);
    moon.current.target.position.set(p.x, 0, p.z);
    moon.current.target.updateMatrixWorld();
    const s = useGame.getState().stage();
    hemi.current.intensity = 0.62 + s * 0.02;

    // hand the real lights to the nearest lamps a few times a second
    nextPick.current -= dt;
    if (nextPick.current <= 0) {
      nextPick.current = 0.35;
      const V = getVariants();
      const kp = chunkOf(p.x);
      const cands: { x: number; y: number; z: number; color: number; d: number }[] = [];
      for (let k = kp - 1; k <= kp + 1; k++) {
        for (const l of V[variantAt(k)].lamps) {
          const x = l.x + k * STREET.chunk;
          // prefer lamps ahead of the player
          const ahead = (x - p.x) * -Math.sin(p.yaw) + (l.z - p.z) * -Math.cos(p.yaw);
          const d = Math.hypot(x - p.x, l.z - p.z) - Math.max(0, ahead) * 0.35;
          cands.push({ x, y: l.y, z: l.z, color: l.color, d });
        }
      }
      cands.sort((a, b) => a.d - b.d);
      for (let i = 0; i < lampCount; i++) {
        const L = lamps.current[i];
        const c = cands[i];
        if (!L) continue;
        if (!c) {
          L.intensity = 0;
          continue;
        }
        L.position.set(c.x, c.y, c.z);
        L.color.setHex(c.color);
        L.userData.target = 9 + s * 0.4;
      }
    }
    const t = st.clock.elapsedTime;
    lamps.current.forEach((L, i) => {
      if (!L) return;
      const target = (L.userData.target as number | undefined) ?? 0;
      L.intensity += (target * (1 + Math.sin(t * 9 + i * 1.7) * 0.025) - L.intensity) * Math.min(1, dt * 4);
    });

    const fl = runtime.fireworkLight;
    fw.current.position.set(...fl.pos);
    fw.current.color.setRGB(...fl.color);
    // on a terrace or balcony the walls are close: the same burst lights them far more
    fw.current.intensity = fl.intensity * (runtime.player.floor ? 30 : 70);
    reveal.current.position.set(...runtime.reveal.pos);
    reveal.current.intensity = runtime.reveal.intensity * (runtime.composer ? 6 : 10);

    // distant celebrations above the rooftops, more of them as the mohalla lights up
    nextBurst.current -= dt;
    if (nextBurst.current <= 0 && useGame.getState().phase === 'playing') {
      nextBurst.current = s >= 8 ? rnd(1.6, 3.2) : s >= 4 ? rnd(4, 8) : rnd(9, 16);
      if (runtime.fireworks?.busy() && s < 8) return;
      // somewhere ahead of the player, so it is seen
      const a = p.yaw + rnd(-0.9, 0.9);
      const r = rnd(70, 110);
      const pos: [number, number, number] = [p.x - Math.sin(a) * r, rnd(28, 46), p.z - Math.cos(a) * r];
      const cols = pick([['#FFD15A', '#FFF3D0'], ['#D64A91', '#FFD15A'], ['#7FE3D6', '#3446A4'], ['#FF6A3D', '#FFD15A']]);
      sphereBurst(pos, s >= 8 ? 160 : 100, 9, cols, { life: rnd(1.4, 2.0), size: 0.9, size2: 0.2, gravity: 2 });
      audio.boom(0.12, 0.25);
    }
  });

  return (
    <>
      <mesh ref={dome} renderOrder={-10} raycast={() => {}} frustumCulled={false}>
        <sphereGeometry args={[400, 48, 24]} />
        <meshBasicMaterial map={skyDomeTexture()} side={THREE.BackSide} fog={false} depthWrite={false} toneMapped={false} />
      </mesh>
      <hemisphereLight ref={hemi} args={['#5266b4', '#3d2618', 0.62]} />
      <ambientLight color="#2a3566" intensity={0.28} />
      <directionalLight ref={moon} color="#a9bdff" intensity={0.42} />
      {Array.from({ length: lampCount }, (_, i) => (
        <pointLight key={i} ref={(l) => (lamps.current[i] = l)} intensity={0} distance={17} decay={1.5} />
      ))}
      <pointLight ref={fw} intensity={0} distance={26} decay={1.25} />
      <pointLight ref={reveal} intensity={0} distance={7} decay={1.3} color="#FFE6BC" />
    </>
  );
}
