import { describe, expect, it } from 'vitest';
import { sunSkyDir } from '../../env/env-state.ts';
import { stainedDayGlow } from './activity-glsl.ts';

/** Stained glass day term (TASK-440): a low sun shines through, a high one does not. */
describe('stained glass transmission', () => {
  const sun = (h: number) => sunSkyDir(h, { x: 0, y: 0, z: 0 });
  // the sun rises in the east (−x): a pane's west face (+x) is its shaded, lit-through side
  const west = { x: 1, y: 0, z: 0 };
  const east = { x: -1, y: 0, z: 0 };

  it('lights the shaded face of a pane at dawn', () => {
    expect(stainedDayGlow(west, sun(6))).toBeGreaterThan(0.5);
    expect(stainedDayGlow(east, sun(6))).toBeLessThan(0.05);
  });

  it('is about zero at noon and at night', () => {
    for (const n of [west, east, { x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: -1 }])
      expect(stainedDayGlow(n, sun(12))).toBeLessThan(0.05);
    expect(stainedDayGlow(west, sun(23))).toBe(0);
  });

  it('glints off the sunlit face toward a camera with the sun at its back (TASK-453b)', () => {
    const s = sun(17.5);
    // camera on the sun's side, a little off its line: the pane facing it gets no light through
    const l = Math.hypot(1, 0.3, 0.6);
    const v = { x: 1 / l, y: 0.3 / l, z: 0.6 / l };
    expect(stainedDayGlow(v, s)).toBeLessThan(0.15);
    expect(stainedDayGlow(v, s, v)).toBeGreaterThan(0.5);
    // a pane facing away from both keeps only its (through-light) term
    const away = { x: -v.x, y: -v.y, z: -v.z };
    expect(stainedDayGlow(away, s, v)).toBeCloseTo(stainedDayGlow(away, s), 2);
    // high noon: no glint either
    expect(stainedDayGlow({ x: 0, y: 1, z: 0 }, sun(12), { x: 0, y: 1, z: 0 })).toBeLessThan(0.05);
  });

  it('turns to the east face in the golden hour', () => {
    expect(stainedDayGlow(east, sun(18))).toBeGreaterThan(0.5);
    expect(stainedDayGlow(west, sun(18))).toBeLessThan(0.05);
  });
});
