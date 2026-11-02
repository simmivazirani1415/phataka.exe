import { useEffect, useRef, useState } from 'react';
import { PACKAGES, type CrackerType, type PackageId } from '../../assets/AssetRegistry';
import { useGame } from '../../game/GameState';
import { collectFromStore } from '../../game/DiscoverySystem';
import { whereNow } from '../Locations';
import { crackerRender, renderCrackers } from './crackerRenders';
import { IconCracker } from '../../components/Icons';

// The Pataka Store: every cracker stands on the shelf with its name and what it does. A tap
// collects it: it flies to the stash on the right and its tile turns over to show the box,
// with the relative it is named after. Once there is something in the stash, "Go light them"
// opens the place picker.

/** The cracker's everyday name, as on the shelf. */
export const SHORT: Record<CrackerType, string> = {
  bomb: 'Sutli Bomb',
  rocket: 'Rocket',
  chakri: 'Chakri',
  sparkler: 'Phuljhadi',
  anaar: 'Anaar',
  ladi: 'Ladi',
  skyshot: '7 Shot',
  popPop: 'Pop-Pop',
};

export const DOES: Record<CrackerType, string> = {
  bomb: 'One big bang. Cover your ears.',
  rocket: 'Whooshes up and bursts in the sky.',
  chakri: 'Spins on the ground in a ring of sparks.',
  sparkler: 'A sparkling stick to wave about.',
  anaar: 'A fountain of golden sparks.',
  ladi: 'A long string of rapid-fire pops.',
  skyshot: 'Seven shots, one after another.',
  popPop: 'Throw it down. Snap!',
};

const owns = (s: string) => s === 'UNLOCKED' || s === 'PLAYED' || s === 'MEMORY_CAPTURED';

/** A copy of the cracker's picture flies from the tile to the stash on the right. */
function flyToStash(from: HTMLElement, src: string | null) {
  if (!src || useGame.getState().settings.reducedMotion) return;
  const a = from.getBoundingClientRect();
  const target = document.querySelector('.panel.inv .inv-grid') ?? document.querySelector('.hud-count');
  const b = target?.getBoundingClientRect() ?? { left: window.innerWidth - 60, top: 80, width: 40, height: 40 };
  const img = document.createElement('img');
  img.src = src;
  img.className = 'fly-cracker';
  Object.assign(img.style, { left: `${a.left}px`, top: `${a.top}px`, width: `${a.width}px`, height: `${a.height}px` });
  document.body.appendChild(img);
  const dx = b.left + b.width / 2 - (a.left + a.width / 2);
  const dy = b.top + Math.min(b.height, 120) / 2 - (a.top + a.height / 2);
  const anim = img.animate(
    [
      { transform: 'translate(0, 0) scale(1)', opacity: 1 },
      { transform: `translate(${dx * 0.5}px, ${dy * 0.5 - 90}px) scale(0.75)`, opacity: 1, offset: 0.5 },
      { transform: `translate(${dx}px, ${dy}px) scale(0.3)`, opacity: 0.2 },
    ],
    { duration: 720, easing: 'cubic-bezier(.5,0,.3,1)' },
  );
  anim.onfinish = () => img.remove();
}

export function StoreShelf() {
  const phase = useGame((s) => s.phase);
  const active = useGame((s) => s.active);
  const ui = useGame((s) => s.ui);
  const packages = useGame((s) => s.packages);
  const uses = useGame((s) => s.uses);
  const setUi = useGame((s) => s.setUi);
  const [here, setHere] = useState(whereNow());
  const [, setReady] = useState(0);
  const [flipped, setFlipped] = useState<Record<string, boolean>>({});
  const tiles = useRef<Partial<Record<PackageId, HTMLElement | null>>>({});

  useEffect(() => {
    renderCrackers().then(() => setReady((n) => n + 1));
    const t = window.setInterval(() => setHere(whereNow()), 300);
    return () => window.clearInterval(t);
  }, []);

  if (phase !== 'playing' || here !== 'store' || active || ui.map || ui.album || ui.settings) return null;
  const owned = PACKAGES.filter((p) => owns(packages[p.id])).length;

  const tap = (id: PackageId) => {
    const have = owns(packages[id]);
    if (!have || uses[id] <= 0) {
      collectFromStore(id);
      flyToStash(tiles.current[id]?.querySelector('.shelf-art img') as HTMLElement, crackerRender(id));
      setFlipped((f) => ({ ...f, [id]: true }));
      return;
    }
    // already in the stash: turn the tile over to look at the other side
    setFlipped((f) => ({ ...f, [id]: !(f[id] ?? true) }));
  };

  return (
    <section className="shelf" aria-labelledby="shelf-title">
      <header className="shelf-head">
        <h2 id="shelf-title">Your Pataka Collection</h2>
        <span className="tag-count">
          {owned} / 8 collected
        </span>
      </header>
      <ul className="shelf-row">
        {PACKAGES.map((p, i) => {
          const have = owns(packages[p.id]);
          const back = have && (flipped[p.id] ?? true);
          const img = crackerRender(p.id);
          return (
            <li key={p.id} style={{ ['--i' as string]: i }}>
              <button
                ref={(el) => {
                  tiles.current[p.id] = el;
                }}
                className={`shelf-tile ${back ? 'flipped' : ''} ${have ? 'have' : ''}`}
                onClick={() => tap(p.id)}
                aria-label={have ? `${p.name}, ${p.crackerLabel}: in your stash, ${uses[p.id]} lights left.` : `${SHORT[p.crackerType]}: ${DOES[p.crackerType]} Tap to collect.`}
              >
                <span className="shelf-card">
                  <span className="shelf-face shelf-front">
                    <span className="shelf-art">{img ? <img src={img} alt="" draggable={false} /> : <IconCracker size={34} />}</span>
                    <b className="shelf-name">{SHORT[p.crackerType]}</b>
                    <small className="shelf-does">{DOES[p.crackerType]}</small>
                  </span>
                  <span className="shelf-face shelf-back">
                    <span className="shelf-box">
                      <img src={p.image.front ?? p.image.reference ?? ''} alt="" draggable={false} loading="lazy" />
                    </span>
                    <b className="shelf-rel">{p.name}</b>
                    <span className="shelf-uses">x{uses[p.id]}</span>
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <div className="shelf-foot">
        {owned > 0 ? (
          <button className="pill-cta" onClick={() => setUi({ map: true })}>
            Go light them <span aria-hidden="true">{'→'}</span>
          </button>
        ) : (
          <p className="shelf-tip">Tap a pataka to add it to your stash</p>
        )}
      </div>
    </section>
  );
}
