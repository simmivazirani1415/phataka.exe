import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { getWorld } from './WorldBuilder';
import { runtime } from '../game/Runtime';
import { useGame } from '../game/GameState';
import { PHASES } from './BlockBuilder';

// Deep-blue evening with warm practical lights. Only the moon casts shadows; decorative
// lights are emissive sprites (GlowField), so the light count stays small.

export function Lighting() {
  const graphics = useGame((s) => s.settings.graphics);
  const world = getWorld();
  const fw = useRef<THREE.PointLight>(null!);
  const reveal = useRef<THREE.PointLight>(null!);
  const points = useRef<(THREE.PointLight | null)[]>([]);
  const hemi = useRef<THREE.HemisphereLight>(null!);
  const moon = useRef<THREE.DirectionalLight>(null!);
  const lights = world.lights.filter((l) => graphics === 'high' || l.lowGraphics);

  useFrame((st) => {
    const fl = runtime.fireworkLight;
    fw.current.position.set(...fl.pos);
    fw.current.color.setRGB(...fl.color);
    fw.current.intensity = fl.intensity * 40;
    reveal.current.position.set(...runtime.reveal.pos);
    reveal.current.intensity = runtime.reveal.intensity * (runtime.composer ? 12 : 22);
    const lightsOn = THREE.MathUtils.clamp((runtime.assemblyTime - PHASES.lights[0]) / 1.5, 0, 1);
    const stage = useGame.getState().stage();
    lights.forEach((l, i) => {
      const p = points.current[i];
      if (!p) return;
      const flick = 1 + Math.sin(st.clock.elapsedTime * 7 + i) * 0.03;
      p.intensity = (stage >= l.stage ? 1 : 0) * lightsOn * l.intensity * flick * (0.85 + stage * 0.03);
    });
    // the night gets a touch warmer as the mohalla celebrates
    const warm = stage / 8;
    const ghost = runtime.ghost;
    hemi.current.intensity = (0.75 + warm * 0.2) * (1 - ghost * 0.6);
    hemi.current.groundColor.setRGB(0.2 + warm * 0.1, 0.12 + warm * 0.05, 0.09);
    moon.current.intensity = 1.0 * (1 - ghost * 0.5);
  });

  const high = graphics === 'high';
  return (
    <>
      <hemisphereLight ref={hemi} args={['#5468B0', '#33201A', 0.8]} />
      <ambientLight color="#2A3566" intensity={0.35} />
      <directionalLight
        ref={moon}
        color="#A9BDFF"
        intensity={1}
        position={[-22, 38, 26]}
        castShadow={high}
        shadow-mapSize={[high ? 2048 : 1024, high ? 2048 : 1024]}
        shadow-camera-left={-34}
        shadow-camera-right={34}
        shadow-camera-top={30}
        shadow-camera-bottom={-30}
        shadow-camera-near={1}
        shadow-camera-far={120}
        shadow-bias={-0.0004}
        shadow-normalBias={0.04}
      />
      <directionalLight color="#FFB46B" intensity={0.28} position={[26, 10, -14]} />
      {lights.map((l, i) => (
        <pointLight key={l.id} ref={(p) => (points.current[i] = p)} position={l.pos} color={l.color} intensity={0} distance={l.distance} decay={1.4} />
      ))}
      <pointLight ref={fw} intensity={0} distance={28} decay={1.1} />
      <pointLight ref={reveal} intensity={0} distance={9} decay={1.2} color="#FFE6BC" />
    </>
  );
}
