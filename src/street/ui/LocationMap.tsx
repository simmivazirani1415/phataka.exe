import { useEffect, useState } from 'react';
import { useGame } from '../../game/GameState';
import { LEVELS, type LevelId } from '../StreetLayout';
import { goToLevel, whereNow } from '../Locations';
import { IconClose } from '../../components/Icons';
import { audio } from '../../audio/AudioEngine';

// "Kahan phodoge?": the five places as cusped-arch cards in the middle of the screen. It opens
// right after "Enter the Mohalla" and again from the place button at the bottom centre.
// Picking a card glides the camera there.

export const PLACE_ORDER: LevelId[] = ['chowk', 'street', 'terrace', 'balcony', 'friend'];
const BLURB: Record<LevelId, string> = {
  chowk: 'All 8 patakas are here',
  street: 'Chai stall, autos, the lane',
  terrace: 'Diyas, rangoli, open sky',
  balcony: 'Throw them on the crowd',
  friend: 'A courtyard full of friends',
};

/** Small flat illustrations, one per place. */
export function PlaceIcon({ id }: { id: LevelId }) {
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
      // a house with a flat roof, a diya and lights on top
      return (
        <svg viewBox="0 0 40 40" aria-hidden="true">
          <path d="M8 18h24v15H8z" fill="#DC5947" />
          <path d="M6 15h28v4H6z" fill="#642F63" />
          <path d="M17 25h6v8h-6z" fill="#FFF1D7" />
          <path d="M11 22h4v3h-4zM25 22h4v3h-4z" fill="#F3B83E" />
          <path d="M6 9c5 3 9 3 14 0s9-3 14 0" fill="none" stroke="#642F63" strokeWidth="1" />
          <g fill="#F3B83E">
            <circle cx="10" cy="10.6" r="1.3" />
            <circle cx="16" cy="11" r="1.3" />
            <circle cx="24" cy="11" r="1.3" />
            <circle cx="30" cy="10.6" r="1.3" />
          </g>
        </svg>
      );
    case 'friend':
      // a doorway with a toran
      return (
        <svg viewBox="0 0 40 40" aria-hidden="true">
          <path d="M9 34V15l11-8 11 8v19z" fill="#F3B83E" />
          <path d="M15 34V22a5 5 0 0110 0v12z" fill="#642F63" />
          <path d="M11 16h18" stroke="#168C83" strokeWidth="2" />
          <g fill="#DC5947">
            <path d="M13 16l1.5 3 1.5-3zM18 16l1.5 3 1.5-3zM23 16l1.5 3 1.5-3z" />
          </g>
          <circle cx="20" cy="30.5" r="1.6" fill="#F3B83E" />
        </svg>
      );
    default:
      // a diya on a railing
      return (
        <svg viewBox="0 0 40 40" aria-hidden="true">
          <path d="M20 7c3 4 3.5 7 0 10-3.5-3-3-6 0-10z" fill="#F3B83E" />
          <path d="M9 19h22c-1.3 5-5.5 7.5-11 7.5S10.3 24 9 19z" fill="#DC5947" />
          <path d="M5 28h30M5 34h30M9 28v6M15 28v6M21 28v6M27 28v6M33 28v6" stroke="#642F63" strokeWidth="2" />
        </svg>
      );
  }
}

const ART = (id: LevelId) => `${import.meta.env.BASE_URL}assets/places/${id}.webp`;

/** A cusped Mughal arch, top and bottom: the card's plum body with its glowing gold edge. */
const ARCH =
  'M12 296V122c0-22 18-30 30-40 0-24 22-32 36-42 6-20 30-22 42-40 12 18 36 20 42 40 14 10 36 18 36 42 12 10 30 18 30 40v174c0 16-22 22-36 26-20 6-50 8-72 22-22-14-52-16-72-22-14-4-36-10-36-26z';
function ArchFrame() {
  return (
    <svg className="place-frame" viewBox="0 0 240 340" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id="pf-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#9a2654" />
          <stop offset="1" stopColor="#5e1236" />
        </linearGradient>
      </defs>
      <path d={ARCH} fill="url(#pf-fill)" stroke="#f6b53a" strokeWidth="5" vectorEffect="non-scaling-stroke" />
      <path d={ARCH} fill="none" stroke="#ffd27a" strokeOpacity="0.55" strokeWidth="1.2" transform="translate(12 13) scale(0.9 0.92)" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/** The scalloped plaque the heading sits on, with a diya on top and gold flourishes. */
function Plaque() {
  const d = 'M70 40c24 0 34-20 62-22h196c28 0 40-18 72-18s44 18 72 18h196c28 2 38 22 62 22 22 16 50 28 70 45-20 17-48 29-70 45-24 0-34 20-62 22H472c-28 0-40 18-72 18s-44-18-72-18H132c-28-2-38-22-62-22C48 114 20 102 0 85c20-17 48-29 70-45z';
  return (
    <svg className="places-plaque" viewBox="-4 -4 808 178" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id="pq-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#8e1f4a" />
          <stop offset="1" stopColor="#5e1236" />
        </linearGradient>
      </defs>
      <path d={d} fill="url(#pq-fill)" stroke="#f6b53a" strokeWidth="4" vectorEffect="non-scaling-stroke" />
      <path d={d} fill="none" stroke="#ffd27a" strokeOpacity="0.5" strokeWidth="1.2" transform="translate(28 9) scale(0.93 0.9)" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function Diya() {
  return (
    <svg className="places-diya" viewBox="0 0 64 52" aria-hidden="true">
      <path d="M32 2c6 8 7 13 0 19-7-6-6-11 0-19z" fill="#ffc531" />
      <path d="M32 9c3 4 3.4 6.5 0 9.5-3.4-3-3-5.5 0-9.5z" fill="#fff3c4" />
      <path d="M4 24c4 1 10 3 14 1 2 3 8 5 14 5s12-2 14-5c4 2 10 0 14-1-3 14-14 24-28 24S7 38 4 24z" fill="#f28c28" />
      <path d="M10 30c6 6 13 9 22 9s16-3 22-9" fill="none" stroke="#ffd27a" strokeWidth="2" />
    </svg>
  );
}

/** Little gold sprays either side of the plaque and the stay button. */
function Spray({ flip = false }: { flip?: boolean }) {
  return (
    <svg className={`spray ${flip ? 'flip' : ''}`} viewBox="0 0 40 40" aria-hidden="true">
      <g fill="#ffc531">
        <ellipse cx="26" cy="20" rx="10" ry="4" />
        <ellipse cx="20" cy="9" rx="7" ry="3" transform="rotate(-35 20 9)" />
        <ellipse cx="20" cy="31" rx="7" ry="3" transform="rotate(35 20 31)" />
      </g>
    </svg>
  );
}

export function LocationMap() {
  const open = useGame((s) => s.ui.map);
  const phase = useGame((s) => s.phase);
  const active = useGame((s) => s.active);
  const album = useGame((s) => s.ui.album);
  const setUi = useGame((s) => s.setUi);
  const [here, setHere] = useState<LevelId>(whereNow());
  useEffect(() => {
    const t = window.setInterval(() => setHere(whereNow()), 500);
    return () => window.clearInterval(t);
  }, []);
  useEffect(() => {
    if (!open) return;
    setHere(whereNow());
    const key = (e: KeyboardEvent) => e.key === 'Escape' && setUi({ map: false });
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [open, setUi]);
  if (phase !== 'playing' || album || !open || active) return null;
  const close = () => {
    audio.tap();
    setUi({ map: false });
  };
  return (
    <div className="places" role="dialog" aria-modal="true" aria-labelledby="places-title">
      <div className="places-scrim" onClick={close} aria-hidden="true" />
      <section className="places-sheet">
        <button className="icon-btn places-x" onClick={close} aria-label="Close">
          <IconClose size={18} />
        </button>
        <header className="places-head">
          <Diya />
          <Spray flip />
          <div className="places-plaque-wrap">
            <Plaque />
            <h2 id="places-title">Kahan phodoge?</h2>
            <p>Pick a place to burst from. Collect your patakas in the Chowk.</p>
          </div>
          <Spray />
        </header>
        <ul className="places-cards">
          {PLACE_ORDER.map((id, i) => (
            <li key={id} style={{ ['--i' as string]: i }}>
              <button className={`place-card ${here === id ? 'here' : ''}`} onClick={() => (here === id ? close() : void goToLevel(id))} aria-current={here === id ? 'location' : undefined}>
                <ArchFrame />
                <span className="place-art">
                  <img src={ART(id)} alt="" draggable={false} />
                </span>
                <b className="place-name">{LEVELS[id].name}</b>
                <small className="place-blurb">{BLURB[id]}</small>
                <span className="place-tag">{here === id ? 'You are here' : 'Go \u2192'}</span>
              </button>
            </li>
          ))}
        </ul>
        <div className="places-stay-row">
          <Spray flip />
          <button className="places-stay" onClick={close}>
            <span aria-hidden="true">{'\u2726'}</span> Stay in the {LEVELS[here].name} <span aria-hidden="true">{'\u2726'}</span>
          </button>
          <Spray />
        </div>
      </section>
    </div>
  );
}
