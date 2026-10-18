import { describe, expect, it } from 'vitest';
import { DOCK, SEAMARKS } from '../content/settlements.ts';
import { CULTURE_BOATS } from '../content/life.ts';
import { generateWorld, heightAt, sampleGrid, type WorldData, type XZ } from './index.ts';

// TASK-474: channel buoys along the ferry routes (W:D8) and sea-stack fields + arch (W:D3).
const SEEDS = [1001, 3003, 42, 1, 1337, 7];
const cache = new Map<number, WorldData>();
const world = (seed: number): WorldData => {
  let w = cache.get(seed);
  if (!w) cache.set(seed, (w = generateWorld(seed)));
  return w;
};
const dist = (a: XZ, b: XZ): number => Math.hypot(a.x - b.x, a.z - b.z);
const pierEnds = (w: WorldData): XZ[] =>
  w.docks.map((d) => {
    const L = d.segments * DOCK.segment;
    return { x: d.x + Math.cos(d.rotY) * L, z: d.z + Math.sin(d.rotY) * L };
  });
const buoysOf = (w: WorldData) =>
  w.seamarks.filter((f) => f.defId === 'buoy' && (f.variant === 1 || f.variant === 2));
const stacksOf = (w: WorldData) => w.seamarks.filter((f) => f.defId === 'seaStack');
/** Nearest route sample (any route) and, for a ferry route, the arc of the nearest sample. */
const nearestOnRoutes = (w: WorldData, p: XZ): number =>
  Math.min(...w.boatRoutes.flatMap((r) => r.points.map((q) => dist(p, q))));

describe('seamarks: channel buoys (W:D8)', () => {
  const B = SEAMARKS.buoys;
  it.each(SEEDS)('seed %i: red / green pairs every ~spacing along every ferry route', (seed) => {
    const w = world(seed);
    const buoys = buoysOf(w);
    expect(buoys.length).toBeGreaterThanOrEqual(60);
    expect(buoys.length).toBeLessThanOrEqual(B.max);
    expect(buoys.length % 2).toBe(0);
    const ferries = w.boatRoutes.filter((r) => r.kind === 'ferry');
    expect(ferries.length).toBeGreaterThan(0);
    // pairs: port (variant 1) then starboard (variant 2), 2 × lateral apart, centred on a route
    for (let i = 0; i < buoys.length; i += 2) {
      const a = buoys[i];
      const b = buoys[i + 1];
      expect(a.variant).toBe(B.port);
      expect(b.variant).toBe(B.starboard);
      expect(dist(a, b)).toBeCloseTo(2 * B.lateral, 3);
      const mid = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
      const onFerry = Math.min(...ferries.flatMap((r) => r.points.map((q) => dist(mid, q))));
      expect(onFerry).toBeLessThan(1.1);
    }
    // spacing: along each ferry route the consecutive pair arcs differ by a multiple of spacing
    for (const r of ferries) {
      const arcs: number[] = [];
      let acc = 0;
      const cum = r.points.map((p, i) => {
        const v = acc;
        acc += dist(p, r.points[(i + 1) % r.points.length]);
        return v;
      });
      for (let i = 0; i < buoys.length; i += 2) {
        const mid = { x: (buoys[i].x + buoys[i + 1].x) / 2, z: (buoys[i].z + buoys[i + 1].z) / 2 };
        let best = Infinity;
        let bi = -1;
        r.points.forEach((q, k) => {
          const d = dist(mid, q);
          if (d < best) {
            best = d;
            bi = k;
          }
        });
        if (best < 1.1) arcs.push(cum[bi]);
      }
      expect(arcs.length).toBeGreaterThanOrEqual(3);
      arcs.sort((p, q) => p - q);
      for (let k = 1; k < arcs.length; k++) {
        const gap = arcs[k] - arcs[k - 1];
        expect(Math.abs(gap / B.spacing - Math.round(gap / B.spacing))).toBeLessThan(0.12);
      }
    }
  });

  it.each(SEEDS)('seed %i: in water, clear of pier approaches, islets and other routes', (seed) => {
    const w = world(seed);
    const ends = pierEnds(w);
    for (const b of buoysOf(w)) {
      expect(heightAt(w.height, b.x, b.z)).toBeLessThanOrEqual(-B.minDepth);
      expect(sampleGrid(w.height, w.shoreSdf, b.x, b.z, 0)).toBeLessThanOrEqual(-B.minShore);
      for (const e of ends) expect(dist(b, e)).toBeGreaterThanOrEqual(B.dockClear);
      for (const it of w.islets)
        expect(dist(b, { x: it.cx, z: it.cz })).toBeGreaterThanOrEqual(it.reach + B.isletClear);
    }
  });
});

describe('seamarks: sea-stack fields + arch (W:D3)', () => {
  const S = SEAMARKS.stacks;
  /** Clusters = stacks of one island (one cluster per island by construction). */
  const clusters = (w: WorldData): Map<number, typeof w.seamarks> => {
    const m = new Map<number, typeof w.seamarks>();
    for (const f of stacksOf(w)) m.set(f.islandId, [...(m.get(f.islandId) ?? []), f]);
    return m;
  };

  it.each(SEEDS)('seed %i: 2–4 clusters of 2–4 stacks, exactly one arch', (seed) => {
    const w = world(seed);
    const cl = clusters(w);
    expect(cl.size).toBeGreaterThanOrEqual(S.clusters[0]);
    expect(cl.size).toBeLessThanOrEqual(S.clusters[1]);
    for (const [id, st] of cl) {
      expect(st.length).toBeGreaterThanOrEqual(S.perCluster[0]);
      expect(st.length).toBeLessThanOrEqual(S.perCluster[1]);
      expect(S.skipArchetypes).not.toContain(w.islands[id].archetype);
      // a cluster is compact
      for (const f of st) expect(dist(f, st[0])).toBeLessThanOrEqual(S.archSpread[1] + 0.01);
    }
    const arches = stacksOf(w).filter((f) => f.variant === S.arch);
    expect(arches).toHaveLength(1);
    // the arch's lintel (local y 6.2+) clears the water
    expect(heightAt(w.height, arches[0].x, arches[0].z)).toBeGreaterThanOrEqual(-S.archMaxDepth);
  });

  it.each(SEEDS)(
    'seed %i: stacks show above water, off the routes, piers, islets and rings',
    (seed) => {
      const w = world(seed);
      const ends = pierEnds(w);
      const buoys = buoysOf(w);
      for (const f of stacksOf(w)) {
        const depth = -heightAt(w.height, f.x, f.z);
        expect(depth).toBeGreaterThanOrEqual(S.depth[0]);
        expect(depth).toBeLessThanOrEqual(S.depth[1]);
        if (f.variant !== S.arch)
          expect(S.heights[f.variant as number] - depth).toBeGreaterThanOrEqual(S.minVisible);
        expect(nearestOnRoutes(w, f)).toBeGreaterThanOrEqual(S.routeClear);
        for (const e of ends) expect(dist(f, e)).toBeGreaterThanOrEqual(S.dockClear);
        for (const it of w.islets)
          expect(dist(f, { x: it.cx, z: it.cz })).toBeGreaterThanOrEqual(it.reach + S.isletClear);
        for (const b of buoys) expect(dist(f, b)).toBeGreaterThanOrEqual(S.buoyClear);
        for (const ring of [CULTURE_BOATS.patrol, CULTURE_BOATS.lantern]) {
          const isl = w.islands.find((i) => i.theme === ring.theme);
          if (!isl) continue;
          const r = isl.radius + ring.margin;
          expect(Math.abs(dist(f, { x: isl.cx, z: isl.cz }) - r)).toBeGreaterThanOrEqual(
            S.ringClear,
          );
        }
      }
    },
  );
});
