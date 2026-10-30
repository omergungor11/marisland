/** TASK-533: shared harbour kit (lighthouse 3-4, marketStall 3-4, dock 2-3, pierSignpost 3-4, barrel 2-3). */
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { PROP_DEFS, PROP_DEF_INDEX } from '../../content/props.ts';
import { HARBOUR_VARIANTS as HV } from '../../content/themes/harbours.ts';
import { STRUCTURE_MIN_SIZE, isLargeStructure } from '../../render/props/batcher.ts';
import { PROP_GEO, buildProp } from '../registry.ts';

const tris = (g: THREE.BufferGeometry): number => g.getAttribute('position').count / 3;
const box = (g: THREE.BufferGeometry): THREE.Box3 => {
  g.computeBoundingBox();
  return g.boundingBox as THREE.Box3;
};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const hooks = (g: THREE.BufferGeometry): Record<string, any> => g.userData.hooks ?? {};
const arr = (g: THREE.BufferGeometry, n: string): ArrayLike<number> => g.getAttribute(n).array;

/** Old variant counts (before M31) and LOD0 triangle budgets of the added variants. */
const OLD: Record<string, number> = {
  lighthouse: 3,
  marketStall: 3,
  dock: 2,
  pierSignpost: 3,
  barrel: 2,
};
const BUDGET: Record<string, number> = {
  lighthouse: 700,
  marketStall: 560,
  dock: 380,
  pierSignpost: 520,
  barrel: 160,
};
/** LOD1 may never show for tier-2 defs (D-049), so only tier 0-1 defs are held to a far proxy ratio. */
const FAR_RATIO: Record<string, number> = { lighthouse: 0.36, dock: 0.36 };

describe('TASK-533 harbour kit defs', () => {
  for (const [id, first] of Object.entries(HV)) {
    it(`${id}: +2 variants, geo and PropDef agree, random rolls keep the old variants`, () => {
      const d = PROP_DEFS[PROP_DEF_INDEX[id]];
      expect(first).toBe(OLD[id]);
      expect(PROP_GEO[id].variants).toBe(first + 2);
      expect(PROP_GEO[id].heights).toHaveLength(first + 2);
      expect(d.variants).toBe(first + 2);
      expect(d.rollVariants).toBe(
        id === 'lighthouse' || id === 'marketStall' || id === 'pierSignpost' ? 3 : 2,
      );
      expect(d.rollVariants).toBeLessThanOrEqual(first);
    });
  }

  it('tier hazard (D-096): no added variant promotes a tier 1-2 def to T0 by size', () => {
    for (const id of ['marketStall', 'dock', 'pierSignpost', 'barrel']) {
      const d = PROP_DEFS[PROP_DEF_INDEX[id]];
      for (let v = 0; v < d.variants; v++) {
        const size = box(buildProp(id, 3, v, 0)).getSize(new THREE.Vector3());
        // v0 may be large for some defs; only the added ones are pinned here
        if (v < HV[id as keyof typeof HV]) continue;
        expect(size.y, `${id} v${v} height`).toBeLessThan(STRUCTURE_MIN_SIZE - 0.05);
        expect(isLargeStructure(d, size), `${id} v${v}`).toBe(false);
      }
    }
  });

  it('older variants are unchanged: no harbour hooks on them', () => {
    expect(hooks(buildProp('lighthouse', 5, 0, 0)).beam).toBeUndefined();
    expect(hooks(buildProp('marketStall', 5, 0, 0)).bench).toBeUndefined();
    expect(hooks(buildProp('dock', 5, 1, 0)).window).toBeUndefined();
    expect(hooks(buildProp('pierSignpost', 5, 2, 0)).board).toBeUndefined();
  });
});

describe('TASK-533 harbour kit: budgets, bounds, determinism', () => {
  for (const [id, first] of Object.entries(HV))
    for (const v of [first, first + 1]) {
      it(`${id} v${v}: triangles, ground pivot, nominal height, finite, non-degenerate, deterministic`, () => {
        const g0 = buildProp(id, 7, v, 0);
        const g1 = buildProp(id, 7, v, 1);
        expect(tris(g0)).toBeLessThanOrEqual(BUDGET[id]);
        if (FAR_RATIO[id]) expect(tris(g1)).toBeLessThanOrEqual(FAR_RATIO[id] * tris(g0));
        expect(tris(g1)).toBeLessThan(tris(g0));
        const b = box(g0);
        expect(b.min.y).toBeGreaterThanOrEqual(-0.05);
        expect(b.min.y).toBeLessThanOrEqual(0.05);
        const h = PROP_GEO[id].heights?.[v] ?? PROP_GEO[id].height;
        expect(b.max.y).toBeGreaterThanOrEqual(h * 0.95);
        expect(b.max.y).toBeLessThanOrEqual(h * 1.05);
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
      });
    }

  it('the neutral and the Research livery differ in colour, not in shape', () => {
    for (const [id, first] of Object.entries(HV)) {
      const n = buildProp(id, 2, first, 0);
      const r = buildProp(id, 2, first + 1, 0);
      expect(tris(n)).toBe(tris(r));
      expect(Array.from(arr(n, 'color'))).not.toEqual(Array.from(arr(r, 'color')));
    }
  });
});

describe('TASK-533 harbour frames and hooks', () => {
  it('harbour light: lamp slot (emissive 1), beam hook, top', () => {
    for (const v of [3, 4]) {
      const g = buildProp('lighthouse', 5, v, 0);
      const h = hooks(g);
      expect(h.lamp.at[1]).toBeGreaterThan(4);
      expect(h.beam.dir).toEqual([0, 0, 1]);
      expect(h.beam.secondsPerRev).toBeGreaterThan(0);
      expect(h.top.y).toBeGreaterThan(h.lamp.at[1]);
      const em = arr(g, 'emissive');
      expect(Array.from(em).some((x) => x === 1)).toBe(true);
      // the lamp slot sits at the lamp hook height
      const pos = arr(g, 'position');
      let found = false;
      for (let i = 0; i < em.length; i++)
        if (em[i] === 1 && Math.abs(pos[i * 3 + 1] - h.lamp.at[1]) < 0.4) found = true;
      expect(found).toBe(true);
    }
  });

  it('shelter / booth / board / bollard hooks sit inside their bounds', () => {
    const s = buildProp('marketStall', 5, 3, 0);
    const sb = box(s);
    expect(hooks(s).bench.at[1]).toBeGreaterThan(0.3);
    expect(hooks(s).bench.at[2]).toBeLessThan(0);
    expect(hooks(s).roof.y).toBeLessThan(sb.max.y);
    const k = buildProp('dock', 5, 2, 0);
    expect(hooks(k).window.dir).toEqual([0, 0, 1]);
    expect(hooks(k).door.dir).toEqual([1, 0, 0]);
    expect(hooks(k).window.at[2]).toBeGreaterThan(0.5);
    const b = buildProp('pierSignpost', 5, 3, 0);
    expect(hooks(b).board.rows).toHaveLength(4);
    expect(hooks(buildProp('barrel', 5, 2, 0)).top.y).toBeCloseTo(0.5);
  });
});
