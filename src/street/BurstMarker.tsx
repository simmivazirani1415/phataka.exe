import { useEffect, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { useGame } from '../game/GameState';
import { lightPlaced } from '../game/DiscoverySystem';
import { startHands, useHands } from '../input/HandTracker';

// Where the readied cracker stands: a pulsing gold ring on the ground round it, and, if the
// hand gesture has not lit it within 3 seconds (or there is no camera), a big "Burst it!"
// button beside it. The gesture keeps working all the while.

const WAIT_MS = 3000;

export function BurstMarker() {
  const active = useGame((s) => s.active);
  const status = useHands((s) => s.status);
  const ring = useRef<THREE.Mesh>(null);
  const [late, setLate] = useState(false);
  const spot = active?.step === 'spotlight' && active.pos ? active.pos : null;
  const key = spot ? `${active!.id}:${spot.join(',')}` : '';

  useEffect(() => {
    setLate(false);
    if (!key) return;
    const t = window.setTimeout(() => setLate(true), WAIT_MS);
    return () => window.clearTimeout(t);
  }, [key]);

  useFrame(({ clock }) => {
    const m = ring.current;
    if (!m) return;
    const k = (clock.elapsedTime * 0.9) % 1;
    m.scale.setScalar(0.7 + k * 0.8);
    (m.material as THREE.MeshBasicMaterial).opacity = 0.85 * (1 - k);
  });

  if (!spot) return null;
  const noCam = status !== 'ready' && status !== 'loading';
  const show = late || noCam;
  return (
    <group position={[spot[0], spot[1] + 0.03, spot[2]]}>
      <mesh ref={ring} rotation-x={-Math.PI / 2} renderOrder={5}>
        <ringGeometry args={[0.55, 0.68, 48]} />
        <meshBasicMaterial color="#ffc34d" transparent depthWrite={false} toneMapped={false} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} renderOrder={5}>
        <ringGeometry args={[0.62, 0.66, 48]} />
        <meshBasicMaterial color="#fff1c7" transparent opacity={0.9} depthWrite={false} toneMapped={false} />
      </mesh>
      {show && (
        <Html position={[0, 0.5, 0]} center zIndexRange={[7, 0]} wrapperClass="burst-cta-wrap">
          <div className="burst-cta">
            <button className="pill-cta big" onClick={() => void lightPlaced()}>
              Burst it!
            </button>
            {noCam && status !== 'denied' && status !== 'error' ? (
              <button className="burst-note" onClick={() => void startHands()}>
                Enable camera to light with your hand
              </button>
            ) : noCam ? (
              <span className="burst-note">Enable camera to light with your hand</span>
            ) : null}
          </div>
        </Html>
      )}
    </group>
  );
}
