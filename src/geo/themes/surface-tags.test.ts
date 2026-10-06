import { describe, expect, it } from 'vitest';
import { buildProp } from '../registry.ts';
import { OFFICE_INTERIOR_SHELLS } from '../../content/offices.ts';
import { MOTION_TAG, SURFACE } from '../../content/activity.ts';

/** TASK-384 tag channel (`aSpin.w`) on the theme geometry. */
const tags = (id: string, v: number, lod: 0 | 1 = 0): number[] => {
  const s = buildProp(id, 7, v, lod).getAttribute('aSpin');
  return Array.from({ length: s.count }, (_, i) => s.getW(i));
};

describe('animated-surface tags (TASK-384)', () => {
  it('interior monitors carry the department kind with uv in [0, 1]; racks are LED strips', () => {
    const dc = OFFICE_INTERIOR_SHELLS.indexOf('dataCenter');
    const dev = OFFICE_INTERIOR_SHELLS.indexOf('devOffice');
    const g = buildProp('officeInterior', 7, dev, 0);
    const s = g.getAttribute('aSpin');
    let code = 0;
    for (let i = 0; i < s.count; i++) {
      if (s.getW(i) !== -SURFACE.code) continue;
      code++;
      expect(s.getX(i)).toBeGreaterThanOrEqual(-1e-4);
      expect(s.getX(i)).toBeLessThanOrEqual(1 + 1e-4);
      expect(s.getY(i)).toBeGreaterThanOrEqual(-1e-4);
      expect(s.getY(i)).toBeLessThanOrEqual(1 + 1e-4);
      expect(s.getZ(i)).toBeGreaterThan(1); // aspect of a landscape monitor
    }
    expect(code).toBe(12 * 7); // 6 desks × 2 screens + 2 back-wall dashboards (M14c), 2 triangles each
    const w = tags('officeInterior', dc);
    expect(w).toContain(-SURFACE.terminal);
    expect(w).toContain(-SURFACE.led);
  });

  it('billboard board = slides, art shares its uv with a negative aspect', () => {
    for (const lod of [0, 1] as const) {
      const s = buildProp('billboardV2', 7, 0, lod).getAttribute('aSpin');
      let board = 0;
      let art = 0;
      for (let i = 0; i < s.count; i++)
        if (s.getW(i) === -SURFACE.slides) {
          if (s.getZ(i) > 0) board++;
          else art++;
        }
      expect(board).toBe(6);
      expect(art).toBeGreaterThan(0);
    }
  });

  it('pipes pulse along a unit axis; rack rows blink; turbines yaw; solar rows track', () => {
    for (let v = 0; v < 3; v++) {
      const s = buildProp('pipe', 7, v, 0).getAttribute('aSpin');
      let n = 0;
      for (let i = 0; i < s.count; i++)
        if (s.getW(i) === -SURFACE.pulse) {
          n++;
          expect(Math.hypot(s.getX(i), s.getY(i), s.getZ(i))).toBeCloseTo(1, 5);
        }
      expect(n).toBeGreaterThan(0);
    }
    for (let v = 0; v < 2; v++) expect(tags('rackRow', v)).toContain(-SURFACE.led);
    const t = tags('windTurbine', 0);
    expect(t).toContain(MOTION_TAG.yaw);
    expect(t).toContain(MOTION_TAG.yawSpin);
    const tracker = tags('solarRow', 0).filter((w) => w > MOTION_TAG.tracker - 0.5);
    expect(tracker.length).toBeGreaterThan(0);
    // rest tilt 0.45 rad encoded as w = 4 + tilt / π
    expect((tracker[0] - MOTION_TAG.tracker) * Math.PI).toBeCloseTo(0.45, 5);
  });
});
