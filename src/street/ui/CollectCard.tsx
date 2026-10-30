import { useEffect } from 'react';
import { PACKAGE_BY_ID, PACKAGES } from '../../assets/AssetRegistry';
import { useGame } from '../../game/GameState';
import { closeCard, keepCard } from '../../game/DiscoverySystem';
import { IconClose, IconPin } from '../../components/Icons';
import { BOX_SPOTS } from '../StreetLayout';

// The collectible card for a cracker picked from the inventory: its box, its name and its
// personality, in a small focus panel at the side (a bottom sheet on phones) so the street
// stays in view. Collecting it shows the way to the box.

export function CollectCard() {
  const id = useGame((s) => s.ui.card);
  useEffect(() => {
    if (!id) return;
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeCard();
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [id]);
  if (!id) return null;
  const pkg = PACKAGE_BY_ID[id];
  const n = PACKAGES.indexOf(pkg) + 1;
  return (
    <section className="panel focus ccard" role="dialog" aria-label={pkg.name} style={{ ['--pk' as string]: pkg.palette[0] }}>
      <button className="icon-btn focus-close" onClick={closeCard} aria-label="Close">
        <IconClose size={18} />
      </button>
      <div className="focus-art">
        <img src={pkg.image.reference ?? pkg.image.front ?? ''} alt="" draggable={false} />
      </div>
      <p className="focus-kicker">
        {pkg.crackerLabel} · {n} of 8
      </p>
      <h2 className="focus-name">{pkg.name}</h2>
      <p className="focus-line">“{pkg.copy}”</p>
      <p className="focus-where">
        <IconPin size={14} /> {BOX_SPOTS[id].hint}
      </p>
      <button className="btn-primary" autoFocus onClick={keepCard}>
        Find it
      </button>
    </section>
  );
}
