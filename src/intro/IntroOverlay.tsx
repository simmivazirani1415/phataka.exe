import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { SITE } from '../config/site';
import { useGame } from '../game/GameState';
import { runtime } from '../game/Runtime';
import { audio } from '../audio/AudioEngine';
import { levelState, START } from '../street/StreetLayout';
import { IconSoundOff, IconSoundOn } from '../components/Icons';
import { useIntro } from './introState';

// The entrance. The intro film plays edge to edge while the real mohalla warms up behind it,
// with the camera already standing at the head of the gali looking in, the way the film's last
// shot looks through the doors. As the doors finish opening the film dissolves from the
// doorway outward into the live street, which settles under a soft blur for the welcome:
// the BOMBASTIC logo, three steps and one button. Entering clears the blur and
// walks the camera a few steps into the gali, then hands over the controls.

const BASE = import.meta.env.BASE_URL;
/** VP9 where it plays (smaller), H.264 everywhere else. */
function videoSrc() {
  const v = document.createElement('video');
  const webm = v.canPlayType('video/webm; codecs="vp9, opus"') === 'probably';
  return `${BASE}assets/intro/bombastic_intro.${webm ? 'webm' : 'mp4'}`;
}
const POSTER = `${BASE}assets/intro/intro_first.jpg`;
const STILL = `${BASE}assets/intro/intro_last.jpg`;
const LOGO = `${BASE}assets/intro/bombastic_logo.webp`;

/** automated checks step the timelines by hand */
const DEBUG = new URLSearchParams(location.search).has('debug');
/** Start the dissolve this long before the film ends, while the doors are still moving. */
const LEAD = 0.45;
/** Blur on the world behind the welcome, in px. */
const BLUR = 6;
/** Give up on a film that has not started playing by then. */
const STALL_MS = 9000;

const IconArrow = () => (
  <svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);

const STEP_ART = ['find', 'light', 'memory'].map((n) => `${BASE}assets/intro/steps/${n}.webp`);
const STEPS = SITE.steps.map((text, i) => ({ art: STEP_ART[i], text }));

/** A cusped Mughal-arch cartouche: a dome over the art, points at the sides and the foot. */
const BADGE =
  'M6 131 A30 30 0 0 1 44 96 A34 34 0 0 1 80 58 A48 48 0 0 1 146 40 A84 84 0 0 1 294 40 A48 48 0 0 1 360 58 A34 34 0 0 1 396 96 A30 30 0 0 1 434 131 A30 30 0 0 1 396 166 A34 34 0 0 1 360 204 A50 50 0 0 1 292 224 A80 80 0 0 1 220 256 A80 80 0 0 1 148 224 A50 50 0 0 1 80 204 A34 34 0 0 1 44 166 A30 30 0 0 1 6 131 Z';

function Badge() {
  return (
    <svg className="intro-badge" viewBox="0 0 440 262" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id="ib-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#8E1F4A" />
          <stop offset="1" stopColor="#5E1236" />
        </linearGradient>
      </defs>
      <path d={BADGE} fill="url(#ib-fill)" stroke="#F6B53A" strokeWidth="5" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
      <path d={BADGE} fill="none" stroke="#FFD27A" strokeOpacity="0.45" strokeWidth="1.5" vectorEffect="non-scaling-stroke" transform="translate(220 131) scale(0.95 0.91) translate(-220 -131)" />
    </svg>
  );
}

/** A string of fairy lights sagging between two cards. */
function Garland() {
  const pts = Array.from({ length: 9 }, (_, i) => {
    const t = i / 8;
    return [6 + t * 108, 8 + Math.sin(t * Math.PI) * 12];
  });
  return (
    <svg className="intro-garland" viewBox="0 0 120 30" aria-hidden="true">
      <path d="M2 8 Q60 32 118 8" fill="none" stroke="#F6B53A" strokeOpacity="0.8" strokeWidth="1.6" />
      {pts.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="3.2" fill="#FFD983" />
      ))}
    </svg>
  );
}

/** Little burst marks either side of the button and the outer cards. */
function Splash({ side }: { side: 'l' | 'r' }) {
  return (
    <svg className={`intro-splash intro-splash-${side}`} viewBox="0 0 60 70" aria-hidden="true">
      <path d="M40 6 L52 26 L45 28 Z" fill="#F6B53A" />
      <path d="M8 30 L44 36 L42 43 Z" fill="#F08A2C" />
      <path d="M14 62 L44 48 L46 55 Z" fill="#F6B53A" />
    </svg>
  );
}

/** The world canvas's soft-focus treatment, driven as one proxy so GSAP can tween it. */
const soft = { blur: 0, dim: 1 };
function applySoft() {
  const root = document.documentElement;
  root.classList.toggle('world-soft', soft.blur > 0.05 || soft.dim < 0.995);
  root.style.setProperty('--world-blur', `${soft.blur.toFixed(2)}px`);
  root.style.setProperty('--world-dim', soft.dim.toFixed(3));
  root.style.setProperty('--world-blur-n', soft.blur.toFixed(2));
}

export function IntroOverlay() {
  const stage = useIntro((s) => s.stage);
  const nonce = useIntro((s) => s.nonce);
  const [needsTap, setNeedsTap] = useState(false);
  const [videoSound, setVideoSound] = useState(false);
  const [src] = useState(videoSrc);
  const r = {
    film: useRef<HTMLDivElement>(null!),
    video: useRef<HTMLVideoElement>(null!),
    haze: useRef<HTMLDivElement>(null!),
    scrim: useRef<HTMLDivElement>(null!),
    welcome: useRef<HTMLDivElement>(null!),
    logo: useRef<HTMLDivElement>(null!),
    steps: useRef<HTMLOListElement>(null!),
    cta: useRef<HTMLButtonElement>(null!),
    ctaWrap: useRef<HTMLDivElement>(null!),
    controls: useRef<HTMLDivElement>(null!),
  };
  const tl = useRef<gsap.core.Timeline | null>(null);
  const raf = useRef(0);

  /** Dissolve the film into the live mohalla and bring the welcome in over it. */
  const toWorld = () => {
    const intro = useIntro.getState();
    if (intro.stage !== 'VIDEO_PLAYING') return;
    intro.setStage('TRANSITIONING_TO_WORLD');
    setNeedsTap(false);
    const reduced = useGame.getState().settings.reducedMotion;
    // the street must have drawn a few frames; until then the film holds its last frame
    const go = () => {
      if (runtime.frames < 4) {
        raf.current = requestAnimationFrame(go);
        return;
      }
      tl.current?.kill();
      const t = gsap.timeline({ onUpdate: applySoft });
      tl.current = t;
      if (DEBUG) (window as unknown as Record<string, unknown>).__introTl = t;
      const steps = [...r.steps.current.children];
      if (reduced) {
        t.set(soft, { blur: BLUR, dim: 0.88 }, 0);
        t.to(r.film.current, { autoAlpha: 0, duration: 0.45, ease: 'power1.out' }, 0);
        t.to(r.haze.current, { autoAlpha: 0.14, duration: 0.45 }, 0);
        t.to(r.scrim.current, { autoAlpha: 1, duration: 0.45 }, 0);
        t.fromTo([r.logo.current, ...steps, r.ctaWrap.current], { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.4 }, 0.15);
        t.call(() => useIntro.getState().setStage('WELCOME_VISIBLE'), [], 0.15);
        return;
      }
      // the world comes up a touch softer than it settles, so the seam stays gentle
      t.fromTo(soft, { blur: BLUR + 4, dim: 0.95 }, { blur: BLUR, dim: 0.86, duration: 1.5, ease: 'power2.out' }, 0);
      // warm light spilling out of the doorway, as in the film, cooling into the night street
      t.fromTo(r.haze.current, { autoAlpha: 0 }, { autoAlpha: 0.62, duration: 0.25, ease: 'power1.out' }, 0);
      t.to(r.haze.current, { autoAlpha: 0.14, duration: 1.2, ease: 'power2.inOut' }, 0.35);
      // the doorway opens first, then the doors themselves dissolve outward
      t.fromTo(r.film.current, { '--hole': 0 }, { '--hole': 1.6, duration: 1.15, ease: 'power2.inOut' }, 0.05);
      t.to(r.film.current, { autoAlpha: 0, duration: 0.55, ease: 'power1.in' }, 0.7);
      t.to(r.scrim.current, { autoAlpha: 1, duration: 0.8, ease: 'power1.out' }, 0.5);
      // the welcome: logo, the steps in a quick stagger, then the button
      t.fromTo(r.logo.current, { autoAlpha: 0, y: 18, scale: 0.96 }, { autoAlpha: 1, y: 0, scale: 1, duration: 0.55, ease: 'power3.out' }, 0.75);
      t.fromTo(steps, { autoAlpha: 0, y: 10 }, { autoAlpha: 1, y: 0, duration: 0.4, ease: 'power2.out', stagger: 0.085 }, 1.0);
      t.fromTo(r.ctaWrap.current, { autoAlpha: 0, y: 10 }, { autoAlpha: 1, y: 0, duration: 0.4, ease: 'power2.out' }, 1.22);
      // the button works as soon as the welcome starts to appear
      t.call(() => useIntro.getState().setStage('WELCOME_VISIBLE'), [], 0.75);
    };
    go();
  };

  // put the camera at the head of the gali, start the film, and wire its events
  useLayoutEffect(() => {
    const v = r.video.current;
    useIntro.getState().setStage('VIDEO_PLAYING');
    setNeedsTap(false);
    gsap.set([r.logo.current, ...r.steps.current.children, r.ctaWrap.current, r.scrim.current, r.haze.current], { autoAlpha: 0 });
    gsap.set(r.film.current, { autoAlpha: 1, '--hole': 0 });
    gsap.set(r.controls.current, { autoAlpha: 1 });
    soft.blur = 0;
    soft.dim = 1;
    applySoft();
    levelState.id = 'street';
    runtime.camera?.teleport({ x: START.x, z: START.z, yaw: START.yaw, pitch: 0, floor: 0 });

    const reduced = useGame.getState().settings.reducedMotion;
    if (reduced) {
      // no film: the doorway's last frame, then a calm fade to the welcome
      toWorld();
      return () => {
        cancelAnimationFrame(raf.current);
        tl.current?.kill();
      };
    }

    let started = false;
    const onTime = () => {
      if (v.duration && v.currentTime >= v.duration - LEAD) toWorld();
    };
    const onPlaying = () => {
      started = true;
      setNeedsTap(false);
    };
    const onFail = () => toWorld();
    v.addEventListener('timeupdate', onTime);
    v.addEventListener('ended', onFail);
    v.addEventListener('error', onFail);
    v.addEventListener('playing', onPlaying);
    const stall = window.setTimeout(() => {
      if (!started) toWorld();
    }, STALL_MS);

    v.currentTime = 0;
    // with sound where the browser allows it, otherwise muted; blocked entirely: ask for a tap
    v.muted = false;
    v.play()
      .then(() => setVideoSound(true))
      .catch(() => {
        v.muted = true;
        setVideoSound(false);
        return v.play().catch(() => setNeedsTap(true));
      });

    return () => {
      window.clearTimeout(stall);
      v.removeEventListener('timeupdate', onTime);
      v.removeEventListener('ended', onFail);
      v.removeEventListener('error', onFail);
      v.removeEventListener('playing', onPlaying);
      v.pause();
      cancelAnimationFrame(raf.current);
      tl.current?.kill();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nonce]);

  // leaving the intro always clears the world's soft focus
  useEffect(
    () => () => {
      soft.blur = 0;
      soft.dim = 1;
      applySoft();
    },
    [],
  );

  const playTapped = () => {
    const v = r.video.current;
    v.muted = false;
    setVideoSound(true);
    v.play().then(() => setNeedsTap(false)).catch(() => toWorld());
  };

  const toggleVideoSound = () => {
    const v = r.video.current;
    v.muted = !v.muted;
    setVideoSound(!v.muted);
  };

  const skip = () => {
    audio.tap();
    r.video.current.pause();
    toWorld();
  };

  // Escape skips the film; Enter on the welcome is the button's own
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && useIntro.getState().stage === 'VIDEO_PLAYING') skip();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  const enter = () => {
    const intro = useIntro.getState();
    if (intro.stage !== 'WELCOME_VISIBLE') return;
    intro.setStage('ENTERING_WORLD');
    audio.tap();
    audio.identDoorsOpen(0.8);
    const reduced = useGame.getState().settings.reducedMotion;
    tl.current?.kill();
    const t = gsap.timeline({
      onUpdate: applySoft,
      onComplete: () => {
        applySoft();
        useGame.getState().setPhase('playing');
        useIntro.getState().setStage('GAMEPLAY_ACTIVE');
        // straight into "where to?": the five places as cards in the middle of the screen
        useGame.getState().setUi({ map: true });
      },
    });
    tl.current = t;
    if (DEBUG) (window as unknown as Record<string, unknown>).__introTl = t;
    const dur = reduced ? 0.45 : 1.25;
    const ui = [r.logo.current, ...r.steps.current.children, r.ctaWrap.current];
    t.to(ui, { autoAlpha: 0, y: reduced ? 0 : -10, duration: 0.32, ease: 'power1.in', stagger: reduced ? 0 : 0.025 }, 0);
    t.to([r.scrim.current, r.haze.current, r.controls.current], { autoAlpha: 0, duration: 0.5, ease: 'power1.out' }, 0.1);
    t.to(soft, { blur: 0, dim: 1, duration: dur * 0.8, ease: 'power2.out' }, 0.05);
    t.set({}, {}, dur);
    // a few steps into the chowk, with the controls still held until the walk is done
    void runtime.camera?.travel({ x: START.x + (reduced ? 0.5 : 3.5), z: START.z, yaw: START.yaw, pitch: 0, floor: 0 }, dur);
  };

  const filmUp = stage === 'VIDEO_PLAYING';
  const welcome = stage === 'WELCOME_VISIBLE' || stage === 'ENTERING_WORLD';
  return (
    <div className={`intro intro-${stage.toLowerCase()}`}>
      <div className="intro-haze" ref={r.haze} aria-hidden="true" />
      <div className="intro-scrim" ref={r.scrim} aria-hidden="true" />
      <div className="intro-film" ref={r.film} aria-hidden={!filmUp}>
        <video ref={r.video} className="intro-video" src={src} poster={useGame.getState().settings.reducedMotion ? STILL : POSTER} playsInline preload="auto" muted />
      </div>

      <div className="intro-welcome" ref={r.welcome} aria-hidden={!welcome}>
        <div className="intro-logo" ref={r.logo}>
          <img src={LOGO} alt={SITE.name} draggable={false} />
        </div>
        <ol className="intro-steps" ref={r.steps}>
          {STEPS.map((s, i) => (
            <li key={s.text} className="intro-step">
              <Badge />
              <img className="intro-step-art" src={s.art} alt="" draggable={false} />
              <span className="intro-step-n">0{i + 1}</span>
              <span className="intro-step-text">{s.text}</span>
              {i < STEPS.length - 1 && <Garland />}
              {i === 0 && <Splash side="l" />}
              {i === STEPS.length - 1 && <Splash side="r" />}
            </li>
          ))}
        </ol>
        <div className="intro-cta-wrap" ref={r.ctaWrap}>
          <Splash side="l" />
          <button className="intro-cta" ref={r.cta} onClick={enter} disabled={stage !== 'WELCOME_VISIBLE'} tabIndex={welcome ? 0 : -1}>
            {SITE.enter}
            <IconArrow />
          </button>
          <Splash side="r" />
        </div>
      </div>

      {needsTap && filmUp && (
        <button className="intro-play" onClick={playTapped}>
          Play the intro
        </button>
      )}

      <div className="intro-controls" ref={r.controls}>
        {filmUp && (
          <>
            <button className="intro-chip icon" onClick={toggleVideoSound} aria-pressed={videoSound} aria-label={videoSound ? 'Mute the intro' : 'Play the intro with sound'}>
              {videoSound ? <IconSoundOn size={18} /> : <IconSoundOff size={18} />}
            </button>
            <button className="intro-chip" onClick={skip}>
              Skip intro
            </button>
          </>
        )}
      </div>
    </div>
  );
}
