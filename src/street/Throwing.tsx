import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { PACKAGE_BY_ID, type PackageId, type Vec3 } from '../assets/AssetRegistry';
import { createCrackerModel } from '../assets/ProceduralModels';
import { useGame } from '../game/GameState';
import { runtime } from '../game/Runtime';
import { audio } from '../audio/AudioEngine';
import { arcHeight, arcPoint, buzz, canThrowHere, checkThrow, flightTime, landAndBurst, markHintSeen, reach, resolveTarget, useThrow } from './throwing';
import { levelState } from './StreetLayout';
import { crowd } from './Crowd';

// The throw, in the world: the dotted arc and landing marker while aiming, a soft scatter of
// dots on the open ground around the aim (where it may land), and the cracker itself in the
// air, tumbling, bouncing twice and settling before it goes off.

const DOTS = 30;
const HINTS = 140;
const _ray = new THREE.Raycaster();
const _ndc = new THREE.Vector2();
const _hit = new THREE.Vector3();
const _plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const _p = { x: 0, y: 0, z: 0 };
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _v = new THREE.Vector3();
const _r = new THREE.Vector3();

/** Shared with the HTML cracker-in-hand, so a press on it starts the aim too. */
export const aimApi: { start: (e: PointerEvent | React.PointerEvent) => void } = { start: () => {} };

interface Flight {
  id: PackageId;
  model: THREE.Object3D;
  from: Vec3;
  land: Vec3;
  to: Vec3;
  h: number;
  T: number;
  t: number;
  spin: THREE.Vector3;
  dir: [number, number];
  phase: 'air' | 'bounce' | 'done';
  bt: number;
}

function blockedByUi() {
  const s = useGame.getState();
  return s.phase !== 'playing' || !!s.active || s.ui.album || s.ui.map || s.ui.settings;
}

export function Throwing() {
  const { camera, gl, scene } = useThree();
  const group = useRef<THREE.Group>(null!);
  const flight = useRef<Flight | null>(null);
  const aim = useRef<{ id: number; x: number; y: number; touch: boolean; t0: number; moved: number } | null>(null);
  const zoom = useRef({ k: 1, base: 0 });
  const hintAt = useRef(0);

  const parts = useMemo(() => {
    const dotGeo = new THREE.SphereGeometry(0.045, 8, 6);
    const dotMat = new THREE.MeshBasicMaterial({ color: '#fff1d2', transparent: true, opacity: 0.9, depthWrite: false });
    const dots = new THREE.InstancedMesh(dotGeo, dotMat, DOTS);
    dots.frustumCulled = false;
    dots.renderOrder = 5;
    const ringGeo = new THREE.RingGeometry(0.42, 0.52, 40);
    ringGeo.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({ color: '#ffd15a', transparent: true, opacity: 0.95, depthWrite: false, side: THREE.DoubleSide });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    const discGeo = new THREE.CircleGeometry(0.42, 32);
    discGeo.rotateX(-Math.PI / 2);
    const discMat = new THREE.MeshBasicMaterial({ color: '#ffd15a', transparent: true, opacity: 0.16, depthWrite: false });
    const disc = new THREE.Mesh(discGeo, discMat);
    const crossMat = new THREE.MeshBasicMaterial({ color: '#f08a3c', transparent: true, opacity: 0.95, depthWrite: false });
    const cross = new THREE.Group();
    for (const r of [Math.PI / 4, -Math.PI / 4]) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.01, 0.08), crossMat);
      b.rotation.y = r;
      cross.add(b);
    }
    const marker = new THREE.Group();
    marker.add(disc, ring, cross);
    marker.renderOrder = 5;
    const hintGeo = new THREE.CircleGeometry(0.07, 10);
    hintGeo.rotateX(-Math.PI / 2);
    const hintMat = new THREE.MeshBasicMaterial({ color: '#ffd98a', transparent: true, opacity: 0.32, depthWrite: false });
    const hints = new THREE.InstancedMesh(hintGeo, hintMat, HINTS);
    hints.frustumCulled = false;
    hints.count = 0;
    return { dots, dotMat, ring, ringMat, disc, discMat, cross, marker, hints, hintMat };
  }, []);

  // pointer: hold to aim, move to aim, let go to throw
  useEffect(() => {
    const el = gl.domElement;
    const toTarget = (cx: number, cy: number, touch: boolean) => {
      const id = useThrow.getState().armed;
      if (!id) return;
      const r = el.getBoundingClientRect();
      // a finger covers what it touches: aim a little above it
      const y = cy - r.top - (touch ? 70 : 0);
      _ndc.set(((cx - r.left) / r.width) * 2 - 1, -(y / r.height) * 2 + 1);
      _ray.setFromCamera(_ndc, camera);
      _plane.constant = 0;
      const p = runtime.player;
      let hx: number;
      let hz: number;
      const hit = _ray.ray.intersectPlane(_plane, _hit);
      if (hit && hit.distanceTo(_ray.ray.origin) < 80) {
        hx = hit.x;
        hz = hit.z;
      } else {
        // aiming at the sky: as far as it goes, in that direction
        const dx = _ray.ray.direction.x;
        const dz = _ray.ray.direction.z;
        const l = Math.hypot(dx, dz) || 1;
        hx = p.x + (dx / l) * reach().max;
        hz = p.z + (dz / l) * reach().max;
      }
      useThrow.setState({ target: resolveTarget(id, hx, hz) });
    };
    const start = (e: PointerEvent | React.PointerEvent) => {
      const st = useThrow.getState();
      if (!st.armed || st.flying || aim.current || blockedByUi() || !canThrowHere()) return;
      if (useGame.getState().uses[st.armed] <= 0) return;
      const touch = e.pointerType === 'touch';
      aim.current = { id: e.pointerId, x: e.clientX, y: e.clientY, touch, t0: performance.now(), moved: 0 };
      useThrow.setState({ aiming: true });
      toTarget(e.clientX, e.clientY, touch);
      buzz(10);
      audio.tap();
    };
    aimApi.start = start;
    const down = (e: PointerEvent) => {
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      start(e);
    };
    const move = (e: PointerEvent) => {
      const a = aim.current;
      if (!a || a.id !== e.pointerId) return;
      a.moved += Math.abs(e.clientX - a.x) + Math.abs(e.clientY - a.y);
      a.x = e.clientX;
      a.y = e.clientY;
      toTarget(e.clientX, e.clientY, a.touch);
    };
    const up = (e: PointerEvent) => {
      const a = aim.current;
      if (!a || a.id !== e.pointerId) return;
      aim.current = null;
      toTarget(e.clientX, e.clientY, a.touch);
      const st = useThrow.getState();
      const t = st.target;
      useThrow.setState({ aiming: false });
      if (!st.armed || !t) return;
      if (!t.ok) {
        // not there: the cracker stays in hand
        buzz([12, 40, 12]);
        const s = useGame.getState();
        s.setUi({ toast: 'Aim for open ground, away from people and vehicles.' });
        return;
      }
      void launch(st.armed, t.x, t.z);
    };
    const cancel = (e: PointerEvent) => {
      if (aim.current?.id !== e.pointerId) return;
      aim.current = null;
      useThrow.setState({ aiming: false, target: null });
    };
    el.addEventListener('pointerdown', down);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
    const off = () => {
      // leaving the place puts the cracker back
      if (!canThrowHere() && useThrow.getState().armed) useThrow.setState({ armed: null, aiming: false, target: null });
    };
    const t = window.setInterval(off, 500);
    return () => {
      el.removeEventListener('pointerdown', down);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
      window.clearInterval(t);
      aimApi.start = () => {};
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gl, camera]);

  /** Where the throw leaves from: the right hand, a little ahead of the eyes (or the avatar's). */
  const handPos = (): Vec3 => {
    const p = runtime.player;
    const sy = Math.sin(p.yaw);
    const cy = Math.cos(p.yaw);
    const fx = -sy;
    const fz = -cy;
    const rx = cy;
    const rz = -sy;
    if (levelState.id === 'society') return [p.x + rx * 0.32 + fx * 0.3, (p.floor ?? 0) + 1.35, p.z + rz * 0.32 + fz * 0.3];
    camera.getWorldDirection(_v);
    return [camera.position.x + rx * 0.3 + _v.x * 0.9, camera.position.y - 0.45 + _v.y * 0.5, camera.position.z + rz * 0.3 + _v.z * 0.9];
  };

  const launch = async (id: PackageId, x: number, z: number) => {
    const g = useGame.getState();
    if (g.active || runtime.fireworks?.busy() || g.uses[id] <= 0) return;
    if (checkThrow(id, x, z) !== 'ok') return;
    const pkg = PACKAGE_BY_ID[id];
    const to: Vec3 = [x, 0, z];
    const from = handPos();
    const dx = x - from[0];
    const dz = z - from[2];
    const dl = Math.hypot(dx, dz) || 1;
    const dir: [number, number] = [dx / dl, dz / dl];
    // it lands a little short and skids the last bit to the spot
    const skid = Math.min(0.55, dl * 0.08);
    const land: Vec3 = [x - dir[0] * skid, 0, z - dir[1] * skid];
    const h = arcHeight(from, land);
    const T = flightTime(from, land, h);
    const model = createCrackerModel(pkg.crackerType, pkg.palette, pkg.image.front ?? undefined);
    model.position.set(...from);
    group.current.add(model);
    flight.current = {
      id,
      model,
      from,
      land,
      to,
      h,
      T,
      t: 0,
      spin: new THREE.Vector3(5 + Math.random() * 4, (Math.random() - 0.5) * 4, (Math.random() - 0.5) * 6),
      dir,
      phase: 'air',
      bt: 0,
    };
    markHintSeen();
    // the figure in the society swings its arm
    const me = crowd.agents.find((a) => a.owner === 'player');
    if (me) {
      me.react = 'point';
      me.reactT = 0;
      me.reactDur = 0.55;
    }
    useThrow.setState({ flying: true, target: null });
    g.setActive({ id, step: 'flying', replay: false, capture: true, pos: to });
    buzz(22);
    audio.whoosh(Math.min(1.2, T + 0.2));
    const cam = runtime.camera;
    cam?.setUserInput(false);
    const d = Math.hypot(x - runtime.player.x, z - runtime.player.z);
    const big = pkg.crackerType === 'rocket' || pkg.crackerType === 'skyshot';
    // the camera eases after it and keeps where it lands in view, the burst in frame
    if (levelState.id === 'balcony') void cam?.frame(to, { dist: Math.max(3.6, Math.min(6, d * 0.55)), height: big ? 2.6 : 3.0, lookY: big ? 0.9 : -0.1, duration: T + 0.45, free: true });
    else void cam?.frame(to, { dist: Math.max(3.4, Math.min(5.5, d * 0.6)), height: big ? 1.5 : 1.9, lookY: big ? 1.1 : 0.05, duration: T + 0.45, free: true });
  };

  useFrame((st, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const ts = useThrow.getState();
    const now = performance.now();

    // a slightly tighter view while aiming
    const z = zoom.current;
    const cam = camera as THREE.PerspectiveCamera;
    const want = ts.aiming && !useGame.getState().settings.reducedMotion ? 0.9 : 1;
    if (z.k === 1 && want === 1) z.base = cam.fov;
    if (z.base && (z.k !== want || cam.fov !== z.base * z.k)) {
      z.k += (want - z.k) * Math.min(1, dt * 8);
      if (Math.abs(z.k - want) < 0.002) z.k = want;
      cam.fov = z.base * z.k;
      cam.updateProjectionMatrix();
    }

    // aim: arc, marker and the open ground around it
    const t = ts.aiming ? ts.target : null;
    parts.dots.visible = !!t;
    parts.marker.visible = !!t;
    parts.hints.visible = !!t;
    if (t && ts.armed) {
      const from = handPos();
      const to: Vec3 = [t.x, 0, t.z];
      const h = arcHeight(from, to);
      const march = (st.clock.elapsedTime * 1.6) % 1;
      for (let i = 0; i < DOTS; i++) {
        const u = Math.min(1, (i + march) / DOTS);
        arcPoint(from, to, h, u, _p);
        // the first stretch of the arc is right in front of the eyes: leave it out
        const near = Math.hypot(_p.x - camera.position.x, _p.y - camera.position.y, _p.z - camera.position.z);
        const sc = near < 1.6 ? 0.001 : Math.min(1, (near - 1.6) / 1.2) * (0.75 + 0.35 * (1 - u));
        _m.compose(_s.set(_p.x, _p.y, _p.z), _q.identity(), _r.set(sc, sc, sc));
        parts.dots.setMatrixAt(i, _m);
      }
      parts.dots.instanceMatrix.needsUpdate = true;
      parts.dotMat.color.set(t.ok ? '#fff1d2' : '#f6b38a');
      parts.dotMat.opacity = t.ok ? 0.9 : 0.6;
      parts.marker.position.set(t.x, 0.04, t.z);
      const pulse = 1 + Math.sin(st.clock.elapsedTime * 6) * 0.06;
      parts.marker.scale.setScalar(pulse * (t.ok ? 1 : 0.9));
      parts.ringMat.color.set(t.ok ? '#ffd15a' : '#f08a3c');
      parts.discMat.color.set(t.ok ? '#ffd15a' : '#f08a3c');
      parts.cross.visible = !t.ok;
      // a soft scatter of dots on the open ground near the aim: where it may land
      if (now - hintAt.current > 220) {
        hintAt.current = now;
        let n = 0;
        const step = 0.9;
        for (let gx = -4; gx <= 4 && n < HINTS; gx++) {
          for (let gz = -4; gz <= 4 && n < HINTS; gz++) {
            if (gx * gx + gz * gz > 17) continue;
            const x = Math.round((t.x + gx * step) / step) * step;
            const zz = Math.round((t.z + gz * step) / step) * step;
            if (checkThrow(ts.armed, x, zz) !== 'ok') continue;
            _m.makeTranslation(x, 0.03, zz);
            parts.hints.setMatrixAt(n++, _m);
          }
        }
        parts.hints.count = n;
        parts.hints.instanceMatrix.needsUpdate = true;
      }
    }

    // the cracker in the air
    const f = flight.current;
    if (!f) return;
    if (f.phase === 'air') {
      f.t += dt;
      const u = Math.min(1, f.t / f.T);
      arcPoint(f.from, f.land, f.h, u, _p);
      f.model.position.set(_p.x, _p.y, _p.z);
      f.model.rotation.x += f.spin.x * dt;
      f.model.rotation.y += f.spin.y * dt;
      f.model.rotation.z += f.spin.z * dt;
      if (u >= 1) {
        f.phase = 'bounce';
        f.bt = 0;
        audio.pop(0.05);
        buzz(12);
      }
    } else if (f.phase === 'bounce') {
      // two small hops and a skid to the spot, settling upright
      f.bt += dt;
      const D = 0.42;
      const u = Math.min(1, f.bt / D);
      const x = f.land[0] + (f.to[0] - f.land[0]) * (1 - (1 - u) ** 2);
      const zz = f.land[2] + (f.to[2] - f.land[2]) * (1 - (1 - u) ** 2);
      const y = u < 0.62 ? Math.sin((u / 0.62) * Math.PI) * 0.16 : Math.sin(((u - 0.62) / 0.38) * Math.PI) * 0.04;
      f.model.position.set(x, y, zz);
      const k = Math.min(1, dt * 12);
      f.model.rotation.x += (0 - f.model.rotation.x) * k;
      f.model.rotation.z += (0 - f.model.rotation.z) * k;
      if (u >= 0.62 && u - dt / D < 0.62) audio.pop(0.03);
      if (u >= 1) {
        f.phase = 'done';
        group.current.remove(f.model);
        f.model.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
        flight.current = null;
        const id = f.id;
        const pos = f.to;
        void (async () => {
          await landAndBurst(id, pos);
          const left = useGame.getState().uses[id];
          useThrow.setState({ flying: false, armed: left > 0 ? id : null });
        })();
      }
    }
  });

  useEffect(() => {
    const g = group.current;
    g.add(parts.dots, parts.marker, parts.hints);
    return () => {
      g.remove(parts.dots, parts.marker, parts.hints);
    };
  }, [parts, scene]);

  return <group ref={group} />;
}
