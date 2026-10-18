/**
 * Seamarks (TASK-474, world plan `W:D8` channel buoys + `W:D3` sea-stack fields): fixtures on the
 * water, placed after the boat routes (content SEAMARKS). Pure data.
 *
 * - Buoys: along every `ferry` route a red (port) / green (starboard) `buoy` pair every
 *   SEAMARKS.buoys.spacing u of arc, `lateral` u either side of the centreline; a pair is skipped
 *   where either side is too shallow, too close to shore, a pier end, an islet or another route.
 *   The pair's two fixtures are pushed port first, starboard second.
 * - Stacks: 2–4 clusters of `seaStack` fixtures (seabed-standing) off windward coasts, at most one
 *   per island, the first cluster carrying the arch variant at its centre. Every stack keeps clear
 *   of the routes, pier ends, islets, buoys and the culture boat rings (QA patrol, Design lantern).
 */
import type { Rng } from '../../core/rng.ts';
import { DOCK, SEAMARKS } from '../../content/settlements.ts';
import { CULTURE_BOATS } from '../../content/life.ts';
import type {
  DockData,
  FixtureData,
  Heightfield,
  IslandData,
  IsletData,
  Polyline,
  XZ,
} from '../types.ts';
import { heightAt, sampleGrid } from '../types.ts';
import { leewardness } from './heightfield.ts';

export interface SeamarkInput {
  h: Heightfield;
  sdf: Float32Array;
  islands: readonly IslandData[];
  islets: readonly IsletData[];
  docks: readonly DockData[];
  routes: readonly Polyline[];
  windDir: number;
}

interface Sample {
  route: number;
  arc: number;
  x: number;
  z: number;
}

const dist = (a: XZ, b: XZ): number => Math.hypot(a.x - b.x, a.z - b.z);
/** Distance of p to an island's / islet's centre. */
const distC = (p: XZ, c: { cx: number; cz: number }): number => Math.hypot(p.x - c.cx, p.z - c.cz);

/** Depth (u, positive down) and shore distance (u into the sea) at p. */
const water = (h: Heightfield, sdf: Float32Array, p: XZ): { depth: number; shore: number } => ({
  depth: -heightAt(h, p.x, p.z),
  shore: -sampleGrid(h, sdf, p.x, p.z, 999),
});

/** Cumulative arc lengths of a closed polyline (last entry = total). */
function arcs(pts: readonly XZ[]): Float64Array {
  const out = new Float64Array(pts.length + 1);
  for (let i = 0; i < pts.length; i++)
    out[i + 1] = out[i] + dist(pts[i], pts[(i + 1) % pts.length]);
  return out;
}

export function placeSeamarks(input: SeamarkInput, rng: Rng): FixtureData[] {
  const { h, sdf, islands, islets, docks, routes, windDir } = input;
  const out: FixtureData[] = [];
  const pierEnds: XZ[] = docks.map((d) => {
    const L = d.segments * DOCK.segment;
    return { x: d.x + Math.cos(d.rotY) * L, z: d.z + Math.sin(d.rotY) * L };
  });
  const nearestIsland = (p: XZ): IslandData =>
    islands.reduce((best, isl) => (distC(p, isl) < distC(p, best) ? isl : best), islands[0]);
  const isletClear = (p: XZ, clear: number): boolean =>
    islets.every((it) => distC(p, it) >= it.reach + clear);
  const dockClear = (p: XZ, clear: number): boolean => pierEnds.every((e) => dist(p, e) >= clear);

  // every route sample with its route and arc (own-route samples near the pair are not obstacles)
  const samples: Sample[] = [];
  const totals: number[] = [];
  routes.forEach((r, ri) => {
    const a = arcs(r.points);
    totals.push(a[r.points.length]);
    r.points.forEach((p, i) => samples.push({ route: ri, arc: a[i], x: p.x, z: p.z }));
  });
  const routeDist = (p: XZ, own: number, ownArc: number, skip: number): number => {
    let best = Infinity;
    for (const s of samples) {
      if (s.route === own) {
        const da = Math.abs(s.arc - ownArc);
        if (Math.min(da, totals[own] - da) < skip) continue;
      }
      const d = Math.hypot(s.x - p.x, s.z - p.z);
      if (d < best) best = d;
    }
    return best;
  };

  // ---- channel buoys along the ferry routes
  const B = SEAMARKS.buoys;
  const bRng = rng.fork('buoys');
  const buoys: XZ[] = [];
  const buoyOk = (p: XZ, ri: number, arc: number): boolean => {
    const w = water(h, sdf, p);
    return (
      w.depth >= B.minDepth &&
      w.shore >= B.minShore &&
      dockClear(p, B.dockClear) &&
      isletClear(p, B.isletClear) &&
      routeDist(p, ri, arc, B.spacing * 0.6) >= B.routeClear
    );
  };
  routes.forEach((r, ri) => {
    if (r.kind !== 'ferry') return;
    const pts = r.points;
    const a = arcs(pts);
    const total = a[pts.length];
    let seg = 0;
    for (let s = B.spacing / 2; s < total; s += B.spacing) {
      if (buoys.length + 2 > B.max) break;
      while (a[seg + 1] < s) seg++;
      const p0 = pts[seg];
      const p1 = pts[(seg + 1) % pts.length];
      const len = a[seg + 1] - a[seg] || 1;
      const t = (s - a[seg]) / len;
      const p = { x: p0.x + (p1.x - p0.x) * t, z: p0.z + (p1.z - p0.z) * t };
      const tx = (p1.x - p0.x) / len;
      const tz = (p1.z - p0.z) / len;
      // left of the heading (y up, right-handed) is up × t = (tz, −tx): port
      const port = { x: p.x + tz * B.lateral, z: p.z - tx * B.lateral };
      const star = { x: p.x - tz * B.lateral, z: p.z + tx * B.lateral };
      const rot = bRng.range(0, Math.PI * 2);
      if (!buoyOk(port, ri, s) || !buoyOk(star, ri, s)) continue;
      const islandId = nearestIsland(p).id;
      out.push({ defId: 'buoy', x: port.x, z: port.z, rotY: rot, islandId, variant: B.port });
      out.push({ defId: 'buoy', x: star.x, z: star.z, rotY: rot, islandId, variant: B.starboard });
      buoys.push(port, star);
    }
  });

  // ---- sea-stack fields off the windward coasts
  const S = SEAMARKS.stacks;
  const sRng = rng.fork('stacks');
  const rings = [CULTURE_BOATS.patrol, CULTURE_BOATS.lantern]
    .map((b) => {
      const isl = islands.find((i) => i.theme === b.theme);
      return isl ? { isl, r: isl.radius + b.margin } : null;
    })
    .filter((x): x is { isl: IslandData; r: number } => x !== null);
  const stackOk = (p: XZ, placed: readonly XZ[]): boolean => {
    const w = water(h, sdf, p);
    return (
      w.depth >= S.depth[0] &&
      w.depth <= S.depth[1] &&
      w.shore >= 3 &&
      dockClear(p, S.dockClear) &&
      isletClear(p, S.isletClear) &&
      routeDist(p, -1, 0, 0) >= S.routeClear &&
      buoys.every((b) => dist(p, b) >= S.buoyClear) &&
      rings.every((g) => Math.abs(distC(p, g.isl) - g.r) >= S.ringClear) &&
      placed.every((o) => dist(p, o) >= S.spacing)
    );
  };
  /** Size class whose top shows ≥ minVisible u above the water, the smallest fitting one preferred. */
  const classFor = (depth: number, r: Rng): number => {
    const ok = S.heights.map((_, k) => k).filter((k) => S.heights[k] - depth >= S.minVisible);
    if (ok.length === 0) return -1;
    return ok[Math.min(ok.length - 1, r.int(0, 1))];
  };
  const centres: XZ[] = [];
  const stacks: XZ[] = [];
  const want = sRng.fork('count').int(S.clusters[0], S.clusters[1]);
  const order = sRng
    .fork('order')
    .shuffle(islands.filter((i) => !S.skipArchetypes.includes(i.archetype)));
  let arch = false;
  for (const isl of order) {
    if (centres.length >= want) break;
    const ir = sRng.fork('isle', isl.id);
    // windward water cells in the shore / depth windows (grid stride 2 cells = 4 u)
    const R = isl.reach + S.shore[1];
    const i0 = Math.max(1, Math.floor((isl.cx - R - h.originX) / h.cellSize));
    const i1 = Math.min(h.n - 2, Math.ceil((isl.cx + R - h.originX) / h.cellSize));
    const j0 = Math.max(1, Math.floor((isl.cz - R - h.originZ) / h.cellSize));
    const j1 = Math.min(h.n - 2, Math.ceil((isl.cz + R - h.originZ) / h.cellSize));
    const collect = (maxDepth: number): XZ[] => {
      const cand: XZ[] = [];
      for (let j = j0; j <= j1; j += 2)
        for (let i = i0; i <= i1; i += 2) {
          const p = { x: h.originX + i * h.cellSize, z: h.originZ + j * h.cellSize };
          const w = { depth: -h.data[j * h.n + i], shore: -sdf[j * h.n + i] };
          if (w.shore < S.shore[0] || w.shore > S.shore[1]) continue;
          if (w.depth < S.depth[0] || w.depth > maxDepth) continue;
          if (leewardness(isl, windDir, p.x, p.z) > S.maxLee) continue;
          if (nearestIsland(p) !== isl) continue;
          if (!stackOk(p, stacks)) continue;
          cand.push(p);
        }
      return cand;
    };
    // the arch goes to the first cluster with shallow enough water (lintel above the sea)
    let useArch = !arch;
    let cand = collect(useArch ? Math.min(S.archMaxDepth, S.depth[1]) : S.depth[1]);
    if (cand.length === 0 && useArch) {
      useArch = false;
      cand = collect(S.depth[1]);
    }
    if (cand.length === 0) continue;
    const c = ir.pick(cand);
    const n = ir.int(S.perCluster[0], S.perCluster[1]);
    const placed: XZ[] = [];
    // the arch spans along the shore: fixture rotY is the heading of local +z (render yaw =
    // π/2 − rotY), so local +z = the radial and local x = the shore tangent
    const dx = c.x - isl.cx;
    const dz = c.z - isl.cz;
    const rot0 = useArch ? Math.atan2(dz, dx) : ir.range(0, Math.PI * 2);
    const v0 = useArch ? S.arch : classFor(water(h, sdf, c).depth, ir);
    if (v0 < 0) continue;
    out.push({ defId: 'seaStack', x: c.x, z: c.z, rotY: rot0, islandId: isl.id, variant: v0 });
    placed.push(c);
    for (let tries = 0; placed.length < n && tries < 24; tries++) {
      const a = ir.range(0, Math.PI * 2);
      const sp = useArch ? S.archSpread : S.spread;
      const d = ir.range(sp[0], sp[1]);
      const p = { x: c.x + Math.cos(a) * d, z: c.z + Math.sin(a) * d };
      if (!stackOk(p, [...stacks, ...placed])) continue;
      const v = classFor(water(h, sdf, p).depth, ir);
      if (v < 0) continue;
      out.push({
        defId: 'seaStack',
        x: p.x,
        z: p.z,
        rotY: ir.range(0, Math.PI * 2),
        islandId: isl.id,
        variant: v,
      });
      placed.push(p);
    }
    stacks.push(...placed);
    centres.push(c);
    if (useArch) arch = true;
  }
  return out;
}
