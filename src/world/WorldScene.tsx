import { useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { PostFX } from './PostFX';
import * as THREE from 'three';
import { WorldBlocks, assemblyUniforms } from './WorldAssembly';
import { GlowField } from './GlowField';
import { Characters } from './Characters';
import { Decorations } from './Decorations';
import { InteractableObjects } from './InteractableObjects';
import { PackageBoxes } from './PackageBoxes';
import { Lighting } from './Lighting';
import { EnvironmentEffects } from './EnvironmentEffects';
import { CameraController } from '../camera/CameraController';
import { FireworkDirector } from '../game/FireworkSystem';
import { ParticleSystem } from '../game/ParticlePool';
import { ScreenshotCapture } from '../utils/ScreenshotCapture';
import { PerformanceMonitor } from '../utils/PerformanceMonitor';
import { runtime } from '../game/Runtime';
import { useGame } from '../game/GameState';
import { ASSEMBLY_END, BLOCK_DURATION, CAMERA_SETTLE_END } from './BlockBuilder';
import { getWorld } from './WorldBuilder';
import { audio } from '../audio/AudioEngine';
import { closeActive } from '../game/DiscoverySystem';

/** Drives the global assembly clock, the ghost-silhouette fade and the block snap sounds. */
function Director() {
  const landings = useMemo(() => getWorld().blocks.filter((b) => !b.appearStage).map((b) => b.delay + BLOCK_DURATION * 0.55).sort((a, b) => a - b), []);
  const cursor = useMemo(() => ({ i: 0 }), []);
  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.1);
    const st = useGame.getState();
    if (st.phase !== 'intro') runtime.ghost = Math.max(0, runtime.ghost - dt * 2.2);
    if (runtime.assemblyRunning) {
      const speed = st.settings.reducedMotion ? 3 : 1;
      runtime.assemblyTime += dt * speed;
      if (st.phase === 'assembling') {
        while (cursor.i < landings.length && landings[cursor.i] <= runtime.assemblyTime) {
          cursor.i++;
          if (cursor.i % 3 === 0) audio.snap();
        }
        const end = st.settings.reducedMotion ? ASSEMBLY_END : CAMERA_SETTLE_END;
        if (runtime.assemblyTime >= end) st.setAssembled();
      }
    }
    assemblyUniforms.uTime.value = runtime.assemblyTime;
    assemblyUniforms.uGhost.value = runtime.ghost;
  });
  return null;
}

export function startAssembly() {
  runtime.assemblyTime = -0.45;
  runtime.assemblyRunning = true;
  useGame.getState().setPhase('assembling');
}

export function skipAssembly() {
  runtime.ghost = 0;
  runtime.assemblyRunning = true;
  runtime.assemblyTime = Math.max(runtime.assemblyTime, ASSEMBLY_END + 0.2);
  useGame.getState().setAssembled();
}

export default function WorldScene() {
  const graphics = useGame((s) => s.settings.graphics);
  return (
    <Canvas
      className="world-canvas"
      shadows={graphics === 'high' ? 'soft' : false}
      dpr={[1, 2]}
      gl={{ antialias: graphics === 'high', powerPreference: 'high-performance', alpha: false }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.15;
      }}
      onPointerMissed={() => closeActive()}
    >
      <Director />
      <CameraController />
      <Lighting />
      <EnvironmentEffects />
      <WorldBlocks />
      <GlowField />
      <Decorations />
      <Characters />
      <InteractableObjects />
      <PackageBoxes />
      <ParticleSystem />
      <FireworkDirector />
      <ScreenshotCapture />
      <PostFX />
      <PerformanceMonitor />
    </Canvas>
  );
}
