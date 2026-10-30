import * as THREE from 'three';

// A per-instance fade for instanced meshes, done as a screen-door dither so it needs no
// sorting: a vehicle's cut-out and its 3D model cross over this way as the view swings
// from side-on to head-on. The mesh's geometry carries an `aFade` attribute, 0..1.

const DITHER = /* glsl */ `
  if (vFade < 0.999) {
    float n = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
    if (n >= vFade) discard;
  }
`;

export function withFade<M extends THREE.Material>(mat: M): M {
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', 'attribute float aFade;\nvarying float vFade;\n#include <common>')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFade = aFade;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', 'varying float vFade;\n#include <common>').replace('void main() {', 'void main() {\n' + DITHER);
  };
  mat.customProgramCacheKey = () => 'cast-fade';
  return mat;
}

/** Give an instanced mesh its fade attribute; returns the array to write each frame. */
export function addFade(mesh: THREE.InstancedMesh, cap: number) {
  const arr = new Float32Array(cap).fill(1);
  const attr = new THREE.InstancedBufferAttribute(arr, 1);
  attr.setUsage(THREE.DynamicDrawUsage);
  mesh.geometry.setAttribute('aFade', attr);
  return attr;
}

const D = THREE.MathUtils.degToRad;

/**
 * How much of a side-view vehicle's 3D model to show (0 = all cut-out, 1 = all model), from
 * where the camera is: the cut-out holds while the vehicle is seen within about 35° of
 * side-on and from not too steeply above.
 * (hx, hz) is the vehicle's heading; (cx, cy, cz) the camera; (x, z) the vehicle.
 */
export function modelWeight(hx: number, hz: number, x: number, z: number, cx: number, cy: number, cz: number) {
  const vx = cx - x;
  const vz = cz - z;
  const flat = Math.hypot(vx, vz) || 1e-6;
  // angle off side-on: 0 when looking straight at its side, 90° head-on or from behind
  const along = Math.abs(vx * hx + vz * hz) / flat;
  const off = Math.asin(Math.min(1, along));
  const elev = Math.atan2(Math.max(0, cy - 0.9), flat);
  return Math.max(THREE.MathUtils.smoothstep(off, D(30), D(44)), THREE.MathUtils.smoothstep(elev, D(42), D(58)));
}

/**
 * For the auto's three-quarter illustration (front and one side): how well the view matches
 * it, 1 when the camera sees the auto from about 45° off its nose.
 */
export function threeQuarterWeight(hx: number, hz: number, x: number, z: number, cx: number, cy: number, cz: number) {
  const vx = cx - x;
  const vz = cz - z;
  const flat = Math.hypot(vx, vz) || 1e-6;
  const front = Math.acos(THREE.MathUtils.clamp((vx * hx + vz * hz) / flat, -1, 1));
  const elev = Math.atan2(Math.max(0, cy - 0.9), flat);
  const k = 1 - THREE.MathUtils.smoothstep(Math.abs(front - D(48)), D(10), D(20));
  return k * (1 - THREE.MathUtils.smoothstep(elev, D(30), D(45)));
}
