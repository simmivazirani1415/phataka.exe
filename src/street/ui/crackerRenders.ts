import * as THREE from 'three';
import { PACKAGES, type CrackerType, type PackageId } from '../../assets/AssetRegistry';
import { createCrackerModel, preloadArt } from '../../assets/ProceduralModels';

// Pictures of each cracker, drawn once from the same decorated 3D model that stands on the
// ground when it is lit (its body wears the packaging art). Two cuts per cracker: `shelf`,
// a tall frame with the cracker standing on its baseline (for the collection shelf, so they
// all stand on one line), and `tight`, cropped to the cracker (for the stash medallions).

const shelf = new Map<PackageId, string>();
const tight = new Map<PackageId, string>();
let pending: Promise<void> | null = null;

export function crackerRender(id: PackageId) {
  return tight.get(id) ?? null;
}
export function crackerShelf(id: PackageId) {
  return shelf.get(id) ?? null;
}

/** Display scale per cracker, so a little packet of pop-pops reads next to a rocket. */
const SCALE: Record<CrackerType, number> = { rocket: 1.0, sparkler: 1.2, bomb: 1.7, anaar: 1.7, chakri: 1.1, ladi: 1.3, skyshot: 1.9, popPop: 2.9 };

const W = 300;
const H = 520;

function crop(src: HTMLCanvasElement) {
  const ctx = src.getContext('2d')!;
  const { data } = ctx.getImageData(0, 0, src.width, src.height);
  let x0 = src.width;
  let y0 = src.height;
  let x1 = 0;
  let y1 = 0;
  for (let y = 0; y < src.height; y++)
    for (let x = 0; x < src.width; x++)
      if (data[(y * src.width + x) * 4 + 3] > 8) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
  if (x1 <= x0) return src.toDataURL('image/png');
  const side = Math.max(x1 - x0, y1 - y0) + 12;
  const out = document.createElement('canvas');
  out.width = out.height = side;
  out.getContext('2d')!.drawImage(src, x0, y0, x1 - x0 + 1, y1 - y0 + 1, (side - (x1 - x0)) / 2, (side - (y1 - y0)) / 2, x1 - x0 + 1, y1 - y0 + 1);
  return out.toDataURL('image/png');
}

export function renderCrackers(): Promise<void> {
  if (pending) return pending;
  pending = new Promise((resolve) => {
    // give the main scene its first frames before borrowing the GPU
    window.setTimeout(async () => {
      try {
        await Promise.race([preloadArt(PACKAGES.map((p) => p.image.front).filter((u): u is string => !!u)), new Promise((r) => setTimeout(r, 4000))]);
        const canvas = document.createElement('canvas');
        canvas.width = W;
        canvas.height = H;
        const r = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true });
        r.setPixelRatio(1);
        r.setSize(W, H, false);
        r.outputColorSpace = THREE.SRGBColorSpace;
        r.toneMapping = THREE.ACESFilmicToneMapping;
        r.toneMappingExposure = 1.2;
        const scene = new THREE.Scene();
        scene.add(new THREE.HemisphereLight('#fff3dc', '#3a2a40', 1.5));
        const key = new THREE.DirectionalLight('#ffe2b0', 2.6);
        key.position.set(1.5, 2.5, 3);
        scene.add(key);
        const rim = new THREE.DirectionalLight('#ffb36b', 1.4);
        rim.position.set(-2, 1.5, -2);
        scene.add(rim);
        // one framing for all: 1 unit tall, the baseline near the bottom, a touch from above
        const half = 0.5;
        const cam = new THREE.OrthographicCamera((-half * W) / H, (half * W) / H, half, -half, 0.01, 20);
        cam.position.set(0, 0.62, 5);
        cam.lookAt(0, 0.5, 0);
        const scratch = document.createElement('canvas');
        scratch.width = W;
        scratch.height = H;
        const sctx = scratch.getContext('2d')!;
        for (const p of PACKAGES) {
          const m = createCrackerModel(p.crackerType, p.palette, p.image.front ?? undefined);
          const holder = new THREE.Group();
          holder.add(m);
          if (p.crackerType === 'chakri') {
            // stood on its rim, face to the front
            m.rotation.x = Math.PI / 2;
            m.position.set(0, 0.2 + 0.06, -0.07);
          }
          if (p.crackerType === 'rocket') m.position.x = -0.07;
          holder.scale.setScalar(SCALE[p.crackerType]);
          holder.position.y = 0.04;
          scene.add(holder);
          r.setClearColor(0x000000, 0);
          r.render(scene, cam);
          shelf.set(p.id, canvas.toDataURL('image/png'));
          sctx.clearRect(0, 0, W, H);
          sctx.drawImage(canvas, 0, 0);
          tight.set(p.id, crop(scratch));
          scene.remove(holder);
          m.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
        }
        r.dispose();
        r.forceContextLoss();
      } catch {
        /* the panels fall back to an icon */
      }
      resolve();
    }, 500);
  });
  return pending;
}
