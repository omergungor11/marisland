/** TASK-409: pennant & signage kit (bounds, min thickness, vertex budgets, shared LOD1). */
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { createRng } from '../../core/rng.ts';
import { SIGNAGE_PROP_DEFS } from '../../content/props-themes/signage.ts';
import { THEME_IDS } from '../../world/types.ts';
import { PropFlag } from '../../world/prop-store.ts';
import { PROP_GEO, buildProp } from '../registry.ts';
import { GLYPH_IDS, glyphShapes } from './glyphs.ts';
import {
  CUT_OF_THEME,
  PENNANT_CUTS,
  SIGN_THICK,
  SIGNAGE_GEO,
  buildPierSignpost,
  cutShape,
  sailStripe,
} from './signage.ts';

const verts = (g: THREE.BufferGeometry): number => g.getAttribute('position').count;
const size = (g: THREE.BufferGeometry): THREE.Vector3 =>
  (
    g.boundingBox ??
    new THREE.Box3().setFromBufferAttribute(g.getAttribute('position') as THREE.BufferAttribute)
  ).getSize(new THREE.Vector3());

/** Max vertices per LOD0 geometry (budget: ~1.5k tris). */
const MAX_VERTS = 4500;

describe('TASK-409 signage kit', () => {
  it('geo and PropDefs line up', () => {
    expect(SIGNAGE_PROP_DEFS.map((d) => d.id).sort()).toEqual(SIGNAGE_GEO.map((d) => d.id).sort());
    for (const d of SIGNAGE_PROP_DEFS) {
      const g = PROP_GEO[d.geo];
      expect(g, d.id).toBeDefined();
      expect(d.variants).toBe(g.variants);
      expect((d.flags & PropFlag.windy) !== 0).toBe(g.windy);
      expect(d.tier).toBeGreaterThanOrEqual(2);
    }
  });

  it('seven distinct cuts, one per culture', () => {
    expect(new Set(PENNANT_CUTS).size).toBe(7);
    expect(PENNANT_CUTS).toHaveLength(THEME_IDS.length);
    expect(CUT_OF_THEME.qa).toBe('chevron');
    // silhouettes differ: compare the vertex lists
    const sigs = new Set(
      PENNANT_CUTS.map((c) => JSON.stringify(cutShape(c, 0.7, 0.95).getPoints())),
    );
    expect(sigs.size).toBe(7);
  });

  for (const def of SIGNAGE_GEO) {
    for (let v = 0; v < def.variants; v++) {
      it(`${def.id} v${v}: bounds, thickness, budgets, ground pivot`, () => {
        const g0 = buildProp(def.id, 3, v, 0);
        const g1 = buildProp(def.id, 3, v, 1);
        expect(verts(g0)).toBeLessThanOrEqual(MAX_VERTS);
        expect(verts(g1)).toBeLessThanOrEqual(0.3 * verts(g0));
        for (const g of [g0, g1]) {
          const s = size(g);
          expect(Math.min(s.x, s.y, s.z)).toBeGreaterThanOrEqual(SIGN_THICK);
          expect(g.boundingBox?.min.y ?? 0).toBeGreaterThanOrEqual(-0.05);
          expect(g.boundingBox?.min.y ?? 0).toBeLessThanOrEqual(0.05);
        }
        const s0 = size(g0);
        expect(s0.y).toBeGreaterThan(def.height * 0.6);
        expect(s0.y).toBeLessThan(def.height * 1.4);
        expect(Math.max(s0.x, s0.z) / 2).toBeLessThanOrEqual(def.footprint * 1.6);
        const color = g0.getAttribute('color');
        for (let i = 0; i < color.count; i++) expect(Number.isFinite(color.getX(i))).toBe(true);
      });
    }
  }

  for (const id of ['pennantLine', 'cargoCrate']) {
    it(`${id}: all 7 variants share ONE LOD1 geometry`, () => {
      const ref = buildProp(id, 3, 0, 1).getAttribute('position').array;
      const refCol = buildProp(id, 3, 0, 1).getAttribute('color').array;
      for (let v = 1; v < 7; v++) {
        const g = buildProp(id, 3, v, 1);
        expect(Array.from(g.getAttribute('position').array)).toEqual(Array.from(ref));
        expect(Array.from(g.getAttribute('color').array)).toEqual(Array.from(refCol));
      }
    });
    it(`${id}: LOD0 variants differ in colour (accent per culture)`, () => {
      const means = new Set<string>();
      for (let v = 0; v < 7; v++) {
        const c = buildProp(id, 3, v, 0).getAttribute('color');
        let r = 0;
        let b = 0;
        for (let i = 0; i < c.count; i++) {
          r += c.getX(i);
          b += c.getZ(i);
        }
        means.add(`${(r / c.count).toFixed(3)}:${(b / c.count).toFixed(3)}`);
      }
      expect(means.size).toBe(7);
    });
  }

  it('pierSignpost: board count and bearings drive the geometry', () => {
    const rng = createRng(1);
    const one = buildPierSignpost({ rng, lod: 0 }, [{ culture: 'hq', bearing: 0 }]);
    const seven = buildPierSignpost(
      { rng, lod: 0 },
      THEME_IDS.map((culture, i) => ({ culture, bearing: i })),
    );
    const eight = buildPierSignpost(
      { rng, lod: 0 },
      [...THEME_IDS, 'hq' as const].map((culture, i) => ({ culture, bearing: i })),
    );
    expect(verts(seven)).toBeGreaterThan(verts(one) * 3);
    expect(verts(eight)).toBe(verts(seven)); // capped at 7
    // bearing 0 points along +x, bearing pi/2 along -z
    const east = buildPierSignpost({ rng, lod: 1 }, [{ culture: 'qa', bearing: 0 }]);
    const north = buildPierSignpost({ rng, lod: 1 }, [{ culture: 'qa', bearing: Math.PI / 2 }]);
    expect(size(east).x).toBeGreaterThan(size(east).z);
    expect(size(north).z).toBeGreaterThan(size(north).x);
  });

  it('glyphs: every id builds inside the unit box', () => {
    expect(GLYPH_IDS).toHaveLength(12);
    for (const id of GLYPH_IDS) {
      const shapes = glyphShapes(id);
      expect(shapes.length, id).toBeGreaterThan(0);
      const box = new THREE.Box2();
      for (const s of shapes) for (const p of s.getPoints()) box.expandByPoint(p);
      expect(box.min.x, id).toBeGreaterThanOrEqual(-0.56);
      expect(box.max.x, id).toBeLessThanOrEqual(0.56);
      expect(box.min.y, id).toBeGreaterThanOrEqual(-0.56);
      expect(box.max.y, id).toBeLessThanOrEqual(0.56);
      expect(box.getSize(new THREE.Vector2()).length(), id).toBeGreaterThan(0.6);
    }
  });

  it('sailStripe: a band on the sailboat main sail surface', () => {
    const o = { mastZ: 0.35, y0: 1.4, H: 3.5, Ls: 2, flip: 1 as const, v0: 0.3, v1: 0.5, hi: true };
    const g = sailStripe(o);
    g.computeBoundingBox();
    const b = g.boundingBox as THREE.Box3;
    expect(b.min.z).toBeGreaterThanOrEqual(o.mastZ - 0.06 - o.Ls - 1e-6);
    expect(b.max.y).toBeLessThan(o.y0 + o.H * 0.5 + 1e-6);
    expect(b.min.y).toBeGreaterThan(o.y0);
    expect(verts(sailStripe({ ...o, hi: false }))).toBe(6);
  });
});
