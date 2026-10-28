/** TASK-509b: DevOps M26 lava pack (ember bridge, crater deck, glass kiln, obsidian decor, breakwater, tug). */
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { cultureCapOverride } from '../../content/budgets.ts';
import { DEVOPS_CULTURE } from '../../content/cultures/devops.ts';
import { validateCultures } from '../../content/cultures/validate.ts';
import { PROP_DEFS, PROP_DEF_INDEX } from '../../content/props.ts';
import { DEVOPS_M26_PROP_DEFS } from '../../content/props-themes/devops-m26.ts';
import { FLOATING_FIXTURES } from '../../content/settlements.ts';
import { DEVOPS_GROWTH } from '../../content/themes/devops-growth.ts';
import { DEVOPS_M26 as F } from '../../content/themes/devops-m26.ts';
import { PROP_GEO, buildProp } from '../registry.ts';

const tris = (g: THREE.BufferGeometry): number => g.getAttribute('position').count / 3;
const size = (g: THREE.BufferGeometry): THREE.Vector3 =>
  (g.boundingBox as THREE.Box3).getSize(new THREE.Vector3());
const arr = (g: THREE.BufferGeometry, name: string): number[] =>
  Array.from(g.getAttribute(name).array);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const hooks = (g: THREE.BufferGeometry): Record<string, any> => g.userData.hooks ?? {};
const lit = (g: THREE.BufferGeometry, v: number): number =>
  arr(g, 'emissive').filter((x) => x === v).length;
/** Vertices in the molten (screen) class, emissive 1.6. */
const molten = (g: THREE.BufferGeometry): number =>
  arr(g, 'emissive').filter((x) => x > 1.5).length;

/** LOD0 triangle budgets. */
const BUDGET: Record<string, number> = {
  emberBridge: 1100,
  craterDeck: 1100,
  glassKiln: 1300,
  obsidianShard: 300,
  devopsBreakwater: 700,
};

describe('TASK-509b DevOps M26 defs', () => {
  it('five new defs at the tail of PROP_DEFS, geo variants match', () => {
    expect(DEVOPS_M26_PROP_DEFS.map((d) => d.id)).toEqual([
      'emberBridge',
      'craterDeck',
      'glassKiln',
      'obsidianShard',
      'devopsBreakwater',
    ]);
    const first = PROP_DEF_INDEX.emberBridge;
    DEVOPS_M26_PROP_DEFS.forEach((d, i) => {
      expect(PROP_DEF_INDEX[d.id]).toBe(first + i);
      expect(PROP_GEO[d.id].variants).toBe(d.variants);
    });
    expect(first + 5).toBe(PROP_DEFS.length);
    expect(PROP_DEF_INDEX.oreBucket).toBeLessThan(first);
  });

  it('tug = sailboat variant 9: geo and PropDef agree, random rolls stay on 0-1', () => {
    expect(F.tug.variant).toBe(9);
    expect(PROP_GEO.sailboat.variants).toBe(10);
    const d = PROP_DEFS[PROP_DEF_INDEX.sailboat];
    expect(d.variants).toBe(10);
    expect(d.rollVariants).toBe(2);
    expect(PROP_GEO.sailboat.heights).toHaveLength(10);
    expect(FLOATING_FIXTURES).toContain('sailboat');
    expect(FLOATING_FIXTURES).toContain('devopsBreakwater');
  });

  it('ledger: 19 defs = the DevOps cap override, valid, tiers / flags match the PropDefs', () => {
    expect(cultureCapOverride.devops).toEqual({ defs: 19, tier1: 1 });
    expect(DEVOPS_CULTURE.kit).toHaveLength(19);
    expect(validateCultures([DEVOPS_CULTURE])).toEqual([]);
    for (const d of DEVOPS_M26_PROP_DEFS) {
      const k = DEVOPS_CULTURE.kit.find((e) => e.id === d.id);
      expect(k?.tier, d.id).toBe(d.tier);
      expect(k?.flags, d.id).toBe(d.flags);
    }
  });
});

describe('TASK-509b geometry', () => {
  for (const d of DEVOPS_M26_PROP_DEFS) {
    for (let v = 0; v < d.variants; v++) {
      for (const seed of [3, 1001]) {
        it(`${d.id} v${v} seed ${seed}: budget, LOD1 <= 30 %, vertex colours, finite`, () => {
          const g0 = buildProp(d.id, seed, v, 0);
          const g1 = buildProp(d.id, seed, v, 1);
          expect(tris(g0)).toBeLessThanOrEqual(BUDGET[d.id]);
          expect(tris(g1)).toBeLessThanOrEqual(0.3 * tris(g0));
          for (const x of [g0, g1]) {
            expect(x.getAttribute('color')).toBeDefined();
            expect(x.getAttribute('uv')).toBeUndefined();
            expect(x.index).toBeNull();
            expect(arr(x, 'position').every(Number.isFinite)).toBe(true);
            expect(arr(x, 'color').every((c) => c >= 0 && c <= 1)).toBe(true);
          }
          const g = PROP_GEO[d.id];
          const h = g.heights?.[v] ?? g.height;
          // the top of the prop (skirts and breakwater feet reach below the pivot)
          expect(g0.boundingBox?.max.y).toBeGreaterThan(h * 0.8);
          expect(g0.boundingBox?.max.y).toBeLessThan(h * 1.25);
        });
      }
    }
    it(`${d.id} is deterministic and seed-sensitive`, () => {
      const a = arr(buildProp(d.id, 3, 0, 0), 'position');
      expect(arr(buildProp(d.id, 3, 0, 0), 'position')).toEqual(a);
      expect(arr(buildProp(d.id, 4, 0, 0), 'position')).not.toEqual(a);
    });
  }

  it('ember bridge: spans more than the lava strip, deck is the only walkable height, lava glows under it', () => {
    const L = DEVOPS_GROWTH.lava;
    for (const v of [0, 1]) {
      const g = buildProp('emberBridge', 5, v, 0);
      const s = hooks(g).span;
      expect(s.clear).toBeGreaterThanOrEqual(L.width + 0.3);
      expect(s.length).toBeGreaterThanOrEqual(L.width + 2 * L.margin);
      expect(size(g).z).toBeGreaterThan(s.length - 0.1);
      expect(size(g).x).toBeLessThan(3);
      expect(g.boundingBox?.min.y).toBeGreaterThanOrEqual(-F.bridge.skirt - 0.05);
      expect(molten(g)).toBeGreaterThan(30);
      expect(hooks(g).lamps.list).toHaveLength(4);
      expect(hooks(g).channel.halfWidth).toBe(L.width / 2);
    }
    const rail = hooks(buildProp('emberBridge', 5, 1, 0)).track;
    expect(rail.gauge).toBe(F.bridge.track.gauge);
    expect(rail.to[2] - rail.from[2]).toBeGreaterThan(F.bridge.length - 0.2);
    expect(hooks(buildProp('emberBridge', 5, 0, 0)).track).toBeUndefined();
  });

  it('crater deck: fits the 2.5 u anchor disc, seats and scope face the view, lamps lit', () => {
    const g = buildProp('craterDeck', 5, 0, 0);
    const s = size(g);
    expect(Math.max(s.x, s.z)).toBeLessThanOrEqual(DEVOPS_GROWTH.craterDeck.r * 2 + 0.6);
    const h = hooks(g);
    expect(h.view.dir).toEqual([0, 0, 1]);
    expect(h.seats.list).toHaveLength(2);
    expect(h.scope.dir[2]).toBeGreaterThan(0.9);
    expect(h.lamps.list).toHaveLength(2);
    expect(lit(g, 1)).toBeGreaterThan(20);
    expect(h.entry.at[2]).toBeLessThan(0);
  });

  it('glass kiln: molten mouth, chimney smoke hook above the stack, glass lanterns in DevOps accents', () => {
    const g = buildProp('glassKiln', 5, 0, 0);
    const h = hooks(g);
    expect(molten(g)).toBeGreaterThan(30);
    expect(lit(g, 1)).toBeGreaterThan(100);
    expect(h.smoke.at[1]).toBeGreaterThan(3.5);
    expect(h.smoke.at).toEqual(h.chimney.at);
    expect(h.lamps.list).toHaveLength(F.kiln.lanterns);
    expect(g.boundingBox?.max.y).toBeGreaterThanOrEqual(h.smoke.at[1] - 0.2);
    // pivot between kiln and rack, so the plan is roughly centred on it
    expect(Math.abs((g.boundingBox as THREE.Box3).getCenter(new THREE.Vector3()).x)).toBeLessThan(
      0.6,
    );
    const colours = new Set<string>();
    const c = arr(g, 'color');
    for (let i = 0; i < c.length; i += 9)
      colours.add(
        c
          .slice(i, i + 3)
          .map((x) => x.toFixed(1))
          .join(),
      );
    expect(colours.size).toBeGreaterThan(8);
  });

  it('obsidian shards: dark glass, flat on the ground, under the 3 u structure size, pool hook on v2', () => {
    for (let v = 0; v < 4; v++) {
      const g = buildProp('obsidianShard', 5, v, 0);
      expect(g.boundingBox?.min.y).toBeGreaterThanOrEqual(-0.05);
      expect(size(g).y).toBeLessThan(3);
      expect(Math.max(size(g).x, size(g).z)).toBeLessThan(4);
      // mostly dark: the mean lightness of the colour attribute stays low
      const c = arr(g, 'color');
      let sum = 0;
      for (let i = 0; i < c.length; i += 3) sum += (c[i] + c[i + 1] + c[i + 2]) / 3;
      expect(sum / (c.length / 3)).toBeLessThan(0.35);
    }
    expect(hooks(buildProp('obsidianShard', 5, 2, 0)).pool.r).toBe(F.obsidian.slab.pool);
  });

  it('breakwater: pieces tile along z, the head carries the red light, crest above the water', () => {
    for (let v = 0; v < 3; v++) {
      const g = buildProp('devopsBreakwater', 5, v, 0);
      expect(hooks(g).crest.y).toBe(F.breakwater.crestY);
      expect(size(g).z).toBeGreaterThan(F.breakwater.length[v] - 0.3);
      expect(g.boundingBox?.max.y).toBeGreaterThan(F.breakwater.crestY);
      expect(g.boundingBox?.min.y).toBeLessThan(-1.5);
    }
    const head = hooks(buildProp('devopsBreakwater', 5, 2, 0));
    expect(head.light.at[1]).toBeGreaterThan(F.breakwater.crestY + 1.3);
    expect(hooks(buildProp('devopsBreakwater', 5, 0, 0)).light).toBeUndefined();
  });

  it('tug (sailboat 9): bow +z, keel at y = 0, funnel smoke / tow / bow hooks, pennant sways, lit windows', () => {
    const g = buildProp('sailboat', 5, F.tug.variant, 0);
    const h = hooks(g);
    const s = size(g);
    expect(s.z).toBeGreaterThan(F.tug.length - 0.2);
    expect(s.x).toBeLessThan(F.tug.beam + 0.3);
    expect(g.boundingBox?.min.y).toBeGreaterThanOrEqual(-0.05);
    expect(h.bow.at[2]).toBeGreaterThan(F.tug.length / 2 - 0.2);
    expect(h.tow.at[2]).toBeLessThan(0);
    expect(h.smoke.at[1]).toBeGreaterThan(F.tug.hullH + 1.2);
    expect(h.smoke.at[1]).toBeLessThan(g.boundingBox?.max.y ?? 0);
    expect(h.route).toEqual({ speed: F.tug.speed, lead: F.tug.lead });
    expect(Math.max(...arr(g, 'wind'))).toBeGreaterThan(0);
    expect(lit(g, 1)).toBeGreaterThan(30);
  });
});
