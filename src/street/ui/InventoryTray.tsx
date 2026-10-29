import { useEffect, useRef, useState } from 'react';
import { PACKAGES, type PackageId } from '../../assets/AssetRegistry';
import { MAX_USES, useGame } from '../../game/GameState';
import { cancelPlacing, startPlacing } from '../../game/DiscoverySystem';
import { GESTURE_INFO } from '../../input/gestures';
import { crackerRender, renderCrackers } from './crackerRenders';
import { dropHere, pointer, usePlace } from '../Placement';

// The slim tray on the right: every collected cracker as a small render of its real shape,
// with the lights it has left. Drag one onto the road (or tap it, then tap the road).

const REASON: Record<string, string> = {
  ground: 'Sirf sadak ya chowk',
  person: 'Logon se door',
  vehicle: 'Gaadi se door',
  far: 'Thoda paas',
};

export function InventoryTray() {
  const packages = useGame((s) => s.packages);
  const uses = useGame((s) => s.uses);
  const placing = useGame((s) => s.placing);
  const active = useGame((s) => s.active);
  const phase = useGame((s) => s.phase);
  const album = useGame((s) => s.ui.album);
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
      if (d.moved) setGhost({ id: d.id, x: e.clientX, y: e.clientY });
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
      if (!d.moved) return; // a tap: stay in placing mode, tap the road next
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

  const owned = PACKAGES.filter((p) => {
    const s = packages[p.id];
    return s === 'UNLOCKED' || s === 'PLAYED' || s === 'MEMORY_CAPTURED';
  });
  if (phase !== 'playing' || album) return null;
  const busy = !!active && active.step !== 'spotlight';

  return (
    <>
      {owned.length > 0 && (
        <aside className={`inv ${busy || active ? 'inv-busy' : ''}`} aria-label="Your crackers">
          <ul>
            {owned.map((p) => {
              const n = uses[p.id];
              const img = crackerRender(p.id);
              const on = placing === p.id;
              return (
                <li key={p.id}>
                  <button
                    className={`inv-item ${on ? 'on' : ''} ${n <= 0 ? 'empty' : ''} ${pulse === p.id ? 'pulse' : ''}`}
                    style={{ ['--pk' as string]: p.palette[0] }}
                    aria-label={`${p.crackerLabel}: ${n} of ${MAX_USES} left${n > 0 ? '. Drag onto the road to place.' : '. Refill at its box.'}`}
                    title={p.crackerLabel}
                    disabled={n <= 0 || !!active}
                    onPointerDown={(e) => {
                      if (n <= 0 || active) return;
                      if (placing === p.id) {
                        cancelPlacing();
                        return;
                      }
                      if (!startPlacing(p.id)) return;
                      drag.current = { id: p.id, pid: e.pointerId, x0: e.clientX, y0: e.clientY, moved: false };
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        if (placing === p.id) cancelPlacing();
                        else startPlacing(p.id);
                      }
                    }}
                  >
                    {img ? <img src={img} alt="" draggable={false} /> : <span className="inv-emoji">{GESTURE_INFO[p.id].icon}</span>}
                    <b className="inv-count">x{n}</b>
                  </button>
                </li>
              );
            })}
          </ul>
        </aside>
      )}
      {ghost && (
        <div className="inv-ghost" style={{ left: ghost.x, top: ghost.y }} aria-hidden="true">
          {crackerRender(ghost.id) ? <img src={crackerRender(ghost.id)!} alt="" /> : GESTURE_INFO[ghost.id].icon}
        </div>
      )}
      {placing && !active && (
        <div className={`place-hint ${check && check !== 'ok' ? 'bad' : ''}`} role="status">
          <span>{check && check !== 'ok' ? REASON[check] : '⬇'}</span>
          <button className="btn ghost tiny" onClick={cancelPlacing} aria-label="Put it back in the tray">
            ✕
          </button>
        </div>
      )}
    </>
  );
}
