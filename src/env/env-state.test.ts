import { describe, expect, it } from 'vitest';
import { createEnvState, hexToLinear, luminance, sampleEnv } from './env-state.ts';
import { MOON } from '../content/lighting.ts';

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

describe('env state — sky bodies and night lights (TASK-171)', () => {
  const angle = (a: { x: number; y: number; z: number }, b: typeof a): number =>
    Math.acos(Math.min(1, Math.max(-1, a.x * b.x + a.y * b.y + a.z * b.z)));

  it('key light never jumps (smooth sun → moon handover)', () => {
    const prev = createEnvState();
    const cur = createEnvState();
    sampleEnv(0, prev);
    for (let h = 0.02; h < 24; h += 0.02) {
      sampleEnv(h, cur);
      // 0.02 h = 0.5 s real time; the dusk/dawn handover (light dimmed) may turn ≤ 3.5° per step
      expect(angle(prev.sunDir, cur.sunDir)).toBeLessThan((3.5 * Math.PI) / 180);
      Object.assign(prev.sunDir, cur.sunDir);
    }
  });

  it('moon is up and visible at night, hidden by day; stars only at night', () => {
    const n = sampleEnv(22, createEnvState());
    expect(n.moonDir.y).toBeGreaterThan(0.4);
    expect(n.moonVis).toBeGreaterThan(0.99);
    expect(n.starAlpha).toBeGreaterThan(0.99);
    const d = sampleEnv(12, createEnvState());
    expect(d.moonVis).toBe(0);
    expect(d.starAlpha).toBe(0);
    expect(d.sunSkyDir.y).toBeGreaterThan(0.8);
    // the sky sun is below the horizon at midnight, the key light is not
    const m = sampleEnv(0, createEnvState());
    expect(m.sunSkyDir.y).toBeLessThan(0);
    expect(m.sunDir.y).toBeGreaterThanOrEqual(0.12 - 1e-6);
  });

  it('moon sits roughly opposite the sun at night', () => {
    const s = sampleEnv(21.5, createEnvState());
    const dot =
      s.moonDir.x * s.sunSkyDir.x + s.moonDir.y * s.sunSkyDir.y + s.moonDir.z * s.sunSkyDir.z;
    expect(dot).toBeLessThan(0);
  });

  it('lamps: off by day, staggered on in the evening, late switch-off, off at dawn', () => {
    expect(sampleEnv(12, createEnvState()).lamps).toBe(0);
    const ev = sampleEnv(19.1, createEnvState());
    expect(ev.lamps).toBeGreaterThan(0.2);
    expect(ev.lamps).toBeLessThan(0.8);
    const night = sampleEnv(22, createEnvState());
    expect(night.lamps).toBe(1);
    expect(night.lampsLateOff).toBe(0);
    expect(night.beam).toBe(1);
    expect(night.bloom).toBe(1);
    expect(sampleEnv(23.8, createEnvState()).lampsLateOff).toBe(1);
    expect(sampleEnv(2, createEnvState()).lampsLateOff).toBe(1);
    const morning = sampleEnv(7, createEnvState());
    expect(morning.lamps).toBe(0);
    expect(morning.beam).toBe(0);
    expect(morning.bloom).toBe(0);
  });

  it('beam fades over the bible window 18:30–06:30', () => {
    expect(sampleEnv(18.4, createEnvState()).beam).toBe(0);
    expect(sampleEnv(19, createEnvState()).beam).toBe(1);
    expect(sampleEnv(6, createEnvState()).beam).toBe(1);
    expect(sampleEnv(6.6, createEnvState()).beam).toBe(0);
  });
});

describe('env state — night key light', () => {
  it('is the art-directed MOON.nightKey at night, the sun at noon', () => {
    const k = MOON.nightKey;
    const l = Math.hypot(k[0], k[1], k[2]);
    const n = sampleEnv(23, createEnvState());
    expect(n.keyBlend).toBe(1);
    expect(n.sunDir.x).toBeCloseTo(k[0] / l, 5);
    expect(n.sunDir.y).toBeCloseTo(k[1] / l, 5);
    expect(n.sunDir.z).toBeCloseTo(k[2] / l, 5);
    const d = sampleEnv(12, createEnvState());
    expect(d.keyBlend).toBe(0);
    expect(d.sunDir.y).toBeCloseTo(d.sunSkyDir.y, 5);
  });
});
