import gsap from 'gsap';
import { audio } from '../audio/AudioEngine';
import { identLayout } from './identLayout';
import { FX_T } from './IdentParticles';
import { HOLD, ident, MARK } from './identState';

// The one deterministic master timeline for the ident. It drives the 3D proxies in `ident`
// (camera moves, lights, lamps, rocket) and the DOM overlay (wordmark, doors, entry copy).

export interface IdentDom {
  cover: HTMLElement;
  brand: HTMLElement;
  brandSlot: HTMLElement;
  letters: HTMLElement[];
  wordmark: HTMLElement;
  taglineWords: HTMLElement[];
  rules: HTMLElement[];
  doorway: HTMLElement;
  doors: [HTMLElement, HTMLElement];
  shades: HTMLElement[];
  toran: HTMLElement;
  scrim: HTMLElement;
  steps: HTMLElement[];
  cta: HTMLElement;
}

/** Where the wordmark settles in the entry composition, relative to its centred position. */
export function brandLift(dom: IdentDom) {
  const slot = dom.brandSlot.getBoundingClientRect();
  const h = (dom.brand.firstElementChild as HTMLElement | null)?.offsetHeight || 1;
  const s = Math.min(1, Math.max(0.45, slot.height / h));
  const y = slot.top + slot.height / 2 - window.innerHeight / 2;
  return { y, s };
}

/** Door leaves stay ajar while the entry composition holds. */
export const DOOR_AJAR = 64;

export function buildMasterTimeline(dom: IdentDom) {
  const L = identLayout();
  const F = L.zF;
  const tl = gsap.timeline({ paused: true });
  (Object.keys(MARK) as (keyof typeof MARK)[]).forEach((k) => tl.addLabel(k, MARK[k]));
  tl.addLabel('HOLD', HOLD);
  const cue = (fn: () => void, at: number) => tl.call(fn, undefined, at);

  // ---------------------------------------------------------------- BUILDING_REVEAL
  tl.fromTo(dom.cover, { autoAlpha: 1 }, { autoAlpha: 0, duration: 0.42, ease: 'power1.out' }, MARK.BUILDING_REVEAL);
  tl.fromTo(ident, { world: 0.38 }, { world: 1, duration: 1.25, ease: 'sine.inOut' }, 0);
  tl.fromTo(ident.key, { i: 0, x: -6.3, y: 4.9, z: F + 2.8 }, { i: 9, duration: 0.5, ease: 'power2.out' }, 0);
  tl.fromTo(ident.shot, { s1: 0 }, { s1: 1, duration: 0.86, ease: 'power1.inOut' }, 0);
  cue(() => audio.identBed(), 0);
  for (let i = 0; i < 7; i++) cue(() => audio.snap(), 0.04 + i * 0.075);

  // ---------------------------------------------------------------- WINDOW_STORIES
  const keys = ['a', 'b', 'c'] as const;
  tl.set(ident.lamp, { a: 0, b: 0, c: 0 }, 0);
  L.windows.forEach((w, i) => {
    tl.to(ident.lamp, { [keys[i]]: 1, duration: 0.14, ease: 'power2.out' }, w.light);
    cue(() => audio.identWindow(i), w.light);
  });
  cue(() => audio.ting(), L.windows[2].light + 0.12);
  // push into window C's medallion
  tl.fromTo(ident.shot, { p1: 0 }, { p1: 1, duration: 0.14, ease: 'power2.in' }, 0.86);

  // ---------------------------------------------------------------- PATAKA_TRANSITION
  const CS = L.chakriStart;
  const AN = L.anaar;
  const RB = L.rocketBase;
  tl.set(ident.key, { i: 5, x: CS.x, y: CS.y + 0.6, z: CS.z + 0.4 }, MARK.PATAKA_TRANSITION);
  tl.fromTo(ident.shot, { s2: 0 }, { s2: 1, duration: 1.0, ease: 'sine.inOut' }, MARK.PATAKA_TRANSITION);
  tl.to(ident.key, { x: AN.x, y: AN.y + 1.0, z: AN.z + 0.5, duration: 0.4, ease: 'sine.inOut' }, 1.08);
  tl.to(ident.key, { i: 11, duration: 0.16, ease: 'power2.out' }, FX_T.anaar[0]);
  tl.to(ident.key, { x: RB.x, y: RB.y + 0.7, z: RB.z + 0.6, duration: 0.5, ease: 'sine.inOut' }, 1.55);
  cue(() => audio.whir(0.65), FX_T.chakri[0]);
  cue(() => audio.hiss(1.1, 3600, 0.08), FX_T.anaar[0]);
  cue(() => audio.crackle(0.15, 40, 0.04), FX_T.fuse[0]);

  // ---------------------------------------------------------------- ROCKET_ASCENT
  tl.fromTo(ident.rocket, { u: 0 }, { u: 1, duration: FX_T.rocket[1] - FX_T.rocket[0], ease: 'power2.out' }, FX_T.rocket[0]);
  tl.fromTo(ident.shot, { s3: 0 }, { s3: 1, duration: 1.0, ease: 'power1.inOut' }, MARK.ROCKET_ASCENT);
  tl.to(ident.key, { i: 0, duration: 0.5, ease: 'power1.in' }, 2.1);
  // the mohalla sinks into a rich indigo sky, leaving room for the brand
  tl.to(ident, { world: 0.55, duration: 0.8, ease: 'sine.inOut' }, 2.2);
  cue(() => audio.identRocket(0.9), FX_T.rocket[0]);

  // ---------------------------------------------------------------- BRAND_REVEAL
  tl.fromTo(ident.shot, { s4: 0 }, { s4: 1, duration: 1.0, ease: 'sine.inOut' }, MARK.BRAND_REVEAL);
  cue(() => audio.identBurst(), FX_T.burst);
  tl.fromTo(dom.letters, { yPercent: 118, autoAlpha: 0 }, { yPercent: 0, autoAlpha: 1, duration: 0.42, ease: 'power3.out', stagger: 0.045 }, 3.18);
  tl.fromTo(dom.letters, { '--sheen': '-40%' }, { '--sheen': '140%', duration: 0.6, ease: 'power2.inOut', stagger: 0.05 }, 3.5);
  tl.fromTo(dom.rules, { scaleX: 0 }, { scaleX: 1, duration: 0.5, ease: 'power3.out' }, 3.5);
  tl.fromTo(dom.taglineWords, { y: 10, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.4, ease: 'power2.out', stagger: 0.04 }, 3.45);

  // ---------------------------------------------------------------- WORLD_ENTRY
  tl.fromTo(ident.shot, { s5: 0 }, { s5: 1, duration: 0.5, ease: 'power2.in' }, MARK.WORLD_ENTRY);
  tl.fromTo(ident, { fx: 1 }, { fx: 0, duration: 0.3, ease: 'power1.in' }, 4.12);
  tl.to(ident, { world: 1, duration: 0.4, ease: 'sine.inOut' }, 4.05);
  tl.fromTo(dom.brand, { y: 0, scale: 1 }, { y: () => brandLift(dom).y, scale: () => brandLift(dom).s, duration: 0.75, ease: 'power3.inOut' }, 4.05);
  tl.fromTo(dom.doorway, { autoAlpha: 0, scale: 1.3 }, { autoAlpha: 1, scale: 1, duration: 0.28, ease: 'power2.out' }, 4.17);
  tl.fromTo(dom.toran, { yPercent: -115 }, { yPercent: 0, duration: 0.36, ease: 'back.out(1.4)' }, 4.3);
  tl.fromTo(dom.doors[0], { rotationY: 0 }, { rotationY: -DOOR_AJAR, duration: 0.45, ease: 'power3.inOut' }, 4.55);
  tl.fromTo(dom.doors[1], { rotationY: 0 }, { rotationY: DOOR_AJAR, duration: 0.45, ease: 'power3.inOut' }, 4.55);
  tl.fromTo(dom.shades, { autoAlpha: 0 }, { autoAlpha: 0.5, duration: 0.45, ease: 'power2.in' }, 4.55);
  tl.fromTo(dom.scrim, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.5, ease: 'power1.out' }, 4.5);
  tl.fromTo(dom.steps, { y: 14, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.35, ease: 'power2.out', stagger: 0.06 }, 4.6);
  tl.fromTo(dom.cta, { y: 12, autoAlpha: 0, scale: 0.96 }, { y: 0, autoAlpha: 1, scale: 1, duration: 0.34, ease: 'back.out(1.6)' }, 4.66);
  cue(() => audio.whoosh(0.45), 4.05);
  cue(() => audio.identDoorsClose(), 4.44);
  cue(() => audio.identDoorsOpen(0.5), 4.56);

  tl.set({}, {}, HOLD);
  return tl;
}

/** Entering the mohalla: the doors swing all the way open and the overlay dissolves into play. */
export function buildExitTimeline(dom: IdentDom, controls: HTMLElement, reduced: boolean) {
  const tl = gsap.timeline();
  if (reduced) {
    tl.to([dom.doorway, dom.brand, dom.scrim, dom.steps, dom.cta, controls], { autoAlpha: 0, duration: 0.35, ease: 'power1.out' }, 0);
    return tl;
  }
  tl.to(dom.doors[0], { rotationY: -104, duration: 1.0, ease: 'power2.inOut' }, 0);
  tl.to(dom.doors[1], { rotationY: 104, duration: 1.0, ease: 'power2.inOut' }, 0);
  tl.to(dom.shades, { autoAlpha: 0.85, duration: 0.8 }, 0);
  tl.to(dom.doorway, { scale: 1.4, duration: 1.0, ease: 'power2.in' }, 0.05);
  tl.to(dom.doorway, { autoAlpha: 0, duration: 0.45, ease: 'power1.in' }, 0.6);
  tl.to(dom.toran, { yPercent: -125, duration: 0.5, ease: 'power2.in' }, 0);
  tl.to([dom.cta, ...dom.steps], { y: 12, autoAlpha: 0, duration: 0.3, ease: 'power1.in', stagger: 0.03 }, 0);
  tl.to(dom.brand, { autoAlpha: 0, y: '-=18', duration: 0.45, ease: 'power1.in' }, 0.1);
  tl.to([dom.scrim, controls], { autoAlpha: 0, duration: 0.5, ease: 'power1.inOut' }, 0.1);
  return tl;
}
