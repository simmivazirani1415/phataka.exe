import { useEffect, useState } from 'react';
import { useGame } from '../../game/GameState';
import { LEVELS, type LevelId } from '../StreetLayout';
import { goToLevel, whereNow } from '../Locations';
import { IconClose } from '../../components/Icons';
import { audio } from '../../audio/AudioEngine';

// "Kahan se chalaoge?": the five places as cards in the middle of the screen. It opens
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
          <h2 id="places-title">Kahan se chalaoge?</h2>
          <p>Pick a place to burst from. Collect your patakas in the Chowk.</p>
        </header>
        <ul className="places-cards">
          {PLACE_ORDER.map((id, i) => (
            <li key={id} style={{ ['--i' as string]: i }}>
              <button className={`place-card ${here === id ? 'here' : ''}`} onClick={() => (here === id ? close() : void goToLevel(id))} aria-current={here === id ? 'location' : undefined}>
                <span className="place-art">
                  <PlaceIcon id={id} />
                </span>
                <b className="place-name">{LEVELS[id].name}</b>
                <small className="place-blurb">{BLURB[id]}</small>
                <span className="place-tag">{here === id ? 'You are here' : 'Go'}</span>
              </button>
            </li>
          ))}
        </ul>
        <button className="places-stay" onClick={close}>
          Stay in the {LEVELS[here].name}
        </button>
      </section>
    </div>
  );
}
