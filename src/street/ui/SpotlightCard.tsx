import { useEffect, useRef, useState } from 'react';
import type { CrackerType } from '../../assets/AssetRegistry';
import { PACKAGE_BY_ID } from '../../assets/AssetRegistry';
import { useGame } from '../../game/GameState';
import { cancelPlaced, lightPlaced } from '../../game/DiscoverySystem';
import { GESTURE_INFO } from '../../input/gestures';
import { handsRemembered, startHands, useHands } from '../../input/HandTracker';
import { HandCam } from '../../components/GestureLayer';
import { IconClose, IconHand, IconSpark } from '../../components/Icons';
import { GestureDemo } from './GestureDemo';

// While a cracker waits on the ground: a card at the bottom centre that teaches the hand
// gesture. On the left the gesture plays as a big loop ("Do this"); on the right is the live
// camera with your hand marked on it ("You"), a prompt that follows along (start the motion,
// finish it), and a meter that fills as you go. The cracker lights the moment the motion is
// close enough. "Let it burst" lights it without the camera.

/** The gesture loop, scaled up to fill its pane (its animation is laid out at 150 x 110). */
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
      </div>
    </div>
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

  // the camera comes back on by itself for anyone who used it before
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
  const noCam = status === 'error' || status === 'denied';
  const lit = live && performance.now() - litAt < 1500;
  const p = live ? Math.max(progress, best * 0.9) : 0;
  const prompt = lit
    ? 'Lit! Stand back…'
    : !live
      ? ''
      : hands === 0
        ? 'Show your hand to the camera'
        : p < 0.15
          ? info.steps[0]
          : p < 0.6
            ? info.steps[1]
            : 'Almost there, finish the motion!';
  return (
    <section className={`panel focus spot-panel hand-studio ${lit ? 'is-lit' : ''}`} role="dialog" aria-label={`${pkg.crackerLabel} is ready to light`} style={{ ['--pk' as string]: pkg.palette[0] }}>
      <button className="icon-btn focus-close" onClick={cancelPlaced} aria-label="Pick it back up">
        <IconClose size={18} />
      </button>
      <header className="hs-head">
        <p className="focus-kicker">{pkg.crackerLabel}</p>
        <h2 className="focus-name">{pkg.name}</h2>
      </header>
      <div className="hs-panes">
        <figure className="hs-pane hs-demo">
          <BigDemo type={pkg.crackerType} />
          <figcaption>
            <b>Do this</b> {info.title}
          </figcaption>
        </figure>
        <figure className={`hs-pane hs-cam ${live ? 'on' : ''}`}>
          {live ? (
            <HandCam className="hs-video">
              {hands === 0 && !lit && <span className="hs-nohand">{'\u{1F590}\u{FE0F}'}</span>}
              {lit && <span className="hs-lit">{'\u{1F525}'}</span>}
            </HandCam>
          ) : (
            <div className="hs-off">
              {status === 'loading' ? (
                <p>Starting the camera…</p>
              ) : noCam ? (
                <p>Camera not available here, so let it burst.</p>
              ) : (
                <button className="btn-primary" autoFocus onClick={startHands}>
                  <IconHand size={18} /> Light it yourself
                </button>
              )}
            </div>
          )}
          <figcaption>
            <b>You</b> {live ? (hands ? 'Hand found' : 'Looking for your hand') : 'Camera off'}
          </figcaption>
        </figure>
      </div>
      {live && (
        <div className="hs-progress" role="status" aria-live="polite">
          <p className="hs-prompt">{prompt}</p>
          <div className="spot-meter" aria-hidden="true">
            <i style={{ width: `${Math.round(Math.min(1, p / 0.85) * 100)}%` }} />
          </div>
        </div>
      )}
      <button className={noCam ? 'btn-primary' : 'btn-line'} autoFocus={status !== 'off'} onClick={() => lightPlaced()}>
        <IconSpark size={16} /> {live ? 'Skip, let it burst' : 'Let it burst'}
      </button>
    </section>
  );
}
