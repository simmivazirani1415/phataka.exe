import type { Vec3, PackageId } from '../assets/AssetRegistry';

// Mutable per-frame state shared between the 3D world and gameplay systems.
// Kept outside React so animation never triggers re-renders.

export interface CameraState {
  target: Vec3;
  azimuth: number;
  polar: number;
  zoom: number; // multiple of base zoom
}

export interface CameraApi {
  get: () => CameraState;
  goTo: (s: Partial<CameraState> & { target: Vec3 }, duration?: number, cinematic?: boolean) => Promise<void>;
  preset: (name: string) => void;
  reset: () => void;
  save: () => void;
  restore: (duration?: number) => Promise<void>;
  setUserInput: (enabled: boolean) => void;
  shake: (amount: number, duration: number) => void;
  baseZoom: () => number;
  forward: () => [number, number, number];
  /** Turns the view around the current target by `delta` radians. */
  orbit: (delta: number) => void;
}

export interface CaptureApi {
  /** Renders the scene without UI and returns a resized JPEG data URL. */
  shot: (maxSize?: number) => string | null;
  /** Renders an overview photograph of the whole world on the next frame. */
  overview: (maxSize?: number) => Promise<string | null>;
}

export interface FireworkApi {
  play: (id: PackageId, onCapture: (url: string | null) => void) => Promise<void>;
  busy: () => boolean;
}

type Listener = (e: WorldEvent) => void;
export interface WorldEvent {
  kind: 'firework' | 'bigBurst' | 'bomb' | 'interaction' | 'stage';
  pos: Vec3;
  strength: number;
  text?: string;
}

export const runtime = {
  assemblyTime: 0,
  assemblyRunning: false,
  ghost: 1,
  camera: null as CameraApi | null,
  capture: null as CaptureApi | null,
  /** post-processing composer on High graphics; captures render through it so photos match the screen */
  composer: null as import('postprocessing').EffectComposer | null,
  fireworks: null as FireworkApi | null,
  /** 0..1 warm light washing over the scene during fireworks */
  fireworkLight: { pos: [0, 5, 0] as Vec3, color: [1, 0.8, 0.5] as [number, number, number], intensity: 0 },
  /** soft key light used while a package is presented */
  reveal: { pos: [0, 0, 0] as Vec3, intensity: 0 },
  hoverPackage: null as PackageId | null,
  stringChase: new Map<number, number>(),
  diyaBoost: new Map<number, number>(),
  listeners: new Set<Listener>(),
  emit(e: WorldEvent) {
    this.listeners.forEach((l) => l(e));
  },
  on(l: Listener) {
    this.listeners.add(l);
    return () => {
      this.listeners.delete(l);
    };
  },
};
