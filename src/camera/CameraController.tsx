import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, OrthographicCamera } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import * as THREE from 'three';
import gsap from 'gsap';
import { runtime, type CameraApi, type CameraState } from '../game/Runtime';
import { useGame } from '../game/GameState';
import { baseZoomFor, CAMERA_DISTANCE, getPreset, USER_LIMITS, type PresetName } from './CameraPresets';
import { CAMERA_SETTLE_END } from '../world/BlockBuilder';

const _v = new THREE.Vector3();

function wrapAngle(from: number, to: number) {
  let d = to - from;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return from + d;
}

export function CameraController() {
  const controls = useRef<OrbitControlsImpl>(null!);
  const camRef = useRef<THREE.OrthographicCamera>(null!);
  const { size } = useThree();
  const base = useRef(baseZoomFor(size.width, size.height));
  const factor = useRef(1);
  const saved = useRef<CameraState | null>(null);
  const tween = useRef<gsap.core.Tween | null>(null);
  const userInput = useRef(false);
  const cinematic = useRef(false);
  const shake = useRef({ amount: 0, until: 0, dur: 1 });

  const phase = useGame((s) => s.phase);
  const reducedMotion = useGame((s) => s.settings.reducedMotion);

  const applyLimits = (wide: boolean) => {
    const c = controls.current;
    if (!c) return;
    c.minPolarAngle = wide ? 0.02 : USER_LIMITS.minPolar;
    c.maxPolarAngle = wide ? 1.52 : USER_LIMITS.maxPolar;
    c.minZoom = base.current * (wide ? 0.4 : USER_LIMITS.minZoom);
    c.maxZoom = base.current * (wide ? 12 : USER_LIMITS.maxZoom);
  };

  const set = (s: CameraState) => {
    const c = controls.current;
    const cam = camRef.current;
    if (!c || !cam) return;
    c.target.set(...s.target);
    _v.setFromSphericalCoords(CAMERA_DISTANCE, s.polar, s.azimuth);
    cam.position.copy(c.target).add(_v);
    factor.current = s.zoom;
    cam.zoom = base.current * s.zoom;
    cam.updateProjectionMatrix();
    cam.lookAt(c.target);
    c.update();
  };

  const get = (): CameraState => {
    const c = controls.current;
    const cam = camRef.current;
    return {
      target: [c.target.x, c.target.y, c.target.z],
      azimuth: c.getAzimuthalAngle(),
      polar: c.getPolarAngle(),
      zoom: cam.zoom / base.current,
    };
  };

  useEffect(() => {
    const api: CameraApi = {
      get,
      goTo: (dest, duration = 1.1, cine = false) =>
        new Promise<void>((resolve) => {
          if (!controls.current) return resolve();
          tween.current?.kill();
          const rm = useGame.getState().settings.reducedMotion;
          const from = get();
          const to: CameraState = {
            target: dest.target,
            azimuth: dest.azimuth ?? from.azimuth,
            polar: dest.polar ?? from.polar,
            zoom: dest.zoom ?? from.zoom,
          };
          to.azimuth = wrapAngle(from.azimuth, to.azimuth);
          cinematic.current = cine;
          applyLimits(true);
          controls.current.enabled = false;
          const p = { t: 0 };
          tween.current = gsap.to(p, {
            t: 1,
            duration: rm ? Math.min(0.35, duration) : duration,
            ease: 'power2.inOut',
            onUpdate: () => {
              const k = p.t;
              set({
                target: [
                  from.target[0] + (to.target[0] - from.target[0]) * k,
                  from.target[1] + (to.target[1] - from.target[1]) * k,
                  from.target[2] + (to.target[2] - from.target[2]) * k,
                ],
                azimuth: from.azimuth + (to.azimuth - from.azimuth) * k,
                polar: from.polar + (to.polar - from.polar) * k,
                zoom: from.zoom * Math.pow(to.zoom / from.zoom, k),
              });
            },
            onComplete: () => {
              if (!cine) {
                applyLimits(false);
                if (controls.current) controls.current.enabled = userInput.current;
              }
              resolve();
            },
          });
        }),
      preset: (name: string) => {
        api.goTo(getPreset(name as PresetName), 1.2);
      },
      reset: () => {
        api.goTo(getPreset('overview'), 1.0);
      },
      save: () => {
        saved.current = get();
      },
      restore: async (duration = 1.0) => {
        const s = saved.current ?? getPreset('overview');
        await api.goTo(s, duration, false);
        cinematic.current = false;
        applyLimits(false);
        if (controls.current) controls.current.enabled = userInput.current;
      },
      setUserInput: (enabled: boolean) => {
        userInput.current = enabled;
        if (controls.current && !tween.current?.isActive()) controls.current.enabled = enabled;
        if (enabled && !cinematic.current) applyLimits(false);
      },
      shake: (amount: number, duration: number) => {
        if (useGame.getState().settings.reducedMotion) return;
        shake.current = { amount, until: performance.now() + duration * 1000, dur: duration };
      },
      baseZoom: () => base.current,
      orbit: (delta: number) => {
        const s = get();
        api.goTo({ ...s, azimuth: s.azimuth + delta }, 0.7);
      },
      forward: () => {
        const cam = camRef.current;
        cam.getWorldDirection(_v);
        return [_v.x, _v.y, _v.z];
      },
    };
    runtime.camera = api;
    // initial framing
    set({ ...getPreset('overview'), azimuth: 1.7, polar: 0.82, zoom: 0.9 });
    applyLimits(false);
    controls.current.enabled = false;
    return () => {
      runtime.camera = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // keep framing responsive
  useEffect(() => {
    base.current = baseZoomFor(size.width, size.height);
    const cam = camRef.current;
    if (!cam) return;
    cam.zoom = base.current * factor.current;
    cam.updateProjectionMatrix();
    applyLimits(cinematic.current);
  }, [size.width, size.height]);

  // intro: the ghost silhouette turns slowly; assembly: a gentle cinematic orbit settling into overview
  const introStart = useRef<number | null>(null);
  useEffect(() => {
    if (phase === 'assembling') {
      introStart.current = runtime.assemblyTime;
      runtime.camera?.setUserInput(false);
      if (reducedMotion) runtime.camera?.goTo(getPreset('overview'), 0.3);
    }
    if (phase === 'playing') {
      const over = getPreset('overview');
      runtime.camera?.goTo(over, 1.2).then(() => runtime.camera?.setUserInput(true));
    }
  }, [phase, reducedMotion]);

  useFrame((_, dt) => {
    const c = controls.current;
    const cam = camRef.current;
    if (!c || !cam) return;
    const st = useGame.getState();
    if (st.phase === 'intro' && !st.settings.reducedMotion) {
      const s = get();
      set({ ...s, azimuth: s.azimuth + dt * 0.06 });
    } else if (st.phase === 'assembling' && !st.settings.reducedMotion && !tween.current?.isActive()) {
      const t = Math.min(1, runtime.assemblyTime / CAMERA_SETTLE_END);
      const e = 1 - Math.pow(1 - t, 3);
      const over = getPreset('overview');
      set({
        target: over.target,
        azimuth: 1.7 + (over.azimuth + Math.PI * 2 - 1.7 - Math.PI * 2) * e,
        polar: 0.78 + (over.polar - 0.78) * e,
        zoom: 0.86 + (over.zoom - 0.86) * e,
      });
    }
    // clamp panning to the platform
    c.target.x = THREE.MathUtils.clamp(c.target.x, -27, 27);
    c.target.z = THREE.MathUtils.clamp(c.target.z, -21, 21);
    c.target.y = THREE.MathUtils.clamp(c.target.y, -1, 16);
    // controlled camera shake via the projection view offset (never moves the orbit)
    const now = performance.now();
    const sh = shake.current;
    if (sh.until > now) {
      const k = (sh.until - now) / (sh.dur * 1000);
      const a = sh.amount * k * 10;
      cam.setViewOffset(size.width, size.height, (Math.random() - 0.5) * a, (Math.random() - 0.5) * a, size.width, size.height);
    } else if (cam.view?.enabled) {
      cam.clearViewOffset();
    }
  });

  return (
    <>
      <OrthographicCamera ref={camRef} makeDefault near={1} far={400} position={[40, 50, 60]} zoom={base.current} />
      <OrbitControls
        ref={controls}
        makeDefault
        enableDamping
        dampingFactor={0.08}
        rotateSpeed={0.7}
        zoomSpeed={0.9}
        panSpeed={0.8}
        screenSpacePanning={false}
        zoomToCursor={false}
        mouseButtons={{ LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN }}
        touches={{ ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN }}
      />
    </>
  );
}
