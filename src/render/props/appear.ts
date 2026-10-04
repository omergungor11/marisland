import { BLOOM_IN } from '../../content/anim.ts';

/**
 * `aAppear` encoding (per instance, seconds of engine time):
 * - `t ≥ 0`: bloom-in started at t (spring scale, or a dither fade under reduced motion);
 * - `ALWAYS_APPEAR` / the attribute default (−1e4): fully shown;
 * - `HIDDEN_APPEAR` (1e9): not yet shown (queued bloom-in);
 * - `< APPEAR_OUT_BELOW`: removed by an edit (TASK-211) — reverse fade (scale down over
 *   `BLOOM_IN.outMs`, dither out over `outDitherMs` under reduced motion) that started at
 *   `t0 = −aAppear − APPEAR_OUT_BASE`. Float32 keeps ≈ 16 ms resolution up to t0 = 1e5 s.
 */
export const HIDDEN_APPEAR = 1e9;
export const ALWAYS_APPEAR = -1e3;
export const APPEAR_OUT_BASE = 1e5;
export const APPEAR_OUT_BELOW = -5e4;

export const encodeAppearOut = (t0: number): number => -(APPEAR_OUT_BASE + Math.max(0, t0));

/** Seconds the removal fade takes (after this the instance can be zero-scaled). */
export const APPEAR_OUT_SECONDS = Math.max(BLOOM_IN.outMs, BLOOM_IN.outDitherMs) / 1000;

const f = (v: number): string => v.toFixed(4);

/**
 * GLSL: removal factor in [0, 1] (1 = still fully there) for `aAppear` at `uTime`; `dither`
 * selects the reduced-motion duration. Pure function of the attribute, so the lit, depth and
 * contact-blob programs agree.
 */
export const APPEAR_OUT_GLSL = /* glsl */ `
bool marIsRemoved(float a) { return a < ${f(APPEAR_OUT_BELOW)}; }
float marRemoveFade(float a, float t, bool dither) {
  float t0 = -a - ${f(APPEAR_OUT_BASE)};
  return 1.0 - smoothstep(0.0, dither ? ${f(BLOOM_IN.outDitherMs / 1000)} : ${f(BLOOM_IN.outMs / 1000)}, t - t0);
}
`;

/** CPU twin of `marRemoveFade` (tests). */
export function removeFade(a: number, t: number, dither: boolean): number {
  const t0 = -a - APPEAR_OUT_BASE;
  const e = (dither ? BLOOM_IN.outDitherMs : BLOOM_IN.outMs) / 1000;
  const x = Math.min(1, Math.max(0, (t - t0) / e));
  return 1 - x * x * (3 - 2 * x);
}
