import { describe, expect, it } from 'vitest';
import { introPose, monotoneCubic } from './intro.ts';
import { INTRO } from '../content/ui.ts';

// a postcard-like final pose (TASK-392): low look-down, target on the view ray
const ov = { tx: 10, ty: 20, tz: -20, dist: 450, pitch: 13, az: -10 };

describe('intro spline', () => {
  it('monotone cubic hits keys, keeps holds flat and never overshoots', () => {
    const xs = [0, 1, 2, 3];
    const ys = [0, 10, 10, 4];
    expect(monotoneCubic(xs, ys, 1)).toBeCloseTo(10);
    expect(monotoneCubic(xs, ys, 1.5)).toBeCloseTo(10);
    for (let x = 0; x <= 3; x += 0.01) {
      const y = monotoneCubic(xs, ys, x);
      expect(y).toBeGreaterThanOrEqual(-1e-9);
      expect(y).toBeLessThanOrEqual(10 + 1e-9);
    }
  });
  it('lands exactly on the final (postcard) pose at the end', () => {
    const p = introPose(INTRO.duration, ov, 100, 100);
    expect(p).toEqual(ov);
  });
  it('follows the bible §8 beats', () => {
    const p0 = introPose(0, ov, 100, 100);
    expect(p0.pitch).toBe(80);
    // By 3 s the reveal is at 900 u and still top-down.
    const p3 = introPose(3, ov, 100, 100);
    expect(p3.dist).toBeCloseTo(900);
    expect(p3.pitch).toBeCloseTo(80);
    // 6.5 s: swooped down to 440 u, tilted to 50°, near the final heading.
    const p65 = introPose(6.5, ov, 100, 100);
    expect(p65.dist).toBeCloseTo(440);
    expect(p65.pitch).toBeCloseTo(50);
    // 8.5 s: pushed low toward the hero island.
    const p85 = introPose(8.5, ov, 100, 100);
    expect(p85.dist).toBeCloseTo(365);
    expect(p85.tx).toBeGreaterThan(ov.tx);
    // 9.7 s: 2 % past the final distance (the settle overshoot).
    expect(introPose(9.7, ov, 100, 100).dist).toBeCloseTo(ov.dist * (1 - INTRO.settleOvershoot));
  });
  it('tilts onto the postcard without a jerk (pitch speed and acceleration bounded)', () => {
    const dt = 1 / 60;
    let prev = introPose(0, ov, 100, 100).pitch;
    let prevV = 0;
    let maxV = 0;
    for (let t = dt; t <= INTRO.duration; t += dt) {
      const p = introPose(t, ov, 100, 100).pitch;
      const v = (p - prev) / dt;
      maxV = Math.max(maxV, Math.abs(v));
      // ≤ 1.5°/s change of angular speed per frame (≈ 90°/s²)
      expect(Math.abs(v - prevV)).toBeLessThan(1.5);
      prev = p;
      prevV = v;
    }
    // never faster than a calm tilt
    expect(maxV).toBeLessThan(30);
  });
  it('is smooth (no velocity jumps between frames)', () => {
    let prev = introPose(0, ov, 100, 100).dist;
    let prevV = 0;
    const dt = 1 / 60;
    for (let t = dt; t <= INTRO.duration; t += dt) {
      const d = introPose(t, ov, 100, 100).dist;
      const v = (d - prev) / dt;
      expect(Math.abs(v - prevV) * dt).toBeLessThan(12);
      prev = d;
      prevV = v;
    }
  });
});
