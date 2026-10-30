import { useEffect, useRef, useState } from 'react';
import { PACKAGES, type PackageId } from '../../assets/AssetRegistry';
import { keepTray, MAX_USES, useGame, wide } from '../../game/GameState';
import { cancelPlacing, pickFromPanel } from '../../game/DiscoverySystem';
import { IconClose, IconCracker, IconLock } from '../../components/Icons';
import { crackerRender, renderCrackers } from './crackerRenders';
import { dropHere, pointer, usePlace } from '../Placement';

// The inventory drawer (a narrow panel on the right, a bottom sheet on phones): the eight
// crackers as small renders, like matchbox labels. A locked one opens its collectible card;
// a collected one shows the lights it has left and can be dragged onto the ground (or
// tapped, then the ground tapped).

const REASON: Record<string, string> = {
  ground: 'Find open ground',
  person: 'Too close to people',
  vehicle: 'Too close to a vehicle',
  far: 'A little closer',
};

export function InventoryTray() {
  const packages = useGame((s) => s.packages);
  const uses = useGame((s) => s.uses);
  const placing = useGame((s) => s.placing);
  const active = useGame((s) => s.active);
  const phase = useGame((s) => s.phase);
  const album = useGame((s) => s.ui.album);
  const open = useGame((s) => s.ui.tray);
  const pulse = useGame((s) => s.ui.trayPulse);
  const setUi = useGame((s) => s.setUi);
  const check = usePlace((s) => s.check);
  const [, setReady] = useState(0);
  const [ghost, setGhost] = useState<{ id: PackageId; x: number; y: number } | null>(null);
  const drag = useRef<{ id: PackageId; pid: number; x0: number; y0: number; moved: boolean } | null>(null);

  useEffect(() => {
    renderCrackers().then(() => setReady((n) => n + 1));
  }, []);
  useEffect(() => {
    if (!pulse) return;
    const t = window.setTimeout(() => setUi({ trayPulse: null }), 1800);
    return () => window.clearTimeout(t);
  }, [pulse, setUi]);

  // drag a cracker out of the tray and drop it on the road
  useEffect(() => {
    const move = (e: PointerEvent) => {
      const d = drag.current;
      if (!d || e.pointerId !== d.pid) return;
      if (Math.hypot(e.clientX - d.x0, e.clientY - d.y0) > 10) d.moved = true;
      if (d.moved) {
        setGhost({ id: d.id, x: e.clientX, y: e.clientY });
        if (!wide() && useGame.getState().ui.tray && !(document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null)?.closest('.inv')) useGame.getState().setUi({ tray: false });
      }
      const canvas = document.querySelector('.world-canvas canvas');
      const under = document.elementFromPoint(e.clientX, e.clientY);
      pointer.overUi = under !== canvas;
      const r = canvas?.getBoundingClientRect();
      if (r) {
        pointer.x = e.clientX - r.left;
        pointer.y = e.clientY - r.top;
        pointer.has = true;
      }
    };
    const up = (e: PointerEvent) => {
      const d = drag.current;
      if (!d || e.pointerId !== d.pid) return;
      drag.current = null;
      setGhost(null);
      if (!d.moved) {
        // a tap: stay in placing mode with the drawer out of the way, tap the road next
        useGame.getState().setUi({ tray: keepTray() });
        return;
      }
      const canvas = document.querySelector('.world-canvas canvas');
      const under = document.elementFromPoint(e.clientX, e.clientY);
      pointer.overUi = under !== canvas;
      if (under === canvas) dropHere();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
  }, []);

  const isOwned = (id: PackageId) => {
    const st = packages[id];
    return st === 'UNLOCKED' || st === 'PLAYED' || st === 'MEMORY_CAPTURED';
  };
  if (phase !== 'playing' || album) return null;
  const owned = PACKAGES.filter((p) => isOwned(p.id)).length;

  return (
    <>
      {open && !active && (
        <aside className="panel inv" aria-label="Your patakas">
          <header className="panel-head">
            <h2>Pataka</h2>
            <span className="inv-total">
              <IconCracker size={15} /> {owned} / 8
            </span>
            <button className="icon-btn" onClick={() => setUi({ tray: false })} aria-label="Close inventory">
              <IconClose size={18} />
            </button>
          </header>
          <ul className="inv-grid">
            {PACKAGES.map((p) => {
              const own = isOwned(p.id);
              const n = uses[p.id];
              const img = crackerRender(p.id);
              const on = placing === p.id;
              return (
                <li key={p.id}>
                  <button
                    className={`inv-item ${on ? 'on' : ''} ${!own ? 'locked' : n <= 0 ? 'empty' : ''} ${pulse === p.id ? 'pulse' : ''}`}
                    style={{ ['--pk' as string]: p.palette[0] }}
                    aria-label={!own ? `${p.crackerLabel}: not collected yet. Open its card.` : `${p.crackerLabel}: ${n} of ${MAX_USES} left${n > 0 ? '. Drag onto the ground to place.' : '. Tap to refill.'}`}
                    title={p.crackerLabel}
                    onPointerDown={(e) => {
                      if (active) return;
                      if (!own) {
                        pickFromPanel(p.id);
                        setUi({ tray: keepTray() });
                        return;
                      }
                      if (placing === p.id) {
                        cancelPlacing();
                        return;
                      }
                      pickFromPanel(p.id);
                      if (useGame.getState().placing !== p.id) return;
                      drag.current = { id: p.id, pid: e.pointerId, x0: e.clientX, y0: e.clientY, moved: false };
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        pickFromPanel(p.id);
                        setUi({ tray: keepTray() });
                      }
                    }}
                  >
                    <span className="inv-art">{img ? <img src={img} alt="" draggable={false} /> : <IconCracker size={26} />}</span>
                    <span className="inv-name">{p.crackerLabel}</span>
                    {own ? (
                      <b className="inv-count">x{n}</b>
                    ) : (
                      <b className="inv-lock" aria-hidden="true">
                        <IconLock size={11} />
                      </b>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="inv-foot">{owned < 8 ? 'Tap a locked pataka to find its box. Drag a collected one onto the ground.' : 'Drag a pataka onto the ground to light it.'}</p>
        </aside>
      )}
      {ghost && (
        <div className="inv-ghost" style={{ left: ghost.x, top: ghost.y }} aria-hidden="true">
          {crackerRender(ghost.id) ? <img src={crackerRender(ghost.id)!} alt="" /> : <IconCracker size={30} />}
        </div>
      )}
      {placing && !active && (
        <div className={`place-hint ${check && check !== 'ok' ? 'bad' : ''}`} role="status">
          <span>{check && check !== 'ok' ? REASON[check] : 'Tap the ground to place it'}</span>
          <button className="icon-btn" onClick={cancelPlacing} aria-label="Put it back">
            <IconClose size={16} />
          </button>
        </div>
      )}
    </>
  );
}
