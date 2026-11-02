import * as THREE from 'three';
import { makeCanvas, mulberry32 } from '../utils/TextureGenerator';

// The night sky behind the intro film. (The street draws its own sky dome, haze and
// distant fireworks in street/StreetAtmosphere.)

/** The diorama's painted night sky, shown behind the intro film. */
export function skyTexture() {
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
