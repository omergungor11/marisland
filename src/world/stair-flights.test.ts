/**
 * Stair flights (TASK-485). M22 QA saw a bot "on the cliff face" by the Marketing transmitter
 * (seed 2024): not a walk-graph leak off the paths, but a Beacon Rock 'stair' leg climbing an earth
 * wall. Marketing spares its steep faces from the path paint (TASK-453c) and the shader dresses
 * every steep face as a wall, so the stair was invisible. Invariant: on a STAIR_FLIGHT theme no
 * walk-graph edge climbs steeper than `minGrade` without a flight standing on it.
 */
import { describe, expect, it } from 'vitest';
import { STAIR_FLIGHT } from '../content/stairs.ts';
import { generateWorld, heightAt, type WorldData } from './index.ts';

const SEEDS = [2024, 1001, 1, 4004, 7, 42];
const NR = STAIR_FLIGHT.rises.length;

const islandOf = (w: WorldData, x: number, z: number): number => {
  const h = w.height;
  const ix = Math.round((x - h.originX) / h.cellSize);
  const iz = Math.round((z - h.originZ) / h.cellSize);
  return w.islandMap[iz * h.n + ix] - 1;
};

describe('stair flights (TASK-485)', { timeout: 120_000 }, () => {
  it('every steep walk-graph edge on a flight theme carries a flight that meets both ends', () => {
    for (const seed of SEEDS) {
      const w = generateWorld(seed);
      const flights = w.fixtures.filter((f) => f.defId === 'stairFlight');
      const g = w.pathGraph;
      let steep = 0;
      for (let e = 0; e < g.edges.length; e += 2) {
        const [a, b] = [g.edges[e], g.edges[e + 1]];
        const A = { x: g.nodes[a * 2], z: g.nodes[a * 2 + 1] };
        const B = { x: g.nodes[b * 2], z: g.nodes[b * 2 + 1] };
        const id = islandOf(w, A.x, A.z);
        if (id < 0 || STAIR_FLIGHT.byTheme[w.islands[id].theme] === undefined) continue;
        const len = Math.hypot(B.x - A.x, B.z - A.z);
        const ya = heightAt(w.height, A.x, A.z);
        const yb = heightAt(w.height, B.x, B.z);
        const rise = Math.abs(yb - ya);
        if (len < 1e-3 || rise / len <= STAIR_FLIGHT.minGrade) continue;
        steep++;
        const [lo, hi] = ya <= yb ? [A, B] : [B, A];
        const tag = `seed ${seed} edge (${lo.x.toFixed(1)}, ${lo.z.toFixed(1)})`;
        // the flight standing on this edge: foot on the lower node, heading to the upper one (a
        // switchback foot carries two); graph nodes are float32 copies of the path points
        const f = flights.find(
          (q) =>
            Math.hypot(q.x - lo.x, q.z - lo.z) < 0.01 &&
            Math.hypot(
              q.x + Math.cos(q.rotY) * (q.scale ?? 1) * STAIR_FLIGHT.run - hi.x,
              q.z + Math.sin(q.rotY) * (q.scale ?? 1) * STAIR_FLIGHT.run - hi.z,
            ) < 0.01,
        );
        expect(f, tag).toBeDefined();
        const s = f!.scale ?? 1;
        // and its top lands within half a rise step of the upper node
        const top = STAIR_FLIGHT.rises[(f!.variant ?? 0) % NR] * s;
        const last = STAIR_FLIGHT.rises[NR - 1] * s;
        expect(Math.abs(top - rise), tag).toBeLessThanOrEqual(
          Math.max(((STAIR_FLIGHT.rises[1] - STAIR_FLIGHT.rises[0]) / 2) * s + 1e-6, rise - last),
        );
      }
      // Beacon Rock always climbs its shelves by stairs
      expect(steep, `seed ${seed}`).toBeGreaterThan(0);
    }
  });

  it('flights only on flight themes and only on stair paths', () => {
    for (const seed of [2024, 1001]) {
      const w = generateWorld(seed);
      for (const f of w.fixtures.filter((q) => q.defId === 'stairFlight')) {
        expect(STAIR_FLIGHT.byTheme[w.islands[f.islandId].theme]).toBeDefined();
        const onStair = w.paths.some(
          (p) =>
            p.kind === 'stair' && p.points.some((q) => Math.hypot(q.x - f.x, q.z - f.z) < 1e-6),
        );
        expect(onStair).toBe(true);
      }
    }
  });
});
