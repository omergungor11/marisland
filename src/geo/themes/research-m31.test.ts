/** TASK-533: Research Tide-Lab kit (tideLab, tideSub, tideGauge, sunkenCity) + the Research ledger. */
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { cultureCapOverride } from '../../content/budgets.ts';
import { RESEARCH_CULTURE } from '../../content/cultures/research.ts';
import { validateCultures } from '../../content/cultures/validate.ts';
import { PROP_DEFS, PROP_DEF_INDEX } from '../../content/props.ts';
import { RESEARCH_M31_PROP_DEFS } from '../../content/props-themes/research-m31.ts';
import { RESEARCH_M31 as F } from '../../content/themes/research-m31.ts';
import { STRUCTURE_MIN_SIZE, isLargeStructure } from '../../render/props/batcher.ts';
import { PropFlag } from '../../world/prop-store.ts';
import { PROP_GEO, buildProp } from '../registry.ts';

const tris = (g: THREE.BufferGeometry): number => g.getAttribute('position').count / 3;
const box = (g: THREE.BufferGeometry): THREE.Box3 => {
  g.computeBoundingBox();
  return g.boundingBox as THREE.Box3;
};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const hooks = (g: THREE.BufferGeometry): Record<string, any> => g.userData.hooks ?? {};
const arr = (g: THREE.BufferGeometry, n: string): ArrayLike<number> => g.getAttribute(n).array;

/** [id, variant, LOD0 budget, LOD1 / LOD0 ceiling, min y allowed (pile feet / float centre)] */
const ROWS: [string, number, number, number, number][] = [
  ['tideLab', 0, 2600, 0.36, -1.05],
  ['tideSub', 0, 1300, 0.35, -0.05],
  ['tideGauge', 0, 700, 0.4, -0.05],
  ['tideGauge', 1, 560, 0.4, -0.05],
  ['tideGauge', 2, 160, 0.4, -0.05],
  ...F.city.variants.map((_, v): [string, number, number, number, number] => [
    'sunkenCity',
    v,
    400,
    0.6,
    -0.05,
  ]),
];

describe('TASK-533 Research defs and ledger', () => {
  it('three new defs right after the M28 block: tideLab T1, tideGauge T2, sunkenCity T2', () => {
    expect(RESEARCH_M31_PROP_DEFS.map((d) => d.id)).toEqual(['tideLab', 'tideGauge', 'sunkenCity']);
    // M33 TASK-543 (Coding) appends its block after these
    expect(PROP_DEF_INDEX.tideLab).toBe(PROP_DEF_INDEX.sundial + 1);
    expect(PROP_DEF_INDEX.sunkenCity).toBe(PROP_DEF_INDEX.tideLab + 2);
    expect(PROP_DEFS[PROP_DEF_INDEX.tideLab].tier).toBe(1);
    expect(PROP_DEFS[PROP_DEF_INDEX.tideGauge].tier).toBe(2);
    expect(PROP_DEFS[PROP_DEF_INDEX.sunkenCity].tier).toBe(2);
    expect(PROP_DEFS[PROP_DEF_INDEX.sunkenCity].flags & PropFlag.underwater).not.toBe(0);
    for (const d of RESEARCH_M31_PROP_DEFS) expect(PROP_GEO[d.geo].variants).toBe(d.variants);
    expect(PROP_GEO.sunkenCity.variants).toBe(8);
  });

  it('the submersible is a geo-only mover (buildProp works, no PropDef)', () => {
    expect(PROP_GEO.tideSub).toBeDefined();
    expect(PROP_DEF_INDEX.tideSub).toBeUndefined();
  });

  it('ledger: 14 defs = the Research cap override, tier-1 slot used once, valid', () => {
    expect(cultureCapOverride.research).toEqual({ defs: 14, tier1: 1 });
    expect(RESEARCH_CULTURE.kit).toHaveLength(14);
    expect(RESEARCH_CULTURE.kit.filter((k) => k.tier === 1).map((k) => k.id)).toEqual(['tideLab']);
    expect(validateCultures([RESEARCH_CULTURE])).toEqual([]);
    for (const id of ['tideLab', 'tideGauge', 'sunkenCity']) {
      const k = RESEARCH_CULTURE.kit.find((x) => x.id === id);
      const d = PROP_DEFS[PROP_DEF_INDEX[id]];
      expect(k?.tier, id).toBe(d.tier);
      expect(k?.flags, id).toBe(d.flags);
    }
  });

  it('tier hazard (D-096): every sunkenCity / tideGauge variant stays under the T0 size rule', () => {
    for (const id of ['sunkenCity', 'tideGauge']) {
      const d = PROP_DEFS[PROP_DEF_INDEX[id]];
      for (let v = 0; v < d.variants; v++) {
        const size = box(buildProp(id, 3, v, 0)).getSize(new THREE.Vector3());
        expect(size.y, `${id} v${v}`).toBeLessThan(STRUCTURE_MIN_SIZE - 0.1);
        expect(isLargeStructure(d, size), `${id} v${v}`).toBe(false);
      }
    }
    // the lab is a large structure on purpose (drawn from T0)
    const lab = box(buildProp('tideLab', 3, 0, 0)).getSize(new THREE.Vector3());
    expect(isLargeStructure(PROP_DEFS[PROP_DEF_INDEX.tideLab], lab)).toBe(true);
  });
});

describe('TASK-533 per-prop budgets, bounds, determinism', () => {
  for (const [id, v, budget, ratio, minY] of ROWS) {
    it(`${id} v${v}: triangle budget, LOD1 ratio, pivot, nominal height, finite, non-degenerate`, () => {
      const g0 = buildProp(id, 7, v, 0);
      const g1 = buildProp(id, 7, v, 1);
      expect(tris(g0)).toBeLessThanOrEqual(budget);
      expect(tris(g1)).toBeLessThanOrEqual(ratio * tris(g0));
      const b = box(g0);
      expect(b.min.y).toBeGreaterThanOrEqual(minY);
      expect(b.min.y).toBeLessThanOrEqual(id === 'tideLab' ? -0.9 : 0.05);
      const h = PROP_GEO[id].heights?.[v] ?? PROP_GEO[id].height;
      expect(b.max.y).toBeGreaterThanOrEqual(h * 0.94);
      expect(b.max.y).toBeLessThanOrEqual(h * 1.06);
      for (const g of [g0, g1]) {
        const pos = arr(g, 'position');
        expect(Array.from(pos).every(Number.isFinite)).toBe(true);
        for (let i = 0; i < pos.length; i += 9) {
          const a = new THREE.Vector3(pos[i], pos[i + 1], pos[i + 2]);
          const bb = new THREE.Vector3(pos[i + 3], pos[i + 4], pos[i + 5]);
          const c = new THREE.Vector3(pos[i + 6], pos[i + 7], pos[i + 8]);
          expect(bb.sub(a).cross(c.sub(a)).length()).toBeGreaterThan(1e-9);
        }
      }
      const a = Array.from(arr(buildProp(id, 3, v, 0), 'color'));
      expect(a).toEqual(Array.from(arr(buildProp(id, 3, v, 0), 'color')));
      expect(a).not.toEqual(Array.from(arr(buildProp(id, 4, v, 0), 'color')));
      expect(Array.from(arr(buildProp(id, 3, v, 1), 'position'))).toEqual(
        Array.from(arr(buildProp(id, 3, v, 1), 'position')),
      );
    });
  }
});

describe('TASK-533 tideLab frame', () => {
  const g = buildProp('tideLab', 5, 0, 0);
  const h = hooks(g);
  it('deck, door on the pier side (+z), entry beyond the deck edge, piles under the deck', () => {
    expect(h.deck.y).toBe(F.lab.deck.y);
    expect(h.door.dir).toEqual([0, 0, 1]);
    expect(h.entry.at[2]).toBeGreaterThan(h.deck.size[1] / 2);
    expect(h.piles.list).toHaveLength(12);
    expect(h.piles.footY).toBeLessThan(0);
    const b = box(g);
    expect(b.min.y).toBeCloseTo(h.piles.footY, 1);
    // every pile stands inside the deck outline
    for (const [x, z] of h.piles.list) {
      expect(Math.abs(x)).toBeLessThan(h.deck.size[0] / 2);
      expect(Math.abs(z)).toBeLessThan(h.deck.size[1] / 2);
    }
  });
  it('tank volume sits on the deck, inside the deck outline, clear of the cabin', () => {
    const t = h.tank;
    expect(t.size.every((x: number) => x > 0.3)).toBe(true);
    expect(t.center[1] - t.size[1] / 2).toBeGreaterThanOrEqual(h.deck.y);
    expect(t.center[1] + t.size[1] / 2).toBeLessThanOrEqual(t.surfaceY + 1e-6);
    expect(t.center[0] - t.size[0] / 2).toBeGreaterThan(F.lab.cabin.x + F.lab.cabin.w / 2 - 0.05);
    expect(t.center[0] + t.size[0] / 2).toBeLessThan(h.deck.size[0] / 2);
  });
  it('glow slots: window class, tank class, lamp class', () => {
    expect(h.glow).toEqual({ window: 0.75, tank: 0.55, lamp: 1 });
    const em = new Set(Array.from(arr(g, 'emissive')).map((x) => Math.round(x * 100) / 100));
    expect(em.has(0.75)).toBe(true);
    expect(em.has(0.55)).toBe(true);
    expect(em.has(1)).toBe(true);
  });
});

describe('TASK-533 tideSub frame', () => {
  const g = buildProp('tideSub', 5, 0, 0);
  const h = hooks(g);
  it('about 3 u long, bow +z, keel on y = 0, waterline above the keel and below the tower', () => {
    const s = box(g).getSize(new THREE.Vector3());
    expect(s.z).toBeGreaterThan(2.8);
    expect(s.z).toBeLessThan(3.4);
    expect(box(g).min.y).toBeGreaterThanOrEqual(-0.05);
    expect(h.waterline.y).toBeGreaterThan(0.5);
    expect(h.waterline.y).toBeLessThan(h.hatch.at[1]);
  });
  it('hatch on the tower top, bubbles emit from the aft, prop at the stern, lamp glows', () => {
    expect(h.hatch.axis).toEqual([0, 1, 0]);
    expect(h.hatch.at[1]).toBeGreaterThan(1.3);
    expect(h.bubbles.at[2]).toBeLessThan(0);
    expect(h.prop.at[2]).toBeLessThan(-1.4);
    expect(Array.from(arr(g, 'emissive')).some((x) => x === 1)).toBe(true);
  });
});

describe('TASK-533 tideGauge frame', () => {
  it('v0 carries its float as the last vertex range; v1 has none; v2 is the float alone (keel on y = 0)', () => {
    const g = buildProp('tideGauge', 5, 0, 0);
    const f = hooks(g).float;
    expect(f.start + f.count).toBe(g.getAttribute('position').count);
    expect(f.count).toBeGreaterThan(30);
    expect(f.travel[0]).toBeLessThan(0);
    expect(f.travel[1]).toBeGreaterThan(0);
    // every vertex of the range lies around the float rest point
    const pos = arr(g, 'position');
    for (let i = f.start; i < f.start + f.count; i++) {
      expect(Math.abs(pos[i * 3] - f.rest[0])).toBeLessThan(0.3);
      expect(Math.abs(pos[i * 3 + 1] - f.rest[1])).toBeLessThan(0.3);
    }
    expect(hooks(buildProp('tideGauge', 5, 1, 0)).float).toBeUndefined();
    const alone = buildProp('tideGauge', 5, 2, 0);
    expect(hooks(alone).float.count).toBe(alone.getAttribute('position').count);
    expect(box(alone).min.y).toBeCloseTo(0, 1); // pivot at the float's keel
    expect(hooks(alone).float.rest[1]).toBeCloseTo(F.gauge.float.r, 2);
  });
  it('the pole is 2.5 u striped (two alternating colours)', () => {
    const g = buildProp('tideGauge', 5, 1, 0);
    expect(hooks(g).gauge.pole[1]).toBe(F.gauge.poleH);
    expect(box(g).max.y).toBeGreaterThan(F.gauge.poleH);
  });
});

describe('TASK-533 sunkenCity kit', () => {
  it('eight pieces, each with a ruin hook (sea / floor, waterline inside the piece)', () => {
    expect(F.city.variants).toHaveLength(8);
    for (let v = 0; v < 8; v++) {
      const g = buildProp('sunkenCity', 5, v, 0);
      const r = hooks(g).ruin;
      expect(r.name).toBe(F.city.variants[v]);
      expect(['sea', 'floor']).toContain(r.sit);
      if (r.sit === 'sea') {
        expect(r.waterline).toBeGreaterThan(0.5);
        expect(box(g).max.y).toBeGreaterThan(r.waterline + 0.5); // something pokes above the water
      }
    }
  });
  it('weathering: the foot is greener than the top (algae toward the base)', () => {
    const g = buildProp('sunkenCity', 5, 0, 0);
    const pos = arr(g, 'position');
    const col = arr(g, 'color');
    const hsl = { h: 0, s: 0, l: 0 };
    const c = new THREE.Color();
    const greenness = (lo: number, hi: number): number => {
      let sum = 0;
      let n = 0;
      for (let i = 0; i < pos.length / 3; i++) {
        const y = pos[i * 3 + 1];
        if (y < lo || y > hi) continue;
        c.setRGB(col[i * 3], col[i * 3 + 1], col[i * 3 + 2]).getHSL(hsl);
        sum += hsl.h; // sandstone ~0.1, algae ~0.4
        n++;
      }
      return sum / Math.max(1, n);
    };
    expect(greenness(0, 0.5)).toBeGreaterThan(greenness(1.8, 3));
  });
});
