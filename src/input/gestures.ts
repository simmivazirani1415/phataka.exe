import type { PackageId } from '../assets/AssetRegistry';
import { dist, type Frame, type Hand, type P } from './handFeatures';

// One gesture per cracker, each acting out how that cracker is really lit or what it does.
// Only the open box's detector runs, so they never compete with each other.
// A detector is fed every frame and returns progress 0..1. The thresholds are forgiving on
// purpose: a motion that goes roughly the right way lights the cracker (the tracker fires at
// 0.85), so the hand and the burst feel connected.

export interface Detector {
  update: (f: Frame) => number;
  reset: () => void;
}

export interface GestureInfo {
  icon: string;
  title: string;
  how: string;
  /** the two beats of the motion, shown as the live prompt: start it, then finish it */
  steps: [string, string];
}

export const GESTURE_INFO: Record<PackageId, GestureInfo> = {
  bomb_wale_chacha: { icon: '🤏', title: 'Agarbatti to the fuse', how: 'Pinch thumb and index like holding an agarbatti, hold, then let go and pull back.', steps: ['Pinch thumb and finger together', 'Now let go!'] },
  rocket_bua: { icon: '✊', title: 'Launch from the bottle', how: 'Make a fist, then burst it open upward. Whoosh.', steps: ['Make a fist', 'Now open it up!'] },
  chakri_dadi: { icon: '☝️', title: 'Spin the chakri', how: 'Point your index finger and draw a big circle in the air.', steps: ['Point one finger', 'Draw a circle in the air'] },
  phuljhadi_mami: { icon: '✊', title: 'Twirl the phuljhadi', how: 'Hold the phuljhadis in your fist and twirl your hand in circles, like drawing with light.', steps: ['Hold them up in your hand', 'Twirl your hand in circles'] },
  anaar_maasi: { icon: '🔺', title: 'Make the anaar cone', how: 'Join both index fingertips at the top and rest your thumbs on each other below, palms apart: a triangle. Hold it.', steps: ['Both hands up, palms apart', 'Fingertips together, thumbs together'] },
  ladi_tauji: { icon: '👋', title: 'Run the fuse down the ladi', how: 'Open palm, swipe across the screen along the string.', steps: ['Show your open hand', 'Swipe it across'] },
  saat_shot_nana: { icon: '🖐️', title: 'Send them up', how: 'Open palm, raise it slowly upward and the seven shots follow.', steps: ['Show your open hand', 'Raise it up'] },
  pop_pop_chotu: { icon: '⚾', title: 'Throw the pop-pop', how: 'Hold it up like a ball, then throw it forward and let go.', steps: ['Hold it up like a ball', 'Throw it and let go!'] },
};

/** The hand the player is gesturing with; the tracker keeps it first across frames. */
const main = (f: Frame): Hand | undefined => f.hands[0];

/** Keeps a short time window of samples. */
class Trail<T> {
  items: { t: number; v: T }[] = [];
  constructor(private span: number) {}
  push(t: number, v: T) {
    this.items.push({ t, v });
    while (this.items.length && t - this.items[0].t > this.span) this.items.shift();
  }
  clear() {
    this.items = [];
  }
}

const LOST = 0.35; // seconds a hand or pose may drop out before a gesture resets

// Bomb: pinch (hold the agarbatti) for a moment, then release.
function bomb(): Detector {
  let since = -1;
  let armedAt = -1;
  let seen = -1;
  return {
    reset: () => ((since = -1), (armedAt = -1), (seen = -1)),
    update(f) {
      const h = main(f);
      if (!h) {
        if (seen >= 0 && f.t - seen > LOST) since = armedAt = -1;
        return armedAt >= 0 ? 0.7 : 0;
      }
      seen = f.t;
      if (h.pinch < 0.25) {
        if (since < 0) since = f.t;
        const held = f.t - since;
        if (held >= 0.22) armedAt = f.t;
        return Math.min(held / 0.22, 1) * 0.7;
      }
      since = -1;
      if (armedAt >= 0 && h.pinch > 0.36) {
        if (f.t - armedAt < 1.5) return 1;
        armedAt = -1;
      }
      return armedAt >= 0 ? 0.7 : 0;
    },
  };
}

// Rocket: hold a fist, then open it (the launch). Moving up while opening is natural but optional.
function rocket(): Detector {
  let fistSince = -1;
  let lastFist = -1;
  return {
    reset: () => ((fistSince = -1), (lastFist = -1)),
    update(f) {
      const h = main(f);
      if (h?.fist) {
        if (fistSince < 0) fistSince = f.t;
        lastFist = f.t;
        return Math.min((f.t - fistSince) / 0.15, 1) * 0.5;
      }
      const armed = fistSince >= 0 && lastFist - fistSince >= 0.15;
      if (armed && f.t - lastFist < 0.9) {
        // the fingers starting to open is enough: no need for a perfectly flat palm
        if (h && !h.fist) return 1;
        return 0.5;
      }
      fistSince = lastFist = -1;
      return 0;
    },
  };
}

// Chakri: the pointing fingertip sweeps most of a circle around its own centre.
function chakri(): Detector {
  const path = new Trail<P>(1.8);
  let lastPoint = -1;
  return {
    reset: () => (path.clear(), (lastPoint = -1)),
    update(f) {
      const h = main(f);
      if (h?.point) {
        lastPoint = f.t;
        path.push(f.t, h.tip);
      } else if (f.t - lastPoint > LOST) path.clear();
      const pts = path.items.map((i) => i.v);
      if (pts.length < 6 || !h) return 0;
      const c = pts.reduce((a, p) => ({ x: a.x + p.x / pts.length, y: a.y + p.y / pts.length }), { x: 0, y: 0 });
      const radius = pts.reduce((a, p) => a + dist(p, c), 0) / pts.length;
      if (radius < 0.3 * h.palm) return 0; // a wiggle, not a circle
      const w = Math.max(...pts.map((p) => p.x)) - Math.min(...pts.map((p) => p.x));
      const ht = Math.max(...pts.map((p) => p.y)) - Math.min(...pts.map((p) => p.y));
      if (Math.min(w, ht) < 0.28 * Math.max(w, ht)) return 0; // a line, not a circle
      let sweep = 0;
      for (let i = 1; i < pts.length; i++) {
        let d = Math.atan2(pts[i].y - c.y, pts[i].x - c.x) - Math.atan2(pts[i - 1].y - c.y, pts[i - 1].x - c.x);
        if (d > Math.PI) d -= 2 * Math.PI;
        if (d < -Math.PI) d += 2 * Math.PI;
        sweep += d;
      }
      return Math.min(Math.abs(sweep) / (1.1 * Math.PI), 1);
    },
  };
}

// Phuljhadi: the hand holding the sticks (a fist, a pinch, or just the hand) twirls in a circle.
// Tracked at the middle knuckle, which stays put whatever the fingers do.
function phuljhadi(): Detector {
  const path = new Trail<P>(1.9);
  let seen = -1;
  return {
    reset: () => (path.clear(), (seen = -1)),
    update(f) {
      const h = main(f);
      if (h) {
        seen = f.t;
        path.push(f.t, h.lm[9]);
      } else if (f.t - seen > LOST) path.clear();
      const pts = path.items.map((i) => i.v);
      if (pts.length < 6 || !h) return 0;
      const c = pts.reduce((a, p) => ({ x: a.x + p.x / pts.length, y: a.y + p.y / pts.length }), { x: 0, y: 0 });
      const radius = pts.reduce((a, p) => a + dist(p, c), 0) / pts.length;
      if (radius < 0.25 * h.palm) return 0; // holding still, not twirling yet
      const w = Math.max(...pts.map((p) => p.x)) - Math.min(...pts.map((p) => p.x));
      const ht = Math.max(...pts.map((p) => p.y)) - Math.min(...pts.map((p) => p.y));
      if (Math.min(w, ht) < 0.25 * Math.max(w, ht)) return 0.15; // a wave, not a twirl
      let sweep = 0;
      for (let i = 1; i < pts.length; i++) {
        let d = Math.atan2(pts[i].y - c.y, pts[i].x - c.x) - Math.atan2(pts[i - 1].y - c.y, pts[i - 1].x - c.x);
        if (d > Math.PI) d -= 2 * Math.PI;
        if (d < -Math.PI) d += 2 * Math.PI;
        sweep += d;
      }
      return Math.min(Math.abs(sweep) / (1.2 * Math.PI), 1);
    },
  };
}

// Anaar: both hands form a triangle, thumbs touching at the base and index tips at the top.
function anaar(): Detector {
  let since = -1;
  let last = -1;
  return {
    reset: () => ((since = -1), (last = -1)),
    update(f) {
      if (f.hands.length >= 2) {
        const [a, b] = f.hands;
        const palm = (a.palm + b.palm) / 2;
        const thumbs = dist(a.lm[4], b.lm[4]) / palm;
        const index = dist(a.lm[8], b.lm[8]) / palm;
        const apexAbove = (a.lm[4].y + b.lm[4].y) / 2 - (a.lm[8].y + b.lm[8].y) / 2;
        const wide = dist(a.wrist, b.wrist) / palm;
        if (thumbs < 1.05 && index < 1.05 && Math.abs(apexAbove) > 0.25 * palm && wide > 0.6) {
          if (since < 0) since = f.t;
          last = f.t;
          return Math.min((f.t - since) / 0.25, 1);
        }
      }
      if (since >= 0 && f.t - last < 0.3) return Math.min((last - since) / 0.25, 1);
      since = -1;
      return 0;
    },
  };
}

// Ladi: an open palm sweeps a long way sideways, quickly.
function ladi(): Detector {
  const trail = new Trail<number>(0.9);
  return {
    reset: () => trail.clear(),
    update(f) {
      const h = main(f);
      // fast motion blurs the fingers, so only a fist breaks the swipe
      if (!h || h.fist) {
        trail.clear();
        return 0;
      }
      trail.push(f.t, h.wrist.x / f.aspect);
      const xs = trail.items.map((i) => i.v);
      const net = Math.abs(xs[xs.length - 1] - xs[0]);
      return Math.min(net / 0.2, 1);
    },
  };
}

// 7 shot rocket: an open palm rises steadily.
function skyshot(): Detector {
  const trail = new Trail<number>(2.5);
  return {
    reset: () => trail.clear(),
    update(f) {
      const h = main(f);
      if (!h || h.fist) {
        trail.clear();
        return 0;
      }
      trail.push(f.t, h.wrist.y);
      const lowest = Math.max(...trail.items.map((i) => i.v));
      return Math.min((lowest - h.wrist.y) / 0.1, 1);
    },
  };
}

// Pop-pop: thrown like a ball. The hand swings forward (towards the camera it drops and grows
// bigger) and opens as it lets go. Either the swing or the release with some swing lights it.
function poppop(): Detector {
  const trail = new Trail<{ y: number; size: number; open: boolean }>(0.6);
  return {
    reset: () => trail.clear(),
    update(f) {
      const h = main(f);
      if (!h) {
        trail.clear();
        return 0;
      }
      trail.push(f.t, { y: h.wrist.y, size: h.palm, open: h.open });
      const it = trail.items.map((i) => i.v);
      const highest = Math.min(...it.map((v) => v.y));
      const smallest = Math.min(...it.map((v) => v.size));
      const drop = Math.max(0, h.wrist.y - highest);
      const grow = h.palm / Math.max(1e-6, smallest) - 1;
      const swing = Math.max(drop / 0.13, grow / 0.4);
      // held closed a moment ago, open now: the ball has left the hand
      const released = h.open && it.slice(0, -2).some((v) => !v.open);
      if (released && swing > 0.45) return 1;
      return Math.min(swing, 1);
    },
  };
}

const FACTORIES: Record<PackageId, () => Detector> = {
  bomb_wale_chacha: bomb,
  rocket_bua: rocket,
  chakri_dadi: chakri,
  phuljhadi_mami: phuljhadi,
  anaar_maasi: anaar,
  ladi_tauji: ladi,
  saat_shot_nana: skyshot,
  pop_pop_chotu: poppop,
};

export const createDetector = (id: PackageId): Detector => FACTORIES[id]();
