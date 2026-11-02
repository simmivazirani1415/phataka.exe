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

// A per-instance hue turn for the people's cut-outs, so five illustrations dress a whole
// mohalla: the strongly coloured clothes turn round the colour wheel (YIQ, so brightness is
// kept); skin, hair and the pale whites are not saturated enough to move.
const HUE = /* glsl */ `
  if (abs(vHue) > 0.001) {
    vec3 c = diffuseColor.rgb;
    float mx = max(c.r, max(c.g, c.b));
    float mn = min(c.r, min(c.g, c.b));
    // judge saturation on roughly gamma-encoded values (linear exaggerates it)
    float gx = sqrt(mx);
    float s = gx > 0.0 ? (gx - sqrt(mn)) / gx : 0.0;
    float d = mx - mn + 1e-5;
    float h = mx == c.r ? mod((c.g - c.b) / d, 6.0) : mx == c.g ? (c.b - c.r) / d + 2.0 : (c.r - c.g) / d + 4.0;
    h /= 6.0;
    // skin (and the golds and oranges near it) never turns
    float skin = smoothstep(0.0, 0.025, h) * (1.0 - smoothstep(0.12, 0.15, h));
    float k = smoothstep(0.4, 0.55, s) * step(0.12, mx) * (1.0 - skin);
    vec3 yiq = mat3(0.299, 0.596, 0.211, 0.587, -0.274, -0.523, 0.114, -0.322, 0.312) * c;
    float a = vHue * 6.2831853;
    yiq.yz = mat2(cos(a), sin(a), -sin(a), cos(a)) * yiq.yz;
    vec3 r = mat3(1.0, 1.0, 1.0, 0.956, -0.272, -1.106, 0.621, -0.647, 1.703) * yiq;
    diffuseColor.rgb = mix(c, clamp(r, 0.0, 1.0), k);
  }
`;

export function withFadeHue<M extends THREE.Material>(mat: M): M {
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', 'attribute float aFade;\nattribute float aHue;\nvarying float vFade;\nvarying float vHue;\n#include <common>')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFade = aFade;\nvHue = aHue;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', 'varying float vFade;\nvarying float vHue;\n#include <common>')
      .replace('void main() {', 'void main() {\n' + DITHER)
      .replace('#include <map_fragment>', '#include <map_fragment>\n' + HUE);
  };
  mat.customProgramCacheKey = () => 'cast-fade-hue';
  return mat;
}

export function addHue(mesh: THREE.InstancedMesh, cap: number) {
  const attr = new THREE.InstancedBufferAttribute(new Float32Array(cap), 1);
  attr.setUsage(THREE.DynamicDrawUsage);
  mesh.geometry.setAttribute('aHue', attr);
  return attr;
}
