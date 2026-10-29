import { PACKAGES } from '../assets/AssetRegistry';
import { getThumbUrl, drawFallbackFront } from '../assets/PackageTextures';
import { useGame, type PackageState } from '../game/GameState';
import { showMe } from '../game/DiscoverySystem';
import { BOX_SPOTS } from '../street/StreetLayout';
import { IconClose } from './Icons';

const STATE_LABEL: Record<PackageState, string> = {
  HIDDEN: 'Still hiding',
  DISCOVERED: 'Found · not opened',
  OPENING: 'Opening',
  UNLOCKED: 'In your tray',
  PLAYED: 'Lit',
  MEMORY_CAPTURED: 'Lit & remembered',
};

export function CollectionTray() {
  const open = useGame((s) => s.ui.tray);
  const packages = useGame((s) => s.packages);
  const uses = useGame((s) => s.uses);
  const setUi = useGame((s) => s.setUi);
  if (!open) return null;
  return (
    <aside className="tray" role="dialog" aria-label="Pataka collection">
      <header className="tray-head">
        <h2>Pataka Parivaar</h2>
        <button className="btn icon" onClick={() => setUi({ tray: false })} aria-label="Close collection">
          <IconClose />
        </button>
      </header>
      <ul className="tray-grid">
        {PACKAGES.map((p) => {
          const st = packages[p.id];
          const found = st !== 'HIDDEN';
          return (
            <li key={p.id} className={`tray-slot ${found ? 'found' : 'hidden'}`} style={{ ['--pk' as string]: p.palette[0] }}>
              <div className="tray-art">
                {found ? (
                  <img
                    src={getThumbUrl(p.id)}
                    alt={`${p.name} box`}
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).src = drawFallbackFront(p).toDataURL();
                    }}
                  />
                ) : (
                  <span aria-hidden="true">?</span>
                )}
              </div>
              <div className="tray-info">
                <b>{found ? p.name : 'Ek chhupa pataka'}</b>
                <small>{found ? `${STATE_LABEL[st]}${st !== 'DISCOVERED' ? ` · x${uses[p.id]}` : ''}` : BOX_SPOTS[p.id].hint}</small>
                {(!found || st === 'DISCOVERED' || uses[p.id] <= 0) && (
                  <button className="btn ghost tiny" onClick={() => showMe(p.id)}>
                    {found ? 'Where is its box?' : 'Show me'}
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
