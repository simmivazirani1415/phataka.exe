import type { Vec3, PackageId } from '../assets/AssetRegistry';

// Mutable per-frame state shared between the 3D world and gameplay systems.
// Kept outside React so animation never triggers re-renders.

/** The player's view: where they stand and where they look. */
export interface ViewState {
  x: number;
  z: number;
  yaw: number;
  pitch: number;
  /** height of the floor underfoot: 0 on the road, higher on a terrace or balcony */
  floor?: number;
}

export interface CameraApi {
  /** Remember the walking view (before a reveal or a spotlight). */
  save: () => void;
  /** Ease back to the remembered walking view. */
  restore: (duration?: number) => Promise<void>;
  setUserInput: (enabled: boolean) => void;
  shake: (amount: number, duration: number) => void;
  /** Ease into a low spotlight framing of a point on the ground, seen from the player's side. */
  frame: (target: Vec3, opts?: { dist?: number; height?: number; lookY?: number; duration?: number }) => Promise<void>;
  /** While framed, swing the look target (the rocket's climb). */
  aim: (target: Vec3, duration: number) => void;
  /** Turn to face a point (used by "show me"). */
  face: (target: Vec3, duration?: number) => Promise<void>;
  /** Stand up straight and face along the gali. */
  reset: () => void;
  /** Jump to a spot (start of the walk, after a reset). */
  teleport: (v: Partial<ViewState>) => void;
  /** Glide to a new spot (another floor or place) and keep walking from there. */
  travel: (v: Partial<ViewState>, duration?: number) => Promise<void>;
  forward: () => [number, number, number];
}

export interface CaptureApi {
  /** Renders the scene without UI and returns a resized JPEG data URL. */
  shot: (maxSize?: number) => string | null;
  /** Renders an overview photograph of the whole world on the next frame. */
  overview: (maxSize?: number) => Promise<string | null>;
}

export interface FireworkApi {
  /** Shows the cracker standing where it was put down, ready to light. */
  stage: (id: PackageId, origin: Vec3, axis: [number, number]) => void;
  unstage: () => void;
  /** Bursts the cracker where it was put down. */
  play: (id: PackageId, origin: Vec3, onCapture: (url: string | null) => void) => Promise<void>;
  busy: () => boolean;
}

type Listener = (e: WorldEvent) => void;
export interface WorldEvent {
  kind: 'firework' | 'bigBurst' | 'bomb' | 'interaction' | 'stage' | 'launch';
  pos: Vec3;
  strength: number;
  text?: string;
}

/** Something people and traffic keep clear of: a cracker on the ground. */
export interface Hazard {
  id: number;
  pos: Vec3;
  radius: number;
}

/** The largest step the crowd and traffic take in one frame (tests raise maxDt to speed time up). */
export const simStep = () => Math.max(0.05, Math.min(runtime.maxDt, 0.15));

export const runtime = {
  // The mohalla starts fully built (past BlockBuilder's CAMERA_SETTLE_END); the intro ident
  // re-times one building's assembly on top of this clock.
  assemblyTime: 16,
  assemblyRunning: true,
  ghost: 0,
  camera: null as CameraApi | null,
  /** the player's walking view, written by the street camera every frame */
  player: { x: 0, z: 0, yaw: 0, pitch: 0, floor: 0 } as ViewState,
  /** analog walk input from the on-screen joystick (-1..1) */
  joy: { x: 0, y: 0 },
  /** crackers on the ground right now; people and vehicles keep away */
  hazards: [] as Hazard[],
  /** where the carried cracker would go, and whether it may */
  reticle: null as { x: number; z: number; check: 'ok' | 'ground' | 'person' | 'vehicle' | 'far' } | null,
  /** longest step the firework timeline takes per frame (headless tests raise it) */
  maxDt: 0.05,
  /** moving things the player cannot walk through (vehicles, people) register a test here */
  solids: new Map<'person' | 'vehicle', (x: number, z: number, r: number, y?: number) => boolean>(),
  capture: null as CaptureApi | null,
  /** turn the cut-out cast towards a camera other than the player's (overview photos) */
  billboard: null as ((x: number, y: number, z: number) => void) | null,
  /** post-processing composer on High graphics; captures render through it so photos match the screen */
  composer: null as import('postprocessing').EffectComposer | null,
  fireworks: null as FireworkApi | null,
  /** 0..1 warm light washing over the scene during fireworks */
  fireworkLight: { pos: [0, 5, 0] as Vec3, color: [1, 0.8, 0.5] as [number, number, number], intensity: 0 },
  /** soft key light used while a package is presented */
  reveal: { pos: [0, 0, 0] as Vec3, intensity: 0 },
  hoverPackage: null as PackageId | null,
  /** Lighting the intro ident drives: `world` scales the night lights, `key` is a warm film light. */
  intro: { world: 1, key: 0, keyPos: [0, 0, 0] as Vec3, keyColor: [1, 0.78, 0.5] as [number, number, number], assembly: null as number | null },
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
