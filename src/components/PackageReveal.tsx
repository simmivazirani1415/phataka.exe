import { PACKAGE_BY_ID, PACKAGES } from '../assets/AssetRegistry';
import { useGame } from '../game/GameState';
import { closeActive, lightActive, openActive, skipAnimation } from '../game/DiscoverySystem';
import { IconClose } from './Icons';
import { GesturePrompt } from './GestureLayer';

// The printed label strip that accompanies a box in the foreground. The 3D box itself is
// the hero; this only carries the name, the personality and the next action.

export function PackageReveal() {
  const active = useGame((s) => s.active);
  const pkgState = useGame((s) => (s.active ? s.packages[s.active.id] : null));
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
              <>
                <button className="btn cta fire" autoFocus onClick={() => lightActive(false)}>
                  Light It Up
                </button>
                {active.replay && pkgState === 'MEMORY_CAPTURED' && (
                  <button className="btn ghost small" onClick={() => lightActive(true)}>
                    Light &amp; take a new photo
                  </button>
                )}
              </>
            )}
          </div>
          {step === 'opened' && <GesturePrompt id={active.id} />}
        </section>
      )}
      {step === 'developing' && <p className="toast soft">Polaroid develop ho rahi hai…</p>}
    </>
  );
}
