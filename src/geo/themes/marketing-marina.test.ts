/** TASK-660 (M52, D-170): the Horseshoe Harbour kit: quayHouse, quayFurnish, quayBoat. */
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { decodeSurface } from '../../content/materials.ts';
import { PROP_DEF_INDEX, PROP_DEFS } from '../../content/props.ts';
import { FLOATING_FIXTURES } from '../../content/settlements.ts';
import { MARINA_KIT, type KitRef } from '../../content/themes/marketing-marina.ts';
import { MARINA_LOOK } from '../../content/themes/marketing-marina-look.ts';
import { buildProp, PROP_GEO } from '../registry.ts';
import { glyphParts } from './marketing-marina-glyph.ts';

const tris = (g: THREE.BufferGeometry): number => g.getAttribute('position').count / 3;
const box = (g: THREE.BufferGeometry): THREE.Box3 => {
  g.computeBoundingBox();
  return g.boundingBox as THREE.Box3;
};

/** The plan stub sizes (TASK-661 derived its spacing from them): the real ones stay within 15 %. */
const STUB = {
  house: [
    [4, 4.5, 6.5],
    [4, 4.5, 5.5],
    [3.6, 4.5, 6],
    [3.6, 4.5, 7.2],
    [4, 4.5, 5.5],
    [4.4, 4.5, 6],
  ],
  terrace: [
    [4, 2.2, 2.4],
    [4, 2.2, 2.4],
    [3.2, 2.2, 2.4],
  ],
  stall: [
    [2, 1.6, 2.4],
    [2, 1.6, 2.4],
    [2, 1.6, 2.4],
  ],
  yacht: [
    [1.8, 5.5, 7],
    [2, 5, 2.6],
    [1.4, 3.2, 1.4],
    [1.6, 4, 2.2],
  ],
} as const;

/** [key, index, LOD0 budget, LOD1 budget] (the task's guide; LOD1 = 25 %). */
const PIECES: ReadonlyArray<readonly [string, KitRef, number, number]> = [
  ...MARINA_KIT.house.map((r, i) => [`house${i}`, r, 900, 225] as const),
  ...MARINA_KIT.terrace.map((r, i) => [`terrace${i}`, r, 350, 88] as const),
  ...MARINA_KIT.stall.map((r, i) => [`stall${i}`, r, 300, 75] as const),
  ...MARINA_KIT.yacht.map((r, i) => [`yacht${i}`, r, 500, 125] as const),
  ['pontoon', MARINA_KIT.pontoon, 120, 30],
  ['tower', MARINA_KIT.tower, 600, 150],
];

describe('TASK-660 marina kit contract', () => {
  it('keeps the keys and array lengths the plan relies on', () => {
    expect(Object.keys(MARINA_KIT).sort()).toEqual(
      ['house', 'pontoon', 'stall', 'terrace', 'tower', 'yacht'].sort(),
    );
    expect(MARINA_KIT.house).toHaveLength(6);
    expect(MARINA_KIT.terrace).toHaveLength(3);
    expect(MARINA_KIT.stall).toHaveLength(3);
    expect(MARINA_KIT.yacht).toHaveLength(4);
  });

  it('every ref points at a registered def and a variant it has', () => {
    for (const [key, r] of PIECES) {
      const def = PROP_DEFS[PROP_DEF_INDEX[r.defId]];
      expect(def, key).toBeDefined();
      expect(r.variant, key).toBeLessThan(def.variants);
      expect(PROP_GEO[r.defId].variants, key).toBe(def.variants);
    }
  });

  it('uses at most three new defs, all pinned (never rolled)', () => {
    const ids = [...new Set(PIECES.map(([, r]) => r.defId))];
    expect(ids.sort()).toEqual(['quayBoat', 'quayFurnish', 'quayHouse']);
    for (const id of ids) expect(PROP_DEFS[PROP_DEF_INDEX[id]].rollVariants).toBeLessThanOrEqual(1);
    expect(FLOATING_FIXTURES).toContain('quayBoat');
    expect(FLOATING_FIXTURES).not.toContain('quayHouse');
  });

  it('measured sizes match the kit (3 %) and the plan stub (15 %)', () => {
    const stubs: Record<string, readonly number[]> = {};
    (['house', 'terrace', 'stall', 'yacht'] as const).forEach((k) =>
      STUB[k].forEach((s, i) => (stubs[`${k}${i}`] = s)),
    );
    stubs.pontoon = [1.2, 6, 0.5];
    stubs.tower = [3, 3, 6.5];
    for (const [key, r] of PIECES) {
      const b = box(buildProp(r.defId, 7, r.variant, 0));
      const s = b.getSize(new THREE.Vector3());
      const got = [s.x, s.z, b.max.y];
      const kit = [r.w, r.d, r.h];
      const stub = stubs[key];
      got.forEach((v, k) => {
        expect(Math.abs(v - kit[k]) / kit[k], `${key} kit[${k}] ${v}`).toBeLessThan(0.03);
        expect(Math.abs(v - stub[k]) / stub[k], `${key} stub[${k}] ${v}`).toBeLessThan(0.15);
      });
    }
  });
});

describe('TASK-660 marina kit geometry', () => {
  it('triangle budgets hold at both LODs', () => {
    for (const [key, r, b0, b1] of PIECES) {
      const g0 = buildProp(r.defId, 7, r.variant, 0);
      const g1 = buildProp(r.defId, 7, r.variant, 1);
      expect(tris(g0), `${key} LOD0`).toBeLessThanOrEqual(b0);
      expect(tris(g1), `${key} LOD1`).toBeLessThanOrEqual(b1);
      expect(tris(g1), `${key} LOD1 < LOD0`).toBeLessThan(tris(g0));
    }
  });

  it('pivots on the ground (floating pieces on the water), no NaN, colours in range', () => {
    for (const [key, r] of PIECES) {
      const float = r.defId === 'quayBoat';
      for (const lod of [0, 1] as const) {
        const g = buildProp(r.defId, 7, r.variant, lod);
        const b = box(g);
        expect(Number.isFinite(b.min.x + b.max.y + b.min.z), key).toBe(true);
        if (float) {
          expect(b.min.y, `${key} draft`).toBeGreaterThan(-0.3);
          expect(b.min.y, `${key} draft`).toBeLessThan(0);
        } else {
          expect(Math.abs(b.min.y), `${key} on the ground`).toBeLessThan(0.011);
        }
        // centred on its plan box (the plan places the pivot)
        expect(Math.abs((b.min.x + b.max.x) / 2), `${key} x centre`).toBeLessThan(0.1);
        expect(Math.abs((b.min.z + b.max.z) / 2), `${key} z centre`).toBeLessThan(0.3);
        const c = g.getAttribute('color');
        for (let i = 0; i < c.count * 3; i++) {
          const v = c.array[i];
          expect(v >= 0 && v <= 1, key).toBe(true);
        }
      }
    }
  });

  it('is deterministic: the same seed gives the same bytes', () => {
    for (const [key, r] of PIECES) {
      const a = buildProp(r.defId, 11, r.variant, 0).getAttribute('position').array;
      const b = buildProp(r.defId, 11, r.variant, 0).getAttribute('position').array;
      expect(Array.from(a), key).toEqual(Array.from(b));
    }
  });

  it('houses have lit window panes (emissive 1) and glass / fabric classes; the tower lights its lamp', () => {
    for (const r of [...MARINA_KIT.house, MARINA_KIT.tower]) {
      const g = buildProp(r.defId, 7, r.variant, 0);
      const e = g.getAttribute('emissive');
      expect(e, `${r.defId} ${r.variant} emissive`).toBeDefined();
      let lit = 0;
      const classes = new Set<number>();
      for (let i = 0; i < e.count; i++) {
        const d = decodeSurface(e.getX(i));
        if (d.base === 1) lit++;
        classes.add(d.cls);
      }
      expect(lit, `${r.defId} ${r.variant} lit vertices`).toBeGreaterThanOrEqual(6);
      if (r.defId === 'quayHouse' && r.variant < 6) {
        expect(classes.has(3), 'glass').toBe(true);
        expect(classes.has(4), 'fabric').toBe(true);
      }
    }
  });

  it('every house has a business: a sign glyph, an awning and a door; roofs vary', () => {
    expect(MARINA_LOOK.houses.map((h) => h.glyph)).toEqual([
      'fish',
      'cup',
      'loaf',
      'cone',
      'card',
      'anchor',
    ]);
    for (const h of MARINA_LOOK.houses) expect(glyphParts(h.glyph).length).toBeGreaterThan(1);
    expect(new Set(MARINA_LOOK.houses.map((h) => h.roof)).size).toBeGreaterThanOrEqual(3);
    expect(new Set(MARINA_LOOK.houses.map((h) => h.wall)).size).toBe(6);
  });

  it('LOD0 boats bob, the pontoon does not; the tower carries a flag hook', () => {
    for (let v = 0; v < 4; v++)
      expect(buildProp('quayBoat', 7, v, 0).getAttribute('aSpin'), `boat ${v}`).toBeDefined();
    expect(buildProp('quayBoat', 7, 4, 0).getAttribute('aSpin')).toBeUndefined();
    expect(buildProp('quayHouse', 7, 6, 0).userData.hooks.flag).toBeDefined();
  });
});
