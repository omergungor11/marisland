/**
 * Courier voyage routes and the ship's speed profile (M51, TASK-621, D-164). Pure: no three, no
 * clock, so a snapshot / capture agrees with a live run.
 *
 * - `berthOf(world, theme)`: where an island's courier is moored (out past its pier head, bow out).
 * - `voyageRoute(world, from, to)`: along the HQ ferry loop when both berths are stops of one
 *   ferry `Route` (shortest direction; land-safe for free), else a cubic Bezier from berth A out
 *   along its pier heading to berth B in against its pier heading, the control points pushed
 *   seaward in `u` steps until every sample is over water; when an island is in the way of every
 *   Bezier, a grid A* over open water (string-pulled, smoothed) between the two pier leads.
 * - `voyageProfile(total)` / `voyageDist(profile, t)`: accelerate / cruise / brake in closed form
 *   (the ferry timetable's shape), duration clamped to `COURIER.voyageS`.
 * Numbers: `COURIER` in content/fleet-ships.ts.
 */
import { COURIER } from '../content/fleet-ships.ts';
import { arcLengths, smoothPolyline, type Vec2 } from '../core/math/catmull-rom.ts';
import { heightAt, type ThemeId, type WorldData } from '../world/types.ts';

export type CourierWorld = Pick<WorldData, 'islands' | 'docks' | 'boatRoutes' | 'height'>;

export interface Berth {
  x: number;
  z: number;
  /** Pier heading (out to sea), radians, (cos, sin) convention. */
  rotY: number;
  /** The pier head: where crates land. */
  head: Vec2;
  dock: number;
}

export interface VoyageRoute {
  pts: Vec2[];
  lens: Float32Array;
  total: number;
  /** 'ferry' = along the HQ loop, 'bezier' = free curve. */
  kind: 'ferry' | 'bezier' | 'path';
}

const islandOf = (world: CourierWorld, theme: ThemeId) =>
  world.islands.find((i) => i.theme === theme);

/** The island's courier dock: a stop of a ferry line when it has one, else its first dock. */
function dockOf(world: CourierWorld, islandId: number): number {
  for (const r of world.boatRoutes) {
    if (r.kind !== 'ferry') continue;
    for (const di of r.stops ?? []) if (world.docks[di]?.islandId === islandId) return di;
  }
  return world.docks.findIndex((d) => d.islandId === islandId);
}

export function berthOf(world: CourierWorld, theme: ThemeId): Berth | null {
  const isl = islandOf(world, theme);
  if (!isl) return null;
  const di = dockOf(world, isl.id);
  const d = world.docks[di];
  if (!d) return null;
  const hx = Math.cos(d.rotY);
  const hz = Math.sin(d.rotY);
  const reach = d.segments * 2;
  const head = { x: d.x + hx * reach, y: d.z + hz * reach };
  const M = COURIER.moor;
  return {
    x: head.x + hx * M.out - hz * M.side,
    z: head.y + hz * M.out + hx * M.side,
    rotY: d.rotY,
    head,
    dock: di,
  };
}

const wet = (world: CourierWorld, x: number, z: number): boolean =>
  heightAt(world.height, x, z) <= -COURIER.route.depth;

/** Samples of the polyline that stand on land (the first / last `slack` u exempt). */
export function landSamples(
  world: CourierWorld,
  pts: readonly Vec2[],
  lens: ArrayLike<number>,
): number {
  const total = lens[lens.length - 1];
  const slack = COURIER.route.slack;
  let bad = 0;
  for (let i = 0; i < pts.length; i++) {
    if (lens[i] < slack || total - lens[i] < slack) continue;
    if (!wet(world, pts[i].x, pts[i].y)) bad++;
  }
  return bad;
}

function make(pts: Vec2[], kind: VoyageRoute['kind']): VoyageRoute {
  const lens = arcLengths(pts, false);
  return { pts, lens, total: lens[lens.length - 1], kind };
}

/** The ferry line that stops at both islands, if any. */
function sharedFerry(world: CourierWorld, a: number, b: number) {
  for (const r of world.boatRoutes) {
    if (r.kind !== 'ferry' || r.points.length < 4) continue;
    const ids = (r.stops ?? []).map((di) => world.docks[di]?.islandId);
    if (ids.includes(a) && ids.includes(b)) return r;
  }
  return null;
}

function viaFerry(from: Berth, to: Berth, loop: Vec2[]): VoyageRoute {
  const smooth = smoothPolyline(loop, 4, true);
  const lens = arcLengths(smooth, true);
  const total = lens[lens.length - 1];
  const nearest = (p: Vec2): number => {
    let best = 0;
    let bd = Infinity;
    smooth.forEach((q, i) => {
      const d = Math.hypot(q.x - p.x, q.y - p.y);
      if (d < bd) {
        bd = d;
        best = i;
      }
    });
    return best;
  };
  const iA = nearest({ x: from.x, y: from.z });
  const iB = nearest({ x: to.x, y: to.z });
  const fwd = (((lens[iB] - lens[iA]) % total) + total) % total;
  const dir = fwd <= total - fwd ? 1 : -1;
  const pts: Vec2[] = [{ x: from.x, y: from.z }];
  const n = smooth.length;
  const step = COURIER.route.loopStep;
  let last = pts[0];
  for (let i = iA; ; i = (i + dir + n) % n) {
    const p = smooth[i];
    if (i === iB || Math.hypot(p.x - last.x, p.y - last.y) >= step) {
      pts.push(p);
      last = p;
    }
    if (i === iB) break;
  }
  pts.push({ x: to.x, y: to.z });
  return make(pts, 'ferry');
}

/** Cubic Bezier berth A -> out -> in -> berth B, sampled every `route.sample` u. */
function bezier(world: CourierWorld, a: Berth, b: Berth): VoyageRoute {
  const R = COURIER.route;
  const ha = { x: Math.cos(a.rotY), y: Math.sin(a.rotY) };
  const hb = { x: Math.cos(b.rotY), y: Math.sin(b.rotY) };
  let best: VoyageRoute | null = null;
  let bestBad = Infinity;
  for (let u = R.uStart; u <= R.uMax + 1e-6; u += R.uStep) {
    const p0 = { x: a.x, y: a.z };
    const p1 = { x: a.x + ha.x * u, y: a.z + ha.y * u };
    const p2 = { x: b.x + hb.x * u, y: b.z + hb.y * u };
    const p3 = { x: b.x, y: b.z };
    const rough = Math.hypot(p3.x - p0.x, p3.y - p0.y) + u * 2;
    const n = Math.max(8, Math.ceil(rough / R.sample));
    const pts: Vec2[] = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const m = 1 - t;
      const c0 = m * m * m;
      const c1 = 3 * m * m * t;
      const c2 = 3 * m * t * t;
      const c3 = t * t * t;
      pts.push({
        x: c0 * p0.x + c1 * p1.x + c2 * p2.x + c3 * p3.x,
        y: c0 * p0.y + c1 * p1.y + c2 * p2.y + c3 * p3.y,
      });
    }
    const r = make(pts, 'bezier');
    const bad = landSamples(world, r.pts, r.lens);
    if (bad === 0) return r;
    if (bad < bestBad) {
      bestBad = bad;
      best = r;
    }
  }
  return best as VoyageRoute;
}

/** Grid A* over water between the leads of both berths, string-pulled, then smoothed if it stays wet. */
function seaPath(world: CourierWorld, a: Berth, b: Berth): VoyageRoute | null {
  const R = COURIER.route;
  const ha = { x: Math.cos(a.rotY), y: Math.sin(a.rotY) };
  const hb = { x: Math.cos(b.rotY), y: Math.sin(b.rotY) };
  const s0 = { x: a.x + ha.x * R.uStart, y: a.z + ha.y * R.uStart };
  const g0 = { x: b.x + hb.x * R.uStart, y: b.z + hb.y * R.uStart };
  const cell = R.gridCell;
  const margin = R.gridMargin;
  const minX = Math.min(s0.x, g0.x) - margin;
  const minZ = Math.min(s0.y, g0.y) - margin;
  const w = Math.ceil((Math.max(s0.x, g0.x) + margin - minX) / cell) + 1;
  const h = Math.ceil((Math.max(s0.y, g0.y) + margin - minZ) / cell) + 1;
  const open = new Uint8Array(w * h);
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++)
      open[j * w + i] =
        heightAt(world.height, minX + i * cell, minZ + j * cell) <= -R.pathDepth ? 1 : 0;
  const cellOf = (p: Vec2): number => {
    // nearest open cell to a lead point
    const ci = Math.round((p.x - minX) / cell);
    const cj = Math.round((p.y - minZ) / cell);
    for (let r = 0; r < 6; r++)
      for (let dj = -r; dj <= r; dj++)
        for (let di = -r; di <= r; di++) {
          const i = ci + di;
          const j = cj + dj;
          if (i >= 0 && j >= 0 && i < w && j < h && open[j * w + i]) return j * w + i;
        }
    return -1;
  };
  const start = cellOf(s0);
  const goal = cellOf(g0);
  if (start < 0 || goal < 0) return null;
  const gScore = new Float32Array(w * h).fill(Infinity);
  const from = new Int32Array(w * h).fill(-1);
  const heap: number[] = [];
  const f = new Float32Array(w * h);
  const gi = goal % w;
  const gj = (goal / w) | 0;
  const hfn = (n: number): number => Math.hypot((n % w) - gi, ((n / w) | 0) - gj);
  const push = (n: number): void => {
    heap.push(n);
    let k = heap.length - 1;
    while (k > 0) {
      const par = (k - 1) >> 1;
      if (f[heap[par]] <= f[heap[k]]) break;
      [heap[par], heap[k]] = [heap[k], heap[par]];
      k = par;
    }
  };
  const pop = (): number => {
    const top = heap[0];
    const last = heap.pop() as number;
    if (heap.length > 0) {
      heap[0] = last;
      let k = 0;
      for (;;) {
        const l = 2 * k + 1;
        const r = l + 1;
        let m = k;
        if (l < heap.length && f[heap[l]] < f[heap[m]]) m = l;
        if (r < heap.length && f[heap[r]] < f[heap[m]]) m = r;
        if (m === k) break;
        [heap[m], heap[k]] = [heap[k], heap[m]];
        k = m;
      }
    }
    return top;
  };
  gScore[start] = 0;
  f[start] = hfn(start);
  push(start);
  const closed = new Uint8Array(w * h);
  while (heap.length > 0) {
    const n = pop();
    if (closed[n]) continue;
    closed[n] = 1;
    if (n === goal) break;
    const ni = n % w;
    const nj = (n / w) | 0;
    for (let dj = -1; dj <= 1; dj++)
      for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const i = ni + di;
        const j = nj + dj;
        if (i < 0 || j < 0 || i >= w || j >= h) continue;
        const m = j * w + i;
        if (!open[m] || closed[m]) continue;
        if (di && dj && (!open[nj * w + i] || !open[j * w + ni])) continue;
        const g = gScore[n] + (di && dj ? Math.SQRT2 : 1);
        if (g < gScore[m]) {
          gScore[m] = g;
          from[m] = n;
          f[m] = g + hfn(m);
          push(m);
        }
      }
  }
  if (from[goal] < 0 && start !== goal) return null;
  const cells: Vec2[] = [];
  for (let n = goal; n >= 0; n = from[n])
    cells.push({ x: minX + (n % w) * cell, y: minZ + ((n / w) | 0) * cell });
  cells.reverse();
  // string-pull: keep a corner only when the straight line to the next one crosses land
  const clear = (p: Vec2, q: Vec2): boolean => {
    const n = Math.ceil(Math.hypot(q.x - p.x, q.y - p.y) / (R.sample * 0.5));
    for (let k = 0; k <= n; k++)
      if (!wet(world, p.x + ((q.x - p.x) * k) / n, p.y + ((q.y - p.y) * k) / n)) return false;
    return true;
  };
  const way: Vec2[] = [{ x: a.x, y: a.z }, s0];
  let anchor = 0;
  for (let k = 1; k < cells.length; k++) {
    if (k === cells.length - 1 || !clear(cells[anchor], cells[k + 1])) {
      if (k !== anchor) way.push(cells[k]);
      anchor = k;
    }
  }
  way.push(g0, { x: b.x, y: b.z });
  const dense = (pts: Vec2[]): Vec2[] => {
    const out: Vec2[] = [pts[0]];
    for (let k = 1; k < pts.length; k++) {
      const p = pts[k - 1];
      const q = pts[k];
      const n = Math.max(1, Math.ceil(Math.hypot(q.x - p.x, q.y - p.y) / R.sample));
      for (let i = 1; i <= n; i++)
        out.push({ x: p.x + ((q.x - p.x) * i) / n, y: p.y + ((q.y - p.y) * i) / n });
    }
    return out;
  };
  const smooth = dense(smoothPolyline(way, 6, false));
  const sm = make(smooth, 'path');
  if (landSamples(world, sm.pts, sm.lens) === 0) return sm;
  return make(dense(way), 'path');
}

export function voyageRoute(
  world: CourierWorld,
  fromIsland: ThemeId,
  toIsland: ThemeId,
): VoyageRoute | null {
  if (fromIsland === toIsland) return null;
  const a = berthOf(world, fromIsland);
  const b = berthOf(world, toIsland);
  const ia = islandOf(world, fromIsland);
  const ib = islandOf(world, toIsland);
  if (!a || !b || !ia || !ib) return null;
  const line = sharedFerry(world, ia.id, ib.id);
  if (line) {
    const r = viaFerry(
      a,
      b,
      line.points.map((p) => ({ x: p.x, y: p.z })),
    );
    if (landSamples(world, r.pts, r.lens) === 0) return r;
  }
  const free = bezier(world, a, b);
  if (landSamples(world, free.pts, free.lens) === 0) return free;
  return seaPath(world, a, b) ?? free;
}

// ---- speed profile ------------------------------------------------------------------------------

export interface VoyageProfile {
  total: number;
  /** Duration, s (clamped to `COURIER.voyageS`). */
  dur: number;
  /** Cruise speed, ramp-up and ramp-down times. */
  v: number;
  ta: number;
  td: number;
}

export function voyageProfile(total: number): VoyageProfile {
  const C = COURIER;
  const natural = total / C.speed + (C.speed / C.accel + C.speed / C.decel) / 2;
  const dur = Math.min(Math.max(natural, C.voyageS[0]), C.voyageS[1]);
  const ta = Math.min(C.speed / C.accel, dur * 0.3);
  const td = Math.min(C.speed / C.decel, dur * 0.35);
  return { total, dur, v: total / (dur - (ta + td) / 2), ta, td };
}

/** Distance travelled `t` s after cast-off (0 .. total, monotone). */
export function voyageDist(p: VoyageProfile, t: number): number {
  if (t <= 0) return 0;
  if (t >= p.dur) return p.total;
  if (t < p.ta) return 0.5 * (p.v / p.ta) * t * t;
  if (t > p.dur - p.td) {
    const r = p.dur - t;
    return p.total - 0.5 * (p.v / p.td) * r * r;
  }
  return (p.v * p.ta) / 2 + p.v * (t - p.ta);
}
