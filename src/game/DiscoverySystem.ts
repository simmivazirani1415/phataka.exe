import { PACKAGE_BY_ID, type PackageId, type Vec3 } from '../assets/AssetRegistry';
import { keepTray, MAX_USES, useGame } from './GameState';
import { runtime } from './Runtime';
import { createMemory } from './MemorySystem';
import { audio } from '../audio/AudioEngine';
import { burstOnLevel, currentLevel, inRect, inSideGali, isBurstGround, levelState } from '../street/StreetLayout';
import { goToLevel } from '../street/Locations';
import { crowd } from '../street/Crowd';
import { trafficState } from '../street/Traffic';

// Orchestrates the package lifecycle:
// HIDDEN -> DISCOVERED -> OPENING -> UNLOCKED -> PLAYED -> MEMORY_CAPTURED
// Each transition is explicit and goes through useGame.transition().
//
// In the street: pick a glowing box up, open it, and its cracker goes to the tray with
// MAX_USES lights. Put a cracker down on open road, the camera frames it in a spotlight,
// light it (hand gesture or tap) and it bursts there. Its first burst becomes a Polaroid.


/** How far from a cracker people, vehicles and walls must be, by cracker. */
export const CLEARANCE: Record<string, number> = { bomb: 1.7, rocket: 1.4, chakri: 1.6, sparkler: 1.2, anaar: 1.6, ladi: 2.1, skyshot: 1.6, popPop: 1.9 };

/** Spotlight framing per cracker: distance, camera height and where to look. */
const FRAMING: Record<string, { dist: number; height: number; lookY: number }> = {
  // the camera looks a little below the cracker so it sits above the spotlight card
  bomb: { dist: 2.8, height: 1.05, lookY: -0.35 },
  rocket: { dist: 3.6, height: 1.15, lookY: -0.1 },
  chakri: { dist: 2.7, height: 1.15, lookY: -0.45 },
  // held in the hand: the camera stays at eye height, looking ahead
  sparkler: { dist: 2.5, height: 1.45, lookY: 0.9 },
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

/** Close whatever is in focus (Escape): a cracker waiting to be lit goes back in the stash. */
export async function closeActive() {
  const a = useGame.getState().active;
  if (a?.step === 'spotlight') return cancelPlaced();
}

// ------------------------------------------------------------------------------------------
// The store: every cracker is on the shelf. Tapping one collects it (with MAX_USES lights)
// into the stash on the right. From the stash, tapping a cracker in a place readies it
// straight away; at the store, it opens the place picker and is readied on arrival.

/** Take a cracker off the store shelf (or refill an empty one). */
export function collectFromStore(id: PackageId) {
  const g = useGame.getState();
  if (g.packages[id] === 'HIDDEN') {
    g.transition(id, 'DISCOVERED');
    g.transition(id, 'OPENING');
    g.transition(id, 'UNLOCKED');
  }
  if (!isOpened(id)) return;
  useGame.getState().setUses(id, MAX_USES);
  useGame.getState().setUi({ trayPulse: id, tray: true });
  audio.unlock();
  audio.tap();
}

/** Tap a cracker in the stash. */
export function pickFromPanel(id: PackageId) {
  const g = useGame.getState();
  if (busy()) return;
  if (!isOpened(id)) {
    g.setUi({ toast: 'Pick it up at the Pataka Store first.' });
    void goToLevel('store');
    return;
  }
  if (g.uses[id] <= 0) {
    g.setUses(id, MAX_USES);
    g.setUi({ trayPulse: id, toast: `Refilled · x${MAX_USES}` });
    audio.unlock();
  }
  audio.tap();
  if (!currentLevel().burst) {
    // at the store: pick a place, and it is readied there
    g.setUi({ queued: id, map: true });
    return;
  }
  offerPlacement(id);
}

// ------------------------------------------------------------------------------------------
// Where it goes: on the Balcony and in the Society the player picks a target first

export type Aim = 'people' | 'vehicles' | 'front';
export const AIM_PLACES = ['balcony', 'society'];

/** Ask where it should go (Balcony and Society), or ready it in front of the player elsewhere. */
export function offerPlacement(id: PackageId) {
  // the phuljhadi is held in the hand, so there is nowhere to aim it
  if (AIM_PLACES.includes(levelState.id) && PACKAGE_BY_ID[id].crackerType !== 'sparkler') {
    useGame.getState().setUi({ placeChoice: id });
    return;
  }
  void readyCracker(id);
}

/** In front of the balcony, where the view looks (within about 55 degrees of straight ahead). */
function inView(x: number, z: number, cone = 0.57) {
  const p = runtime.player;
  const L = currentLevel();
  const yaw = L.spawn.yaw;
  const dx = x - p.x;
  const dz = z - p.z;
  const d = Math.hypot(dx, dz) || 1;
  return (-Math.sin(yaw) * dx - Math.cos(yaw) * dz) / d > cone;
}

const reachOf = () => (levelState.id === 'balcony' ? 26 : 13);

/** The middle of the liveliest group of people in reach, nudged a step towards the player. */
function peopleTarget(): [number, number] | null {
  const p = runtime.player;
  const max = reachOf();
  const L = currentLevel();
  const high = L.id === 'balcony';
  const cands = crowd.agents.filter((a) => {
    if (a.hidden || a.owner === 'rider' || a.kind === 'dog' || Math.abs(a.y) > 0.6) return false;
    // from the balcony: people down on the chowk, never the family beside you
    if (high && inRect(L.walk, a.x, a.z, 3)) return false;
    const d = Math.hypot(a.x - p.x, a.z - p.z);
    return d < max && d > (high ? 6 : 3) && (!high || inView(a.x, a.z));
  });
  if (!cands.length) return null;
  let best = cands[0];
  let bs = -1;
  for (const a of cands) {
    let n = 0;
    for (const b of cands) if (Math.hypot(a.x - b.x, a.z - b.z) < 3.5) n++;
    const score = n - Math.hypot(a.x - p.x, a.z - p.z) * 0.02;
    if (score > bs) {
      bs = score;
      best = a;
    }
  }
  const dx = p.x - best.x;
  const dz = p.z - best.z;
  const d = Math.hypot(dx, dz) || 1;
  return [best.x + (dx / d) * 1.6, best.z + (dz / d) * 1.6];
}

/** Beside the nearest vehicle in reach (parked ones first: they chirp their alarm). */
function vehicleTarget(): [number, number] | null {
  const p = runtime.player;
  const max = reachOf() + 4;
  const vs = trafficState.list
    .map((v) => ({ v, d: Math.hypot(v.x - p.x, v.z - p.z) - (v.parked ? 6 : 0) }))
    .filter(({ v }) => Math.hypot(v.x - p.x, v.z - p.z) < max && (levelState.id !== 'balcony' || inView(v.x, v.z, 0.25)))
    .sort((a, b) => a.d - b.d);
  if (!vs.length) return null;
  const v = vs[0].v;
  // on the side of the road towards the player, by the wheels
  const side = Math.sign(p.z - v.z) || 1;
  return [v.x, v.z + side * 2.1];
}

/** Which targets this place has right now, for the choice chips. */
export function aimOptions(): Aim[] {
  const out: Aim[] = [];
  if (peopleTarget()) out.push('people');
  if (vehicleTarget()) out.push('vehicles');
  out.push('front');
  return out;
}

export function chooseAim(id: PackageId, aim: Aim) {
  useGame.getState().setUi({ placeChoice: null });
  void readyCracker(id, aim);
}

/** Set the cracker down in front of the player (or throw it down from above) and frame it. */
export async function readyCracker(id: PackageId, aim: Aim = 'front') {
  const g = useGame.getState();
  if (busy() || g.uses[id] <= 0) return false;
  const pl = runtime.player;
  const fx = -Math.sin(pl.yaw);
  const fz = -Math.cos(pl.yaw);
  const L = currentLevel();
  let spot: [number, number] | null = null;
  const t = aim === 'people' ? peopleTarget() : aim === 'vehicles' ? vehicleTarget() : null;
  if (t) spot = findSpot(id, t[0], t[1], 4);
  if (spot) {
    /* aimed at a crowd or a vehicle */
  } else if (L.id === 'balcony') {
    // over the railing, onto the chowk below
    for (const d of [7, 6, 8.5, 5, 10]) {
      spot = findSpot(id, pl.x + fx * d, pl.z + fz * d, 3);
      if (spot) break;
    }
  } else {
    spot = findSpot(id, pl.x + fx * 3.2, pl.z + fz * 3.2, 6);
    if (!spot && L.burst) spot = findSpot(id, (L.burst.x0 + L.burst.x1) / 2, (L.burst.z0 + L.burst.z1) / 2, 6);
  }
  if (!spot) {
    g.setUi({ toast: 'No room right here. Step back a little.' });
    return false;
  }
  return placeCracker(id, spot[0], spot[1]);
}

export function stopGuide() {
  useGame.getState().setUi({ guide: null });
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

/** Pop-pops are thrown: from a terrace or balcony they land on the street below. */
export function throwsDown(id: PackageId, x?: number, z?: number) {
  const L = currentLevel();
  if (L.floor <= 0.5) return false;
  // the balcony is for throwing: everything goes over the railing onto the chowk
  if (L.id === 'balcony') return true;
  // on the terrace a spot on its own floor stays up here, one past the parapet is a throw
  if (x === undefined || z === undefined) return PACKAGE_BY_ID[id].crackerType === 'popPop';
  return !inRect(L.walk, x, z, 0);
}

/** The floor this cracker goes down on. */
export function placeFloor(id: PackageId, x?: number, z?: number) {
  return throwsDown(id, x, z) ? 0 : currentLevel().floor;
}

/** Is this a good spot for the cracker? Any open ground with room, clear of people and vehicles. */
export function checkSpot(id: PackageId, x: number, z: number): PlaceCheck {
  const type = PACKAGE_BY_ID[id].crackerType;
  const R = CLEARANCE[type];
  const thrown = throwsDown(id, x, z);
  const d = Math.hypot(x - runtime.player.x, z - runtime.player.z);
  if (d > (thrown ? 30 : 16)) return 'far';
  if (d < 1.1 && !thrown) return 'near';
  if (thrown ? !isBurstGround(x, z, 0.8) : !burstOnLevel(x, z, R)) return 'ground';
  // a ladi lies along the road: both of its ends must be on open ground too
  if (type === 'ladi') {
    const [ax, az] = ladiAxis(x, z, thrown);
    const ok = (px: number, pz: number) => (thrown ? isBurstGround(px, pz, 0.4) : burstOnLevel(px, pz, 0.6));
    if (!ok(x + ax * 1.9, z + az * 1.9) || !ok(x - ax * 1.7, z - az * 1.7)) return 'ground';
  }
  // thrown from above it may land right among people, or on a car
  if (thrown) return 'ok';
  const y = placeFloor(id, x, z);
  // people and vehicles nearby: only the cracker's own blast radius needs to be clear.
  // Pop-pops are harmless snappers, so they may land right at people's feet.
  for (const [kind, s] of runtime.solids) {
    if (type === 'popPop' && kind === 'person') continue;
    if (s(x, z, Math.min(R, 1.4), y)) return kind;
  }
  return 'ok';
}

/** The nearest good spot to (x, z), searching outward; null when there is none close by. */
export function findSpot(id: PackageId, x: number, z: number, maxR = 8): [number, number] | null {
  if (checkSpot(id, x, z) === 'ok') return [x, z];
  for (let r = 0.5; r <= maxR; r += 0.5) {
    const n = Math.max(8, Math.round(r * 6));
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const px = x + Math.cos(a) * r;
      const pz = z + Math.sin(a) * r;
      if (checkSpot(id, px, pz) === 'ok') return [px, pz];
    }
  }
  return null;
}

/**
 * Put the carried cracker down as close to (x, z) as it can go. A bad spot never blocks the
 * player: the nearest good one is used, then one near the player, and failing that the player
 * is taken to the chowk and it goes down there.
 */
export async function placeNear(id: PackageId, x: number, z: number) {
  const pl = runtime.player;
  const fx = -Math.sin(pl.yaw);
  const fz = -Math.cos(pl.yaw);
  let spot = findSpot(id, x, z) ?? findSpot(id, pl.x + fx * 3.5, pl.z + fz * 3.5, 10);
  if (!spot) return false;
  return placeCracker(id, spot[0], spot[1]);
}

/** Along the road at this spot: the gali and chowk run along x, side galis along z. */
export function ladiAxis(x: number, z: number, thrown = false): [number, number] {
  if (currentLevel().floor > 0.5 && !thrown) return [1, 0];
  if (levelState.id === 'society' || levelState.id === 'aangan') return [1, 0];
  return inSideGali(x, z) ? [0, 1] : [1, 0];
}

/** Put the carried cracker down at (x, z) and frame it in the spotlight. */
export async function placeCracker(id: PackageId, x: number, z: number) {
  const g = useGame.getState();
  if (busy() || g.uses[id] <= 0) return false;
  if (checkSpot(id, x, z) !== 'ok') return false;
  const pkg = PACKAGE_BY_ID[id];
  const thrown = throwsDown(id, x, z);
  const pos: Vec3 = [x, thrown ? 0 : currentLevel().floor, z];
  g.setPlacing(null);
  g.setActive({ id, step: 'spotlight', replay: false, capture: g.packages[id] !== 'MEMORY_CAPTURED', pos });
  // people and traffic on the road keep clear of a cracker down there (a terrace is out of their way)
  if (pos[1] < 0.5) runtime.hazards.push({ id: ++hazardId, pos, radius: CLEARANCE[pkg.crackerType] });
  runtime.fireworks?.stage(id, pos, ladiAxis(x, z, thrown));
  audio.tap();
  // a cracker dropped on people from above: they yell and scatter, cars below honk
  runtime.thrownAt = thrown ? pos : null;
  if (thrown) {
    audio.whoosh(0.5);
    window.setTimeout(() => runtime.emit({ kind: 'thrown', pos, strength: 0.6 }), 380);
  }
  const cam = runtime.camera;
  cam?.setUserInput(false);
  runtime.reveal.pos = [x, pos[1] + 1.3, z];
  runtime.reveal.intensity = 0.6;
  // thrown from above: the camera follows it down and hangs over it, between the cracker
  // and the balcony, so the people scattering round it are in the picture
  if (thrown && cam) {
    const d = Math.hypot(x - runtime.player.x, z - runtime.player.z);
    await cam.frame(pos, { dist: Math.max(2.4, Math.min(4.2, d * 0.5)), height: 2.3, lookY: -0.25, duration: 0.9, free: true });
  } else await cam?.frame(pos, FRAMING[pkg.crackerType]);
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
  // every burst is photographed; the newest Polaroid takes the cracker's scrapbook page
  const shouldCapture = true;
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
