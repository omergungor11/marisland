import { describe, expect, it } from 'vitest';
import { PROP_GEO } from '../geo/index.ts';
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
});
