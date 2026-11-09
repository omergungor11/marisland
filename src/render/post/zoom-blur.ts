import { LIGHTING } from '../../content/palette.ts';
import { POST, POST_ZOOM } from '../../content/lighting.ts';

/** Post blur settings for one frame: tilt-shift band (0–0.5) / blur px, DOF bokeh scale / range (u). */
export interface ZoomBlur {
  band: number;
  blur: number;
  bokeh: number;
  focusRange: number;
}

/**
 * Tilt-shift + DOF from the orbit distance `dist` (u; null = unknown), TASK-586, table in
 * POST_ZOOM: linear between the knots, clamped to the end knots, the tier ignored. With no distance
 * the old per-tier steps are the fallback. `dof`: the high preset (DOF pass).
 */
export function zoomBlurAt(dist: number | null, tier: number, dof: boolean): ZoomBlur {
  if (dist === null || !Number.isFinite(dist)) {
    const ts = LIGHTING.tiltShift;
    const t = Math.max(0, Math.min(3, Math.round(tier)));
    const r = POST.dofFocusRange;
    if (t < 3) return { band: ts[t].band, blur: ts[t].blur, bokeh: 0, focusRange: r };
    return dof
      ? { band: 0, blur: 0, bokeh: ts[3].blur / 2, focusRange: r }
      : { band: 0.25, blur: ts[3].blur, bokeh: 0, focusRange: r };
  }
  const k = POST_ZOOM.knots;
  let i = 1;
  while (i < k.length - 1 && dist < k[i][0]) i++;
  const [d0, b0, m0, h0, k0] = k[i - 1];
  const [d1, b1, m1, h1, k1] = k[i];
  const f = Math.max(0, Math.min(1, (d0 - dist) / (d0 - d1)));
  const lerp = (a: number, b: number): number => a + (b - a) * f;
  return {
    band: lerp(b0, b1),
    blur: dof ? lerp(h0, h1) : lerp(m0, m1),
    bokeh: dof ? lerp(k0, k1) : 0,
    focusRange: Math.max(POST.dofFocusRange, POST_ZOOM.dofRangeScale * dist),
  };
}

/**
 * Tilt-shift band centre (effect units, −1..1) for the orbit target at NDC height `ndcY`, clamped to
 * ±maxOffset and quantised to 1e-3 (a target on the screen centre gives exactly 0).
 */
export function bandOffset(ndcY: number): number {
  if (!Number.isFinite(ndcY)) return 0;
  const m = POST_ZOOM.maxOffset;
  return Math.round(Math.max(-m, Math.min(m, ndcY)) * 1000) / 1000 || 0;
}
