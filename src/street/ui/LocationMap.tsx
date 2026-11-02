import { useEffect, useState } from 'react';
import { useGame } from '../../game/GameState';
import { LEVELS, type LevelId } from '../StreetLayout';
import { goToLevel, whereNow } from '../Locations';
import { IconClose } from '../../components/Icons';
import { audio } from '../../audio/AudioEngine';

// "Kahan phodoge?": the five places as window-shaped cards, each just a small icon and its
// name. Opened from the bottom pill and from the store's "Go light them".

export const PLACE_ORDER: LevelId[] = ['store', 'terrace', 'balcony', 'society', 'aangan'];

/** Small gold line icons, one per place. */
function PlaceIcon({ id }: { id: LevelId }) {
  const common = { viewBox: '0 0 48 48', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true };
  switch (id) {
    case 'store':
      // a stall with a scalloped awning
      return (
        <svg {...common}>
          <path d="M8 18h32l-3-8H11z" />
          <path d="M8 18c0 2.5 2 4 4 4s4-1.5 4-4c0 2.5 2 4 4 4s4-1.5 4-4c0 2.5 2 4 4 4s4-1.5 4-4c0 2.5 2 4 4 4s4-1.5 4-4" />
          <path d="M11 22v16h26V22M20 38v-9h8v9" />
        </svg>
      );
    case 'terrace':
      // a roofline under a string of lights
      return (
        <svg {...common}>
          <path d="M6 10q18 8 36 0" />
          <circle cx="13" cy="13" r="1.2" fill="currentColor" />
          <circle cx="24" cy="14.5" r="1.2" fill="currentColor" />
          <circle cx="35" cy="13" r="1.2" fill="currentColor" />
          <path d="M8 24h32M10 24v14h28V24M20 38v-7h8v7" />
        </svg>
      );
    case 'balcony':
      // a railing with a diya on it
      return (
        <svg {...common}>
          <path d="M24 10c2.5 3 2.8 5 0 7.5-2.8-2.5-2.5-4.5 0-7.5z" />
          <path d="M17 21h14c-1 3.5-3.6 5-7 5s-6-1.5-7-5z" />
          <path d="M6 30h36M6 40h36M10 30v10M17 30v10M24 30v10M31 30v10M38 30v10" />
        </svg>
      );
    case 'society':
      // apartment blocks
      return (
        <svg {...common}>
          <path d="M8 40V14h14v26M26 40V8h14v32M5 40h38" />
          <path d="M12 19h2M16 19h2M12 25h2M16 25h2M12 31h2M16 31h2M30 13h2M34 13h2M30 19h2M34 19h2M30 25h2M34 25h2M30 31h2M34 31h2" />
        </svg>
      );
    default:
      // a tulsi chaura
      return (
        <svg {...common}>
          <path d="M24 22c0-5-3-8-7-9 0 4 3 7 7 9zM24 22c0-5 3-8 7-9 0 4-3 7-7 9zM24 22v-11" />
          <path d="M14 24h20v4H14zM16 28h16v12H16zM12 40h24" />
          <path d="M24 31l3 3-3 3-3-3z" />
        </svg>
      );
  }
}

/** A jharokha: a rectangle under a pointed, gently ogee arch. */
const WINDOW = 'M4 316V118C4 70 52 52 90 30 104 22 114 12 120 2 126 12 136 22 150 30 188 52 236 70 236 118V316Z';
function WindowFrame() {
  return (
    <svg className="win-frame" viewBox="0 0 240 320" preserveAspectRatio="none" aria-hidden="true">
      <path d={WINDOW} />
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
    <div className="places places-min" role="dialog" aria-modal="true" aria-labelledby="places-title">
      <div className="places-scrim" onClick={close} aria-hidden="true" />
      <section className="places-sheet">
        <button className="places-x" onClick={close} aria-label="Close">
          <IconClose size={18} />
        </button>
        <h2 id="places-title">Kahan phodoge?</h2>
        <ul className="win-cards">
          {PLACE_ORDER.map((id, i) => (
            <li key={id} style={{ ['--i' as string]: i }}>
              <button className={`win-card ${here === id ? 'here' : ''}`} onClick={() => (here === id ? close() : void goToLevel(id))} aria-current={here === id ? 'location' : undefined}>
                <WindowFrame />
                <span className="win-icon">
                  <PlaceIcon id={id} />
                </span>
                <b className="win-name">{LEVELS[id].name}</b>
                {here === id && <span className="win-here">You are here</span>}
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
