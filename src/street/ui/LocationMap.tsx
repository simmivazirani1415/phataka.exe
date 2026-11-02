import { useEffect, useState } from 'react';
import { useGame } from '../../game/GameState';
import { LEVELS, type LevelId } from '../StreetLayout';
import { goToLevel, whereNow } from '../Locations';
import { IconClose } from '../../components/Icons';
import { audio } from '../../audio/AudioEngine';

// "Kahan phodoge?": the five places as cusped-arch cards with Simran's icons, each with just
// its name and a Go pill. Opened from the bottom pill and from the store's "Go light them".

export const PLACE_ORDER: LevelId[] = ['society', 'balcony'];

/** Simran's cut-out icons, reused for the new set of places. */
const ICON: Record<LevelId, string> = { store: 'terrace', terrace: 'chowk', balcony: 'balcony', society: 'street', aangan: 'friend' };
const ART = (id: LevelId) => `${import.meta.env.BASE_URL}assets/places/${ICON[id]}.webp`;

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

export function LocationMap() {
  const open = useGame((s) => s.ui.map);
  const phase = useGame((s) => s.phase);
  const active = useGame((s) => s.active);
  const album = useGame((s) => s.ui.album);
  const setUi = useGame((s) => s.setUi);
  const [here, setHere] = useState<LevelId>(whereNow());
  useEffect(() => {
    if (!open) return;
    setHere(whereNow());
    const key = (e: KeyboardEvent) => e.key === 'Escape' && setUi({ map: false, queued: null });
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [open, setUi]);
  if (phase !== 'playing' || album || !open || active) return null;
  const close = () => {
    audio.tap();
    setUi({ map: false, queued: null });
  };
  return (
    <div className="places places-v3" role="dialog" aria-modal="true" aria-labelledby="places-title">
      <div className="places-scrim" onClick={close} aria-hidden="true" />
      <section className="places-sheet">
        <button className="icon-btn places-x" onClick={close} aria-label="Close">
          <IconClose size={18} />
        </button>
        <header className="places-head">
          <div className="places-plaque-wrap">
            <Plaque />
            <h2 id="places-title">Kahan phodoge?</h2>
          </div>
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
                <span className="place-tag">{here === id ? 'You are here' : 'Go \u2192'}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
