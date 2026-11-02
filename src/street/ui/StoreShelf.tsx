import { useEffect, useRef, useState } from 'react';
import { PACKAGE_BY_ID, PACKAGES, type CrackerType, type PackageId } from '../../assets/AssetRegistry';
import { useGame } from '../../game/GameState';
import { collectFromStore } from '../../game/DiscoverySystem';
import { whereNow } from '../Locations';
import { crackerRender, crackerShelf, renderCrackers } from './crackerRenders';
import { IconCracker, IconLeft, IconRight } from '../../components/Icons';

// The Pataka Store: the whole collection, full screen, every cracker standing on one long
// dark shelf with its name on the shelf's edge. Tapping one collects it: its packaging comes
// up as a card with a "Collected" note, then slides into the stash on the right.

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

const owns = (s: string) => s === 'UNLOCKED' || s === 'PLAYED' || s === 'MEMORY_CAPTURED';
const HOLD_MS = 1300;
const STEP_MS = 420;

/** A copy of the cracker's picture flies from the shelf into the stash on the right. */
function flyToStash(from: Element | null | undefined, src: string | null) {
  if (!from || !src) return;
  const a = from.getBoundingClientRect();
  const target = document.querySelector('.panel.inv .inv-grid') ?? document.querySelector('.hud-count');
  const b = target?.getBoundingClientRect() ?? { left: window.innerWidth - 60, top: 80, width: 40, height: 40 };
  const img = document.createElement('img');
  img.src = src;
  img.className = 'fly-cracker';
  Object.assign(img.style, { left: `${a.left}px`, top: `${a.top}px`, width: `${a.width}px`, height: `${a.height}px` });
  document.body.appendChild(img);
  const dx = b.left + b.width / 2 - (a.left + a.width / 2);
  const dy = b.top + Math.min(b.height, 160) / 2 - (a.top + a.height / 2);
  const anim = img.animate(
    [
      { transform: 'translate(0, 0) scale(1)', opacity: 1 },
      { transform: `translate(${dx * 0.55}px, ${dy * 0.5 - 110}px) scale(0.7)`, opacity: 1, offset: 0.55 },
      { transform: `translate(${dx}px, ${dy}px) scale(0.22)`, opacity: 0.3 },
    ],
    { duration: 760, easing: 'cubic-bezier(.5,0,.3,1)' },
  );
  anim.onfinish = () => img.remove();
}

export function StoreShelf() {
  const phase = useGame((s) => s.phase);
  const active = useGame((s) => s.active);
  const ui = useGame((s) => s.ui);
  const packages = useGame((s) => s.packages);
  const uses = useGame((s) => s.uses);
  const reduced = useGame((s) => s.settings.reducedMotion);
  const setUi = useGame((s) => s.setUi);
  const [here, setHere] = useState(whereNow());
  const [, setReady] = useState(0);
  const [card, setCard] = useState<{ id: PackageId; fresh: boolean; leaving: boolean; dx: number; dy: number } | null>(null);
  const track = useRef<HTMLUListElement>(null);
  const timers = useRef<number[]>([]);
  const [filling, setFilling] = useState(false);
  const nag = ui.nag;

  useEffect(() => {
    renderCrackers().then(() => setReady((n) => n + 1));
    const t = window.setInterval(() => setHere(whereNow()), 300);
    return () => {
      window.clearInterval(t);
      timers.current.forEach((x) => window.clearTimeout(x));
    };
  }, []);

  // the browser's back button at the store: remind them to collect everything first
  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    if (phase !== 'playing' || here !== 'store') return;
    const all = PACKAGES.every((p) => owns(useGame.getState().packages[p.id]));
    if (all) return;
    history.pushState({ store: 1 }, '');
    const onPop = () => {
      if (PACKAGES.every((p) => owns(useGame.getState().packages[p.id]))) return;
      history.pushState({ store: 1 }, '');
      useGame.getState().setUi({ nag: true });
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [phase, here]);

  if (phase !== 'playing' || here !== 'store' || active || ui.map || ui.album || ui.settings) return null;
  const owned = PACKAGES.filter((p) => owns(packages[p.id])).length;
  const missing = PACKAGES.filter((p) => !owns(packages[p.id]));

  /** Every cracker not yet collected goes into the stash, one after another. */
  const collectAll = () => {
    if (filling) return;
    setUi({ nag: false });
    const list = PACKAGES.filter((p) => !owns(useGame.getState().packages[p.id]));
    if (!list.length) return;
    setFilling(true);
    list.forEach((p, k) => {
      timers.current.push(
        window.setTimeout(() => {
          const li = track.current?.querySelector(`[data-id="${p.id}"]`);
          li?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', inline: 'nearest', block: 'nearest' });
          flyToStash(li?.querySelector('.coll-art img') ?? li, crackerRender(p.id));
          collectFromStore(p.id);
          if (k === list.length - 1) timers.current.push(window.setTimeout(() => setFilling(false), 800));
        }, k * (reduced ? 120 : STEP_MS)),
      );
    });
  };
  const leave = () => {
    if (missing.length) setUi({ nag: true });
    else setUi({ map: true });
  };

  const scroll = (d: number) => {
    const el = track.current;
    if (!el) return;
    const item = el.querySelector('li');
    el.scrollBy({ left: d * (item ? item.clientWidth * 3 : 300), behavior: reduced ? 'auto' : 'smooth' });
  };

  const tap = (id: PackageId) => {
    if (card) return;
    const fresh = !owns(packages[id]) || uses[id] <= 0;
    if (fresh) collectFromStore(id);
    // where the stash is, for the slide
    const target = document.querySelector('.panel.inv') ?? document.querySelector('.hud-count');
    const b = target?.getBoundingClientRect();
    const dx = b ? b.left + b.width / 2 - window.innerWidth / 2 : window.innerWidth / 2;
    const dy = b ? b.top + Math.min(b.height, 200) / 2 - window.innerHeight / 2 : -window.innerHeight / 3;
    setCard({ id, fresh, leaving: false, dx, dy });
    timers.current.push(window.setTimeout(() => setCard((c) => (c ? { ...c, leaving: true } : c)), reduced ? 900 : HOLD_MS));
    timers.current.push(
      window.setTimeout(
        () => {
          setCard(null);
          setUi({ trayPulse: id });
        },
        (reduced ? 900 : HOLD_MS) + 560,
      ),
    );
  };

  const shown = card ? PACKAGE_BY_ID[card.id] : null;
  return (
    <section className="coll" aria-labelledby="coll-title">
      <div className="coll-bokeh" aria-hidden="true" />
      <header className="coll-head">
        <h2 id="coll-title">Your Pataka Collection</h2>
        <p>Collect all the crackers: tap each one, or collect them all at once.</p>
      </header>
      <div className="coll-stage">
        <button className="coll-arrow l" onClick={() => scroll(-1)} aria-label="Previous crackers">
          <IconLeft size={20} />
        </button>
        <div className="coll-shelf">
          <ul className="coll-track" ref={track}>
            {PACKAGES.map((p, i) => {
              const have = owns(packages[p.id]);
              const img = crackerShelf(p.id);
              return (
                <li key={p.id} data-id={p.id} style={{ ['--i' as string]: i }}>
                  <button className={`coll-item ${have ? 'have' : ''}`} onClick={() => tap(p.id)} aria-label={have ? `${SHORT[p.crackerType]}: collected, ${uses[p.id]} lights. Tap to see its box.` : `${SHORT[p.crackerType]}: tap to collect.`}>
                    <span className="coll-art">{img ? <img src={img} alt="" draggable={false} /> : <IconCracker size={40} />}</span>
                    <span className="coll-name">{SHORT[p.crackerType]}</span>
                    {have && <span className="coll-tag">x{uses[p.id]}</span>}
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="coll-plinth" aria-hidden="true" />
        </div>
        <button className="coll-arrow r" onClick={() => scroll(1)} aria-label="More crackers">
          <IconRight size={20} />
        </button>
      </div>
      <div className="coll-foot">
        {owned > 0 && missing.length > 0 && (
          <button className="pill-cta" onClick={collectAll} disabled={filling}>
            {filling ? 'Collecting…' : `Collect all (${missing.length} more)`}
          </button>
        )}
        {owned > 0 && (
          <button className={missing.length ? 'pill-ghost' : 'pill-cta'} onClick={leave} disabled={filling}>
            Go light them <span aria-hidden="true">{'\u2192'}</span>
          </button>
        )}
      </div>

      {nag && (
        <div className="coll-nag" role="alertdialog" aria-modal="true" aria-labelledby="nag-title">
          <div className="coll-nag-card">
            <h3 id="nag-title">Collect all the crackers first</h3>
            <p>
              {missing.length} still on the shelf. Tap each one, or collect them all in one go.
            </p>
            <button className="pill-cta" autoFocus onClick={collectAll}>
              Collect all
            </button>
            <button
              className="coll-nag-later"
              onClick={() => {
                setUi({ nag: false, map: true });
              }}
            >
              Go anyway
            </button>
          </div>
        </div>
      )}

      {card && shown && (
        <div className={`coll-pop ${card.leaving ? 'leaving' : ''}`} role="status" aria-live="polite" style={{ ['--dx' as string]: `${card.dx}px`, ['--dy' as string]: `${card.dy}px` }}>
          <div className="coll-card">
            <span className="coll-note">
              <i aria-hidden="true">{'✓'}</i> {card.fresh ? 'Collected' : 'In your stash'}
            </span>
            <span className="coll-pack">
              <img src={shown.image.front ?? shown.image.reference ?? crackerRender(shown.id) ?? ''} alt="" draggable={false} />
            </span>
            <b className="coll-rel">{shown.name}</b>
            <small className="coll-sub">
              {SHORT[shown.crackerType]} · x{uses[shown.id]}
            </small>
          </div>
        </div>
      )}
    </section>
  );
}
