import { useEffect, useState } from 'react';
import { PACKAGES } from '../../assets/AssetRegistry';
import { MAX_USES, useGame } from '../../game/GameState';
import { pickFromPanel } from '../../game/DiscoverySystem';
import { goToLevel } from '../Locations';
import { IconClose, IconCracker } from '../../components/Icons';
import { crackerRender, renderCrackers } from './crackerRenders';
import { useNarrow } from '../../utils/useNarrow';

// The stash: a column on the right (a slim strip on phones) of the crackers collected at the
// store, big pictures with the lights left on a gold tag. Tapping one readies it where the
// player is; at the store, it asks where to go first.

const owns = (s: string) => s === 'UNLOCKED' || s === 'PLAYED' || s === 'MEMORY_CAPTURED';

export function InventoryTray() {
  const packages = useGame((s) => s.packages);
  const uses = useGame((s) => s.uses);
  const active = useGame((s) => s.active);
  const phase = useGame((s) => s.phase);
  const album = useGame((s) => s.ui.album);
  const open = useGame((s) => s.ui.tray);
  const pulse = useGame((s) => s.ui.trayPulse);
  const setUi = useGame((s) => s.setUi);
  const [, setReady] = useState(0);
  const narrow = useNarrow();

  useEffect(() => {
    renderCrackers().then(() => setReady((n) => n + 1));
  }, []);
  useEffect(() => {
    if (!pulse) return;
    const t = window.setTimeout(() => setUi({ trayPulse: null }), 1800);
    return () => window.clearTimeout(t);
  }, [pulse, setUi]);

  // on phones the stash is a dock along the bottom that is always there
  if (phase !== 'playing' || album || (!open && !narrow) || active) return null;
  const mine = PACKAGES.filter((p) => owns(packages[p.id]));

  return (
    <aside className="panel inv" aria-label="Your stash">
      <header className="panel-head">
        <h2>Stash</h2>
        <span className="inv-total">
          <IconCracker size={15} /> {mine.length}
        </span>
        <button className="icon-btn" onClick={() => setUi({ tray: false })} aria-label="Close the stash">
          <IconClose size={18} />
        </button>
      </header>
      <ul className="inv-grid">
        {mine.map((p) => {
          const n = uses[p.id];
          const img = crackerRender(p.id);
          return (
            <li key={p.id}>
              <button
                className={`inv-item ${n <= 0 ? 'empty' : ''} ${pulse === p.id ? 'pulse' : ''}`}
                style={{ ['--pk' as string]: p.palette[0] }}
                aria-label={`${p.name}, ${p.crackerLabel}: ${n} of ${MAX_USES} left. Tap to light it.`}
                title={p.name}
                onClick={() => pickFromPanel(p.id)}
              >
                <span className="inv-art">{img ? <img src={img} alt="" draggable={false} /> : <IconCracker size={26} />}</span>
                <span className="inv-name">{p.crackerLabel}</span>
                <b className="inv-count">x{n}</b>
              </button>
            </li>
          );
        })}
        {mine.length === 0 && (
          <li className="inv-empty">
            <button onClick={() => void goToLevel('store')} aria-label="Go to the Pataka Store to pick crackers">
              <IconCracker size={22} />
              <small>Store</small>
            </button>
          </li>
        )}
      </ul>
    </aside>
  );
}
