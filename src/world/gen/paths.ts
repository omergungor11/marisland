import { smoothPolyline, type Vec2 } from '../../core/math/catmull-rom.ts';
import { PATHS } from '../../content/settlements.ts';
import type { Heightfield, PathGraph, Polyline, XZ } from '../types.ts';
import { Zone } from '../types.ts';
import { cellX, cellZ } from './grid.ts';

/**
 * Footpaths (ARCHITECTURE §2 step 6): grid A* with a slope cost, a node/edge
 * network that merges paths, Catmull-Rom smoothing between junctions, and the
 * Zone.path / carve write-back.
 */

// ---------------------------------------------------------------------------
// Generic A* over a square grid window (8-neighbour), used by paths and routes.

export interface GridSearch {
  /** Grid side (samples). */
  n: number;
  /** Inclusive window in sample indices. */
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  start: number;
  /** Single goal (heuristic target) — or −1 with `isGoal` (Dijkstra). */
  goal: number;
  isGoal?: (i: number) => boolean;
  /** Cost of the step from → to (dist = 1 or √2 in cells); Infinity = blocked. */
  step: (from: number, to: number, dist: number) => number;
  /** Lower bound of cost per cell of distance (heuristic scale). */
  hScale: number;
}

const DIRS: readonly (readonly [number, number, number])[] = [
  [1, 0, 1],
  [-1, 0, 1],
  [0, 1, 1],
  [0, -1, 1],
  [1, 1, Math.SQRT2],
  [-1, 1, Math.SQRT2],
  [1, -1, Math.SQRT2],
  [-1, -1, Math.SQRT2],
];

/** Binary min-heap of (key, value) with Float64 keys. */
class Heap {
  private k: number[] = [];
  private v: number[] = [];
  get size(): number {
    return this.k.length;
  }
  push(key: number, val: number): void {
    const k = this.k;
    const v = this.v;
    let i = k.length;
    k.push(key);
    v.push(val);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (k[p] <= key) break;
      k[i] = k[p];
      v[i] = v[p];
      i = p;
    }
    k[i] = key;
    v[i] = val;
  }
  pop(): number {
    const k = this.k;
    const v = this.v;
    const top = v[0];
    const lk = k.pop() as number;
    const lv = v.pop() as number;
    const n = k.length;
    if (n > 0) {
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        if (l >= n) break;
        const r = l + 1;
        const c = r < n && k[r] < k[l] ? r : l;
        if (k[c] >= lk) break;
        k[i] = k[c];
        v[i] = v[c];
        i = c;
      }
      k[i] = lk;
      v[i] = lv;
    }
    return top;
  }
}

/** Returns full-grid indices from start to the reached goal, or null. */
export function gridAStar(s: GridSearch): number[] | null {
  const { n, x0, z0, x1, z1 } = s;
  const w = x1 - x0 + 1;
  const h = z1 - z0 + 1;
  const loc = (i: number): number => {
    const x = i % n;
    const z = (i - x) / n;
    if (x < x0 || x > x1 || z < z0 || z > z1) return -1;
    return (z - z0) * w + (x - x0);
  };
  const ls = loc(s.start);
  if (ls < 0) return null;
  const g = new Float64Array(w * h).fill(Infinity);
  const came = new Int32Array(w * h).fill(-1);
  const closed = new Uint8Array(w * h);
  const gx = s.goal >= 0 ? s.goal % n : 0;
  const gz = s.goal >= 0 ? (s.goal - gx) / n : 0;
  const heur = (lx: number, lz: number): number => {
    if (s.goal < 0) return 0;
    const dx = Math.abs(lx + x0 - gx);
    const dz = Math.abs(lz + z0 - gz);
    return s.hScale * (Math.max(dx, dz) + (Math.SQRT2 - 1) * Math.min(dx, dz));
  };
  const isGoal = s.isGoal ?? ((i: number): boolean => i === s.goal);
  const heap = new Heap();
  g[ls] = 0;
  heap.push(heur(ls % w, (ls / w) | 0), ls);
  while (heap.size > 0) {
    const c = heap.pop();
    if (closed[c]) continue;
    closed[c] = 1;
    const cx = c % w;
    const cz = (c - cx) / w;
    const ci = (cz + z0) * n + cx + x0;
    if (isGoal(ci)) {
      const out: number[] = [];
      for (let p = c; p >= 0; p = came[p]) {
        const px = p % w;
        out.push(((p - px) / w + z0) * n + px + x0);
      }
      return out.reverse();
    }
    for (const [dx, dz, dist] of DIRS) {
      const nx = cx + dx;
      const nz = cz + dz;
      if (nx < 0 || nz < 0 || nx >= w || nz >= h) continue;
      const nl = nz * w + nx;
      if (closed[nl]) continue;
      const cost = s.step(ci, (nz + z0) * n + nx + x0, dist);
      if (!(cost < Infinity)) continue;
      const ng = g[c] + cost;
      if (ng < g[nl]) {
        g[nl] = ng;
        came[nl] = c;
        heap.push(ng + heur(nx, nz), nl);
      }
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Path network: grid cells + pinned virtual nodes, merged into one graph.

/** Virtual node keys start here (grid cells are 0 … n²−1). */
export const VIRTUAL_BASE = 1 << 24;

export interface PathNetwork {
  /** Node keys in insertion order (deterministic iteration). */
  keys: number[];
  /** Exact position for pinned / virtual keys. */
  pins: Map<number, XZ>;
  adj: Map<number, { to: number; kind: string }[]>;
  /** Cells on the network (fast goal test). */
  cells: Uint8Array;
  /** Island of each key. */
  island: Map<number, number>;
  nextVirtual: number;
}

export function createNetwork(n: number): PathNetwork {
  return {
    keys: [],
    pins: new Map(),
    adj: new Map(),
    cells: new Uint8Array(n * n),
    island: new Map(),
    nextVirtual: VIRTUAL_BASE,
  };
}

export function addNode(net: PathNetwork, key: number, islandId: number, pin?: XZ): number {
  if (!net.adj.has(key)) {
    net.adj.set(key, []);
    net.keys.push(key);
    net.island.set(key, islandId);
    if (key < VIRTUAL_BASE) net.cells[key] = 1;
  }
  if (pin) net.pins.set(key, { x: pin.x, z: pin.z });
  return key;
}

export function addVirtual(net: PathNetwork, islandId: number, pin: XZ): number {
  const k = net.nextVirtual++;
  return addNode(net, k, islandId, pin);
}

export function addEdge(net: PathNetwork, a: number, b: number, kind: string): void {
  if (a === b) return;
  const la = net.adj.get(a);
  const lb = net.adj.get(b);
  if (!la || !lb) throw new Error('addEdge: unknown node');
  if (la.some((e) => e.to === b)) return;
  la.push({ to: b, kind });
  lb.push({ to: a, kind });
}

/** Add a cell sequence as a chain of edges. */
export function addCellPath(
  net: PathNetwork,
  cells: number[],
  islandId: number,
  kind: string,
): void {
  for (let k = 0; k < cells.length; k++) {
    addNode(net, cells[k], islandId);
    if (k > 0) addEdge(net, cells[k - 1], cells[k], kind);
  }
}

export interface PathCostContext {
  h: Heightfield;
  sdf: Float32Array;
  islandMap: Uint8Array;
  zone: Uint8Array;
  islandId: number;
  /** Per-cell blocking (lot cores, landmark discs); 1 = blocked. */
  blocked: Uint8Array;
  stair: boolean;
  net: PathNetwork;
}

/** Slope-cost step function for footpaths. */
export function pathStep(ctx: PathCostContext): (a: number, b: number, dist: number) => number {
  const { h, sdf, islandMap, zone, blocked, net } = ctx;
  const id = ctx.islandId + 1;
  const maxSlope = ctx.stair ? PATHS.stairMaxSlope : PATHS.maxSlope;
  const quad = ctx.stair ? PATHS.stairQuad : 0;
  return (a, b, dist) => {
    if (islandMap[b] !== id || sdf[b] < PATHS.minShore || blocked[b]) return Infinity;
    const run = dist * h.cellSize;
    const slope = Math.abs(h.data[b] - h.data[a]) / run;
    if (slope > maxSlope) return Infinity;
    let c = run * (1 + PATHS.slopeCost * slope + quad * slope * slope);
    const z = zone[b];
    if (z === Zone.field) c *= 1.6;
    else if (z === Zone.forest) c *= 1.15;
    else if (z === Zone.sandWet) c *= 1.4;
    if (net.cells[b]) c *= PATHS.reuse;
    return c;
  };
}

export function keyXZ(net: PathNetwork, key: number, n: number): XZ {
  const p = net.pins.get(key);
  if (p) return p;
  const x = key % n;
  return { x: cellX(x), z: cellZ((key - x) / n) };
}

// ---------------------------------------------------------------------------
// Network → smoothed polylines + graph.

export interface BuiltPaths {
  paths: Polyline[];
  graph: PathGraph;
  /** Network key → graph node index (junctions / endpoints only). */
  nodeOf: Map<number, number>;
}

/**
 * Split the network into chains between junctions (degree ≠ 2, kind changes),
 * smooth each chain (endpoints fixed), resample at PATHS.step, and emit the
 * graph: junction nodes are shared, interior samples become chain nodes.
 * `valid(x, z)` rejects smoothed samples (water, lot cores) → less smoothing.
 */
export function buildPathGraph(
  net: PathNetwork,
  n: number,
  valid: (x: number, z: number, islandId: number) => boolean,
): BuiltPaths {
  const nodes: number[] = [];
  const edges: number[] = [];
  const nodeOf = new Map<number, number>();
  const paths: Polyline[] = [];
  const nodeFor = (key: number): number => {
    let id = nodeOf.get(key);
    if (id === undefined) {
      const p = keyXZ(net, key, n);
      id = nodes.length / 2;
      nodes.push(p.x, p.z);
      nodeOf.set(key, id);
    }
    return id;
  };
  const visited = new Set<string>();
  const ek = (a: number, b: number): string => (a < b ? `${a}:${b}` : `${b}:${a}`);
  const isJunction = (key: number): boolean => {
    const l = net.adj.get(key) as { to: number; kind: string }[];
    if (l.length !== 2) return true;
    return l[0].kind !== l[1].kind || net.pins.has(key);
  };

  const emitChain = (chain: number[], kind: string): void => {
    const islandId = net.island.get(chain[0]) ?? -1;
    const raw = chain.map((k) => keyXZ(net, k, n));
    const pts = smoothChain(raw, kind, (x, z) => valid(x, z, islandId));
    const a = nodeFor(chain[0]);
    const b = nodeFor(chain[chain.length - 1]);
    let prev = a;
    for (let i = 1; i < pts.length - 1; i++) {
      const id = nodes.length / 2;
      nodes.push(pts[i].x, pts[i].z);
      edges.push(prev, id);
      prev = id;
    }
    edges.push(prev, b);
    pts[0] = keyXZ(net, chain[0], n);
    pts[pts.length - 1] = keyXZ(net, chain[chain.length - 1], n);
    paths.push({ islandId, kind, closed: false, points: pts });
  };

  const walk = (start: number, first: { to: number; kind: string }): void => {
    const chain = [start];
    let prev = start;
    let cur = first.to;
    visited.add(ek(start, cur));
    chain.push(cur);
    while (!isJunction(cur) && cur !== start) {
      const l = net.adj.get(cur) as { to: number; kind: string }[];
      const next = l[0].to === prev ? l[1] : l[0];
      if (visited.has(ek(cur, next.to))) break;
      visited.add(ek(cur, next.to));
      prev = cur;
      cur = next.to;
      chain.push(cur);
    }
    emitChain(chain, first.kind);
  };

  for (const key of net.keys) {
    if (!isJunction(key)) continue;
    nodeFor(key);
    for (const e of net.adj.get(key) as { to: number; kind: string }[]) {
      if (visited.has(ek(key, e.to))) continue;
      walk(key, e);
    }
  }
  // pure cycles (no junction) — rare
  for (const key of net.keys) {
    for (const e of net.adj.get(key) as { to: number; kind: string }[]) {
      if (visited.has(ek(key, e.to))) continue;
      nodeFor(key);
      walk(key, e);
    }
  }
  if (nodes.length / 2 > 65535) throw new Error('path graph too large for Uint16 edges');
  return {
    paths,
    graph: { nodes: Float32Array.from(nodes), edges: Uint16Array.from(edges) },
    nodeOf,
  };
}

/** Resample a polyline at a fixed arc-length step (endpoints kept). */
export function resample(pts: XZ[], step: number, closed: boolean): XZ[] {
  if (pts.length < 2) return pts.slice();
  const ring = closed ? [...pts, pts[0]] : pts;
  let total = 0;
  for (let i = 1; i < ring.length; i++)
    total += Math.hypot(ring[i].x - ring[i - 1].x, ring[i].z - ring[i - 1].z);
  const count = Math.max(1, Math.round(total / step));
  const ds = total / count;
  const out: XZ[] = [{ x: ring[0].x, z: ring[0].z }];
  let seg = 1;
  let acc = 0;
  let segLen = Math.hypot(ring[1].x - ring[0].x, ring[1].z - ring[0].z);
  for (let k = 1; k < count; k++) {
    const target = k * ds;
    while (acc + segLen < target && seg < ring.length - 1) {
      acc += segLen;
      seg++;
      segLen = Math.hypot(ring[seg].x - ring[seg - 1].x, ring[seg].z - ring[seg - 1].z);
    }
    const t = segLen > 0 ? (target - acc) / segLen : 0;
    const a = ring[seg - 1];
    const b = ring[seg];
    out.push({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t });
  }
  if (!closed) out.push({ x: ring[ring.length - 1].x, z: ring[ring.length - 1].z });
  return out;
}

const toV = (p: XZ): Vec2 => ({ x: p.x, y: p.z });
const fromV = (p: Vec2): XZ => ({ x: p.x, z: p.y });

/**
 * Decimate (every `stride` cells) → Catmull-Rom → resample; if any sample
 * fails `valid`, retry with a smaller stride (stride 1 = through every cell,
 * then the raw polyline).
 */
function smoothChain(raw: XZ[], kind: string, valid: (x: number, z: number) => boolean): XZ[] {
  if (raw.length <= 2 || kind === 'boardwalk') return resample(raw, PATHS.step, false);
  for (const stride of [3, 2, 1]) {
    const ctrl: XZ[] = [];
    for (let i = 0; i < raw.length; i += stride) ctrl.push(raw[i]);
    if (ctrl[ctrl.length - 1] !== raw[raw.length - 1]) ctrl.push(raw[raw.length - 1]);
    const sm = smoothPolyline(ctrl.map(toV), PATHS.smooth, false).map(fromV);
    const pts = resample(sm, PATHS.step, false);
    if (pts.every((p) => valid(p.x, p.z))) return pts;
  }
  return resample(raw, PATHS.step, false);
}

// ---------------------------------------------------------------------------
// Write-back: Zone.path within PATHS.halfWidth, slight carve.

/** Visit every grid sample within `r` of segment a→b. */
export function forSamplesNearSegment(
  h: Heightfield,
  a: XZ,
  b: XZ,
  r: number,
  fn: (i: number, d: number) => void,
): void {
  const n = h.n;
  const cs = h.cellSize;
  const ix0 = Math.max(0, Math.floor((Math.min(a.x, b.x) - r - h.originX) / cs));
  const ix1 = Math.min(n - 1, Math.ceil((Math.max(a.x, b.x) + r - h.originX) / cs));
  const iz0 = Math.max(0, Math.floor((Math.min(a.z, b.z) - r - h.originZ) / cs));
  const iz1 = Math.min(n - 1, Math.ceil((Math.max(a.z, b.z) + r - h.originZ) / cs));
  const vx = b.x - a.x;
  const vz = b.z - a.z;
  const len2 = vx * vx + vz * vz;
  for (let iz = iz0; iz <= iz1; iz++)
    for (let ix = ix0; ix <= ix1; ix++) {
      const x = h.originX + ix * cs;
      const z = h.originZ + iz * cs;
      const t = len2 > 0 ? Math.max(0, Math.min(1, ((x - a.x) * vx + (z - a.z) * vz) / len2)) : 0;
      const d = Math.hypot(x - a.x - vx * t, z - a.z - vz * t);
      if (d <= r) fn(iz * n + ix, d);
    }
}

/**
 * Zone.path on land samples within PATHS.halfWidth of every footpath (not the
 * plaza, not boardwalks) and a PATHS.carve depression, skipping `protect`ed
 * samples (flattened pad cores). Land never drops below min(h, 0.3).
 */
export function writePaths(
  h: Heightfield,
  zone: Uint8Array,
  sdf: Float32Array,
  paths: Polyline[],
  protect: Uint8Array,
): void {
  const mark = new Uint8Array(h.n * h.n);
  for (const p of paths) {
    if (p.kind === 'boardwalk') continue;
    for (let k = 0; k + 1 < p.points.length; k++)
      forSamplesNearSegment(h, p.points[k], p.points[k + 1], PATHS.halfWidth + 1e-3, (i) => {
        if (sdf[i] > 0 && h.data[i] > 0) mark[i] = 1;
      });
  }
  for (let i = 0; i < mark.length; i++) {
    if (!mark[i]) continue;
    if (zone[i] !== Zone.plaza) zone[i] = Zone.path;
    if (protect[i]) continue;
    const y = h.data[i];
    h.data[i] = Math.max(y - PATHS.carve, Math.min(y, 0.3));
  }
}
