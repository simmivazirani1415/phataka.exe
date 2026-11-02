import { useEffect, useState } from 'react';
import { PACKAGE_BY_ID } from '../../assets/AssetRegistry';
import { useGame } from '../../game/GameState';
import { aimOptions, chooseAim, type Aim } from '../../game/DiscoverySystem';
import { levelState } from '../StreetLayout';
import { crackerRender } from './crackerRenders';
import { IconClose } from '../../components/Icons';
import { useHands } from '../../input/HandTracker';

// On the Balcony and in the Society, a picked cracker first asks where it should go.

const COPY: Record<Aim, { label: string; sub: string }> = {
  people: { label: 'Burst it on people', sub: 'yeahhh!' },
  vehicles: { label: 'Burst it on vehicles', sub: 'beep beep!' },
  front: { label: 'Just here', sub: 'right in front of me' },
};

export function PlaceChoice() {
  const id = useGame((s) => s.ui.placeChoice);
  const setUi = useGame((s) => s.setUi);
  const [opts, setOpts] = useState<Aim[]>([]);
  const asking = useHands((s) => s.ask);
  useEffect(() => {
    if (!id) return;
    const up = () => setOpts(aimOptions());
    up();
    // vehicles drive in and out of reach
    const t = setInterval(up, 900);
    return () => clearInterval(t);
  }, [id]);
  if (!id || asking) return null;
  const pkg = PACKAGE_BY_ID[id];
  const img = crackerRender(id);
  const where = levelState.id === 'balcony' ? 'Down on the chowk' : 'In the society';
  return (
    <div className="aim-choice" role="dialog" aria-label={`Where should ${pkg.name} go?`}>
      <div className="aim-head">
        {img && <img src={img} alt="" draggable={false} />}
        <div>
          <p className="aim-kicker">{where}</p>
          <h3>Where should it go?</h3>
        </div>
        <button className="icon-btn" onClick={() => setUi({ placeChoice: null })} aria-label="Cancel">
          <IconClose size={16} />
        </button>
      </div>
      <div className="aim-opts">
        {opts.map((a) => (
          <button key={a} className={`aim-opt aim-${a}`} onClick={() => chooseAim(id, a)}>
            <b>{COPY[a].label}</b>
            <span>{COPY[a].sub}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
