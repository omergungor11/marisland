import { describe, expect, it } from 'vitest';
import { LIGHTING } from '../../content/palette.ts';
import { POST, POST_ZOOM } from '../../content/lighting.ts';
import { bandOffset, zoomBlurAt } from './zoom-blur.ts';

/** TASK-586: zoom-in blur continuous in orbit distance, weakening as you zoom in; T0 / T1 kept. */
describe('zoomBlurAt', () => {
  const ts = LIGHTING.tiltShift;
  const tierOf = (d: number): number => (d >= 380 ? 0 : d >= 140 ? 1 : d >= 45 ? 2 : 3);

  it('keeps T0 off and the T1 row over 380–140 u (W1, postcard, W4)', () => {
    for (const dof of [false, true]) {
      expect(zoomBlurAt(450, 0, dof)).toMatchObject({ blur: 0, bokeh: 0 });
      for (const d of [380, 260, 140])
        expect(zoomBlurAt(d, 1, dof)).toMatchObject({
          band: ts[1].band,
          blur: ts[1].blur,
          bokeh: 0,
        });
    }
  });

  it('has no step anywhere from 800 u down to 4 u', () => {
    for (const dof of [false, true]) {
      let prev = zoomBlurAt(800, 0, dof);
      for (let d = 799.5; d >= 4; d -= 0.5) {
        const z = zoomBlurAt(d, tierOf(d), dof);
        expect(Math.abs(z.band - prev.band)).toBeLessThan(0.01);
        expect(Math.abs(z.blur - prev.blur)).toBeLessThan(0.1);
        expect(Math.abs(z.bokeh - prev.bokeh)).toBeLessThan(0.15);
        prev = z;
      }
    }
  });

  it('only sharpens below 380 u: tilt band and blur never grow as the camera closes in', () => {
    for (const dof of [false, true]) {
      let prev = zoomBlurAt(380, 1, dof);
      for (let d = 379; d >= 4; d -= 1) {
        const z = zoomBlurAt(d, tierOf(d), dof);
        expect(z.band).toBeLessThanOrEqual(prev.band + 1e-9);
        expect(z.blur).toBeLessThanOrEqual(prev.blur + 1e-9);
        prev = z;
      }
    }
  });

  it('ignores the tier (hysteresis cannot make a blur stick)', () => {
    for (const d of [400, 150, 130, 60, 42, 20])
      for (const dof of [false, true]) expect(zoomBlurAt(d, 0, dof)).toEqual(zoomBlurAt(d, 3, dof));
  });

  it('hands tilt over to a weak DOF on high only near the minimum orbit distance', () => {
    expect(zoomBlurAt(24, 3, true)).toMatchObject({ bokeh: 0 });
    expect(zoomBlurAt(20, 3, true).bokeh).toBeLessThan(0.5);
    expect(zoomBlurAt(12, 3, true)).toMatchObject({ blur: 0 });
    expect(zoomBlurAt(12, 3, true).bokeh).toBeGreaterThan(0);
    expect(zoomBlurAt(2, 3, true).bokeh).toBeLessThanOrEqual(ts[3].blur / 2);
    expect(zoomBlurAt(12, 3, false)).toMatchObject({ bokeh: 0 });
    expect(zoomBlurAt(12, 3, false).blur).toBeGreaterThan(0);
  });

  it('scales the DOF focus range with distance, floored at dofFocusRange', () => {
    expect(zoomBlurAt(4, 3, true).focusRange).toBe(POST.dofFocusRange);
    expect(zoomBlurAt(20, 3, true).focusRange).toBe(20 * POST_ZOOM.dofRangeScale);
  });

  it('falls back to the old per-tier steps without a distance', () => {
    expect(zoomBlurAt(null, 2, false)).toMatchObject({ band: ts[2].band, blur: ts[2].blur });
    expect(zoomBlurAt(null, 3, true)).toMatchObject({ band: 0, blur: 0, bokeh: ts[3].blur / 2 });
    expect(zoomBlurAt(null, 3, false)).toMatchObject({ band: 0.25, blur: ts[3].blur, bokeh: 0 });
  });
});

describe('bandOffset', () => {
  it('centres the band on the target, clamped and quantised', () => {
    expect(bandOffset(0)).toBe(0);
    expect(bandOffset(-1e-7)).toBe(0);
    expect(bandOffset(0.2)).toBeCloseTo(0.2);
    expect(bandOffset(5)).toBe(POST_ZOOM.maxOffset);
    expect(bandOffset(-5)).toBe(-POST_ZOOM.maxOffset);
    expect(bandOffset(NaN)).toBe(0);
  });
});
