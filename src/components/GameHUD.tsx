import { useEffect, useState } from 'react';
import { useGame } from '../game/GameState';
import { runtime } from '../game/Runtime';
import { SoundToggle } from './SoundToggle';
import { IconAlbum, IconBox, IconHint, IconMore, IconSettings, IconTurnLeft, IconTurnRight } from './Icons';
import { PRESET_LABELS, type PresetName } from '../camera/CameraPresets';
import { audio } from '../audio/AudioEngine';

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
      <div className="hud-logo" aria-label="Pataka.exe">
        Pataka<span>.exe</span>
      </div>
      <button className="hud-count" onClick={() => setUi({ tray: !ui.tray })} aria-label={`Collection: ${found} of 8 patakas found. Open collection.`} aria-expanded={ui.tray}>
        <IconBox size={18} />
        <b>{found}</b>/8
      </button>

      {hint && !busy && (
        <p className="hud-hint" aria-live="polite">
          {isTouch() ? 'One finger to turn · pinch to zoom · tap a glint' : 'Drag to turn · scroll to zoom · right-drag to slide · click a glint'}
        </p>
      )}

      <ViewDock />

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

// Bottom dock for 360° navigation: turn the mohalla in 45° steps or jump to a named spot.
// The highlighted chip clears as soon as the player drags the camera themselves.
const DOCK_ORDER: PresetName[] = ['overview', 'street', 'shop', 'courtyard', 'rooftops', 'terrace'];

function ViewDock() {
  const [current, setCurrent] = useState<PresetName | null>('overview');
  useEffect(() => {
    const clear = (e: PointerEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'CANVAS') setCurrent(null);
    };
    const onKey = (e: KeyboardEvent) => e.key.toLowerCase() === 'r' && setCurrent('overview');
    window.addEventListener('pointerdown', clear);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', clear);
      window.removeEventListener('keydown', onKey);
    };
  }, []);
  const turn = (dir: number) => {
    audio.tap();
    setCurrent(null);
    runtime.camera?.orbit((dir * Math.PI) / 4);
  };
  return (
    <nav className="view-dock" aria-label="Camera views">
      <button className="btn icon dock-turn" onClick={() => turn(-1)} aria-label="Turn left" title="Turn left">
        <IconTurnLeft size={20} />
      </button>
      <div className="dock-chips">
        {DOCK_ORDER.map((k) => (
          <button
            key={k}
            className={`dock-chip ${current === k ? 'on' : ''}`}
            aria-pressed={current === k}
            onClick={() => {
              audio.tap();
              setCurrent(k);
              runtime.camera?.preset(k);
            }}
          >
            {PRESET_LABELS[k]}
          </button>
        ))}
      </div>
      <button className="btn icon dock-turn" onClick={() => turn(1)} aria-label="Turn right" title="Turn right">
        <IconTurnRight size={20} />
      </button>
    </nav>
  );
}

export function SkipIntro() {
  return (
    <button className="btn ghost small skip-intro" onClick={() => import('../world/WorldScene').then((m) => m.skipAssembly())}>
      Skip intro
    </button>
  );
}
