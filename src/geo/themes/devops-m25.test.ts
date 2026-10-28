/** TASK-504: DevOps M25 signature kit (funicular, ore cableway, geyser, onsen stilts, smith stall, watch beam head). */
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { cultureCapOverride } from '../../content/budgets.ts';
import { DEVOPS_CULTURE } from '../../content/cultures/devops.ts';
import { validateCultures } from '../../content/cultures/validate.ts';
import { PROP_DEFS, PROP_DEF_INDEX } from '../../content/props.ts';
import { DEVOPS_M25_PROP_DEFS } from '../../content/props-themes/devops-m25.ts';
import { DEVOPS_M25, railHeight } from '../../content/themes/devops-m25.ts';
import { isLargeStructure } from '../../render/props/batcher.ts';
import { createRng } from '../../core/rng.ts';
import { PROP_GEO, buildProp } from '../registry.ts';
import { buildOreCable } from './devops-m25.ts';

const tris = (g: THREE.BufferGeometry): number => g.getAttribute('position').count / 3;
const size = (g: THREE.BufferGeometry): THREE.Vector3 =>
  (g.boundingBox as THREE.Box3).getSize(new THREE.Vector3());
const arr = (g: THREE.BufferGeometry, name: string): number[] =>
  Array.from(g.getAttribute(name).array);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const hooks = (g: THREE.BufferGeometry): Record<string, any> => g.userData.hooks ?? {};

/** LOD0 triangle budgets of the new defs. */
const BUDGET: Record<string, number> = {
  funicularRail: 500,
  funicularCar: 900,
  geyserCone: 600,
  oreBucket: 300,
};

describe('TASK-504 DevOps M25 defs', () => {
  it('four new defs, appended at the tail of PROP_DEFS, geo variants match', () => {
    expect(DEVOPS_M25_PROP_DEFS.map((d) => d.id)).toEqual([
      'funicularRail',
      'funicularCar',
      'geyserCone',
      'oreBucket',
    ]);
    const first = PROP_DEF_INDEX.funicularRail;
    DEVOPS_M25_PROP_DEFS.forEach((d, i) => {
      expect(PROP_DEF_INDEX[d.id]).toBe(first + i);
      expect(PROP_GEO[d.id].variants).toBe(d.variants);
    });
    // later blocks (TASK-498 wind tunnel) append after these four
    expect(first + 4).toBeLessThanOrEqual(PROP_DEFS.length);
    expect(PROP_DEF_INDEX.dropTower).toBeLessThan(first);
  });

  it('variants of older defs: geo and PropDef agree, random rolls keep the old variants', () => {
    const roll = (id: string): number => {
      const d = PROP_DEFS[PROP_DEF_INDEX[id]];
      expect(PROP_GEO[id].variants, id).toBe(d.variants);
      return d.rollVariants ?? d.variants;
    };
    expect(roll('rackShed')).toBe(2);
    expect(roll('onsenHouse')).toBe(1);
    expect(roll('goodsStall')).toBe(7);
    expect(roll('mailLine')).toBe(2);
    expect(PROP_GEO.rackShed.variants).toBe(3);
    expect(PROP_GEO.onsenHouse.variants).toBe(3);
    expect(PROP_GEO.goodsStall.variants).toBe(8);
    // TASK-517 (D-096) added the Marketing cable car v4 / v5 / v6, TASK-518 (D-097) the terminal v7
    expect(PROP_GEO.mailLine.variants).toBe(8);
  });

  it('ledger: 19 defs = the DevOps cap override, one tier-1, valid', () => {
    // TASK-509b (D-092) raised the cap 14 -> 19 (the lava pack)
    expect(cultureCapOverride.devops).toEqual({ defs: 19, tier1: 1 });
    expect(DEVOPS_CULTURE.kit).toHaveLength(19);
    expect(validateCultures([DEVOPS_CULTURE])).toEqual([]);
    for (const d of DEVOPS_M25_PROP_DEFS) {
      const k = DEVOPS_CULTURE.kit.find((e) => e.id === d.id);
      expect(k?.tier, d.id).toBe(d.tier);
      expect(k?.flags, d.id).toBe(d.flags);
    }
  });

  it('the new defs stay under the 3 u structure size (no T0 promotion)', () => {
    for (const d of DEVOPS_M25_PROP_DEFS)
      for (let v = 0; v < d.variants; v++)
        expect(isLargeStructure(d, size(buildProp(d.id, 3, v, 0))), `${d.id} v${v}`).toBe(false);
  });
});

describe('TASK-504 new geometry', () => {
  for (const d of DEVOPS_M25_PROP_DEFS) {
    for (let v = 0; v < d.variants; v++) {
      for (const seed of [3, 1001]) {
        it(`${d.id} v${v} seed ${seed}: budget, ground pivot, LOD1 <= 30 %, vertex colours, finite`, () => {
          const g0 = buildProp(d.id, seed, v, 0);
          const g1 = buildProp(d.id, seed, v, 1);
          expect(tris(g0)).toBeLessThanOrEqual(BUDGET[d.id]);
          expect(tris(g1)).toBeLessThanOrEqual(0.3 * tris(g0));
          for (const x of [g0, g1]) {
            expect(x.boundingBox?.min.y ?? 0).toBeGreaterThanOrEqual(-0.05);
            expect(x.boundingBox?.min.y ?? 0).toBeLessThanOrEqual(0.05);
            expect(x.getAttribute('color')).toBeDefined();
            expect(x.getAttribute('uv')).toBeUndefined();
            expect(x.index).toBeNull();
            expect(arr(x, 'position').every(Number.isFinite)).toBe(true);
            expect(arr(x, 'color').every((c) => c >= 0 && c <= 1)).toBe(true);
          }
          const g = PROP_GEO[d.id];
          const h = g.heights?.[v] ?? g.height;
          const s0 = size(g0);
          expect(s0.y).toBeGreaterThan(h * 0.8);
          expect(s0.y).toBeLessThan(h * 1.25);
        });
      }
    }
    it(`${d.id} is deterministic and seed-sensitive`, () => {
      const a = arr(buildProp(d.id, 3, 0, 0), 'position');
      expect(arr(buildProp(d.id, 3, 0, 0), 'position')).toEqual(a);
      expect(arr(buildProp(d.id, 4, 0, 0), 'position')).not.toEqual(a);
    });
  }

  it('rail pieces tile: the rail rises by pitch x piece and the hook says where the next piece starts', () => {
    const R = DEVOPS_M25.rail;
    for (let v = 0; v < 3; v++) {
      const g = buildProp('funicularRail', 5, v, 0);
      const r = hooks(g).rail;
      expect(r.length).toBe(R.piece);
      expect(r.endY - r.startY).toBeCloseTo(R.pitches[v] * R.piece, 5);
      expect(size(g).z).toBeGreaterThan(R.piece - 0.2);
      expect(size(g).z).toBeLessThan(R.piece + 0.3);
      expect(g.boundingBox?.min.z).toBeGreaterThan(-0.2);
      expect(railHeight(v)).toBeGreaterThan(R.clearance);
    }
  });

  it('car: two cabins, lit windows and lamps (emissive), hooks for the mover', () => {
    for (const v of [0, 1]) {
      const g = buildProp('funicularCar', 5, v, 0);
      expect(arr(g, 'emissive').filter((x) => x === 1).length).toBeGreaterThan(150);
      const c = hooks(g).car;
      expect(c.cabins).toHaveLength(2);
      expect(c.lamps.length).toBeGreaterThanOrEqual(4);
      expect(c.pitchRef).toBe(DEVOPS_M25.car.pitchRef);
      expect(size(g).z).toBeGreaterThan(DEVOPS_M25.car.length - 0.2);
    }
    expect(arr(buildProp('funicularCar', 5, 0, 0), 'color')).not.toEqual(
      arr(buildProp('funicularCar', 5, 1, 0), 'color'),
    );
  });

  it('geyser cone: spout hook on top of the mound, under 3 u wide', () => {
    for (const seed of [1, 7, 1001, 99991]) {
      const g = buildProp('geyserCone', seed, 0, 0);
      const s = hooks(g).spout;
      expect(s.at[1]).toBeCloseTo(DEVOPS_M25.geyser.height, 1);
      expect(g.boundingBox?.max.y).toBeGreaterThanOrEqual(s.at[1] - 0.05);
      expect(size(g).x).toBeLessThan(3);
      expect(size(g).z).toBeLessThan(3);
      expect(hooks(g).emitter).toEqual(s.at);
    }
  });

  it('ore bucket: grip hook above the bucket, variant 1 glows', () => {
    const g0 = buildProp('oreBucket', 3, 0, 0);
    const g1 = buildProp('oreBucket', 3, 1, 0);
    expect(hooks(g0).bucket.grip[1]).toBe(DEVOPS_M25.ore.bucket.grip);
    const glow = (g: THREE.BufferGeometry): number =>
      arr(g, 'emissive').filter((x) => x === 1).length;
    expect(glow(g1)).toBeGreaterThan(glow(g0));
  });
});

describe('TASK-504 variants of existing defs', () => {
  it('ore pylons (mailLine 2 / 3): anchors on the cross arm, the stock variants unchanged', () => {
    for (const v of [2, 3]) {
      const g = buildProp('mailLine', 5, v, 0);
      const a = hooks(g).cable.anchor as number[];
      expect(a).toEqual([...DEVOPS_M25.ore.anchor[v - 2]]);
      expect(g.boundingBox?.max.y).toBeGreaterThan(a[1]);
      expect(g.boundingBox?.min.y).toBeGreaterThanOrEqual(-0.05);
      expect(tris(buildProp('mailLine', 5, v, 1))).toBeLessThanOrEqual(0.3 * tris(g));
    }
    expect(hooks(buildProp('mailLine', 5, 2, 0)).cable.back).toBeDefined();
    expect(hooks(buildProp('mailLine', 5, 3, 0)).ore.at).toBeDefined();
    const v0 = buildProp('mailLine', 5, 0, 0);
    expect(hooks(v0).cable.anchor).toBeDefined();
    const cable = buildOreCable(createRng(1), { x: 0, y: 6, z: 0 }, { x: 0, y: 3, z: 20 }, 0);
    expect(arr(cable, 'position').every(Number.isFinite)).toBe(true);
  });

  it('funicular station (rackShed 2): the shed plus a track stub and a cable wheel, own LOD1', () => {
    const base = buildProp('rackShed', 5, 0, 0);
    const st = buildProp('rackShed', 5, 2, 0);
    expect(tris(st)).toBeGreaterThan(tris(base));
    expect(st.userData.hubs).toBeDefined();
    expect(hooks(st).wheel.center[1]).toBe(DEVOPS_M25.station.wheelY);
    expect(hooks(st).track.pitch).toBeGreaterThan(0);
  });

  it('onsen stilt houses (onsenHouse 1 / 2): raised by the stilt height, the emitter follows, v2 has towels', () => {
    const base = buildProp('onsenHouse', 5, 0, 0);
    const v1 = buildProp('onsenHouse', 5, 1, 0);
    const v2 = buildProp('onsenHouse', 5, 2, 0);
    expect(size(v1).y).toBeCloseTo(size(base).y + DEVOPS_M25.onsen.stilt, 1);
    expect(hooks(v1).emitter[1]).toBeCloseTo(hooks(base).emitter[1] + DEVOPS_M25.onsen.stilt, 5);
    expect(tris(v2)).toBeGreaterThan(tris(v1));
    expect(Math.max(...arr(v2, 'wind'))).toBeGreaterThan(0);
    expect(Math.max(...arr(v1, 'wind'))).toBe(0);
    expect(v1.boundingBox?.min.y).toBeGreaterThanOrEqual(-0.05);
    expect(arr(buildProp('onsenHouse', 5, 2, 1), 'position')).toEqual(
      arr(buildProp('onsenHouse', 5, 1, 1), 'position'),
    );
  });

  it("smith's stall (goodsStall 7): more parts than the DevOps stall, under 3 u, far shape shared", () => {
    const base = buildProp('goodsStall', 5, 5, 0);
    const smith = buildProp('goodsStall', 5, DEVOPS_M25.smith.variant, 0);
    expect(tris(smith)).toBeGreaterThan(tris(base));
    expect(size(smith).y).toBeLessThan(3);
    expect(arr(buildProp('goodsStall', 5, 7, 1), 'position')).toEqual(
      arr(buildProp('goodsStall', 5, 5, 1), 'position'),
    );
    expect(arr(smith, 'emissive').some((x) => x === 1)).toBe(true);
  });

  it('watch tower (antennaMast 2): bell and beam hooks, the beam head sits above the lamp', () => {
    const g = buildProp('antennaMast', 5, 2, 0);
    expect(hooks(g).bell.at[1]).toBeGreaterThan(9);
    expect(hooks(g).beam.at[1]).toBeGreaterThan(hooks(g).bell.at[1]);
    expect(g.boundingBox?.max.y).toBeGreaterThan(hooks(g).beam.at[1] + 0.2);
  });
});
