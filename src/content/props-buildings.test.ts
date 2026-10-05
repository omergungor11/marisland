import { describe, expect, it } from 'vitest';
import { PROP_GEO, buildProp } from '../geo/index.ts';
import { THEME_GEO } from '../geo/themes/index.ts';
import { PropFlag } from '../world/prop-store.ts';
import { PROP_DEFS_BUILDINGS } from './props-buildings.ts';

describe('PROP_DEFS_BUILDINGS', () => {
  it('has unique ids and every def maps to a geometry with matching variants', () => {
    const ids = new Set<string>();
    for (const d of PROP_DEFS_BUILDINGS) {
      expect(ids.has(d.id)).toBe(false);
      ids.add(d.id);
      const g = PROP_GEO[d.geo];
      expect(g, d.id).toBeDefined();
      expect(d.variants).toBe(g.variants);
      expect(d.footprint).toBeGreaterThan(0);
      expect([0, 1, 2, 3]).toContain(d.tier);
    }
  });
  it('covers every new geometry exactly once', () => {
    const old = new Set([
      'palm',
      'roundTree',
      'pine',
      'giantMushroom',
      'bush',
      'cropRow',
      'haybale',
      'reeds',
      'lilyPad',
      'grassTuft',
      'flower',
      'rockCluster',
      'treeBlob',
      // M14b theme structures are covered by content/props-themes (their own PropDefs)
      ...THEME_GEO.map((d) => d.id),
    ]);
    const want = Object.keys(PROP_GEO)
      .filter((k) => !old.has(k))
      .sort();
    expect(PROP_DEFS_BUILDINGS.map((d) => d.geo).sort()).toEqual(want);
  });
  it('windy flag matches the geometry (cloth / sail / flag / canopy)', () => {
    for (const d of PROP_DEFS_BUILDINGS) {
      expect((d.flags & PropFlag.windy) !== 0, d.id).toBe(PROP_GEO[d.geo].windy);
    }
  });

  it('lod1.size matches the shell LOD1 bounds (within 8 %, every variant: variants differ a little)', () => {
    for (const d of PROP_DEFS_BUILDINGS) {
      const want = d.lod1?.size;
      if (!want) continue;
      for (let v = 0; v < d.variants; v++) {
        const g = buildProp(d.geo, 1, v, 1);
        g.computeBoundingBox();
        const { min, max } = g.boundingBox!;
        [max.x - min.x, max.y - min.y, max.z - min.z].forEach((got, a) => {
          expect(Math.abs(got / want[a] - 1), `${d.id} v${v} axis ${a}`).toBeLessThan(0.08);
        });
      }
    }
  });
});
