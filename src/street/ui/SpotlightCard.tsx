import { PACKAGE_BY_ID } from '../../assets/AssetRegistry';
import { useGame } from '../../game/GameState';
import { cancelPlaced, lightPlaced } from '../../game/DiscoverySystem';
import { GESTURE_INFO } from '../../input/gestures';
import { startHands, useHands } from '../../input/HandTracker';

// The only thing on screen while a cracker waits on the ground: its hand-gesture icon,
// acting out the gesture, inside a ring that fills as the gesture is done. Tap to light.

export function SpotlightCard() {
  const active = useGame((s) => s.active);
  const status = useHands((s) => s.status);
  const progress = useHands((s) => s.progress);
  if (!active || active.step !== 'spotlight') return null;
  const pkg = PACKAGE_BY_ID[active.id];
  const info = GESTURE_INFO[active.id];
  const r = 44;
  const c = 2 * Math.PI * r;
  const live = status === 'ready';
  return (
    <div className="spot" role="dialog" aria-label={`${pkg.crackerLabel} is ready. ${info.title}, or tap to light.`}>
      <button className={`spot-light g-${pkg.crackerType} ${live ? 'live' : ''}`} onClick={() => lightPlaced()} autoFocus aria-label={`Light the ${pkg.crackerLabel}`}>
        <svg viewBox="0 0 100 100" aria-hidden="true">
          <circle cx="50" cy="50" r={r} className="ring-bg" />
          <circle cx="50" cy="50" r={r} className="ring-fg" strokeDasharray={c} strokeDashoffset={c * (1 - (live ? progress : 0))} />
        </svg>
        <span className="spot-icon" aria-hidden="true">
          <i>{info.icon}</i>
        </span>
      </button>
      <div className="spot-row">
        <button className="btn icon spot-small" onClick={cancelPlaced} aria-label="Pick it back up" title="Pick it back up">
          ✕
        </button>
        {status === 'off' && (
          <button className="btn icon spot-small" onClick={startHands} aria-label="Light it with your hand (camera)" title="Use hand gestures">
            📷
          </button>
        )}
        {status === 'loading' && <span className="spot-small dots" aria-label="Starting the camera">···</span>}
      </div>
    </div>
  );
}
