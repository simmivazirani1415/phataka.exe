import { useEffect, useRef, useState } from 'react';
import { useGame, type Memory } from '../game/GameState';
import { PACKAGE_BY_ID, PACKAGES } from '../assets/AssetRegistry';
import { audio } from '../audio/AudioEngine';

export function PolaroidImage({ memory, className = '' }: { memory: Memory; className?: string }) {
  return <img className={`polaroid-img ${className}`} src={memory.polaroid} alt={`Polaroid: ${PACKAGE_BY_ID[memory.packageId].name}`} draggable={false} />;
}

const DEVELOP_MS = 2600;
const HOLD_MS = 900;

/**
 * The print from the burst: it comes out blank, develops, then flies into the scrapbook
 * button. Tapping it opens the relative's page. It never blocks the game.
 */
export function NewMemory() {
  const id = useGame((s) => s.ui.newMemory);
  const memory = useGame((s) => s.memories.find((m) => m.id === id));
  const reduced = useGame((s) => s.settings.reducedMotion);
  const setUi = useGame((s) => s.setUi);
  const card = useRef<HTMLButtonElement>(null);
  const [phase, setPhase] = useState<'develop' | 'fly'>('develop');

  useEffect(() => {
    if (!memory) return;
    setPhase('develop');
    const t1 = window.setTimeout(() => setPhase('fly'), reduced ? 1200 : DEVELOP_MS + HOLD_MS);
    return () => window.clearTimeout(t1);
  }, [memory, reduced]);

  useEffect(() => {
    if (phase !== 'fly' || !card.current) return;
    const el = card.current;
    const a = el.getBoundingClientRect();
    const b = document.querySelector('.hud-book')?.getBoundingClientRect();
    const dx = b ? b.left + b.width / 2 - (a.left + a.width / 2) : window.innerWidth / 2;
    const dy = b ? b.top + b.height / 2 - (a.top + a.height / 2) : window.innerHeight / 2;
    const anim = el.animate(
      [
        { transform: 'translate(0,0) rotate(-3deg) scale(1)', opacity: 1 },
        { transform: `translate(${dx * 0.45}px, ${dy * 0.3 - 60}px) rotate(8deg) scale(0.55)`, opacity: 1, offset: 0.5 },
        { transform: `translate(${dx}px, ${dy}px) rotate(14deg) scale(0.08)`, opacity: 0.2 },
      ],
      { duration: reduced ? 200 : 900, easing: 'cubic-bezier(.55,0,.35,1)', fill: 'forwards' },
    );
    anim.onfinish = () => {
      setUi({ newMemory: null });
      const btn = document.querySelector('.hud-book');
      btn?.classList.remove('got');
      void (btn as HTMLElement | null)?.offsetWidth;
      btn?.classList.add('got');
      audio.paper();
    };
    return () => anim.cancel();
  }, [phase, reduced, setUi]);

  if (!memory) return null;
  const pkg = PACKAGE_BY_ID[memory.packageId];
  const page = PACKAGES.findIndex((p) => p.id === memory.packageId) + 1;
  return (
    <div className={`nm2 ${phase}`} aria-live="polite">
      <button
        ref={card}
        className="nm2-card"
        onClick={() => {
          audio.paper();
          setUi({ newMemory: null, album: true, bookPage: page });
        }}
        aria-label={`New Polaroid for ${pkg.name}. Open the scrapbook page.`}
      >
        <img src={memory.polaroid} alt="" draggable={false} />
        {!reduced && <span className="nm2-dev" style={{ animationDuration: `${DEVELOP_MS}ms` }} />}
      </button>
      <p className="nm2-line">
        Developing for <b>{pkg.name}</b>'s page
      </p>
    </div>
  );
}
