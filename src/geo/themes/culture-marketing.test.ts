/** TASK-413 Carnival Broadcasters kit: bounds, ground pivot, min thickness, LOD1 budget, variant identity. */
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { MARKETING_CULTURE } from '../../content/cultures/marketing.ts';
import { validateCultures } from '../../content/cultures/validate.ts';
import { PROP_DEFS } from '../../content/props.ts';
import { isLargeStructure } from '../../render/props/batcher.ts';
import { PropFlag } from '../../world/prop-store.ts';
import { buildProp } from '../registry.ts';
import { MARKETING_CULTURE_GEO } from './culture-marketing.ts';

const verts = (g: THREE.BufferGeometry): number => g.getAttribute('position').count;
const size = (g: THREE.BufferGeometry): THREE.Vector3 => {
  g.computeBoundingBox();
  return (g.boundingBox as THREE.Box3).getSize(new THREE.Vector3());
};
const sameData = (a: THREE.BufferGeometry, b: THREE.BufferGeometry): boolean =>
  ['position', 'color', 'ao'].every((n) => {
    const x = a.getAttribute(n).array;
    const y = b.getAttribute(n).array;
    return x.length === y.length && x.every((v, i) => v === y[i]);
  });

/** LOD0 vertex ceiling (~ 2.5k tris, ART_BIBLE structure budget is looser). */
const MAX_VERTS = 7500;

describe('TASK-413 Carnival Broadcasters kit', () => {
  it('ledger = the new PropDefs, ordered, validator-clean', () => {
    expect(validateCultures([MARKETING_CULTURE])).toEqual([]);
    const ids = MARKETING_CULTURE.kit.map((k) => k.id);
    expect(ids).toEqual(expect.arrayContaining(MARKETING_CULTURE_GEO.map((d) => d.id)));
    expect(ids).toHaveLength(MARKETING_CULTURE_GEO.length);
    for (const k of MARKETING_CULTURE.kit) {
      const d = PROP_DEFS.find((p) => p.id === k.id);
      expect(d, k.id).toBeDefined();
      expect(d?.tier).toBe(k.tier);
      expect(d?.flags).toBe(k.flags);
      if (k.tier === 3) expect(k.flags & PropFlag.noShadow, k.id).toBeTruthy();
    }
    expect(MARKETING_CULTURE.kit.filter((k) => k.tier === 1)).toHaveLength(1);
  });

  for (const def of MARKETING_CULTURE_GEO) {
    const pd = PROP_DEFS.find((p) => p.id === def.id);
    it(`${def.id}: PropDef lines up`, () => {
      expect(pd?.variants).toBe(def.variants);
      expect(pd ? (pd.flags & PropFlag.windy) !== 0 : null).toBe(def.windy);
    });
    for (let v = 0; v < def.variants; v++) {
      it(`${def.id} v${v}: bounds, ground pivot, thickness, LOD1 <= 30 %`, () => {
        const g0 = buildProp(def.id, 5, v, 0);
        const g1 = buildProp(def.id, 5, v, 1);
        expect(verts(g0)).toBeLessThanOrEqual(MAX_VERTS);
        expect(verts(g1)).toBeLessThanOrEqual(0.3 * verts(g0));
        for (const g of [g0, g1]) {
          const s = size(g);
          expect(Math.min(s.x, s.y, s.z)).toBeGreaterThanOrEqual(0.12);
          const box = g.boundingBox as THREE.Box3;
          expect(box.min.y).toBeGreaterThanOrEqual(-0.05);
          expect(box.min.y).toBeLessThanOrEqual(0.05);
        }
        const s0 = size(g0);
        const h = def.heights?.[v] ?? def.height;
        expect(s0.y).toBeGreaterThan(h * 0.6);
        expect(s0.y).toBeLessThan(h * 1.25);
        expect(Math.hypot(s0.x, s0.z) / 2).toBeLessThanOrEqual(def.footprint * 1.9);
        const color = g0.getAttribute('color');
        for (let i = 0; i < color.count; i++) expect(Number.isFinite(color.getX(i))).toBe(true);
      });
    }
  }

  it('no kit def is promoted to tier 0 by the batcher (isLargeStructure), with 5 % margin', () => {
    for (const d of MARKETING_CULTURE_GEO) {
      const pd = PROP_DEFS.find((p) => p.id === d.id);
      if (!pd) throw new Error(d.id);
      for (const seed of [1, 7, 42, 1001])
        for (let v = 0; v < d.variants; v++) {
          const s = size(buildProp(d.id, seed, v, 0)).multiplyScalar(1.05);
          expect(isLargeStructure(pd, s), `${d.id} v${v} seed ${seed}`).toBe(false);
        }
    }
  });

  it('deterministic per seed', () => {
    for (const d of MARKETING_CULTURE_GEO) {
      expect(sameData(buildProp(d.id, 9, 0, 0), buildProp(d.id, 9, 0, 0))).toBe(true);
    }
  });

  it('mascotStatue is the one tier-1 def and stays below the batcher T0 promotion', () => {
    const pd = PROP_DEFS.find((p) => p.id === 'mascotStatue');
    expect(pd?.tier).toBe(1);
    const s = size(buildProp('mascotStatue', 3, 0, 0));
    expect(s.y).toBeLessThan(2.85);
    expect(s.x).toBeGreaterThan(3);
    expect(Math.min(s.x, s.z)).toBeLessThan(2.85);
  });

  it('marqueeSign letters and bulbs are emissive, one word per variant', () => {
    const e = (v: number): number => {
      const a = buildProp('marqueeSign', 5, v, 0).getAttribute('emissive');
      let n = 0;
      for (let i = 0; i < a.count; i++) if (a.getX(i) > 0.5) n++;
      return n;
    };
    expect(e(0)).toBeGreaterThan(300);
    const sameVerts = new Set([0, 1, 2].map((v) => verts(buildProp('marqueeSign', 5, v, 0))));
    expect(sameVerts.size).toBeGreaterThan(1);
  });

  it('searchlightPair exposes two beam hooks', () => {
    for (const v of [0, 1]) {
      const hooks = buildProp('searchlightPair', 5, v, 0).userData.hooks as {
        beams: { lights: { origin: number[]; dir: number[] }[] };
      };
      expect(hooks.beams.lights).toHaveLength(2);
    }
  });

  it('prizeBooth and the variant LOD1 aliases (lod1Of) share far geometry', () => {
    for (const id of ['prizeBooth', 'popcornCart'])
      for (const seed of [1, 42])
        expect(sameData(buildProp(id, seed, 1, 1), buildProp(id, seed, 0, 1)), id).toBe(true);
    for (const v of [1, 2])
      expect(sameData(buildProp('marqueeSign', 7, v, 1), buildProp('marqueeSign', 7, 0, 1))).toBe(
        true,
      );
  });

  it('does not add a variant to fairBooth', () => {
    expect(PROP_DEFS.find((p) => p.id === 'fairBooth')?.variants).toBe(2);
  });
});
