import { describe, expect, it } from 'vitest';
import { CLOUD_LAYERS } from '../../content/weather.ts';
import { createRng } from '../../core/rng.ts';
import { cloudBanks, cloudLayers } from './cloud-field.ts';
import { buildStratusGeometry, buildWispGeometry } from './cloud-geometry.ts';

describe('cloud archetypes (TASK-608)', () => {
  it('stratus and wisps: seeded, in their counts / rings, independent of the banks', () => {
    const banks = JSON.stringify(cloudBanks(1001, 10, -20));
    const a = cloudLayers(1001, 10, -20);
    expect(cloudLayers(1001, 10, -20)).toEqual(a);
    expect(JSON.stringify(cloudBanks(1001, 10, -20))).toBe(banks);
    expect(cloudLayers(7, 10, -20)).not.toEqual(a);
    for (const kind of ['stratus', 'wisps'] as const) {
      const L = CLOUD_LAYERS[kind];
      const list = a[kind];
      expect(list.length).toBeGreaterThanOrEqual(L.count[0]);
      expect(list.length).toBeLessThanOrEqual(L.count[1]);
      for (const c of list) {
        const d = Math.hypot(c.x - 10, c.z + 20);
        expect(d).toBeGreaterThanOrEqual(L.distance[0] - 1e-6);
        expect(d).toBeLessThanOrEqual(L.distance[1] + 1e-6);
        expect(c.alt).toBeGreaterThanOrEqual(L.altitude[0]);
        expect(c.alt).toBeLessThanOrEqual(L.altitude[1]);
        expect(c.width).toBeGreaterThanOrEqual(L.length[0]);
        expect(c.width).toBeLessThanOrEqual(L.length[1]);
      }
    }
  });

  it('geometries are normalised (length 1, depth = aspect, base at 0), finite and light', () => {
    const cases = [
      {
        g: buildStratusGeometry(
          createRng(3).fork('s'),
          CLOUD_LAYERS.stratus.blobs,
          CLOUD_LAYERS.stratus.aspect,
        ),
        aspect: CLOUD_LAYERS.stratus.aspect,
        maxTris: 3600,
      },
      {
        g: buildWispGeometry(
          createRng(3).fork('w'),
          CLOUD_LAYERS.wisps.strokes,
          CLOUD_LAYERS.wisps.aspect,
        ),
        aspect: CLOUD_LAYERS.wisps.aspect,
        maxTris: 500,
      },
    ];
    for (const { g, aspect, maxTris } of cases) {
      const pos = g.getAttribute('position');
      const nrm = g.getAttribute('normal');
      const shade = g.getAttribute('aShade');
      let x0 = Infinity;
      let x1 = -Infinity;
      let y0 = Infinity;
      let y1 = -Infinity;
      let z0 = Infinity;
      let z1 = -Infinity;
      for (let i = 0; i < pos.count; i++) {
        for (const v of [pos.getX(i), pos.getY(i), pos.getZ(i), nrm.getY(i), shade.getX(i)])
          expect(Number.isFinite(v)).toBe(true);
        expect(Math.hypot(nrm.getX(i), nrm.getY(i), nrm.getZ(i))).toBeCloseTo(1, 4);
        x0 = Math.min(x0, pos.getX(i));
        x1 = Math.max(x1, pos.getX(i));
        y0 = Math.min(y0, pos.getY(i));
        y1 = Math.max(y1, pos.getY(i));
        z0 = Math.min(z0, pos.getZ(i));
        z1 = Math.max(z1, pos.getZ(i));
      }
      expect(x1 - x0).toBeCloseTo(1, 4);
      expect(z1 - z0).toBeCloseTo(aspect, 4);
      expect(y0).toBeCloseTo(0, 6);
      // flat archetypes: much thinner than long
      expect(y1).toBeLessThan(0.12);
      expect(pos.count / 3).toBeLessThanOrEqual(maxTris);
    }
  });
});
