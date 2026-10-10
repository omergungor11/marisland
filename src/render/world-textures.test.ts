import { describe, expect, it } from 'vitest';
import { generateWorld } from '../world/index.ts';
import { WATER_BANDS } from '../content/palette.ts';
import * as THREE from 'three';
import { Scope } from '../core/scope.ts';
import { createWorldTextures, ringScaleField } from './world-textures.ts';
import { buildAlbedoGrid } from './terrain/terrain-colors.ts';

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

describe('terrain albedo / palette textures (TASK-372)', () => {
  it('builds albedo (sRGB) + palette and refreshes the albedo over colorRect after an edit', () => {
    const world = generateWorld(1001);
    const n = world.height.n;
    const scope = new Scope('test');
    const t = createWorldTextures(world, scope, null);
    expect(t.albedo!.colorSpace).toBe(THREE.SRGBColorSpace);
    expect(t.palette!.image.width).toBe(80); // 16 zones × 5 texels (TASK-391 wall colour)
    // raise a land patch: heights (and so AO / ramps) change around it
    let hit = -1;
    for (let k = 0; k < n * n && hit < 0; k++) if (world.height.data[k] > 2) hit = k;
    const ci = hit % n;
    const cj = Math.floor(hit / n);
    for (let j = cj - 2; j <= cj + 2; j++)
      for (let i = ci - 2; i <= ci + 2; i++) world.height.data[j * n + i] += 1.5;
    const stats = t.update({
      chunks: [],
      minI: ci - 2,
      maxI: ci + 2,
      minJ: cj - 2,
      maxJ: cj + 2,
      props: [],
      sdf: false,
    });
    expect(stats.albedo).toBe('full'); // no renderer: falls back to a full upload
    expect(stats.colorRect).not.toBeNull();
    // the texture data now equals a fresh build of the edited world
    expect(t.albedo!.image.data).toEqual(buildAlbedoGrid(world).rgba);
    scope.dispose();
  });
});
