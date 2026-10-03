import { describe, expect, it } from 'vitest';
import { gustAt, swellY } from './fields.ts';

describe('shared fields', () => {
  it('swell is bounded and time-varying', () => {
    const p = { amplitude: 0.15, period: 7, dir: 0.4 };
    let max = 0;
    for (let i = 0; i < 500; i++)
      max = Math.max(max, Math.abs(swellY(i * 1.3, i * 0.7, i * 0.1, p)));
    expect(max).toBeLessThanOrEqual(0.15 + 1e-6);
    expect(max).toBeGreaterThan(0.1);
    expect(swellY(10, 10, 0, p)).not.toBeCloseTo(swellY(10, 10, 2, p), 3);
  });
  it('gust is in [0,1]', () => {
    const p = { dir: 1, speed: 6, wavelength: 40, strength: 1 };
    for (let i = 0; i < 500; i++) {
      const g = gustAt(i * 2.1, -i, i * 0.3, p);
      expect(g).toBeGreaterThanOrEqual(0);
      expect(g).toBeLessThanOrEqual(1);
    }
  });
});
