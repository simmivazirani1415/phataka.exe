import { create } from 'zustand';
import { PACKAGE_IDS, type PackageId, type Vec3 } from '../assets/AssetRegistry';
import { clearImages, clearMeta, getImages, loadMeta, putImages, saveMeta } from '../utils/Storage';

export type PackageState = 'HIDDEN' | 'DISCOVERED' | 'OPENING' | 'UNLOCKED' | 'PLAYED' | 'MEMORY_CAPTURED';

/** Allowed package state transitions. Anything else is rejected. */
const TRANSITIONS: Record<PackageState, PackageState[]> = {
  HIDDEN: ['DISCOVERED'],
  DISCOVERED: ['OPENING'],
  OPENING: ['UNLOCKED'],
  UNLOCKED: ['PLAYED'],
  PLAYED: ['MEMORY_CAPTURED'],
  MEMORY_CAPTURED: [],
};

export interface Memory {
  id: string;
  packageId: PackageId;
  caption: string;
  createdAt: number;
  polaroid: string; // PNG data URL of the composed Polaroid
  photo: string; // JPEG data URL of the raw capture (resized)
}

export type Graphics = 'high' | 'low';
export type Flash = 'off' | 'low' | 'full';

export interface Settings {
  sound: boolean;
  graphics: Graphics;
  reducedMotion: boolean;
  flash: Flash;
  quickReveal: boolean;
}

/** The reveal flow for the package in focus. */
export type RevealStep = 'focusing' | 'presented' | 'opening' | 'opened' | 'lighting' | 'playing' | 'developing';

export interface Caption {
  id: number;
  text: string;
  pos: Vec3;
  until: number;
}

interface GameStore {
  /** 'intro' covers the ident film and the entry screen; 'playing' is the explorable mohalla. */
  phase: 'intro' | 'playing';
  introPlayed: boolean;
  packages: Record<PackageId, PackageState>;
  memories: Memory[];
  settings: Settings;
  active: { id: PackageId; step: RevealStep; replay: boolean; capture: boolean } | null;
  ui: {
    tray: boolean;
    album: boolean;
    settings: boolean;
    howTo: boolean;
    newMemory: string | null;
    hintUntil: number;
    showMe: PackageId | null;
    perfSuggest: boolean;
    finalSeen: boolean;
    toast: string | null;
  };
  captions: Caption[];
  worldPhoto: string | null;

  stage: () => number;
  setPhase: (p: GameStore['phase']) => void;
  transition: (id: PackageId, to: PackageState) => boolean;
  setActive: (a: GameStore['active']) => void;
  setStep: (step: RevealStep) => void;
  addMemory: (m: Memory) => void;
  updateSettings: (s: Partial<Settings>) => void;
  setUi: (u: Partial<GameStore['ui']>) => void;
  say: (text: string, pos: Vec3, ms?: number) => void;
  setWorldPhoto: (url: string) => void;
  reset: () => void;
}

function prefersReducedMotion() {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

const freshPackages = () => Object.fromEntries(PACKAGE_IDS.map((id) => [id, 'HIDDEN'])) as Record<PackageId, PackageState>;

const defaultSettings = (): Settings => ({
  sound: false, // audio always begins muted
  graphics: 'high',
  reducedMotion: prefersReducedMotion(),
  flash: 'low',
  quickReveal: false,
});

interface SavedMeta {
  v: 1;
  introPlayed: boolean;
  packages: Record<PackageId, PackageState>;
  settings: Omit<Settings, 'sound'>;
  memories: { id: string; packageId: PackageId; caption: string; createdAt: number }[];
  finalSeen: boolean;
}

const saved = loadMeta<SavedMeta>();

function restorePackages(): Record<PackageId, PackageState> {
  const p = freshPackages();
  if (!saved?.packages) return p;
  for (const id of PACKAGE_IDS) {
    const s = saved.packages[id];
    if (!s) continue;
    // an interrupted reveal resumes as unlocked; a played-but-uncaptured cracker stays playable
    p[id] = s === 'DISCOVERED' || s === 'OPENING' ? 'UNLOCKED' : s;
  }
  return p;
}

let captionId = 0;

export const useGame = create<GameStore>((set, get) => ({
  phase: 'intro',
  introPlayed: saved?.introPlayed ?? false,
  packages: restorePackages(),
  memories: [],
  settings: { ...defaultSettings(), ...(saved?.settings ?? {}), sound: false },
  active: null,
  ui: { tray: false, album: false, settings: false, howTo: false, newMemory: null, hintUntil: 0, showMe: null, perfSuggest: false, finalSeen: saved?.finalSeen ?? false, toast: null },
  captions: [],
  worldPhoto: null,

  stage: () => Object.values(get().packages).filter((s) => s === 'MEMORY_CAPTURED').length,
  setPhase: (phase) => set({ phase, introPlayed: get().introPlayed || phase !== 'intro' }),
  transition: (id, to) => {
    const from = get().packages[id];
    if (!TRANSITIONS[from].includes(to)) return false;
    set({ packages: { ...get().packages, [id]: to } });
    return true;
  },
  setActive: (active) => set({ active }),
  setStep: (step) => {
    const a = get().active;
    if (a) set({ active: { ...a, step } });
  },
  addMemory: (m) => {
    set({ memories: [...get().memories, m] });
    putImages(m.id, { polaroid: m.polaroid, photo: m.photo });
  },
  updateSettings: (s) => set({ settings: { ...get().settings, ...s } }),
  setUi: (u) => set({ ui: { ...get().ui, ...u } }),
  say: (text, pos, ms = 2200) => {
    const now = performance.now();
    const id = ++captionId;
    const captions = get().captions.filter((c) => c.until > now).slice(-2);
    set({ captions: [...captions, { id, text, pos, until: now + ms }] });
    window.setTimeout(() => set({ captions: get().captions.filter((c) => c.id !== id) }), ms + 50);
  },
  setWorldPhoto: (url) => set({ worldPhoto: url }),
  reset: () => {
    clearMeta();
    clearImages();
    set({
      packages: freshPackages(),
      memories: [],
      active: null,
      worldPhoto: null,
      ui: { ...get().ui, tray: false, album: false, settings: false, newMemory: null, showMe: null, finalSeen: false, toast: 'Mohalla reset. Naye sire se Diwali!' },
    });
  },
}));

// Persist compact metadata whenever relevant state changes.
useGame.subscribe((s, prev) => {
  if (s.packages === prev.packages && s.memories === prev.memories && s.settings === prev.settings && s.introPlayed === prev.introPlayed && s.ui.finalSeen === prev.ui.finalSeen) return;
  const { sound: _sound, ...settings } = s.settings;
  void _sound;
  saveMeta({
    v: 1,
    introPlayed: s.introPlayed,
    packages: s.packages,
    settings,
    memories: s.memories.map(({ id, packageId, caption, createdAt }) => ({ id, packageId, caption, createdAt })),
    finalSeen: s.ui.finalSeen,
  } satisfies SavedMeta);
});

// Hydrate stored Polaroids. Memories whose images are missing are dropped rather than faked.
export async function hydrateMemories() {
  if (!saved?.memories?.length) return;
  const restored: Memory[] = [];
  for (const m of saved.memories) {
    const img = await getImages(m.id);
    if (img) restored.push({ ...m, ...img });
  }
  const pk = { ...useGame.getState().packages };
  for (const id of PACKAGE_IDS) {
    if (pk[id] === 'MEMORY_CAPTURED' && !restored.some((m) => m.packageId === id)) pk[id] = 'PLAYED';
  }
  useGame.setState({ memories: restored, packages: pk });
}

export const flashScale = (f: Flash) => (f === 'off' ? 0.2 : f === 'low' ? 0.55 : 1);
