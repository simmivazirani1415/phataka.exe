import { useEffect, useState } from 'react';
import { useGame, type Memory } from '../game/GameState';
import { PACKAGE_BY_ID } from '../assets/AssetRegistry';
import { savePolaroid } from '../utils/Share';
import { audio } from '../audio/AudioEngine';
import { IconClose, IconDownload, IconSpark } from './Icons';

export function PolaroidImage({ memory, className = '' }: { memory: Memory; className?: string }) {
  return <img className={`polaroid-img ${className}`} src={memory.polaroid} alt={`Polaroid: ${PACKAGE_BY_ID[memory.packageId].name}, “${memory.caption}”`} draggable={false} />;
}

/** The freshly printed Polaroid sliding out of the camera after a first show. */
export function NewMemory() {
  const id = useGame((s) => s.ui.newMemory);
  const memory = useGame((s) => s.memories.find((m) => m.id === id));
  const setUi = useGame((s) => s.setUi);
  const stage = useGame((s) => s.stage());
  const [saved, setSaved] = useState(false);
  useEffect(() => setSaved(false), [id]);
  if (!memory) return null;
  const close = () => setUi({ newMemory: null });
  return (
    <div className="new-memory" role="dialog" aria-label="New memory">
      <header className="nm-head">
        <span className="nm-kicker">
          <IconSpark size={15} /> New memory
        </span>
        <span className="nm-count">{stage} of 8</span>
        <button className="icon-btn" onClick={close} aria-label="Close">
          <IconClose size={18} />
        </button>
      </header>
      <div className="new-memory-slot">
        <PolaroidImage memory={memory} className="emerge" />
      </div>
      <p className="new-memory-line">{stage >= 8 ? 'Poora mohalla jagmaga utha!' : 'The mohalla glows a little brighter.'}</p>
      <div className="new-memory-actions">
        <button
          className="btn-line"
          onClick={async () => {
            await savePolaroid(memory);
            setSaved(true);
            audio.tap();
          }}
        >
          <IconDownload size={16} /> {saved ? 'Saved' : 'Save'}
        </button>
        <button className="btn-primary" autoFocus onClick={close}>
          Continue exploring
        </button>
      </div>
    </div>
  );
}
