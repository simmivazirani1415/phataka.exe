import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { SITE } from '../config/site';
import { useGame } from '../game/GameState';
import { audio } from '../audio/AudioEngine';
import { SoundToggle } from '../components/SoundToggle';
import { brandLift, buildExitTimeline, buildMasterTimeline, type IdentDom } from './IdentTimeline';
import { HOLD, ident, markSeen, useIdent } from './identState';

// The DOM half of the intro ident: crisp wordmark and copy, the painted doors, the entry
// composition and its controls. Everything moves on the master timeline (IdentTimeline).

function Lotus() {
  return (
    <svg viewBox="-50 -50 100 100" className="motif" aria-hidden="true">
      {Array.from({ length: 8 }, (_, i) => (
        <ellipse key={i} cx="0" cy="-22" rx="9" ry="20" transform={`rotate(${i * 45})`} className="m-petal" />
      ))}
      {Array.from({ length: 8 }, (_, i) => (
        <ellipse key={`s${i}`} cx="0" cy="-15" rx="5" ry="11" transform={`rotate(${i * 45 + 22.5})`} className="m-petal2" />
      ))}
      <circle r="9" className="m-core" />
      <circle r="3.5" className="m-dot" />
    </svg>
  );
}

function Diamond() {
  return (
    <svg viewBox="-50 -30 100 60" className="motif" aria-hidden="true">
      <path d="M0 -24 L36 0 L0 24 L-36 0 Z" className="m-petal" />
      <path d="M0 -13 L19 0 L0 13 L-19 0 Z" className="m-core" />
      <circle r="3.5" className="m-dot" />
      <circle cx="-44" r="3" className="m-dot" />
      <circle cx="44" r="3" className="m-dot" />
    </svg>
  );
}

function Kalash() {
  return (
    <svg viewBox="-50 -50 100 100" className="motif" aria-hidden="true">
      <path d="M-16 -18 Q-26 -30 -8 -32 Q0 -46 8 -32 Q26 -30 16 -18 Z" className="m-leaf" />
      <circle cy="-30" r="8" className="m-coconut" />
      <path d="M-14 -16 H14 L12 -10 Q30 2 22 22 Q14 36 0 36 Q-14 36 -22 22 Q-30 2 -12 -10 Z" className="m-petal" />
      <path d="M-24 10 H24" className="m-band" />
      <circle cy="20" r="4" className="m-dot" />
    </svg>
  );
}

function DoorFace({ side }: { side: 'l' | 'r' }) {
  return (
    <div className={`door-face door-face-${side}`}>
      <div className="door-panel arch">
        <Lotus />
      </div>
      <div className="door-rail" />
      <div className="door-panel mid">
        <Diamond />
      </div>
      <div className="door-rail" />
      <div className="door-panel low">
        <Kalash />
      </div>
      <span className="door-ring" />
    </div>
  );
}

function Wordmark({ letters }: { letters: React.MutableRefObject<HTMLElement[]> }) {
  const chars = [...SITE.name];
  letters.current = [];
  return (
    <span className="wm-inner" aria-hidden="true">
      {chars.map((ch, i) => (
        <span key={i} className="wm-mask">
          <span className={`wm-ch ${ch === '.' && i === chars.length - 1 ? 'wm-dot' : ''}`} ref={(el) => void (el && letters.current.push(el))}>
            {ch === ' ' ? ' ' : ch}
          </span>
        </span>
      ))}
    </span>
  );
}

export function HowToPlay({ onClose }: { onClose: () => void }) {
  return (
    <div className="howto ident-howto" role="dialog" aria-label="How to play">
      <h3>Kaise khelein?</h3>
      <ol>
        <li>
          <b>Look around.</b> Drag to turn the mohalla all the way round. Scroll or pinch to zoom, right-drag or two fingers to slide.
        </li>
        <li>
          <b>Find the patakas.</b> Eight little cracker boxes are tucked into the neighbourhood. Watch for a warm glint.
        </li>
        <li>
          <b>Open and light.</b> Every box hides a different virtual cracker. Light it with a tap, or with a hand gesture if your camera is on.
        </li>
        <li>
          <b>Collect memories.</b> Each first show becomes a Polaroid. Fill your Diwali memory book and download it.
        </li>
      </ol>
      <p className="howto-note">Everything here is make-believe, so no real crackers are involved.</p>
      <button className="btn ghost" onClick={onClose}>
        Samajh gaya
      </button>
    </div>
  );
}

export function IdentOverlay() {
  const stage = useIdent((s) => s.stage);
  const nonce = useIdent((s) => s.nonce);
  const howTo = useGame((s) => s.ui.howTo);
  const setUi = useGame((s) => s.setUi);
  const [held, setHeld] = useState(false);

  const r = {
    cover: useRef<HTMLDivElement>(null!),
    brand: useRef<HTMLDivElement>(null!),
    brandSlot: useRef<HTMLDivElement>(null!),
    wordmark: useRef<HTMLHeadingElement>(null!),
    doorway: useRef<HTMLDivElement>(null!),
    doorL: useRef<HTMLDivElement>(null!),
    doorR: useRef<HTMLDivElement>(null!),
    toran: useRef<HTMLDivElement>(null!),
    scrim: useRef<HTMLDivElement>(null!),
    entry: useRef<HTMLDivElement>(null!),
    cta: useRef<HTMLButtonElement>(null!),
    controls: useRef<HTMLDivElement>(null!),
  };
  const letters = useRef<HTMLElement[]>([]);
  const domRef = useRef<IdentDom | null>(null);

  const dom = (): IdentDom => {
    const q = (sel: string, root: HTMLElement) => [...root.querySelectorAll<HTMLElement>(sel)];
    return {
      cover: r.cover.current,
      brand: r.brand.current,
      brandSlot: r.brandSlot.current,
      letters: letters.current,
      wordmark: r.wordmark.current,
      taglineWords: q('.tg-word', r.brand.current),
      rules: q('.tg-rule', r.brand.current),
      doorway: r.doorway.current,
      doors: [r.doorL.current, r.doorR.current],
      shades: q('.door-shade', r.doorway.current),
      toran: r.toran.current,
      scrim: r.scrim.current,
      steps: q('.ident-step', r.entry.current),
      cta: r.cta.current,
    };
  };

  const toHold = () => {
    useIdent.getState().setStage('hold');
    setHeld(true);
    window.setTimeout(() => r.cta.current?.focus({ preventScroll: true }), 30);
  };

  // build the timeline, wait for the 3D film to be ready, then play (or jump to the entry screen)
  useLayoutEffect(() => {
    const d = dom();
    domRef.current = d;
    const tl = buildMasterTimeline(d);
    ident.master = tl;
    setHeld(false);
    let raf = 0;
    const st = useIdent.getState();
    const reduced = useGame.getState().settings.reducedMotion;
    const film = st.play && !reduced;
    if (!film) {
      // reduced motion or a return visit: present the entry composition with a calm fade
      tl.seek(HOLD, true);
      gsap.fromTo(r.cover.current, { autoAlpha: 1 }, { autoAlpha: 0, duration: 0.6, ease: 'power1.out' });
      gsap.fromTo([r.brand.current, r.entry.current], { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.6, delay: 0.15, ease: 'power1.out' });
      toHold();
    } else {
      useIdent.getState().setStage('film');
      const start = () => {
        if (!ident.ready) {
          raf = requestAnimationFrame(start);
          return;
        }
        markSeen();
        tl.eventCallback('onComplete', toHold);
        tl.play(0);
      };
      start();
    }
    return () => {
      cancelAnimationFrame(raf);
      tl.kill();
      if (ident.master === tl) ident.master = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nonce]);

  // keep the held composition right when the window changes shape
  useEffect(() => {
    const onResize = () => {
      const d = domRef.current;
      if (!d || useIdent.getState().stage !== 'hold') return;
      const { y, s } = brandLift(d);
      gsap.set(d.brand, { y, scale: s });
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const skip = () => {
    const tl = ident.master;
    if (!tl) return;
    audio.tap();
    tl.pause();
    tl.seek(HOLD, true);
    toHold();
  };

  const replay = () => {
    audio.tap();
    setUi({ howTo: false });
    useIdent.getState().replay();
  };

  const enter = () => {
    const d = domRef.current;
    if (!d || useIdent.getState().stage !== 'hold') return;
    audio.tap();
    audio.identDoorsOpen(0.8);
    setUi({ howTo: false });
    useIdent.getState().setStage('exit');
    const reduced = useGame.getState().settings.reducedMotion;
    buildExitTimeline(d, r.controls.current, reduced).eventCallback('onComplete', () => useIdent.getState().setStage('off'));
    useGame.getState().setPhase('playing');
  };

  // Escape skips the film
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && useIdent.getState().stage === 'film') skip();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const words = SITE.tagline.split(' ');
  const filmUi = stage === 'film';
  return (
    <div className={`ident ident-${stage}`} aria-live="polite">
      <div className="ident-scrim" ref={r.scrim} />
      <div className="ident-doorway" ref={r.doorway} aria-hidden="true">
        <div className="door door-l" ref={r.doorL}>
          <DoorFace side="l" />
          <i className="door-shade" />
        </div>
        <div className="door door-r" ref={r.doorR}>
          <DoorFace side="r" />
          <i className="door-shade" />
        </div>
        <div className="toran" ref={r.toran} />
      </div>

      <div className="ident-layout">
        <div className="brand-slot" ref={r.brandSlot} />
        <div className="ident-entry" ref={r.entry}>
          <ol className="ident-steps">
            {SITE.steps.map((s, i) => (
              <li key={s} className="ident-step">
                <span className="n">{i + 1}</span>
                <span>{s}</span>
              </li>
            ))}
          </ol>
          <button className="btn cta ident-cta" ref={r.cta} onClick={enter} disabled={!held} tabIndex={held ? 0 : -1}>
            {SITE.enter}
          </button>
        </div>
      </div>

      <div className="ident-brand" ref={r.brand}>
        <div className="ident-brand-inner">
        <h1 className="wordmark" ref={r.wordmark} aria-label={SITE.name}>
          <Wordmark letters={letters} />
        </h1>
        <p className="ident-tagline">
          <i className="tg-rule" />
          <span>
            {words.map((w, i) => (
              <span key={i} className="tg-word">
                {w}
                {i < words.length - 1 ? ' ' : ''}
              </span>
            ))}
          </span>
          <i className="tg-rule" />
        </p>
        </div>
      </div>

      <div className="ident-cover" ref={r.cover} />

      <div className="ident-controls" ref={r.controls}>
        <SoundToggle labelled />
        <div className="ident-controls-end">
          {held && (
            <button className="btn ghost small" onClick={() => setUi({ howTo: !howTo })} aria-expanded={howTo}>
              How to play
            </button>
          )}
          {filmUi ? (
            <button className="btn ghost small" onClick={skip}>
              Skip intro
            </button>
          ) : (
            <button className="btn ghost small" onClick={replay} disabled={stage !== 'hold'}>
              Replay intro
            </button>
          )}
        </div>
      </div>
      {howTo && held && <HowToPlay onClose={() => setUi({ howTo: false })} />}
    </div>
  );
}
