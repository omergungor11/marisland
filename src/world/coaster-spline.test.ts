/** TASK-540: coaster centreline (centripetal Catmull-Rom, arc-length table, parallel-transport frame). */
import { describe, expect, it } from 'vitest';
import {
  QA_COASTER_FIXTURE as FX,
  QA_COASTER_FIXTURE_LOOP as LOOP,
} from '../content/themes/qa-coaster.ts';
import {
  createCoasterSpline,
  newCoasterSample,
  sampleCoaster,
  wrapCoasterS,
} from './coaster-spline.ts';

const sp = createCoasterSpline(FX.points, { closed: FX.closed });
const dot = (a: ArrayLike<number>, b: ArrayLike<number>): number =>
  a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

describe('TASK-540 coaster spline', () => {
  it('is a closed lap that starts on the first control point', () => {
    expect(sp.closed).toBe(true);
    expect(sp.length).toBeGreaterThan(150);
    expect(sp.length).toBeLessThan(400);
    const a = sampleCoaster(sp, 0);
    expect(a.pos).toEqual([FX.points[0][0], FX.points[0][1], FX.points[0][2]]);
    const b = sampleCoaster(sp, sp.length);
    expect(b.pos[0]).toBeCloseTo(a.pos[0], 6);
    expect(b.pos[1]).toBeCloseTo(a.pos[1], 6);
    expect(b.pos[2]).toBeCloseTo(a.pos[2], 6);
    expect(wrapCoasterS(sp, -1)).toBeCloseTo(sp.length - 1, 9);
  });

  it('passes through every control point, in order', () => {
    expect(sp.controlS).toHaveLength(FX.points.length);
    for (let i = 1; i < sp.controlS.length; i++)
      expect(sp.controlS[i]).toBeGreaterThan(sp.controlS[i - 1]);
    const out = newCoasterSample();
    FX.points.forEach((p, i) => {
      sampleCoaster(sp, sp.controlS[i], out);
      expect(
        Math.hypot(out.pos[0] - p[0], out.pos[1] - p[1], out.pos[2] - p[2]),
        `#${i}`,
      ).toBeLessThan(0.06);
    });
  });

  it('arc length is uniform: points `ds` apart on the table are ds apart in space (to chord error)', () => {
    let worst = 0;
    for (let i = 0; i < sp.n; i++) {
      const d = Math.hypot(
        sp.pos[i * 3 + 3] - sp.pos[i * 3],
        sp.pos[i * 3 + 4] - sp.pos[i * 3 + 1],
        sp.pos[i * 3 + 5] - sp.pos[i * 3 + 2],
      );
      worst = Math.max(worst, Math.abs(d - sp.ds) / sp.ds);
    }
    expect(worst).toBeLessThan(0.05);
  });

  it('frame is orthonormal everywhere and never flips (no jump between neighbours)', () => {
    const o = newCoasterSample();
    const prev = newCoasterSample();
    let maxStepAngle = 0;
    let minUpY = 1;
    let maxUpY = -1;
    for (let s = 0; s <= sp.length; s += 0.1) {
      sampleCoaster(sp, s, o);
      expect(Math.hypot(...o.tangent)).toBeCloseTo(1, 6);
      expect(Math.hypot(...o.up)).toBeCloseTo(1, 6);
      expect(Math.abs(dot(o.up, o.tangent))).toBeLessThan(1e-6);
      expect(Math.abs(dot(o.side, o.up))).toBeLessThan(1e-6);
      if (s > 0) {
        maxStepAngle = Math.max(maxStepAngle, Math.acos(Math.min(1, dot(o.up, prev.up))));
      }
      minUpY = Math.min(minUpY, o.up[1]);
      maxUpY = Math.max(maxUpY, o.up[1]);
      prev.up = [...o.up];
    }
    // 0.1 u steps: the loop (r 3.6), the camelback crests and the snap-back leaving the loop stay < 0.15 rad per step
    expect(maxStepAngle).toBeLessThan(0.15);
    // upright on the straights, upside down at the loop top
    expect(maxUpY).toBeGreaterThan(0.98);
    expect(minUpY).toBeLessThan(-0.85);
  });

  it('the loop is inverted at its top, vertical on its sides, and the twist is small', () => {
    const topS =
      sp.controlS[FX.points.findIndex((p) => Math.abs(p[1] - (1.5 + 2 * LOOP.radius)) < 1e-6)];
    const o = sampleCoaster(sp, topS);
    expect(o.up[1]).toBeLessThan(-0.85);
    expect(o.tangent[0]).toBeLessThan(-0.95); // heading back over the top
    expect(sp.twist).toBeLessThan(1.5);
  });

  it('tangent matches the finite difference of position', () => {
    const o = newCoasterSample();
    const a = newCoasterSample();
    const b = newCoasterSample();
    for (let s = 3; s < sp.length - 3; s += 7.3) {
      sampleCoaster(sp, s, o);
      sampleCoaster(sp, s - 0.2, a);
      sampleCoaster(sp, s + 0.2, b);
      const fd = [b.pos[0] - a.pos[0], b.pos[1] - a.pos[1], b.pos[2] - a.pos[2]];
      const l = Math.hypot(...fd);
      expect(dot(o.tangent, [fd[0] / l, fd[1] / l, fd[2] / l])).toBeGreaterThan(0.999);
    }
  });

  it('is deterministic and an open spline clamps', () => {
    const again = createCoasterSpline(FX.points, { closed: true });
    expect(Array.from(again.pos.slice(0, 30))).toEqual(Array.from(sp.pos.slice(0, 30)));
    const open = createCoasterSpline(FX.points.slice(0, 14), { closed: false });
    expect(open.twist).toBeGreaterThanOrEqual(0);
    expect(sampleCoaster(open, -5).s).toBe(0);
    expect(sampleCoaster(open, 1e6).s).toBeCloseTo(open.length, 9);
    expect(open.controlS[open.controlS.length - 1]).toBeCloseTo(open.length, 6);
  });
});
