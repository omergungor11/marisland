import { FIELDS_GLSL } from '../shaders/chunks/fields.glsl.ts';

/**
 * Soft-lit smooth shading shared by clouds and puffs (TASK-153; ART_BIBLE §1
 * smooth-shaded exception). Wrap lighting from uSunDir, belly → top gradient,
 * night re-tint, FogExp2 curve identical to water/Lambert, flat white in the
 * debug mask. Output is linear (inside the composer); MAR_DIRECT tone-maps and
 * encodes for the low-quality direct path.
 */
const SOFT_FRAG_PARS = /* glsl */ `
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform float uSunIntensity;
uniform vec3 uHemiSky;
uniform vec3 uFogColor;
uniform float uFogDensity;
uniform vec3 uCameraPos;
uniform float uNight;
uniform float uGolden;
uniform float uDebugMask;
uniform vec3 uTop;
uniform vec3 uBelly;
uniform vec3 uBellyNight;
/* belly 0 → top 1 gradient value g, normal n (world), world position w */
vec4 marSoftShade(float g, vec3 n, vec3 w) {
  vec3 belly = mix(uBelly, uBellyNight, uNight);
  vec3 top = mix(uTop, mix(uBellyNight, uTop, 0.35), uNight);
  vec3 base = mix(belly, top, g);
  vec3 L = normalize(uSunDir);
  float wrap = clamp((dot(n, L) + 0.65) / 1.65, 0.0, 1.0);
  float dayK = clamp(uSunIntensity / 3.0, 0.0, 1.0);
  vec3 day = mix(vec3(1.0), uSunColor, 0.35 + 0.25 * uGolden) * (0.68 + 0.3 * wrap) * (0.85 + 0.15 * dayK);
  vec3 night = uHemiSky * (0.75 + 0.25 * wrap) + 0.05;
  vec3 col = base * mix(day, night, uNight);
  float x = uFogDensity * length(w - uCameraPos);
  col = mix(col, uFogColor, 1.0 - exp(-x * x));
  return vec4(col, 1.0);
}
`;

export const CLOUD_VERT = /* glsl */ `
attribute float aShade;
varying vec3 vN;
varying vec3 vW;
varying float vShade;
void main() {
  mat4 m = modelMatrix * instanceMatrix;
  vec4 wp = m * vec4(position, 1.0);
  vN = normalize(mat3(m) * normal);
  vW = wp.xyz;
  vShade = aShade;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const FRAG_OUT = /* glsl */ `
#ifdef MAR_DIRECT
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
#endif
  if (uDebugMask > 0.5) gl_FragColor = linearToOutputTexel(vec4(1.0));
`;

export const CLOUD_FRAG = /* glsl */ `
${SOFT_FRAG_PARS}
varying vec3 vN;
varying vec3 vW;
varying float vShade;
void main() {
  vec3 n = normalize(vN);
  float g = smoothstep(0.05, 0.7, vShade) * (0.75 + 0.25 * max(n.y, 0.0));
  gl_FragColor = marSoftShade(g, n, vW);
${FRAG_OUT}
}
`;

/** Puff vertex shader: stateless f(uTime, aSeed) (ARCHITECTURE §5). Kinds: 0 chimney, 1 steam, 2 spring, 3 burp ring. */
export const PUFF_VERT = /* glsl */ `
uniform float uTime;
uniform vec4 uWind;
uniform float uMotionScale;
uniform vec4 uBurp;      // x period, y ring life, z ring radius, w ring rise
uniform vec4 uBurpSize;  // xy ring size, z pulse, w fadeLast
attribute float aSeed;
attribute vec3 aOrigin;
attribute float aKind;
attribute vec4 aShape;   // size0, size1, rise, life
attribute vec2 aMove;    // drift, jitter
varying vec3 vN;
varying vec3 vW;
varying float vFade;
varying float vKind;
float marPuffHash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
void main() {
  vec3 c = aOrigin;
  float size = 0.0;
  float fadeLast = uBurpSize.w;
  if (aKind < 2.5) {
    float cyc = uTime / aShape.w + aSeed;
    float age = fract(cyc);
    float id = floor(cyc);
    vec2 jit = vec2(marPuffHash(vec2(id, aSeed * 97.0)), marPuffHash(vec2(aSeed * 53.0, id + 7.0))) - 0.5;
    float e = 1.0 - (1.0 - age) * (1.0 - age);
    float rise = aShape.z * age * (1.55 - 0.55 * age);
    vec2 drift = uWind.xy * aMove.x * age * age * uMotionScale;
    c += vec3(jit.x * aMove.y * (0.4 + age) + drift.x, rise, jit.y * aMove.y * (0.4 + age) + drift.y);
    float fadeP = smoothstep(1.0 - fadeLast, 1.0, age);
    size = mix(aShape.x, aShape.y, e) * smoothstep(0.0, 0.07, age)
         * (0.78 + 0.44 * marPuffHash(vec2(id * 1.7, aSeed * 31.0))) * (1.0 - 0.35 * fadeP);
    if (aKind > 0.5 && aKind < 1.5) {
      // burp: puffs spawned just after a period multiple swell up
      float spawn = uTime - age * aShape.w;
      float p = mod(spawn, uBurp.x);
      size *= 1.0 + (uBurpSize.z - 1.0) * (1.0 - smoothstep(0.0, 1.3, p)) * step(0.5 * uBurp.x, spawn - p);
    }
    vFade = 1.0 - smoothstep(1.0 - fadeLast, 1.0, age);
  } else {
    // ring puff: expands radially once per burp period (none before the first period)
    float tp = mod(uTime, uBurp.x);
    float age = tp / uBurp.y;
    float on = step(age, 1.0) * step(uBurp.x, uTime + 1e-3);
    float e = 1.0 - (1.0 - min(age, 1.0)) * (1.0 - min(age, 1.0));
    float a = aSeed * 6.2831853;
    c += vec3(cos(a) * uBurp.z * e, uBurp.w * age, sin(a) * uBurp.z * e);
    size = mix(uBurpSize.x, uBurpSize.y, e) * smoothstep(0.0, 0.08, age) * on;
    vFade = 1.0 - smoothstep(1.0 - fadeLast, 1.0, age);
  }
  vec4 wp = modelMatrix * vec4(c + position * (0.5 * size), 1.0);
  vN = normalize(normal);
  vW = wp.xyz;
  vKind = aKind;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

export const PUFF_FRAG = /* glsl */ `
${SOFT_FRAG_PARS}
${FIELDS_GLSL}
varying vec3 vN;
varying vec3 vW;
varying float vFade;
varying float vKind;
void main() {
  if (vFade < marBayer4(gl_FragCoord.xy)) discard;
  vec3 n = normalize(vN);
  // chimney smoke a touch greyer than steam
  float g = (0.3 + 0.7 * (0.5 + 0.5 * n.y)) * (vKind < 0.5 ? 0.55 : 1.0);
  gl_FragColor = marSoftShade(clamp(g, 0.0, 1.0), n, vW);
${FRAG_OUT}
}
`;
