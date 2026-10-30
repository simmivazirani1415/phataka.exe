import { useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { PACKAGE_BY_ID } from '../assets/AssetRegistry';
import { runtime } from '../game/Runtime';
import { useGame } from '../game/GameState';
import { guidePath } from './Guide';

// Glowing arrows on the ground, flowing from the player's feet to the box they are looking
// for. They only show on the ground floor (the boxes are all in the gali and chowk).

const MAX = 34;
const STEP = 1.15;
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const Y = new THREE.Vector3(0, 1, 0);
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

function chevron() {
  // a flat arrowhead pointing along +z
  const s = new THREE.Shape();
  s.moveTo(0, 0.3);
  s.lineTo(0.32, -0.06);
  s.lineTo(0.2, -0.16);
  s.lineTo(0, 0.08);
  s.lineTo(-0.2, -0.16);
  s.lineTo(-0.32, -0.06);
  s.closePath();
  return new THREE.ShapeGeometry(s).rotateX(Math.PI / 2);
}

export function GuidePath() {
  const mesh = useMemo(() => {
    const mat = new THREE.MeshBasicMaterial({ color: '#ffd15a', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, side: THREE.DoubleSide });
    const m = new THREE.InstancedMesh(chevron(), mat, MAX);
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 3), 3);
    m.frustumCulled = false;
    m.raycast = () => {};
    m.renderOrder = 3;
    m.count = 0;
    return m;
  }, []);
  useEffect(
    () => () => {
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    },
    [mesh],
  );

  const col = useMemo(() => new THREE.Color(), []);
  useFrame((st) => {
    const g = useGame.getState();
    const id = g.ui.guide;
    if (!id || g.active || (runtime.player.floor ?? 0) > 0.5) {
      mesh.count = 0;
      return;
    }
    const pts = guidePath(id);
    const reduced = g.settings.reducedMotion;
    const flow = reduced ? 0 : (st.clock.elapsedTime * 1.6) % STEP;
    const tint = PACKAGE_BY_ID[id].palette[0];
    let n = 0;
    let along = 0;
    for (let i = 1; i < pts.length && n < MAX; i++) {
      const [x0, z0] = pts[i - 1];
      const [x1, z1] = pts[i];
      const seg = Math.hypot(x1 - x0, z1 - z0);
      if (seg < 1e-3) continue;
      const yaw = Math.atan2(x1 - x0, z1 - z0);
      _q.setFromAxisAngle(Y, yaw);
      // first arrow a step ahead of the feet, then evenly spaced, flowing forward
      let d = (STEP - ((along - flow + STEP * 100) % STEP)) % STEP;
      for (; d < seg && n < MAX; d += STEP) {
        const total = along + d;
        if (total < 1.0) continue;
        const t = d / seg;
        // fade in near the feet, fade out at the far end of the trail
        const k = Math.min(1, (total - 1.0) / 1.5) * Math.min(1, (MAX * STEP - total) / 6);
        _m.compose(_p.set(x0 + (x1 - x0) * t, 0.03, z0 + (z1 - z0) * t), _q, _s.set(1, 1, 1));
        mesh.setMatrixAt(n, _m);
        mesh.setColorAt(n, col.set(n % 2 ? tint : '#ffd15a').multiplyScalar(0.25 + 0.75 * k));
        n++;
      }
      along += seg;
    }
    for (let i = n; i < mesh.count; i++) mesh.setMatrixAt(i, ZERO);
    mesh.count = n;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  });

  return <primitive object={mesh} />;
}
