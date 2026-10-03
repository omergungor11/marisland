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
varying float vAge;
varying vec2 vDith;
varying vec2 vAxis;
float marPuffHash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
void main() {
  vec3 c = aOrigin;
  float size = 0.0;
  float fadeLast = uBurpSize.w;
  float id = 0.0;
  float age = 0.0;
  if (aKind < 2.5) {
    float cyc = uTime / aShape.w + aSeed;
    age = fract(cyc);
    id = floor(cyc);
    vec2 jit = vec2(marPuffHash(vec2(id, aSeed * 97.0)), marPuffHash(vec2(aSeed * 53.0, id + 7.0))) - 0.5;
    float e = 1.0 - (1.0 - age) * (1.0 - age);
    // gentle ease-out rise: a stronger curve piles the big old puffs into a 'light-bulb' head
    float rise = aShape.z * age * (1.3 - 0.3 * age);
    // lean downwind, increasingly with height, plus a slow lazy sway
    vec2 drift = uWind.xy * aMove.x * age * age * uMotionScale;
    vec2 side = vec2(-uWind.y, uWind.x);
    float sway = sin(uTime * 0.45 + aSeed * 6.2831853 + age * 3.0) * aMove.y * 0.6 * age * uMotionScale;
    c += vec3(jit.x * aMove.y * (0.4 + age) + drift.x + side.x * sway, rise,
              jit.y * aMove.y * (0.4 + age) + drift.y + side.y * sway);
    float fadeP = smoothstep(1.0 - fadeLast, 1.0, age);
    // grow as it rises (ease-out), seeded ±22 % per puff, shrink a little while dissolving → taper
    size = mix(aShape.x, aShape.y, e) * smoothstep(0.0, 0.07, age)
         * (0.78 + 0.44 * marPuffHash(vec2(id * 1.7, aSeed * 31.0))) * (1.0 - 0.55 * fadeP);
    if (aKind > 0.5 && aKind < 1.5) {
      // burp: puffs spawned just after a period multiple swell up
      float spawn = uTime - age * aShape.w;
      float p = mod(spawn, uBurp.x);
      size *= 1.0 + (uBurpSize.z - 1.0) * (1.0 - smoothstep(0.0, 1.3, p)) * step(0.5 * uBurp.x, spawn - p);
    }
    vFade = 1.0 - fadeP;
    vAxis = aOrigin.xz + drift + side * sway;
  } else {
    // ring puff: expands radially once per burp period (none before the first period)
    float tp = mod(uTime, uBurp.x);
    age = tp / uBurp.y;
    id = floor(uTime / uBurp.x);
    float on = step(age, 1.0) * step(uBurp.x, uTime + 1e-3);
    float e = 1.0 - (1.0 - min(age, 1.0)) * (1.0 - min(age, 1.0));
    float a = aSeed * 6.2831853;
    c += vec3(cos(a) * uBurp.z * e, uBurp.w * age, sin(a) * uBurp.z * e);
    size = mix(uBurpSize.x, uBurpSize.y, e) * smoothstep(0.0, 0.08, age) * on;
    vFade = 1.0 - smoothstep(1.0 - fadeLast, 1.0, age);
    age = min(age, 1.0);
    vAxis = c.xz;
  }
  // seeded squashed-ellipsoid shape so stacked puffs don't read as identical balls
  float h1 = marPuffHash(vec2(aSeed * 13.0 + 3.0, id));
  float h2 = marPuffHash(vec2(id + 11.0, aSeed * 29.0));
  vec3 shape = vec3(1.0 + 0.16 * (h1 - 0.5), 0.84 + 0.14 * h2, 1.0 - 0.16 * (h1 - 0.5));
  vec4 wp = modelMatrix * vec4(c + position * shape * (0.5 * size), 1.0);
  vN = normalize(normal / shape);
  vW = wp.xyz;
  vKind = aKind;
  vAge = age;
  // per-puff dither offset: overlapping puffs at the same fade don't punch identical holes
  vDith = floor(vec2(h1, h2) * 4.0);
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
varying float vAge;
varying vec2 vDith;
varying vec2 vAxis;
uniform float uTime;
uniform vec3 uLava;
uniform vec2 uLavaGlow;
void main() {
  vec3 n = normalize(vN);
  // light the stack as one column: bend each puff's normal toward the column's radial normal
  vec2 rad = vW.xz - vAxis;
  float rl = length(rad);
  if (vKind > 0.5 && rl > 1e-3) n = normalize(mix(n, vec3(rad / rl * length(n.xz), n.y), 0.6));
  vec3 V = normalize(uCameraPos - vW);
  // soft silhouette: the rim of each puff thins out (dithered) → translucent edges, and
  // older puffs thin from the rim inward as they fade
  float ndv = clamp(dot(n, V), 0.0, 1.0);
  float cover = vFade * sqrt(vFade) * mix(0.3, 1.0, smoothstep(0.08, 0.55, ndv));
  if (vKind < 0.5) cover = vFade; // chimney smoke stays a solid little puff
  if (cover < marBayer4(gl_FragCoord.xy + vDith)) discard;
  // sun-wrap light/shadow side + a blue-grey belly; chimney smoke a touch greyer than steam
  vec3 L = normalize(uSunDir);
  float wrap = clamp((dot(n, L) + 0.35) / 1.35, 0.0, 1.0);
  float up = 0.5 + 0.5 * n.y;
  float g = clamp(0.15 + 0.65 * wrap * wrap + 0.2 * up, 0.0, 1.0);
  // young (dense) steam a little greyer at the core; it whitens as it rises
  g *= mix(0.82, 1.0, smoothstep(0.0, 0.5, vAge));
  if (vKind < 0.5) g *= 0.55;
  vec4 col = marSoftShade(g, n, vW);
  // extra shade on the side away from the sun (soft-shade's own wrap is gentle), cooled
  // toward the blue-grey belly so the shadow side reads as volume, not a grey smudge
  float sh = 1.0 - smoothstep(0.15, 0.75, wrap);
  col.rgb *= mix(vec3(1.0), vec3(0.74, 0.79, 0.9), sh * (1.0 - 0.6 * uNight));
  // lava under-glow: the young steam over the crater catches the orange light from below
  // (keeps the crater reading as glowing even when the rim hides the lava disc)
  if (vKind > 0.5 && vKind < 1.5) {
    float low = 1.0 - smoothstep(0.0, 0.4, vAge);
    float pulse = 1.0 + 0.25 * sin(uTime * 2.0943951);
    float under = mix(0.45, 1.0, smoothstep(0.3, -0.6, n.y));
    float k = low * low * under * pulse * mix(uLavaGlow.x, uLavaGlow.y, uNight);
    // mix toward the lava colour (adding orange onto blue-white/navy steam reads pink)
    col.rgb = mix(col.rgb, uLava * mix(1.15, 1.7, uNight), clamp(k, 0.0, 0.85));
  }
  gl_FragColor = col;
${FRAG_OUT}
}
`;
