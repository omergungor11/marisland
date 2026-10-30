/** TASK-525: Research M28 signature kit (sundial, rim telescope deck, teal stair lantern). */
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { cultureCapOverride } from '../../content/budgets.ts';
import { RESEARCH_CULTURE } from '../../content/cultures/research.ts';
import { validateCultures } from '../../content/cultures/validate.ts';
import { PROP_DEFS, PROP_DEF_INDEX } from '../../content/props.ts';
import { RESEARCH_M28_PROP_DEFS } from '../../content/props-themes/research-m28.ts';
import { RESEARCH_M28 as F } from '../../content/themes/research-m28.ts';
import { STRUCTURE_MIN_SIZE, isLargeStructure } from '../../render/props/batcher.ts';
import { PropFlag } from '../../world/prop-store.ts';
import { PROP_GEO, buildProp } from '../registry.ts';

const tris = (g: THREE.BufferGeometry): number => g.getAttribute('position').count / 3;
const box = (g: THREE.BufferGeometry): THREE.Box3 => {
  g.computeBoundingBox();
  return g.boundingBox as THREE.Box3;
};
const size = (g: THREE.BufferGeometry): THREE.Vector3 => box(g).getSize(new THREE.Vector3());
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const hooks = (g: THREE.BufferGeometry): Record<string, any> => g.userData.hooks ?? {};
const arr = (g: THREE.BufferGeometry, n: string): ArrayLike<number> => g.getAttribute(n).array;

/** LOD0 triangle budgets. */
const BUDGET: Record<string, number> = {
  sundial: 1600,
  'tripodTelescope:2': 1600,
  'lanternPost:3': 260,
};

describe('TASK-525 Research M28 defs', () => {
  it('sundial is the 4th from last def, geo and PropDef agree, tier 2 grounded', () => {
    expect(RESEARCH_M28_PROP_DEFS.map((d) => d.id)).toEqual(['sundial']);
    // M31 TASK-533 appended three defs after it (tideLab, tideGauge, sunkenCity)
    expect(PROP_DEF_INDEX.sundial).toBe(PROP_DEFS.length - 4);
    const d = PROP_DEFS[PROP_DEF_INDEX.sundial];
    expect(d.tier).toBe(2);
    expect(d.flags).toBe(PropFlag.grounded);
    expect(PROP_GEO.sundial.variants).toBe(d.variants);
  });

  it('variants of old defs: geo and PropDef agree, random rolls keep the old variants', () => {
    for (const [id, variants, roll] of [
      ['tripodTelescope', 3, 2],
      ['lanternPost', 4, 3],
    ] as const) {
      const d = PROP_DEFS[PROP_DEF_INDEX[id]];
      expect(PROP_GEO[id].variants, id).toBe(variants);
      expect(PROP_GEO[id].heights, id).toHaveLength(variants);
      expect(d.variants, id).toBe(variants);
      expect(d.rollVariants, id).toBe(roll);
      expect(d.tier, id).toBe(2);
    }
  });

  it('ledger: the sundial is the 11th entry (M31 TASK-533 grew the cap to 14, see research-m31.test.ts)', () => {
    expect(cultureCapOverride.research).toEqual({ defs: 14, tier1: 1 });
    expect(RESEARCH_CULTURE.kit).toHaveLength(14);
    expect(RESEARCH_CULTURE.kit[10]?.id).toBe('sundial');
    expect(validateCultures([RESEARCH_CULTURE])).toEqual([]);
    const k = RESEARCH_CULTURE.kit[10];
    const d = PROP_DEFS[PROP_DEF_INDEX.sundial];
    expect(k?.tier).toBe(d.tier);
    expect(k?.flags).toBe(d.flags);
  });

  it('older variants are unchanged (tripodTelescope 0-1 aim, lanternPost 0-2)', () => {
    expect(hooks(buildProp('tripodTelescope', 5, 0, 0)).scope).toBeUndefined();
    expect(hooks(buildProp('lanternPost', 5, 1, 0)).lamp).toBeUndefined();
    const a = Array.from(arr(buildProp('tripodTelescope', 5, 1, 0), 'position'));
    expect(a).toEqual(Array.from(arr(buildProp('tripodTelescope', 5, 1, 0), 'position')));
  });
});

describe('TASK-525 per-prop budgets, bounds, determinism', () => {
  const rows: [string, number][] = [
    ['sundial', 0],
    ['tripodTelescope', 2],
    ['lanternPost', 3],
  ];
  for (const [id, v] of rows) {
    const key = id === 'sundial' ? id : `${id}:${v}`;
    it(`${id} v${v}: triangle budget, LOD1 <= 35 %, ground pivot, nominal height, glows`, () => {
      const g0 = buildProp(id, 7, v, 0);
      const g1 = buildProp(id, 7, v, 1);
      expect(tris(g0)).toBeLessThanOrEqual(BUDGET[key]);
      expect(tris(g1)).toBeLessThanOrEqual(0.35 * tris(g0));
      const b = box(g0);
      expect(b.min.y).toBeGreaterThanOrEqual(-0.05);
      expect(b.min.y).toBeLessThanOrEqual(0.05);
      const h = PROP_GEO[id].heights?.[v] ?? PROP_GEO[id].height;
      expect(b.max.y).toBeGreaterThanOrEqual(h * 0.92);
      expect(b.max.y).toBeLessThanOrEqual(h * 1.08);
      for (const g of [g0, g1]) {
        const pos = arr(g, 'position');
        expect(Array.from(pos).every(Number.isFinite)).toBe(true);
        const em = arr(g, 'emissive');
        for (let f = 0; f < em.length; f += 3)
          expect(em[f] === em[f + 1] && em[f] === em[f + 2]).toBe(true);
        // non-degenerate: every triangle has area
        for (let i = 0; i < pos.length; i += 9) {
          const a = new THREE.Vector3(pos[i], pos[i + 1], pos[i + 2]);
          const bb = new THREE.Vector3(pos[i + 3], pos[i + 4], pos[i + 5]);
          const c = new THREE.Vector3(pos[i + 6], pos[i + 7], pos[i + 8]);
          expect(bb.sub(a).cross(c.sub(a)).length()).toBeGreaterThan(1e-9);
        }
      }
      if (id === 'lanternPost') {
        expect(Array.from(arr(g0, 'emissive')).some((x) => x > 0)).toBe(true);
        expect(Array.from(arr(g1, 'emissive')).some((x) => x > 0)).toBe(true);
      }
      // deterministic per seed, seed-sensitive (colour jitter)
      const a = Array.from(arr(buildProp(id, 3, v, 0), 'color'));
      expect(a).toEqual(Array.from(arr(buildProp(id, 3, v, 0), 'color')));
      expect(a).not.toEqual(Array.from(arr(buildProp(id, 4, v, 0), 'color')));
    });
  }
});

describe('TASK-525 sundial frame', () => {
  const g = buildProp('sundial', 5, 0, 0);
  const h = hooks(g);
  it('a 6 u disc, a 2.5 u gnomon along +z, drawn from T0 by size', () => {
    const s = size(g);
    expect(s.x).toBeGreaterThan(5.9);
    expect(s.z).toBeGreaterThan(5.9);
    expect(isLargeStructure(PROP_DEFS[PROP_DEF_INDEX.sundial], s)).toBe(true);
    expect(h.gnomon.axis).toEqual([0, 0, 1]);
    expect(h.gnomon.height).toBe(2.5);
    const [, ty, tz] = h.gnomon.tip;
    const [, by, bz] = h.gnomon.base;
    expect(h.gnomon.tip[0]).toBe(0);
    expect(tz).toBeGreaterThan(bz); // high end north (+z)
    expect(ty - F.sundial.fieldTop).toBeCloseTo(2.5, 2);
    expect(by).toBeLessThan(ty);
    // the blade's vertices all lie in the plane |x| <= thick/2 above the block
    const pos = arr(g, 'position');
    let maxY = 0;
    for (let i = 0; i < pos.length; i += 3) maxY = Math.max(maxY, pos[i + 1]);
    expect(maxY).toBeGreaterThanOrEqual(ty);
    expect(maxY).toBeLessThanOrEqual(ty + 0.2);
  });

  it('noon line on the axis x = 0 running north from the blade to the XII plate', () => {
    expect(h.noonLine.dir).toEqual([0, 0, 1]);
    expect(h.noonLine.from[0]).toBe(0);
    expect(h.noonLine.to[0]).toBe(0);
    expect(h.noonLine.from[2]).toBeCloseTo(F.sundial.gnomon.northZ, 5);
    expect(h.noonLine.to[2]).toBeCloseTo(F.sundial.noon.inner, 5);
    const xii = h.plates.list.find((p: { n: number }) => p.n === 12);
    expect(xii.numeral).toBe('XII');
    expect(xii.at[0]).toBeCloseTo(0, 6);
    expect(xii.at[2]).toBeGreaterThan(F.sundial.noon.inner);
  });

  it('12 hour plates I-XII clockwise from +z (III at -x, VI at -z, IX at +x)', () => {
    const list = h.plates.list as { n: number; numeral: string; at: number[] }[];
    expect(list).toHaveLength(12);
    expect(new Set(list.map((p) => p.n)).size).toBe(12);
    const by = (n: number) => list.find((p) => p.n === n)!;
    expect(by(3).at[0]).toBeLessThan(-2);
    expect(by(9).at[0]).toBeGreaterThan(2);
    expect(by(6).at[2]).toBeLessThan(-2);
    expect(by(8).numeral).toBe('VIII');
    for (const p of list)
      expect(Math.hypot(p.at[0], p.at[2])).toBeCloseTo(F.sundial.plate.radius, 5);
  });

  it('LOD1 drops the glyph strokes', () => {
    expect(tris(buildProp('sundial', 5, 0, 1))).toBeLessThan(tris(g) * 0.3);
  });
});

describe('TASK-525 rim telescope deck (tripodTelescope v2)', () => {
  const g = buildProp('tripodTelescope', 5, F.deck.variant, 0);
  const h = hooks(g);
  it('3 x 2 u platform, stays under the T0 structure size so the def keeps tier 2', () => {
    const s = size(g);
    expect(s.x).toBeGreaterThanOrEqual(2.9);
    expect(s.x).toBeLessThan(STRUCTURE_MIN_SIZE + 0.3);
    expect(Math.min(s.x, s.z)).toBeLessThan(STRUCTURE_MIN_SIZE);
    expect(s.y).toBeLessThan(STRUCTURE_MIN_SIZE);
    expect(isLargeStructure(PROP_DEFS[PROP_DEF_INDEX.tripodTelescope], s)).toBe(false);
    expect(h.deck.size).toEqual([3, 2]);
    expect(h.deck.y).toBeCloseTo(F.deck.top, 6);
  });

  it('bot stand point behind the eyepiece, on the deck, looking out to -z and up', () => {
    expect(h.bot.pose).toBe('gaze');
    expect(h.bot.face).toBeCloseTo(Math.PI, 6);
    const [bx, by, bz] = h.bot.at;
    expect(Math.abs(bx)).toBeLessThan(1.5);
    expect(Math.abs(bz)).toBeLessThan(1);
    expect(by).toBeCloseTo(F.deck.top, 6);
    expect(bz).toBeGreaterThan(h.scope.at[2]); // behind the scope (toward the step)
    expect(h.bot.look[2]).toBeLessThan(0);
    expect(h.bot.look[1]).toBeGreaterThan(0);
    expect(Math.hypot(...(h.bot.look as [number, number, number]))).toBeCloseTo(1, 5);
    expect(h.scope.eyepiece[2]).toBeLessThan(bz);
    expect(h.entry.at[2]).toBeGreaterThan(1);
  });

  it('LOD1 is its own deck (not the tripod), variants 0 and 1 are the tripod', () => {
    expect(PROP_GEO.tripodTelescope.lod1Of?.[2]).toBeUndefined();
    expect(size(buildProp('tripodTelescope', 5, 2, 1)).x).toBeGreaterThanOrEqual(3);
    expect(size(buildProp('tripodTelescope', 5, 0, 0)).x).toBeLessThan(2);
  });
});

describe('TASK-525 teal stair lantern (lanternPost v3)', () => {
  it('1.6-2 u, one lamp slot on the axis, lit in both LODs', () => {
    for (const lod of [0, 1] as const) {
      const g = buildProp('lanternPost', 5, F.lantern.variant, lod);
      const b = box(g);
      expect(b.max.y).toBeGreaterThanOrEqual(1.6);
      expect(b.max.y).toBeLessThanOrEqual(2.0);
      // the emissive vertices form one connected lamp: all within the lamp radius of the axis
      const pos = arr(g, 'position');
      const em = arr(g, 'emissive');
      let n = 0;
      for (let i = 0; i < em.length; i++)
        if (em[i] > 0) {
          n++;
          expect(Math.hypot(pos[i * 3], pos[i * 3 + 2])).toBeLessThan(0.2);
          expect(Math.abs(pos[i * 3 + 1] - F.lantern.lampY)).toBeLessThan(0.3);
        }
      expect(n).toBeGreaterThan(0);
    }
    const h = hooks(buildProp('lanternPost', 5, F.lantern.variant, 0));
    expect(h.lamp.at).toEqual([0, F.lantern.lampY, 0]);
  });
});
