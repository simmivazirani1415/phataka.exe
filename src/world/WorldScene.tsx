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
import { closeActive } from '../game/DiscoverySystem';
import { IdentScene } from '../intro/IdentScene';

/** Drives the global assembly clock. While the intro film runs, the film owns the clock. */
function Director() {
  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.1);
    const film = runtime.intro.assembly;
    if (film !== null) runtime.assemblyTime = film;
    else if (runtime.assemblyRunning) runtime.assemblyTime += dt;
    assemblyUniforms.uTime.value = runtime.assemblyTime;
    assemblyUniforms.uGhost.value = runtime.ghost;
  });
  return null;
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
      <IdentScene />
      <PostFX />
      <PerformanceMonitor />
    </Canvas>
  );
}
