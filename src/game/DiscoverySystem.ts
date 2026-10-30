import { PACKAGE_BY_ID, type PackageId, type Vec3 } from '../assets/AssetRegistry';
import { keepTray, MAX_USES, useGame } from './GameState';
import { runtime } from './Runtime';
import { createMemory } from './MemorySystem';
import { audio } from '../audio/AudioEngine';
import { BOX_SPOTS, burstOnLevel, currentLevel, inSideGali } from '../street/StreetLayout';

// Orchestrates the package lifecycle:
// HIDDEN -> DISCOVERED -> OPENING -> UNLOCKED -> PLAYED -> MEMORY_CAPTURED
// Each transition is explicit and goes through useGame.transition().
//
// In the street: pick a glowing box up, open it, and its cracker goes to the tray with
// MAX_USES lights. Put a cracker down on open road, the camera frames it in a spotlight,
// light it (hand gesture or tap) and it bursts there. Its first burst becomes a Polaroid.

export interface PackageControl {
  present: () => Promise<void>;
  open: () => Promise<void>;
  stow: () => Promise<void>;
  setLidOpen: (open: boolean) => void;
  skip: () => void;
  worldPos: () => [number, number, number];
}

export const packageControls = new Map<PackageId, PackageControl>();

/** How far from a cracker people, vehicles and walls must be, by cracker. */
export const CLEARANCE: Record<string, number> = { bomb: 1.7, rocket: 1.4, chakri: 1.6, sparkler: 1.2, anaar: 1.6, ladi: 2.1, skyshot: 1.6, popPop: 1.9 };

/** Spotlight framing per cracker: distance, camera height and where to look. */
const FRAMING: Record<string, { dist: number; height: number; lookY: number }> = {
  // the camera looks a little below the cracker so it sits above the spotlight card
  bomb: { dist: 2.8, height: 1.05, lookY: -0.35 },
  rocket: { dist: 3.6, height: 1.15, lookY: -0.1 },
  chakri: { dist: 2.7, height: 1.15, lookY: -0.45 },
  sparkler: { dist: 2.5, height: 0.95, lookY: -0.1 },
  anaar: { dist: 3.2, height: 1.1, lookY: 0.1 },
  ladi: { dist: 3.6, height: 1.3, lookY: -0.45 },
  skyshot: { dist: 3.0, height: 1.1, lookY: -0.3 },
  popPop: { dist: 3.2, height: 1.3, lookY: -0.5 },
};

const isOpened = (id: PackageId) => {
  const s = useGame.getState().packages[id];
  return s === 'UNLOCKED' || s === 'PLAYED' || s === 'MEMORY_CAPTURED';
};

const busy = () => {
  const g = useGame.getState();
  return g.phase !== 'playing' || !!g.active || !!runtime.fireworks?.busy() || g.ui.album;
};

/** Can the player pick this box up right now? Opened boxes only refill an empty cracker. */
export function canPickUp(id: PackageId) {
  const g = useGame.getState();
  if (!isOpened(id)) return true;
  return g.uses[id] <= 0;
}

export const PICKUP_RANGE = 3.2;

export function distanceToBox(id: PackageId) {
  const p = BOX_SPOTS[id].pos;
  return Math.hypot(p[0] - runtime.player.x, p[2] - runtime.player.z);
}

export async function beginReveal(id: PackageId) {
  const g = useGame.getState();
  if (busy() || !canPickUp(id)) return;
  const ctl = packageControls.get(id);
  const cam = runtime.camera;
  if (!ctl || !cam) return;
  if (distanceToBox(id) > 9) {
    g.setUi({ toast: 'Thoda paas jaao, phir uthao.' });
    return;
  }
  const before = g.packages[id];
  if (before === 'HIDDEN') g.transition(id, 'DISCOVERED');
  const replay = isOpened(id);
  g.setPlacing(null);
  g.setActive({ id, step: 'focusing', replay, capture: false });
  g.setUi({ tray: keepTray(), showMe: null, newMemory: null });
  audio.tap();
  cam.setUserInput(false);
  await cam.face(ctl.worldPos(), 0.45);
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

/** Put the opened box's cracker in the tray with a full set of lights. */
export async function collectActive() {
  const g = useGame.getState();
  const a = g.active;
  if (!a || a.step !== 'opened') return;
  const ctl = packageControls.get(a.id);
  g.setUses(a.id, MAX_USES);
  g.setStep('lighting');
  audio.unlock();
  await ctl?.stow();
  ctl?.setLidOpen(true);
  useGame.getState().setActive(null);
  useGame.getState().setUi({ toast: null, trayPulse: a.id });
  runtime.camera?.setUserInput(true);
  // found by following the arrows: straight into the hand, ready to put down and light
  if (useGame.getState().ui.guide === a.id) {
    useGame.getState().setUi({ guide: null });
    startPlacing(a.id);
  }
}

/** Close the presented package without taking the cracker (Escape / close). */
export async function closeActive() {
  const g = useGame.getState();
  const a = g.active;
  if (!a) return;
  if (a.step === 'spotlight') return cancelPlaced();
  if (a.step !== 'presented' && a.step !== 'opened') return;
  const ctl = packageControls.get(a.id);
  g.setStep('lighting');
  await ctl?.stow();
  ctl?.setLidOpen(isOpened(a.id));
  useGame.getState().setActive(null);
  runtime.camera?.setUserInput(true);
}

export function skipAnimation() {
  const a = useGame.getState().active;
  if (a) packageControls.get(a.id)?.skip();
}

// ------------------------------------------------------------------------------------------
// The panel: every cracker is on the right from the start. Picking one shows its card;
// collecting the card lays a trail of arrows to its box in the mohalla. Walking up to the
// box opens it, and collecting it puts the cracker in hand with MAX_USES lights.

/** Tap a cracker in the panel: show its card, refill it, or pick it up. */
export function pickFromPanel(id: PackageId) {
  const g = useGame.getState();
  if (busy()) return;
  if (!isOpened(id)) {
    g.setPlacing(null);
    g.setUi({ card: id, tray: keepTray(), showMe: null });
    audio.tap();
    return;
  }
  if (g.placing === id) return cancelPlacing();
  if (g.uses[id] <= 0) {
    g.setUses(id, MAX_USES);
    g.setUi({ trayPulse: id, toast: `Refill · x${MAX_USES}` });
    audio.unlock();
  }
  startPlacing(id);
}

/** Collect the card: show the way to its box. */
export function keepCard() {
  const g = useGame.getState();
  const id = g.ui.card;
  if (!id) return;
  g.setPlacing(null);
  g.setUi({ card: null, guide: id, showMe: null, toast: null });
  audio.unlock();
  audio.tap();
}

export function stopGuide() {
  useGame.getState().setUi({ guide: null });
}

/** Arrived at the guided box: open it straight away. */
export async function arriveAtGuide() {
  const g = useGame.getState();
  const id = g.ui.guide;
  if (!id || busy() || g.placing || distanceToBox(id) > PICKUP_RANGE - 0.6) return;
  await beginReveal(id);
  if (useGame.getState().active?.id === id && useGame.getState().active?.step === 'presented') await openActive();
}

export function closeCard() {
  useGame.getState().setUi({ card: null });
}

// ------------------------------------------------------------------------------------------
// Placing and lighting

/** Pick a cracker up from the tray; the reticle follows the pointer until it is put down. */
export function startPlacing(id: PackageId) {
  const g = useGame.getState();
  if (busy() || g.uses[id] <= 0) return false;
  g.setPlacing(id);
  g.setUi({ tray: keepTray() });
  audio.tap();
  return true;
}

export function cancelPlacing() {
  useGame.getState().setPlacing(null);
}

let hazardId = 0;

export type PlaceCheck = 'ok' | 'ground' | 'person' | 'vehicle' | 'far' | 'near';

/** Is this a good spot for the cracker? Any open ground with room, clear of people and vehicles. */
export function checkSpot(id: PackageId, x: number, z: number): PlaceCheck {
  const type = PACKAGE_BY_ID[id].crackerType;
  const R = CLEARANCE[type];
  const d = Math.hypot(x - runtime.player.x, z - runtime.player.z);
  if (d > 16) return 'far';
  if (d < 1.1) return 'near';
  if (!burstOnLevel(x, z, R)) return 'ground';
  // a ladi lies along the road: both of its ends must be on open ground too
  if (type === 'ladi') {
    const [ax, az] = ladiAxis(x, z);
    if (!burstOnLevel(x + ax * 1.9, z + az * 1.9, 0.6) || !burstOnLevel(x - ax * 1.7, z - az * 1.7, 0.6)) return 'ground';
  }
  const y = currentLevel().floor;
  // people and vehicles nearby: only the cracker's own blast radius needs to be clear
  for (const [kind, s] of runtime.solids) if (s(x, z, Math.min(R, 1.4), y)) return kind;
  return 'ok';
}

/** Along the road at this spot: the gali and chowk run along x, side galis along z. */
export function ladiAxis(x: number, z: number): [number, number] {
  if (currentLevel().walk) return [1, 0];
  return inSideGali(x, z) ? [0, 1] : [1, 0];
}

/** Put the carried cracker down at (x, z) and frame it in the spotlight. */
export async function placeCracker(id: PackageId, x: number, z: number) {
  const g = useGame.getState();
  if (busy() || g.uses[id] <= 0) return false;
  if (checkSpot(id, x, z) !== 'ok') return false;
  const pkg = PACKAGE_BY_ID[id];
  const pos: Vec3 = [x, currentLevel().floor, z];
  g.setPlacing(null);
  g.setActive({ id, step: 'spotlight', replay: false, capture: g.packages[id] !== 'MEMORY_CAPTURED', pos });
  // people and traffic on the road keep clear of a cracker down there (a terrace is out of their way)
  if (pos[1] < 0.5) runtime.hazards.push({ id: ++hazardId, pos, radius: CLEARANCE[pkg.crackerType] });
  runtime.fireworks?.stage(id, pos, ladiAxis(x, z));
  audio.tap();
  const cam = runtime.camera;
  cam?.setUserInput(false);
  runtime.reveal.pos = [x, pos[1] + 1.3, z];
  runtime.reveal.intensity = 0.6;
  await cam?.frame(pos, FRAMING[pkg.crackerType]);
  return true;
}

/** Pick the cracker back up without lighting it. */
export async function cancelPlaced() {
  const g = useGame.getState();
  const a = g.active;
  if (!a || a.step !== 'spotlight') return;
  runtime.fireworks?.unstage();
  runtime.hazards = [];
  runtime.reveal.intensity = 0;
  g.setStep('lighting');
  await runtime.camera?.restore(0.8);
  useGame.getState().setActive(null);
  runtime.camera?.setUserInput(true);
}

/** Light the cracker in the spotlight: it bursts where it stands. */
export async function lightPlaced() {
  const g = useGame.getState();
  const a = g.active;
  if (!a || a.step !== 'spotlight' || !a.pos || !runtime.fireworks || runtime.fireworks.busy()) return;
  const id = a.id;
  const shouldCapture = g.packages[id] !== 'MEMORY_CAPTURED';
  g.setUses(id, g.uses[id] - 1);
  g.setStep('playing');
  runtime.reveal.intensity = 0;
  let photo: string | null = null;
  await runtime.fireworks.play(id, a.pos, (url) => {
    photo = url;
  });
  runtime.hazards = [];
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

/** Accessible alternative to hunting: turn to face a box and light a beacon over it. */
export function showMe(id: PackageId) {
  const g = useGame.getState();
  if (g.active) return;
  const p = BOX_SPOTS[id].pos;
  g.setUi({ showMe: id, tray: keepTray() });
  void runtime.camera?.face([p[0], p[1] + 2, p[2]], 1.0);
  window.setTimeout(() => {
    if (useGame.getState().ui.showMe === id) useGame.getState().setUi({ showMe: null });
  }, 12000);
}
