import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { runtime } from '../game/Runtime';
import { baseZoomFor, CAMERA_DISTANCE, getPreset } from '../camera/CameraPresets';

// Captures real rendered frames for Polaroids. We render the scene ourselves and read the
// WebGL canvas in the same task, so no preserveDrawingBuffer is needed and no HTML UI is
// included. Images are resized before storage to keep memory small.

function resize(src: HTMLCanvasElement, maxSize: number, mime = 'image/jpeg', q = 0.88) {
  const s = Math.min(1, maxSize / Math.max(src.width, src.height));
  const c = document.createElement('canvas');
  c.width = Math.round(src.width * s);
  c.height = Math.round(src.height * s);
  c.getContext('2d')!.drawImage(src, 0, 0, c.width, c.height);
  return c.toDataURL(mime, q);
}

export function ScreenshotCapture() {
  const { gl, scene, camera, size } = useThree();
  const pending = useRef<{ maxSize: number; resolve: (s: string | null) => void }[]>([]);

  useEffect(() => {
    runtime.capture = {
      shot: (maxSize = 1100) => {
        try {
          if (runtime.composer) runtime.composer.render(0);
          else gl.render(scene, camera);
          return resize(gl.domElement, maxSize);
        } catch {
          return null;
        }
      },
      overview: (maxSize = 1400) =>
        new Promise((resolve) => {
          pending.current.push({ maxSize, resolve });
        }),
    };
    return () => {
      runtime.capture = null;
    };
  }, [gl, scene, camera]);

  // overview photos are rendered from a dedicated camera at the start of a frame;
  // R3F's own render follows immediately, so the player never sees it.
  useFrame(() => {
    if (!pending.current.length) return;
    const jobs = pending.current.splice(0);
    const cam = (camera as THREE.OrthographicCamera).clone();
    const p = getPreset('overview');
    const off = new THREE.Vector3().setFromSphericalCoords(CAMERA_DISTANCE, p.polar, p.azimuth);
    cam.position.set(p.target[0] + off.x, p.target[1] + off.y, p.target[2] + off.z);
    cam.zoom = baseZoomFor(size.width, size.height) * 1.05;
    cam.clearViewOffset();
    cam.updateProjectionMatrix();
    cam.lookAt(...p.target);
    let url: string | null = null;
    try {
      const composer = runtime.composer;
      if (composer) {
        composer.setMainCamera(cam);
        composer.render(0);
        composer.setMainCamera(camera);
      } else gl.render(scene, cam);
      url = resize(gl.domElement, jobs[0].maxSize);
    } catch {
      url = null;
    }
    jobs.forEach((j) => j.resolve(url));
  });

  return null;
}
