/**
 * Coding M33 sites (TASK-544, D-121): Foundry line, Drone Port, test track, Data Lake, over 30 seeds.
 * A site without room publishes nothing: the fit rates are pinned, every published site is checked.
 */
import { describe, expect, it } from 'vitest';
import { CODING_FOUNDRY as S } from '../content/themes/coding-foundry.ts';
import { droneRoutes } from '../render/drones.ts';
import {
  dataLakeOf,
  generateWorld,
  heightAt,
  lakeEdge,
  lakePoint,
  Zone,
  type IslandData,
  type WorldData,
} from './index.ts';
import { rectShape, shapeDist, type Shape } from './gen/sites.ts';

const SEEDS = Array.from({ length: 30 }, (_, i) => 1 + i * 37);
const worlds = new Map<number, WorldData>();
const world = (seed: number): WorldData => {
  let w = worlds.get(seed);
  if (!w) {
    w = generateWorld(seed);
    worlds.set(seed, w);
  }
  return w;
};
const codingOf = (w: WorldData): IslandData => {
  const isl = w.islands.find((i) => i.theme === 'coding');
  if (!isl) throw new Error(`seed ${w.seed}: no coding island`);
  return isl;
};
const yards = [
  ['foundryYard', 'foundryLineSize', 'foundryGate'],
  ['dronePortYard', 'dronePortSize', 'dronePortGate'],
  ['botTrackYard', 'botTrackSize', 'botTrackGate'],
  ['dataLakeYard', 'dataLakeYardSize', 'lakeGate'],
] as const;
const yardOf = (isl: IslandData, yard: string, size: string): Shape | null => {
  const c = isl.anchors[yard];
  const sz = isl.anchors[size];
  return c && sz ? rectShape(c.x, c.z, c.rotY, sz.x, sz.z) : null;
};
const chain = (
  isl: IslandData,
  name: string,
): { x: number; z: number; rotY: number; y?: number }[] => {
  const out = [];
  for (let k = 0; isl.anchors[`${name}${k}`]; k++) out.push(isl.anchors[`${name}${k}`]);
  return out;
};
/** Graph nodes reachable from the settlement hub. */
function reached(w: WorldData, islandId: number): { x: number; z: number }[] {
  const st = w.settlements.find((s) => s.islandId === islandId);
  if (!st || st.hub.node < 0) return [];
  const g = w.pathGraph;
  const n = g.nodes.length / 2;
  const adj: number[][] = Array.from({ length: n }, () => []);
  for (let e = 0; e < g.edges.length; e += 2) {
    adj[g.edges[e]].push(g.edges[e + 1]);
    adj[g.edges[e + 1]].push(g.edges[e]);
  }
  const seen = new Uint8Array(n);
  const stack = [st.hub.node];
  seen[st.hub.node] = 1;
  const out: { x: number; z: number }[] = [];
  while (stack.length) {
    const a = stack.pop() as number;
    out.push({ x: g.nodes[a * 2], z: g.nodes[a * 2 + 1] });
    for (const b of adj[a])
      if (!seen[b]) {
        seen[b] = 1;
        stack.push(b);
      }
  }
  return out;
}

describe('Coding M33 sites (TASK-544), 30 seeds', { timeout: 180_000 }, () => {
  it('fit rates: pinned floors, the shot seed has all four', () => {
    let lake = 0;
    let line = 0;
    let port = 0;
    let track = 0;
    for (const seed of SEEDS) {
      const A = codingOf(world(seed)).anchors;
      if (A.dataLake) lake++;
      if (A.foundryYard) line++;
      if (A.dronePort) port++;
      if (A.botTrackYard) track++;
    }
    // D-121: the plateau is full on small islands (r < 46 u): measured 2026-11-01
    expect(lake).toBeGreaterThanOrEqual(14);
    expect(line).toBeGreaterThanOrEqual(14);
    expect(port).toBeGreaterThanOrEqual(18);
    expect(track).toBeGreaterThanOrEqual(26);
    const A = codingOf(world(1001)).anchors;
    for (const k of ['dataLake', 'foundryYard', 'dronePort', 'botTrackYard'])
      expect(A[k], k).toBeDefined();
  });

  it('every footprint stands on flat ground, on land, clear of lots and landmarks', () => {
    for (const seed of SEEDS) {
      const w = world(seed);
      const isl = codingOf(w);
      for (const [yard, size] of yards) {
        const sh = yardOf(isl, yard, size);
        if (!sh) continue;
        const at = `seed ${seed} ${yard}`;
        const isLake = yard === 'dataLakeYard';
        const lake = isLake ? dataLakeOf(isl) : null;
        let lo = Infinity;
        let hi = -Infinity;
        for (let u = -0.9; u <= 0.91; u += 0.3)
          for (let v = -0.9; v <= 0.91; v += 0.3) {
            const x = sh.x + sh.c * u * sh.hd - sh.s * v * sh.hw;
            const z = sh.z + sh.s * u * sh.hd + sh.c * v * sh.hw;
            // (the lake's dish and bank are its own: checked below)
            if (lake && lakeEdge(lake, x, z) < S.lake.bank + 2) continue;
            const y = heightAt(w.height, x, z);
            expect(y, `${at} above the sea`).toBeGreaterThan(0);
            lo = Math.min(lo, y);
            hi = Math.max(hi, y);
          }
        // (a later bed's pad core may touch the edge: each prop stands on its own ground height)
        if (hi >= lo) expect(hi - lo, `${at} relief`).toBeLessThan(0.7);
        for (const l of w.lots.filter((q) => q.islandId === isl.id))
          expect(shapeDist(sh, l.x, l.z), `${at} lot ${l.defId}`).toBeGreaterThan(0);
        for (const m of w.landmarks.filter((q) => q.islandId === isl.id))
          expect(shapeDist(sh, m.x, m.z), `${at} ${m.kind}`).toBeGreaterThan(0);
        for (const pl of w.paths.filter((q) => q.islandId === isl.id))
          for (const p of pl.points)
            expect(shapeDist(sh, p.x, p.z), `${at} path`).toBeGreaterThan(-0.3);
        for (const f of w.fixtures.filter((q) => q.islandId === isl.id))
          expect(shapeDist(sh, f.x, f.z), `${at} fixture ${f.defId}`).toBeGreaterThan(0);
      }
    }
  });

  it('the sites do not overlap each other', () => {
    for (const seed of SEEDS) {
      const isl = codingOf(world(seed));
      const shapes = yards.flatMap(([y, s]) => yardOf(isl, y, s) ?? []);
      for (let a = 0; a < shapes.length; a++)
        for (let b = a + 1; b < shapes.length; b++) {
          const p = shapes[a];
          const q = shapes[b];
          for (const [su, sv] of [
            [0, 0],
            [1, 1],
            [1, -1],
            [-1, 1],
            [-1, -1],
          ]) {
            const x = p.x + p.c * su * p.hd - p.s * sv * p.hw;
            const z = p.z + p.s * su * p.hd + p.c * sv * p.hw;
            expect(shapeDist(q, x, z), `seed ${seed}`).toBeGreaterThan(0);
          }
        }
    }
  });

  it('the lake holds water: flat at its level, a closed rim, zoned on the final ground', () => {
    for (const seed of SEEDS) {
      const w = world(seed);
      const isl = codingOf(w);
      const lake = dataLakeOf(isl);
      if (!lake) continue;
      const at = `seed ${seed}`;
      const h = w.height;
      const R = lake.a * (1 + lake.wobble) + 8;
      const x0 = Math.round((lake.x - R - h.originX) / h.cellSize);
      const x1 = Math.round((lake.x + R - h.originX) / h.cellSize);
      const z0 = Math.round((lake.z - R - h.originZ) / h.cellSize);
      const z1 = Math.round((lake.z + R - h.originZ) / h.cellSize);
      let water = 0;
      for (let iz = z0; iz <= z1; iz++)
        for (let ix = x0; ix <= x1; ix++) {
          const i = iz * h.n + ix;
          const x = h.originX + ix * h.cellSize;
          const z = h.originZ + iz * h.cellSize;
          const d = lakeEdge(lake, x, z);
          if (d <= 0) {
            water++;
            expect(h.data[i], `${at} level`).toBeCloseTo(lake.level, 4);
            expect(w.zone[i], `${at} zone`).toBe(Zone.crater);
            expect(w.shoreSdf[i], `${at} on land`).toBeGreaterThan(0);
          } else if (d > 0.5 && d < S.lake.quay + 1) {
            // the rim: above the level all the way round
            expect(h.data[i], `${at} rim`).toBeGreaterThan(lake.level);
          }
          // no pool zone outside it (the zones were painted on the final ground)
          if (d > 1.5 && w.zone[i] === Zone.crater) {
            // only the Tech Park pools carry it
            expect(Math.hypot(x - lake.x, z - lake.z), `${at} crater leak`).toBeGreaterThan(R - 8);
          }
        }
      expect(water, `${at} water cells`).toBeGreaterThan(9);
      // flood from the centre over cells at the level: it stays inside the outline
      const n = h.n;
      const c =
        Math.round((lake.z - h.originZ) / h.cellSize) * n +
        Math.round((lake.x - h.originX) / h.cellSize);
      const seen = new Set<number>([c]);
      const stack = [c];
      while (stack.length) {
        const i = stack.pop() as number;
        const x = h.originX + (i % n) * h.cellSize;
        const z = h.originZ + Math.floor(i / n) * h.cellSize;
        expect(lakeEdge(lake, x, z), `${at} leak @${x},${z}`).toBeLessThan(2);
        for (const j of [i - 1, i + 1, i - n, i + n])
          if (!seen.has(j) && h.data[j] <= lake.level + 1e-4) {
            seen.add(j);
            stack.push(j);
          }
      }
      // the published outline agrees with the formula
      for (const p of chain(isl, 'dataLakeRim')) {
        expect(Math.abs(lakeEdge(lake, p.x, p.z)), `${at} rim point`).toBeLessThan(1e-3);
        expect(p.y, at).toBe(lake.level);
      }
      expect(Math.abs(lakeEdge(lake, ...xz(lakePoint(lake, 1.1))))).toBeLessThan(1e-6);
    }
  });

  it('shore anchors stand on the shore, level with the lake pad, heading right', () => {
    let pods = 0;
    let lakes = 0;
    for (const seed of SEEDS) {
      const w = world(seed);
      const isl = codingOf(w);
      const lake = dataLakeOf(isl);
      if (!lake) continue;
      lakes++;
      const at = `seed ${seed}`;
      const A = isl.anchors;
      const P = chain(isl, 'lakePod');
      pods += P.length;
      expect(P.length, `${at} pods`).toBeGreaterThanOrEqual(S.lake.pods.min);
      const rimY = lake.level + S.lake.dip;
      for (const p of [...P, A.lakePavilion, A.lakeCloud]) {
        if (!p) continue;
        const d = lakeEdge(lake, p.x, p.z);
        expect(d, `${at} outside the water`).toBeGreaterThan(0);
        expect(d, `${at} on the shore`).toBeLessThan(6);
        expect(Math.abs((p.y ?? 0) - rimY), `${at} level`).toBeLessThan(0.75);
      }
      for (const p of P) {
        // rotY heads to the water: one more metre along it is nearer the outline
        const q = { x: p.x + Math.cos(p.rotY), z: p.z + Math.sin(p.rotY) };
        expect(lakeEdge(lake, q.x, q.z), `${at} pod faces the water`).toBeLessThan(
          lakeEdge(lake, p.x, p.z),
        );
      }
      expect(A.lakePavilion, `${at} pavilion`).toBeDefined();
      expect(A.lakeCloud, `${at} cloud`).toBeDefined();
    }
    expect(pods).toBeGreaterThanOrEqual(lakes * S.lake.pods.min);
  });

  it('paths join every gate to the hub', () => {
    for (const seed of SEEDS) {
      const w = world(seed);
      const isl = codingOf(w);
      const nodes = reached(w, isl.id);
      for (const [yard, , gate] of yards) {
        const g = isl.anchors[gate];
        if (!isl.anchors[yard]) continue;
        expect(g, `seed ${seed} ${gate}`).toBeDefined();
        const d = Math.min(...nodes.map((p) => Math.hypot(p.x - g.x, p.z - g.z)));
        expect(d, `seed ${seed} ${gate}`).toBeLessThan(4);
      }
    }
  });

  it('line, port and track anchors match their kit', () => {
    for (const seed of SEEDS) {
      const isl = codingOf(world(seed));
      const A = isl.anchors;
      const at = `seed ${seed}`;
      if (A.foundryYard) {
        const seg = chain(isl, 'foundrySeg');
        expect(S.line.segments, at).toContain(seg.length as 3);
        const d = Math.hypot(
          A.foundryLine1.x - A.foundryLine0.x,
          A.foundryLine1.z - A.foundryLine0.z,
        );
        expect(d, at).toBeCloseTo(seg.length * S.line.segment, 3);
        expect(chain(isl, 'foundryStation').length, at).toBe(3);
        expect(chain(isl, 'foundryArm').length, at).toBe(3);
        const sh = yardOf(isl, 'foundryYard', 'foundryLineSize') as Shape;
        for (const p of [
          ...seg,
          ...chain(isl, 'foundryArm'),
          ...chain(isl, 'foundryCrate'),
          A.foundryExit,
        ])
          expect(shapeDist(sh, p.x, p.z), `${at} inside the yard`).toBeLessThan(0);
      }
      if (A.dronePort) {
        const sh = yardOf(isl, 'dronePortYard', 'dronePortSize') as Shape;
        expect(chain(isl, 'droneMast').length, at).toBe(4);
        for (const p of [A.dronePort, A.droneHangar, ...chain(isl, 'droneMast')])
          expect(shapeDist(sh, p.x, p.z), `${at} inside the port`).toBeLessThan(0);
      }
      if (A.botTrackYard) {
        const n = chain(isl, 'botTrack').length;
        expect(S.track.stations, at).toContain(n as 3);
      }
    }
  });

  it('courier drones hub at the Coding pad; a seed without one keeps the HQ', () => {
    let rehubbed = 0;
    for (const seed of SEEDS) {
      const w = world(seed);
      const isl = codingOf(w);
      const pad = isl.anchors.dronePort;
      const routes = droneRoutes(w, 6, seed);
      expect(routes.length, `seed ${seed}`).toBe(6);
      const hq = w.settlements.find((s) => s.theme === 'hq');
      const home = pad ?? hq?.hub;
      const hub = routes.filter((_, k) => k % 2 === 0);
      for (const r of hub) {
        expect(r.ax, `seed ${seed}`).toBeCloseTo(home?.x ?? NaN, 5);
        expect(r.az, `seed ${seed}`).toBeCloseTo(home?.z ?? NaN, 5);
      }
      for (const r of routes) {
        expect(r.dist, `seed ${seed}`).toBeGreaterThan(1);
        expect(Number.isFinite(r.cycle), `seed ${seed}`).toBe(true);
        // no dock of the hub's own island as a far end
        if (pad) {
          const m = w.islandMap;
          const h = w.height;
          const i =
            Math.round((r.bz - h.originZ) / h.cellSize) * h.n +
            Math.round((r.bx - h.originX) / h.cellSize);
          expect(m[i], `seed ${seed} far end`).not.toBe(isl.id + 1);
        }
      }
      if (pad) rehubbed++;
    }
    expect(rehubbed).toBeGreaterThanOrEqual(18);
  });

  it('same seed, same sites (bit for bit)', () => {
    const a = codingOf(world(1001)).anchors;
    const b = codingOf(generateWorld(1001)).anchors;
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
  });
});

function xz(p: { x: number; z: number }): [number, number] {
  return [p.x, p.z];
}
