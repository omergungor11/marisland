import { describe, expect, it } from 'vitest';
import { hypotLess } from './index.ts';
import { createRng } from '../rng.ts';

describe('hypotLess (TASK-553)', () => {
  it('equals Math.hypot(dx, dz) < r, also on the boundary and odd inputs', () => {
    const rng = createRng(553);
    const odd = [0, -0, 1e-200, 1e-120, 1e120, Infinity, -Infinity, NaN, -3, 3];
    for (const dx of odd)
      for (const dz of odd)
        for (const r of odd) expect(hypotLess(dx, dz, r)).toBe(Math.hypot(dx, dz) < r);
    for (let k = 0; k < 200_000; k++) {
      const dx = rng.range(-400, 400);
      const dz = rng.range(-400, 400);
      const h = Math.hypot(dx, dz);
      // r within a few ulp of the distance, or anywhere
      const r = k % 2 ? h * (1 + (rng.next() - 0.5) * 1e-15) : rng.range(-1, 600);
      expect(hypotLess(dx, dz, r)).toBe(h < r);
    }
  });
});
