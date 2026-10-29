// Procedural Web Audio sound design. Nothing is created until the user enables sound,
// so the experience always begins silent.

type Category = 'ambience' | 'world' | 'fireworks' | 'ui';

const CATEGORY_GAIN: Record<Category, number> = { ambience: 0.45, world: 0.75, fireworks: 0.62, ui: 0.42 };

class Engine {
  ctx: AudioContext | null = null;
  master: GainNode | null = null;
  cats: Partial<Record<Category, GainNode>> = {};
  noise: AudioBuffer | null = null;
  enabled = false;
  celebration = 0;
  private ambienceTimer: number | null = null;
  private hum: { src: AudioBufferSourceNode; gain: GainNode } | null = null;
  private lastSnap = 0;

  private ensure() {
    if (this.ctx) return this.ctx;
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    const ctx = new AC();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.knee.value = 12;
    comp.ratio.value = 6;
    comp.attack.value = 0.004;
    comp.release.value = 0.2;
    const master = ctx.createGain();
    master.gain.value = 0;
    master.connect(comp).connect(ctx.destination);
    (Object.keys(CATEGORY_GAIN) as Category[]).forEach((c) => {
      const g = ctx.createGain();
      g.gain.value = CATEGORY_GAIN[c];
      g.connect(master);
      this.cats[c] = g;
    });
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noise = buf;
    this.ctx = ctx;
    this.master = master;
    return ctx;
  }

  setEnabled(on: boolean) {
    this.enabled = on;
    if (on) {
      const ctx = this.ensure();
      if (!ctx || !this.master) return;
      ctx.resume();
      this.master.gain.cancelScheduledValues(ctx.currentTime);
      this.master.gain.setTargetAtTime(0.85, ctx.currentTime, 0.25);
      this.startAmbience();
    } else if (this.ctx && this.master) {
      this.master.gain.cancelScheduledValues(this.ctx.currentTime);
      this.master.gain.setTargetAtTime(0, this.ctx.currentTime, 0.08);
      this.stopAmbience();
    }
  }

  setCelebration(level: number) {
    this.celebration = Math.max(0, Math.min(1, level));
    if (this.hum && this.ctx) this.hum.gain.gain.setTargetAtTime(0.05 + this.celebration * 0.04, this.ctx.currentTime, 1);
  }

  private out(cat: Category) {
    return this.cats[cat]!;
  }

  private live() {
    return this.enabled && this.ctx && this.ctx.state !== 'closed' ? this.ctx : null;
  }

  private noiseSrc(ctx: AudioContext) {
    const s = ctx.createBufferSource();
    s.buffer = this.noise;
    s.loop = true;
    s.loopStart = Math.random();
    return s;
  }

  /** Short envelope helper. */
  private env(g: GainNode, t: number, peak: number, attack: number, decay: number) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  }

  tone(cat: Category, freq: number, dur: number, opts: { type?: OscillatorType; gain?: number; to?: number; delay?: number; attack?: number } = {}) {
    const ctx = this.live();
    if (!ctx) return;
    const t = ctx.currentTime + (opts.delay ?? 0);
    const o = ctx.createOscillator();
    o.type = opts.type ?? 'sine';
    o.frequency.setValueAtTime(freq, t);
    if (opts.to) o.frequency.exponentialRampToValueAtTime(opts.to, t + dur);
    const g = ctx.createGain();
    this.env(g, t, opts.gain ?? 0.2, opts.attack ?? 0.005, dur);
    o.connect(g).connect(this.out(cat));
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  burstNoise(cat: Category, dur: number, opts: { type?: BiquadFilterType; freq?: number; to?: number; q?: number; gain?: number; delay?: number; attack?: number } = {}) {
    const ctx = this.live();
    if (!ctx) return;
    const t = ctx.currentTime + (opts.delay ?? 0);
    const s = this.noiseSrc(ctx);
    const f = ctx.createBiquadFilter();
    f.type = opts.type ?? 'bandpass';
    f.frequency.setValueAtTime(opts.freq ?? 1000, t);
    if (opts.to) f.frequency.exponentialRampToValueAtTime(opts.to, t + dur);
    f.Q.value = opts.q ?? 1;
    const g = ctx.createGain();
    this.env(g, t, opts.gain ?? 0.2, opts.attack ?? 0.003, dur);
    s.connect(f).connect(g).connect(this.out(cat));
    s.start(t);
    s.stop(t + dur + (opts.attack ?? 0.003) + 0.1);
  }

  // ---------------------------------------------------------------- WORLD
  snap() {
    const ctx = this.live();
    if (!ctx) return;
    if (ctx.currentTime - this.lastSnap < 0.045) return;
    this.lastSnap = ctx.currentTime;
    const p = 0.8 + Math.random() * 0.5;
    this.burstNoise('world', 0.02, { type: 'highpass', freq: 2500, gain: 0.08 });
    this.tone('world', 1300 * p, 0.04, { type: 'triangle', to: 700 * p, gain: 0.07 });
  }
  horn() {
    for (const [d, f] of [[0, 392], [0.24, 440]] as const) {
      const ctx = this.live();
      if (!ctx) return;
      const t = ctx.currentTime + d;
      const o1 = ctx.createOscillator();
      const o2 = ctx.createOscillator();
      o1.type = 'square';
      o2.type = 'sawtooth';
      o1.frequency.value = f;
      o2.frequency.value = f * 1.26;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 1400;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.09, t + 0.02);
      g.gain.setValueAtTime(0.09, t + 0.15);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
      o1.connect(lp);
      o2.connect(lp);
      lp.connect(g).connect(this.out('world'));
      o1.start(t);
      o2.start(t);
      o1.stop(t + 0.25);
      o2.stop(t + 0.25);
    }
  }
  kettle() {
    const ctx = this.live();
    if (!ctx) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(1500, t);
    o.frequency.linearRampToValueAtTime(2150, t + 1.1);
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 7;
    const lg = ctx.createGain();
    lg.gain.value = 28;
    lfo.connect(lg).connect(o.frequency);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.06, t + 0.6);
    g.gain.setValueAtTime(0.06, t + 1.2);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);
    o.connect(g).connect(this.out('world'));
    o.start(t);
    lfo.start(t);
    o.stop(t + 1.7);
    lfo.stop(t + 1.7);
    this.burstNoise('world', 1.4, { type: 'bandpass', freq: 3500, q: 2, gain: 0.03, attack: 0.4 });
  }
  ting() {
    this.tone('world', 1250, 0.6, { gain: 0.06 });
    this.tone('world', 1875, 0.4, { gain: 0.025, delay: 0.01 });
  }
  chime() {
    [784, 988, 1175, 1568].forEach((f, i) => this.tone('world', f, 0.35, { type: 'triangle', gain: 0.05, delay: i * 0.06 }));
  }
  woof() {
    this.burstNoise('world', 0.12, { type: 'lowpass', freq: 700, gain: 0.08 });
    this.tone('world', 210, 0.12, { type: 'triangle', to: 150, gain: 0.08 });
  }
  boing() {
    this.tone('world', 400, 0.25, { type: 'sine', to: 900, gain: 0.07 });
  }
  reveal() {
    [523, 659, 784, 1047].forEach((f, i) => {
      this.tone('world', f, 0.9, { type: 'sine', gain: 0.045, delay: i * 0.09, attack: 0.02 });
      this.tone('world', f * 2.01, 0.5, { type: 'sine', gain: 0.012, delay: i * 0.09 + 0.01 });
    });
  }
  lidOpen() {
    this.burstNoise('world', 0.25, { type: 'bandpass', freq: 900, to: 2200, q: 0.8, gain: 0.05, attack: 0.05 });
  }

  // ---------------------------------------------------------------- UI
  hover() {
    this.tone('ui', 1500, 0.03, { gain: 0.02 });
  }
  tap() {
    this.tone('ui', 660, 0.06, { type: 'triangle', gain: 0.05 });
  }
  unlock() {
    [523, 659, 784, 1047].forEach((f, i) => this.tone('ui', f, 0.18, { type: 'triangle', gain: 0.06, delay: i * 0.08 }));
  }
  shutter() {
    this.burstNoise('ui', 0.05, { type: 'bandpass', freq: 3000, q: 1.5, gain: 0.12 });
    this.burstNoise('ui', 0.04, { type: 'bandpass', freq: 1800, q: 1.5, gain: 0.09, delay: 0.12 });
    this.tone('ui', 2400, 0.03, { type: 'square', gain: 0.02, delay: 0.005 });
  }
  paper() {
    this.burstNoise('ui', 0.35, { type: 'bandpass', freq: 1200, to: 2600, q: 0.7, gain: 0.05, attack: 0.08 });
  }

  // ---------------------------------------------------------------- FIREWORKS
  whoosh(dur = 1.2) {
    this.burstNoise('fireworks', dur, { type: 'bandpass', freq: 350, to: 3200, q: 2.5, gain: 0.14, attack: 0.1 });
    this.tone('fireworks', 600, dur, { type: 'sine', to: 1900, gain: 0.03, attack: 0.1 });
  }
  boom(strength = 1, delay = 0) {
    const s = Math.min(1, strength);
    this.tone('fireworks', 110, 0.9 * s + 0.2, { type: 'sine', to: 38, gain: 0.32 * s, delay });
    this.burstNoise('fireworks', 0.7 * s + 0.2, { type: 'lowpass', freq: 1400, to: 300, gain: 0.3 * s, delay });
  }
  crackle(duration: number, density = 30, gain = 0.06, delay = 0) {
    const n = Math.round(duration * density);
    for (let i = 0; i < n; i++) {
      this.burstNoise('fireworks', 0.008 + Math.random() * 0.01, { type: 'highpass', freq: 2000 + Math.random() * 4000, gain: gain * (0.4 + Math.random() * 0.6), delay: delay + Math.random() * duration });
    }
  }
  pop(gain = 0.12, delay = 0) {
    this.burstNoise('fireworks', 0.04, { type: 'bandpass', freq: 1400 + Math.random() * 1200, q: 1.2, gain, delay });
    this.tone('fireworks', 900 + Math.random() * 500, 0.04, { type: 'triangle', to: 300, gain: gain * 0.5, delay });
  }
  hiss(duration: number, freq = 4200, gain = 0.07) {
    const ctx = this.live();
    if (!ctx) return;
    const t = ctx.currentTime;
    const s = this.noiseSrc(ctx);
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = freq;
    f.Q.value = 0.9;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + duration * 0.25);
    g.gain.setValueAtTime(gain, t + duration * 0.7);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    s.connect(f).connect(g).connect(this.out('fireworks'));
    s.start(t);
    s.stop(t + duration + 0.1);
  }
  whir(duration: number) {
    const ctx = this.live();
    if (!ctx) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(140, t);
    o.frequency.linearRampToValueAtTime(330, t + duration * 0.4);
    o.frequency.linearRampToValueAtTime(120, t + duration);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 900;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.035, t + 0.3);
    g.gain.setValueAtTime(0.035, t + duration * 0.75);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    o.connect(lp).connect(g).connect(this.out('fireworks'));
    o.start(t);
    o.stop(t + duration + 0.1);
    this.hiss(duration, 3000, 0.05);
  }
  tick(i: number) {
    this.tone('fireworks', i === 0 ? 880 : 660, 0.08, { type: 'square', gain: 0.03 });
  }

  // ---------------------------------------------------------------- AMBIENCE
  private startAmbience() {
    const ctx = this.ctx;
    if (!ctx || this.hum) return;
    const s = this.noiseSrc(ctx);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 260;
    const g = ctx.createGain();
    g.gain.value = 0.0001;
    g.gain.setTargetAtTime(0.05 + this.celebration * 0.04, ctx.currentTime, 1.5);
    s.connect(f).connect(g).connect(this.out('ambience'));
    s.start();
    this.hum = { src: s, gain: g };
    const loop = () => {
      if (!this.enabled) return;
      const r = Math.random();
      if (r < 0.45) this.murmur();
      else if (r < 0.55) this.bird();
      if (Math.random() < 0.15 + this.celebration * 0.7) this.distantPops();
      this.ambienceTimer = window.setTimeout(loop, 1400 + Math.random() * 2600 * (1 - this.celebration * 0.5));
    };
    loop();
  }
  private stopAmbience() {
    if (this.ambienceTimer) window.clearTimeout(this.ambienceTimer);
    this.ambienceTimer = null;
    if (this.hum) {
      try {
        this.hum.src.stop();
      } catch {
        /* already stopped */
      }
      this.hum = null;
    }
  }
  private murmur() {
    const ctx = this.live();
    if (!ctx) return;
    const t = ctx.currentTime;
    const dur = 0.6 + Math.random() * 1.2;
    const s = this.noiseSrc(ctx);
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 450 + Math.random() * 700;
    f.Q.value = 4;
    const am = ctx.createGain();
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 3.5 + Math.random() * 3;
    const lg = ctx.createGain();
    lg.gain.value = 0.5;
    am.gain.value = 0.5;
    lfo.connect(lg).connect(am.gain);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.05, t + 0.2);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(am).connect(g).connect(this.out('ambience'));
    s.start(t);
    lfo.start(t);
    s.stop(t + dur + 0.1);
    lfo.stop(t + dur + 0.1);
  }
  private bird() {
    const base = 2600 + Math.random() * 900;
    for (let i = 0; i < 3; i++) this.tone('ambience', base, 0.07, { to: base * 1.3, gain: 0.012, delay: i * 0.13 });
  }
  private distantPops() {
    const n = 1 + Math.floor(Math.random() * (2 + this.celebration * 5));
    for (let i = 0; i < n; i++) {
      const d = Math.random() * 1.2;
      this.burstNoise('ambience', 0.12, { type: 'lowpass', freq: 600, gain: 0.05 + this.celebration * 0.05, delay: d });
    }
  }
}

export const audio = new Engine();
