import { useEffect, useState } from 'react';
import { useGame } from '../../game/GameState';
import { LEVELS, type LevelId } from '../StreetLayout';
import { goToLevel, whereNow } from '../Locations';

// A small map of the mohalla, top left: tap a place to go there and burst from it.
// The gali with the chai stall, the chowk, and above the chowk the family terrace (chhat)
// and the long balcony.

const ORDER: LevelId[] = ['street', 'chowk', 'terrace', 'balcony'];
const ICON: Record<LevelId, string> = { street: '🛺', chowk: '🎆', terrace: '🏠', balcony: '🪔' };

export function LocationMap() {
  const open = useGame((s) => s.ui.map);
  const phase = useGame((s) => s.phase);
  const active = useGame((s) => s.active);
  const album = useGame((s) => s.ui.album);
  const setUi = useGame((s) => s.setUi);
  const [here, setHere] = useState<LevelId>('street');
  useEffect(() => {
    const t = window.setInterval(() => setHere(whereNow()), 500);
    return () => window.clearInterval(t);
  }, []);
  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => e.key === 'Escape' && setUi({ map: false });
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [open, setUi]);
  if (phase !== 'playing' || album) return null;
  const busy = !!active;
  return (
    <div className={`locmap ${open ? 'open' : ''} ${busy ? 'busy' : ''}`}>
      <button className="locmap-toggle" onClick={() => setUi({ map: !open })} aria-expanded={open} aria-label={`Map. You are at the ${LEVELS[here].name}. Tap to go somewhere else.`} disabled={busy}>
        <span aria-hidden="true">📍</span> {LEVELS[here].name}
      </button>
      {open && (
        <div className="locmap-panel" role="dialog" aria-label="Go to">
          <svg viewBox="0 0 220 120" className="locmap-svg" aria-hidden="true">
            {/* the gali */}
            <rect x="4" y="54" width="212" height="14" rx="2" className="m-road" />
            {/* the chowk, the buildings to its north and the terrace / balcony on them */}
            <rect x="118" y="34" width="54" height="54" rx="3" className="m-chowk" />
            <rect x="148" y="14" width="12" height="20" className="m-house" />
            <rect x="160" y="14" width="14" height="20" className="m-house" />
            <rect x="160" y="30" width="12" height="4" className="m-balcony" />
            <rect x="34" y="40" width="16" height="14" className="m-house" />
            {ORDER.map((id) => {
              const p = { street: [42, 61], chowk: [145, 61], terrace: [154, 22], balcony: [166, 30] }[id];
              return (
                <g key={id} className={`m-pin ${here === id ? 'here' : ''}`} transform={`translate(${p[0]} ${p[1]})`}>
                  <circle r={here === id ? 6 : 4.5} />
                </g>
              );
            })}
          </svg>
          <ul className="locmap-list">
            {ORDER.map((id) => (
              <li key={id}>
                <button className={`locmap-item ${here === id ? 'here' : ''}`} onClick={() => goToLevel(id)} disabled={here === id}>
                  <span className="li-icon" aria-hidden="true">
                    {ICON[id]}
                  </span>
                  <span className="li-text">
                    <b>{LEVELS[id].name}</b>
                    <small>{here === id ? 'You are here' : LEVELS[id].hint}</small>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
