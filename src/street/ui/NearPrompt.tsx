import { useEffect, useState } from 'react';
import { PACKAGES, type PackageId } from '../../assets/AssetRegistry';
import { useGame } from '../../game/GameState';
import { IconHand } from '../../components/Icons';
import { beginReveal, canPickUp, distanceToBox, PICKUP_RANGE } from '../../game/DiscoverySystem';

// When the player stands next to a glowing box: one button (or E) to pick it up.

export function NearPrompt() {
  const [near, setNear] = useState<PackageId | null>(null);
  const active = useGame((s) => s.active);
  const placing = useGame((s) => s.placing);
  const phase = useGame((s) => s.phase);
  useEffect(() => {
    const t = window.setInterval(() => {
      let best: PackageId | null = null;
      let bd = PICKUP_RANGE;
      for (const p of PACKAGES) {
        if (!canPickUp(p.id)) continue;
        const d = distanceToBox(p.id);
        if (d < bd) {
          bd = d;
          best = p.id;
        }
      }
      setNear(best);
    }, 200);
    return () => window.clearInterval(t);
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === 'e' || e.key === 'E' || e.key === 'Enter') && near && !useGame.getState().active && !useGame.getState().placing) {
        const t = e.target as HTMLElement;
        if (t?.tagName === 'BUTTON' && e.key === 'Enter') return;
        beginReveal(near);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [near]);
  if (!near || active || placing || phase !== 'playing') return null;
  return (
    <button className="btn-primary near-prompt" onClick={() => beginReveal(near)}>
      <IconHand size={17} /> Pick up <kbd>E</kbd>
    </button>
  );
}
