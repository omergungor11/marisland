import { describe, expect, it } from 'vitest';
import { perfPathPose } from './perf-path.ts';
import type { OrbitPose } from './controls.ts';

const pose = (tx: number, dist: number, pitch: number, az: number): OrbitPose => ({
  tx,
  ty: 0,
  tz: 0,
  dist,
  pitch,
  az,
});

describe('perfPathPose', () => {
  const keys = [
    pose(0, 450, 58, 25),
    pose(100, 80, 40, 170),
    pose(110, 18, 25, -170),
    pose(0, 450, 58, 25),
  ];
  const out = pose(0, 0, 0, 0);

  it('hits every key at its time and clamps outside the path', () => {
    for (let i = 0; i < keys.length; i++) {
      const p = perfPathPose(keys, 9, i * 3, out);
      expect(p.tx).toBeCloseTo(keys[i].tx);
      expect(p.dist).toBeCloseTo(keys[i].dist);
      expect(p.pitch).toBeCloseTo(keys[i].pitch);
    }
    expect(perfPathPose(keys, 9, -5, out).dist).toBeCloseTo(450);
    expect(perfPathPose(keys, 9, 50, out).dist).toBeCloseTo(450);
  });

  it('interpolates distance in log space and azimuth the short way', () => {
    const p = perfPathPose(keys, 9, 4.5, out); // middle of leg 2: 80 → 18
    expect(p.dist).toBeCloseTo(Math.sqrt(80 * 18));
    // 170 → −170 goes through 180, not through 0
    expect(Math.abs(p.az)).toBeGreaterThan(170);
  });

  it('is a pure function of time', () => {
    const a = { ...perfPathPose(keys, 10, 3.7, out) };
    perfPathPose(keys, 10, 8.1, out);
    expect(perfPathPose(keys, 10, 3.7, out)).toEqual(a);
  });
});
