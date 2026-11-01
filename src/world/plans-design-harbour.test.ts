import { describe, expect, it } from 'vitest';
import { HARBOURS } from '../content/harbours.ts';
import { WHARF_SITE as W, WHARF_VARIANTS as WV } from '../content/themes/design-harbour.ts';
import { generateWorld, heightAt, type WorldData, type XZ } from './index.ts';
import { anchorPoints } from './gen/plans/research-anchors.ts';

/** Colour Wharf (M31 TASK-537, D-127) over the 30 test seeds + the default. */
const SEEDS = [1001, ...Array.from({ length: 30 }, (_, k) => 1000 + k * 263)];
const P = HARBOURS.design as NonNullable<typeof HARBOURS.design>;
const cache = new Map<number, WorldData>();
const world = (seed: number): WorldData => {
  let w = cache.get(seed);
  if (!w) {
    w = generateWorld(seed);
    cache.set(seed, w);
  }
  return w;
};
const site = (seed: number) => {
  const w = world(seed);
  const isl = w.islands.find((i) => i.theme === 'design');
  if (!isl) throw new Error(`seed ${seed}: no Design island`);
  const fx = w.fixtures.filter((f) => f.islandId === isl.id);
  return { w, isl, A: isl.anchors, fx };
};
const dist = (a: XZ, b: XZ): number => Math.hypot(a.x - b.x, a.z - b.z);

describe('Colour Wharf (TASK-537)', { timeout: 120_000 }, () => {
  it('every seed grows the harbour: pier 12 u, light, pavilion on the pier axis, the ferry stops at the berth', () => {
    for (const seed of SEEDS) {
      const { w, isl, A, fx } = site(seed);
      const m = `seed ${seed}`;
      expect(A.harbourPier1, m).toBeDefined();
      expect(A.ferryBerth, m).toBeDefined();
      expect(
        fx.some((f) => f.defId === 'lighthouse' && f.variant === P.kit.light),
        `${m} light`,
      ).toBe(true);
      const pav = fx.find((f) => f.defId === 'conservatory' && f.variant === WV.pavilion);
      expect(pav, `${m} pavilion`).toBeDefined();
      // on the axis, water all round its deck
      const a = A.harbourPier0;
      const u = { x: Math.cos(a.rotY), z: Math.sin(a.rotY) };
      const dx = pav!.x - a.x;
      const dz = pav!.z - a.z;
      expect(Math.abs(dx * u.z - dz * u.x), `${m} on axis`).toBeLessThan(0.01);
      expect(heightAt(w.height, pav!.x, pav!.z), `${m} over water`).toBeLessThan(0);
      // the dock the ferries call at is the lengthened one
      const dock = w.docks.find((d) => d.islandId === isl.id);
      expect(dock?.segments, m).toBe(P.pier.segments);
    }
  });

  it('pier-root kiosks: at least two of three on every seed, all three on most', () => {
    let full = 0;
    for (const seed of SEEDS) {
      const { A } = site(seed);
      const n = [A.harbourShelter, A.harbourBooth, A.harbourBoard].filter(Boolean).length;
      expect(n, `seed ${seed}`).toBeGreaterThanOrEqual(2);
      if (n === 3) full++;
    }
    expect(full).toBeGreaterThanOrEqual(27);
  });

  it('boathouse row: 3-5 houses on every seed, doors over water, backs on land, at the mouth on most', () => {
    let atMouth = 0;
    for (const seed of SEEDS) {
      const { w, isl, A, fx } = site(seed);
      const row = anchorPoints(isl, 'boathouse');
      const m = `seed ${seed}`;
      expect(row.length, m).toBeGreaterThanOrEqual(W.row.count[0]);
      expect(row.length, m).toBeLessThanOrEqual(W.row.count[1]);
      for (const [k, h] of row.entries()) {
        const n = { x: Math.cos(h.rotY), z: Math.sin(h.rotY) };
        const front = { x: h.x + n.x * W.row.frontWet, z: h.z + n.z * W.row.frontWet };
        expect(heightAt(w.height, front.x, front.z), `${m} house ${k} front`).toBeLessThan(0);
        const f = fx.find((q) => q.defId === 'glasshouse' && dist(q, h) < 0.01);
        expect(f?.variant, `${m} house ${k}`).toBeGreaterThanOrEqual(WV.boathouse);
        if (k > 0)
          expect(dist(h, row[k - 1]), `${m} spacing`).toBeGreaterThanOrEqual(W.row.minPitch - 1e-3);
      }
      expect(A.boathouseFit, m).toBeDefined();
      if (A.boathouseFit.x === 1) {
        atMouth++;
        expect(A.boathouseFit.z, m).toBeLessThanOrEqual(W.row.mouthReach);
      }
    }
    // the honest fit (D-127): the rest take the fallback along the coast by the pier root
    expect(atMouth).toBeGreaterThanOrEqual(20);
  });

  it('paint pots float in the lagoon, in order from the arm tip', () => {
    for (const seed of SEEDS) {
      const { w, isl, fx } = site(seed);
      const pots = anchorPoints(isl, 'paintBuoy');
      const m = `seed ${seed}`;
      expect(pots.length, m).toBeGreaterThanOrEqual(W.buoys.count[0]);
      for (const p of pots) {
        expect(heightAt(w.height, p.x, p.z), m).toBeLessThan(-W.buoys.minDepth + 1e-3);
        const f = fx.find((q) => q.defId === 'buoy' && dist(q, p) < 0.01);
        expect(f?.variant, m).toBeGreaterThanOrEqual(WV.paintPot);
      }
      // (the ritual's order)
      const tip = isl.anchors.harbourArm0;
      expect(dist(pots[0], tip), m).toBeLessThan(dist(pots[pots.length - 1], tip));
    }
  });

  it('the lantern boat has a mooring in the basin and clear lanes out past the tip', () => {
    for (const seed of SEEDS) {
      const { w, isl, A } = site(seed);
      const m = `seed ${seed}`;
      expect(A.lanternMoor, m).toBeDefined();
      const lanes = anchorPoints(isl, 'lanternLane');
      expect(lanes.length, m).toBeGreaterThan(8);
      expect(
        lanes.some((p) => dist(p, A.lanternMoor) < 0.01),
        `${m} joins`,
      ).toBe(true);
      for (const p of lanes)
        expect(heightAt(w.height, p.x, p.z), m).toBeLessThanOrEqual(-W.lantern.minDepth + 1e-3);
    }
  });

  it('no boat route runs through the paint pots', () => {
    for (const seed of SEEDS) {
      const { w, isl } = site(seed);
      const pots = anchorPoints(isl, 'paintBuoy');
      for (const r of w.boatRoutes)
        for (const q of r.points)
          for (const p of pots) expect(dist(q, p), `seed ${seed}`).toBeGreaterThan(1);
    }
  });
});
