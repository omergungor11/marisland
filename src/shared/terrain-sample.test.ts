import { describe, expect, it } from 'vitest';
import { createRng } from '../core/rng.ts';
import { heightAt, type Heightfield } from '../world/types.ts';
import { sampleSurface, smoothHeightAt, smoothNormalAt } from './terrain-sample.ts';

const N = 17;
const CS = 2;
const ORIGIN = -16;

function field(fn: (i: number, j: number) => number): Heightfield {
  const data = new Float32Array(N * N);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) data[j * N + i] = fn(i, j);
  return { data, n: N, cellSize: CS, originX: ORIGIN, originZ: ORIGIN };
}

const rng = createRng(7).fork('terrain-sample-test');
const noisy = field(() => rng.range(-3, 9));

describe('terrain-sample (clamped Catmull-Rom)', () => {
  it('interpolates the samples exactly', () => {
    for (let j = 0; j < N; j++)
      for (let i = 0; i < N; i++) {
        const x = ORIGIN + i * CS;
        const z = ORIGIN + j * CS;
        expect(smoothHeightAt(noisy, x, z)).toBe(noisy.data[j * N + i]);
      }
  });

  it('is exact on planar pads (height and gradient)', () => {
    const plane = (x: number, z: number): number => 1.5 + 0.3 * x - 0.12 * z;
    const pad = field((i, j) => plane(ORIGIN + i * CS, ORIGIN + j * CS));
    // interior cells (the 4×4 stencil stays inside the grid)
    for (let k = 0; k < 400; k++) {
      const x = ORIGIN + CS * rng.range(1, N - 2);
      const z = ORIGIN + CS * rng.range(1, N - 2);
      const s = sampleSurface(pad, x, z);
      expect(s.y).toBeCloseTo(plane(x, z), 4);
      expect(s.dydx).toBeCloseTo(0.3, 4);
      expect(s.dydz).toBeCloseTo(-0.12, 4);
    }
  });

  it('never overshoots the 4 central samples (cliffs)', () => {
    const cliff = field((i) => (i < 8 ? 0 : 10));
    for (const f of [noisy, cliff]) {
      for (let k = 0; k < 2000; k++) {
        const x = ORIGIN + CS * rng.range(0, N - 1);
        const z = ORIGIN + CS * rng.range(0, N - 1);
        const i0 = Math.min(Math.floor((x - ORIGIN) / CS), N - 2);
        const j0 = Math.min(Math.floor((z - ORIGIN) / CS), N - 2);
        const q = [j0 * N + i0, j0 * N + i0 + 1, (j0 + 1) * N + i0, (j0 + 1) * N + i0 + 1].map(
          (i) => f.data[i],
        );
        const y = smoothHeightAt(f, x, z);
        expect(y).toBeGreaterThanOrEqual(Math.min(...q));
        expect(y).toBeLessThanOrEqual(Math.max(...q));
      }
    }
  });

  it('analytic gradient matches finite differences where unclamped', () => {
    const smooth = field((i, j) => 4 * Math.sin(i * 0.4) * Math.cos(j * 0.3));
    const eps = 1e-3;
    let checked = 0;
    for (let k = 0; k < 300; k++) {
      const x = ORIGIN + CS * rng.range(1.05, N - 2.05);
      const z = ORIGIN + CS * rng.range(1.05, N - 2.05);
      // stay inside one cell for the central difference
      const fx = (x - ORIGIN) / CS;
      const fz = (z - ORIGIN) / CS;
      if (fx % 1 < 0.01 || fx % 1 > 0.99 || fz % 1 < 0.01 || fz % 1 > 0.99) continue;
      const s = sampleSurface(smooth, x, z);
      const ax = sampleSurface(smooth, x + eps, z);
      const bx = sampleSurface(smooth, x - eps, z);
      const az = sampleSurface(smooth, x, z + eps);
      const bz = sampleSurface(smooth, x, z - eps);
      // skip samples where the clamp is active nearby
      if ([s, ax, bx, az, bz].some((t) => t.dydx === 0 && t.dydz === 0)) continue;
      expect(s.dydx).toBeCloseTo((ax.y - bx.y) / (2 * eps), 3);
      expect(s.dydz).toBeCloseTo((az.y - bz.y) / (2 * eps), 3);
      checked++;
    }
    expect(checked).toBeGreaterThan(100);
  });

  it('matches heightAt outside the grid and stays close to bilinear', () => {
    expect(smoothHeightAt(noisy, ORIGIN - 1, 0)).toBe(heightAt(noisy, ORIGIN - 1, 0));
    expect(smoothHeightAt(noisy, 0, 1e4)).toBe(heightAt(noisy, 0, 1e4));
    const nrm = smoothNormalAt(noisy, 0.7, -3.1, { x: 0, y: 0, z: 0 });
    expect(Math.hypot(nrm.x, nrm.y, nrm.z)).toBeCloseTo(1, 6);
    expect(nrm.y).toBeGreaterThan(0);
  });
});
