import { describe, expect, it } from 'vitest';
import { DETAIL_LAYER_IDS } from '../../content/ground.ts';
import { buildGroundDetail, groundDetailData, verifyGroundDetail } from './ground-detail.ts';

describe('ground detail layers (TASK-372)', () => {
  const d = groundDetailData();

  it('has one layer per DETAIL_LAYER_IDS entry and a full mip chain', () => {
    expect(d.layers).toBe(DETAIL_LAYER_IDS.length);
    expect(d.levels.length).toBe(Math.log2(d.size) + 1);
    for (let l = 0; l < d.levels.length; l++)
      expect(d.levels[l].length).toBe((d.size >> l) ** 2 * 4 * d.layers);
  });

  it('is zero-mean: every layer top mip R/G/B within 1/255 of 0.5; mips are the box filter', () => {
    const v = verifyGroundDetail(d);
    expect(v.maxMeanError).toBeLessThanOrEqual(1 / 255 + 1e-9);
    expect(v.mipsOk).toBe(true);
    const top = d.levels[d.levels.length - 1];
    for (let z = 0; z < d.layers; z++) expect(top[z * 4 + 3] / 255).toBeCloseTo(d.meanA[z], 6);
  });

  it('is tileable: opposite edges continue each other like interior neighbours', () => {
    const n = d.size;
    const L0 = d.levels[0];
    for (let z = 0; z < d.layers; z++) {
      const o = z * n * n * 4;
      let seam = 0;
      let inner = 0;
      let mid = 0;
      for (let y = 0; y < n; y++) {
        mid += Math.abs(L0[o + (y * n + n / 2) * 4] - L0[o + (y * n + n / 2 - 1) * 4]);
        seam += Math.abs(L0[o + (y * n + n - 1) * 4] - L0[o + y * n * 4]);
        for (let x = 1; x < n; x++)
          inner += Math.abs(L0[o + (y * n + x) * 4] - L0[o + (y * n + x - 1) * 4]) / (n - 1);
      }
      // the wrap step is no rougher than an ordinary step: the average column step, or the
      // step at the same lattice phase (cell / paver grids are aligned to the tile edge)
      expect(seam, DETAIL_LAYER_IDS[z]).toBeLessThan(Math.max(inner, mid) * 1.5 + n);
    }
  });

  it('is byte-identical on rebuild (fixed seed, no GPU mips)', () => {
    const again = buildGroundDetail();
    for (let l = 0; l < d.levels.length; l++) expect(again.levels[l]).toEqual(d.levels[l]);
  });
});
