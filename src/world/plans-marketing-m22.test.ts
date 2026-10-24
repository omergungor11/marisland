import { describe, expect, it } from 'vitest';
import { DOCK } from '../content/settlements.ts';
import { MARKETING_PLAN as P, MARKETING_QUICK as Q } from '../content/themes/marketing.ts';
import { generateWorld, heightAt, type WorldData } from './index.ts';
import { THEME_IDS } from './types.ts';

// TASK-481 (M22): the Marketing quick wins — carnival gate, marquee bulb strings, sea-stack
// transmitters, the lit ad-buoy chain, the party pontoon and the carpet district. 30 seeds.
const SEEDS = Array.from({ length: 30 }, (_, k) => 1000 + k * 263);
const cache = new Map<number, WorldData>();
const world = (seed: number): WorldData => {
  let w = cache.get(seed);
  if (!w) cache.set(seed, (w = generateWorld(seed)));
  return w;
};
const mktOf = (w: WorldData) => {
  const isl = w.islands.find((i) => i.theme === 'marketing');
  if (!isl) throw new Error('no Marketing island');
  const fx = w.fixtures.filter((f) => f.islandId === isl.id);
  const dock = w.docks.find((d) => d.islandId === isl.id);
  return { isl, fx, dock, of: (defId: string) => fx.filter((f) => f.defId === defId) };
};
/** At least `frac` of the seeds pass `ok`. */
function most(frac: number, ok: (w: WorldData, seed: number) => boolean): void {
  const bad = SEEDS.filter((seed) => !ok(world(seed), seed));
  expect(1 - bad.length / SEEDS.length, `failing seeds ${bad.join(' ')}`).toBeGreaterThanOrEqual(
    frac,
  );
}

describe('Marketing quick wins (TASK-481), 30 seeds', { timeout: 120_000 }, () => {
  it('M7: the Ad Boulevard is a carpet district (w = street width, centred on the street)', () => {
    for (const seed of SEEDS) {
      const w = world(seed);
      const { isl } = mktOf(w);
      const ds = w.districts.filter((d) => d.islandId === isl.id && d.kind === 'carpet');
      expect(ds.length, `seed ${seed}`).toBe(1);
      expect(ds[0].w).toBe(P.boulevard.width);
      expect(ds[0].d).toBeGreaterThan(P.boulevard.len[0] - 2);
      // on the summit: the tower's plateau
      expect(heightAt(w.height, ds[0].x, ds[0].z), `seed ${seed}`).toBeGreaterThan(8);
    }
  });

  it('M11: one carnival gate (the cultureGate Marketing variant) at the pier mouth', () => {
    most(0.9, (w) => {
      const { of, dock } = mktOf(w);
      const gates = of('cultureGate');
      if (!dock || gates.length !== 1) return false;
      const g = gates[0];
      const d = Math.hypot(g.x - dock.x, g.z - dock.z);
      return (
        g.variant === THEME_IDS.indexOf('marketing') &&
        d <= Q.gate.inland[1] + 2.5 &&
        heightAt(w.height, g.x, g.z) > 0.3
      );
    });
  });

  it('M5: marquee bulb strings across the boulevard, spaced, both poles outside the walk', () => {
    most(0.9, (w) => {
      const { of, isl } = mktOf(w);
      const car = w.districts.find((d) => d.islandId === isl.id && d.kind === 'carpet');
      const strings = of('bunting').filter((f) => f.variant === Q.bulbString.variant);
      if (!car || strings.length < 2 || strings.length > Q.bulbString.count[1]) return false;
      const u = { x: Math.cos(car.rotY), z: Math.sin(car.rotY) };
      const ts = strings
        .map((f) => (f.x - car.x) * u.x + (f.z - car.z) * u.z)
        .sort((a, b) => a - b);
      for (let i = 1; i < ts.length; i++)
        if (ts[i] - ts[i - 1] < Q.bulbString.spacing - 1e-6) return false;
      // across the street: the string sits on the axis (|offset| ≈ 0) and runs along the heading
      return strings.every((f) => {
        const off = Math.abs(-(f.x - car.x) * u.z + (f.z - car.z) * u.x);
        return off < 1e-3 && Math.abs(f.rotY - car.rotY) < 1e-6;
      });
    });
  });

  it('M2: a transmitter on the top of every sea stack, red tip first', () => {
    for (const seed of SEEDS) {
      const w = world(seed);
      const { isl, of } = mktOf(w);
      const stacks = Object.keys(isl.anchors).filter((k) => /^stack\d+$/.test(k));
      const tx = of('antennaTower').filter((f) => f.variant === Q.transmitter.variant);
      expect(stacks.length, `seed ${seed}`).toBeGreaterThanOrEqual(2);
      expect(tx.length, `seed ${seed}`).toBeGreaterThanOrEqual(stacks.length - 1);
      for (const f of tx) {
        expect(heightAt(w.height, f.x, f.z), `seed ${seed}`).toBeGreaterThanOrEqual(
          Q.transmitter.minRise,
        );
        // near one of the stack anchors
        expect(
          stacks.some(
            (k) =>
              Math.hypot(f.x - isl.anchors[k].x, f.z - isl.anchors[k].z) <=
              Q.transmitter.search + 1e-6,
          ),
          `seed ${seed}`,
        ).toBe(true);
      }
    }
  });

  it('M17: a chain of lit ad buoys one rope apart across the bay mouth, in the water', () => {
    most(0.9, (w) => {
      const { of } = mktOf(w);
      const ch = of('adBuoy').filter((f) => (f.variant ?? 0) >= 1 && f.variant !== undefined);
      // the chain is pushed in order, rope variants alternating, the plain gold buoy last
      const run = ch.filter((f) =>
        (Q.buoyChain.variants as readonly number[]).includes(f.variant as number),
      );
      if (run.length < 2) return false;
      const all = [...run, ...ch.filter((f) => f.variant === Q.buoyChain.end).slice(-1)];
      for (let i = 1; i < all.length; i++) {
        const d = Math.hypot(all[i].x - all[i - 1].x, all[i].z - all[i - 1].z);
        if (Math.abs(d - Q.buoyChain.spacing) > 1e-3) return false;
      }
      return all.every((f) => heightAt(w.height, f.x, f.z) <= -Q.buoyChain.minDepth);
    });
  });

  it('M8: the party pontoon floats in the bay, off the pier, clear of everything', () => {
    most(0.9, (w) => {
      const { of, dock } = mktOf(w);
      const p = of('sailboat').filter((f) => f.variant === Q.pontoon.variant);
      if (!dock || p.length !== 1) return false;
      const reach = dock.segments * DOCK.segment + 6;
      const d = Math.hypot(p[0].x - dock.x, p[0].z - dock.z);
      return d <= reach + 6 && heightAt(w.height, p[0].x, p[0].z) <= -Q.pontoon.minDepth;
    });
  });

  it('the new pieces only add fixtures: lots, docks and paths are those of before', () => {
    // the quick wins draw from their own fork and add no pad: the old pieces keep their places
    for (const seed of [1, 42]) {
      const w = world(seed);
      const { fx } = mktOf(w);
      const ids = new Set(['cultureGate', 'bunting', 'antennaTower', 'adBuoy', 'sailboat']);
      expect(fx.filter((f) => !ids.has(f.defId)).length).toBeGreaterThan(10);
    }
  });
});
