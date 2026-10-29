import { useState } from 'react';
import { useGame, type Flash, type Graphics } from '../game/GameState';
import { IconClose } from './Icons';
import { SoundToggle } from './SoundToggle';
import { runtime } from '../game/Runtime';
import { startHands, stopHands, useHands } from '../input/HandTracker';
import { useIdent } from '../intro/identState';

function Segmented<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="setting">
      <span className="setting-label" id={`lbl-${label}`}>
        {label}
      </span>
      <div className="segmented" role="radiogroup" aria-labelledby={`lbl-${label}`}>
        {options.map(([v, l]) => (
          <button key={v} role="radio" aria-checked={value === v} className={value === v ? 'on' : ''} onClick={() => onChange(v)}>
            {l}
          </button>
        ))}
      </div>
    </div>
  );
}

function Toggle({ label, value, onChange, note }: { label: string; value: boolean; onChange: (v: boolean) => void; note?: string }) {
  return (
    <label className="setting toggle">
      <span>
        <span className="setting-label">{label}</span>
        {note && <small>{note}</small>}
      </span>
      <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} />
      <span className="switch" aria-hidden="true" />
    </label>
  );
}

export function SettingsPanel() {
  const open = useGame((s) => s.ui.settings);
  const settings = useGame((s) => s.settings);
  const update = useGame((s) => s.updateSettings);
  const setUi = useGame((s) => s.setUi);
  const active = useGame((s) => s.active);
  const reset = useGame((s) => s.reset);
  const [confirm, setConfirm] = useState(false);
  const hands = useHands((s) => s.status);
  if (!open) return null;
  return (
    <aside className="settings" role="dialog" aria-label="Settings">
      <header className="tray-head">
        <h2>Settings</h2>
        <button className="btn icon" onClick={() => setUi({ settings: false })} aria-label="Close settings">
          <IconClose />
        </button>
      </header>
      <div className="setting">
        <span className="setting-label">Sound</span>
        <SoundToggle labelled />
      </div>
      <Segmented<Graphics> label="Graphics" value={settings.graphics} options={[['high', 'High'], ['low', 'Low']]} onChange={(graphics) => update({ graphics })} />
      <Segmented<Flash> label="Flash intensity" value={settings.flash} options={[['off', 'Minimal'], ['low', 'Soft'], ['full', 'Full']]} onChange={(flash) => update({ flash })} />
      <Toggle label="Reduced motion" note="Shorter transitions, no camera shake" value={settings.reducedMotion} onChange={(reducedMotion) => update({ reducedMotion })} />
      <Toggle label="Quick reveals" note="Skip the slow box animation" value={settings.quickReveal} onChange={(quickReveal) => update({ quickReveal })} />
      <Toggle
        label="Hand gestures"
        note={hands === 'denied' || hands === 'error' ? 'Camera not available here' : 'Light each pataka with your webcam. Video stays on this device.'}
        value={hands === 'loading' || hands === 'ready'}
        onChange={(on) => (on ? void startHands() : stopHands())}
      />
      <div className="setting">
        <button
          className="btn ghost small"
          onClick={() => {
            setUi({ settings: false, hintUntil: performance.now() + 4500 });
          }}
        >
          Highlight hidden patakas
        </button>
        <button
          className="btn ghost small"
          disabled={!!active}
          onClick={() => {
            setUi({ settings: false, tray: false, album: false, newMemory: null, showMe: null });
            useGame.getState().setPhase('intro');
            useIdent.getState().replay();
          }}
        >
          Replay intro
        </button>
      </div>
      <div className="setting danger">
        {!confirm ? (
          <button className="btn ghost small" onClick={() => setConfirm(true)}>
            Reset Experience
          </button>
        ) : (
          <>
            <span>Clear every pataka and memory?</span>
            <button
              className="btn cta small"
              onClick={() => {
                reset();
                setConfirm(false);
                runtime.camera?.reset();
              }}
            >
              Yes, reset
            </button>
            <button className="btn ghost small" onClick={() => setConfirm(false)}>
              Keep them
            </button>
          </>
        )}
      </div>
    </aside>
  );
}
