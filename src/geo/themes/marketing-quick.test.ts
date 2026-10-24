/** TASK-481 Marketing quick-win variants: bounds, pivots, tags, LOD1 budget, determinism. */
import type * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { MOTION_TAG, SURFACE } from '../../content/activity.ts';
import { PROP_DEFS, PROP_DEF_INDEX } from '../../content/props.ts';
import { FLOATING_FIXTURES } from '../../content/settlements.ts';
import { MARKETING_QUICK as Q } from '../../content/themes/marketing.ts';
import { PROP_GEO, buildProp } from '../registry.ts';

const verts = (g: THREE.BufferGeometry): number => g.getAttribute('position').count;
const box = (g: THREE.BufferGeometry): THREE.Box3 => {
  g.computeBoundingBox();
  return g.boundingBox as THREE.Box3;
};
const tagged = (g: THREE.BufferGeometry, kind: number): number => {
  const s = g.getAttribute('aSpin');
  if (!s) return 0;
  let n = 0;
  for (let i = 0; i < s.count; i++) if (s.getW(i) === -kind) n++;
  return n;
};
const same = (a: THREE.BufferGeometry, b: THREE.BufferGeometry): boolean =>
  ['position', 'color'].every((n) => {
    const x = a.getAttribute(n).array;
    const y = b.getAttribute(n).array;
    return x.length === y.length && x.every((v, i) => v === y[i]);
  });

/** [def, variant, ground (true) or waterline pivot, expected tag kind, min tagged vertices]. */
const CASES = [
  ['bunting', Q.bulbString.variant, true, SURFACE.marquee, Q.bulbString.bulbs * 24],
  ['antennaTower', Q.transmitter.variant, true, SURFACE.beacon, 24],
  ['adBuoy', Q.buoyChain.variants[0], false, SURFACE.beacon, 24],
  ['sailboat', Q.pontoon.variant, false, SURFACE.marquee, 12 * 20],
] as const;

describe('Marketing quick-win variants (TASK-481)', () => {
  it('every variant exists on its def (geometry and PropDef agree), pinned past the rolled ones', () => {
    for (const [id, v] of CASES) {
      expect(PROP_GEO[id].variants, id).toBeGreaterThan(v);
      const pd = PROP_DEFS[PROP_DEF_INDEX[id]];
      expect(pd.variants, id).toBe(PROP_GEO[id].variants);
      expect(pd.rollVariants ?? pd.variants, `${id} rolls`).toBeLessThanOrEqual(v);
    }
  });

  for (const [id, v, ground, kind, minTagged] of CASES) {
    it(`${id} v${v}: LOD0 tagged ${SURFACE.marquee === kind ? 'marquee' : 'beacon'}, LOD1 untagged and ≤ 30 %`, () => {
      const g0 = buildProp(id, 5, v, 0);
      const g1 = buildProp(id, 5, v, 1);
      expect(tagged(g0, kind)).toBeGreaterThanOrEqual(minTagged);
      expect(g1.getAttribute('aSpin'), 'a tagged LOD1 keeps its group out of the far merge').toBe(
        undefined,
      );
      expect(verts(g1)).toBeLessThanOrEqual(0.3 * verts(g0));
      const b = box(g0);
      if (ground) {
        expect(b.min.y).toBeGreaterThanOrEqual(-0.05);
        expect(b.min.y).toBeLessThanOrEqual(0.05);
      } else {
        // floats: the pivot is the waterline (the raft hull hangs a little below it)
        expect(b.min.y).toBeGreaterThanOrEqual(-0.6);
        expect(b.min.y).toBeLessThanOrEqual(0.05);
      }
      const color = g0.getAttribute('color');
      for (let i = 0; i < color.count; i++) expect(Number.isFinite(color.getX(i))).toBe(true);
      expect(same(buildProp(id, 5, v, 0), g0)).toBe(true);
    });
  }

  it('bulb string spans the boulevard walk: poles just outside it, chase tags in order', () => {
    const g = buildProp('bunting', 3, Q.bulbString.variant, 0);
    const b = box(g);
    expect(b.max.x).toBeGreaterThan(Q.bulbString.poleX);
    expect(b.min.x).toBeLessThan(-Q.bulbString.poleX);
    expect(b.max.y).toBeGreaterThan(Q.bulbString.poleH);
    const s = g.getAttribute('aSpin');
    const ks = new Set<number>();
    for (let i = 0; i < s.count; i++)
      if (s.getW(i) === -SURFACE.marquee) {
        expect(s.getY(i)).toBe(Q.bulbString.bulbs);
        ks.add(s.getX(i));
      }
    expect([...ks].sort((a, c) => a - c)).toEqual(
      Array.from({ length: Q.bulbString.bulbs }, (_, k) => k),
    );
  });

  it('the chain buoy carries a rope exactly one spacing long toward local +z', () => {
    const g = buildProp('adBuoy', 3, Q.buoyChain.variants[0], 0);
    const b = box(g);
    expect(b.max.z).toBeGreaterThan(Q.buoyChain.spacing - 0.5);
    expect(b.max.z).toBeLessThan(Q.buoyChain.spacing);
    // the plain end / harbour variants have no rope
    expect(box(buildProp('adBuoy', 3, Q.buoyChain.end, 0)).max.z).toBeLessThan(1);
  });

  it('the transmitter stays a short mast (fits a 6 u stack top), taller than a person', () => {
    const b = box(buildProp('antennaTower', 3, Q.transmitter.variant, 0));
    expect(b.max.y).toBeGreaterThan(Q.transmitter.height);
    expect(b.max.y).toBeLessThan(10);
    expect(Math.hypot(b.max.x - b.min.x, b.max.z - b.min.z)).toBeLessThan(3.4);
  });

  it('the pontoon is a flat raft of its configured size, bow +z', () => {
    const b = box(buildProp('sailboat', 3, Q.pontoon.variant, 0));
    expect(b.max.x - b.min.x).toBeGreaterThan(Q.pontoon.w - 0.1);
    expect(b.max.x - b.min.x).toBeLessThan(Q.pontoon.w + 0.5);
    expect(b.max.z - b.min.z).toBeGreaterThan(Q.pontoon.l - 0.2);
    expect(b.max.z - b.min.z).toBeLessThan(Q.pontoon.l + 0.5);
  });

  it('the old variants are untouched (same data as before the new ones were appended)', () => {
    // v0 / v1 of the buoy and v0 of the tower build from the same code path as always
    expect(tagged(buildProp('adBuoy', 3, 0, 0), SURFACE.beacon)).toBe(0);
    expect(tagged(buildProp('antennaTower', 3, 0, 0), SURFACE.beacon)).toBe(0);
    expect(PROP_DEFS[PROP_DEF_INDEX.sailboat].rollVariants).toBe(2);
  });

  it('floats bob in the shader: the hull / float vertices carry the bob tag, LOD1 none; fixtures float at 0', () => {
    const bobbed = (id: string, v: number): number => {
      const sp = buildProp(id, 5, v, 0).getAttribute('aSpin');
      if (!sp) return 0;
      let n = 0;
      for (let i = 0; i < sp.count; i++) if (sp.getW(i) === MOTION_TAG.bob) n++;
      return n / sp.count;
    };
    expect(bobbed('sailboat', Q.pontoon.variant)).toBeGreaterThan(0.3);
    expect(bobbed('adBuoy', Q.buoyChain.variants[0])).toBeGreaterThan(0.5);
    expect(bobbed('adBuoy', 0)).toBe(0);
    for (const id of ['adBuoy', 'sailboat']) expect(FLOATING_FIXTURES, id).toContain(id);
  });
});
