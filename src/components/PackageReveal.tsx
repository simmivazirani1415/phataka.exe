import { PACKAGE_BY_ID, PACKAGES } from '../assets/AssetRegistry';
import { useGame } from '../game/GameState';
import { closeActive, collectActive, openActive, skipAnimation } from '../game/DiscoverySystem';
import { MAX_USES } from '../game/GameState';
import { IconClose } from './Icons';

// The label that accompanies a box held up in the street. The 3D box is the hero; this
// small focus panel carries the name, the personality and the next action: open it, then
// take its cracker with MAX_USES lights.

export function PackageReveal() {
  const active = useGame((s) => s.active);
  if (!active) return null;
  const pkg = PACKAGE_BY_ID[active.id];
  const n = PACKAGES.indexOf(pkg) + 1;
  const { step } = active;
  const showLabel = step === 'presented' || step === 'opening' || step === 'opened';
  return (
    <>
      {(step === 'focusing' || step === 'opening') && (
        <button className="btn-quiet reveal-skip" onClick={skipAnimation}>
          Skip
        </button>
      )}
      {showLabel && (
        <section className="panel focus reveal" role="dialog" aria-label={pkg.name} style={{ ['--pk' as string]: pkg.palette[0] }}>
          <button className="icon-btn focus-close" onClick={closeActive} aria-label="Put the box back">
            <IconClose size={18} />
          </button>
          <p className="focus-kicker">
            {pkg.crackerLabel} · {n} of 8
          </p>
          <h2 className="focus-name">{pkg.name}</h2>
          <p className="focus-line">“{pkg.copy}”</p>
          {step === 'presented' && (
            <button className="btn-primary" autoFocus onClick={openActive}>
              Open the box
            </button>
          )}
          {step === 'opening' && <p className="focus-wait">Khul raha hai…</p>}
          {step === 'opened' && (
            <button className="btn-primary" autoFocus onClick={collectActive}>
              {active.replay ? 'Refill' : 'Collect'} · x{MAX_USES}
            </button>
          )}
        </section>
      )}
      {step === 'developing' && <p className="toast soft">Polaroid develop ho rahi hai…</p>}
    </>
  );
}
