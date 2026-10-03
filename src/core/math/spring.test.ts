import { describe, expect, it } from 'vitest';
import { springIn, springOvershoot, stepSpring } from './spring.ts';

describe('spring', () => {
  it('bloom-in spring k=180 c=17 overshoots ≈8 % with first peak ≈300 ms (D-008)', () => {
    const o = springOvershoot(180, 17);
    expect(o).toBeGreaterThan(0.05);
    expect(o).toBeLessThan(0.12);
    expect(springIn(1.0, 180, 17)).toBeCloseTo(1, 2);
    expect(springIn(0, 180, 17)).toBe(0);
    // first peak near 300 ms
    let peakT = 0;
    let peak = 0;
    for (let t = 0; t < 1; t += 1 / 1000) {
      const v = springIn(t, 180, 17);
      if (v > peak) {
        peak = v;
        peakT = t;
      }
    }
    expect(peakT).toBeGreaterThan(0.25);
    expect(peakT).toBeLessThan(0.35);
  });

  it('closed form matches the stepped integrator', () => {
    const s = { x: 0, v: 0 };
    let t = 0;
    const dt = 1 / 240;
    let maxErr = 0;
    for (let i = 0; i < 480; i++) {
      stepSpring(s, 1, 180, 12, dt);
      t += dt;
      maxErr = Math.max(maxErr, Math.abs(s.x - springIn(t, 180, 12)));
    }
    expect(maxErr).toBeLessThan(0.03);
  });
});
