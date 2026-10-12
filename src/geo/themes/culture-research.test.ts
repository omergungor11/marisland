/** TASK-416 Star Academy kit: bounds, ground pivot, min thickness, LOD1 budget, variant identity. */
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { RESEARCH_CULTURE } from '../../content/cultures/research.ts';
import { validateCultures } from '../../content/cultures/validate.ts';
import { PROP_DEFS } from '../../content/props.ts';
import { isLargeStructure } from '../../render/props/batcher.ts';
import { PropFlag } from '../../world/prop-store.ts';
import { PROP_GEO, buildProp } from '../registry.ts';
import { RESEARCH_CULTURE_GEO } from './culture-research.ts';

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
const emissiveCount = (g: THREE.BufferGeometry, min = 0.5): number => {
  const a = g.getAttribute('emissive');
  let n = 0;
  for (let i = 0; i < a.count; i++) if (a.getX(i) > min) n++;
  return n;
};

/** LOD0 vertex ceiling (~ 2.5k tris). */
const MAX_VERTS = 7500;

describe('TASK-416 Star Academy kit', () => {
  it('ledger = the new PropDefs, ordered, validator-clean', () => {
    expect(validateCultures([RESEARCH_CULTURE])).toEqual([]);
    const ids = RESEARCH_CULTURE.kit.map((k) => k.id);
    expect(ids).toEqual(expect.arrayContaining(RESEARCH_CULTURE_GEO.map((d) => d.id)));
    expect(ids).toHaveLength(RESEARCH_CULTURE_GEO.length);
    expect(ids.slice(0, 6)).toEqual([
      'tripodTelescope',
      'chalkboard',
      'orrery',
      'lectureSteps',
      'teaTrolley',
      'weatherBalloonCart',
    ]);
    for (const k of RESEARCH_CULTURE.kit) {
      const d = PROP_DEFS.find((p) => p.id === k.id);
      expect(d, k.id).toBeDefined();
      expect(d?.tier).toBe(k.tier);
      expect(d?.flags).toBe(k.flags);
      if (k.tier === 3) expect(k.flags & PropFlag.noShadow, k.id).toBeTruthy();
    }
    // the new defs sit at the END of PROP_DEFS (no existing defId shifts)
    const first = PROP_DEFS.findIndex((p) => p.id === RESEARCH_CULTURE.kit[0].id);
    for (const k of RESEARCH_CULTURE.kit)
      expect(PROP_DEFS.findIndex((p) => p.id === k.id)).toBeGreaterThanOrEqual(first);
  });

  for (const def of RESEARCH_CULTURE_GEO) {
    const pd = PROP_DEFS.find((p) => p.id === def.id);
    it(`${def.id}: PropDef lines up`, () => {
      expect(pd?.variants).toBe(def.variants);
      expect(pd ? (pd.flags & PropFlag.windy) !== 0 : null).toBe(def.windy);
      expect(pd?.footprint).toBeCloseTo(def.footprint, 5);
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
    for (const d of RESEARCH_CULTURE_GEO) {
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
    for (const d of RESEARCH_CULTURE_GEO)
      for (let v = 0; v < d.variants; v++)
        expect(sameData(buildProp(d.id, 9, v, 0), buildProp(d.id, 9, v, 0))).toBe(true);
  });

  it('LOD1 of the variant look-alikes is shared (lod1Of)', () => {
    for (const [id, vs] of [
      ['chalkboard', [1, 2]],
      ['orrery', [1]],
      ['teaTrolley', [1]],
      ['owlBox', [1]],
    ] as const)
      for (const v of vs)
        for (const seed of [1, 42])
          expect(
            sameData(buildProp(id, seed, v, 1), buildProp(id, seed, 0, 1)),
            `${id} v${v}`,
          ).toBe(true);
  });

  it('orrery: the planet wheel carries an aSpin hub (z axis), the ring and pillar do not', () => {
    for (const v of [0, 1]) {
      const g = buildProp('orrery', 5, v, 0);
      const spin = g.getAttribute('aSpin');
      let tagged = 0;
      for (let i = 0; i < spin.count; i++) if (spin.getW(i) === 1) tagged++;
      expect(tagged, `v${v}`).toBeGreaterThan(60);
      expect(tagged, `v${v}`).toBeLessThan(spin.count * 0.6);
      expect(g.userData.hubs[0][1]).toBeGreaterThan(1.2);
      expect(g.userData.spinAxis).toEqual([0, 0, 1]);
    }
  });

  it('chalkboard: v2 is a glowing star chart; the other boards are mostly unlit', () => {
    expect(emissiveCount(buildProp('chalkboard', 5, 2, 0))).toBeGreaterThan(150);
    expect(emissiveCount(buildProp('chalkboard', 5, 1, 0))).toBeLessThan(
      emissiveCount(buildProp('chalkboard', 5, 2, 0)) / 2,
    );
  });

  it('lamps and eyes glow: lectureSteps, teaTrolley, owlBox v1, tripodTelescope', () => {
    for (const id of ['lectureSteps', 'teaTrolley', 'tripodTelescope', 'owlBox'])
      expect(emissiveCount(buildProp(id, 5, 0, 0)), id).toBeGreaterThan(20);
    expect(emissiveCount(buildProp('owlBox', 5, 1, 0))).toBeGreaterThan(
      emissiveCount(buildProp('owlBox', 5, 0, 0)),
    );
  });

  it('weatherBalloonCart: v0 carries the balloon (tall), v1 is the cart after the launch', () => {
    expect(size(buildProp('weatherBalloonCart', 5, 0, 0)).y).toBeGreaterThan(2.2);
    expect(size(buildProp('weatherBalloonCart', 5, 1, 0)).y).toBeLessThan(1.5);
  });

  it('miniVolcanoTerrarium: lava glows, steam emitter above the crater, clear aqua panes', () => {
    const lin = new THREE.Color('#8EEBE0');
    for (const v of [0, 1]) {
      const g = buildProp('miniVolcanoTerrarium', 5, v, 0);
      expect(emissiveCount(g)).toBeGreaterThan(30);
      const hook = (g.userData.hooks as { emitter: number[] }).emitter;
      expect(hook).toHaveLength(3);
      expect(hook[1]).toBeGreaterThan(0.4);
      expect(hook[1]).toBeLessThan(size(g).y);
      // clear pale aqua panes: a share of the faces is aqua (not tinted, not multi-coloured)
      const c = g.getAttribute('color');
      let aqua = 0;
      for (let i = 0; i < c.count; i++)
        if (
          Math.abs(c.getX(i) - lin.r) < 0.12 &&
          Math.abs(c.getY(i) - lin.g) < 0.12 &&
          Math.abs(c.getZ(i) - lin.b) < 0.12
        )
          aqua++;
      expect(aqua, `v${v} aqua vertices`).toBeGreaterThan(30);
    }
  });

  it('pigeonPerch / bookCart / miniVolcanoTerrarium are tier-3 noShadow micro props', () => {
    for (const id of ['pigeonPerch', 'bookCart', 'miniVolcanoTerrarium']) {
      const pd = PROP_DEFS.find((p) => p.id === id);
      expect(pd?.tier).toBe(3);
      expect((pd?.flags ?? 0) & PropFlag.noShadow).toBeTruthy();
    }
  });
});

describe('TASK-416 variants of existing defs (observatory v2, campusTower v3)', () => {
  it('observatory v2 and campusTower v3: LOD1 is variant 0 bit for bit, LOD0 differs', () => {
    for (const seed of [1, 42, 1001]) {
      expect(
        sameData(buildProp('observatory', seed, 2, 1), buildProp('observatory', seed, 0, 1)),
      ).toBe(true);
      expect(
        sameData(buildProp('campusTower', seed, 3, 1), buildProp('campusTower', seed, 0, 1)),
      ).toBe(true);
    }
    expect(sameData(buildProp('observatory', 5, 2, 0), buildProp('observatory', 5, 0, 0))).toBe(
      false,
    );
    expect(sameData(buildProp('campusTower', 5, 3, 0), buildProp('campusTower', 5, 0, 0))).toBe(
      false,
    );
  });

  it('observatory v2 stays in the landmark envelope; the dome interior glows teal', () => {
    const g = buildProp('observatory', 5, 2, 0);
    const s = size(g);
    expect(s.y).toBeGreaterThanOrEqual(10);
    expect(s.y).toBeLessThanOrEqual(12);
    expect(s.x).toBeLessThan(9.6);
    expect(emissiveCount(g, 0.7)).toBeGreaterThan(
      emissiveCount(buildProp('observatory', 5, 0, 0), 0.7) + 60,
    );
    const hooks = g.userData.hooks as { door: unknown; slit: { normal: number[] } };
    expect(hooks.door).toBeDefined();
    expect(hooks.slit.normal[2]).toBeGreaterThan(0.4);
  });

  it('campusTower v3 keeps the tower envelope and a door hook', () => {
    const g = buildProp('campusTower', 5, 3, 0);
    const s = size(g);
    expect(s.y).toBeGreaterThan(9);
    expect(s.y).toBeLessThan(10.5);
    expect(s.x).toBeLessThan(3);
    expect((g.userData.hooks as { door: { normal: number[] } }).door.normal).toEqual([0, 0, 1]);
  });

  it('the PropDefs and geo defs agree on the new variant counts', () => {
    expect(PROP_DEFS.find((p) => p.id === 'observatory')?.variants).toBe(3);
    expect(PROP_GEO.observatory.variants).toBe(3);
    expect(PROP_DEFS.find((p) => p.id === 'campusTower')?.variants).toBe(4);
    expect(PROP_GEO.campusTower.variants).toBe(4);
    // terrarium: Research's v0-v1 (the mini volcano is its own def) + the QA Bug Zoo v2 (TASK-424),
    // which random rolls never pick
    expect(PROP_DEFS.find((p) => p.id === 'terrarium')?.variants).toBe(3);
    expect(PROP_DEFS.find((p) => p.id === 'terrarium')?.rollVariants).toBe(2);
  });
});
