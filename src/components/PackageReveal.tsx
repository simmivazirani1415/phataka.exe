import { PACKAGE_BY_ID, PACKAGES } from '../assets/AssetRegistry';
import { useGame } from '../game/GameState';
import { closeActive, collectActive, openActive, skipAnimation } from '../game/DiscoverySystem';
import { MAX_USES } from '../game/GameState';
import { IconClose } from './Icons';

// The printed label strip that accompanies a box in the foreground. The 3D box itself is
// the hero; this only carries the name, the personality and the next action: open it,
// then put its cracker in the tray with MAX_USES lights.

export function PackageReveal() {
  const active = useGame((s) => s.active);
  if (!active) return null;
  const pkg = PACKAGE_BY_ID[active.id];
  const n = PACKAGES.indexOf(pkg) + 1;
  const { step } = active;
  const showLabel = step === 'presented' || step === 'opening' || step === 'opened';
  return (
    <>
      <div className={`reveal-dim ${showLabel ? 'on' : ''}`} aria-hidden="true" />
      {(step === 'focusing' || step === 'opening') && (
        <button className="btn ghost small reveal-skip" onClick={skipAnimation}>
          Skip
        </button>
      )}
      {showLabel && (
        <section className="reveal" role="dialog" aria-label={pkg.name} style={{ ['--pk' as string]: pkg.palette[0], ['--pk2' as string]: pkg.palette[1] }}>
          <button className="reveal-close" onClick={closeActive} aria-label="Put the box back">
            <IconClose size={18} />
          </button>
          <p className="reveal-type">
            {pkg.crackerLabel} · Collectible {n} of 8
          </p>
          <h2 className="reveal-name">{pkg.name}</h2>
          <p className="reveal-personality">{pkg.personality}</p>
          <p className="reveal-copy">“{pkg.copy}”</p>
          <div className="reveal-actions">
            {step === 'presented' && (
              <button className="btn cta" autoFocus onClick={openActive}>
                Open the box
              </button>
            )}
            {step === 'opening' && <span className="reveal-wait">Khul raha hai…</span>}
            {step === 'opened' && (
              <button className="btn cta fire" autoFocus onClick={collectActive}>
                {active.replay ? 'Refill' : 'Add to tray'} · x{MAX_USES}
              </button>
            )}
          </div>
        </section>
      )}
      {step === 'developing' && <p className="toast soft">Polaroid develop ho rahi hai…</p>}
    </>
  );
}
