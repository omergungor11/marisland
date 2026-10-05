/**
 * Smooth terrain surface (M14b D-030): Catmull-Rom bicubic over the 2 u heightfield, clamped to the
 * min/max of the 4 samples of the containing cell (no overshoot at cliffs), with its analytic
 * gradient. Pure (no three.js); the render twin of `heightAt` (world/types.ts).
 *
 * - Interpolating: at a sample it returns the sample exactly.
 * - Linear precision: exact on planar pads (CR weights sum to 1 and reproduce linear data), so
 *   buildings on flattened lots stay grounded. Edge rows reuse the border sample (open sea).
 * - World data, hashes and picking keep bilinear `heightAt`; the terrain mesh (TASK-371) and
 *   render-side grounding (TASK-373, where |smooth − bilinear| > 0.02 u) use this surface.
 * Outside the grid: SEABED_Y with a zero gradient (same as `heightAt`).
 */
import { SEABED_Y, type Heightfield } from '../world/types.ts';

export interface SurfaceSample {
  /** Height in u. */
  y: number;
  /** ∂y/∂x and ∂y/∂z (rise per u). Zero where the clamp is active. */
  dydx: number;
  dydz: number;
}

const wx = new Float64Array(4);
const dwx = new Float64Array(4);
const wz = new Float64Array(4);
const dwz = new Float64Array(4);

/** Catmull-Rom weights for p0..p3 at t ∈ [0, 1] and their derivatives d/dt. */
function crWeights(t: number, w: Float64Array, dw: Float64Array): void {
  const t2 = t * t;
  const t3 = t2 * t;
  w[0] = 0.5 * (-t3 + 2 * t2 - t);
  w[1] = 0.5 * (3 * t3 - 5 * t2 + 2);
  w[2] = 0.5 * (-3 * t3 + 4 * t2 + t);
  w[3] = 0.5 * (t3 - t2);
  dw[0] = 0.5 * (-3 * t2 + 4 * t - 1);
  dw[1] = 0.5 * (9 * t2 - 10 * t);
  dw[2] = 0.5 * (-9 * t2 + 8 * t + 1);
  dw[3] = 0.5 * (3 * t2 - 2 * t);
}

/** Smooth surface height + gradient at world (x, z). Allocation-free when `out` is passed. */
export function sampleSurface(
  h: Heightfield,
  x: number,
  z: number,
  out: SurfaceSample = { y: 0, dydx: 0, dydz: 0 },
): SurfaceSample {
  const n = h.n;
  const fx = (x - h.originX) / h.cellSize;
  const fz = (z - h.originZ) / h.cellSize;
  if (fx < 0 || fz < 0 || fx > n - 1 || fz > n - 1) {
    out.y = SEABED_Y;
    out.dydx = 0;
    out.dydz = 0;
    return out;
  }
  const x0 = Math.min(Math.floor(fx), n - 2);
  const z0 = Math.min(Math.floor(fz), n - 2);
  crWeights(fx - x0, wx, dwx);
  crWeights(fz - z0, wz, dwz);
  const d = h.data;
  let y = 0;
  let gx = 0;
  let gz = 0;
  for (let j = 0; j < 4; j++) {
    const row = Math.min(Math.max(z0 - 1 + j, 0), n - 1) * n;
    let r = 0;
    let rd = 0;
    for (let i = 0; i < 4; i++) {
      const v = d[row + Math.min(Math.max(x0 - 1 + i, 0), n - 1)];
      r += wx[i] * v;
      rd += dwx[i] * v;
    }
    y += wz[j] * r;
    gx += wz[j] * rd;
    gz += dwz[j] * r;
  }
  const i00 = z0 * n + x0;
  const a = d[i00];
  const b = d[i00 + 1];
  const c = d[i00 + n];
  const e = d[i00 + n + 1];
  const lo = Math.min(a, b, c, e);
  const hi = Math.max(a, b, c, e);
  if (y < lo || y > hi) {
    out.y = y < lo ? lo : hi;
    out.dydx = 0;
    out.dydz = 0;
    return out;
  }
  out.y = y;
  out.dydx = gx / h.cellSize;
  out.dydz = gz / h.cellSize;
  return out;
}

const scratch: SurfaceSample = { y: 0, dydx: 0, dydz: 0 };

/** Smooth surface height at world (x, z). */
export function smoothHeightAt(h: Heightfield, x: number, z: number): number {
  return sampleSurface(h, x, z, scratch).y;
}

/** Unit surface normal (−∂y/∂x, 1, −∂y/∂z) normalised, written into `out`. */
export function smoothNormalAt(
  h: Heightfield,
  x: number,
  z: number,
  out: { x: number; y: number; z: number },
): { x: number; y: number; z: number } {
  const s = sampleSurface(h, x, z, scratch);
  const l = Math.hypot(s.dydx, 1, s.dydz);
  out.x = -s.dydx / l;
  out.y = 1 / l;
  out.z = -s.dydz / l;
  return out;
}
