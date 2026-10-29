import { create } from 'zustand';

// Shared state for the intro ident. One GSAP master timeline (built in IdentTimeline) writes
// these proxies; the 3D film (IdentScene) and the DOM overlay (IdentOverlay) only read them,
// so every frame of the film is a pure function of the timeline's time.

/** Sequence markers on the master timeline, in seconds. */
export const MARK = {
  BUILDING_REVEAL: 0,
  WINDOW_STORIES: 0.22,
  PATAKA_TRANSITION: 1.0,
  ROCKET_ASCENT: 2.0,
  BRAND_REVEAL: 3.0,
  WORLD_ENTRY: 4.0,
} as const;

/** The doors are shut at this moment, so the film camera hands over to the game camera. */
export const HANDOFF = 4.5;
/** End of the film: the entry composition holds from here. */
export const HOLD = 5.0;

/** 'film' plays the ident, 'hold' is the entry screen, 'exit' is the door opening into play. */
export type IdentStage = 'film' | 'hold' | 'exit' | 'off';

const SEEN_KEY = 'tilli.identSeen';

function seenThisVisit() {
  try {
    return sessionStorage.getItem(SEEN_KEY) === '1';
  } catch {
    return false;
  }
}

export function markSeen() {
  try {
    sessionStorage.setItem(SEEN_KEY, '1');
  } catch {
    /* private mode: the film may play again on reload */
  }
}

/** The film plays once per visit (reloading the tab goes straight to the entry screen); ?intro forces it. */
export function shouldPlayFilm() {
  const force = new URLSearchParams(location.search).has('intro');
  return force || !seenThisVisit();
}

interface IdentStore {
  stage: IdentStage;
  /** bumps on every replay so the overlay rebuilds its timeline */
  nonce: number;
  /** true while the film should start from 0 (false = jump to the entry composition) */
  play: boolean;
  setStage: (s: IdentStage) => void;
  replay: () => void;
}

export const useIdent = create<IdentStore>((set, get) => ({
  stage: 'hold',
  nonce: 0,
  play: shouldPlayFilm(),
  setStage: (stage) => set({ stage }),
  replay: () => set({ stage: 'film', play: true, nonce: get().nonce + 1 }),
}));
useIdent.setState({ stage: useIdent.getState().play ? 'film' : 'hold' });

export const ident = {
  master: null as gsap.core.Timeline | null,
  /** the 3D film has compiled and rendered a few frames */
  ready: false,
  /** assembly clock value at the start of the film */
  base: 0,
  /** progress (0..1) of each camera move; IdentCamera turns these into position and target */
  shot: { s1: 0, p1: 0, s2: 0, s3: 0, s4: 0, s5: 0 },
  /** night-light level of the whole mohalla, 0..1 */
  world: 1,
  /** warm film light */
  key: { i: 0, x: 0, y: 0, z: 0 },
  /** lamp level inside the three story windows (A, B, C) */
  lamp: { a: 0, b: 0, c: 0 },
  /** rocket flight progress (0..1) */
  rocket: { u: 0 },
  /** opacity of all intro-only effects (fades out as the camera dives through the frame) */
  fx: 1,
};

/** Current film time: the master timeline's time, or the held end state. */
export function filmTime() {
  return ident.master ? ident.master.time() : HOLD;
}
