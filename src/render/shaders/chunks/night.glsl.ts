/**
 * Night-light GLSL shared by props, terrain and water (TASK-171): lantern pools sampled from
 * the per-world pool texture (SHARED.uPoolTex / uPoolMap) and the lamp flicker. No point
 * lights — pools are additive light on the receiving surface × albedo.
 *
 * Uniforms declared here: uPoolTex, uPoolMap, uPoolColor, uLamps. The including shader must
 * NOT declare them again; it passes time explicitly.
 */
import { NIGHT, POOLS } from '../../../content/lighting.ts';

const f = (v: number): string => v.toFixed(5);
const TAU = Math.PI * 2;

/** Height range encoded in the pool texture's G channel (u). Shared with lantern-pools.ts. */
export const POOL_HEIGHT_RANGE = 64;

export const NIGHT_GLSL = /* glsl */ `
uniform sampler2D uPoolTex;
uniform vec4 uPoolMap;
uniform vec3 uPoolColor;
uniform vec3 uLamps;

float marNightHash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

/** Lamp flicker ±${NIGHT.flickerAmp} with periods ${NIGHT.flickerPeriod[0]}–${NIGHT.flickerPeriod[1]} s (ART_BIBLE §7 #25). */
float marFlicker(float seed, float t) {
  float w1 = ${f(TAU / NIGHT.flickerPeriod[1])} + ${f(TAU / NIGHT.flickerPeriod[0] - TAU / NIGHT.flickerPeriod[1])} * seed;
  float w2 = w1 * 1.618;
  float n = 0.6 * sin(t * w1 + seed * 37.0) + 0.4 * sin(t * w2 + seed * 71.0);
  return 1.0 + ${f(NIGHT.flickerAmp)} * n;
}

/** Pool light at world xz: x = intensity (0..1, × lamps), y = pool ground height (u). */
vec2 marPool(vec2 xz) {
  if (uPoolMap.w < 0.5 || uLamps.x <= 0.0) return vec2(0.0);
  vec2 uv = (xz - uPoolMap.xy) * uPoolMap.z;
  if (any(lessThan(uv, vec2(0.0))) || any(greaterThan(uv, vec2(1.0)))) return vec2(0.0);
  vec2 s = texture2D(uPoolTex, uv).rg;
  return vec2(s.r * uLamps.x, s.g * ${f(POOL_HEIGHT_RANGE)});
}

/** Spatially smooth pool flicker (neighbouring lanterns drift out of phase). */
float marPoolFlicker(vec2 xz, float t) {
  // continuous in space (no cell seams inside a pool)
  return marFlicker(0.5 + 0.5 * sin(xz.x * 0.21 + xz.y * 0.17), t);
}
`;

/** Gains as GLSL literals (content POOLS). */
export const POOL_GAIN = {
  ground: f(POOLS.gain),
  prop: f(POOLS.propGain),
  water: f(POOLS.waterGain),
  fade0: f(POOLS.propFade[0]),
  fade1: f(POOLS.propFade[1]),
} as const;
