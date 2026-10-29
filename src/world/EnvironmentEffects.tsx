import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { makeCanvas, mulberry32 } from '../utils/TextureGenerator';
import { runtime } from '../game/Runtime';
import { useGame } from '../game/GameState';
import { pick, rnd, sphereBurst } from '../game/ParticlePool';
import { audio } from '../audio/AudioEngine';

// Night sky, haze, and the distant celebration that grows with the player's progress.

function skyTexture() {
  const { c, ctx } = makeCanvas(1024, 1024);
  const g = ctx.createLinearGradient(0, 0, 0, 1024);
  g.addColorStop(0, '#070C1C');
  g.addColorStop(0.55, '#101A32');
  g.addColorStop(1, '#22264A');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 1024, 1024);
  const r = mulberry32(9);
  for (let i = 0; i < 260; i++) {
    const y = Math.pow(r(), 1.6) * 760;
    const a = 0.2 + r() * 0.6;
    ctx.fillStyle = `rgba(255,240,210,${a})`;
    ctx.beginPath();
    ctx.arc(r() * 1024, y, r() * 1.4 + 0.3, 0, Math.PI * 2);
    ctx.fill();
  }
  // a warm glow of the city on the horizon
  const h = ctx.createRadialGradient(512, 1150, 50, 512, 1150, 700);
  h.addColorStop(0, 'rgba(255,150,80,0.28)');
  h.addColorStop(1, 'rgba(255,150,80,0)');
  ctx.fillStyle = h;
  ctx.fillRect(0, 0, 1024, 1024);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function EnvironmentEffects() {
  const { scene } = useThree();
  const tex = useMemo(skyTexture, []);
  const next = useRef(4);
  const stage = useGame((s) => Object.values(s.packages).filter((p) => p === 'MEMORY_CAPTURED').length);

  useEffect(() => {
    scene.background = tex;
    scene.fog = new THREE.Fog('#18224A', 95, 170);
    return () => {
      scene.background = null;
      scene.fog = null;
    };
  }, [scene, tex]);

  useEffect(() => {
    audio.setCelebration(stage >= 8 ? 1 : stage >= 5 ? 0.6 : stage * 0.06);
  }, [stage]);

  useFrame((_, dt) => {
    if (useGame.getState().phase !== 'playing') return;
    const s = useGame.getState().stage();
    if (s < 5) return;
    next.current -= dt;
    if (next.current > 0) return;
    const busy = runtime.fireworks?.busy();
    next.current = s >= 8 ? rnd(1.8, 3.6) : rnd(5, 9);
    if (busy && s < 8) return;
    // distant bursts beyond the rooftops, never over the camera
    const a = rnd(0, Math.PI * 2);
    const r = rnd(26, 34);
    const p: [number, number, number] = [Math.cos(a) * r, rnd(15, 22), Math.sin(a) * r * 0.8];
    const cols = pick([['#FFD15A', '#FFF3D0'], ['#D64A91', '#FFD15A'], ['#7FE3D6', '#3446A4'], ['#FF6A3D', '#FFD15A']]);
    sphereBurst(p, s >= 8 ? 140 : 80, s >= 8 ? 5 : 3.5, cols, { life: rnd(1.2, 1.8), size: 0.3, gravity: 1.2 });
  });

  return null;
}
