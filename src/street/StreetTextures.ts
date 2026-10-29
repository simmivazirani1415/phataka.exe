import * as THREE from 'three';
import { FONTS, makeCanvas, makeRangoliTexture, mulberry32, toTexture } from '../utils/TextureGenerator';

// Canvas textures for the street: worn asphalt, sandstone paving, a signboard atlas,
// a rangoli atlas, the scorch mark left by a cracker and the soft pool of light under a box.

const memo = new Map<string, THREE.Texture>();
const once = (key: string, make: () => THREE.Texture) => {
  let t = memo.get(key);
  if (!t) memo.set(key, (t = make()));
  return t;
};

/** 8 m x 8 m of road, tiled in world space. */
export function asphaltTexture() {
  return once('asphalt', () => {
    const N = 512;
    const { c, ctx } = makeCanvas(N, N);
    ctx.fillStyle = '#3a3b42';
    ctx.fillRect(0, 0, N, N);
    const r = mulberry32(5);
    const img = ctx.getImageData(0, 0, N, N);
    for (let i = 0; i < img.data.length; i += 4) {
      const n = (r() - 0.5) * 26;
      img.data[i] += n;
      img.data[i + 1] += n;
      img.data[i + 2] += n + 2;
    }
    ctx.putImageData(img, 0, 0);
    // patches, stains and fine cracks
    for (let i = 0; i < 26; i++) {
      ctx.fillStyle = `rgba(${r() < 0.5 ? '20,20,26' : '80,78,84'},${0.08 + r() * 0.12})`;
      ctx.beginPath();
      ctx.ellipse(r() * N, r() * N, 10 + r() * 50, 6 + r() * 30, r() * 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = 'rgba(15,15,20,0.35)';
    ctx.lineWidth = 1.2;
    for (let i = 0; i < 9; i++) {
      let x = r() * N;
      let y = r() * N;
      ctx.beginPath();
      ctx.moveTo(x, y);
      for (let j = 0; j < 6; j++) {
        x += (r() - 0.5) * 40;
        y += (r() - 0.5) * 40;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    const t = toTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8;
    return t;
  });
}

/** Sandstone paving, one texture repeat = 2.4 m. */
export function pavingTexture() {
  return once('paving', () => {
    const N = 512;
    const { c, ctx } = makeCanvas(N, N);
    const r = mulberry32(17);
    ctx.fillStyle = '#6d6052';
    ctx.fillRect(0, 0, N, N);
    const tiles = 4;
    const s = N / tiles;
    for (let y = 0; y < tiles; y++)
      for (let x = 0; x < tiles; x++) {
        const off = y % 2 ? s / 2 : 0;
        const base = 150 + Math.floor(r() * 40);
        ctx.fillStyle = `rgb(${base + 22},${base + 4},${base - 22})`;
        ctx.fillRect(((x * s + off) % N) + 3, y * s + 3, s - 6, s - 6);
        if (off) ctx.fillRect(((x * s + off) % N) - N + 3, y * s + 3, s - 6, s - 6);
      }
    const img = ctx.getImageData(0, 0, N, N);
    for (let i = 0; i < img.data.length; i += 4) {
      const n = (r() - 0.5) * 18;
      img.data[i] += n;
      img.data[i + 1] += n;
      img.data[i + 2] += n;
    }
    ctx.putImageData(img, 0, 0);
    const t = toTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8;
    return t;
  });
}

export interface SignDesign {
  text: string;
  sub: string;
  bg: string;
  fg: string;
}

export const SIGNS: SignDesign[] = [
  { text: 'Sharma Pataka Bhandar', sub: 'Green crackers · Since 1978', bg: '#CE382A', fg: '#FFD15A' },
  { text: 'Gupta Mithai Wale', sub: 'Kaju katli · Ladoo · Barfi', bg: '#F5A623', fg: '#2B1A12' },
  { text: 'Raju Chai Point', sub: 'Cutting chai ₹10', bg: '#148C88', fg: '#FFF0D2' },
  { text: 'Jai Mata Di Kirana', sub: 'Daily needs', bg: '#3446A4', fg: '#FFD15A' },
  { text: 'Diwali Dhamaka Sale', sub: 'Upto 50% off', bg: '#D64A91', fg: '#FFF0D2' },
  { text: 'Mobile Repair', sub: 'Recharge · Covers', bg: '#1F5B3A', fg: '#FFF0D2' },
  { text: 'Lakshmi Saree Centre', sub: 'Festive collection', bg: '#7A1F4F', fg: '#FFD15A' },
  { text: 'Shubh Deepawali', sub: 'Chowk Vyapar Mandal', bg: '#FFD15A', fg: '#CE382A' },
  { text: 'Chowk Bazaar', sub: 'Est. 1962', bg: '#2B1A12', fg: '#F5A623' },
  { text: 'Om Medical Store', sub: 'Open till 11 pm', bg: '#FFF0D2', fg: '#148C88' },
  { text: 'Bittu Tailors', sub: 'Alteration in 1 hour', bg: '#6B4A8A', fg: '#FFF0D2' },
  { text: 'Shri Ganesh Mandir', sub: '', bg: '#F28C28', fg: '#FFF0D2' },
  { text: 'Happy Diwali', sub: 'from Gali No. 4', bg: '#3446A4', fg: '#FFF3D0' },
  { text: 'Fresh Sabzi Phal', sub: '', bg: '#2F6B4F', fg: '#FFE7A3' },
  { text: 'Pappu Golgappe', sub: 'Teekha · Meetha', bg: '#E8702A', fg: '#FFF3D0' },
  { text: 'Kapoor Photo Studio', sub: 'Passport photo', bg: '#101A32', fg: '#FFD15A' },
];
export const SIGN_COLS = 4;
export const SIGN_ROWS = 4;

export function signAtlas() {
  return once('signs', () => {
    const W = 512;
    const H = 160;
    const { c, ctx } = makeCanvas(W * SIGN_COLS, H * SIGN_ROWS);
    SIGNS.forEach((s, i) => {
      const x = (i % SIGN_COLS) * W;
      const y = Math.floor(i / SIGN_COLS) * H;
      ctx.fillStyle = s.bg;
      ctx.fillRect(x, y, W, H);
      ctx.strokeStyle = s.fg;
      ctx.lineWidth = 6;
      ctx.strokeRect(x + 8, y + 8, W - 16, H - 16);
      ctx.fillStyle = s.fg;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      let size = 64;
      ctx.font = `${size}px ${FONTS.display}`;
      while (ctx.measureText(s.text).width > W - 60 && size > 28) ctx.font = `${(size -= 2)}px ${FONTS.display}`;
      ctx.fillText(s.text, x + W / 2, y + (s.sub ? H * 0.42 : H * 0.52));
      if (s.sub) {
        ctx.font = `600 26px ${FONTS.ui}`;
        ctx.fillText(s.sub, x + W / 2, y + H * 0.78);
      }
    });
    return toTexture(c);
  });
}

export const RANGOLI_N = 4;
export function rangoliAtlas() {
  return once('rangoli', () => {
    const S = 256;
    const { c, ctx } = makeCanvas(S * 2, S * 2);
    const sets = [
      ['#D64A91', '#FFD15A', '#148C88', '#FFF0D2'],
      ['#CE382A', '#F5A623', '#3446A4', '#FFF0D2'],
      ['#148C88', '#FFD15A', '#D64A91', '#FFF3D0'],
      ['#F28C28', '#3446A4', '#FFD15A', '#FFF0D2'],
    ];
    for (let i = 0; i < RANGOLI_N; i++) {
      const tex = makeRangoliTexture(100 + i * 7, sets[i]);
      const img = tex.image as HTMLCanvasElement;
      ctx.drawImage(img, (i % 2) * S, Math.floor(i / 2) * S, S, S);
      tex.dispose();
    }
    return toTexture(c);
  });
}

/** Burnt powder and ash: dark at the centre, ragged at the edge. */
export function scorchTexture() {
  return once('scorch', () => {
    const N = 256;
    const { c, ctx } = makeCanvas(N, N);
    const r = mulberry32(31);
    const g = ctx.createRadialGradient(N / 2, N / 2, 4, N / 2, N / 2, N / 2);
    g.addColorStop(0, 'rgba(10,8,8,0.95)');
    g.addColorStop(0.35, 'rgba(25,20,18,0.75)');
    g.addColorStop(0.7, 'rgba(40,32,28,0.3)');
    g.addColorStop(1, 'rgba(40,32,28,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, N, N);
    for (let i = 0; i < 160; i++) {
      const a = r() * Math.PI * 2;
      const d = Math.pow(r(), 0.7) * N * 0.48;
      ctx.fillStyle = `rgba(${r() < 0.3 ? '120,110,100' : '8,6,6'},${0.2 + r() * 0.4})`;
      ctx.beginPath();
      ctx.arc(N / 2 + Math.cos(a) * d, N / 2 + Math.sin(a) * d, 1 + r() * 4, 0, Math.PI * 2);
      ctx.fill();
    }
    // a few red paper shreds
    for (let i = 0; i < 26; i++) {
      ctx.fillStyle = r() < 0.6 ? 'rgba(206,56,42,0.85)' : 'rgba(245,166,35,0.8)';
      const x = N / 2 + (r() - 0.5) * N * 0.8;
      const y = N / 2 + (r() - 0.5) * N * 0.8;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(r() * 3);
      ctx.fillRect(-3, -1.5, 6 + r() * 5, 3);
      ctx.restore();
    }
    return toTexture(c);
  });
}

/** A soft round pool of light for the ground under a box or a burst. */
export function poolTexture() {
  return once('pool', () => {
    const N = 128;
    const { c, ctx } = makeCanvas(N, N);
    const g = ctx.createRadialGradient(N / 2, N / 2, 0, N / 2, N / 2, N / 2);
    g.addColorStop(0, 'rgba(255,220,150,1)');
    g.addColorStop(0.4, 'rgba(255,190,90,0.45)');
    g.addColorStop(1, 'rgba(255,160,60,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, N, N);
    return toTexture(c);
  });
}

/** A sparkle star for the glints near each box. */
export function starTexture() {
  return once('star', () => {
    const N = 64;
    const { c, ctx } = makeCanvas(N, N);
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,250,220,1)');
    g.addColorStop(0.25, 'rgba(255,220,140,0.55)');
    g.addColorStop(1, 'rgba(255,200,100,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, N, N);
    ctx.fillStyle = 'rgba(255,250,230,0.95)';
    ctx.beginPath();
    ctx.moveTo(32, 0);
    ctx.lineTo(35, 29);
    ctx.lineTo(64, 32);
    ctx.lineTo(35, 35);
    ctx.lineTo(32, 64);
    ctx.lineTo(29, 35);
    ctx.lineTo(0, 32);
    ctx.lineTo(29, 29);
    ctx.closePath();
    ctx.fill();
    return toTexture(c);
  });
}

/** Night sky for the dome: deep indigo, stars, a warm city glow at the horizon. */
export function skyDomeTexture() {
  return once('sky', () => {
    const W = 2048;
    const H = 1024;
    const { c, ctx } = makeCanvas(W, H);
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#050914');
    g.addColorStop(0.32, '#0B1430');
    g.addColorStop(0.47, '#1C2350');
    g.addColorStop(0.5, '#3A2C4E');
    g.addColorStop(0.53, '#1A1A30');
    g.addColorStop(1, '#0A0C18');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    const r = mulberry32(9);
    for (let i = 0; i < 900; i++) {
      const y = Math.pow(r(), 1.5) * H * 0.46;
      ctx.fillStyle = `rgba(255,240,215,${0.15 + r() * 0.7})`;
      ctx.beginPath();
      ctx.arc(r() * W, y, r() * 1.3 + 0.3, 0, Math.PI * 2);
      ctx.fill();
    }
    const h = ctx.createLinearGradient(0, H * 0.38, 0, H * 0.5);
    h.addColorStop(0, 'rgba(255,140,70,0)');
    h.addColorStop(1, 'rgba(255,140,70,0.28)');
    ctx.fillStyle = h;
    ctx.fillRect(0, H * 0.38, W, H * 0.12);
    // the moon
    const mx = W * 0.62;
    const my = H * 0.18;
    const mg = ctx.createRadialGradient(mx, my, 0, mx, my, 80);
    mg.addColorStop(0, 'rgba(255,248,225,1)');
    mg.addColorStop(0.18, 'rgba(255,244,215,0.95)');
    mg.addColorStop(0.24, 'rgba(200,210,255,0.25)');
    mg.addColorStop(1, 'rgba(200,210,255,0)');
    ctx.fillStyle = mg;
    ctx.fillRect(mx - 80, my - 80, 160, 160);
    const t = toTexture(c);
    t.wrapS = THREE.RepeatWrapping;
    return t;
  });
}
