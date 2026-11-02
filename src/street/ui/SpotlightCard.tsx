import { useEffect, useRef, useState } from 'react';
import type { CrackerType } from '../../assets/AssetRegistry';
import { PACKAGE_BY_ID } from '../../assets/AssetRegistry';
import { useGame } from '../../game/GameState';
import { cancelPlaced } from '../../game/DiscoverySystem';
import { GESTURE_INFO } from '../../input/gestures';
import { handsRemembered, startHands, useHands } from '../../input/HandTracker';
import { HandCam } from '../../components/GestureLayer';
import { IconClose, IconHand } from '../../components/Icons';
import { GestureDemo } from './GestureDemo';

// The gesture guide, while a readied cracker waits in its gold ring. Left: the gesture as a
// big loop with an arrow for the direction of the motion. Right: the live camera with the
// tracked hand drawn on it. Under them a ring fills as the hand moves; the cracker fires the
// moment the motion is complete. (The "Burst it!" fallback sits beside the cracker itself.)

/** The direction of each motion, drawn over the demo (its layout is 150 x 110). */
const ARROWS: Record<CrackerType, string[]> = {
  bomb: ['M34 34 Q66 26 94 46'],
  rocket: ['M75 98 L75 18'],
  chakri: ['M107 55 A32 32 0 1 1 75 23'],
  sparkler: ['M107 55 A32 32 0 1 1 75 23'],
  anaar: ['M14 58 L54 58', 'M136 58 L96 58'],
  ladi: ['M14 46 L136 46'],
  skyshot: ['M75 100 L75 18'],
  popPop: ['M75 12 L75 84'],
};

function BigDemo({ type }: { type: CrackerType }) {
  const box = useRef<HTMLDivElement>(null);
  const [k, setK] = useState(1.4);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const fit = () => setK(Math.max(0.6, Math.min(el.clientWidth / 150, el.clientHeight / 110)));
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div className="hs-demo-box" ref={box}>
      <div className="hs-demo-scale" style={{ transform: `translate(-50%, -50%) scale(${k})` }}>
        <GestureDemo type={type} />
        <svg className="hs-arrow" viewBox="0 0 150 110" aria-hidden="true">
          <defs>
            <marker id={`ah-${type}`} viewBox="0 0 10 10" refX="5" refY="5" markerWidth="3.2" markerHeight="3.2" orient="auto-start-reverse">
              <path d="M0 0 L10 5 L0 10 z" fill="#ffc34d" />
            </marker>
          </defs>
          {ARROWS[type].map((d) => (
            <path key={d} d={d} markerEnd={`url(#ah-${type})`} />
          ))}
        </svg>
      </div>
    </div>
  );
}

function Ring({ p, lit }: { p: number; lit: boolean }) {
  const r = 22;
  const c = 2 * Math.PI * r;
  return (
    <svg className={`hs-ring ${lit ? 'lit' : ''}`} viewBox="0 0 56 56" aria-hidden="true">
      <circle cx="28" cy="28" r={r} className="ring-bg" />
      <circle cx="28" cy="28" r={r} className="ring-fg" strokeDasharray={c} strokeDashoffset={c * (1 - p)} transform="rotate(-90 28 28)" />
      <text x="28" y="33" textAnchor="middle">
        {Math.round(p * 100)}
      </text>
    </svg>
  );
}

export function SpotlightCard() {
  const active = useGame((s) => s.active);
  const status = useHands((s) => s.status);
  const progress = useHands((s) => s.progress);
  const hands = useHands((s) => s.hands);
  const litAt = useHands((s) => s.litAt);
  const [best, setBest] = useState(0);
  const id = active?.step === 'spotlight' ? active.id : null;

  useEffect(() => {
    if (id && useHands.getState().status === 'off' && handsRemembered()) void startHands();
  }, [id]);
  // the furthest the player has got with this cracker, so the prompt doesn't flicker back
  useEffect(() => setBest(0), [id]);
  useEffect(() => {
    if (progress > best) setBest(progress);
    else if (progress === 0 && best > 0 && hands === 0) setBest(0);
  }, [progress, best, hands]);

  if (!active || active.step !== 'spotlight') return null;
  const pkg = PACKAGE_BY_ID[active.id];
  const info = GESTURE_INFO[active.id];
  const live = status === 'ready';
  const lit = live && performance.now() - litAt < 1500;
  const p = live ? Math.min(1, Math.max(progress, best * 0.9) / 0.85) : 0;
  const prompt = lit ? 'Lit! Stand back…' : !live ? info.how : hands === 0 ? 'Show your hand to the camera' : p < 0.15 ? info.steps[0] : 'Keep going… complete the motion';
  return (
    <section className={`hguide ${lit ? 'is-lit' : ''}`} role="dialog" aria-label={`Light ${pkg.name}`}>
      <button className="hguide-x" onClick={cancelPlaced} aria-label="Put it back">
        <IconClose size={16} />
      </button>
      <div className="hguide-panes">
        <figure className="hguide-pane hguide-demo">
          <BigDemo type={pkg.crackerType} />
          <figcaption>
            <b>{info.title}</b>
          </figcaption>
        </figure>
        <figure className={`hguide-pane hguide-cam ${live ? 'on' : ''}`}>
          {live ? (
            <HandCam className="hs-video">{lit && <span className="hs-lit">{'\u{1F525}'}</span>}</HandCam>
          ) : (
            <div className="hguide-off">
              {status === 'loading' ? (
                <p>Starting the camera…</p>
              ) : status === 'denied' || status === 'error' ? (
                <p>Camera not available</p>
              ) : (
                <button className="pill-cta small" onClick={startHands}>
                  <IconHand size={16} /> Turn on camera
                </button>
              )}
            </div>
          )}
          <figcaption>
            <span className={`dot ${live ? 'on' : ''}`} /> Hand gestures
          </figcaption>
        </figure>
      </div>
      <div className="hguide-progress" role="status" aria-live="polite">
        {live && <Ring p={p} lit={lit} />}
        <p>
          <small>{pkg.name}</small>
          {prompt}
        </p>
      </div>
    </section>
  );
}
