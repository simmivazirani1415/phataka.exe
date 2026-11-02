import { useEffect, useRef, useState } from 'react';
import { useGame, wide } from '../game/GameState';
import { IconAlbum, IconCracker, IconGrid, IconPin } from './Icons';
import { useThrow } from '../street/throwing';
import { audio } from '../audio/AudioEngine';
import { SITE } from '../config/site';
import { LEVELS } from '../street/StreetLayout';
import { whereNow } from '../street/Locations';

// The HUD stays small so the mohalla is the picture: the logo at the top left, the place
// switcher at the bottom centre, the collection count at the top right, four round buttons
// at the bottom right (inventory, memories, sound, settings). Everything steps back while a
// cracker or a box is in focus.

const isTouch = () => typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;

export function GameHUD() {
  const found = useGame((s) => Object.values(s.packages).filter((p) => p === 'UNLOCKED' || p === 'PLAYED' || p === 'MEMORY_CAPTURED').length);
  const memories = useGame((s) => s.memories.length);
  const setUi = useGame((s) => s.setUi);
  const ui = useGame((s) => s.ui);
  const active = useGame((s) => s.active);
  const placing = useGame((s) => s.placing);
  const [hint, setHint] = useState(true);
  const armed = useThrow((s) => s.armed);
  const throwHint = useThrow((s) => s.hintSeen);
  const [bump, setBump] = useState(false);
  const [here, setHere] = useState(whereNow());
  const prev = useRef(found);

  useEffect(() => {
    const t = window.setTimeout(() => setHint(false), 12000);
    return () => window.clearTimeout(t);
  }, []);
  useEffect(() => {
    const t = window.setInterval(() => setHere(whereNow()), 500);
    return () => window.clearInterval(t);
  }, []);
  // the counter ticks up when a new pataka joins the collection
  useEffect(() => {
    if (found > prev.current) {
      setBump(true);
      const t = window.setTimeout(() => setBump(false), 700);
      prev.current = found;
      return () => window.clearTimeout(t);
    }
    prev.current = found;
  }, [found]);

  const busy = !!active;
  const open = (u: Partial<typeof ui>) => {
    audio.tap();
    // on phones one sheet at a time; on wide screens the side panels stay, but the settings
    // panel and the inventory share the right-hand side
    // (the pataka column on the right stays put)
    if (!wide()) setUi({ map: false, settings: false, ...(u.settings ? { tray: false } : {}), ...u });
    else setUi({ ...(u.settings ? { tray: false } : {}), ...(u.tray ? { settings: false } : {}), ...u });
  };

  return (
    <div className={`hud ${busy ? 'hud-busy' : ''}`}>
      <div className="hud-tl">
        <div className="hud-logo">
          <img src={`${import.meta.env.BASE_URL}assets/intro/phataka_party_logo_light.webp`} alt={SITE.name} draggable={false} />
        </div>
      </div>

      <button className={`hud-place ${ui.map ? 'on' : ''}`} onClick={() => (!ui.map && here === 'store' && found < 8 ? setUi({ nag: true }) : open({ map: !ui.map }))} aria-expanded={ui.map} aria-label={`Change place. You are at the ${LEVELS[here].name}.`} disabled={busy}>
        <IconPin size={17} />
        <span className="hud-place-text">
          <small>You are at</small>
          <b>{LEVELS[here].name}</b>
        </span>
        <span className="hud-place-go">Change place</span>
      </button>

      <button className={`hud-count ${bump ? 'bump' : ''}`} onClick={() => open({ tray: !ui.tray })} aria-label={`${found} of 8 patakas collected. Open the stash.`}>
        <IconCracker size={16} />
        <span>
          <b>{found}</b> / 8
        </span>
      </button>

      {(hint || !throwHint) && !busy && !placing && !ui.map && !armed && (here === 'society' || here === 'balcony') && (
        <p className="hud-hint" aria-live="polite">
          {isTouch() ? 'Pick a cracker on the right to hold it · joystick to walk' : 'Pick a cracker on the right to hold it · WASD to walk'}
        </p>
      )}

      <nav className="hud-actions" aria-label="Controls">
        <button className={`hud-btn ${ui.tray ? 'on' : ''}`} onClick={() => open({ tray: !ui.tray })} aria-label="Inventory" aria-expanded={ui.tray} title="Inventory">
          <IconGrid size={20} />
        </button>
        <button className="hud-book" onClick={() => { audio.paper(); open({ album: true, bookPage: 0 }); }} aria-label={`Your scrapbook${memories ? `, ${memories} memories` : ''}`}>
          <IconAlbum size={18} />
          <span>Your scrapbook</span>
          {memories > 0 && <span className="badge">{memories}</span>}
        </button>
      </nav>
    </div>
  );
}
