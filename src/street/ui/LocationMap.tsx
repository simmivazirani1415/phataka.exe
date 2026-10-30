import { useEffect, useState } from 'react';
import { useGame, wide } from '../../game/GameState';
import { LEVELS, type LevelId } from '../StreetLayout';
import { goToLevel, whereNow } from '../Locations';
import { IconChevron, IconClose } from '../../components/Icons';

// "Kahan se chalaoge?": four simple rows under the place button at the top left (a bottom
// sheet on phones). Picking one glides the camera there.

const ORDER: LevelId[] = ['street', 'chowk', 'terrace', 'balcony'];
const BLURB: Partial<Record<LevelId, string>> = {
  street: 'By the chai stall',
  chowk: 'Room for the big ones',
  terrace: 'The whole mohalla below',
  balcony: 'Right over the chowk',
};

/** Small flat illustrations, one per place. */
function PlaceIcon({ id }: { id: LevelId }) {
  switch (id) {
    case 'street':
      // an auto-rickshaw
      return (
        <svg viewBox="0 0 40 40" aria-hidden="true">
          <path d="M8 26V17c0-3 2-5 5-5h11c3 0 5 2 6 4l3 5v5z" fill="#F3B83E" />
          <path d="M8 22h25v4H8z" fill="#168C83" />
          <path d="M20 14h4.5c1.4 0 2.4.8 3 2l1.6 3.6H20z" fill="#FFF1D7" />
          <circle cx="13" cy="27" r="3" fill="#272321" />
          <circle cx="29" cy="27" r="3" fill="#272321" />
        </svg>
      );
    case 'chowk':
      // a burst over the square
      return (
        <svg viewBox="0 0 40 40" aria-hidden="true">
          <g stroke="#DC5947" strokeWidth="2.2" strokeLinecap="round">
            <path d="M20 6v6M20 28v6M6 20h6M28 20h6M10 10l4 4M26 26l4 4M10 30l4-4M26 14l4-4" />
          </g>
          <circle cx="20" cy="20" r="4" fill="#F3B83E" />
        </svg>
      );
    case 'terrace':
      // a house with a flat roof
      return (
        <svg viewBox="0 0 40 40" aria-hidden="true">
          <path d="M8 16h24v17H8z" fill="#DC5947" />
          <path d="M6 13h28v4H6z" fill="#642F63" />
          <path d="M17 24h6v9h-6z" fill="#FFF1D7" />
          <path d="M11 20h4v4h-4zM25 20h4v4h-4z" fill="#F3B83E" />
        </svg>
      );
    default:
      // a diya
      return (
        <svg viewBox="0 0 40 40" aria-hidden="true">
          <path d="M20 9c3 4 3.5 7 0 10-3.5-3-3-6 0-10z" fill="#F3B83E" />
          <path d="M7 22h26c-1.5 6-6.5 9-13 9S8.5 28 7 22z" fill="#DC5947" />
          <path d="M7 22h26" stroke="#642F63" strokeWidth="2" />
        </svg>
      );
  }
}

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
  const card = useGame((s) => s.ui.card);
  if (phase !== 'playing' || album || !open || active || card) return null;
  return (
    <aside className="panel locpanel" role="dialog" aria-label="Kahan se chalaoge?">
      <header className="panel-head">
        <h2>Kahan se chalaoge?</h2>
        <button className="icon-btn" onClick={() => setUi({ map: false })} aria-label="Close">
          <IconClose size={18} />
        </button>
      </header>
      <ul className="loc-rows">
        {ORDER.map((id) => (
          <li key={id}>
            <button className={`loc-row ${here === id ? 'here' : ''}`} onClick={() => (here === id ? !wide() && setUi({ map: false }) : goToLevel(id))} aria-current={here === id ? 'location' : undefined}>
              <span className="loc-icon">
                <PlaceIcon id={id} />
              </span>
              <span className="loc-text">
                <b>{LEVELS[id].name}</b>
                <small>{here === id ? 'You are here' : BLURB[id]}</small>
              </span>
              <IconChevron size={18} />
            </button>
          </li>
        ))}
      </ul>
    </aside>
  );
}
