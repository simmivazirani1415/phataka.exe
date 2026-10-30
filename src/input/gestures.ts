import type { PackageId } from '../assets/AssetRegistry';
import { dist, type Frame, type Hand, type P } from './handFeatures';

// One gesture per cracker, each acting out how that cracker is really lit or what it does.
// Only the open box's detector runs, so they never compete with each other.
// A detector is fed every frame and returns progress 0..1; reaching 1 lights the cracker.

export interface Detector {
  update: (f: Frame) => number;
  reset: () => void;
}

export interface GestureInfo {
  icon: string;
  title: string;
  how: string;
}

export const GESTURE_INFO: Record<PackageId, GestureInfo> = {
  bomb_wale_chacha: { icon: '🤏', title: 'Agarbatti to the fuse', how: 'Pinch thumb and index like holding an agarbatti, hold, then let go and pull back.' },
  rocket_bua: { icon: '✊', title: 'Launch from the bottle', how: 'Make a fist, then burst it open upward. Whoosh.' },
  chakri_dadi: { icon: '☝️', title: 'Spin the chakri', how: 'Point your index finger and draw a big circle in the air.' },
  phuljhadi_mami: { icon: '✨', title: 'Wave the phuljhadi', how: 'Pinch as if holding the sparkler stick and wave it left and right.' },
  anaar_maasi: { icon: '🔺', title: 'Make the anaar cone', how: 'Touch both thumbs and both index fingers to make a triangle, and hold.' },
  ladi_tauji: { icon: '👋', title: 'Run the fuse down the ladi', how: 'Open palm, swipe across the screen along the string.' },
  saat_shot_nana: { icon: '🖐️', title: 'Send them up', how: 'Open palm, raise it slowly upward and the seven shots follow.' },
  pop_pop_chotu: { icon: '👇', title: 'Throw the pop-pop', how: 'Flick your hand down fast, like throwing it on the floor.' },
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
        if (held >= 0.4) armedAt = f.t;
        return Math.min(held / 0.4, 1) * 0.7;
      }
      since = -1;
      if (armedAt >= 0 && h.pinch > 0.45) {
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
        return Math.min((f.t - fistSince) / 0.25, 1) * 0.5;
      }
      const armed = fistSince >= 0 && lastFist - fistSince >= 0.25;
      if (armed && f.t - lastFist < 0.8) {
        if (h?.open) return 1;
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
      if (pts.length < 8 || !h) return 0;
      const c = pts.reduce((a, p) => ({ x: a.x + p.x / pts.length, y: a.y + p.y / pts.length }), { x: 0, y: 0 });
      const radius = pts.reduce((a, p) => a + dist(p, c), 0) / pts.length;
      if (radius < 0.5 * h.palm) return 0; // a wiggle, not a circle
      const w = Math.max(...pts.map((p) => p.x)) - Math.min(...pts.map((p) => p.x));
      const ht = Math.max(...pts.map((p) => p.y)) - Math.min(...pts.map((p) => p.y));
      if (Math.min(w, ht) < 0.45 * Math.max(w, ht)) return 0; // a line, not a circle
      let sweep = 0;
      for (let i = 1; i < pts.length; i++) {
        let d = Math.atan2(pts[i].y - c.y, pts[i].x - c.x) - Math.atan2(pts[i - 1].y - c.y, pts[i - 1].x - c.x);
        if (d > Math.PI) d -= 2 * Math.PI;
        if (d < -Math.PI) d += 2 * Math.PI;
        sweep += d;
      }
      return Math.min(Math.abs(sweep) / (1.7 * Math.PI), 1);
    },
  };
}

// Phuljhadi: keep pinching the stick and wave it; count left/right turns.
function phuljhadi(): Detector {
  let lastPinch = -1;
  let turns = 0;
  let dir = 0;
  let extreme = 0;
  return {
    reset: () => ((lastPinch = -1), (turns = 0), (dir = 0)),
    update(f) {
      const h = main(f);
      if (!h || h.pinch > (lastPinch >= 0 && f.t - lastPinch < LOST ? 0.45 : 0.3)) {
        if (f.t - lastPinch > LOST) (turns = 0), (dir = 0);
        return turns / 4;
      }
      if (lastPinch < 0 || f.t - lastPinch > LOST) {
        turns = 0;
        dir = 0;
        extreme = h.pinchPt.x;
      }
      lastPinch = f.t;
      const x = h.pinchPt.x;
      const step = 0.45 * h.palm;
      // a turn counts once the hand travels back far enough from the furthest point reached
      if (dir === 0) {
        if (Math.abs(x - extreme) > step) (dir = Math.sign(x - extreme)), (extreme = x);
      } else if ((x - extreme) * dir > 0) {
        extreme = x;
      } else if (Math.abs(x - extreme) > step) {
        turns++;
        dir = -dir;
        extreme = x;
      }
      return Math.min(turns / 4, 1);
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
        if (thumbs < 0.75 && index < 0.75 && Math.abs(apexAbove) > 0.4 * palm && wide > 0.9) {
          if (since < 0) since = f.t;
          last = f.t;
          return Math.min((f.t - since) / 0.5, 1);
        }
      }
      if (since >= 0 && f.t - last < 0.2) return Math.min((last - since) / 0.5, 1);
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
      if (!h || h.fist || (!trail.items.length && !h.open)) {
        trail.clear();
        return 0;
      }
      trail.push(f.t, h.wrist.x / f.aspect);
      const xs = trail.items.map((i) => i.v);
      const net = Math.abs(xs[xs.length - 1] - xs[0]);
      return Math.min(net / 0.35, 1);
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
      if (!h || !h.open) {
        trail.clear();
        return 0;
      }
      trail.push(f.t, h.wrist.y);
      const lowest = Math.max(...trail.items.map((i) => i.v));
      return Math.min((lowest - h.wrist.y) / 0.18, 1);
    },
  };
}

// Pop-pop: the hand drops fast, like throwing it down.
function poppop(): Detector {
  const trail = new Trail<number>(0.45);
  return {
    reset: () => trail.clear(),
    update(f) {
      const h = main(f);
      if (!h) {
        trail.clear();
        return 0;
      }
      trail.push(f.t, h.wrist.y);
      const highest = Math.min(...trail.items.map((i) => i.v));
      return Math.min(Math.max(0, h.wrist.y - highest) / 0.22, 1);
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
