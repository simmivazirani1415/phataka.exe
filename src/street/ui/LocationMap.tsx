import { useEffect, useState } from 'react';
import { useGame } from '../../game/GameState';
import { LEVELS, type LevelId } from '../StreetLayout';
import { goToLevel, whereNow } from '../Locations';

// Choosing where to burst from: a floating button on the left opens a panel down the left
// side with all four places as big blocks: the gali with the chai stall, the chowk, the
// family terrace (chhat) over the mithai shop and the long balcony next door.

const ORDER: LevelId[] = ['street', 'chowk', 'terrace', 'balcony'];
const ICON: Record<LevelId, string> = { street: '🛺', chowk: '🎆', terrace: '🏠', balcony: '🪔' };
const BLURB: Record<LevelId, string> = {
  street: 'Down the gali, scooters and the chai crowd',
  chowk: 'The open square, room for the big ones',
  terrace: 'Up on the roof, the whole mohalla below',
  balcony: 'First floor, right over the chowk',
};

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
    <>
      <button className={`locfab ${open ? 'open' : ''} ${busy ? 'busy' : ''}`} onClick={() => setUi({ map: !open })} aria-expanded={open} aria-label={`Choose location. You are at the ${LEVELS[here].name}.`} disabled={busy}>
        <span className="locfab-icon" aria-hidden="true">
          📍
        </span>
        <span className="locfab-text">
          <b>Choose location</b>
          <small>{LEVELS[here].name}</small>
        </span>
      </button>
      {open && !busy && (
        <aside className="locpanel" role="dialog" aria-label="Choose location">
          <div className="locpanel-head">
            <h2>Kahan se chalaoge?</h2>
            <button className="btn ghost tiny" onClick={() => setUi({ map: false })} aria-label="Close">
              ✕
            </button>
          </div>
          <ul>
            {ORDER.map((id) => (
              <li key={id}>
                <button className={`locblock loc-${id} ${here === id ? 'here' : ''}`} onClick={() => goToLevel(id)} disabled={here === id}>
                  <span className="lb-icon" aria-hidden="true">
                    {ICON[id]}
                  </span>
                  <span className="lb-text">
                    <b>{LEVELS[id].name}</b>
                    <small>{BLURB[id]}</small>
                  </span>
                  {here === id && <em className="lb-here">You are here</em>}
                </button>
              </li>
            ))}
          </ul>
        </aside>
      )}
    </>
  );
}
