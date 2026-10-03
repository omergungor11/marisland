import { MIST } from '../../../content/weather.ts';

const f = (v: number): string => v.toFixed(6);

/**
 * Low mist band (TASK-172, ARCHITECTURE §7 "Fog: exponential plus a low mist band"). GLSL twin
 * of `env/weather.ts` `mistAmount` (+ a drifting noise term): optical depth of an exponential
 * height layer — density uMist.x at sea level, e-folding height 1 / uMist.y — integrated along
 * camera → fragment. Thick over the sea and beaches, thin on hill tops, so islands rise out of
 * it as silhouettes. Evaluated in the terrain, prop (Lambert), water and contact-blob programs —
 * no mesh, no extra program. `uMist.x == 0` (every non-mist frame) returns before any math.
 *
 * Uniforms (SHARED): uMist x = density (1/u), y = 1/height, zw = noise drift offset (u);
 * uMistColor (linear, at the fog colour's luminance); uMistMax = cap.
 */
export const MIST_GLSL = /* glsl */ `
uniform vec4 uMist;
uniform vec3 uMistColor;
uniform float uMistMax;
float marMistHash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float marMistNoise(vec2 x) {
  vec2 i = floor(x);
  vec2 fr = fract(x);
  vec2 u = fr * fr * (3.0 - 2.0 * fr);
  float a = marMistHash(i);
  float b = marMistHash(i + vec2(1.0, 0.0));
  float c = marMistHash(i + vec2(0.0, 1.0));
  float d = marMistHash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
/* mist amount 0..uMistMax between the camera and world point p */
float marMist(vec3 p, vec3 cam) {
  if (uMist.x <= 0.0) return 0.0;
  float y0 = max(cam.y, 0.0) * uMist.y;
  float y1 = max(p.y, 0.0) * uMist.y;
  float dy = y1 - y0;
  float e0 = exp(-y0);
  float e1 = exp(-y1);
  float mean = abs(dy) > 1e-3 ? (e0 - e1) / dy : e0;
  vec2 q = (p.xz + uMist.zw) * ${f(MIST.noiseScale)};
  float n = 1.0 + ${f(MIST.noiseAmount * 2)} * (0.65 * marMistNoise(q) + 0.35 * marMistNoise(q * 2.7 + 5.3) - 0.5);
  float tau = uMist.x * length(p - cam) * mean * n;
  return min(1.0 - exp(-tau), uMistMax);
}
`;
