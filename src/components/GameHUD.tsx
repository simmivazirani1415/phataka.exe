import { useEffect, useRef, useState } from 'react';
import { useGame } from '../game/GameState';
import { IconAlbum, IconCracker, IconGrid, IconPin, IconSettings, IconSoundOff, IconSoundOn } from './Icons';
import { audio } from '../audio/AudioEngine';
import { SITE } from '../config/site';
import { LEVELS } from '../street/StreetLayout';
import { whereNow } from '../street/Locations';

// The HUD stays small so the mohalla is the picture: the logo and the place you are in at
// the top left, the collection count at the top right, four round buttons at the bottom
// right (inventory, memories, sound, settings). Everything steps back while a cracker or
// a box is in focus.

const isTouch = () => typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;

export function GameHUD() {
  const found = useGame((s) => Object.values(s.packages).filter((p) => p === 'UNLOCKED' || p === 'PLAYED' || p === 'MEMORY_CAPTURED').length);
  const memories = useGame((s) => s.memories.length);
  const sound = useGame((s) => s.settings.sound);
  const update = useGame((s) => s.updateSettings);
  const setUi = useGame((s) => s.setUi);
  const ui = useGame((s) => s.ui);
  const active = useGame((s) => s.active);
  const placing = useGame((s) => s.placing);
  const [hint, setHint] = useState(true);
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
  const toggleSound = () => {
    const next = !sound;
    update({ sound: next });
    audio.setEnabled(next);
    if (next) audio.tap();
  };
  const open = (u: Partial<typeof ui>) => {
    audio.tap();
    setUi({ tray: false, map: false, settings: false, ...u });
  };

  return (
    <div className={`hud ${busy ? 'hud-busy' : ''}`}>
      <div className="hud-tl">
        <div className="hud-logo" aria-label={SITE.name}>
          {SITE.name.replace(/!$/, '')}
          {SITE.name.endsWith('!') && <i>!</i>}
        </div>
        <button className={`hud-place ${ui.map ? 'on' : ''}`} onClick={() => open({ map: !ui.map })} aria-expanded={ui.map} aria-label={`Choose location. You are at the ${LEVELS[here].name}.`} disabled={busy}>
          <IconPin size={16} />
          <span>{LEVELS[here].name}</span>
        </button>
      </div>

      <button className={`hud-count ${bump ? 'bump' : ''}`} onClick={() => open({ tray: !ui.tray })} aria-label={`Collection: ${found} of 8 patakas collected. Open inventory.`}>
        <IconCracker size={16} />
        <span>
          <b>{found}</b> / 8
        </span>
      </button>

      {hint && !busy && !placing && (
        <p className="hud-hint" aria-live="polite">
          {isTouch() ? 'Open the inventory, pick a pataka, follow the arrows · joystick to walk' : 'Open the inventory, pick a pataka, follow the arrows · WASD to walk'}
        </p>
      )}

      <nav className="hud-actions" aria-label="Controls">
        <button className={`hud-btn ${ui.tray ? 'on' : ''}`} onClick={() => open({ tray: !ui.tray })} aria-label="Inventory" aria-expanded={ui.tray} title="Inventory">
          <IconGrid size={20} />
        </button>
        <button className="hud-btn" onClick={() => { audio.paper(); open({ album: true }); }} aria-label="Memories" title="Memories">
          <IconAlbum size={20} />
          {memories > 0 && <span className="badge">{memories}</span>}
        </button>
        <button className="hud-btn" onClick={toggleSound} aria-pressed={sound} aria-label={sound ? 'Mute sound' : 'Turn sound on'} title={sound ? 'Sound on' : 'Sound off'}>
          {sound ? <IconSoundOn size={20} /> : <IconSoundOff size={20} />}
        </button>
        <button className={`hud-btn ${ui.settings ? 'on' : ''}`} onClick={() => open({ settings: !ui.settings })} aria-label="Settings" title="Settings">
          <IconSettings size={20} />
        </button>
      </nav>
    </div>
  );
}
