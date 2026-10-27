import { describe, expect, it } from 'vitest';
import { DOCK } from '../content/settlements.ts';
import { HQ_MARINA, MARINA_PIER_V } from '../content/themes/hq-marina.ts';
import { PROP_DEF_INDEX } from '../content/props.ts';
import { generateWorld, heightAt, sampleGrid, type WorldData, type XZ } from './index.ts';

// TASK-505 (D-085): the HQ yacht marina, the star fort and the ferry-stop channel gates (gen/marina.ts).
const SEEDS = [1001, ...Array.from({ length: 30 }, (_, k) => 1000 + k * 263)];
const cache = new Map<number, WorldData>();
const world = (seed: number): WorldData => {
  let w = cache.get(seed);
  if (!w) cache.set(seed, (w = generateWorld(seed)));
  return w;
};
const dist = (a: XZ, b: XZ): number => Math.hypot(a.x - b.x, a.z - b.z);
const ofDef = (w: WorldData, id: string, variant?: number) =>
  w.marina.filter((f) => f.defId === id && (variant === undefined || f.variant === variant));
const routeDist = (w: WorldData, p: XZ): number =>
  Math.min(...w.boatRoutes.flatMap((r) => r.points.map((q) => dist(p, q))));
const hqDock = (w: WorldData) => {
  const isl = w.islands.find((i) => i.theme === 'hq');
  return w.docks.find((d) => d.islandId === isl?.id);
};

describe('HQ yacht marina (gen/marina.ts)', () => {
  it('the marina defs exist and the boats are variants of the sailboat def', () => {
    for (const id of ['marinaPier', 'starFort']) expect(PROP_DEF_INDEX[id], id).toBeDefined();
    const w = world(1001);
    expect(w.marina.length).toBeGreaterThan(0);
    for (const f of w.marina)
      expect(['marinaPier', 'starFort', 'sailboat', 'buoy']).toContain(f.defId);
  });

  it('seed 1001: 15–20 boats, a comb, the breakwater with its head, the fort, 8 gate buoys', () => {
    const w = world(1001);
    const boats = ofDef(w, 'sailboat');
    expect(boats.length).toBeGreaterThanOrEqual(15);
    expect(boats.length).toBeLessThanOrEqual(HQ_MARINA.berths.max);
    for (const b of boats) expect([0, 1, 6, 7, 8]).toContain(b.variant);
    const fingers =
      ofDef(w, 'marinaPier', MARINA_PIER_V.finger).length +
      ofDef(w, 'marinaPier', MARINA_PIER_V.fingerShort).length;
    expect(fingers).toBeGreaterThanOrEqual(3);
    expect(ofDef(w, 'marinaPier', MARINA_PIER_V.spine).length).toBeGreaterThanOrEqual(6);
    expect(ofDef(w, 'marinaPier', MARINA_PIER_V.mole).length).toBeGreaterThanOrEqual(1);
    expect(ofDef(w, 'marinaPier', MARINA_PIER_V.moleHead)).toHaveLength(1);
    expect(ofDef(w, 'starFort')).toHaveLength(1);
    expect(ofDef(w, 'buoy')).toHaveLength(2 * HQ_MARINA.gates.arcs.length);
  });

  it.each(SEEDS)(
    'seed %i: every piece floats in water, off the routes, the fort faces the pier',
    (seed) => {
      const w = world(seed);
      const dock = hqDock(w);
      expect(dock).toBeDefined();
      const L = (dock?.segments ?? 0) * DOCK.segment;
      const pierEnd = {
        x: (dock?.x ?? 0) + Math.cos(dock?.rotY ?? 0) * L,
        z: (dock?.z ?? 0) + Math.sin(dock?.rotY ?? 0) * L,
      };
      const fort = ofDef(w, 'starFort');
      expect(fort).toHaveLength(1);
      // the landing (local +z) looks at the pier end
      const want = Math.atan2(pierEnd.z - fort[0].z, pierEnd.x - fort[0].x);
      expect(Math.cos(fort[0].rotY - want)).toBeCloseTo(1, 6);
      expect(heightAt(w.height, fort[0].x, fort[0].z)).toBeLessThan(0.5);
      for (const f of w.marina) {
        if (f.defId === 'starFort') {
          expect(routeDist(w, f)).toBeGreaterThanOrEqual(HQ_MARINA.fort.clearRoute - 1e-6);
          continue;
        }
        // piers, boats and buoys stand in the water (the spine hugs the shore 3.2 u out)
        expect(
          sampleGrid(w.height, w.shoreSdf, f.x, f.z, 0),
          `${f.defId} v${f.variant}`,
        ).toBeLessThan(-1);
        expect(heightAt(w.height, f.x, f.z), `${f.defId} depth`).toBeLessThan(0);
        expect(f.islandId).toBe(w.islands.find((i) => i.theme === 'hq')?.id);
        // clear of every boat route (a finger's boats sit 2 u to its side)
        if (f.defId !== 'buoy')
          expect(routeDist(w, f), `${f.defId} v${f.variant}`).toBeGreaterThanOrEqual(2.4);
      }
      // never over the ferry pier itself
      for (const f of w.marina.filter((m) => m.defId === 'sailboat' || m.defId === 'marinaPier')) {
        const p = { x: f.x, z: f.z };
        const vx = pierEnd.x - (dock?.x ?? 0);
        const vz = pierEnd.z - (dock?.z ?? 0);
        const t = Math.min(
          1,
          Math.max(
            0,
            ((p.x - (dock?.x ?? 0)) * vx + (p.z - (dock?.z ?? 0)) * vz) / (vx * vx + vz * vz),
          ),
        );
        const d = Math.hypot(p.x - ((dock?.x ?? 0) + vx * t), p.z - ((dock?.z ?? 0) + vz * t));
        expect(d, `${f.defId} v${f.variant} vs the ferry pier`).toBeGreaterThanOrEqual(2.5);
      }
    },
  );

  it('boat counts: never above the cap, 4+ everywhere, 9+ on most seeds; gates in pairs, port first', () => {
    let rich = 0;
    for (const seed of SEEDS) {
      const w = world(seed);
      const n = ofDef(w, 'sailboat').length;
      expect(n, `seed ${seed}`).toBeLessThanOrEqual(HQ_MARINA.berths.max);
      expect(n, `seed ${seed}`).toBeGreaterThanOrEqual(4);
      if (n >= 9) rich++;
      const gates = ofDef(w, 'buoy');
      for (let i = 0; i < gates.length; i += 2) {
        expect(gates[i].variant).toBe(HQ_MARINA.gates.port);
        expect(gates[i + 1].variant).toBe(HQ_MARINA.gates.starboard);
        expect(dist(gates[i], gates[i + 1])).toBeCloseTo(2 * HQ_MARINA.gates.lateral, 3);
      }
    }
    expect(rich).toBeGreaterThanOrEqual(Math.floor(SEEDS.length * 0.8));
  });

  it('the generic seamarks leave the ferry stop channel to the marina gates', () => {
    for (const seed of [1001, 1263, 4156]) {
      const w = world(seed);
      const dock = hqDock(w);
      const idx = dock ? w.docks.indexOf(dock) : -1;
      const ferry = w.boatRoutes.find((r) => r.kind === 'ferry' && r.stops?.includes(idx));
      expect(ferry).toBeDefined();
      const L = (dock?.segments ?? 0) * DOCK.segment;
      const end = {
        x: (dock?.x ?? 0) + Math.cos(dock?.rotY ?? 0) * L,
        z: (dock?.z ?? 0) + Math.sin(dock?.rotY ?? 0) * L,
      };
      const stop = (ferry?.points ?? []).reduce((a, b) => (dist(b, end) < dist(a, end) ? b : a));
      for (const f of w.seamarks)
        expect(dist(f, stop), `seed ${seed} ${f.defId}`).toBeGreaterThanOrEqual(
          HQ_MARINA.gates.reserve,
        );
    }
  });

  it('no scattered prop stands on the fort', () => {
    const w = world(1001);
    const fort = ofDef(w, 'starFort')[0];
    for (let i = 0; i < w.props.count; i++)
      expect(
        Math.hypot(w.props.x[i] - fort.x, w.props.z[i] - fort.z),
        `prop ${i}`,
      ).toBeGreaterThanOrEqual(HQ_MARINA.fort.keepOut - 1);
  });

  it('the stage hash is part of the world hash and differs per seed', () => {
    expect(world(1001).hashes.marina).toMatch(/^[0-9a-f]{16}$/);
    expect(world(1001).hashes.marina).not.toBe(world(1263).hashes.marina);
  });
});
