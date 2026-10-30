import { Canvas, useFrame } from '@react-three/fiber';
import { PostFX } from './PostFX';
import * as THREE from 'three';
import { FireworkDirector } from '../game/FireworkSystem';
import { ParticleSystem } from '../game/ParticlePool';
import { ScreenshotCapture } from '../utils/ScreenshotCapture';
import { PerformanceMonitor } from '../utils/PerformanceMonitor';
import { runtime } from '../game/Runtime';
import { useGame } from '../game/GameState';
import { StreetCamera } from '../street/StreetCamera';
import { StreetChunks } from '../street/StreetChunks';
import { StreetAtmosphere } from '../street/StreetAtmosphere';
import { StreetPackages } from '../street/StreetPackages';
import { GuidePath } from '../street/GuidePath';
import { Crowd } from '../street/Crowd';
import { CastSprites } from '../street/CastSprites';
import { Traffic } from '../street/Traffic';
import { Placement } from '../street/Placement';
import { Bubbles } from '../street/Bubbles';
import { Scorch } from '../street/Scorch';

/** Counts the frames the world has drawn, so the intro knows the street is up. */
function FrameCount() {
  useFrame(() => {
    runtime.frames++;
  });
  return null;
}

/** The street-level mohalla. */
function Street() {
  return (
    <group>
      <StreetAtmosphere />
      <StreetChunks />
      <Crowd />
      <Traffic />
      <CastSprites />
      <StreetPackages />
      <GuidePath />
      <Placement />
      <Scorch />
      <Bubbles />
    </group>
  );
}

export default function WorldScene() {
  const graphics = useGame((s) => s.settings.graphics);
  return (
    <Canvas
      className="world-canvas"
      shadows={false}
      dpr={[1, 2]}
      gl={{ antialias: graphics === 'high', powerPreference: 'high-performance', alpha: false }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.15;
      }}
    >
      <StreetCamera />
      <FrameCount />
      <Street />
      <ParticleSystem />
      <FireworkDirector />
      <ScreenshotCapture />
      <PostFX />
      <PerformanceMonitor />
    </Canvas>
  );
}
