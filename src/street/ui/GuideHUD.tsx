import { useEffect, useState } from 'react';
import { PACKAGE_BY_ID } from '../../assets/AssetRegistry';
import { useGame } from '../../game/GameState';
import { runtime } from '../../game/Runtime';
import { arriveAtGuide, stopGuide } from '../../game/DiscoverySystem';
import { crackerRender } from './crackerRenders';
import { guidePath, pathLength, pointAlong } from '../Guide';
import { goToLevel } from '../Locations';

// While the player follows the arrows to a box: a pill at the top with an arrow that turns
// to point the way and the distance left. Walking up to the box opens it.

export function GuideHUD() {
  const id = useGame((s) => s.ui.guide);
  const active = useGame((s) => s.active);
  const phase = useGame((s) => s.phase);
  const [info, setInfo] = useState<{ d: number; turn: number; up: boolean }>({ d: 0, turn: 0, up: false });

  useEffect(() => {
    if (!id) return;
    const tick = () => {
      const p = runtime.player;
      const up = (p.floor ?? 0) > 0.5;
      const pts = guidePath(id);
      const d = pathLength(pts);
      // where the path goes a few steps ahead, relative to where the camera looks
      const [tx, tz] = pointAlong(pts, Math.min(d, 3));
      const f = runtime.camera?.forward() ?? [0, 0, -1];
      const fl = Math.hypot(f[0], f[2]) || 1;
      const fx = f[0] / fl;
      const fz = f[2] / fl;
      const dx = tx - p.x;
      const dz = tz - p.z;
      const turn = Math.atan2(dx * -fz + dz * fx, dx * fx + dz * fz);
      setInfo({ d, turn, up });
      if (!up) arriveAtGuide();
    };
    tick();
    const t = window.setInterval(tick, 150);
    return () => window.clearInterval(t);
  }, [id]);

  if (!id || active || phase !== 'playing') return null;
  const pkg = PACKAGE_BY_ID[id];
  const img = crackerRender(id);
  return (
    <div className="guide" role="status" style={{ ['--pk' as string]: pkg.palette[0] }}>
      {img && <img className="guide-img" src={img} alt="" />}
      {info.up ? (
        <>
          <span className="guide-text">
            <b>{pkg.crackerLabel}</b> neeche gali mein hai
          </span>
          <button className="btn cta tiny" onClick={() => goToLevel('chowk')}>
            Neeche chalo
          </button>
        </>
      ) : (
        <>
          <span className="guide-arrow" aria-hidden="true" style={{ transform: `rotate(${info.turn - Math.PI / 2}rad)` }}>
            ➤
          </span>
          <span className="guide-text">
            <b>{info.d < 3 ? 'Yahin hai!' : `${Math.round(info.d)} m`}</b>
            <span className="guide-name"> · {pkg.crackerLabel}</span>
          </span>
        </>
      )}
      <button className="btn ghost tiny" onClick={stopGuide} aria-label="Stop showing the way">
        ✕
      </button>
    </div>
  );
}
