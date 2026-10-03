import { describe, expect, it } from 'vitest';
import { generateWorld } from '../world/index.ts';
import { WATER_BANDS } from '../content/palette.ts';
import { ringScaleField } from './world-textures.ts';

describe('leeward ring-scale field (D3)', () => {
  const world = generateWorld(1001);
  const n = world.height.n;
  const ring = ringScaleField(world);

  it('stays within 1 … leewardRingScale', () => {
    let lo = Infinity;
    let hi = -Infinity;
    for (const v of ring) {
      lo = Math.min(lo, v);
      hi = Math.max(hi, v);
    }
    expect(lo).toBeGreaterThanOrEqual(1 - 1e-6);
    expect(hi).toBeLessThanOrEqual(WATER_BANDS.leewardRingScale + 1e-6);
    expect(hi - lo).toBeGreaterThan(0.2); // leeward rings really are wider
  });

  it('is smooth over the water: no seam jumps between neighbouring samples', () => {
    // an unblurred seam steps by up to leewardRingScale − 1 = 0.5 between samples; the blurred
    // field only turns gently (around small islets ≈ 0.03 per 2 u: the contour d / scale moves
    // < 0.5 u at the shallow edge — under the ±1.5 u band softness). Land is never banded.
    let maxStep = 0;
    for (let z = 0; z < n - 1; z++)
      for (let x = 0; x < n - 1; x++) {
        const i = z * n + x;
        if (world.shoreSdf[i] > 0 || world.shoreSdf[i] < -80) continue;
        maxStep = Math.max(
          maxStep,
          Math.abs(ring[i + 1] - ring[i]),
          Math.abs(ring[i + n] - ring[i]),
        );
      }
    expect(maxStep).toBeLessThan(0.05);
  });

  it('is deterministic', () => {
    expect(ringScaleField(world)).toEqual(ring);
  });
});
