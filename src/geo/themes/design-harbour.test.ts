import type * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { cultureCapOverride } from '../../content/budgets.ts';
import { CULTURES } from '../../content/cultures/index.ts';
import { PROP_DEFS, PROP_DEF_INDEX } from '../../content/props.ts';
import { FIXTURE_VARIANT_RADIUS } from '../../content/settlements.ts';
import { HARBOUR_LIVERIES } from '../../content/themes/harbours.ts';
import { WHARF_GEO as F, WHARF_VARIANTS as WV } from '../../content/themes/design-harbour.ts';
import { PROP_GEO, buildProp } from '../index.ts';

const tris = (g: THREE.BufferGeometry): number =>
  (g.index ? g.index.count : g.getAttribute('position').count) / 3;

/** LOD0 / LOD1 triangle budgets (D-127: ~1 MB of Design buffers in all). */
const KIT: readonly [string, number, number, number, number][] = [
  ['glasshouse', WV.boathouse, 4, 300, 77],
  ['conservatory', WV.pavilion, 1, 600, 170],
  ['buoy', WV.paintPot, 4, 170, 45],
];

describe('Colour Wharf kit (TASK-537)', () => {
  for (const [id, first, count, lo0, lo1] of KIT) {
    it(`${id}: the added variants are pinned, in budget, deterministic`, () => {
      const d = PROP_DEFS[PROP_DEF_INDEX[id]];
      expect(d.variants).toBe(first + count);
      expect(PROP_GEO[id].variants).toBe(first + count);
      expect(PROP_GEO[id].heights).toHaveLength(first + count);
      expect(d.rollVariants).toBeLessThanOrEqual(first);
      for (let v = first; v < first + count; v++) {
        const g0 = buildProp(id, 7, v, 0);
        const g1 = buildProp(id, 7, v, 1);
        expect(tris(g0), `v${v} LOD0`).toBeLessThanOrEqual(lo0);
        expect(tris(g1), `v${v} LOD1`).toBeLessThanOrEqual(lo1);
        const again = buildProp(id, 7, v, 0);
        expect(Array.from(again.getAttribute('position').array)).toEqual(
          Array.from(g0.getAttribute('position').array),
        );
      }
    });
  }

  it('older variants keep their builders (no wharf hook on them)', () => {
    expect(buildProp('conservatory', 5, 0, 0).userData.hooks?.prism).toBeUndefined();
    expect(buildProp('glasshouse', 5, 4, 0).userData.hooks?.door).toBeUndefined();
    expect(buildProp('conservatory', 5, WV.pavilion, 0).userData.hooks?.prism).toBeDefined();
  });

  it('boathouses differ in paint, not in shape', () => {
    const a = buildProp('glasshouse', 2, WV.boathouse, 0);
    const b = buildProp('glasshouse', 2, WV.boathouse + 1, 0);
    expect(tris(a)).toBe(tris(b));
    expect(Array.from(a.getAttribute('color').array)).not.toEqual(
      Array.from(b.getAttribute('color').array),
    );
  });

  it('paint pots share one LOD1 (one instanced group, D-032) and bake no lamp', () => {
    const a = buildProp('buoy', 3, WV.paintPot, 1);
    const b = buildProp('buoy', 3, WV.paintPot + 3, 1);
    expect(Array.from(a.getAttribute('color').array)).toEqual(
      Array.from(b.getAttribute('color').array),
    );
    const em = buildProp('buoy', 3, WV.paintPot, 0).getAttribute('emissive');
    for (let i = 0; i < em.count; i++) expect(em.getX(i)).toBeLessThan(0.5);
  });

  it('the pavilion is an open walk on the pier deck: small solid disc, floor at deck height', () => {
    expect(FIXTURE_VARIANT_RADIUS.conservatory[WV.pavilion]).toBeLessThan(1);
    const g = buildProp('conservatory', 5, WV.pavilion, 0);
    const pos = g.getAttribute('position');
    let maxY = -Infinity;
    for (let i = 0; i < pos.count; i++) maxY = Math.max(maxY, pos.getY(i));
    expect(maxY).toBeGreaterThan(F.pavilion.deckY + F.pavilion.wallH);
    expect(maxY).toBeLessThanOrEqual(F.pavilion.heightNominal);
  });

  it('every livery builds on the five shared defs; the ledger stays at the cap', () => {
    expect(HARBOUR_LIVERIES).toContain('design');
    expect(CULTURES.design.kit).toHaveLength(cultureCapOverride.design.defs);
    expect(cultureCapOverride.design).toEqual({ defs: 15, tier1: 2 });
  });
});
