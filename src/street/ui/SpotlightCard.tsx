import { PACKAGE_BY_ID } from '../../assets/AssetRegistry';
import { useGame } from '../../game/GameState';
import { cancelPlaced, lightPlaced } from '../../game/DiscoverySystem';
import { GESTURE_INFO } from '../../input/gestures';
import { startHands, useHands } from '../../input/HandTracker';
import { GestureDemo } from './GestureDemo';

// While a cracker waits on the ground: a looping demo of its hand gesture, one button that
// turns the camera on so the gesture lights it, and the ring (which fills as the gesture is
// done, and which can simply be tapped to light it instead).

export function SpotlightCard() {
  const active = useGame((s) => s.active);
  const status = useHands((s) => s.status);
  const progress = useHands((s) => s.progress);
  const hands = useHands((s) => s.hands);
  if (!active || active.step !== 'spotlight') return null;
  const pkg = PACKAGE_BY_ID[active.id];
  const info = GESTURE_INFO[active.id];
  const r = 44;
  const c = 2 * Math.PI * r;
  const live = status === 'ready';
  return (
    <div className="spot" role="dialog" aria-label={`${pkg.crackerLabel} is ready. ${info.title}, or tap to light.`}>
      <div className="spot-card">
        <GestureDemo type={pkg.crackerType} />
        <div className="spot-side">
          <button className={`spot-light g-${pkg.crackerType} ${live ? 'live' : ''}`} onClick={() => lightPlaced()} autoFocus aria-label={`Tap to light the ${pkg.crackerLabel}`} title="Tap to light">
            <svg viewBox="0 0 100 100" aria-hidden="true">
              <circle cx="50" cy="50" r={r} className="ring-bg" />
              <circle cx="50" cy="50" r={r} className="ring-fg" strokeDasharray={c} strokeDashoffset={c * (1 - (live ? progress : 0))} />
            </svg>
            <span className="spot-icon" aria-hidden="true">
              <i>{live ? info.icon : '🔥'}</i>
            </span>
          </button>
        </div>
      </div>
      <div className="spot-row">
        <button className="btn icon spot-small" onClick={cancelPlaced} aria-label="Pick it back up" title="Pick it back up">
          ✕
        </button>
        {(status === 'off' || status === 'error' || status === 'denied') && (
          <button className="btn cta spot-cam" onClick={startHands}>
            ✋ Light with your hand
          </button>
        )}
        {status === 'loading' && <span className="spot-status">Camera on ho raha hai…</span>}
        {live && <span className="spot-status">{hands > 0 ? `${info.title}` : 'Haath camera ke saamne dikhao'}</span>}
      </div>
    </div>
  );
}
