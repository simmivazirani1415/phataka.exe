import { useEffect, useRef } from 'react';
import { PACKAGE_BY_ID, PACKAGES } from '../../assets/AssetRegistry';
import { MAX_USES, useGame } from '../../game/GameState';
import { closeCard, keepCard } from '../../game/DiscoverySystem';
import { IconClose } from '../../components/Icons';

// The collectible card for a cracker picked from the panel: its box, its name and its
// personality. Keeping it adds the cracker to the collection and puts it in hand.

export function CollectCard() {
  const id = useGame((s) => s.ui.card);
  // the tap that opened the card ends over the backdrop; only a press that starts there closes it
  const pressed = useRef(false);
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
    <>
      <div
        className="reveal-dim on"
        aria-hidden="true"
        onPointerDown={() => (pressed.current = true)}
        onClick={() => {
          if (pressed.current) closeCard();
          pressed.current = false;
        }}
      />
      <section className="ccard" role="dialog" aria-label={pkg.name} style={{ ['--pk' as string]: pkg.palette[0], ['--pk2' as string]: pkg.palette[1] }}>
        <button className="reveal-close" onClick={closeCard} aria-label="Close">
          <IconClose size={18} />
        </button>
        <div className="ccard-art">
          <img src={pkg.image.reference ?? pkg.image.front ?? ''} alt="" draggable={false} />
        </div>
        <p className="reveal-type">
          {pkg.crackerLabel} · Collectible {n} of 8
        </p>
        <h2 className="reveal-name">{pkg.name}</h2>
        <p className="reveal-copy">“{pkg.copy}”</p>
        <button className="btn cta fire" autoFocus onClick={keepCard}>
          Collect · x{MAX_USES}
        </button>
      </section>
    </>
  );
}
