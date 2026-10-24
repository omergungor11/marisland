/** TASK-414: QA Inspectors kit (bounds, ground pivot, min thickness, LOD1 ratio, variant LOD1 identity). */
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { PROP_DEFS, PROP_DEF_INDEX } from '../../content/props.ts';
import { QA_CULTURE_PROP_DEFS as QA_PROP_DEFS } from '../../content/props-themes/qa.ts';
import { CULTURES } from '../../content/cultures/index.ts';
import { validateCultures } from '../../content/cultures/validate.ts';
import { PropFlag } from '../../world/prop-store.ts';
import { isLargeStructure } from '../../render/props/batcher.ts';
import { PROP_GEO, buildProp } from '../registry.ts';
import { BUG_ZOO_VARIANT, CULTURE_QA_GEO, GRANDSTAND_VARIANT } from './culture-qa.ts';

const KIT_IDS = CULTURE_QA_GEO.map((d) => d.id);
const verts = (g: THREE.BufferGeometry): number => g.getAttribute('position').count;
const size = (g: THREE.BufferGeometry): THREE.Vector3 =>
  (g.boundingBox as THREE.Box3).getSize(new THREE.Vector3());
const arr = (g: THREE.BufferGeometry, name: string): number[] =>
  Array.from(g.getAttribute(name).array);

describe('TASK-414 QA culture kit: defs and ledger', () => {
  it('every geo has a PropDef with matching variants / windy; tiers are 2-3', () => {
    for (const id of KIT_IDS) {
      const def = QA_PROP_DEFS.find((d) => d.id === id);
      const geo = PROP_GEO[id];
      expect(def, id).toBeDefined();
      expect(def?.variants).toBe(geo.variants);
      expect(((def?.flags ?? 0) & PropFlag.windy) !== 0, id).toBe(geo.windy);
      expect(def?.tier ?? 0, id).toBeGreaterThanOrEqual(2);
      expect(PROP_DEFS[PROP_DEF_INDEX[id]].id).toBe(id);
    }
  });

  it('ledger lists the kit in priority order with real tier and flags', () => {
    const kit = CULTURES.qa.kit;
    expect(kit.map((k) => k.id)).toEqual([
      'dummyBench',
      'inspectionBooth',
      'uvLampPost',
      'scoreboard',
      'bugJar',
      'conePyramid',
      'flagMast',
      'stampDesk',
      'clipboardWall',
    ]);
    expect([...kit.map((k) => k.id)].sort()).toEqual([...KIT_IDS].sort());
    for (const k of kit) {
      const def = QA_PROP_DEFS.find((d) => d.id === k.id);
      expect(def?.tier, k.id).toBe(k.tier);
      expect(def?.flags, k.id).toBe(k.flags);
      expect((k.flags & PropFlag.noShadow) !== 0, k.id).toBe(k.tier === 3);
    }
    expect(validateCultures([CULTURES.qa])).toEqual([]);
  });
});

describe('TASK-414 QA culture kit: geometry', () => {
  for (const geo of CULTURE_QA_GEO) {
    for (let v = 0; v < geo.variants; v++) {
      for (const seed of [3, 1001]) {
        it(`${geo.id} v${v} seed ${seed}: bounds, ground pivot, thickness, LOD1 <= 30 %, no T0 promotion`, () => {
          const g0 = buildProp(geo.id, seed, v, 0);
          const g1 = buildProp(geo.id, seed, v, 1);
          expect(verts(g0) / 3).toBeLessThanOrEqual(1500);
          expect(verts(g1)).toBeLessThanOrEqual(0.3 * verts(g0));
          for (const g of [g0, g1]) {
            const s = size(g);
            expect(Math.min(s.x, s.y, s.z)).toBeGreaterThanOrEqual(0.12);
            expect(g.boundingBox?.min.y ?? 0).toBeGreaterThanOrEqual(-0.05);
            expect(g.boundingBox?.min.y ?? 0).toBeLessThanOrEqual(0.05);
          }
          const s0 = size(g0);
          const h = geo.heights?.[v] ?? geo.height;
          expect(s0.y).toBeGreaterThan(h * 0.65);
          expect(s0.y).toBeLessThan(h * 1.35);
          // the Q15 grandstand (TASK-480) is a 4.6 × 1.9 u prefab the plan blocks as a rect
          const reach =
            geo.id === 'dummyBench' && v === GRANDSTAND_VARIANT ? 2.6 : geo.footprint * 1.8;
          expect(Math.max(s0.x, s0.z) / 2).toBeLessThanOrEqual(reach);
          const def = QA_PROP_DEFS.find((d) => d.id === geo.id);
          expect(def && isLargeStructure(def, s0), `${geo.id} is a large structure`).toBe(false);
        });
      }
    }
    it(`${geo.id} is deterministic and seed-sensitive`, () => {
      const a = arr(buildProp(geo.id, 3, 0, 0), 'position');
      expect(arr(buildProp(geo.id, 3, 0, 0), 'position')).toEqual(a);
      expect(arr(buildProp(geo.id, 4, 0, 0), 'position')).not.toEqual(a);
    });
  }

  it('scoreboard variants share one LOD1; the lit digit differs at LOD0', () => {
    const a = buildProp('scoreboard', 5, 0, 1);
    const b = buildProp('scoreboard', 5, 1, 1);
    expect(arr(b, 'position')).toEqual(arr(a, 'position'));
    expect(arr(b, 'color')).toEqual(arr(a, 'color'));
    const c0 = arr(buildProp('scoreboard', 5, 0, 0), 'color');
    const c1 = arr(buildProp('scoreboard', 5, 1, 0), 'color');
    expect(c1).not.toEqual(c0);
  });

  it('uvLampPost glows UV purple and exposes hooks', () => {
    const g = buildProp('uvLampPost', 1, 0, 0);
    expect(arr(g, 'emissive').some((x) => x > 0)).toBe(true);
    expect((g.userData.hooks as { lamp: unknown }).lamp).toBeDefined();
    const f = buildProp('flagMast', 1, 0, 0);
    expect(arr(f, 'wind').some((x) => x > 0)).toBe(true);
  });
});

describe('TASK-414 variants of existing defs (hallOfChecks, bugZoo, inspection boat)', () => {
  it('placed variants are bumped but never rolled (TASK-424); the boat waits for wave 3', () => {
    expect(PROP_GEO.testHangar.variants).toBe(2);
    expect(PROP_GEO.terrarium.variants).toBe(3);
    expect(PROP_GEO.sailboat.variants).toBe(5);
    expect(PROP_DEFS[PROP_DEF_INDEX.testHangar].variants).toBe(2);
    expect(PROP_DEFS[PROP_DEF_INDEX.testHangar].rollVariants).toBe(1);
    expect(PROP_DEFS[PROP_DEF_INDEX.terrarium].variants).toBe(3);
    expect(PROP_DEFS[PROP_DEF_INDEX.terrarium].rollVariants).toBe(2);
    expect(PROP_DEFS[PROP_DEF_INDEX.sailboat].variants).toBe(5);
    expect(PROP_DEFS[PROP_DEF_INDEX.sailboat].rollVariants).toBe(2);
  });

  it('testHangar v0 is untouched; v1 (hallOfChecks) adds badges and shares LOD1', () => {
    const v0 = buildProp('testHangar', 7, 0, 0);
    const v1 = buildProp('testHangar', 7, 1, 0);
    expect(verts(v1)).toBeGreaterThan(verts(v0));
    expect(verts(v1) / 3).toBeLessThanOrEqual(3500);
    const a = buildProp('testHangar', 7, 0, 1);
    const b = buildProp('testHangar', 7, 1, 1);
    expect(arr(b, 'position')).toEqual(arr(a, 'position'));
    expect(arr(b, 'color')).toEqual(arr(a, 'color'));
  });

  it('terrarium v2 (bugZoo): green frame, LOD1 = v1, v0/v1 unchanged', () => {
    expect(BUG_ZOO_VARIANT).toBe(2);
    const z = buildProp('terrarium', 5, 2, 0);
    expect(verts(z) / 3).toBeLessThanOrEqual(3500);
    expect(z.boundingBox?.min.y).toBeGreaterThanOrEqual(-0.05);
    expect(verts(z)).toBeGreaterThan(verts(buildProp('terrarium', 5, 1, 0)));
    expect(verts(buildProp('terrarium', 5, 2, 1))).toBeLessThanOrEqual(0.3 * verts(z));
    const a = buildProp('terrarium', 5, 1, 1);
    const b = buildProp('terrarium', 5, 2, 1);
    expect(arr(b, 'position')).toEqual(arr(a, 'position'));
    expect(arr(b, 'color')).toEqual(arr(a, 'color'));
    // no near-white frame vertex left (the glazing frame was recoloured green)
    const c = z.getAttribute('color');
    let white = 0;
    const p = z.getAttribute('position');
    for (let i = 0; i < c.count; i++)
      if (c.getX(i) > 0.8 && c.getY(i) > 0.8 && c.getZ(i) > 0.75 && p.getY(i) > 0.5) white++;
    expect(white).toBeLessThan(120); // only the cream shield plaque
  });

  it('sailboat v3 (inspection boat) is buildable, grounded, lit, with a LOD1 <= 30 %', () => {
    const g0 = buildProp('sailboat', 3, 3, 0);
    const g1 = buildProp('sailboat', 3, 3, 1);
    const s = size(g0);
    expect(s.z).toBeGreaterThan(5.2);
    expect(s.z).toBeLessThan(6.0);
    expect(s.y).toBeGreaterThan(5.2 * 0.65);
    expect(s.y).toBeLessThan(5.2 * 1.35);
    expect(g0.boundingBox?.min.y).toBeGreaterThanOrEqual(-0.05);
    expect(g0.boundingBox?.min.y).toBeLessThanOrEqual(0.05);
    expect(verts(g1)).toBeLessThanOrEqual(0.3 * verts(g0));
    expect(Math.min(size(g1).x, size(g1).y, size(g1).z)).toBeGreaterThanOrEqual(0.12);
    expect(arr(g0, 'wind').some((x) => x > 0)).toBe(true);
    expect(arr(g0, 'emissive').some((x) => x > 0)).toBe(true);
    expect(g0.index).toBeNull();
  });
});
