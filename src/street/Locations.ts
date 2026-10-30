import { keepMap, useGame } from '../game/GameState';
import { runtime } from '../game/Runtime';
import { audio } from '../audio/AudioEngine';
import { groundLevelAt, LEVELS, levelState, type LevelId } from './StreetLayout';

// Jumping between the places you can burst from: the gali, the chowk, the family terrace
// and the balcony. The camera glides there and you keep walking (and placing) on that floor.

export async function goToLevel(id: LevelId) {
  const g = useGame.getState();
  if (g.active || runtime.fireworks?.busy()) return;
  const L = LEVELS[id];
  g.setUi({ map: keepMap() });
  audio.whoosh(0.8);
  levelState.id = id;
  const cam = runtime.camera;
  if (!cam) return;
  cam.setUserInput(false);
  await cam.travel({ x: L.spawn.x, z: L.spawn.z, yaw: L.spawn.yaw, pitch: L.spawn.pitch, floor: L.floor }, g.settings.reducedMotion ? 0.3 : 1.4);
  cam.setUserInput(true);
}

/** Where the player is now, for the map. */
export function whereNow(): LevelId {
  const L = LEVELS[levelState.id];
  if (L.walk) return L.id;
  return groundLevelAt(runtime.player.x, runtime.player.z);
}
