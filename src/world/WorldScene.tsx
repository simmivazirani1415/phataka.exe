import { useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { PostFX } from './PostFX';
import * as THREE from 'three';
import { WorldBlocks, assemblyUniforms } from './WorldAssembly';
import { GlowField } from './GlowField';
import { Characters } from './Characters';
import { Lighting } from './Lighting';
import { FireworkDirector } from '../game/FireworkSystem';
import { ParticleSystem } from '../game/ParticlePool';
import { ScreenshotCapture } from '../utils/ScreenshotCapture';
import { PerformanceMonitor } from '../utils/PerformanceMonitor';
import { runtime } from '../game/Runtime';
import { useGame } from '../game/GameState';
import { IdentScene } from '../intro/IdentScene';
import { filmOnScreen, useIdent } from '../intro/identState';
import { StreetCamera } from '../street/StreetCamera';
import { StreetChunks } from '../street/StreetChunks';
import { StreetAtmosphere } from '../street/StreetAtmosphere';
import { StreetPackages } from '../street/StreetPackages';
import { Crowd } from '../street/Crowd';
import { Traffic } from '../street/Traffic';
import { Placement } from '../street/Placement';
import { Bubbles } from '../street/Bubbles';
import { Scorch } from '../street/Scorch';

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

/**
 * The miniature mohalla the intro film is shot in. It only exists while the intro is around
 * and is only drawn while the film camera is on screen; behind the closed doors the film
 * hands over to the street, which is what the doors open onto.
 */
function FilmSet() {
  const stage = useIdent((s) => s.stage);
  const group = useRef<THREE.Group>(null!);
  useFrame(() => {
    if (group.current) group.current.visible = filmOnScreen();
  });
  if (stage === 'off') return null;
  return (
    <group ref={group}>
      <Director />
      <Lighting />
      <WorldBlocks />
      <GlowField />
      <Characters />
    </group>
  );
}

/** The street-level mohalla: hidden while the film camera is on screen. */
function Street() {
  const group = useRef<THREE.Group>(null!);
  useFrame(() => {
    if (group.current) group.current.visible = !filmOnScreen();
  });
  return (
    <group ref={group}>
      <StreetAtmosphere />
      <StreetChunks />
      <Crowd />
      <Traffic />
      <StreetPackages />
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
      <FilmSet />
      <Street />
      <ParticleSystem />
      <FireworkDirector />
      <ScreenshotCapture />
      <IdentScene />
      <PostFX />
      <PerformanceMonitor />
    </Canvas>
  );
}
