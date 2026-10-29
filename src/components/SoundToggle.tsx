import { useGame } from '../game/GameState';
import { audio } from '../audio/AudioEngine';
import { IconSoundOff, IconSoundOn } from './Icons';

export function SoundToggle({ labelled = false, className = '' }: { labelled?: boolean; className?: string }) {
  const on = useGame((s) => s.settings.sound);
  const update = useGame((s) => s.updateSettings);
  const toggle = () => {
    const next = !on;
    update({ sound: next });
    audio.setEnabled(next);
    if (next) audio.tap();
  };
  return (
    <button className={`btn ${labelled ? 'ghost small' : 'fab'} ${className}`} onClick={toggle} aria-pressed={on} aria-label={on ? 'Mute sound' : 'Turn sound on'} title={on ? 'Sound on' : 'Sound off'}>
      {on ? <IconSoundOn /> : <IconSoundOff />}
      {labelled && <span>{on ? 'Sound on' : 'Sound off'}</span>}
    </button>
  );
}
