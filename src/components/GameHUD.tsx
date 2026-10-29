import { useEffect, useState } from 'react';
import { useGame } from '../game/GameState';
import { SoundToggle } from './SoundToggle';
import { IconAlbum, IconBox, IconHint, IconMore, IconSettings } from './Icons';
import { audio } from '../audio/AudioEngine';
import { SITE } from '../config/site';

const isTouch = () => typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;

export function GameHUD() {
  const found = useGame((s) => Object.values(s.packages).filter((p) => p !== 'HIDDEN').length);
  const memories = useGame((s) => s.memories.length);
  const setUi = useGame((s) => s.setUi);
  const ui = useGame((s) => s.ui);
  const active = useGame((s) => s.active);
  const [more, setMore] = useState(false);
  const [hint, setHint] = useState(true);
  const [pulse, setPulse] = useState(false);

  useEffect(() => {
    const t = window.setTimeout(() => setHint(false), 14000);
    return () => window.clearTimeout(t);
  }, []);
  useEffect(() => {
    if (!memories) return;
    setPulse(true);
    const t = window.setTimeout(() => setPulse(false), 2400);
    return () => window.clearTimeout(t);
  }, [memories]);

  const busy = !!active;
  const flashHint = () => {
    audio.tap();
    setUi({ hintUntil: performance.now() + 4500 });
  };

  return (
    <div className={`hud ${busy ? 'hud-busy' : ''}`}>
      <div className="hud-logo" aria-label={SITE.name}>
        {SITE.name}
      </div>
      <button className="hud-count" onClick={() => setUi({ tray: !ui.tray })} aria-label={`Collection: ${found} of 8 patakas found. Open collection.`} aria-expanded={ui.tray}>
        <IconBox size={18} />
        <b>{found}</b>/8
      </button>

      {hint && !busy && (
        <p className="hud-hint" aria-live="polite">
          {isTouch() ? 'Joystick to walk · drag to look · find the glowing boxes' : 'WASD or arrows to walk · drag to look · find the glowing boxes'}
        </p>
      )}

      <div className={`hud-actions ${more ? 'open' : ''}`}>
        <button className={`btn fab ${pulse ? 'pulse' : ''}`} onClick={() => { audio.paper(); setUi({ album: true }); }} aria-label="Open memories" title="Memories">
          <IconAlbum />
          {memories > 0 && <span className="badge">{memories}</span>}
        </button>
        <div className="hud-more">
          <button className="btn fab" onClick={flashHint} aria-label="Show a hint" title="Hint">
            <IconHint />
          </button>
          <SoundToggle />
          <button className="btn fab" onClick={() => setUi({ settings: true })} aria-label="Settings" title="Settings">
            <IconSettings />
          </button>
        </div>
        <button className="btn fab more-toggle" onClick={() => setMore(!more)} aria-label={more ? 'Hide controls' : 'More controls'} aria-expanded={more}>
          <IconMore />
        </button>
      </div>
    </div>
  );
}
