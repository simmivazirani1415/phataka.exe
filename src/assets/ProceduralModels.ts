import * as THREE from 'three';
import type { CrackerType, UVQuad } from './AssetRegistry';

const RECT: UVQuad = [[0, 0], [1, 0], [1, 1], [0, 1]];

type P3 = [number, number, number];

/**
 * A slice (y0..y1 as fractions of h) of a box that can taper towards the top.
 * Material groups follow BoxGeometry order: +x, -x, +y, -y, +z (front), -z (back).
 * The front face UVs follow `frontUV`, so a trapezoid artwork maps onto a frustum face.
 */
export function makeBoxPiece(w: number, h: number, d: number, taper: number, f0: number, f1: number, frontUV: UVQuad = RECT) {
  const k = (f: number) => 1 - (1 - taper) * f;
  const y0 = f0 * h;
  const y1 = f1 * h;
  const hw0 = (w / 2) * k(f0);
  const hw1 = (w / 2) * k(f1);
  const hd0 = (d / 2) * k(f0);
  const hd1 = (d / 2) * k(f1);
  const lerp2 = (a: [number, number], b: [number, number], t: number): [number, number] => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  const [BL, BR, TR, TL] = frontUV;
  const rect = (u0: number, v0: number, u1: number, v1: number): [number, number][] => [[u0, v0], [u1, v0], [u1, v1], [u0, v1]];

  const faces: { v: P3[]; uv: [number, number][] }[] = [
    // +x
    { v: [[hw0, y0, hd0], [hw0, y0, -hd0], [hw1, y1, -hd1], [hw1, y1, hd1]], uv: rect(0, f0, 1, f1) },
    // -x
    { v: [[-hw0, y0, -hd0], [-hw0, y0, hd0], [-hw1, y1, hd1], [-hw1, y1, -hd1]], uv: rect(0, f0, 1, f1) },
    // +y
    { v: [[-hw1, y1, hd1], [hw1, y1, hd1], [hw1, y1, -hd1], [-hw1, y1, -hd1]], uv: rect(0, 0, 1, 1) },
    // -y
    { v: [[-hw0, y0, -hd0], [hw0, y0, -hd0], [hw0, y0, hd0], [-hw0, y0, hd0]], uv: rect(0, 0, 1, 1) },
    // +z front
    {
      v: [[-hw0, y0, hd0], [hw0, y0, hd0], [hw1, y1, hd1], [-hw1, y1, hd1]],
      uv: [lerp2(BL, TL, f0), lerp2(BR, TR, f0), lerp2(BR, TR, f1), lerp2(BL, TL, f1)],
    },
    // -z back
    { v: [[hw0, y0, -hd0], [-hw0, y0, -hd0], [-hw1, y1, -hd1], [hw1, y1, -hd1]], uv: rect(0, f0, 1, f1) },
  ];
  const pos: number[] = [];
  const uvs: number[] = [];
  const idx: number[] = [];
  const g = new THREE.BufferGeometry();
  faces.forEach((f, i) => {
    const o = i * 4;
    f.v.forEach((p) => pos.push(...p));
    f.uv.forEach((u) => uvs.push(...u));
    idx.push(o, o + 1, o + 2, o, o + 2, o + 3);
    g.addGroup(i * 6, 6, i);
  });
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// ---------------------------------------------------------------------------
// Simplified 3D crackers revealed inside each box and used by the effects.

const matCache = new Map<string, THREE.MeshStandardMaterial>();
export function paint(color: string, rough = 0.6, metal = 0, emissive?: string) {
  const key = color + rough + metal + (emissive ?? '');
  let m = matCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });
    if (emissive) {
      m.emissive = new THREE.Color(emissive);
      m.emissiveIntensity = 0.8;
    }
    matCache.set(key, m);
  }
  return m;
}

function mesh(geo: THREE.BufferGeometry, mat: THREE.Material | THREE.Material[], p: P3 = [0, 0, 0], r: P3 = [0, 0, 0]) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(...p);
  m.rotation.set(...r);
  m.castShadow = true;
  return m;
}

// The packaging art, wrapped round each cracker's body so the cracker on the shelf, in the
// stash and on the ground is the same decorated cracker. Two variants share one image: `wrap`
// for cylinders and cones (the art's middle faces the front), `flat` for box faces.
const artCache = new Map<string, { wrap: THREE.Texture; flat: THREE.Texture }>();
const artLoader = new THREE.TextureLoader();
function artFor(url: string) {
  let t = artCache.get(url);
  if (!t) {
    const flat = artLoader.load(url);
    flat.colorSpace = THREE.SRGBColorSpace;
    flat.anisotropy = 4;
    const wrap = flat.clone();
    wrap.wrapS = THREE.RepeatWrapping;
    // twice round, so the visible front half shows the whole label, its middle facing +z
    wrap.repeat.set(2, 1);
    wrap.offset.set(0.5, 0);
    // a clone shares the image: refresh it once the picture arrives
    const img = flat.image as HTMLImageElement | undefined;
    if (img && !img.complete) img.addEventListener('load', () => (wrap.needsUpdate = true), { once: true });
    else wrap.needsUpdate = true;
    t = { wrap, flat };
    artCache.set(url, t);
  }
  return t;
}

/** Wait for the packaging pictures (for the offscreen renders, which draw once). */
export function preloadArt(urls: string[]) {
  return Promise.all(
    urls.map(
      (u) =>
        new Promise<void>((res) => {
          const t = artFor(u);
          const img = t.flat.image as HTMLImageElement | undefined;
          if (img && img.complete && img.naturalWidth) {
            t.wrap.needsUpdate = true;
            t.flat.needsUpdate = true;
            return res();
          }
          const done = () => {
            t.wrap.needsUpdate = true;
            t.flat.needsUpdate = true;
            res();
          };
          // the loader creates the image element synchronously
          const el = t.flat.image as HTMLImageElement | undefined;
          if (el) {
            el.addEventListener('load', done, { once: true });
            el.addEventListener('error', () => res(), { once: true });
          } else setTimeout(res, 1500);
        }),
    ),
  );
}

const labelMats = new Map<string, THREE.MeshStandardMaterial>();
function label(url: string | undefined, kind: 'wrap' | 'flat', fallback: string) {
  if (!url) return paint(fallback, 0.55);
  const key = url + kind;
  let m = labelMats.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ map: artFor(url)[kind], roughness: 0.62, metalness: 0.02 });
    labelMats.set(key, m);
  }
  return m;
}

/** A chakri's face: rings of coloured paper coiled round the hub. */
const chakriFaces = new Map<string, THREE.MeshStandardMaterial>();
function chakriFace(palette: string[]) {
  const key = palette.join();
  let m = chakriFaces.get(key);
  if (!m) {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const x = c.getContext('2d')!;
    const cols = [palette[0], '#F2C14E', palette[1], '#FFF1D7', palette[0], '#1F8A70', '#F2C14E'];
    for (let i = 0; i < 7; i++) {
      x.beginPath();
      x.arc(128, 128, 126 - i * 16, 0, Math.PI * 2);
      x.fillStyle = cols[i % cols.length];
      x.fill();
    }
    x.strokeStyle = 'rgba(40,20,10,0.35)';
    x.lineWidth = 2;
    for (let r = 24; r < 126; r += 8) {
      x.beginPath();
      x.arc(128, 128, r, 0, Math.PI * 2);
      x.stroke();
    }
    x.fillStyle = '#C4302B';
    x.beginPath();
    x.arc(128, 128, 18, 0, Math.PI * 2);
    x.fill();
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    m = new THREE.MeshStandardMaterial({ map: t, roughness: 0.6 });
    chakriFaces.set(key, m);
  }
  return m;
}

/**
 * A cracker as a small 3D model. With `art` (the packaging's front picture) its body wears the
 * box's illustration, so it matches the collection card. Sizes and anchor heights are what the
 * firework effects expect.
 */
export function createCrackerModel(type: CrackerType, palette: string[], art?: string): THREE.Group {
  const g = new THREE.Group();
  const [a, , c] = palette;
  switch (type) {
    case 'rocket': {
      g.add(mesh(new THREE.BoxGeometry(0.025, 0.7, 0.025), paint('#C9A36A', 0.9), [0, 0.35, 0]));
      g.add(mesh(new THREE.CylinderGeometry(0.062, 0.062, 0.3, 20), label(art, 'wrap', a), [0.07, 0.62, 0]));
      g.add(mesh(new THREE.CylinderGeometry(0.066, 0.066, 0.03, 20), paint('#E3B23C', 0.35, 0.5), [0.07, 0.47, 0]));
      g.add(mesh(new THREE.CylinderGeometry(0.066, 0.066, 0.03, 20), paint('#E3B23C', 0.35, 0.5), [0.07, 0.77, 0]));
      g.add(mesh(new THREE.ConeGeometry(0.068, 0.16, 20), paint('#C4302B', 0.45), [0.07, 0.86, 0]));
      break;
    }
    case 'bomb': {
      // a sutli bomb: a squat drum in its label, a red cap and the fuse
      g.add(mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.34, 28), label(art, 'wrap', '#1F5B3A'), [0, 0.17, 0]));
      g.add(mesh(new THREE.CylinderGeometry(0.152, 0.152, 0.025, 28), paint('#C4302B', 0.5), [0, 0.345, 0]));
      g.add(mesh(new THREE.CylinderGeometry(0.152, 0.152, 0.02, 28), paint('#E3B23C', 0.4, 0.4), [0, 0.01, 0]));
      g.add(mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.16, 6), paint('#B9B1A0', 0.8), [0.03, 0.42, 0], [0, 0, -0.4]));
      break;
    }
    case 'chakri': {
      g.add(mesh(new THREE.TorusGeometry(0.2, 0.06, 10, 32), paint(a, 0.5), [0, 0.07, 0], [Math.PI / 2, 0, 0]));
      g.add(mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.1, 32), chakriFace(palette), [0, 0.07, 0]));
      g.add(mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.12, 12), paint(c, 0.5), [0, 0.07, 0]));
      break;
    }
    case 'sparkler': {
      for (let i = 0; i < 3; i++) {
        const s = mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.75, 6), paint('#8D8F97', 0.4, 0.6), [(i - 1) * 0.05, 0.375, 0], [0, 0, (i - 1) * 0.12]);
        g.add(s);
      }
      g.add(mesh(new THREE.BoxGeometry(0.17, 0.26, 0.04), [paint(a), paint(a), paint(a), paint(a), label(art, 'flat', a), paint(a)], [0, 0.13, 0.02]));
      break;
    }
    case 'anaar': {
      g.add(mesh(new THREE.CylinderGeometry(0.045, 0.17, 0.38, 24), label(art, 'wrap', '#B5683F'), [0, 0.19, 0]));
      g.add(mesh(new THREE.CylinderGeometry(0.172, 0.172, 0.025, 24), paint('#E3B23C', 0.4, 0.4), [0, 0.012, 0]));
      g.add(mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.05, 6), paint('#3A2A1A', 0.9), [0, 0.4, 0]));
      break;
    }
    case 'ladi': {
      const n = 12;
      for (let i = 0; i < n; i++) {
        const side = i % 2 ? 1 : -1;
        g.add(mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.13, 10), paint(i % 4 === 0 ? '#E3B23C' : '#C9262B', 0.55), [side * 0.05, 0.05 + i * 0.045, 0], [0, 0, side * 1.1]));
      }
      g.add(mesh(new THREE.CylinderGeometry(0.006, 0.006, n * 0.045, 4), paint('#E3D7B0', 0.9), [0, 0.05 + (n * 0.045) / 2, 0]));
      break;
    }
    case 'skyshot': {
      // seven paper tubes bundled tight: one in the middle, six around it, each with gold
      // bands and a dark mouth, tied with a gold-and-red band, the fuse out of the side
      const R = 0.052;
      for (let i = 0; i < 7; i++) {
        const ang = (i / 6) * Math.PI * 2;
        const x = i === 6 ? 0 : Math.cos(ang) * R * 2.02;
        const z = i === 6 ? 0 : Math.sin(ang) * R * 2.02;
        g.add(mesh(new THREE.CylinderGeometry(R, R, 0.34, 14), paint(i % 2 ? '#1F7A4D' : '#C9262B', 0.55), [x, 0.17, z]));
        g.add(mesh(new THREE.CylinderGeometry(R * 1.01, R * 1.01, 0.02, 14), paint('#E3B23C', 0.35, 0.5), [x, 0.31, z]));
        g.add(mesh(new THREE.CylinderGeometry(R * 0.6, R * 0.6, 0.012, 12), paint('#2A2018', 0.9), [x, 0.345, z]));
      }
      g.add(mesh(new THREE.CylinderGeometry(R * 3.08, R * 3.08, 0.06, 28), paint('#E3B23C', 0.35, 0.5), [0, 0.12, 0]));
      g.add(mesh(new THREE.CylinderGeometry(R * 3.09, R * 3.09, 0.02, 28), paint('#C4302B', 0.5), [0, 0.12, 0]));
      g.add(mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.12, 6), paint('#3A7D44', 0.8), [R * 3.1, 0.07, 0.03], [0, 0, -0.9]));
      break;
    }
    case 'popPop': {
      // a little heap of paper twists: a round of gravel in pink, white and blue tissue,
      // each twisted shut at the top
      const cols = ['#F48FB1', '#FFF6E6', '#90CAF9', '#F48FB1', '#FFE082', '#FFF6E6'];
      const spots: [number, number, number][] = [
        [0, 0.035, 0], [0.075, 0.035, 0.02], [-0.07, 0.035, 0.03], [0.03, 0.035, 0.08], [-0.03, 0.035, -0.07], [0.07, 0.035, -0.06], [-0.08, 0.035, -0.04],
        [0.02, 0.095, 0.01], [-0.04, 0.09, 0.03], [0.05, 0.09, -0.03], [-0.01, 0.15, -0.01],
      ];
      spots.forEach(([x, y, z], i) => {
        const tw = new THREE.Group();
        tw.add(mesh(new THREE.SphereGeometry(0.036, 12, 10), paint(cols[i % cols.length], 0.85), [0, 0, 0]));
        tw.add(mesh(new THREE.ConeGeometry(0.018, 0.045, 8), paint(cols[i % cols.length], 0.85), [0, 0.045, 0], [Math.PI, 0, 0]));
        tw.add(mesh(new THREE.ConeGeometry(0.02, 0.03, 8), paint(cols[i % cols.length], 0.85), [0, 0.072, 0]));
        tw.position.set(x, y, z);
        tw.rotation.set(Math.sin(i * 2.1) * 0.5, i * 1.3, Math.cos(i * 1.7) * 0.5);
        g.add(tw);
      });
      break;
    }
  }
  return g;
}
