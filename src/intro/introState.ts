import { create } from 'zustand';

// The entrance: the intro film, the doors opening onto the real mohalla, the welcome over it,
// and the walk in. One explicit stage at a time; IntroOverlay moves between them on video
// events and GSAP timelines, never on loose timers.

export type IntroStage = 'VIDEO_PLAYING' | 'TRANSITIONING_TO_WORLD' | 'WELCOME_VISIBLE' | 'ENTERING_WORLD' | 'GAMEPLAY_ACTIVE';

interface IntroStore {
  stage: IntroStage;
  /** bumps on every replay so the overlay starts over */
  nonce: number;
  setStage: (s: IntroStage) => void;
  replay: () => void;
}

export const useIntro = create<IntroStore>((set, get) => ({
  stage: 'VIDEO_PLAYING',
  nonce: 0,
  setStage: (stage) => set({ stage }),
  replay: () => set({ stage: 'VIDEO_PLAYING', nonce: get().nonce + 1 }),
}));
