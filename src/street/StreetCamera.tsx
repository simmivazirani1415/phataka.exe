import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { runtime, type CameraApi, type ViewState } from '../game/Runtime';
import { useGame } from '../game/GameState';
import { isOpen, START, STREET } from './StreetLayout';
import type { Vec3 } from '../assets/AssetRegistry';

// The player's eyes: a perspective camera at 1.6 m that walks the gali.
// WASD / arrows walk and turn, drag looks around, the on-screen joystick walks on touch.
// Walls and props block the way; vehicles and people register themselves as solids.
// Reveals and the cracker spotlight borrow the camera with eased moves and hand it back.

const WALK = 2.9;
const RUN = 5.2;
const TURN = 1.9;
const PITCH_MIN = -0.95;
const PITCH_MAX = 0.8;

const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _e = new THREE.Euler(0, 0, 0, 'YXZ');
const _m = new THREE.Matrix4();
const UP = new THREE.Vector3(0, 1, 0);

interface Tween {
  fromP: THREE.Vector3;
  toP: THREE.Vector3;
  fromQ: THREE.Quaternion;
  toQ: THREE.Quaternion;
  t: number;
  dur: number;
  done: () => void;
  /** returns to walking when finished */
  walk: boolean;
}

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

function blocked(x: number, z: number) {
  if (!isOpen(x, z)) return true;
  for (const s of runtime.solids.values()) if (s(x, z, STREET.radius)) return true;
  return false;
}

/** Quaternion that looks from `from` to `to`. */
function lookQuat(from: THREE.Vector3, to: THREE.Vector3, out: THREE.Quaternion) {
  _m.lookAt(from, to, UP);
  return out.setFromRotationMatrix(_m);
}

export function fovFor(aspect: number) {
  return aspect < 1 ? 72 : aspect < 1.4 ? 66 : 60;
}

export function StreetCamera() {
  const { size, set: setThree, get: getThree, gl } = useThree();
  const camera = useMemo(() => {
    const c = new THREE.PerspectiveCamera(60, 1, 0.08, 460);
    c.rotation.order = 'YXZ';
    Object.assign(c, { manual: true });
    return c;
  }, []);
  useLayoutEffect(() => {
    const old = getThree().camera;
    setThree({ camera });
    return () => setThree({ camera: old });
  }, [camera, setThree, getThree]);
  useLayoutEffect(() => {
    camera.aspect = size.width / Math.max(1, size.height);
    camera.fov = fovFor(camera.aspect);
    camera.updateProjectionMatrix();
  }, [camera, size.width, size.height]);

  const view = useRef<ViewState>({ x: START.x, z: START.z, yaw: START.yaw, pitch: 0 });
  const mode = useRef<'walk' | 'tween' | 'framed'>('walk');
  const tween = useRef<Tween | null>(null);
  const input = useRef(false);
  const keys = useRef(new Set<string>());
  const bob = useRef(0);
  const shake = useRef({ amount: 0, until: 0, dur: 1 });
  /** the pose held while framed, so shake never accumulates */
  const held = useRef({ p: new THREE.Vector3(), q: new THREE.Quaternion() });
  const turnTo = useRef<{ yaw: number; pitch: number; t: number; dur: number; fy: number; fp: number; done: () => void } | null>(null);
  const phase = useGame((s) => s.phase);

  const walkPose = (out: THREE.Vector3, q: THREE.Quaternion) => {
    const v = view.current;
    out.set(v.x, STREET.eye, v.z);
    _e.set(v.pitch, v.yaw, 0, 'YXZ');
    q.setFromEuler(_e);
  };

  const startTween = (toP: THREE.Vector3, toQ: THREE.Quaternion, dur: number, walk: boolean) =>
    new Promise<void>((resolve) => {
      tween.current?.done();
      const rm = useGame.getState().settings.reducedMotion;
      tween.current = { fromP: camera.position.clone(), toP: toP.clone(), fromQ: camera.quaternion.clone(), toQ: toQ.clone(), t: 0, dur: Math.max(0.01, rm ? Math.min(0.35, dur) : dur), done: resolve, walk };
      mode.current = 'tween';
    });

  useEffect(() => {
    const api: CameraApi = {
      save: () => {},
      restore: (duration = 1.0) => {
        walkPose(_v, _q);
        return startTween(_v, _q, duration, true);
      },
      setUserInput: (on) => {
        input.current = on;
        if (!on) keys.current.clear();
      },
      shake: (amount, duration) => {
        if (useGame.getState().settings.reducedMotion) return;
        shake.current = { amount, until: performance.now() + duration * 1000, dur: duration };
      },
      frame: (target, o = {}) => {
        const dist = o.dist ?? 2.7;
        const height = o.height ?? 0.75;
        const v = view.current;
        // look at the cracker from the player's side; if a wall is in the way, swing around it
        const base = Math.atan2(v.x - target[0], v.z - target[2]);
        let pos = _v.set(0, 0, 0);
        for (const off of [0, 0.5, -0.5, 1, -1, 1.6, -1.6, Math.PI]) {
          const a = base + off;
          const x = target[0] + Math.sin(a) * dist;
          const z = target[2] + Math.cos(a) * dist;
          pos = _v.set(x, height, z);
          if (isOpen(x, z, 0.2)) break;
        }
        const look = _v2.set(target[0], target[1] + (o.lookY ?? 0.3), target[2]);
        lookQuat(pos, look, _q);
        return startTween(pos, _q, o.duration ?? 1.0, false);
      },
      aim: (target, duration) => {
        const from = mode.current === 'framed' ? held.current.p : camera.position;
        lookQuat(from, _v2.set(...target), _q);
        void startTween(from.clone(), _q, duration, false);
      },
      face: (target, duration = 0.9) =>
        new Promise<void>((resolve) => {
          const v = view.current;
          const yaw = Math.atan2(-(target[0] - v.x), -(target[2] - v.z));
          let dy = yaw - v.yaw;
          while (dy > Math.PI) dy -= Math.PI * 2;
          while (dy < -Math.PI) dy += Math.PI * 2;
          const dist = Math.hypot(target[0] - v.x, target[2] - v.z);
          const pitch = THREE.MathUtils.clamp(Math.atan2(target[1] - STREET.eye, dist), PITCH_MIN, PITCH_MAX);
          turnTo.current?.done();
          turnTo.current = { yaw: v.yaw + dy, pitch, t: 0, dur: useGame.getState().settings.reducedMotion ? 0.2 : duration, fy: v.yaw, fp: v.pitch, done: resolve };
        }),
      reset: () => {
        const v = view.current;
        const along = Math.abs(Math.sin(v.yaw)) > 0.5 ? (Math.sin(v.yaw) > 0 ? Math.PI / 2 : -Math.PI / 2) : v.yaw;
        void api.face([v.x - Math.sin(along) * 10, STREET.eye, v.z - Math.cos(along) * 10], 0.6);
      },
      teleport: (p) => {
        Object.assign(view.current, p);
        if (mode.current === 'walk') {
          walkPose(camera.position, camera.quaternion);
        }
      },
      forward: () => {
        camera.getWorldDirection(_v);
        return [_v.x, _v.y, _v.z];
      },
    };
    runtime.camera = api;
    walkPose(camera.position, camera.quaternion);
    camera.updateMatrixWorld();
    return () => {
      runtime.camera = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camera]);

  // the intro holds still; entering the mohalla hands over the controls
  useEffect(() => {
    runtime.camera?.setUserInput(phase === 'playing');
  }, [phase]);

  // keyboard
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return;
      const k = e.key.toLowerCase();
      if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'shift'].includes(k)) {
        if (!input.current) return;
        keys.current.add(k);
        if (k.startsWith('arrow')) e.preventDefault();
      }
    };
    const up = (e: KeyboardEvent) => keys.current.delete(e.key.toLowerCase());
    const blur = () => keys.current.clear();
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
    };
  }, []);

  // drag to look
  useEffect(() => {
    const el = gl.domElement;
    let id = -1;
    let lx = 0;
    let ly = 0;
    let moved = 0;
    const down = (e: PointerEvent) => {
      if (id !== -1) return;
      id = e.pointerId;
      lx = e.clientX;
      ly = e.clientY;
      moved = 0;
    };
    const move = (e: PointerEvent) => {
      if (e.pointerId !== id) return;
      const dx = e.clientX - lx;
      const dy = e.clientY - ly;
      lx = e.clientX;
      ly = e.clientY;
      moved += Math.abs(dx) + Math.abs(dy);
      if (!input.current || mode.current !== 'walk' || moved < 4) return;
      const k = e.pointerType === 'touch' ? 0.0062 : 0.0042;
      const v = view.current;
      v.yaw -= dx * k;
      v.pitch = THREE.MathUtils.clamp(v.pitch - dy * k, PITCH_MIN, PITCH_MAX);
      turnTo.current = null;
    };
    const up = (e: PointerEvent) => {
      if (e.pointerId === id) id = -1;
    };
    el.addEventListener('pointerdown', down);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => {
      el.removeEventListener('pointerdown', down);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
  }, [gl]);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const v = view.current;
    const reduced = useGame.getState().settings.reducedMotion;

    // walking
    let speed = 0;
    if (mode.current === 'walk' && input.current) {
      const K = keys.current;
      let fwd = (K.has('w') || K.has('arrowup') ? 1 : 0) - (K.has('s') || K.has('arrowdown') ? 1 : 0);
      let side = (K.has('d') ? 1 : 0) - (K.has('a') ? 1 : 0);
      const turn = (K.has('arrowleft') ? 1 : 0) - (K.has('arrowright') ? 1 : 0);
      fwd += -runtime.joy.y;
      side += runtime.joy.x;
      v.yaw += turn * TURN * dt;
      const len = Math.hypot(fwd, side);
      if (len > 0.05) {
        const s = (K.has('shift') ? RUN : WALK) * Math.min(1, len);
        fwd /= Math.max(1, len);
        side /= Math.max(1, len);
        const sy = Math.sin(v.yaw);
        const cy = Math.cos(v.yaw);
        // forward is -z rotated by yaw; right is +x rotated by yaw
        const dx = (-sy * fwd + cy * side) * s * dt;
        const dz = (-cy * fwd - sy * side) * s * dt;
        if (!blocked(v.x + dx, v.z + dz)) {
          v.x += dx;
          v.z += dz;
        } else if (!blocked(v.x + dx, v.z)) v.x += dx;
        else if (!blocked(v.x, v.z + dz)) v.z += dz;
        speed = s * Math.min(1, len);
        if (turnTo.current) {
          turnTo.current.done();
          turnTo.current = null;
        }
      }
    }
    // "show me" turns
    const tt = turnTo.current;
    if (tt && mode.current === 'walk') {
      tt.t += dt;
      const k = ease(Math.min(1, tt.t / tt.dur));
      v.yaw = tt.fy + (tt.yaw - tt.fy) * k;
      v.pitch = tt.fp + (tt.pitch - tt.fp) * k;
      if (tt.t >= tt.dur) {
        turnTo.current = null;
        tt.done();
      }
    }
    runtime.player.x = v.x;
    runtime.player.z = v.z;
    runtime.player.yaw = v.yaw;
    runtime.player.pitch = v.pitch;

    // place the camera
    const tw = tween.current;
    if (mode.current === 'tween' && tw) {
      tw.t += dt;
      const k = ease(Math.min(1, tw.t / tw.dur));
      if (tw.walk) walkPose(tw.toP, tw.toQ);
      camera.position.lerpVectors(tw.fromP, tw.toP, k);
      camera.quaternion.slerpQuaternions(tw.fromQ, tw.toQ, k);
      if (tw.t >= tw.dur) {
        tween.current = null;
        mode.current = tw.walk ? 'walk' : 'framed';
        held.current.p.copy(tw.toP);
        held.current.q.copy(tw.toQ);
        tw.done();
      }
    } else if (mode.current === 'framed') {
      camera.position.copy(held.current.p);
      camera.quaternion.copy(held.current.q);
    } else if (mode.current === 'walk') {
      bob.current += dt * speed * 2.1;
      walkPose(camera.position, camera.quaternion);
      if (!reduced && speed > 0.1) {
        camera.position.y += Math.sin(bob.current * 2) * 0.028;
        camera.position.x += Math.cos(bob.current) * 0.012 * Math.cos(v.yaw);
      }
    }
    // shake: a short random jolt, strongest at the start
    const sh = shake.current;
    const now = performance.now();
    if (sh.until > now) {
      const k = (sh.until - now) / (sh.dur * 1000);
      const a = sh.amount * k * 0.06;
      camera.position.x += (Math.random() - 0.5) * a;
      camera.position.y += (Math.random() - 0.5) * a;
      _q2.setFromAxisAngle(_v.set(0, 0, 1), (Math.random() - 0.5) * a * 0.6);
      camera.quaternion.multiply(_q2);
    }
    camera.updateMatrixWorld();
  });

  return null;
}

/** Where a point lies relative to the player, for distance-based effects. */
export function distToPlayer(p: Vec3) {
  return Math.hypot(p[0] - runtime.player.x, p[2] - runtime.player.z);
}
