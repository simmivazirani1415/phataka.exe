import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { runtime } from '../game/Runtime';
import { useGame } from '../game/GameState';
import { assemblyUniforms, overrideAssembly } from '../world/WorldAssembly';
import { BLOCK_DURATION, type Block } from '../world/BlockBuilder';
import { buildPerson, type Rig } from '../world/Characters';
import type { CharacterSpec } from '../world/WorldBuilder';
import { createCrackerModel, paint } from '../assets/ProceduralModels';
import { makeCanvas, mulberry32 } from '../utils/TextureGenerator';
import { asmBack, filmFov, HERO_ID, identLayout, rocketDir, rocketPath, type StoryWindow } from './identLayout';
import { filmCamera } from './identCamera';
import { chakriSpin, chakriU, FX_T, IdentParticles } from './IdentParticles';
import { filmOnScreen, filmTime, HOLD, ident, useIdent } from './identState';

// The 3D half of the intro ident: a film camera, the hero house assembling, three window
// stories, the rooftop chakri / anaar / rocket and every spark. Nothing here keeps its own
// clock; each frame is posed from the master timeline's time.

const SNAP_DUR = 0.42;
const FILM_FOG = { color: new THREE.Color('#121A3C'), near: 22, far: 95 };


// ---------------------------------------------------------------------------------------
// Hero house: its pieces snap together along the camera's path, just ahead of the lens.

function heroTiming(windows: StoryWindow[]) {
  const L = identLayout();
  const A = windows[0];
  const Cw = windows[2];
  const dx = Cw.x - A.x;
  const dy = Cw.y - A.y;
  const len2 = dx * dx + dy * dy;
  return (b: Block, base: number) => {
    if (b.tag !== HERO_ID) return null;
    // stable per-block randomness, so every replay assembles identically
    const r = mulberry32(Math.floor((b.x * 73.1 + b.y * 191.7 + b.z * 37.3) * 1000) ^ 0x5f3759df);
    const p = THREE.MathUtils.clamp(((b.x - A.x) * dx + (b.y - A.y) * dy) / len2, -0.4, 1.4);
    const j = (r() - 0.5) * 0.08;
    // pieces that frame a story window land together with it
    const near = windows.find((w) => Math.abs(b.x - w.x) < w.w / 2 + 0.25 && Math.abs(b.y - w.y) < w.h / 2 + 0.45 && b.z > L.zF - 0.05);
    const onRoof = b.y > L.roofY - 0.3;
    let d: number;
    let off: [number, number, number];
    if (b.phase === 'walls') {
      d = -0.42 + 0.3 * p + j;
      off = [0, -0.7 - r() * 0.5, 0];
    } else if (onRoof) {
      d = 0.32 + r() * 0.16;
      off = [(r() - 0.5) * 0.4, 0.8 + r() * 0.4, (r() - 0.5) * 0.4];
    } else {
      d = near ? near.land - 0.04 + j * 0.5 : -0.1 + 0.42 * p + j;
      // facade details fly in from the street side and click onto the wall
      off = [(r() - 0.5) * 0.35, (r() - 0.5) * 0.3 + 0.12, 0.7 + r() * 0.5];
    }
    return { delay: base + Math.min(0.5, d), offset: off };
  };
}

// ---------------------------------------------------------------------------------------
// Window stories

function interiorTexture(seed: number) {
  const { c, ctx } = makeCanvas(128, 160);
  const g = ctx.createLinearGradient(0, 0, 0, 160);
  g.addColorStop(0, '#FFC874');
  g.addColorStop(0.6, '#FFA64A');
  g.addColorStop(1, '#E9762E');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 160);
  const h = ctx.createRadialGradient(64 + (seed - 1) * 18, 46, 4, 64, 60, 90);
  h.addColorStop(0, 'rgba(255,246,214,0.95)');
  h.addColorStop(1, 'rgba(255,246,214,0)');
  ctx.fillStyle = h;
  ctx.fillRect(0, 0, 128, 160);
  // a framed picture and a shelf line on the back wall
  ctx.fillStyle = 'rgba(140,60,30,0.22)';
  ctx.fillRect(seed === 2 ? 14 : 82, 30, 26, 32);
  ctx.fillRect(0, 108, 128, 3);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

interface Figure {
  rig: Rig;
  baseY: number;
  mats: { m: THREE.MeshBasicMaterial; base: THREE.Color }[];
}

interface StoryRig {
  win: StoryWindow;
  group: THREE.Group;
  interior: THREE.MeshBasicMaterial;
  figures: Figure[];
  hand?: THREE.Object3D;
  diyas: THREE.Vector3[];
  medallion?: THREE.Group;
}

const DARK = new THREE.Color('#141B33');

function person(id: string, kind: CharacterSpec['kind'], colors: CharacterSpec['colors']): CharacterSpec {
  return { id, kind, pos: [0, 0, 0], rotY: 0, pose: 'stand', anim: 'idle', stage: 0, colors, name: id };
}

function figure(spec: CharacterSpec, x: number, y: number, z: number, scale: number, planes: THREE.Plane[]): Figure {
  const rig = buildPerson(spec);
  const cache = new Map<string, THREE.MeshBasicMaterial>();
  const mats: Figure['mats'] = [];
  rig.root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = false;
    const src = mesh.material as THREE.MeshStandardMaterial;
    const key = src.color.getHexString();
    let m = cache.get(key);
    if (!m) {
      // lit from the lamp behind them: deep, warm silhouettes with a hint of their colours
      const base = src.color.clone().multiplyScalar(0.42).lerp(new THREE.Color('#3A1E2A'), 0.35);
      m = new THREE.MeshBasicMaterial({ color: base.clone(), clippingPlanes: planes, fog: false });
      cache.set(key, m);
      mats.push({ m, base });
    }
    mesh.material = m;
  });
  rig.root.scale.multiplyScalar(scale);
  rig.root.scale.z *= 0.45;
  rig.root.position.set(x, y, z);
  return { rig, baseY: y, mats };
}

function marigoldRing(radius: number, vertical: boolean, emissive: boolean) {
  const g = new THREE.Group();
  const bead = new THREE.SphereGeometry(0.034, 10, 8);
  const n = 18;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const col = i % 2 ? '#FFD15A' : '#F28C28';
    const m = new THREE.Mesh(bead, paint(col, 0.8, 0, emissive ? col : undefined));
    m.position.set(Math.cos(a) * radius, vertical ? Math.sin(a) * radius : 0, vertical ? 0 : Math.sin(a) * radius);
    g.add(m);
  }
  const ringGeo = new THREE.TorusGeometry(radius * 0.55, 0.02, 8, 32);
  const inner = new THREE.Mesh(ringGeo, paint('#D64A91', 0.6, 0, emissive ? '#D64A91' : undefined));
  if (!vertical) inner.rotation.x = Math.PI / 2;
  g.add(inner);
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.26, radius * 0.26, 0.02, 20), paint('#3446A4', 0.5, 0.2));
  if (vertical) disc.rotation.x = Math.PI / 2;
  g.add(disc);
  const dot = new THREE.Mesh(new THREE.SphereGeometry(radius * 0.1, 10, 8), paint('#FFE7A3', 0.4, 0.3, '#FFD15A'));
  dot.position.set(0, vertical ? 0 : 0.015, vertical ? 0.015 : 0);
  g.add(dot);
  return g;
}

function buildStories(): StoryRig[] {
  const L = identLayout();
  const skin = '#B97A56';
  return L.windows.map((win, idx) => {
    const group = new THREE.Group();
    group.position.set(win.x, win.y, win.z);
    const planes = [
      new THREE.Plane(new THREE.Vector3(1, 0, 0), -(win.x - win.w / 2)),
      new THREE.Plane(new THREE.Vector3(-1, 0, 0), win.x + win.w / 2),
      new THREE.Plane(new THREE.Vector3(0, 1, 0), -(win.y - win.h / 2)),
      new THREE.Plane(new THREE.Vector3(0, -1, 0), win.y + win.h / 2),
    ];
    const interior = new THREE.MeshBasicMaterial({ map: interiorTexture(idx), toneMapped: false, color: DARK.clone(), fog: false });
    const pane = new THREE.Mesh(new THREE.PlaneGeometry(win.w, win.h), interior);
    pane.position.z = 0.135;
    group.add(pane);
    const figures: Figure[] = [];
    const story: StoryRig = { win, group, interior, figures, diyas: [] };
    const fz = 0.21;
    if (idx === 0) {
      // A: the family celebrating together
      figures.push(figure(person('papa', 'man', { top: '#CE382A', bottom: '#F2E3C4', hair: '#1E1A1A', skin }), -0.2, -0.62, fz, 0.47, planes));
      figures.push(figure(person('mummy', 'woman', { top: '#D64A91', bottom: '#D64A91', drape: '#FFD15A', hair: '#1E1A1A', skin }), 0.2, -0.62, fz, 0.45, planes));
      figures.push(figure(person('beta', 'child', { top: '#FFD15A', bottom: '#3446A4', hair: '#1E1A1A', skin }), 0.0, -0.5, fz + 0.06, 0.62, planes));
    } else if (idx === 1) {
      // B: children playing, one twirling a phuljhadi
      figures.push(figure(person('pinky', 'child', { top: '#148C88', bottom: '#FFD15A', hair: '#1E1A1A', skin }), -0.18, -0.52, fz, 0.66, planes));
      const kid = figure(person('golu', 'child', { top: '#F28C28', bottom: '#3446A4', hair: '#1E1A1A', skin }), 0.18, -0.52, fz, 0.66, planes);
      figures.push(kid);
      const hand = new THREE.Object3D();
      hand.position.set(0, -0.62, 0.05);
      kid.rig.armR.add(hand);
      story.hand = hand;
    } else {
      // C: relatives decorating with diyas under a hanging marigold medallion
      figures.push(figure(person('dadi', 'elder', { top: '#FFF0D2', bottom: '#FFF0D2', drape: '#A9573B', hair: '#D9D2C5', skin }), -0.2, -0.64, fz, 0.44, planes));
      figures.push(figure(person('bua', 'woman', { top: '#148C88', bottom: '#148C88', drape: '#F5A623', hair: '#1E1A1A', skin }), 0.21, -0.63, fz, 0.44, planes));
      const med = marigoldRing(0.175, true, true);
      med.position.set(0, L.medallion.y - win.y, L.medallion.z - win.z);
      group.add(med);
      story.medallion = med;
      const thread = new THREE.Mesh(new THREE.BoxGeometry(0.008, 1, 0.008), paint('#E9C46A', 0.5, 0.4));
      const top = win.h / 2;
      const medTop = med.position.y + 0.2;
      thread.scale.y = Math.max(0.01, top - medTop);
      thread.position.set(0, (top + medTop) / 2, med.position.z);
      group.add(thread);
      // four diyas along the sill, lit one by one
      const clay = new THREE.CylinderGeometry(0.036, 0.026, 0.028, 12);
      for (let i = 0; i < 4; i++) {
        const x = -0.27 + i * 0.18;
        const d = new THREE.Mesh(clay, paint('#B8613A', 0.95));
        d.position.set(x, -win.h / 2 - 0.056, 0.13);
        group.add(d);
        story.diyas.push(new THREE.Vector3(win.x + x, win.y - win.h / 2 - 0.02, win.z + 0.13));
      }
    }
    figures.forEach((f) => group.add(f.rig.root));
    return story;
  });
}

const smooth = THREE.MathUtils.smoothstep;

function poseStories(stories: StoryRig[], t: number) {
  stories.forEach((s, idx) => {
    const w = s.win;
    // the window's pieces snap in like the house's own blocks
    const k = THREE.MathUtils.clamp((t - w.land) / SNAP_DUR, 0, 1);
    const sc = smooth(k, 0, 0.28);
    s.group.visible = sc > 0.001;
    s.group.scale.setScalar(Math.max(0.001, sc));
    s.group.position.z = w.z + (1 - asmBack(k)) * 0.9;
    const lamp = ident.lamp[(['a', 'b', 'c'] as const)[idx]];
    s.interior.color.copy(DARK).lerp(new THREE.Color(1, 1, 1), lamp);
    const glow = 0.35 + 0.65 * lamp;
    s.figures.forEach((f) => f.mats.forEach(({ m, base }) => m.color.copy(base).multiplyScalar(glow)));
    const lt = Math.max(0, t - w.light);
    const [a, b, c] = s.figures;
    if (idx === 0) {
      // papa and beta throw their arms up; mummy claps
      const cheer = smooth(lt, 0, 0.18);
      const bob = Math.sin(lt * 11) * 0.5 + 0.5;
      a.rig.armL.rotation.z = -(0.15 + 2.5 * cheer - 0.25 * bob * cheer);
      a.rig.armR.rotation.z = 0.15 + 2.5 * cheer - 0.25 * bob * cheer;
      a.rig.root.position.y = a.baseY + bob * 0.02 * cheer;
      c.rig.armL.rotation.z = -(2.3 * cheer);
      c.rig.armR.rotation.z = 2.3 * cheer;
      c.rig.root.position.y = c.baseY + Math.abs(Math.sin(lt * 9)) * 0.05 * cheer;
      const clap = Math.sin(lt * 16) * 0.5 + 0.5;
      b.rig.armL.rotation.x = -1.1 * cheer;
      b.rig.armR.rotation.x = -1.1 * cheer;
      b.rig.armL.rotation.z = 0.35 * clap * cheer;
      b.rig.armR.rotation.z = -0.35 * clap * cheer;
      b.rig.head.rotation.z = Math.sin(lt * 5) * 0.08;
    } else if (idx === 1) {
      // pinky hops, golu draws circles with the sparkler
      const on = smooth(lt, 0, 0.12);
      a.rig.root.position.y = a.baseY + Math.abs(Math.sin(lt * 10)) * 0.07 * on;
      a.rig.armL.rotation.z = -1.9 * on;
      a.rig.armR.rotation.z = 1.4 * on + Math.sin(lt * 10) * 0.2;
      const swirl = lt * 13;
      b.rig.armR.rotation.x = -(1.5 + Math.sin(swirl) * 0.45) * on;
      b.rig.armR.rotation.z = Math.cos(swirl) * 0.45 * on;
      b.rig.head.rotation.y = -0.3 * on;
    } else {
      // dadi bends to set down a diya; bua reaches up to the medallion
      const on = smooth(lt, 0, 0.2);
      const dip = Math.sin(Math.min(1, lt / 0.5) * Math.PI);
      a.rig.body.rotation.x = (0.25 + 0.2 * dip) * on;
      a.rig.armL.rotation.x = -1.0 * on;
      a.rig.armR.rotation.x = -1.2 * on;
      b.rig.armL.rotation.z = -2.2 * on;
      b.rig.armR.rotation.x = -0.9 * on;
      b.rig.head.rotation.x = -0.25 * on;
      if (s.medallion) s.medallion.rotation.z = Math.sin(t * 2.2) * 0.05;
    }
  });
}

// ---------------------------------------------------------------------------------------
// Rooftop patakas

function introChakri() {
  const g = new THREE.Group();
  const coilMats = [new THREE.MeshStandardMaterial({ color: '#F28C28', roughness: 0.6 }), new THREE.MeshStandardMaterial({ color: '#FFD15A', roughness: 0.6 })];
  const seg = new THREE.BoxGeometry(0.075, 0.05, 0.05);
  const n = 18;
  const R = 0.175;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const m = new THREE.Mesh(seg, coilMats[i % 2]);
    m.position.set(Math.cos(a) * R, 0.03, Math.sin(a) * R);
    m.rotation.y = -a + Math.PI / 2;
    g.add(m);
  }
  const inner = new THREE.Mesh(new THREE.TorusGeometry(R * 0.55, 0.02, 8, 32), new THREE.MeshStandardMaterial({ color: '#D64A91', roughness: 0.6 }));
  inner.rotation.x = Math.PI / 2;
  inner.position.y = 0.03;
  g.add(inner);
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.26, R * 0.26, 0.06, 18), new THREE.MeshStandardMaterial({ color: '#3446A4', roughness: 0.5 }));
  hub.position.y = 0.03;
  g.add(hub);
  return { group: g, coilMats };
}

function bottle() {
  const g = new THREE.Group();
  const glass = new THREE.MeshStandardMaterial({ color: '#7FC8B8', roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.55 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.26, 16), glass);
  body.position.y = 0.13;
  const shoulder = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.1, 0.07, 16), glass);
  shoulder.position.y = 0.295;
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.045, 0.1, 12), glass);
  neck.position.y = 0.38;
  g.add(body, shoulder, neck);
  return g;
}

// ---------------------------------------------------------------------------------------

/** Low graphics has no composer, so the film camera is drawn here instead of by R3F. */
function FilmRender({ film }: { film: THREE.Camera }) {
  useFrame(({ gl, scene, camera }) => {
    gl.render(scene, filmOnScreen() ? film : camera);
  }, 1);
  return null;
}

function Film() {
  const { gl, scene, size } = useThree();
  const graphics = useGame((s) => s.settings.graphics);
  const L = identLayout();
  const persp = useMemo(() => new THREE.PerspectiveCamera(38, 1, 0.05, 320), []);
  const stories = useMemo(buildStories, []);
  const roof = useMemo(() => {
    const chakri = introChakri();
    const anaar = createCrackerModel('anaar', ['#CE382A', '#FFD15A', '#148C88']);
    anaar.scale.setScalar(1.6);
    anaar.position.copy(L.anaar);
    const rocket = createCrackerModel('rocket', ['#CE382A', '#FFD15A', '#148C88']);
    rocket.scale.setScalar(1.3);
    const jar = bottle();
    jar.position.copy(L.rocketBase);
    return { chakri, anaar, rocket, jar };
  }, [L]);
  const particles = useMemo(() => new IdentParticles(), []);
  const root = useRef<THREE.Group>(null!);
  const applied = useRef(-1);
  const frames = useRef(0);
  const lastComposer = useRef<unknown>(null);
  const lastCam = useRef<THREE.Camera | null>(null);
  const timing = useMemo(() => heroTiming(L.windows), [L]);

  useEffect(() => {
    const prev = gl.localClippingEnabled;
    gl.localClippingEnabled = true;
    try {
      gl.compile(scene, persp);
    } catch {
      /* compiling ahead is only an optimisation */
    }
    return () => {
      gl.localClippingEnabled = prev;
      ident.ready = false;
      runtime.intro.assembly = null;
      runtime.intro.world = 1;
      runtime.intro.key = 0;
      assemblyUniforms.uDur.value = BLOCK_DURATION;
      particles.dispose();
    };
  }, [gl, scene, persp, particles]);

  const _pos = useMemo(() => new THREE.Vector3(), []);
  const _target = useMemo(() => new THREE.Vector3(), []);
  const _hand = useMemo(() => new THREE.Vector3(), []);
  const _dir = useMemo(() => new THREE.Vector3(), []);
  const _up = useMemo(() => new THREE.Vector3(0, 1, 0), []);
  const _n = useMemo(() => new THREE.Vector3(), []);

  useFrame((state) => {
    if (++frames.current === 3) ident.ready = true;
    const t = filmTime();
    const st = useIdent.getState();
    const filmPlaying = st.stage === 'film' && !!ident.master;
    const onScreen = filmOnScreen();

    // the hero house re-assembles each time the film starts
    if (filmPlaying && applied.current !== st.nonce && t < 0.5) {
      applied.current = st.nonce;
      ident.base = runtime.assemblyTime - t;
      overrideAssembly((b) => timing(b, ident.base));
    }
    runtime.intro.assembly = filmPlaying && t < HOLD ? ident.base + t : null;
    assemblyUniforms.uDur.value = onScreen ? SNAP_DUR : BLOCK_DURATION;

    // lighting and atmosphere
    runtime.intro.world = onScreen ? ident.world : 1;
    const fire = t > FX_T.chakri[0] && t < FX_T.rocket[0] + 0.3 ? 0.85 + Math.sin(t * 47) * 0.1 + Math.sin(t * 23) * 0.08 : 1;
    runtime.intro.key = onScreen ? ident.key.i * fire : 0;
    runtime.intro.keyPos = [ident.key.x, ident.key.y, ident.key.z];
    // the street sets its own fog once the film hands over
    const fog = scene.fog;
    if (onScreen && fog instanceof THREE.Fog) {
      const f = FILM_FOG;
      fog.color.copy(f.color);
      fog.near = f.near;
      fog.far = f.far;
    }

    // route the frame through the right camera
    const composer = runtime.composer;
    const cam = onScreen ? persp : state.camera;
    if (composer && (composer !== lastComposer.current || cam !== lastCam.current)) {
      composer.setMainCamera(cam);
      lastComposer.current = composer;
      lastCam.current = cam;
    }

    root.current.visible = onScreen;
    if (!onScreen) return;

    // film camera
    const aspect = size.width / Math.max(1, size.height);
    const fov = filmFov(aspect);
    if (persp.fov !== fov || persp.aspect !== aspect) {
      persp.fov = fov;
      persp.aspect = aspect;
      persp.updateProjectionMatrix();
    }
    filmCamera(t, _pos, _target);
    persp.position.copy(_pos);
    persp.lookAt(_target);
    persp.updateMatrixWorld();

    // window stories
    poseStories(stories, t);

    // chakri spins along the roof towards the anaar, then burns out
    const ch = roof.chakri;
    ch.group.position.lerpVectors(L.chakriStart, L.chakriEnd, chakriU(t));
    ch.group.rotation.y = -chakriSpin(t);
    const burning = smooth(t, FX_T.chakri[0], FX_T.chakri[0] + 0.05) * (1 - smooth(t, FX_T.chakri[1] - 0.1, FX_T.chakri[1] + 0.2));
    ch.coilMats.forEach((m, i) => {
      m.emissive.set(i ? '#FFD15A' : '#FF8A2A');
      m.emissiveIntensity = 1.4 * burning;
    });
    ch.group.visible = t >= FX_T.chakri[0] - 0.02;

    // rocket waits in its bottle, then flies the arc
    const u = ident.rocket.u;
    rocketPath(u, roof.rocket.position);
    roof.rocket.position.y += 0.04;
    rocketDir(u, _dir);
    if (u > 0) roof.rocket.quaternion.setFromUnitVectors(_up, _dir);
    else roof.rocket.quaternion.identity();
    roof.rocket.visible = t < FX_T.rocket[1] + 0.02;

    // sparks
    const hand = stories[1].hand;
    let handPos: THREE.Vector3 | null = null;
    if (hand && stories[1].group.visible) {
      hand.getWorldPosition(_hand);
      handPos = _hand;
    }
    const cWin = L.windows[2];
    const diyaLight = stories[2].diyas.map((_, i) => smooth(t, cWin.light - 0.06 + i * 0.07, cWin.light + 0.02 + i * 0.07));
    // the frame is laid out facing the camera at the reveal
    _n.set(0, 0, -1);
    particles.uniforms.uPx.value = (size.height * gl.getPixelRatio()) / (2 * Math.tan(THREE.MathUtils.degToRad(persp.fov / 2)));
    particles.uniforms.uIntensity.value = runtime.composer ? 1.5 : 1;
    particles.update({ t, sparklerHand: handPos, diyaPos: stories[2].diyas, diyaLight, burstNormal: _n });
  });

  return (
    <>
      <group ref={root}>
        {stories.map((s, i) => (
          <primitive key={i} object={s.group} />
        ))}
        <primitive object={roof.chakri.group} />
        <primitive object={roof.anaar} />
        <primitive object={roof.jar} />
        <primitive object={roof.rocket} />
        <primitive object={particles.points} />
      </group>
      {graphics === 'low' && <FilmRender film={persp} />}
    </>
  );
}

export function IdentScene() {
  const stage = useIdent((s) => s.stage);
  if (stage === 'off') return null;
  return <Film />;
}
