import { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { PACKAGE_BY_ID, type CrackerType, type PackageAsset, type PackageId } from '../assets/AssetRegistry';
import { createCrackerModel, paint } from '../assets/ProceduralModels';
import { runtime } from './Runtime';
import { flashScale, useGame } from './GameState';
import { particles, pick, ringBurst, rnd, smoke, sparks, sphereBurst } from './ParticlePool';
import { audio } from '../audio/AudioEngine';
import { getGlowTexture } from '../utils/TextureGenerator';
import { groundMarks } from '../street/Scorch';
import type { Vec3 } from '../assets/AssetRegistry';

// Every cracker is a short scripted, entirely virtual effect: particles from the shared pool,
// one shared light for the warm wash on nearby walls, a sound cue, a camera response,
// a neighbourhood reaction and a single "photo moment". Crackers burst on the ground where
// the player put them: sparks skitter on the road, a scorch mark is left behind and fades.

type V3 = [number, number, number];

interface EffectSpec {
  duration: number;
  captureAt: number;
  setup: (ctx: EffectCtx) => void;
  update: (ctx: EffectCtx, t: number, dt: number) => void;
}

interface EffectCtx {
  pkg: PackageAsset;
  o: V3; // origin
  /** along the road at the origin (x, z), for the ladi */
  axis: [number, number];
  group: THREE.Group;
  model: THREE.Group;
  vars: Record<string, number>;
  data: Record<string, unknown>;
  light: (pos: V3, color: string, intensity: number) => void;
  once: (key: string, t: number, fn: () => void) => void;
  t: number;
}

const GOLD = ['#FFD15A', '#FFE7A3', '#F5A623', '#FFF3D0'];

const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];

const EFFECTS: Record<CrackerType, EffectSpec> = {
  rocket: {
    duration: 6.0,
    captureAt: 3.3,
    setup: (c) => {
      // a little launch bottle
      const bottle = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.15, 0.4, 12), new THREE.MeshStandardMaterial({ color: '#7FB7A8', roughness: 0.2, metalness: 0.1, transparent: true, opacity: 0.7 }));
      bottle.position.set(...add(c.o, [0, 0.2, 0]));
      c.group.add(bottle);
      c.model.position.set(...add(c.o, [-0.07, 0.25, 0]));
      c.model.scale.setScalar(1.3);
      c.vars.y = 0;
      c.vars.vy = 0;
    },
    update: (c, t, dt) => {
      const [x, y0, z] = c.o;
      if (t < 0.9) {
        sparks([x, y0 + 0.3, z], 2, 1.2, GOLD);
        c.light([x, y0 + 0.6, z], '#FFB25C', 0.25);
      }
      c.once('whoosh', 0.9, () => {
        audio.whoosh(1.8);
        // follow the rocket up into the sky
        runtime.camera?.aim([x, y0 + 16, z], 1.5);
        groundMarks.flash(c.o, 2.2, '#FFC46B', 0.9, 0.5);
        groundMarks.scorch(c.o, 0.7, 0.6);
        sparks([x, y0 + 0.05, z], 24, 2.6, GOLD, { gravity: 6, life: rnd(0.3, 0.6) });
        smoke([x, y0 + 0.2, z], 6);
        runtime.emit({ kind: 'launch', pos: c.o, strength: 0.4 });
      });
      if (t >= 0.9 && t < 2.9) {
        c.vars.vy = Math.min(c.vars.vy + dt * 14, 15);
        c.vars.y += c.vars.vy * dt;
        const px = x + Math.sin(t * 9) * 0.05;
        c.model.position.set(px - 0.07, y0 + 0.25 + c.vars.y, z);
        for (let i = 0; i < 5; i++) particles.emit({ pos: [px, y0 + 0.3 + c.vars.y - i * 0.12, z], vel: [rnd(-0.4, 0.4), rnd(-2, -0.6), rnd(-0.4, 0.4)], life: rnd(0.4, 0.9), color: '#FFE7A3', color2: '#FF6A1A', size: 0.14, size2: 0.03, gravity: 1.5, drag: 1.5, flicker: 0.4 });
        c.light([px, y0 + c.vars.y, z], '#FFC46B', 0.45);
      }
      c.once('burst', 2.9, () => {
        c.model.visible = false;
        const apex: V3 = [x, y0 + 0.3 + c.vars.y, z];
        c.vars.ax = apex[0];
        c.vars.ay = apex[1];
        sphereBurst(apex, 380, 11, ['#5B7BFF', '#3446A4', '#9FB4FF'], { color2: '#FFD15A', life: 2.0, size: 0.32 });
        sphereBurst(apex, 220, 7.5, ['#FF6A3D', '#E8702A', '#FFD15A'], { color2: '#FFF3D0', life: 1.7, size: 0.3 });
        sphereBurst(apex, 140, 3.5, ['#FFF3D0'], { color2: '#F5A623', life: 2.6, size: 0.18, gravity: 0.9, flicker: 0.8 });
        audio.boom(0.8);
        audio.crackle(1.8, 40, 0.05, 0.4);
        runtime.emit({ kind: 'bigBurst', pos: apex, strength: 1, text: 'Rocket Bua zindabad!' });
      });
      c.once('burst2', 3.6, () => {
        const ap: V3 = [c.vars.ax + 2.6, c.vars.ay - 1.6, z + 1.2];
        sphereBurst(ap, 140, 5, ['#D64A91', '#FFD15A'], { life: 1.4, size: 0.28 });
        audio.boom(0.4);
      });
      if (t > 2.9) {
        const k = Math.max(0, 1 - (t - 2.9) / 1.8);
        c.light([c.vars.ax, c.vars.ay, z], '#9FB4FF', 2.2 * k);
      }
    },
  },

  chakri: {
    duration: 5.8,
    captureAt: 2.7,
    setup: (c) => {
      c.model.position.set(...c.o);
      c.model.scale.setScalar(1.6);
      c.vars.ang = 0;
      c.vars.spd = 0;
    },
    update: (c, t, dt) => {
      const [x, y, z] = c.o;
      if (t < 0.5) sparks([x + 0.3, y + 0.1, z], 1, 1, GOLD);
      c.once('whir', 0.5, () => {
        audio.whir(4.6);
        groundMarks.scorch(c.o, 1.1, 0.7);
        runtime.emit({ kind: 'firework', pos: c.o, strength: 0.5 });
      });
      if (t > 0.5 && t < 5.1 && Math.random() < dt * 6) groundMarks.flash(c.o, 2.6, '#FFB547', 0.55, 0.35);
      if (t >= 0.5 && t < 5.1) {
        const p = (t - 0.5) / 4.6;
        c.vars.spd = p < 0.35 ? (p / 0.35) * 26 : 26 * (1 - (p - 0.35) / 0.65) + 3;
        c.vars.ang += c.vars.spd * dt;
        c.model.rotation.y = c.vars.ang;
        const r = 0.3 + Math.sin(Math.min(1, p * 1.6) * Math.PI * 0.5) * 0.25;
        const n = Math.round(8 * particles.density) + 1;
        for (let i = 0; i < n; i++) {
          const a = c.vars.ang + (i / n) * Math.PI * 2;
          const tx = -Math.sin(a);
          const tz = Math.cos(a);
          const sp = 2.2 + c.vars.spd * 0.12 + Math.random();
          const col = Math.random() < 0.7 ? pick(GOLD) : pick(['#D64A91', '#148C88', '#FF6A3D', '#7FE3D6']);
          particles.emit({ pos: [x + Math.cos(a) * r, y + 0.1, z + Math.sin(a) * r], vel: [tx * sp + Math.cos(a) * 0.8, rnd(0.1, 0.9), tz * sp + Math.sin(a) * 0.8], life: rnd(0.35, 0.7), color: col, color2: '#FF6A1A', size: 0.12, size2: 0.03, gravity: 3, drag: 2.4, flicker: 0.4 });
        }
        c.light([x, y + 0.5, z], '#FFB547', 0.55 + Math.sin(t * 30) * 0.08);
        if (Math.random() < dt * 2) runtime.emit({ kind: 'firework', pos: c.o, strength: 0.4 });
      }
      if (t >= 5.1) c.light([x, y + 0.5, z], '#FFB547', Math.max(0, 0.5 - (t - 5.1)));
    },
  },

  sparkler: {
    duration: 5.4,
    captureAt: 2.3,
    setup: (c) => {
      const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.12, 10), paint('#A9573B', 1));
      stand.position.set(...add(c.o, [0, 0.06, 0]));
      c.group.add(stand);
      c.model.position.set(...c.o);
      c.model.scale.setScalar(1.1);
    },
    update: (c, t, dt) => {
      const [x, y, z] = c.o;
      c.once('crackle', 0.2, () => {
        audio.crackle(4.6, 26, 0.04);
        audio.hiss(4.6, 6000, 0.025);
        groundMarks.scorch(c.o, 0.45, 0.5);
      });
      if (t > 0.2 && t < 4.8 && Math.random() < dt * 5) groundMarks.flash(c.o, 1.6, '#FFE7A3', 0.4, 0.3);
      if (t > 0.2 && t < 4.8) {
        const burn = Math.min(1, (t - 0.2) / 4.6);
        const tip: V3 = [x, y + 0.8 - burn * 0.45, z];
        sparks(tip, 6, 2.6, ['#FFF3D0', '#FFE7A3', '#FFD15A'], { size: 0.08, life: rnd(0.25, 0.5), gravity: 2.5, drag: 1.8 });
        if (Math.random() < 0.5) sparks(add(tip, [rnd(-0.3, 0.3), rnd(-0.1, 0.3), rnd(-0.3, 0.3)]), 3, 1.4, ['#FFF3D0'], { size: 0.05, life: 0.2 });
        c.light(tip, '#FFD9A0', 0.45 + Math.random() * 0.12);
      }
      c.once('react', 1.2, () => runtime.emit({ kind: 'firework', pos: c.o, strength: 0.4, text: 'Ek photo toh banti hai!' }));
      if (t >= 4.8) c.light([x, y + 0.4, z], '#FFD9A0', Math.max(0, 0.4 - (t - 4.8)));
    },
  },

  anaar: {
    duration: 6.4,
    captureAt: 2.9,
    setup: (c) => {
      c.model.position.set(...c.o);
      c.model.scale.setScalar(1.6);
    },
    update: (c, t, dt) => {
      const [x, y, z] = c.o;
      if (t < 0.6) sparks([x, y + 0.65, z], 1, 1, GOLD);
      c.once('hiss', 0.6, () => {
        audio.hiss(5.2, 3600, 0.08);
        audio.crackle(5, 30, 0.04, 0.3);
        groundMarks.scorch(c.o, 1.0, 0.75);
        runtime.emit({ kind: 'firework', pos: c.o, strength: 0.5 });
      });
      if (t > 0.6 && t < 5.8 && Math.random() < dt * 4) groundMarks.flash(c.o, 3.2, '#FFC35C', 0.5, 0.45);
      if (t >= 0.6 && t < 5.8) {
        const p = (t - 0.6) / 5.2;
        // rise, dramatic peak, gradual fade
        const strength = p < 0.25 ? p / 0.25 : p < 0.5 ? 1 : 1 - (p - 0.5) / 0.5;
        const n = Math.round((4 + strength * 18) * particles.density) + 1;
        for (let i = 0; i < n; i++) {
          const spread = 0.35 + strength * 0.5;
          const up = 4 + strength * 6 * rnd(0.7, 1.1);
          const highlight = Math.random() < 0.12;
          particles.emit({
            pos: [x, y + 0.65, z],
            vel: [rnd(-spread, spread), up, rnd(-spread, spread)],
            life: rnd(0.9, 1.5),
            color: highlight ? pick(['#D64A91', '#7FE3D6', '#FF6F91']) : pick(GOLD),
            color2: highlight ? '#FFF0D2' : '#FF6A1A',
            size: 0.13,
            size2: 0.03,
            gravity: 7,
            drag: 0.6,
            flicker: 0.5,
          });
        }
        c.light([x, y + 1.6, z], '#FFC35C', 0.4 + strength * 1.0);
        if (p > 0.25 && p < 0.3) c.once('peak', t, () => runtime.emit({ kind: 'bigBurst', pos: c.o, strength: 0.8, text: 'Drama bhi, dhamaka bhi!' }));
      }
    },
  },

  ladi: {
    duration: 4.8,
    captureAt: 1.9,
    setup: (c) => {
      // lay the string of crackers along the road, away from people
      const n = 16;
      const crackers: THREE.Mesh[] = [];
      const geo = new THREE.CylinderGeometry(0.035, 0.035, 0.16, 8);
      const [ax, az] = c.axis;
      for (let i = 0; i < n; i++) {
        const m = new THREE.Mesh(geo, paint(i % 3 === 0 ? c.pkg.palette[1] : c.pkg.palette[0], 0.6));
        const u = -1.6 + i * 0.22;
        const w = Math.sin(i * 0.8) * 0.12;
        m.position.set(c.o[0] + ax * u - az * w, c.o[1] + 0.04, c.o[2] + az * u + ax * w);
        m.rotation.set(0, -Math.atan2(az, ax), 0);
        m.rotateZ(Math.PI / 2 + (i % 2 ? 0.4 : -0.4));
        c.group.add(m);
        crackers.push(m);
      }
      // the fuse string they hang on
      const fuse = new THREE.Mesh(new THREE.BoxGeometry(n * 0.22, 0.012, 0.012), paint('#E3D7B0', 0.9));
      fuse.position.set(c.o[0] + ax * (-1.6 + (n - 1) * 0.11), c.o[1] + 0.03, c.o[2] + az * (-1.6 + (n - 1) * 0.11));
      fuse.rotation.y = -Math.atan2(az, ax);
      c.group.add(fuse);
      c.data.fuse = fuse;
      c.data.crackers = crackers;
      c.model.visible = false;
      c.vars.next = 0.5;
      c.vars.i = 0;
    },
    update: (c, t) => {
      const list = c.data.crackers as THREE.Mesh[];
      if (t >= c.vars.next && c.vars.i < list.length) {
        const m = list[c.vars.i];
        m.visible = false;
        const p: V3 = [m.position.x, m.position.y + 0.1, m.position.z];
        sphereBurst(p, 26, 2.8, ['#FFF3D0', '#FFD15A', '#FF6A3D'], { life: rnd(0.25, 0.45), gravity: 1, drag: 3, size: 0.16 });
        smoke(p, 2);
        sparks([p[0], 0.05, p[2]], 6, 2.2, ['#FFF3D0', '#FFD15A'], { gravity: 7 });
        groundMarks.flash(p, 1.3, '#FFD9A0', 0.8, 0.25);
        if (c.vars.i % 3 === 0) groundMarks.scorch(p, 0.55, 0.6);
        audio.pop(0.13);
        c.light(p, '#FFD9A0', 0.9);
        c.vars.i++;
        // playful, slightly irregular rhythm
        c.vars.next = t + (c.vars.i % 4 === 3 ? 0.3 : rnd(0.09, 0.17));
        if (c.vars.i % 5 === 0) runtime.emit({ kind: 'firework', pos: p, strength: 0.5, text: c.vars.i === 10 ? 'Ek baar shuru toh bas shuru!' : undefined });
      } else {
        c.light(c.o, '#FFD9A0', 0);
      }
      c.once('finale', 3.9, () => {
        (c.data.fuse as THREE.Mesh).visible = false;
        const end: V3 = [c.o[0] + c.axis[0] * 1.8, 0.2, c.o[2] + c.axis[1] * 1.8];
        sphereBurst(end, 60, 3.5, ['#FFF3D0', '#FF6A3D'], { life: 0.5 });
        groundMarks.flash(end, 2.4, '#FFE7A3', 1, 0.35);
        runtime.emit({ kind: 'firework', pos: end, strength: 0.6 });
        audio.pop(0.18);
        audio.pop(0.15, 0.08);
      });
    },
  },

  bomb: {
    duration: 5.0,
    captureAt: 2.85,
    setup: (c) => {
      c.model.position.set(...c.o);
      c.model.scale.setScalar(1.7);
    },
    update: (c, t) => {
      const [x, y, z] = c.o;
      const say = (k: string, at: number, txt: string, i: number) =>
        c.once(k, at, () => {
          useGame.getState().say(txt, [x, y + 1.3, z], 750);
          audio.tick(i);
        });
      say('c3', 0.3, 'Teen...', 1);
      say('c2', 1.05, 'Do...', 1);
      say('c1', 1.8, 'Ek...', 0);
      if (t < 2.6) {
        const wob = Math.min(1, t / 2.6);
        c.model.rotation.z = Math.sin(t * (10 + wob * 30)) * 0.12 * wob;
        c.model.position.y = y + Math.abs(Math.sin(t * 12)) * 0.05 * wob;
        sparks([x + 0.08, y + 0.72, z], 2, 1.3, GOLD);
        c.light([x, y + 0.8, z], '#FFB25C', 0.3);
      }
      c.once('boom', 2.6, () => {
        c.model.visible = false;
        const p: V3 = [x, y + 0.4, z];
        sphereBurst(p, 260, 6.5, ['#FFF3D0', '#FFD15A', '#FF8A3D'], { life: rnd(0.5, 0.9), gravity: 1.5, drag: 2.6, size: 0.26 });
        ringBurst([x, y + 0.08, z], 90, 7, ['#FFE7A3', '#FF8A3D'], { gravity: 4 });
        sparks([x, y + 0.05, z], 60, 5, ['#FFF3D0', '#FFD15A', '#FF8A3D'], { gravity: 9, life: rnd(0.4, 0.8), size: 0.1 });
        smoke(p, 16, { size: 0.9, size2: 2.6 });
        groundMarks.flash(c.o, 6, '#FFD9A0', 1.4, 0.7);
        groundMarks.scorch(c.o, 1.8, 0.95);
        audio.boom(1);
        audio.crackle(0.8, 50, 0.05, 0.15);
        runtime.camera?.shake(0.7, 0.55);
        runtime.emit({ kind: 'bomb', pos: c.o, strength: 1 });
      });
      if (t >= 2.6) c.light([x, y + 1, z], '#FFD9A0', 2.2 * Math.max(0, 1 - (t - 2.6) / 0.9));
    },
  },

  snake: {
    duration: 6.6,
    captureAt: 4.6,
    setup: (c) => {
      c.model.position.set(...c.o);
      c.model.scale.setScalar(1.5);
      // a winding path that climbs, loops and flops over
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i <= 60; i++) {
        const s = i / 60;
        const a = s * Math.PI * 5;
        const r = 0.12 + s * 0.35;
        pts.push(new THREE.Vector3(c.o[0] + Math.cos(a) * r + s * 0.6, c.o[1] + 0.05 + Math.sin(s * Math.PI) * 0.9 + s * 0.2, c.o[2] + Math.sin(a) * r));
      }
      const curve = new THREE.CatmullRomCurve3(pts);
      const geo = new THREE.TubeGeometry(curve, 220, 0.07, 8, false);
      const mat = new THREE.MeshStandardMaterial({ color: '#2A2420', roughness: 1, metalness: 0 });
      const tube = new THREE.Mesh(geo, mat);
      tube.castShadow = true;
      geo.setDrawRange(0, 0);
      c.group.add(tube);
      const tip = new THREE.Sprite(new THREE.SpriteMaterial({ map: getGlowTexture(), color: '#FF8A3D', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      tip.scale.setScalar(0.5);
      c.group.add(tip);
      c.data.tube = tube;
      c.data.curve = curve;
      c.data.tip = tip;
      c.vars.grow = 0;
    },
    update: (c, t, dt) => {
      const tube = c.data.tube as THREE.Mesh;
      const curve = c.data.curve as THREE.CatmullRomCurve3;
      const tip = c.data.tip as THREE.Sprite;
      c.once('hiss', 0.3, () => {
        audio.hiss(5.4, 1800, 0.035);
        groundMarks.scorch(c.o, 0.7, 0.6);
        runtime.emit({ kind: 'firework', pos: c.o, strength: 0.3 });
      });
      if (t < 0.6) sparks(add(c.o, [0, 0.08, 0]), 1, 0.6, ['#FF8A3D']);
      if (t >= 0.6 && t < 5.6) {
        // slow, then a surprising spurt, then slow again
        const p = (t - 0.6) / 5.0;
        const rate = p < 0.45 ? 0.08 : p < 0.6 ? 0.55 : 0.12;
        c.vars.grow = Math.min(1, c.vars.grow + rate * dt * 1.6);
        const idxCount = (tube.geometry.index?.count ?? 0) * c.vars.grow;
        tube.geometry.setDrawRange(0, Math.floor(idxCount / 3) * 3);
        const tp = curve.getPoint(Math.max(0.001, c.vars.grow));
        tip.position.copy(tp);
        tip.scale.setScalar(0.35 + Math.random() * 0.1);
        if (Math.random() < 0.5) smoke([tp.x, tp.y, tp.z], 1, { vel: [rnd(-0.2, 0.2), rnd(0.2, 0.6), rnd(-0.2, 0.2)], life: rnd(1, 1.8), color: '#8A8680', color2: '#4E4B4A', size: 0.16, size2: 0.4 });
        if (Math.random() < 0.15) sparks([tp.x, tp.y, tp.z], 1, 0.5, ['#FF8A3D']);
        c.light([tp.x, tp.y + 0.3, tp.z], '#FF8A3D', 0.25);
        if (p > 0.46 && p < 0.5) c.once('surprise', t, () => runtime.emit({ kind: 'firework', pos: c.o, strength: 0.5, text: 'Picture abhi baaki hai!' }));
      }
      if (t >= 5.6) {
        (tip.material as THREE.SpriteMaterial).opacity = Math.max(0, 1 - (t - 5.6));
        c.light(c.o, '#FF8A3D', 0);
      }
    },
  },

  popPop: {
    duration: 4.6,
    captureAt: 1.7,
    setup: (c) => {
      c.model.position.set(...c.o);
      c.model.scale.setScalar(1.4);
      c.vars.next = 0.35;
      c.vars.count = 0;
    },
    update: (c, t) => {
      if (t >= c.vars.next && c.vars.count < 16 && t < 4) {
        const p: V3 = [c.o[0] + rnd(-1.3, 1.3), c.o[1] + 0.06, c.o[2] + rnd(-1.0, 1.0)];
        const cols = pick([['#E0458F', '#FFD93B'], ['#2D5BD0', '#7FE3D6'], ['#FFD93B', '#FFF3D0'], ['#E0458F', '#2D5BD0']]);
        sphereBurst(p, 18, 2.2, cols, { life: rnd(0.25, 0.45), gravity: 3, drag: 3, size: 0.14 });
        groundMarks.flash(p, 1.0, cols[0], 0.9, 0.22);
        if (c.vars.count % 4 === 0) groundMarks.scorch(p, 0.35, 0.5);
        audio.pop(0.1);
        c.light(p, cols[0], 0.6);
        c.vars.count++;
        c.vars.next = t + pick([0.08, 0.12, 0.2, 0.35, 0.15]);
        if (c.vars.count === 1 || c.vars.count === 6) runtime.emit({ kind: 'firework', pos: p, strength: 0.4, text: c.vars.count === 6 ? 'Chhota packet, bada surprise!' : undefined });
        if (c.vars.count === 4) c.model.visible = false;
      } else c.light(c.o, '#FFD93B', 0);
    },
  },
};

interface Running {
  spec: EffectSpec;
  ctx: EffectCtx;
  t: number;
  done: () => void;
  onCapture: (url: string | null) => void;
  captured: boolean;
}

export function FireworkDirector() {
  const sceneGroup = useRef<THREE.Group>(null!);
  const running = useRef<Running | null>(null);
  const staged = useRef<{ id: PackageId; o: V3; ctx: EffectCtx; fired: Set<string> } | null>(null);
  const light = useRef({ pos: [0, 0, 0] as V3, color: '#FFFFFF', intensity: 0 });

  useEffect(() => {
    const remove = (g: THREE.Group) => {
      sceneGroup.current?.remove(g);
      g.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) m.geometry.dispose();
      });
    };
    // builds the cracker standing on the ground, exactly as its effect starts
    const build = (id: PackageId, origin: Vec3, axis: [number, number]) => {
      const pkg = PACKAGE_BY_ID[id];
      const o: V3 = [...origin];
      const group = new THREE.Group();
      sceneGroup.current.add(group);
      const model = createCrackerModel(pkg.crackerType, pkg.palette);
      group.add(model);
      const fired = new Set<string>();
      const ctx: EffectCtx = {
        pkg,
        o,
        axis,
        group,
        model,
        vars: {},
        data: {},
        t: 0,
        light: (pos, color, intensity) => {
          light.current = { pos, color, intensity };
        },
        once: (key, at, fn) => {
          if (!fired.has(key) && ctx.t >= at) {
            fired.add(key);
            fn();
          }
        },
      };
      // face the cracker towards the camera
      model.rotation.y = Math.atan2(runtime.player.x - o[0], runtime.player.z - o[2]);
      EFFECTS[pkg.crackerType].setup(ctx);
      return { id, o, ctx, fired };
    };
    runtime.fireworks = {
      busy: () => running.current !== null,
      stage: (id, origin, axis) => {
        if (staged.current) remove(staged.current.ctx.group);
        staged.current = build(id, origin, axis);
      },
      unstage: () => {
        if (staged.current) remove(staged.current.ctx.group);
        staged.current = null;
      },
      play: async (id: PackageId, origin: Vec3, onCapture) => {
        let st = staged.current;
        if (!st || st.id !== id || st.o[0] !== origin[0] || st.o[2] !== origin[2]) {
          if (st) remove(st.ctx.group);
          st = build(id, origin, [1, 0]);
        }
        staged.current = null;
        const s = st;
        await new Promise<void>((resolve) => {
          running.current = { spec: EFFECTS[s.ctx.pkg.crackerType], ctx: s.ctx, t: 0, done: resolve, onCapture, captured: false };
        });
      },
    };
    return () => {
      runtime.fireworks = null;
    };
  }, []);

  useFrame((_, rawDt) => {
    const r = running.current;
    const dt = Math.min(rawDt, runtime.maxDt);
    const fl = runtime.fireworkLight;
    if (r) {
      r.t += dt;
      r.ctx.t = r.t;
      r.spec.update(r.ctx, r.t, dt);
      if (!r.captured && r.t >= r.spec.captureAt) {
        r.captured = true;
        r.onCapture(runtime.capture?.shot() ?? null);
      }
      if (r.t >= r.spec.duration) {
        running.current = null;
        sceneGroup.current.remove(r.ctx.group);
        r.ctx.group.traverse((o) => {
          const m = o as THREE.Mesh;
          if (m.isMesh) m.geometry.dispose();
        });
        light.current.intensity = 0;
        r.done();
      }
    }
    const c = new THREE.Color(light.current.color);
    const scale = flashScale(useGame.getState().settings.flash);
    fl.pos = light.current.pos;
    fl.color = [c.r, c.g, c.b];
    // ease toward the target so light never strobes
    fl.intensity += (light.current.intensity * scale - fl.intensity) * Math.min(1, dt * 18);
  });

  return <group ref={sceneGroup} />;
}
