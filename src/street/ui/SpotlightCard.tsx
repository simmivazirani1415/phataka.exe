import { PACKAGE_BY_ID } from '../../assets/AssetRegistry';
import { useGame } from '../../game/GameState';
import { cancelPlaced, lightPlaced } from '../../game/DiscoverySystem';
import { GESTURE_INFO } from '../../input/gestures';
import { startHands, useHands } from '../../input/HandTracker';
import { IconClose, IconHand, IconSpark } from '../../components/Icons';
import { GestureDemo } from './GestureDemo';
import { crackerRender } from './crackerRenders';

// While a cracker waits on the ground: a small focus panel at the side (a compact overlay at
// the bottom on phones) so the cracker and its burst stay in view. "Light it yourself" turns the
// camera on, shows the gesture as a loop and fills a ring as you do it; "Let it burst" lights it.

export function SpotlightCard() {
  const active = useGame((s) => s.active);
  const status = useHands((s) => s.status);
  const progress = useHands((s) => s.progress);
  const hands = useHands((s) => s.hands);
  if (!active || active.step !== 'spotlight') return null;
  const pkg = PACKAGE_BY_ID[active.id];
  const info = GESTURE_INFO[active.id];
  const live = status === 'ready';
  const img = crackerRender(active.id);
  return (
    <section className="panel focus spot-panel" role="dialog" aria-label={`${pkg.crackerLabel} is ready to light`} style={{ ['--pk' as string]: pkg.palette[0] }}>
      <button className="icon-btn focus-close" onClick={cancelPlaced} aria-label="Pick it back up">
        <IconClose size={18} />
      </button>
      {live || status === 'loading' ? (
        <div className="spot-hand">
          <GestureDemo type={pkg.crackerType} />
          <div className="spot-meter" aria-hidden="true">
            <i style={{ width: `${Math.round((live ? progress : 0) * 100)}%` }} />
          </div>
          <p className="spot-status">{status === 'loading' ? 'Starting the camera…' : hands > 0 ? info.title : 'Show your hand to the camera'}</p>
        </div>
      ) : (
        <div className="focus-art small">{img && <img src={img} alt="" draggable={false} />}</div>
      )}
      <p className="focus-kicker">{pkg.crackerLabel}</p>
      <h2 className="focus-name">{pkg.name}</h2>
      <p className="focus-line">{pkg.personality}</p>
      {status === 'off' && (
        <button className="btn-primary" autoFocus onClick={startHands}>
          <IconHand size={18} /> Light it yourself
        </button>
      )}
      {(status === 'error' || status === 'denied') && <p className="spot-note">Camera not available, so let it burst.</p>}
      <button className={status === 'error' || status === 'denied' ? 'btn-primary' : 'btn-line'} autoFocus={status !== 'off'} onClick={() => lightPlaced()}>
        <IconSpark size={16} /> Let it burst
      </button>
    </section>
  );
}
