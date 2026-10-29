import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import gsap from 'gsap';
import { PACKAGES, type PackageAsset, type PackageId } from '../assets/AssetRegistry';
import { getPackageMaterials } from '../assets/PackageTextures';
import { createCrackerModel, makeBoxPiece } from '../assets/ProceduralModels';
import { getGlowTexture } from '../utils/TextureGenerator';
import { getWorld } from './WorldBuilder';
import { runtime } from '../game/Runtime';
import { useGame } from '../game/GameState';
import { appearScale, propDelay } from './Appear';
import { beginReveal, openActive, packageControls } from '../game/DiscoverySystem';
import { audio } from '../audio/AudioEngine';

// Each pataka is a physical miniature cardboard box: procedural geometry with the
// illustrated front, printed side panels, a hinged lid and the cracker inside.

const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _up = new THREE.Vector3();

export function packageWorldPos(p: PackageAsset): [number, number, number] {
  const a = getWorld().anchors[p.anchor];
  return [a.pos[0] + p.positionOffset[0], a.pos[1] + p.positionOffset[1], a.pos[2] + p.positionOffset[2]];
}

function glintTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,250,220,1)');
  g.addColorStop(0.25, 'rgba(255,220,140,0.6)');
  g.addColorStop(1, 'rgba(255,200,100,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
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
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
let glintTex: THREE.Texture | null = null;

function PackageBox({ pkg }: { pkg: PackageAsset }) {
  const { camera, size } = useThree();
  const anchor = getWorld().anchors[pkg.anchor];
  const pos = packageWorldPos(pkg);
  const { w, h, d, taper, lid } = pkg.box;
  const S = pkg.scale;
  const state = useGame((s) => s.packages[pkg.id]);

  const parts = useMemo(() => {
    const mats = getPackageMaterials(pkg.id);
    const uv = pkg.image.frontUV;
    const bodyGeo = makeBoxPiece(w, h, d, taper, 0, 1 - lid, uv);
    const lidGeo = makeBoxPiece(w, h, d, taper, 1 - lid, 1, uv);
    // hinge on the back top edge of the body
    const k = 1 - (1 - taper) * (1 - lid);
    const hingeY = (1 - lid) * h;
    const hingeZ = -(d / 2) * k;
    lidGeo.translate(0, -hingeY, -hingeZ);
    const model = createCrackerModel(pkg.crackerType, pkg.palette);
    model.visible = false;
    return { mats, bodyGeo, lidGeo, hingeY, hingeZ, model };
  }, [pkg, w, h, d, taper, lid]);

  useEffect(() => () => {
    parts.bodyGeo.dispose();
    parts.lidGeo.dispose();
  }, [parts]);

  const root = useRef<THREE.Group>(null!);
  const presenter = useRef<THREE.Group>(null!);
  const lidPivot = useRef<THREE.Group>(null!);
  const halo = useRef<THREE.Mesh>(null!);
  const glint = useRef<THREE.Sprite>(null!);
  const beacon = useRef<THREE.Mesh>(null!);
  const tl = useRef<gsap.core.Timeline | null>(null);
  if (!glintTex) glintTex = glintTexture();

  // open boxes stay open in the world once unlocked
  useEffect(() => {
    if (!lidPivot.current) return;
    const opened = state === 'UNLOCKED' || state === 'PLAYED' || state === 'MEMORY_CAPTURED';
    if (!useGame.getState().active || useGame.getState().active?.id !== pkg.id) lidPivot.current.rotation.x = opened ? -1.9 : 0;
  }, [state, pkg.id]);

  useEffect(() => {
    const quick = () => useGame.getState().settings.reducedMotion || useGame.getState().settings.quickReveal;
    const ctl = {
      present: () =>
        new Promise<void>((resolve) => {
          tl.current?.kill();
          const g = presenter.current;
          const parent = root.current;
          parent.updateWorldMatrix(true, false);
          // a pose facing the camera, pulled towards it (orthographic: same screen spot, in front of walls)
          const cam = camera as THREE.OrthographicCamera;
          const fwd = _v.set(0, 0, -1).applyQuaternion(cam.quaternion);
          _up.set(0, 1, 0).applyQuaternion(cam.quaternion);
          const worldBase = new THREE.Vector3(...pos);
          const zoom = cam.zoom;
          const desiredPx = Math.min(size.height * 0.32, size.width * 0.5);
          const scale = THREE.MathUtils.clamp(desiredPx / (h * S * zoom), 1.2, 9);
          // centre the box ~20% above screen centre so the label strip never covers it
          const camTarget = worldBase.clone().add(new THREE.Vector3(0, 0.5 * S, 0));
          const target = camTarget.addScaledVector(fwd, -14).addScaledVector(_up, (size.height * 0.23) / zoom - (h * S * scale) / 2);
          const local = parent.worldToLocal(target.clone());
          parent.getWorldQuaternion(_q).invert();
          _q2.copy(cam.quaternion);
          const tilt = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.12, 0.26, 0));
          const finalQ = _q.clone().multiply(_q2).multiply(tilt);
          const startQ = g.quaternion.clone();
          const qp = { t: 0 };
          const f = quick() ? 0.35 : 1;
          const t = gsap.timeline({ onComplete: () => resolve() });
          t.to(g.position, { y: 0.55, duration: 0.4 * f, ease: 'power2.out' })
            .to(g.position, { x: local.x, y: local.y, z: local.z, duration: 0.7 * f, ease: 'power3.inOut' })
            .to(qp, { t: 1, duration: 0.7 * f, ease: 'power3.inOut', onUpdate: () => g.quaternion.slerpQuaternions(startQ, finalQ, qp.t) }, '<')
            .to(g.scale, { x: scale, y: scale, z: scale, duration: 0.7 * f, ease: 'power3.inOut' }, '<')
            .to((halo.current.material as THREE.MeshBasicMaterial), { opacity: runtime.composer ? 0.35 : 0.85, duration: 0.5 * f }, '<0.2')
            .to(runtime.reveal, { intensity: 1, duration: 0.5 * f }, '<');
          runtime.reveal.pos = target.clone().addScaledVector(fwd, -3).toArray() as [number, number, number];
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
          // the cracker hops out of the box and lands beside it, in front
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
            .to((halo.current.material as THREE.MeshBasicMaterial), { opacity: 0, duration: 0.3 * f }, '<')
            .to(runtime.reveal, { intensity: 0, duration: 0.3 * f }, '<');
          tl.current = t;
        }),
      setLidOpen: (open: boolean) => {
        lidPivot.current.rotation.x = open ? -1.95 : 0;
        if (open) {
          const ms = Math.min(w, 0.8) * 1.7;
          parts.model.visible = true;
          parts.model.position.set(w * 0.5 + 0.22, 0.02, d * 0.5 + 0.28);
          parts.model.scale.setScalar(ms);
        }
      },
      skip: () => tl.current?.progress(1),
      worldPos: () => pos,
    };
    packageControls.set(pkg.id, ctl);
    return () => {
      packageControls.delete(pkg.id);
    };
  }, [camera, size, parts, pkg, pos, h, w, S]);

  useFrame((st) => {
    const g = root.current;
    if (!g) return;
    const sc = appearScale(propDelay(pos[0], 0.5), runtime.assemblyTime);
    g.visible = sc > 0;
    g.scale.setScalar(Math.max(0.001, sc) * S);
    const t = st.clock.elapsedTime;
    const s = useGame.getState();
    const hidden = s.packages[pkg.id] === 'HIDDEN' || s.packages[pkg.id] === 'DISCOVERED';
    const now = performance.now();
    const hinted = (s.ui.hintUntil > now && hidden) || s.ui.showMe === pkg.id;
    const hovered = runtime.hoverPackage === pkg.id;
    // glint: an occasional warm twinkle on hidden boxes, brighter on hover
    const cycle = (t + pkg.id.length * 0.77) % 6.5;
    const idle = hidden && cycle < 0.6 ? Math.sin((cycle / 0.6) * Math.PI) * 0.8 : 0;
    const gm = glint.current.material as THREE.SpriteMaterial;
    gm.opacity = Math.max(idle, hovered && !s.active ? 1 : 0, hinted ? 0.9 : 0);
    gm.rotation = t * 0.8;
    glint.current.scale.setScalar((hovered ? 0.9 : 0.6) + Math.sin(t * 6) * 0.08);
    beacon.current.visible = hinted;
    if (hinted) {
      (beacon.current.material as THREE.MeshBasicMaterial).opacity = 0.35 + Math.sin(t * 5) * 0.2;
      beacon.current.scale.set(1, 1 + Math.sin(t * 3) * 0.05, 1);
    }
    // the revealed cracker slowly turns
    if (parts.model.visible && s.active?.id === pkg.id) parts.model.rotation.y += 0.01;
    // keep the halo facing the camera
    presenter.current.getWorldQuaternion(_q).invert();
    halo.current.quaternion.copy(_q).multiply(camera.quaternion);
  });

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    if (e.delta > 8) return;
    beginReveal(pkg.id);
  };

  const k = 1 - (1 - taper) * (1 - lid);
  return (
    <group ref={root} position={pos} rotation={[0, anchor.rotY ?? 0, 0]}>
      <group
        ref={presenter}
        onClick={(e) => {
          const a = useGame.getState().active;
          if (a?.id !== pkg.id) return;
          e.stopPropagation();
          if (a.step === 'presented') openActive();
        }}
      >
        <mesh geometry={parts.bodyGeo} material={parts.mats.body} castShadow receiveShadow />
        <group ref={lidPivot} position={[0, parts.hingeY, parts.hingeZ]}>
          <mesh geometry={parts.lidGeo} material={parts.mats.lid} castShadow />
        </group>
        <primitive object={parts.model} />
        <mesh ref={halo} position={[0, h * 0.55, -0.02]} renderOrder={-1} raycast={() => {}}>
          <planeGeometry args={[2.6 * Math.max(w, h), 2.6 * Math.max(w, h)]} />
          <meshBasicMaterial map={getGlowTexture()} transparent opacity={0} depthWrite={false} blending={THREE.AdditiveBlending} color="#FFD9A0" toneMapped={false} />
        </mesh>
      </group>
      <sprite ref={glint} position={[w * 0.35, h + 0.15, d * 0.3]} raycast={() => {}}>
        <spriteMaterial map={glintTex} transparent opacity={0} depthWrite={false} depthTest={false} blending={THREE.AdditiveBlending} toneMapped={false} />
      </sprite>
      <mesh ref={beacon} position={[0, 3.2, 0]} visible={false} raycast={() => {}}>
        <cylinderGeometry args={[0.12, 0.55, 6, 16, 1, true]} />
        <meshBasicMaterial color="#FFD15A" transparent opacity={0.4} depthWrite={false} blending={THREE.AdditiveBlending} side={THREE.DoubleSide} toneMapped={false} />
      </mesh>
      {/* generous hit volume: hidden objects should not need precise motor control */}
      <mesh
        position={[0, h / 2, 0]}
        visible={false}
        onClick={onClick}
        onDoubleClick={onClick}
        onPointerOver={(e) => {
          e.stopPropagation();
          runtime.hoverPackage = pkg.id;
          document.body.style.cursor = 'pointer';
          audio.hover();
        }}
        onPointerOut={() => {
          if (runtime.hoverPackage === pkg.id) runtime.hoverPackage = null;
          document.body.style.cursor = '';
        }}
      >
        <boxGeometry args={[w * k + pkg.interaction.hitPadding * 2, h + pkg.interaction.hitPadding * 2, d + pkg.interaction.hitPadding * 2]} />
      </mesh>
    </group>
  );
}

export function PackageBoxes() {
  return (
    <>
      {PACKAGES.map((p) => (
        <PackageBox key={p.id} pkg={p} />
      ))}
    </>
  );
}

export type { PackageId };
