import { PACKAGE_BY_ID, type PackageId } from '../assets/AssetRegistry';
import { useGame } from './GameState';
import { runtime } from './Runtime';
import { createMemory } from './MemorySystem';
import { audio } from '../audio/AudioEngine';

// Orchestrates the package lifecycle:
// HIDDEN -> DISCOVERED -> OPENING -> UNLOCKED -> PLAYED -> MEMORY_CAPTURED
// Each transition is explicit and goes through useGame.transition().

export interface PackageControl {
  present: () => Promise<void>;
  open: () => Promise<void>;
  stow: () => Promise<void>;
  setLidOpen: (open: boolean) => void;
  skip: () => void;
  worldPos: () => [number, number, number];
}

export const packageControls = new Map<PackageId, PackageControl>();

const isOpened = (id: PackageId) => {
  const s = useGame.getState().packages[id];
  return s === 'UNLOCKED' || s === 'PLAYED' || s === 'MEMORY_CAPTURED';
};

export async function beginReveal(id: PackageId) {
  const g = useGame.getState();
  if (g.phase !== 'playing' || g.active || runtime.fireworks?.busy() || g.ui.album) return;
  const ctl = packageControls.get(id);
  const cam = runtime.camera;
  if (!ctl || !cam) return;
  const pkg = PACKAGE_BY_ID[id];
  const before = g.packages[id];
  if (before === 'HIDDEN') g.transition(id, 'DISCOVERED');
  const replay = isOpened(id);
  g.setActive({ id, step: 'focusing', replay, capture: before !== 'MEMORY_CAPTURED' });
  g.setUi({ tray: false, showMe: null, newMemory: null });
  audio.tap();
  cam.save();
  cam.setUserInput(false);
  const pos = ctl.worldPos();
  await cam.goTo({ target: [pos[0], pos[1] + 0.5 * pkg.scale, pos[2]], zoom: pkg.interaction.focusZoom }, 0.8, true);
  if (replay) ctl.setLidOpen(true);
  await ctl.present();
  if (useGame.getState().active?.id !== id) return;
  useGame.getState().setStep(replay ? 'opened' : 'presented');
  if (!replay && useGame.getState().settings.quickReveal) await openActive();
}

export async function openActive() {
  const g = useGame.getState();
  const a = g.active;
  if (!a || a.step !== 'presented') return;
  const ctl = packageControls.get(a.id);
  if (!ctl) return;
  g.transition(a.id, 'OPENING');
  g.setStep('opening');
  await ctl.open();
  useGame.getState().transition(a.id, 'UNLOCKED');
  useGame.getState().setStep('opened');
}

/** Light the cracker in focus. `captureNew` takes another photo on a replay. */
export async function lightActive(captureNew = false) {
  const g = useGame.getState();
  const a = g.active;
  if (!a || a.step !== 'opened' || !runtime.fireworks) return;
  const ctl = packageControls.get(a.id);
  if (!ctl) return;
  const id = a.id;
  const shouldCapture = g.packages[id] !== 'MEMORY_CAPTURED' || captureNew;
  g.setStep('lighting');
  await ctl.stow();
  useGame.getState().setStep('playing');
  let photo: string | null = null;
  await runtime.fireworks.play(id, (url) => {
    photo = url;
  });
  if (useGame.getState().packages[id] === 'UNLOCKED') useGame.getState().transition(id, 'PLAYED');
  if (shouldCapture && photo) {
    useGame.getState().setStep('developing');
    audio.shutter();
    const memory = await createMemory(id, photo);
    const st = useGame.getState();
    st.addMemory(memory);
    if (st.packages[id] === 'PLAYED') {
      st.transition(id, 'MEMORY_CAPTURED');
      runtime.emit({ kind: 'stage', pos: [0, 0, 0], strength: useGame.getState().stage() });
    }
    useGame.getState().setUi({ newMemory: memory.id });
  }
  await runtime.camera?.restore(1.0);
  useGame.getState().setActive(null);
  runtime.camera?.setUserInput(true);
}

/** Close the presented package without lighting it (Escape / tap outside). */
export async function closeActive() {
  const g = useGame.getState();
  const a = g.active;
  if (!a || (a.step !== 'presented' && a.step !== 'opened')) return;
  const ctl = packageControls.get(a.id);
  g.setStep('lighting');
  await ctl?.stow();
  ctl?.setLidOpen(isOpened(a.id));
  await runtime.camera?.restore(0.8);
  useGame.getState().setActive(null);
  runtime.camera?.setUserInput(true);
}

export function skipAnimation() {
  const a = useGame.getState().active;
  if (a) packageControls.get(a.id)?.skip();
}

/** Accessible alternative to hunting: fly to a package and highlight it. */
export function showMe(id: PackageId) {
  const ctl = packageControls.get(id);
  const g = useGame.getState();
  if (!ctl || g.active) return;
  const p = ctl.worldPos();
  g.setUi({ showMe: id, tray: false });
  runtime.camera?.goTo({ target: [p[0], p[1] + 0.5, p[2]], zoom: 2.4 }, 1.1);
  window.setTimeout(() => {
    if (useGame.getState().ui.showMe === id) useGame.getState().setUi({ showMe: null });
  }, 9000);
}
