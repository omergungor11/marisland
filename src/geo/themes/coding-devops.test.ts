import { describe, expect, it } from 'vitest';
import { PROP_DEFS } from '../../content/props.ts';
import { buildProp } from '../registry.ts';
import { CODING_GEO } from './coding.ts';
import { DEVOPS_GEO } from './devops.ts';

/** LOD0 triangle ceilings (TASK-376: structures <= 3.5k, turbine <= 1.5k). */
const CEIL: Record<string, number> = {
  windTurbine: 1500,
  coolingTower: 3500,
};
const tris = (id: string, v: number, lod: 0 | 1): number =>
  buildProp(id, 7, v, lod).getAttribute('position').count / 3;

const GEO = [...CODING_GEO, ...DEVOPS_GEO];

interface Hooks {
  yaw: { first: number; count: number; pivot: number[] };
  tilt: Array<{ first: number; count: number }>;
  emitter: number[];
  pulse: { segments: number[][] };
}
const hooks = (id: string, v: number, lod: 0 | 1 = 0): Hooks =>
  buildProp(id, 7, v, lod).userData.hooks as Hooks;

describe('coding + devops structures (TASK-376)', () => {
  it('every geo def has a PropDef with the same variant count', () => {
    for (const g of GEO) {
      const d = PROP_DEFS.find((p) => p.id === g.id);
      expect(d, g.id).toBeDefined();
      expect(d!.geo).toBe(g.id);
      expect(d!.variants).toBe(g.variants);
    }
  });
  for (const g of GEO) {
    for (let v = 0; v < g.variants; v++) {
      it(`${g.id} v${v}: LOD1 <= 30 % of LOD0, LOD0 within ceiling`, () => {
        const a = tris(g.id, v, 0);
        const b = tris(g.id, v, 1);
        expect(a).toBeLessThanOrEqual(CEIL[g.id] ?? 3500);
        expect(b).toBeLessThanOrEqual(0.3 * a);
      });
    }
  }
  it('windTurbine: tip-top follows the 24 / 19 / 16 u heights (TASK-393), blades spin, head range is the tail', () => {
    for (const [v, h] of [24, 19, 16].entries()) {
      for (const lod of [0, 1] as const) {
        const g = buildProp('windTurbine', 7, v, lod);
        expect(g.boundingBox!.max.y).toBeGreaterThan(h * 0.8);
        expect(g.boundingBox!.max.y).toBeLessThanOrEqual(h + 0.01);
        const y = hooks('windTurbine', v, lod).yaw;
        const n = g.getAttribute('position').count;
        expect(y.first + y.count).toBe(n);
        expect(y.first).toBeGreaterThan(0);
        const spin = g.getAttribute('aSpin');
        expect(spin.count).toBe(n);
        let spun = 0;
        // TASK-384: the head yaws (w 2), the rotor yaws + spins (w 3), the tower is static
        for (let i = 0; i < n; i++) if (spin.getW(i) === 3) spun++;
        expect(spun).toBeGreaterThan(0);
        for (let i = 0; i < y.first; i++) expect(spin.getW(i)).toBe(0);
        for (let i = y.first; i < n; i++) expect([2, 3]).toContain(spin.getW(i));
      }
    }
  });
  it('solarRow tilt ranges are in bounds and disjoint', () => {
    for (let v = 0; v < 2; v++)
      for (const lod of [0, 1] as const) {
        const n = buildProp('solarRow', 7, v, lod).getAttribute('position').count;
        const t = hooks('solarRow', v, lod).tilt;
        expect(t).toHaveLength(v === 0 ? 3 : 4);
        let end = 0;
        for (const r of t) {
          expect(r.first).toBeGreaterThanOrEqual(end);
          end = r.first + r.count;
          expect(end).toBeLessThanOrEqual(n);
        }
      }
  });
  it('emitter / pulse hooks exist', () => {
    expect(hooks('coolingTower', 0).emitter[1]).toBeGreaterThan(8);
    expect(hooks('steamVent', 0).emitter).toHaveLength(3);
    expect(hooks('pipe', 1).pulse.segments).toHaveLength(2);
  });
});
