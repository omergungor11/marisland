import type { Rng } from '../../core/rng.ts';
import { smoothPolyline } from '../../core/math/catmull-rom.ts';
import { DOCK, ROUTES } from '../../content/settlements.ts';
import type { DockData, Heightfield, IslandData, Polyline, XZ } from '../types.ts';
import { heightAt, sampleGrid } from '../types.ts';
import { gridAStar, resample } from './paths.ts';

/**
 * Boat routes (ARCHITECTURE §2 step 6, TASK-133): closed loops found by A* on
 * a coarse ROUTES.cell grid over water, with a cost that prefers the shelf
 * edge (depth 3–10 u) so boats pass islands closely. Each loop visits 2–3
 * docks or circles an island. Catmull-Rom smoothed and resampled at 2 u;
 * every sample is verified ≥ ROUTES.minDepth deep and ≥ ROUTES.minShore from land.
 */

export interface RouteInput {
  h: Heightfield;
  sdf: Float32Array;
  islands: IslandData[];
  docks: DockData[];
}

interface Coarse {
  n: number;
  /** Samples per coarse step. */
  k: number;
  pass: Uint8Array;
  depth: Float32Array;
  repel: Float32Array;
}

function buildCoarse(h: Heightfield, sdf: Float32Array): Coarse {
  const k = Math.round(ROUTES.cell / h.cellSize);
  const n = Math.floor((h.n - 1) / k) + 1;
  const pass = new Uint8Array(n * n);
  const depth = new Float32Array(n * n);
  for (let cz = 1; cz < n - 1; cz++)
    for (let cx = 1; cx < n - 1; cx++) {
      const ix = cx * k;
      const iz = cz * k;
      let ok = true;
      for (let dz = -k + 1; dz <= k - 1 && ok; dz++)
        for (let dx = -k + 1; dx <= k - 1 && ok; dx++) {
          const i = (iz + dz) * h.n + ix + dx;
          if (h.data[i] > -ROUTES.nodeDepth || sdf[i] > -ROUTES.nodeShore) ok = false;
        }
      const c = cz * n + cx;
      pass[c] = ok ? 1 : 0;
      depth[c] = -h.data[iz * h.n + ix];
    }
  // connected components of passable nodes (8-neighbour); boats only use the largest (open sea)
  const comp = new Int32Array(n * n).fill(-1);
  let bestComp = -1;
  let bestSize = 0;
  let id = 0;
  for (let i0 = 0; i0 < n * n; i0++) {
    if (!pass[i0] || comp[i0] >= 0) continue;
    const stack = [i0];
    comp[i0] = id;
    let size = 0;
    while (stack.length > 0) {
      const c = stack.pop() as number;
      size++;
      const cx = c % n;
      const cz = (c - cx) / n;
      for (let dz = -1; dz <= 1; dz++)
        for (let dx = -1; dx <= 1; dx++) {
          const x = cx + dx;
          const z = cz + dz;
          if (x < 0 || z < 0 || x >= n || z >= n) continue;
          const j = z * n + x;
          if (!pass[j] || comp[j] >= 0) continue;
          comp[j] = id;
          stack.push(j);
        }
    }
    if (size > bestSize) {
      bestSize = size;
      bestComp = id;
    }
    id++;
  }
  for (let i = 0; i < n * n; i++) if (comp[i] !== bestComp) pass[i] = 0;
  return { n, k, pass, depth, repel: new Float32Array(n * n) };
}

const posOf = (h: Heightfield, c: Coarse, i: number): XZ => {
  const cx = i % c.n;
  return {
    x: h.originX + cx * c.k * h.cellSize,
    z: h.originZ + ((i - cx) / c.n) * c.k * h.cellSize,
  };
};

/** Nearest passable coarse node within `r` u of p. */
function nearestNode(h: Heightfield, c: Coarse, p: XZ, r: number, minDepth = 0): number {
  const step = c.k * h.cellSize;
  const cx = Math.round((p.x - h.originX) / step);
  const cz = Math.round((p.z - h.originZ) / step);
  const R = Math.ceil(r / step);
  let best = -1;
  let bd = Infinity;
  for (let dz = -R; dz <= R; dz++)
    for (let dx = -R; dx <= R; dx++) {
      const x = cx + dx;
      const z = cz + dz;
      if (x < 0 || z < 0 || x >= c.n || z >= c.n) continue;
      const i = z * c.n + x;
      if (!c.pass[i] || c.depth[i] < minDepth) continue;
      const q = posOf(h, c, i);
      const d = Math.hypot(q.x - p.x, q.z - p.z);
      if (d <= r && d < bd) {
        bd = d;
        best = i;
      }
    }
  return best;
}

function leg(c: Coarse, a: number, b: number, cellU: number): number[] | null {
  const m = Math.ceil(ROUTES.legMargin / cellU);
  const ax = a % c.n;
  const az = (a - ax) / c.n;
  const bx = b % c.n;
  const bz = (b - bx) / c.n;
  const local = {
    x0: Math.max(0, Math.min(ax, bx) - m),
    z0: Math.max(0, Math.min(az, bz) - m),
    x1: Math.min(c.n - 1, Math.max(ax, bx) + m),
    z1: Math.min(c.n - 1, Math.max(az, bz) + m),
  };
  return legIn(c, a, b, local) ?? legIn(c, a, b, { x0: 0, z0: 0, x1: c.n - 1, z1: c.n - 1 });
}

function legIn(
  c: Coarse,
  a: number,
  b: number,
  win: { x0: number; z0: number; x1: number; z1: number },
): number[] | null {
  const [lo, hi] = ROUTES.preferDepth;
  return gridAStar({
    n: c.n,
    ...win,
    start: a,
    goal: b,
    hScale: 1,
    step: (_from, to, dist) => {
      if (!c.pass[to]) return Infinity;
      const d = c.depth[to];
      const pen = d < lo ? (lo - d) * 0.8 : d > hi ? Math.min(2, (d - hi) * 0.08) : 0;
      return dist * (1 + pen + c.repel[to]);
    },
  });
}

function addRepel(c: Coarse, nodes: number[]): void {
  for (const i of nodes) {
    const cx = i % c.n;
    const cz = (i - cx) / c.n;
    for (let dz = -2; dz <= 2; dz++)
      for (let dx = -2; dx <= 2; dx++) {
        const x = cx + dx;
        const z = cz + dz;
        if (x < 0 || z < 0 || x >= c.n || z >= c.n) continue;
        const w = 1 - Math.hypot(dx, dz) / 3;
        if (w > 0) c.repel[z * c.n + x] = Math.max(c.repel[z * c.n + x], ROUTES.repel * w);
      }
  }
}

/** A closed loop through waypoints (coarse node ids), or null. */
function loopThrough(c: Coarse, wps: number[], cellU: number): number[] | null {
  const out: number[] = [];
  for (let k = 0; k < wps.length; k++) {
    const a = wps[k];
    const b = wps[(k + 1) % wps.length];
    const path = leg(c, a, b, cellU);
    if (!path) return null;
    for (let j = 0; j < path.length - 1; j++) out.push(path[j]);
    addRepel(c, path);
  }
  return out;
}

/** Route sample validity (the property the tests lock). */
export function routeSampleOk(h: Heightfield, sdf: Float32Array, p: XZ, margin = 0): boolean {
  return (
    heightAt(h, p.x, p.z) <= -(ROUTES.minDepth + margin) &&
    sampleGrid(h, sdf, p.x, p.z, -999) <= -(ROUTES.minShore + margin)
  );
}

/**
 * Smooth a closed coarse loop: Catmull-Rom through every `stride`-th node
 * (waypoints always kept), resample at ROUTES.resample; fall back to smaller
 * strides and finally the raw polyline (valid by construction).
 */
function smoothLoop(h: Heightfield, sdf: Float32Array, pts: XZ[], keep: Set<number>): XZ[] {
  for (const stride of [4, 3, 2, 1]) {
    const ctrl: XZ[] = [];
    for (let i = 0; i < pts.length; i++) if (i % stride === 0 || keep.has(i)) ctrl.push(pts[i]);
    if (ctrl.length < 3) continue;
    const sm = smoothPolyline(
      ctrl.map((p) => ({ x: p.x, y: p.z })),
      6,
      true,
    ).map((p) => ({ x: p.x, z: p.y }));
    if (!sm.every((p) => routeSampleOk(h, sdf, p, 0.05))) continue;
    const out = resample(sm, ROUTES.resample, true);
    if (out.every((p) => routeSampleOk(h, sdf, p, 0.05))) return out;
  }
  return resample(pts, ROUTES.resample, true);
}

export function buildRoutes(input: RouteInput, rng: Rng): Polyline[] {
  const { h, sdf, islands, docks } = input;
  const c = buildCoarse(h, sdf);
  // docks a boat can reach: a passable node within dockReach of the dock end
  const stops: { dock: number; node: number; p: XZ; islandId: number }[] = [];
  docks.forEach((d, i) => {
    const L = d.segments * DOCK.segment;
    const end = { x: d.x + Math.cos(d.rotY) * L, z: d.z + Math.sin(d.rotY) * L };
    const basin = {
      x: end.x + Math.cos(d.rotY) * DOCK.basinOffset,
      z: end.z + Math.sin(d.rotY) * DOCK.basinOffset,
    };
    let node = nearestNode(h, c, basin, 3);
    if (
      node < 0 ||
      Math.hypot(posOf(h, c, node).x - end.x, posOf(h, c, node).z - end.z) > ROUTES.dockReach - 1
    )
      node = nearestNode(h, c, end, ROUTES.dockReach - 1);
    if (node >= 0) stops.push({ dock: i, node, p: posOf(h, c, node), islandId: d.islandId });
  });
  const count = rng.int(ROUTES.count[0], ROUTES.count[1]);
  const routes: Polyline[] = [];
  const usedSets: string[] = [];
  const centroid = (ps: XZ[]): XZ => ({
    x: ps.reduce((a, p) => a + p.x, 0) / ps.length,
    z: ps.reduce((a, p) => a + p.z, 0) / ps.length,
  });
  const emit = (wps: number[], stopDocks: number[]): boolean => {
    const nodes = loopThrough(c, wps, c.k * h.cellSize);
    if (!nodes || nodes.length < 4) return false;
    const pts = nodes.map((i) => posOf(h, c, i));
    const keep = new Set<number>();
    nodes.forEach((nd, i) => {
      if (wps.includes(nd)) keep.add(i);
    });
    routes.push({
      islandId: -1,
      kind: 'route',
      closed: true,
      points: smoothLoop(h, sdf, pts, keep),
      stops: stopDocks,
    });
    return true;
  };

  // dock loops: start at each dock in turn (Hearthholm first), visit its 1–2 nearest neighbours
  const dRng = rng.fork('dock-loops');
  const order = stops
    .map((_, i) => i)
    .sort((a, b) => {
      const ha = islands[stops[a].islandId]?.archetype === 'hearthholm' ? 0 : 1;
      const hb = islands[stops[b].islandId]?.archetype === 'hearthholm' ? 0 : 1;
      return ha - hb || a - b;
    });
  for (const s0 of order) {
    if (routes.length >= count || stops.length < 2) break;
    const k = Math.min(stops.length, dRng.int(ROUTES.docksPerRoute[0], ROUTES.docksPerRoute[1]));
    const near = stops
      .map((s, i) => ({ i, d: Math.hypot(s.p.x - stops[s0].p.x, s.p.z - stops[s0].p.z) }))
      .filter((e) => e.i !== s0 && stops[e.i].islandId !== stops[s0].islandId)
      .sort((a, b) => a.d - b.d)
      .slice(0, k - 1)
      .map((e) => e.i);
    if (near.length === 0) continue;
    const set = [s0, ...near].sort((a, b) => a - b);
    const key = set.join(',');
    if (usedSets.includes(key)) continue;
    usedSets.push(key);
    const ctr = centroid(set.map((i) => stops[i].p));
    const ring = set.sort(
      (a, b) =>
        Math.atan2(stops[a].p.z - ctr.z, stops[a].p.x - ctr.x) -
        Math.atan2(stops[b].p.z - ctr.z, stops[b].p.x - ctr.x),
    );
    emit(
      ring.map((i) => stops[i].node),
      ring.map((i) => stops[i].dock),
    );
  }

  // circle islands (no reachable dock first, larger first)
  const withStop = new Set(stops.map((s) => s.islandId));
  const circ = islands
    .slice()
    .sort(
      (a, b) =>
        Number(withStop.has(a.id)) - Number(withStop.has(b.id)) || b.reach - a.reach || a.id - b.id,
    );
  for (const isl of circ) {
    if (routes.length >= count) break;
    const wps: number[] = [];
    const rays = ROUTES.circleRays;
    for (let r = 0; r < rays; r++) {
      const a = (r / rays) * Math.PI * 2;
      for (let d = isl.reach * 0.6; d <= isl.reach + 60; d += 2) {
        const p = { x: isl.cx + Math.cos(a) * d, z: isl.cz + Math.sin(a) * d };
        const node = nearestNode(h, c, p, 2.9, ROUTES.preferDepth[0]);
        if (node >= 0) {
          if (!wps.includes(node)) wps.push(node);
          break;
        }
      }
    }
    if (wps.length < 4) continue;
    emit(wps, []);
  }
  return routes;
}
