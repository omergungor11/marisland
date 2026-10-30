/** TASK-411 Wind Gardens kit: bounds, ground pivot, min thickness, LOD1 budget, variant identity. */
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { CODING_CULTURE } from '../../content/cultures/coding.ts';
import { validateCultures } from '../../content/cultures/validate.ts';
import { PROP_DEFS } from '../../content/props.ts';
import { isLargeStructure } from '../../render/props/batcher.ts';
import { PropFlag } from '../../world/prop-store.ts';
import { buildProp } from '../registry.ts';
import { CODING_CULTURE_GEO } from './culture-coding.ts';
import { CODING_M22_GEO } from './culture-coding-m22.ts';
import { CODING_TUNNEL_GEO } from './coding-tunnel.ts';
import { CODING_M33_GEO } from './coding-m33.ts';
import { TURBINE_CHIME_VARIANT } from './coding.ts';

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

describe('TASK-411 Wind Gardens kit', () => {
  it('ledger = the new PropDefs, ordered, validator-clean', () => {
    expect(validateCultures([CODING_CULTURE])).toEqual([]);
    const ids = CODING_CULTURE.kit.map((k) => k.id);
    // M19 kit + the two M22 entries (TASK-479: windsock, fairyWreath), in that order
    const geoIds = [
      ...CODING_CULTURE_GEO,
      ...CODING_M22_GEO,
      ...CODING_TUNNEL_GEO,
      ...CODING_M33_GEO,
    ].map((d) => d.id);
    expect(ids).toEqual(expect.arrayContaining(geoIds));
    expect(ids).toHaveLength(geoIds.length);
    // + the two M24 entries (TASK-498: windTunnel, tunnelFan) at the very end
    // the M33 block (TASK-543) is the last 10
    const m33 = CODING_M33_GEO.length;
    expect(ids.slice(-m33)).toEqual(CODING_M33_GEO.map((d) => d.id));
    expect(ids.slice(-m33 - 4, -m33 - 2)).toEqual(CODING_M22_GEO.map((d) => d.id));
    expect(ids.slice(-m33 - 2, -m33)).toEqual(CODING_TUNNEL_GEO.map((d) => d.id));
    for (const k of CODING_CULTURE.kit) {
      const d = PROP_DEFS.find((p) => p.id === k.id);
      expect(d, k.id).toBeDefined();
      expect(d?.tier).toBe(k.tier);
      expect(d?.flags).toBe(k.flags);
      if (k.tier === 3) expect(k.flags & PropFlag.noShadow, k.id).toBeTruthy();
    }
    expect(CODING_CULTURE.kit.filter((k) => k.tier === 1)).toHaveLength(2); // giantDuck + windTunnel (TASK-498)
  });

  for (const def of CODING_CULTURE_GEO) {
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
    for (const d of CODING_CULTURE_GEO) {
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
    for (const d of CODING_CULTURE_GEO) {
      expect(sameData(buildProp(d.id, 9, 0, 0), buildProp(d.id, 9, 0, 0))).toBe(true);
    }
  });

  it('bracketHedge (hedge v2) stays inside the hedge footprint and height', () => {
    const g = buildProp('hedge', 4, 2, 0);
    const s = size(g);
    expect(s.y).toBeLessThan(1.0);
    expect(Math.max(s.x, s.z)).toBeLessThan(2.8);
    expect(verts(buildProp('hedge', 4, 2, 1))).toBeLessThanOrEqual(0.3 * verts(g));
  });

  it('windChimeTower (windTurbine v3): LOD1 identical to v0 for any seed, LOD0 differs and keeps hooks', () => {
    expect(TURBINE_CHIME_VARIANT).toBe(3);
    for (const seed of [1, 42, 1001]) {
      expect(
        sameData(buildProp('windTurbine', seed, 3, 1), buildProp('windTurbine', seed, 0, 1)),
      ).toBe(true);
    }
    const hero = buildProp('windTurbine', 7, 0, 0);
    const chime = buildProp('windTurbine', 7, 3, 0);
    expect(verts(chime)).toBeGreaterThan(verts(hero));
    expect(size(chime).y).toBeGreaterThan(23);
    expect(size(chime).y).toBeLessThanOrEqual(24.01);
    // pagoda before the head: the yaw range is still the tail of the vertex list
    const yaw = (chime.userData.hooks as { yaw: { first: number; count: number } }).yaw;
    expect(yaw.first + yaw.count).toBe(verts(chime));
    expect(verts(buildProp('windTurbine', 7, 3, 1))).toBeLessThanOrEqual(0.3 * verts(chime));
  });
});
