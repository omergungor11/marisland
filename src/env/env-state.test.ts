import { describe, expect, it } from 'vitest';
import { createEnvState, hexToLinear, luminance, sampleEnv } from './env-state.ts';

describe('env state', () => {
  it('samples the bible keys exactly at key hours', () => {
    const s = sampleEnv(12, createEnvState());
    expect(s.sunIntensity).toBeCloseTo(3);
    expect(s.night).toBe(0);
    const n = sampleEnv(23, createEnvState());
    expect(n.night).toBe(1);
    expect(n.sunIntensity).toBeCloseTo(0.6);
  });
  it('wraps midnight smoothly into dawn', () => {
    const a = sampleEnv(3, createEnvState());
    const b = sampleEnv(5, createEnvState());
    expect(a.night).toBeGreaterThan(0.9);
    expect(b.night).toBeLessThanOrEqual(1);
    expect(sampleEnv(6.2, createEnvState()).night).toBeLessThan(0.15);
  });
  it('sun stays above the horizon and is high at noon', () => {
    for (let h = 0; h < 24; h += 0.25) {
      const s = sampleEnv(h, createEnvState());
      expect(s.sunDir.y).toBeGreaterThanOrEqual(0.12 - 1e-6);
      expect(Math.hypot(s.sunDir.x, s.sunDir.y, s.sunDir.z)).toBeCloseTo(1, 5);
    }
    expect(sampleEnv(12, createEnvState()).sunDir.y).toBeGreaterThan(0.8);
  });
  it('golden peaks around 17:50', () => {
    expect(sampleEnv(17.9, createEnvState()).golden).toBeGreaterThan(0.95);
    expect(sampleEnv(12, createEnvState()).golden).toBe(0);
  });
  it('hex → linear and luminance', () => {
    expect(luminance(hexToLinear('#FFFFFF'))).toBeCloseTo(1);
    expect(luminance(hexToLinear('#000000'))).toBe(0);
  });
});
