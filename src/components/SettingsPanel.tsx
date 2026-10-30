import { useState, type ReactNode } from 'react';
import { useGame, type Flash, type Graphics } from '../game/GameState';
import { IconBolt, IconClose, IconEye, IconHand, IconHint, IconMonitor, IconReplay, IconSoundOn, IconSpark, IconTrash } from './Icons';
import { audio } from '../audio/AudioEngine';
import { runtime } from '../game/Runtime';
import { groundMarks } from '../street/Scorch';
import { levelState, START } from '../street/StreetLayout';
import { startHands, stopHands, useHands } from '../input/HandTracker';
import { useIdent } from '../intro/identState';

function Row({ icon, label, note, children }: { icon: ReactNode; label: string; note?: string; children: ReactNode }) {
  return (
    <div className="set-row">
      <span className="set-icon">{icon}</span>
      <span className="set-label">
        {label}
        {note && <small>{note}</small>}
      </span>
      {children}
    </div>
  );
}

function Segmented<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="seg" role="radiogroup" aria-label={label}>
      {options.map(([v, l]) => (
        <button key={v} role="radio" aria-checked={value === v} className={value === v ? 'on' : ''} onClick={() => onChange(v)}>
          {l}
        </button>
      ))}
    </div>
  );
}

function Switch({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button className={`switch ${value ? 'on' : ''}`} role="switch" aria-checked={value} aria-label={label} onClick={() => onChange(!value)}>
      <i />
    </button>
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
  const close = () => {
    setConfirm(false);
    setUi({ settings: false });
  };
  return (
    <aside className="panel settings" role="dialog" aria-label="Settings">
      <header className="panel-head">
        <h2>Settings</h2>
        <button className="icon-btn" onClick={close} aria-label="Close settings">
          <IconClose size={18} />
        </button>
      </header>
      <Row icon={<IconSoundOn size={18} />} label="Sound">
        <Switch
          label="Sound"
          value={settings.sound}
          onChange={(sound) => {
            update({ sound });
            audio.setEnabled(sound);
            if (sound) audio.tap();
          }}
        />
      </Row>
      <Row icon={<IconMonitor size={18} />} label="Graphics">
        <Segmented<Graphics> label="Graphics" value={settings.graphics} options={[['high', 'High'], ['low', 'Low']]} onChange={(graphics) => update({ graphics })} />
      </Row>
      <Row icon={<IconSpark size={18} />} label="Flash intensity">
        <Segmented<Flash> label="Flash intensity" value={settings.flash} options={[['off', 'Minimal'], ['low', 'Soft'], ['full', 'Full']]} onChange={(flash) => update({ flash })} />
      </Row>
      <Row icon={<IconEye size={18} />} label="Reduced motion" note="Shorter transitions, no camera shake">
        <Switch label="Reduced motion" value={settings.reducedMotion} onChange={(reducedMotion) => update({ reducedMotion })} />
      </Row>
      <Row icon={<IconBolt size={18} />} label="Quick reveals" note="Skip the slow box animation">
        <Switch label="Quick reveals" value={settings.quickReveal} onChange={(quickReveal) => update({ quickReveal })} />
      </Row>
      <Row icon={<IconHand size={18} />} label="Hand gestures" note={hands === 'denied' || hands === 'error' ? 'Camera not available here' : 'Uses your webcam; video stays on this device'}>
        <Switch label="Hand gestures" value={hands === 'loading' || hands === 'ready'} onChange={(on) => (on ? void startHands() : stopHands())} />
      </Row>
      <div className="set-actions">
        <button className="btn-line" onClick={() => setUi({ settings: false, hintUntil: performance.now() + 4500 })}>
          <IconHint size={16} /> Highlight hidden patakas
        </button>
        <button
          className="btn-line"
          disabled={!!active}
          onClick={() => {
            setUi({ settings: false, tray: false, album: false, newMemory: null, showMe: null });
            useGame.getState().setPhase('intro');
            useIdent.getState().replay();
          }}
        >
          <IconReplay size={16} /> Replay intro
        </button>
      </div>
      <div className={`set-danger ${confirm ? 'confirm' : ''}`}>
        {!confirm ? (
          <button className="btn-danger" onClick={() => setConfirm(true)}>
            <IconTrash size={16} /> Reset experience
          </button>
        ) : (
          <>
            <p>Clear every pataka and memory? This can't be undone.</p>
            <div>
              <button className="btn-line" autoFocus onClick={() => setConfirm(false)}>
                Keep them
              </button>
              <button
                className="btn-danger solid"
                onClick={() => {
                  reset();
                  setConfirm(false);
                  groundMarks.clear();
                  levelState.id = 'street';
                  runtime.camera?.teleport({ x: START.x, z: START.z, yaw: START.yaw, pitch: 0, floor: 0 });
                }}
              >
                Yes, reset
              </button>
            </div>
          </>
        )}
      </div>
    </aside>
  );
}
