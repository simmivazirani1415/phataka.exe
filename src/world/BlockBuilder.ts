import { mulberry32 } from '../utils/TextureGenerator';

// Every static piece of the mohalla is a Block. Blocks are grouped by (material, shape) into
// InstancedMeshes and animated into place by one shared shader clock (see WorldAssembly).

export type BlockMat = 'paint' | 'stone' | 'tile' | 'wood' | 'metal' | 'leaf' | 'clay' | 'fabric' | 'tank' | 'glass' | 'glow' | 'diya';
export type BlockShape = 'box' | 'cyl' | 'tri' | 'sphere';
export type AssemblyAnim = 'rise' | 'drop' | 'scatter' | 'slide' | 'seed';
export type Phase = 'seed' | 'ground' | 'road' | 'walls' | 'details' | 'props' | 'lights';

export interface Block {
  w: number;
  h: number;
  d: number;
  x: number;
  y: number; // centre
  z: number;
  rx: number;
  ry: number;
  rz: number;
  mat: BlockMat;
  shape: BlockShape;
  color: string;
  /** Emissive blocks (glass/glow) switch from `color` to `litColor` when `stage` is reached. */
  litColor?: string;
  stage?: number;
  /** Hidden until this progression stage, then assembles in. */
  appearStage?: number;
  bevel: number;
  phase: Phase;
  order: number;
  anim: AssemblyAnim;
  /** Building id for blocks that belong to a building (used by the intro ident). */
  tag?: string;
  // filled by finalize()
  delay: number;
  offset: [number, number, number];
}

export type BlockInput = Partial<Omit<Block, 'delay' | 'offset'>> & {
  w: number;
  h: number;
  d: number;
  x: number;
  y: number;
  z: number;
  color: string;
};

/** Phase windows in seconds (creative targets; the whole build lands in ~14s). */
export const PHASES: Record<Phase, [number, number]> = {
  seed: [0.15, 0.2],
  ground: [0.9, 2.7],
  road: [2.7, 4.3],
  walls: [4.3, 7.3],
  details: [7.1, 9.2],
  props: [9.0, 10.9],
  lights: [11.0, 12.6],
};
export const BLOCK_DURATION = 0.6;
export const ASSEMBLY_END = 12.6 + BLOCK_DURATION;
export const CAMERA_SETTLE_END = 14.6;

export class BlockBuilder {
  blocks: Block[] = [];
  private phase: Phase = 'ground';
  private anim: AssemblyAnim = 'rise';
  private order = 0;
  private rand = mulberry32(1987);
  /** Applied to every block added while set. */
  tag: string | undefined;

  setPhase(phase: Phase, anim: AssemblyAnim, order?: number) {
    this.phase = phase;
    this.anim = anim;
    if (order !== undefined) this.order = order;
    return this;
  }
  setOrder(order: number) {
    this.order = order;
    return this;
  }
  random() {
    return this.rand();
  }

  add(b: BlockInput) {
    const block: Block = {
      rx: 0,
      ry: 0,
      rz: 0,
      mat: 'paint',
      shape: 'box',
      bevel: 0.06,
      phase: this.phase,
      order: this.order,
      anim: this.anim,
      delay: 0,
      offset: [0, 0, 0],
      tag: this.tag,
      ...b,
    };
    this.blocks.push(block);
    return block;
  }

  /** Box from min/max corners (handy for architecture). */
  box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, color: string, extra: Partial<BlockInput> = {}) {
    return this.add({
      w: Math.abs(x1 - x0),
      h: Math.abs(y1 - y0),
      d: Math.abs(z1 - z0),
      x: (x0 + x1) / 2,
      y: (y0 + y1) / 2,
      z: (z0 + z1) / 2,
      color,
      ...extra,
    });
  }

  /** Assign staggered delays and scatter offsets for the assembly animation. */
  finalize() {
    const byPhase = new Map<Phase, Block[]>();
    for (const b of this.blocks) {
      if (!byPhase.has(b.phase)) byPhase.set(b.phase, []);
      byPhase.get(b.phase)!.push(b);
    }
    const r = mulberry32(42);
    for (const [phase, list] of byPhase) {
      const [t0, t1] = PHASES[phase];
      // stable sort by order then by sweep across the platform
      list.sort((a, b) => a.order - b.order || a.x + a.z * 0.6 - (b.x + b.z * 0.6));
      list.forEach((b, i) => {
        const f = list.length > 1 ? i / (list.length - 1) : 0;
        b.delay = t0 + f * (t1 - t0) + (r() - 0.5) * 0.12;
        b.offset = scatterOffset(b, r);
      });
    }
  }
}

function scatterOffset(b: Block, r: () => number): [number, number, number] {
  switch (b.anim) {
    case 'seed':
      return [0, 2.5, 0];
    case 'slide': {
      const len = Math.hypot(b.x, b.z) || 1;
      return [(b.x / len) * 4 + (r() - 0.5) * 2, -3 - r() * 2, (b.z / len) * 4 + (r() - 0.5) * 2];
    }
    case 'rise':
      return [(r() - 0.5) * 1.6, -2.5 - r() * 2, (r() - 0.5) * 1.6];
    case 'drop':
      return [(r() - 0.5) * 2.4, 3.5 + r() * 3, (r() - 0.5) * 2.4];
    case 'scatter':
    default: {
      const a = r() * Math.PI * 2;
      const m = 2.5 + r() * 3;
      return [Math.cos(a) * m, 2 + r() * 3.5, Math.sin(a) * m];
    }
  }
}
