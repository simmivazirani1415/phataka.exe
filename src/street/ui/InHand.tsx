import { useEffect, useState } from 'react';
import { PACKAGE_BY_ID } from '../../assets/AssetRegistry';
import { useGame } from '../../game/GameState';
import { crackerRender } from './crackerRenders';
import { aimApi } from '../Throwing';
import { canThrowHere, useThrow } from '../throwing';

// The cracker in your hand, at the bottom of the screen. Hold it (or anywhere on the scene),
// aim, let go. A one-time hint says so, then fades for good.

const touchy = () => window.matchMedia('(pointer: coarse)').matches;

export function InHand() {
  const armed = useThrow((s) => s.armed);
  const aiming = useThrow((s) => s.aiming);
  const flying = useThrow((s) => s.flying);
  const target = useThrow((s) => s.target);
  const hintSeen = useThrow((s) => s.hintSeen);
  const active = useGame((s) => s.active);
  const phase = useGame((s) => s.phase);
  const blocked = useGame((s) => s.ui.album || s.ui.map || s.ui.settings);
  const [hint, setHint] = useState(false);

  useEffect(() => {
    if (!armed || hintSeen) return;
    setHint(true);
    const t = window.setTimeout(() => setHint(false), 7000);
    return () => window.clearTimeout(t);
  }, [armed, hintSeen]);

  if (phase !== 'playing' || !armed || blocked || !canThrowHere() || (active && !flying)) return null;
  const pkg = PACKAGE_BY_ID[armed];
  const img = crackerRender(armed);
  const hidden = flying || !!active;
  return (
    <div className={`inhand ${aiming ? 'aiming' : ''} ${hidden ? 'gone' : ''}`}>
      {hint && !aiming && !hidden && <p className="inhand-hint">{touchy() ? 'Hold and drag to aim, let go to throw' : 'Hold, aim with the mouse, let go to throw'}</p>}
      {aiming && target && !target.ok && <p className="inhand-hint bad">Aim for open ground</p>}
      <button className="inhand-item" style={{ ['--pk' as string]: pkg.palette[0] }} aria-label={`${pkg.name} in your hand. Hold and drag to aim, release to throw.`} onPointerDown={(e) => aimApi.start(e)}>
        {img ? <img src={img} alt="" draggable={false} /> : null}
      </button>
    </div>
  );
}
