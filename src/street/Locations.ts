import { useGame } from '../game/GameState';
import { runtime } from '../game/Runtime';
import { audio } from '../audio/AudioEngine';
import { LEVELS, levelState, type LevelId } from './StreetLayout';

// Jumping between the five places. The camera glides there; in a place to burst from, the
// hand camera comes on (after a one-time explainer) and a cracker picked on the way is
// set down and readied straight away.

export async function goToLevel(id: LevelId) {
  const g = useGame.getState();
  if (g.active || runtime.fireworks?.busy()) return;
  const L = LEVELS[id];
  g.setUi({ map: false });
  audio.whoosh(0.8);
  const { arm, canThrowHere } = await import('./throwing');
  arm(null);
  levelState.id = id;
  const cam = runtime.camera;
  if (!cam) return;
  cam.setUserInput(false);
  await cam.travel({ x: L.spawn.x, z: L.spawn.z, yaw: L.spawn.yaw, pitch: L.spawn.pitch, floor: L.floor }, g.settings.reducedMotion ? 0.3 : 1.4);
  cam.setUserInput(true);
  if (id === 'store') return;
  const q = useGame.getState().ui.queued;
  if (q) {
    useGame.getState().setUi({ queued: null });
    if (canThrowHere()) arm(q);
    else {
      // loaded lazily: DiscoverySystem imports this module
      const { readyCracker } = await import('../game/DiscoverySystem');
      void readyCracker(q);
    }
  }
}

/** Where the player is now, for the place switcher. */
export function whereNow(): LevelId {
  return levelState.id;
}
