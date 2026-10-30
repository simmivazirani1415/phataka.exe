import * as THREE from 'three';
import { PACKAGES, type PackageId } from '../../assets/AssetRegistry';
import { createCrackerModel } from '../../assets/ProceduralModels';

// Small 3D renders of each cracker's real shape (not its box) for the tray. They are drawn
// once into an offscreen canvas with a warm key light, then reused as images.

const cache = new Map<PackageId, string>();
let pending: Promise<void> | null = null;

export function crackerRender(id: PackageId) {
  return cache.get(id) ?? null;
}

export function renderCrackers(): Promise<void> {
  if (pending) return pending;
  pending = new Promise((resolve) => {
    // give the main scene its first frames before borrowing the GPU
    window.setTimeout(() => {
      try {
        const S = 192;
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = S;
        const r = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true });
        r.setPixelRatio(1);
        r.setSize(S, S, false);
        r.toneMapping = THREE.ACESFilmicToneMapping;
        r.toneMappingExposure = 1.25;
        const scene = new THREE.Scene();
        scene.add(new THREE.HemisphereLight('#fff3dc', '#3a2a40', 1.6));
        const key = new THREE.DirectionalLight('#ffe2b0', 2.4);
        key.position.set(2, 3, 2.5);
        scene.add(key);
        const rim = new THREE.DirectionalLight('#9fb4ff', 1.2);
        rim.position.set(-2, 1.5, -2);
        scene.add(rim);
        const cam = new THREE.PerspectiveCamera(30, 1, 0.01, 50);
        const box = new THREE.Box3();
        const size = new THREE.Vector3();
        const centre = new THREE.Vector3();
        for (const p of PACKAGES) {
          const m = createCrackerModel(p.crackerType, p.palette);
          // flat crackers are shown from higher up so their shape reads
          const flat = p.crackerType === 'skyshot' || p.crackerType === 'popPop' || p.crackerType === 'chakri';
          m.rotation.set(p.crackerType === 'ladi' ? 0 : 0, 0.6, p.crackerType === 'ladi' ? -0.25 : 0);
          scene.add(m);
          box.setFromObject(m);
          box.getSize(size);
          box.getCenter(centre);
          const R = Math.max(size.x, size.y, size.z) * 0.62;
          const dist = R / Math.sin(THREE.MathUtils.degToRad(15));
          const el = flat ? 0.95 : 0.32;
          cam.position.set(centre.x + Math.sin(0.4) * Math.cos(el) * dist, centre.y + Math.sin(el) * dist, centre.z + Math.cos(0.4) * Math.cos(el) * dist);
          cam.lookAt(centre);
          r.setClearColor(0x000000, 0);
          r.render(scene, cam);
          cache.set(p.id, canvas.toDataURL('image/png'));
          scene.remove(m);
          m.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
        }
        r.dispose();
        r.forceContextLoss();
      } catch {
        /* the tray falls back to an emoji */
      }
      resolve();
    }, 600);
  });
  return pending;
}
