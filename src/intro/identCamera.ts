import * as THREE from 'three';
import { identLayout, ringDistance, rocketPath } from './identLayout';
import { ident, MARK } from './identState';
import { rocketU } from './IdentParticles';

// The film camera's moves. Each shot is a smooth spline for position and one for the look
// target; the master timeline only advances each shot's progress with a designed ease.

interface Shot {
  pos: THREE.CatmullRomCurve3;
  target: THREE.CatmullRomCurve3;
}

let shots: Record<'s1' | 'p1' | 's2' | 's3' | 's4' | 's5', Shot> | null = null;

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const curve = (pts: THREE.Vector3[]) => new THREE.CatmullRomCurve3(pts, false, 'centripetal');

function build() {
  const L = identLayout();
  const F = L.zF;
  const M = L.medallion;
  const CS = L.chakriStart;
  const CE = L.chakriEnd;
  const AN = L.anaar;
  const RB = L.rocketBase;
  const B = L.burst;
  const D = ringDistance();
  const add = (v: THREE.Vector3, x: number, y: number, z: number) => v.clone().add(V(x, y, z));
  // Shot 01: a diagonal glide up the facade, past windows A and B, settling on C's medallion
  const A = L.windows[0];
  const s1End = V(M.x + 0.35, M.y + 0.15, F + 3.7);
  const s1 = {
    pos: curve([V(A.x - 1.7, A.y - 0.55, F + 6.5), V(A.x + 0.7, A.y + 0.25, F + 6.0), V(M.x - 0.6, M.y - 0.9, F + 5.0), s1End]),
    target: curve([V(A.x + 0.5, A.y + 0.15, F), V(A.x + 1.6, A.y + 0.55, F), V(M.x - 0.25, M.y - 0.6, F), V(M.x, M.y - 0.05, F)]),
  };
  // ...then a short push straight into the medallion for the match cut
  const p1 = {
    pos: curve([s1End, V(M.x + 0.12, M.y + 0.05, F + 2.5), V(M.x, M.y, M.z + 1.75)]),
    target: curve([V(M.x, M.y - 0.05, F), V(M.x, M.y - 0.02, F + 0.1), M.clone()]),
  };
  // Shot 02: from directly above the chakri (same size on screen as the medallion), craning
  // down behind it and riding the anaar's fountain across to the rocket on the front parapet.
  // The camera stays on the roof looking out over the gali, with Dadi watching from her stool.
  const s2 = {
    pos: curve([add(CS, 0, 1.75, 0.06), add(CS, -0.35, 2.15, -1.6), add(AN, -1.75, 1.0, -2.55), add(AN, -0.2, 0.75, -2.3), add(RB, -1.0, 0.35, -1.9)]),
    target: curve([CS.clone(), add(CS.clone().lerp(CE, 0.7), 0, 0.1, 0), add(AN, 0, 0.75, 0), add(AN.clone().lerp(RB, 0.55), 0, 1.0, 0), add(RB, 0, 0.35, 0)]),
  };
  // Shot 03: chase the rocket up, pulling back over the rooftops until only the indigo sky is left
  const s3 = {
    pos: curve([add(RB, -1.0, 0.35, -1.9), add(RB, -0.8, 2.6, -3.4), add(B, -0.4, -4.2, -D * 0.72), add(B, 0, -0.3, -D)]),
    target: curve([add(RB, 0, 0.35, 0), B.clone()]),
  };
  // Shot 04: hold on the frame with a slow push
  const s4 = {
    pos: curve([add(B, 0, -0.3, -D), add(B, 0, -0.18, -D * 0.955)]),
    target: curve([B.clone(), B.clone()]),
  };
  // Shot 05: dive down through the frame towards the gali
  const s5 = {
    pos: curve([add(B, 0, -0.18, -D * 0.955), add(B, 0, -0.9, -D * 0.3), add(B, 0.15, -3.6, 2.2), add(B, 0.4, -6.2, 4.6)]),
    target: curve([B.clone(), add(B, 0, -2.0, 3.0), V(-2.6, 3.0, F + 7.5), V(-2.2, 1.5, F + 9.5)]),
  };
  shots = { s1, p1, s2, s3, s4, s5 };
  return shots;
}

const _r = new THREE.Vector3();

/** Writes the film camera's position and look target for film time t. */
export function filmCamera(t: number, pos: THREE.Vector3, target: THREE.Vector3) {
  const S = shots ?? build();
  const p = ident.shot;
  let shot: Shot;
  let k: number;
  if (t < 0.86) [shot, k] = [S.s1, p.s1];
  else if (t < MARK.PATAKA_TRANSITION) [shot, k] = [S.p1, p.p1];
  else if (t < MARK.ROCKET_ASCENT) [shot, k] = [S.s2, p.s2];
  else if (t < MARK.BRAND_REVEAL) [shot, k] = [S.s3, p.s3];
  else if (t < MARK.WORLD_ENTRY) [shot, k] = [S.s4, p.s4];
  else [shot, k] = [S.s5, p.s5];
  shot.pos.getPoint(k, pos);
  shot.target.getPoint(k, target);
  if (shot === S.s3) {
    // follow the rocket itself, slightly ahead of it, settling on the burst point
    rocketPath(rocketU(t), _r);
    _r.y += 0.7;
    target.lerpVectors(_r, target, THREE.MathUtils.smoothstep(k, 0.72, 1));
  }
}
