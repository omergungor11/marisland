/** TASK-410: HQ Harbour Guild kit (bounds, ground pivot, min thickness, LOD1 ratio, variant LOD1 identity). */
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { OFFICE_DEFS } from '../../content/offices.ts';
import { PROP_DEFS, PROP_DEF_INDEX } from '../../content/props.ts';
import { HQ_CULTURE_PROP_DEFS as HQ_PROP_DEFS } from '../../content/props-themes/hq.ts';
import { CULTURES } from '../../content/cultures/index.ts';
import { validateCultures } from '../../content/cultures/validate.ts';
import { PropFlag } from '../../world/prop-store.ts';
import { isLargeStructure } from '../../render/props/batcher.ts';
import { PROP_GEO, buildProp } from '../registry.ts';
import { CULTURE_HQ_GEO, GUILD_HALL_VARIANT } from './culture-hq.ts';

const KIT_IDS = CULTURE_HQ_GEO.map((d) => d.id);
/** The M20 additions (TASK-465) have their own test, culture-m20.test.ts. */
const M20_IDS = ['cultureGate', 'goodsStall', 'semaphoreTower', 'mailLine'];
const verts = (g: THREE.BufferGeometry): number => g.getAttribute('position').count;
const size = (g: THREE.BufferGeometry): THREE.Vector3 =>
  (g.boundingBox as THREE.Box3).getSize(new THREE.Vector3());
const arr = (g: THREE.BufferGeometry, name: string): number[] =>
  Array.from(g.getAttribute(name).array);

describe('TASK-410 HQ culture kit: defs and ledger', () => {
  it('every geo has a PropDef with matching variants / windy; tiers are 2-3', () => {
    for (const id of KIT_IDS) {
      const def = HQ_PROP_DEFS.find((d) => d.id === id);
      const geo = PROP_GEO[id];
      expect(def, id).toBeDefined();
      expect(geo, id).toBeDefined();
      expect(def?.variants).toBe(geo.variants);
      expect(((def?.flags ?? 0) & PropFlag.windy) !== 0, id).toBe(geo.windy);
      expect(def?.tier ?? 0, id).toBeGreaterThanOrEqual(2);
      expect(PROP_DEFS[PROP_DEF_INDEX[id]].id).toBe(id);
    }
  });

  it('ledger lists the kit in priority order with the defs real tier and flags', () => {
    const kit = CULTURES.hq.kit;
    expect(kit.map((k) => k.id)).toEqual([
      'ferryAwning',
      'guildNoticeBoard',
      'timetableBoard',
      'bellPost',
      'harbourCrane',
      'coffeeCart',
      'gullPerch',
      'mailbag',
      ...M20_IDS,
    ]);
    expect([...kit.slice(0, 8).map((k) => k.id)].sort()).toEqual([...KIT_IDS].sort());
    for (const k of kit.slice(0, 8)) {
      const def = HQ_PROP_DEFS.find((d) => d.id === k.id);
      expect(def?.tier, k.id).toBe(k.tier);
      expect(def?.flags, k.id).toBe(k.flags);
      // tier-3 micro props skip the shadow pass (B4); nothing else does
      expect((k.flags & PropFlag.noShadow) !== 0, k.id).toBe(k.tier === 3);
    }
    expect(validateCultures([CULTURES.hq])).toEqual([]);
  });
});

describe('TASK-410 HQ culture kit: geometry', () => {
  for (const geo of CULTURE_HQ_GEO) {
    for (let v = 0; v < geo.variants; v++) {
      it(`${geo.id} v${v}: bounds, ground pivot, thickness, LOD1 <= 30 %, no T0 promotion`, () => {
        const g0 = buildProp(geo.id, 3, v, 0);
        const g1 = buildProp(geo.id, 3, v, 1);
        expect(verts(g0) / 3).toBeLessThanOrEqual(3500);
        expect(verts(g1)).toBeLessThanOrEqual(0.3 * verts(g0));
        for (const g of [g0, g1]) {
          const s = size(g);
          expect(Math.min(s.x, s.y, s.z)).toBeGreaterThanOrEqual(0.12);
          expect(g.boundingBox?.min.y ?? 0).toBeGreaterThanOrEqual(-0.05);
          expect(g.boundingBox?.min.y ?? 0).toBeLessThanOrEqual(0.05);
        }
        const s0 = size(g0);
        expect(s0.y).toBeGreaterThan(geo.height * 0.65);
        expect(s0.y).toBeLessThan(geo.height * 1.35);
        expect(Math.max(s0.x, s0.z) / 2).toBeLessThanOrEqual(geo.footprint * 1.6);
        // under STRUCTURE_MIN_SIZE: the batcher must not promote it to tier 0 (W11 calls)
        const def = HQ_PROP_DEFS.find((d) => d.id === geo.id);
        expect(def && isLargeStructure(def, s0), `${geo.id} is a large structure`).toBe(false);
      });
    }
    it(`${geo.id} is deterministic and seed-sensitive`, () => {
      const a = arr(buildProp(geo.id, 3, 0, 0), 'position');
      expect(arr(buildProp(geo.id, 3, 0, 0), 'position')).toEqual(a);
      expect(arr(buildProp(geo.id, 4, 0, 0), 'position')).not.toEqual(a);
    });
  }

  it('guildNoticeBoard carries seven pennants in the seven accents', () => {
    const c = buildProp('guildNoticeBoard', 1, 0, 0).getAttribute('color');
    // distinct hue families above y = 1.7 (the flags hang from the cross bar)
    const p = buildProp('guildNoticeBoard', 1, 0, 0).getAttribute('position');
    const hues = new Set<number>();
    const col = new THREE.Color();
    const hsl = { h: 0, s: 0, l: 0 };
    for (let i = 0; i < c.count; i++) {
      if (p.getY(i) < 1.8 || p.getY(i) > 2.4) continue;
      col.setRGB(c.getX(i), c.getY(i), c.getZ(i)).getHSL(hsl);
      if (hsl.s > 0.4) hues.add(Math.round(hsl.h * 12));
    }
    expect(hues.size).toBeGreaterThanOrEqual(5);
  });

  it('timetableBoard glows (7 rows) and bellPost exposes its swing pivot', () => {
    expect(arr(buildProp('timetableBoard', 1, 0, 0), 'emissive').some((x) => x > 0)).toBe(true);
    const hook = (buildProp('bellPost', 1, 0, 0).userData.hooks as { bell: { pivot: number[] } })
      .bell;
    expect(hook.pivot[1]).toBeGreaterThan(2);
    const perch = buildProp('gullPerch', 1, 0, 0).userData.hooks as {
      perches: { points: number[][] };
    };
    expect(perch.perches.points).toHaveLength(3);
  });
});

describe('TASK-410 hqAnnex v2 (guildHall)', () => {
  it('is a 3-variant def everywhere since TASK-420 placed it (the HQ crown pins v2)', () => {
    expect(PROP_GEO.hqAnnex.variants).toBe(3);
    expect(OFFICE_DEFS.hqAnnex.variants).toBe(3);
    expect(PROP_DEFS[PROP_DEF_INDEX.hqAnnex].variants).toBe(3);
    expect(GUILD_HALL_VARIANT).toBe(2);
  });

  it('LOD1 of variant 2 is bit-identical to hqAnnex v1 LOD1 (B2)', () => {
    const a = buildProp('hqAnnex', 7, 1, 1);
    const b = buildProp('hqAnnex', 7, GUILD_HALL_VARIANT, 1);
    expect(arr(b, 'position')).toEqual(arr(a, 'position'));
    expect(arr(b, 'color')).toEqual(arr(a, 'color'));
  });

  it('LOD0 adds the bell cote and flag poles inside the lot footprint', () => {
    const base = buildProp('hqAnnex', 7, 1, 0);
    const hall = buildProp('hqAnnex', 7, GUILD_HALL_VARIANT, 0);
    expect(verts(hall)).toBeGreaterThan(verts(base));
    expect(verts(hall) / 3).toBeLessThanOrEqual(3500);
    const b = hall.boundingBox as THREE.Box3;
    const def = OFFICE_DEFS.hqAnnex;
    const tol = 0.8;
    expect(b.min.x).toBeGreaterThanOrEqual(-def.w / 2 - tol);
    expect(b.max.x).toBeLessThanOrEqual(def.w / 2 + tol);
    expect(b.min.z).toBeGreaterThanOrEqual(-def.d / 2 - tol);
    expect(b.max.z).toBeLessThanOrEqual(def.d / 2 + tol);
    expect(b.min.y).toBeGreaterThanOrEqual(-0.05);
    expect(hall.userData.tris).toBe(verts(hall) / 3);
    for (const name of ['normal', 'color', 'wind', 'ao', 'emissive'])
      expect(hall.getAttribute(name).count).toBe(verts(hall));
    const six = new Set<string>();
    const col = hall.getAttribute('color');
    for (let i = 0; i < col.count; i += 3)
      if (
        hall.getAttribute('position').getY(i) < 3.4 &&
        Math.abs(hall.getAttribute('position').getX(i)) > 1.45
      )
        six.add(`${col.getX(i).toFixed(2)},${col.getY(i).toFixed(2)},${col.getZ(i).toFixed(2)}`);
    expect(six.size).toBeGreaterThanOrEqual(6);
  });
});

describe('TASK-410 ferry (sailboat v2)', () => {
  it('sailboat has 6 variants in the registry (rolls keep 2); v2 is buildable', () => {
    expect(PROP_GEO.sailboat.variants).toBe(6);
    const g0 = buildProp('sailboat', 3, 2, 0);
    const g1 = buildProp('sailboat', 3, 2, 1);
    const s = size(g0);
    expect(s.z).toBeGreaterThan(5.6); // 6 u hull
    expect(s.z).toBeLessThan(6.6);
    expect(s.y).toBeGreaterThan(5.2 * 0.65);
    expect(s.y).toBeLessThan(5.2 * 1.35);
    expect(g0.boundingBox?.min.y).toBeGreaterThanOrEqual(-0.05);
    expect(g0.boundingBox?.min.y).toBeLessThanOrEqual(0.05);
    expect(verts(g1)).toBeLessThanOrEqual(0.3 * verts(g0));
    expect(Math.min(size(g1).x, size(g1).y, size(g1).z)).toBeGreaterThanOrEqual(0.12);
    expect(arr(g0, 'wind').some((x) => x > 0)).toBe(true);
    expect(arr(g0, 'wind').every((x) => x >= 0 && x <= 1)).toBe(true);
    expect(g0.getAttribute('emissive').count).toBe(verts(g0));
    expect(g0.index).toBeNull();
  });

  it('variants 0 and 1 are the same builds as before (no hull change)', () => {
    for (const v of [0, 1]) {
      const g = buildProp('sailboat', 3, v, 0);
      const s = size(g);
      expect(s.z).toBeLessThan(5.6);
      expect(verts(g) / 3).toBeLessThan(600);
    }
  });
});
