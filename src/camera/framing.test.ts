import { describe, expect, it } from 'vitest';
import { azimuthToward, fitOrbit, fractionInFrame, projectNdc, ringPoints } from './framing.ts';

const view = { fov: 35, aspect: 16 / 9 };
const o = { x: 0, y: 0, depth: 0 };

describe('framing', () => {
  it('projects the target to the frame centre and +x to the right at azimuth 0', () => {
    const pose = { tx: 5, ty: 0, tz: -3, dist: 100, pitch: 45, az: 0 };
    projectNdc(pose, view, { x: 5, y: 0, z: -3 }, o);
    expect(o.x).toBeCloseTo(0, 6);
    expect(o.y).toBeCloseTo(0, 6);
    expect(o.depth).toBeCloseTo(100, 6);
    projectNdc(pose, view, { x: 15, y: 0, z: -3 }, o);
    expect(o.x).toBeGreaterThan(0);
    // farther from the camera (−z at azimuth 0) = higher in the frame
    projectNdc(pose, view, { x: 5, y: 0, z: -30 }, o);
    expect(o.y).toBeGreaterThan(0);
  });

  it('puts a point at the vertical half-FOV on the frame edge', () => {
    const pose = { tx: 0, ty: 0, tz: 0, dist: 50, pitch: 0, az: 90 };
    const h = 50 * Math.tan((17.5 * Math.PI) / 180);
    projectNdc(pose, view, { x: 0, y: h, z: 0 }, o);
    expect(o.y).toBeCloseTo(1, 6);
  });

  it('azimuthToward puts the camera on the side rotY points to', () => {
    for (const r of [0, 0.7, 2, -2.5]) {
      const az = (azimuthToward(r) * Math.PI) / 180;
      expect(Math.sin(az)).toBeCloseTo(Math.cos(r), 6);
      expect(Math.cos(az)).toBeCloseTo(Math.sin(r), 6);
    }
  });

  it('fits a ring inside the safe area, centred, at the smallest distance', () => {
    const pts = ringPoints(40, -20, 60, 0, 24);
    const safe = { top: 0.1, bottom: 0.2, left: 0.05, right: 0.05 };
    const pose = fitOrbit(pts, {
      view,
      safe,
      az: 25,
      pitchAt: () => 58,
      minDist: 50,
      maxDist: 2000,
      ty: 0,
    });
    expect(pose.fits).toBe(true);
    let y0 = Infinity;
    let y1 = -Infinity;
    for (const p of pts) {
      projectNdc(pose, view, p, o);
      expect(Math.abs(o.x)).toBeLessThanOrEqual(1 - 2 * 0.05 + 1e-3);
      y0 = Math.min(y0, o.y);
      y1 = Math.max(y1, o.y);
    }
    // tight on the limiting axis (vertical here): within 1 % of the safe height
    expect(y1).toBeLessThanOrEqual(1 - 2 * 0.1 + 1e-3);
    expect(y0).toBeGreaterThanOrEqual(-1 + 2 * 0.2 - 1e-3);
    expect(y1 - y0).toBeGreaterThan((1 - 2 * 0.1 - (-1 + 2 * 0.2)) * 0.98);
    expect(fractionInFrame(pose, view, pts)).toBe(1);
  });

  it('is deterministic', () => {
    const pts = ringPoints(0, 0, 30, 2, 12);
    const opts = {
      view,
      safe: { top: 0.05, bottom: 0.05, left: 0.05, right: 0.05 },
      az: -40,
      pitchAt: (d: number) => 30 + d * 0.05,
      minDist: 20,
      maxDist: 400,
      ty: 0,
    };
    expect(fitOrbit(pts, opts)).toEqual(fitOrbit(pts, opts));
  });
});
