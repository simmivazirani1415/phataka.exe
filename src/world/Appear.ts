import { PHASES } from './BlockBuilder';

/** Assembly helper for non-instanced objects: 0 before `delay`, overshooting pop to 1 after. */
export function appearScale(delay: number, t: number, dur = 0.55) {
  const k = Math.min(1, Math.max(0, (t - delay) / dur));
  if (k <= 0) return 0;
  const c1 = 1.5;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2);
}

/** Stagger within the props phase by x position, so things pop in sweeping across the platform. */
export function propDelay(x: number, spread = 0) {
  const [a, b] = PHASES.props;
  return a + ((x + 24) / 48) * (b - a) + spread;
}
