import { describe, expect, it } from 'vitest';
import { pitchForDistance, tierForDistance } from './tier.ts';

describe('tier fsm', () => {
  it('maps distances to tiers', () => {
    expect(tierForDistance(600, 0)).toBe(0);
    expect(tierForDistance(200, 0)).toBe(1);
    expect(tierForDistance(80, 1)).toBe(2);
    expect(tierForDistance(20, 2)).toBe(3);
  });
  it('has 10 % hysteresis', () => {
    // at the T0/T1 boundary (380): zooming in from T0 we stay T0 until 342
    expect(tierForDistance(360, 0)).toBe(0);
    expect(tierForDistance(340, 0)).toBe(1);
    // zooming out from T1 we stay T1 until 418
    expect(tierForDistance(400, 1)).toBe(1);
    expect(tierForDistance(420, 1)).toBe(0);
  });
  it('pitch curve is monotonic and within the bible ranges', () => {
    let prev = -1;
    for (let d = 12; d <= 800; d *= 1.1) {
      const p = pitchForDistance(d);
      expect(p).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = p;
    }
    expect(pitchForDistance(12)).toBeCloseTo(20);
    expect(pitchForDistance(45)).toBeCloseTo(35);
    expect(pitchForDistance(140)).toBeCloseTo(45);
    expect(pitchForDistance(380)).toBeCloseTo(58);
    expect(pitchForDistance(800)).toBeCloseTo(70);
  });
});
