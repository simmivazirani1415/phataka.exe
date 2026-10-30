import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import gsap from 'gsap';
import { PACKAGES, type PackageAsset } from '../assets/AssetRegistry';
import { getPackageMaterials } from '../assets/PackageTextures';
import { createCrackerModel, makeBoxPiece } from '../assets/ProceduralModels';
import { getGlowTexture } from '../utils/TextureGenerator';
import { runtime } from '../game/Runtime';
import { useGame } from '../game/GameState';
import { beginReveal, canPickUp, openActive, packageControls } from '../game/DiscoverySystem';
import { particles, rnd } from '../game/ParticlePool';
import { audio } from '../audio/AudioEngine';
import { BOX_SPOTS } from './StreetLayout';
import { poolTexture, starTexture } from './StreetTextures';

// The eight pataka boxes, life-size and easy to spot: a soft pulsing golden glow, sparkles
// circling them, golden motes rising and a faint pool of light on the ground, all brighter
// the closer the player gets. Picking one up brings it up in front of the camera.

const BOX_H = 0.62;

const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _up = new THREE.Vector3();

function PackageBox({ pkg }: { pkg: PackageAsset }) {
  const { camera, size } = useThree();
  const spot = BOX_SPOTS[pkg.id];
  const pos = spot.pos;
  const { w, h, d, taper, lid } = pkg.box;
  const S = BOX_H / h;
  const state = useGame((s) => s.packages[pkg.id]);

  const parts = useMemo(() => {
    const mats = getPackageMaterials(pkg.id);
    const uv = pkg.image.frontUV;
    const bodyGeo = makeBoxPiece(w, h, d, taper, 0, 1 - lid, uv);
    const lidGeo = makeBoxPiece(w, h, d, taper, 1 - lid, 1, uv);
    const k = 1 - (1 - taper) * (1 - lid);
    const hingeY = (1 - lid) * h;
    const hingeZ = -(d / 2) * k;
    lidGeo.translate(0, -hingeY, -hingeZ);
    const model = createCrackerModel(pkg.crackerType, pkg.palette);
    model.visible = false;
    return { mats, bodyGeo, lidGeo, hingeY, hingeZ, model };
  }, [pkg, w, h, d, taper, lid]);
  useEffect(
    () => () => {
      parts.bodyGeo.dispose();
      parts.lidGeo.dispose();
    },
    [parts],
  );

  const root = useRef<THREE.Group>(null!);
  const presenter = useRef<THREE.Group>(null!);
  const lidPivot = useRef<THREE.Group>(null!);
  const halo = useRef<THREE.Sprite>(null!);
  const pool = useRef<THREE.Mesh>(null!);
  const stars = useRef<(THREE.Sprite | null)[]>([]);
  const beacon = useRef<THREE.Mesh>(null!);
  const tl = useRef<gsap.core.Timeline | null>(null);
  const mote = useRef(0);

  useEffect(() => {
    if (!lidPivot.current) return;
    const opened = state === 'UNLOCKED' || state === 'PLAYED' || state === 'MEMORY_CAPTURED';
    if (useGame.getState().active?.id !== pkg.id) lidPivot.current.rotation.x = opened ? -1.9 : 0;
  }, [state, pkg.id]);

  useEffect(() => {
    const quick = () => useGame.getState().settings.reducedMotion || useGame.getState().settings.quickReveal;
    const ctl = {
      present: () =>
        new Promise<void>((resolve) => {
          tl.current?.kill();
          const g = presenter.current;
          const parent = g.parent!;
          parent.updateWorldMatrix(true, false);
          const cam = camera as THREE.PerspectiveCamera;
          cam.updateMatrixWorld();
          const fwd = _v.set(0, 0, -1).applyQuaternion(cam.quaternion);
          _up.set(0, 1, 0).applyQuaternion(cam.quaternion);
          const dist = 1.3;
          const visH = 2 * dist * Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
          const portrait = size.width < size.height;
          const desired = visH * (portrait ? 0.3 : 0.36);
          const scale = desired / (h * S);
          // a little above the centre, so the label strip below never covers it
          const target = cam.position.clone().addScaledVector(fwd, dist).addScaledVector(_up, visH * 0.1 - desired / 2);
          const local = parent.worldToLocal(target.clone());
          parent.getWorldQuaternion(_q).invert();
          _q2.copy(cam.quaternion);
          const tilt = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.14, 0.32, 0));
          const finalQ = _q.clone().multiply(_q2).multiply(tilt);
          const startQ = g.quaternion.clone();
          const qp = { t: 0 };
          const f = quick() ? 0.35 : 1;
          const t = gsap.timeline({ onComplete: () => resolve() });
          t.to(g.position, { y: 0.4, duration: 0.35 * f, ease: 'power2.out' })
            .to(g.position, { x: local.x, y: local.y, z: local.z, duration: 0.7 * f, ease: 'power3.inOut' })
            .to(qp, { t: 1, duration: 0.7 * f, ease: 'power3.inOut', onUpdate: () => g.quaternion.slerpQuaternions(startQ, finalQ, qp.t) }, '<')
            .to(g.scale, { x: scale, y: scale, z: scale, duration: 0.7 * f, ease: 'power3.inOut' }, '<')
            .to(runtime.reveal, { intensity: 1, duration: 0.5 * f }, '<');
          runtime.reveal.pos = target.clone().addScaledVector(fwd, -0.6).addScaledVector(_up, 0.5).toArray() as [number, number, number];
          tl.current = t;
          audio.reveal();
        }),
      open: () =>
        new Promise<void>((resolve) => {
          const f = quick() ? 0.4 : 1;
          const m = parts.model;
          m.visible = true;
          const ms = Math.min(w, 0.8) * 1.7;
          m.scale.setScalar(ms * 0.5);
          m.position.set(0, h * 0.25, 0);
          audio.lidOpen();
          const t = gsap.timeline({ onComplete: () => resolve() });
          const out = { x: w * 0.5 + 0.22, z: d * 0.5 + 0.28 };
          t.to(lidPivot.current.rotation, { x: -1.95, duration: 0.55 * f, ease: 'back.out(1.6)' })
            .to(m.position, { y: h + 0.35, duration: 0.35 * f, ease: 'power2.out' }, '<0.25')
            .to(m.position, { x: out.x, z: out.z, duration: 0.5 * f, ease: 'none' }, '>-0.05')
            .to(m.position, { y: 0.02, duration: 0.5 * f, ease: 'bounce.out' }, '<')
            .to(m.scale, { x: ms, y: ms, z: ms, duration: 0.6 * f, ease: 'back.out(1.4)' }, '<')
            .to(m.rotation, { y: Math.PI * 2, duration: 1.4 * f, ease: 'power2.out' }, '<');
          tl.current = t;
          window.setTimeout(() => audio.unlock(), 380 * f);
        }),
      stow: () =>
        new Promise<void>((resolve) => {
          tl.current?.kill();
          const g = presenter.current;
          const f = quick() ? 0.4 : 1;
          const startQ = g.quaternion.clone();
          const qp = { t: 0 };
          const t = gsap.timeline({
            onComplete: () => {
              parts.model.visible = false;
              resolve();
            },
          });
          t.to(g.position, { x: 0, y: 0, z: 0, duration: 0.55 * f, ease: 'power2.inOut' })
            .to(qp, { t: 1, duration: 0.55 * f, ease: 'power2.inOut', onUpdate: () => g.quaternion.slerpQuaternions(startQ, new THREE.Quaternion(), qp.t) }, '<')
            .to(g.scale, { x: 1, y: 1, z: 1, duration: 0.55 * f, ease: 'power2.inOut' }, '<')
            .to(parts.model.scale, { x: 0.001, y: 0.001, z: 0.001, duration: 0.3 * f }, '<')
            .to(runtime.reveal, { intensity: 0, duration: 0.3 * f }, '<');
          tl.current = t;
        }),
      setLidOpen: (open: boolean) => {
        lidPivot.current.rotation.x = open ? -1.95 : 0;
        parts.model.visible = false;
      },
      skip: () => tl.current?.progress(1),
      worldPos: () => [pos[0], pos[1] + BOX_H / 2, pos[2]] as [number, number, number],
    };
    packageControls.set(pkg.id, ctl);
    return () => {
      packageControls.delete(pkg.id);
    };
  }, [camera, size, parts, pkg, pos, h, w, d, S]);

  useFrame((st, dt) => {
    const g = root.current;
    if (!g) return;
    const t = st.clock.elapsedTime;
    const s = useGame.getState();
    const dist = Math.hypot(pos[0] - runtime.player.x, pos[2] - runtime.player.z);
    g.visible = dist < 90;
    if (!g.visible) return;
    const glowing = canPickUp(pkg.id) && s.active?.id !== pkg.id;
    const now = performance.now();
    const hinted = (s.ui.hintUntil > now && glowing) || s.ui.showMe === pkg.id || (s.ui.guide === pkg.id && glowing);
    const hovered = runtime.hoverPackage === pkg.id;
    // brighter as the player gets close: 0.35 far away, 1 within a couple of metres
    const near = THREE.MathUtils.smoothstep(22 - dist, 0, 19.5);
    const pulse = 0.5 + 0.5 * Math.sin(t * 2.4 + pkg.id.length);
    const k = glowing ? (0.35 + 0.65 * near) * (0.75 + 0.25 * pulse) * (hovered ? 1.25 : 1) : 0;
    const hm = halo.current.material as THREE.SpriteMaterial;
    hm.opacity = k * 0.95;
    halo.current.scale.setScalar(1.5 + pulse * 0.25 + near * 0.3);
    (pool.current.material as THREE.MeshBasicMaterial).opacity = k * 0.75;
    pool.current.scale.setScalar(2.4 + pulse * 0.3);
    stars.current.forEach((sp, i) => {
      if (!sp) return;
      const a = t * (0.8 + i * 0.15) + (i * Math.PI * 2) / 3;
      sp.position.set(Math.cos(a) * 0.42, 0.25 + ((t * 0.35 + i * 0.33) % 1) * 0.75, Math.sin(a) * 0.42);
      const tw = Math.max(0, Math.sin(t * (3 + i) + i * 2));
      (sp.material as THREE.SpriteMaterial).opacity = k * tw;
      (sp.material as THREE.SpriteMaterial).rotation = t * (1 + i * 0.2);
      sp.scale.setScalar(0.22 + tw * 0.14);
    });
    // golden motes drifting up when the player is near enough to see them
    if (glowing && dist < 26) {
      mote.current -= dt;
      if (mote.current <= 0) {
        mote.current = 0.16 / (0.4 + near);
        particles.emit({ pos: [pos[0] + rnd(-0.35, 0.35), pos[1] + rnd(0.1, 0.6), pos[2] + rnd(-0.35, 0.35)], vel: [rnd(-0.08, 0.08), rnd(0.25, 0.55), rnd(-0.08, 0.08)], life: rnd(1.2, 2.0), color: '#FFE7A3', color2: '#F5A623', size: 0.05, size2: 0.015, gravity: -0.05, drag: 0.4, flicker: 0.5 });
      }
    }
    beacon.current.visible = hinted;
    if (hinted) (beacon.current.material as THREE.MeshBasicMaterial).opacity = 0.3 + Math.sin(t * 5) * 0.15;
    if (parts.model.visible && s.active?.id === pkg.id) parts.model.rotation.y += 0.01;
  });

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    if (e.delta > 8 || useGame.getState().placing) return;
    beginReveal(pkg.id);
  };

  const k = 1 - (1 - taper) * (1 - lid);
  return (
    <group ref={root} position={pos} rotation={[0, spot.ry, 0]}>
      <mesh ref={pool} rotation-x={-Math.PI / 2} position={[0, 0.03, 0]} renderOrder={3} raycast={() => {}}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial map={poolTexture()} transparent opacity={0} depthWrite={false} blending={THREE.AdditiveBlending} color="#FFC46B" toneMapped={false} polygonOffset polygonOffsetFactor={-4} />
      </mesh>
      <sprite ref={halo} position={[0, BOX_H * 0.55, 0]} renderOrder={4} raycast={() => {}}>
        <spriteMaterial map={getGlowTexture()} transparent opacity={0} depthWrite={false} blending={THREE.AdditiveBlending} color="#FFD27A" toneMapped={false} />
      </sprite>
      {[0, 1, 2].map((i) => (
        <sprite key={i} ref={(s) => (stars.current[i] = s)} renderOrder={6} raycast={() => {}}>
          <spriteMaterial map={starTexture()} transparent opacity={0} depthWrite={false} blending={THREE.AdditiveBlending} color="#FFF3D0" toneMapped={false} />
        </sprite>
      ))}
      <group scale={S}>
        <group
          ref={presenter}
          onClick={(e) => {
            const a = useGame.getState().active;
            if (a?.id !== pkg.id) return;
            e.stopPropagation();
            if (a.step === 'presented') openActive();
          }}
        >
          <mesh geometry={parts.bodyGeo} material={parts.mats.body} />
          <group ref={lidPivot} position={[0, parts.hingeY, parts.hingeZ]}>
            <mesh geometry={parts.lidGeo} material={parts.mats.lid} />
          </group>
          <primitive object={parts.model} />
        </group>
      </group>
      <mesh ref={beacon} position={[0, 4, 0]} visible={false} raycast={() => {}}>
        <cylinderGeometry args={[0.18, 0.7, 8, 16, 1, true]} />
        <meshBasicMaterial color="#FFD15A" transparent opacity={0.4} depthWrite={false} blending={THREE.AdditiveBlending} side={THREE.DoubleSide} toneMapped={false} />
      </mesh>
      {/* a generous hit volume, so the box never needs precise aim */}
      <mesh
        position={[0, BOX_H / 2, 0]}
        visible={false}
        onClick={onClick}
        onPointerOver={(e) => {
          e.stopPropagation();
          if (!canPickUp(pkg.id)) return;
          runtime.hoverPackage = pkg.id;
          document.body.style.cursor = 'pointer';
          audio.hover();
        }}
        onPointerOut={() => {
          if (runtime.hoverPackage === pkg.id) runtime.hoverPackage = null;
          document.body.style.cursor = '';
        }}
      >
        <boxGeometry args={[(w * k) * S + 0.7, BOX_H + 0.7, d * S + 0.7]} />
      </mesh>
    </group>
  );
}

export function StreetPackages() {
  return (
    <>
      {PACKAGES.map((p) => (
        <PackageBox key={p.id} pkg={p} />
      ))}
    </>
  );
}
