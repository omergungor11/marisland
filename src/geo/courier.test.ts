import { describe, expect, it } from 'vitest';
import { COURIER_SHIPS } from '../content/fleet-ships.ts';
import { THEME_IDS } from '../world/types.ts';
import { buildProp } from './registry.ts';

const tris = (id: string, v: number, lod: 0 | 1, seed = 5): number =>
  buildProp(id, seed, v, lod).getAttribute('position').count / 3;

describe('courier ships (TASK-620)', () => {
  it('tri budgets per ship and LOD', () => {
    for (let v = 0; v < 7; v++) {
      expect(tris('courierShip', v, 0), `v${v} lod0`).toBeLessThanOrEqual(900);
      expect(tris('courierShip', v, 1), `v${v} lod1`).toBeLessThanOrEqual(250);
      expect(tris('courierCrate', v, 0)).toBeLessThanOrEqual(60);
    }
    for (let v = 0; v < 2; v++) expect(tris('reportScroll', v, 0)).toBeLessThanOrEqual(40);
  });

  it('same seed, same vertex buffer', () => {
    const defs = [
      ['courierShip', 7],
      ['courierCrate', 7],
      ['reportScroll', 2],
    ] as const;
    for (const [id, n] of defs)
      for (let v = 0; v < n; v++) {
        const a = buildProp(id, 9, v, 0).getAttribute('position').array;
        const b = buildProp(id, 9, v, 0).getAttribute('position').array;
        expect(Array.from(a)).toEqual(Array.from(b));
      }
  });

  it('7 variants have 7 distinct silhouettes', () => {
    const sig = new Set<string>();
    for (let v = 0; v < 7; v++) {
      const bb = buildProp('courierShip', 5, v, 0).boundingBox!;
      sig.add(
        [bb.max.x - bb.min.x, bb.max.y - bb.min.y, bb.max.z - bb.min.z, tris('courierShip', v, 0)]
          .map((n) => n.toFixed(1))
          .join('/'),
      );
    }
    expect(sig.size).toBe(7);
    const heights = THEME_IDS.map((t) => COURIER_SHIPS[t].mastH);
    expect(new Set(heights).size).toBeGreaterThanOrEqual(5);
  });

  it('ships keep the sailboat contract: keel at 0, 4.5-7.5 u long, a glowing lantern', () => {
    for (let v = 0; v < 7; v++) {
      const g = buildProp('courierShip', 5, v, 0);
      const bb = g.boundingBox!;
      expect(bb.min.y).toBeGreaterThanOrEqual(-0.05);
      expect(bb.max.z - bb.min.z).toBeGreaterThan(4.5);
      expect(bb.max.z - bb.min.z).toBeLessThan(7.5);
      const em = g.getAttribute('emissive').array as Float32Array;
      expect(Array.from(em).some((x) => x === 1)).toBe(true);
      expect(g.userData.hooks.lantern.pivot).toHaveLength(3);
    }
  });
});
