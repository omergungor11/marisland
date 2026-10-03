/**
 * Land-agent world queries and spawn planning (TASK-161). Pure data: no three.js, no clock, no
 * `Math.random` — every choice comes from a label-forked `Rng`, so a seed always yields the same
 * flocks, homes and spawn points.
 */
import { CATS, CRABS, LAND, SHEEP, VILLAGERS } from '../content/life.ts';
import { PROP_DEFS } from '../content/props.ts';
import { FIXTURE_RADIUS, LANDMARKS } from '../content/settlements.ts';
import type { Rng } from '../core/rng.ts';
import { PropFlag } from '../world/prop-store.ts';
import { Zone } from '../world/types.ts';
import type { LifeCtx } from './ctx.ts';

export type Mask = (x: number, z: number) => boolean;

// ---------------------------------------------------------------------------
// Solids: things cats / sheep / crabs must not stand in.

interface Shape {
  x: number;
  z: number;
  /** Disc radius (rect: bounding radius). */
  r: number;
  /** Rect (lot / dock): axis (cos, sin) along the facing and half extents; null = disc. */
  rect: { c: number; s: number; along: number; across: number } | null;
}

const CELL = 4;

export class Solids {
  private readonly shapes: Shape[] = [];
  private readonly grid = new Map<number, number[]>();

  private key(ix: number, iz: number): number {
    return (ix + 4096) * 8192 + (iz + 4096);
  }

  private add(s: Shape): void {
    const i = this.shapes.length;
    this.shapes.push(s);
    const x0 = Math.floor((s.x - s.r) / CELL);
    const x1 = Math.floor((s.x + s.r) / CELL);
    const z0 = Math.floor((s.z - s.r) / CELL);
    const z1 = Math.floor((s.z + s.r) / CELL);
    for (let ix = x0; ix <= x1; ix++)
      for (let iz = z0; iz <= z1; iz++) {
        const k = this.key(ix, iz);
        const l = this.grid.get(k);
        if (l) l.push(i);
        else this.grid.set(k, [i]);
      }
  }

  disc(x: number, z: number, r: number): void {
    this.add({ x, z, r, rect: null });
  }

  /** Rect centred at (x, z); `rotY` = facing (cos, sin); `d` along the facing, `w` across. */
  rect(x: number, z: number, rotY: number, d: number, w: number): void {
    this.add({
      x,
      z,
      r: Math.hypot(d, w) / 2,
      rect: { c: Math.cos(rotY), s: Math.sin(rotY), along: d / 2, across: w / 2 },
    });
  }

  get count(): number {
    return this.shapes.length;
  }

  hit(x: number, z: number): boolean {
    const l = this.grid.get(this.key(Math.floor(x / CELL), Math.floor(z / CELL)));
    if (!l) return false;
    for (const i of l) {
      const s = this.shapes[i];
      const dx = x - s.x;
      const dz = z - s.z;
      if (!s.rect) {
        if (dx * dx + dz * dz < s.r * s.r) return true;
      } else {
        const a = dx * s.rect.c + dz * s.rect.s;
        const b = -dx * s.rect.s + dz * s.rect.c;
        if (Math.abs(a) < s.rect.along && Math.abs(b) < s.rect.across) return true;
      }
    }
    return false;
  }
}

/** Props, lots, landmarks, fixtures and docks as blockers (with the content margins). */
export function buildSolids(ctx: LifeCtx): Solids {
  const sol = new Solids();
  const w = ctx.world;
  const P = w.props;
  if (P) {
    for (let i = 0; i < P.count; i++) {
      const def = PROP_DEFS[P.defId[i]];
      if (!def || def.flags & PropFlag.groundCover) continue;
      const r = def.footprint * (P.scale[i] || 1);
      if (r < LAND.solidMinFootprint) continue;
      sol.disc(P.x[i], P.z[i], r + LAND.solidMargin);
    }
  }
  for (const l of w.lots ?? []) {
    sol.rect(l.x, l.z, l.rotY, l.d + 2 * LAND.lotMargin, l.w + 2 * LAND.lotMargin);
  }
  for (const m of w.landmarks ?? []) {
    const spec = LANDMARKS[m.kind];
    const r = spec?.radius ?? 0;
    if (r > 0) sol.disc(m.x, m.z, r + LAND.landmarkMargin);
  }
  for (const f of w.fixtures ?? []) {
    sol.disc(f.x, f.z, (FIXTURE_RADIUS[f.defId] ?? 0.6) + LAND.solidMargin);
  }
  for (const d of w.docks ?? []) {
    const len = d.segments * 2;
    sol.rect(
      d.x + Math.cos(d.rotY) * (len / 2),
      d.z + Math.sin(d.rotY) * (len / 2),
      d.rotY,
      len,
      1.6,
    );
  }
  return sol;
}

/** Cell mask: zone in `zones`, optional shallow-depth limit, not inside a solid. */
export function makeMask(
  ctx: LifeCtx,
  solids: Solids,
  zones: readonly number[],
  maxDepth?: number,
): Mask {
  const ok = new Uint8Array(16);
  for (const z of zones) ok[z] = 1;
  return (x, z) => {
    if (!ok[ctx.zone(x, z)]) return false;
    if (maxDepth !== undefined && ctx.h(x, z) < -maxDepth) return false;
    return !solids.hit(x, z);
  };
}

/** True when every sample of the straight line (x0,z0) → (x1,z1) passes the mask. */
export function lineOk(mask: Mask, x0: number, z0: number, x1: number, z1: number): boolean {
  const len = Math.hypot(x1 - x0, z1 - z0);
  const n = Math.max(1, Math.ceil(len / LAND.segmentCheck));
  for (let k = 1; k <= n; k++) {
    const u = k / n;
    if (!mask(x0 + (x1 - x0) * u, z0 + (z1 - z0) * u)) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Allocation across islands.

export interface Entry {
  weight: number;
  cap: number;
}

/** D'Hondt: seat `total` agents; each seat goes to the entry maximising weight / (given + 1). */
export function allocate(total: number, entries: readonly Entry[]): number[] {
  const given = new Array<number>(entries.length).fill(0);
  for (let s = 0; s < total; s++) {
    let best = -1;
    let bv = 0;
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];
      if (e.weight <= 0 || given[i] >= e.cap) continue;
      const v = e.weight / (given[i] + 1);
      if (v > bv + 1e-12) {
        bv = v;
        best = i;
      }
    }
    if (best < 0) break;
    given[best]++;
  }
  return given;
}

// ---------------------------------------------------------------------------
// Walk graph (villagers).

export interface WalkGraph {
  n: number;
  x: Float32Array;
  z: Float32Array;
  /** Fixed feet height of deck nodes (docks); NaN = follow the terrain. */
  deckY: Float32Array;
  adj: number[][];
  /** Connected component id per node, −1 = not walkable. */
  comp: Int32Array;
  compCount: number;
  /** Node ids that are lot doors, hubs and dock ends. */
  kind: Uint8Array;
}

export const NodeKind = { plain: 0, door: 1, hub: 2, dockEnd: 3 } as const;

export function buildWalkGraph(ctx: LifeCtx): WalkGraph {
  const w = ctx.world;
  const g0 = w.pathGraph;
  const base = g0 ? g0.nodes.length / 2 : 0;
  const xs: number[] = [];
  const zs: number[] = [];
  const ys: number[] = [];
  for (let i = 0; i < base; i++) {
    xs.push(g0.nodes[i * 2]);
    zs.push(g0.nodes[i * 2 + 1]);
    ys.push(NaN);
  }
  const edges: [number, number][] = [];
  if (g0) for (let e = 0; e < g0.edges.length; e += 2) edges.push([g0.edges[e], g0.edges[e + 1]]);
  const kind: number[] = new Array<number>(base).fill(0);

  const nearest = (x: number, z: number, maxD: number): number => {
    let best = -1;
    let bd = maxD;
    for (let i = 0; i < base; i++) {
      const d = Math.hypot(xs[i] - x, zs[i] - z);
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    return best;
  };

  // dock spurs: a chain of deck nodes from the dock root to its seaward end
  for (const d of w.docks ?? []) {
    const root = d.node >= 0 && d.node < base ? d.node : nearest(d.x, d.z, 4);
    if (root < 0) continue;
    const len = d.segments * 2;
    const fx = Math.cos(d.rotY);
    const fz = Math.sin(d.rotY);
    let prev = root;
    for (let s = VILLAGERS.dockStep; s <= len + 1e-6; s += VILLAGERS.dockStep) {
      const id = xs.length;
      xs.push(d.x + fx * s);
      zs.push(d.z + fz * s);
      ys.push(VILLAGERS.deckY);
      kind.push(0);
      edges.push([prev, id]);
      prev = id;
    }
    kind[prev] = NodeKind.dockEnd;
  }
  const n = xs.length;
  const x = Float32Array.from(xs);
  const z = Float32Array.from(zs);
  const deckY = Float32Array.from(ys);
  const walk = new Uint8Array(n);
  for (let i = 0; i < n; i++)
    walk[i] = Number.isNaN(deckY[i]) ? (ctx.h(x[i], z[i]) >= VILLAGERS.minWalkY ? 1 : 0) : 1;
  const adj: number[][] = Array.from({ length: n }, () => []);
  for (const [a, b] of edges) {
    if (!walk[a] || !walk[b] || a === b) continue;
    adj[a].push(b);
    adj[b].push(a);
  }
  // doors and hubs
  const mark = (node: number, k: number): void => {
    if (node >= 0 && node < n && kind[node] === 0) kind[node] = k;
  };
  for (const l of w.lots ?? []) mark(l.node, NodeKind.door);
  for (const s of w.settlements ?? []) mark(s.hub.node, NodeKind.hub);

  const comp = new Int32Array(n).fill(-1);
  let compCount = 0;
  const stack: number[] = [];
  for (let i = 0; i < n; i++) {
    if (!walk[i] || comp[i] >= 0) continue;
    comp[i] = compCount;
    stack.push(i);
    while (stack.length) {
      const a = stack.pop() as number;
      for (const b of adj[a])
        if (comp[b] < 0) {
          comp[b] = compCount;
          stack.push(b);
        }
    }
    compCount++;
  }
  return { n, x, z, deckY, adj, comp, compCount, kind: Uint8Array.from(kind) };
}

/** Shortest node route (inclusive) from `a` to `b`, or null when unreachable. */
export function walkRoute(g: WalkGraph, a: number, b: number): number[] | null {
  if (a === b) return [a];
  const dist = new Float64Array(g.n).fill(Infinity);
  const prev = new Int32Array(g.n).fill(-1);
  const done = new Uint8Array(g.n);
  dist[a] = 0;
  for (let it = 0; it < g.n; it++) {
    let u = -1;
    let bu = Infinity;
    for (let i = 0; i < g.n; i++)
      if (!done[i] && dist[i] < bu) {
        bu = dist[i];
        u = i;
      }
    if (u < 0) break;
    if (u === b) break;
    done[u] = 1;
    for (const v of g.adj[u]) {
      const nd = dist[u] + Math.hypot(g.x[v] - g.x[u], g.z[v] - g.z[u]);
      if (nd < dist[v]) {
        dist[v] = nd;
        prev[v] = u;
      }
    }
  }
  if (prev[b] < 0) return null;
  const out: number[] = [];
  for (let v = b; v >= 0; v = prev[v]) {
    out.push(v);
    if (v === a) break;
  }
  return out.reverse();
}

// ---------------------------------------------------------------------------
// Spawn plans.

export interface VillagerSpawn {
  island: number;
  comp: number;
  node: number;
}

/** Which settlement a component belongs to (by hub node). */
export function planVillagers(
  ctx: LifeCtx,
  g: WalkGraph,
  total: number,
  rng: Rng,
): VillagerSpawn[] {
  const sets = (ctx.world.settlements ?? []).filter((s) => {
    const c = s.hub.node >= 0 && s.hub.node < g.n ? g.comp[s.hub.node] : -1;
    return c >= 0;
  });
  const sizes = new Map<number, number>();
  for (let i = 0; i < g.n; i++)
    if (g.comp[i] >= 0) sizes.set(g.comp[i], (sizes.get(g.comp[i]) ?? 0) + 1);
  const entries = sets.map((s) => {
    const nodes = sizes.get(g.comp[s.hub.node]) ?? 0;
    return {
      weight: nodes >= 3 ? (VILLAGERS.weights[s.kind] ?? 0) : 0,
      cap: Math.min(VILLAGERS.perSettlement, Math.floor(nodes / 3)),
    };
  });
  const quota = allocate(total, entries);
  const out: VillagerSpawn[] = [];
  sets.forEach((s, k) => {
    const comp = g.comp[s.hub.node];
    const cand: number[] = [];
    for (let i = 0; i < g.n; i++) if (g.comp[i] === comp) cand.push(i);
    const r = rng.fork('villagers', s.islandId);
    r.shuffle(cand);
    const chosen: number[] = [];
    for (const minSep of [8, 3, 0]) {
      for (const c of cand) {
        if (chosen.length >= quota[k]) break;
        if (chosen.includes(c)) continue;
        if (chosen.every((o) => Math.hypot(g.x[o] - g.x[c], g.z[o] - g.z[c]) >= minSep))
          chosen.push(c);
      }
    }
    for (const node of chosen) out.push({ island: s.islandId, comp, node });
  });
  return out;
}

export interface WanderSpawn {
  island: number;
  x: number;
  z: number;
  /** Roam centre. */
  hx: number;
  hz: number;
}

export interface IslandCells {
  /** Cell world positions of a zone set per island, in grid order. */
  x: number[];
  z: number[];
}

/** World xz of every grid cell of island `id` whose zone is in `zones` (and sdf window). */
export function islandCells(
  ctx: LifeCtx,
  id: number,
  zones: readonly number[],
  sdf?: readonly [number, number],
): IslandCells {
  const h = ctx.world.height;
  const isl = ctx.world.islands[id];
  const ok = new Uint8Array(16);
  for (const z of zones) ok[z] = 1;
  const out: IslandCells = { x: [], z: [] };
  const i0 = Math.max(0, Math.floor((isl.minX - 6 - h.originX) / h.cellSize));
  const i1 = Math.min(h.n - 1, Math.ceil((isl.maxX + 6 - h.originX) / h.cellSize));
  const j0 = Math.max(0, Math.floor((isl.minZ - 6 - h.originZ) / h.cellSize));
  const j1 = Math.min(h.n - 1, Math.ceil((isl.maxZ + 6 - h.originZ) / h.cellSize));
  for (let j = j0; j <= j1; j++) {
    for (let i = i0; i <= i1; i++) {
      const k = j * h.n + i;
      if (ctx.world.islandMap[k] !== id + 1 || !ok[ctx.world.zone[k]]) continue;
      if (sdf) {
        const d = ctx.world.shoreSdf[k];
        if (d < sdf[0] || d > sdf[1]) continue;
      }
      out.x.push(h.originX + i * h.cellSize);
      out.z.push(h.originZ + j * h.cellSize);
    }
  }
  return out;
}

const RING = 8;
/** Fraction of an 8-point ring (radius r) that passes the mask. */
function ringCover(mask: Mask, x: number, z: number, r: number): number {
  let n = 0;
  for (let k = 0; k < RING; k++) {
    const a = (k / RING) * Math.PI * 2;
    if (mask(x + Math.cos(a) * r, z + Math.sin(a) * r)) n++;
  }
  return n / RING;
}

/** A free spot near (hx, hz) within `spread`, or null. */
function spotNear(
  mask: Mask,
  rng: Rng,
  hx: number,
  hz: number,
  lo: number,
  hi: number,
): { x: number; z: number } | null {
  for (let t = 0; t < 24; t++) {
    const a = rng.range(0, Math.PI * 2);
    const d = rng.range(lo, hi);
    const x = hx + Math.cos(a) * d;
    const z = hz + Math.sin(a) * d;
    if (mask(x, z)) return { x, z };
  }
  return mask(hx, hz) ? { x: hx, z: hz } : null;
}

/**
 * Where the flocks belong on island `id`: barns, windmills and the settlement hub. The village camera
 * frames the hub, so a flock that lives beside them is on screen (TASK-192 W7: sheep were scattered
 * over the whole plateau, mostly out of frame).
 */
export function sheepAnchors(ctx: LifeCtx, id: number): { x: number; z: number }[] {
  const out: { x: number; z: number }[] = [];
  for (const l of ctx.world.lots ?? []) if (l.islandId === id && l.kind === 'barn') out.push(l);
  for (const m of ctx.world.landmarks ?? [])
    if (m.islandId === id && m.kind === 'windmill') out.push(m);
  for (const s of ctx.world.settlements ?? []) if (s.islandId === id) out.push(s.hub);
  return out;
}

export function planSheep(ctx: LifeCtx, mask: Mask, total: number, rng: Rng): WanderSpawn[] {
  const isl = ctx.world.islands;
  const cells = isl.map((_, id) => islandCells(ctx, id, SHEEP.zones));
  const entries = isl.map((it, id) => {
    const n = cells[id].x.length;
    if (n < SHEEP.minMeadowCells) return { weight: 0, cap: 0 };
    return {
      weight: (SHEEP.weights[it.archetype] ?? SHEEP.otherWeight) * n,
      cap: Math.floor(n / 12),
    };
  });
  const quota = allocate(total, entries);
  const out: WanderSpawn[] = [];
  isl.forEach((_it, id) => {
    let left = quota[id];
    if (left <= 0) return;
    const r = rng.fork('sheep', id);
    const order = cells[id].x.map((_, i) => i);
    r.shuffle(order);
    // nearest to a barn / windmill / hub first (stable sort keeps the shuffle as tie-break)
    const anchors = sheepAnchors(ctx, id);
    if (anchors.length > 0) {
      const near = (i: number): number => {
        let d = Infinity;
        for (const a of anchors)
          d = Math.min(d, Math.hypot(cells[id].x[i] - a.x, cells[id].z[i] - a.z));
        return d;
      };
      const key = new Map<number, number>(
        order.map((i) => [i, Math.floor(near(i) / SHEEP.anchorBand)]),
      );
      order.sort((a, b) => (key.get(a) as number) - (key.get(b) as number));
    }
    const homes: { x: number; z: number }[] = [];
    while (left > 0) {
      const size = Math.min(left, r.int(SHEEP.flockSize[0], SHEEP.flockSize[1]));
      let home: { x: number; z: number } | null = null;
      for (const cover of [SHEEP.homeCover, 0.6, 0]) {
        for (const i of order) {
          const x = cells[id].x[i];
          const z = cells[id].z[i];
          if (!mask(x, z) || ringCover(mask, x, z, 3) < cover) continue;
          if (homes.some((o) => Math.hypot(o.x - x, o.z - z) < 10)) continue;
          home = { x, z };
          break;
        }
        if (home) break;
      }
      if (!home) break;
      homes.push(home);
      for (let k = 0; k < size; k++) {
        const s = spotNear(mask, r, home.x, home.z, 0.4, SHEEP.spawnSpread);
        if (s) out.push({ island: id, x: s.x, z: s.z, hx: home.x, hz: home.z });
      }
      left -= size;
    }
  });
  return out;
}

export function planCats(ctx: LifeCtx, mask: Mask, total: number, rng: Rng): WanderSpawn[] {
  const sets = (ctx.world.settlements ?? []).filter((s) => (CATS.weights[s.kind] ?? 0) > 0);
  const quota = allocate(
    total,
    sets.map((s) => ({ weight: CATS.weights[s.kind] ?? 0, cap: s.kind === 'village' ? 3 : 1 })),
  );
  const out: WanderSpawn[] = [];
  sets.forEach((s, k) => {
    if (quota[k] <= 0) return;
    const r = rng.fork('cats', s.islandId);
    const homes: { x: number; z: number }[] = [{ x: s.hub.x, z: s.hub.z }];
    for (const li of s.lots) {
      const l = ctx.world.lots[li];
      if (l && l.kind !== 'stall' && l.kind !== 'hut')
        homes.push({
          x: l.x + Math.cos(l.rotY) * (l.d / 2 + 1.5),
          z: l.z + Math.sin(l.rotY) * (l.d / 2 + 1.5),
        });
    }
    r.shuffle(homes);
    let made = 0;
    for (const h of homes) {
      if (made >= quota[k]) break;
      const sp = spotNear(mask, r, h.x, h.z, CATS.spawnSpread[0], CATS.spawnSpread[1]);
      if (!sp) continue;
      out.push({ island: s.islandId, x: sp.x, z: sp.z, hx: h.x, hz: h.z });
      made++;
    }
  });
  return out;
}

/** The camera's `beach` anchor rule (world-view `withDefaults`): nearest dry sand 1.5–5 u inland. */
function beachPoint(ctx: LifeCtx, id: number, cells: IslandCells): { x: number; z: number } | null {
  const isl = ctx.world.islands[id];
  const a = isl.anchors;
  if (a.beach) return { x: a.beach.x, z: a.beach.z };
  const seed = a.harbour ??
    a.landing ?? {
      x: isl.cx + Math.cos(ctx.world.windDir) * isl.radius * 0.8,
      z: isl.cz + Math.sin(ctx.world.windDir) * isl.radius * 0.8,
    };
  const h = ctx.world.height;
  let best: { x: number; z: number } | null = null;
  let bd = Infinity;
  for (let k = 0; k < cells.x.length; k++) {
    const x = cells.x[k];
    const z = cells.z[k];
    const zi = ctx.zone(x, z);
    if (zi !== Zone.sandDry && zi !== Zone.sandBlack) continue;
    const sdf =
      ctx.world.shoreSdf[
        Math.round((z - h.originZ) / h.cellSize) * h.n + Math.round((x - h.originX) / h.cellSize)
      ];
    if (sdf < 1.5 || sdf > 5) continue;
    const d = Math.hypot(x - seed.x, z - seed.z);
    if (d < bd) {
      bd = d;
      best = { x, z };
    }
  }
  return best;
}

export function planCrabs(ctx: LifeCtx, mask: Mask, total: number, rng: Rng): WanderSpawn[] {
  const isl = ctx.world.islands;
  const cells = isl.map((_, id) =>
    islandCells(ctx, id, [Zone.sandDry, Zone.sandWet, Zone.sandBlack], CRABS.homeSdf),
  );
  const entries = isl.map((it, id) => ({
    weight: cells[id].x.length >= 6 ? (CRABS.weights[it.archetype] ?? 0) : 0,
    cap: Math.max(1, Math.floor(cells[id].x.length / 6)),
  }));
  const quota = allocate(total, entries);
  const out: WanderSpawn[] = [];
  isl.forEach((_, id) => {
    if (quota[id] <= 0) return;
    const r = rng.fork('crabs', id);
    const order = cells[id].x.map((_c, i) => i);
    r.shuffle(order);
    const homes: { x: number; z: number }[] = [];
    const first = beachPoint(ctx, id, cells[id]);
    if (first) homes.push(first);
    for (const i of order) {
      if (homes.length >= quota[id]) break;
      const p = { x: cells[id].x[i], z: cells[id].z[i] };
      if (homes.every((o) => Math.hypot(o.x - p.x, o.z - p.z) >= 10)) homes.push(p);
    }
    for (let k = 0; k < quota[id]; k++) {
      const home = homes[k % Math.max(1, homes.length)];
      if (!home) break;
      const s = spotNear(mask, r, home.x, home.z, 0.3, CRABS.spawnSpread);
      if (s) out.push({ island: id, x: s.x, z: s.z, hx: home.x, hz: home.z });
    }
  });
  return out;
}
