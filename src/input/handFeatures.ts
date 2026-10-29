// Pure maths on MediaPipe hand landmarks. No DOM, no MediaPipe import, so the gesture
// detectors can be tested in Node with synthetic hands.

export interface P {
  x: number;
  y: number;
}

/** One tracked hand in one video frame. Coordinates are mirrored (selfie view) and
 *  x is scaled by the video aspect ratio, so distances are isotropic; y is 0 (top) to 1. */
export interface Hand {
  lm: P[]; // 21 landmarks
  palm: number; // wrist to middle-finger knuckle, the unit for every distance threshold
  open: boolean; // four fingers extended
  fist: boolean; // four fingers curled
  point: boolean; // only the index finger extended
  pinch: number; // thumb tip to index tip, in palm units
  wrist: P;
  tip: P; // index fingertip
  pinchPt: P; // midpoint of thumb and index tips
}

export interface Frame {
  t: number; // seconds
  aspect: number; // video width / height, so x spans 0..aspect
  hands: Hand[];
}

const TIPS = [8, 12, 16, 20];
const PIPS = [6, 10, 14, 18];

export const dist = (a: P, b: P) => Math.hypot(a.x - b.x, a.y - b.y);
const mid = (a: P, b: P): P => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

/** How far each finger reaches compared with its middle joint: above ~1.15 is straight,
 *  below ~1 is curled. Measured from the wrist so it works at any hand rotation. */
function reach(lm: P[]) {
  const w = lm[0];
  return TIPS.map((t, i) => dist(w, lm[t]) / Math.max(1e-6, dist(w, lm[PIPS[i]])));
}

export function describeHand(lm: P[]): Hand {
  const palm = Math.max(1e-6, dist(lm[0], lm[9]));
  const r = reach(lm);
  const pinch = dist(lm[4], lm[8]) / palm;
  return {
    lm,
    palm,
    open: r.every((v) => v > 1.08) && r.reduce((a, v) => a + v, 0) / 4 > 1.15 && pinch > 0.3,
    fist: r.every((v) => v < 1.02),
    point: r[0] > 1.2 && r[1] < 1.05 && r[2] < 1.05 && r[3] < 1.08,
    pinch,
    wrist: lm[0],
    tip: lm[8],
    pinchPt: mid(lm[4], lm[8]),
  };
}
