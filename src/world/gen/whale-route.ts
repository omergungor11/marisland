import { createRng } from '../../core/rng.ts';
import { WHALE } from '../../content/whale.ts';
import { CULTURE_CLOCK } from '../../content/cultures/rhythm.ts';
import type { Heightfield, Polyline } from '../types.ts';
import type { ReefData } from '../types.ts';
import { openSeaAt } from './reefs.ts';

/**
 * The whale's loop and schedule (M23 TASK-489, `W:D6`): pure data, no three.js. The route is a
 * closed polyline round the archipelago through open sea (`openSeaAt`: deep, off the reefs, ≥ 20 u
 * from every boat / ferry route). The whale does one lap per game day; it surfaces `schedule.count`
 * times a day (gaps 90–150 s, seeded), the first at `capeHour` off the Research cape. Everything is
 * a function of the culture-clock day seconds and the seed, so a capture replays it exactly.
 */

const SPH = CULTURE_CLOCK.secondsPerHour;
const DAY = 24 * SPH;
const TAU = Math.PI * 2;

/** What the planner reads from a world. */
export interface WhaleWorld {
  height: Heightfield;
  reefs: readonly ReefData[];
  boatRoutes: readonly Polyline[];
  islands: readonly {
    cx: number;
    cz: number;
    reach: number;
    theme: string;
    anchors?: Record<string, { x: number; z: number }>;
  }[];
}

export interface WhaleRoute {
  /** Closed polyline, x z pairs, in travel direction. */
  pts: Float32Array;
  /** Cumulative arclength at each point (cum[0] = 0), `n + 1` entries (the last = length). */
  cum: Float32Array;
  length: number;
  /** Arclength of the loop point nearest the cape island. */
  capeS: number;
  /** The island the whale passes at the cape hour (Research, else the last island). */
  cape: { x: number; z: number; reach: number };
}

const mod = (a: number, n: number): number => ((a % n) + n) % n;

/** Plan the loop; null when the world has no usable open-sea ring. */
export function planWhaleRoute(world: WhaleWorld, seed: number): WhaleRoute | null {
  const R = WHALE.route;
  if (world.islands.length === 0) return null;
  const rng = createRng(seed).fork('whale-route');
  let cx = 0;
  let cz = 0;
  for (const i of world.islands) {
    cx += i.cx;
    cz += i.cz;
  }
  cx /= world.islands.length;
  cz /= world.islands.length;
  const open = (x: number, z: number): boolean => openSeaAt(world, x, z, R.open);
  const a0 = rng.range(0, TAU);
  // outermost obstacle per angle, then the pad
  const r = new Float64Array(R.angles);
  for (let i = 0; i < R.angles; i++) {
    const th = a0 + (i / R.angles) * TAU;
    const dx = Math.cos(th);
    const dz = Math.sin(th);
    let rr = R.maxR;
    while (rr > 0 && open(cx + dx * rr, cz + dz * rr)) rr -= R.scan;
    r[i] = Math.min(R.maxR, Math.max(0, rr) + R.pad);
  }
  // dilate (never cut a corner into an island) then box-smooth
  const dil = new Float64Array(R.angles);
  for (let i = 0; i < R.angles; i++) {
    let m = 0;
    for (let k = -R.smooth; k <= R.smooth; k++) m = Math.max(m, r[mod(i + k, R.angles)]);
    dil[i] = m;
  }
  for (let i = 0; i < R.angles; i++) {
    let s = 0;
    for (let k = -R.smooth; k <= R.smooth; k++) s += dil[mod(i + k, R.angles)];
    r[i] = s / (2 * R.smooth + 1);
  }
  const radiusAt = (f: number): number => {
    // periodic Catmull-Rom through r at fractional index f
    const i = Math.floor(f);
    const t = f - i;
    const p0 = r[mod(i - 1, R.angles)];
    const p1 = r[mod(i, R.angles)];
    const p2 = r[mod(i + 1, R.angles)];
    const p3 = r[mod(i + 2, R.angles)];
    return (
      0.5 *
      (2 * p1 +
        (p2 - p0) * t +
        (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t +
        (3 * p1 - p0 - 3 * p2 + p3) * t * t * t)
    );
  };
  const point = (f: number): [number, number] => {
    const th = a0 + (f / R.angles) * TAU;
    const rr = radiusAt(f);
    return [cx + Math.cos(th) * rr, cz + Math.sin(th) * rr];
  };
  // validate every `step` u along the polyline; push the angle samples around a failure outward
  const sub = 8;
  for (let iter = 0; iter < 40; iter++) {
    let bad = -1;
    let prev = point(0);
    for (let k = 1; k <= R.angles * sub && bad < 0; k++) {
      const cur = point(k / sub);
      const n = Math.max(1, Math.ceil(Math.hypot(cur[0] - prev[0], cur[1] - prev[1]) / R.step));
      for (let j = 1; j <= n; j++) {
        const x = prev[0] + ((cur[0] - prev[0]) * j) / n;
        const z = prev[1] + ((cur[1] - prev[1]) * j) / n;
        if (!open(x, z)) {
          bad = Math.floor((k - 0.5) / sub);
          break;
        }
      }
      prev = cur;
    }
    // TASK-511: then the emitted polyline (R.points chords) at 1 u: a chord can dip under the
    // depth floor between the spline samples
    prev = point(0);
    for (let k = 1; k <= R.points && bad < 0; k++) {
      const f = (k / R.points) * R.angles;
      const cur = point(f);
      const n = Math.max(1, Math.ceil(Math.hypot(cur[0] - prev[0], cur[1] - prev[1])));
      for (let j = 1; j <= n; j++) {
        const x = prev[0] + ((cur[0] - prev[0]) * j) / n;
        const z = prev[1] + ((cur[1] - prev[1]) * j) / n;
        if (!open(x, z)) {
          bad = Math.floor(f - (0.5 * R.angles) / R.points) % R.angles;
          break;
        }
      }
      prev = cur;
    }
    if (bad < 0) break;
    if (iter === 39) return null;
    for (let k = -1; k <= 2; k++) {
      const i = mod(bad + k, R.angles);
      r[i] = Math.min(R.maxR, r[i] + 8);
    }
  }
  // polyline, direction by seed
  const n = R.points;
  const pts = new Float32Array(n * 2);
  const dir = rng.chance(0.5) ? 1 : -1;
  for (let i = 0; i < n; i++) {
    const p = point((mod(dir * i, n) / n) * R.angles);
    pts[i * 2] = p[0];
    pts[i * 2 + 1] = p[1];
  }
  const cum = new Float32Array(n + 1);
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    cum[i + 1] = cum[i] + Math.hypot(pts[j * 2] - pts[i * 2], pts[j * 2 + 1] - pts[i * 2 + 1]);
  }
  const capeIsland =
    world.islands.find((i) => i.theme === 'research') ?? world.islands[world.islands.length - 1];
  // the cape: the island's headland anchor (Research's launch headland), else its centre
  const hl = capeIsland.anchors?.headland;
  const hd = hl ? Math.hypot(hl.x - capeIsland.cx, hl.z - capeIsland.cz) || 1 : 1;
  const tip = hl
    ? {
        x: hl.x + ((hl.x - capeIsland.cx) / hd) * R.capeOffset,
        z: hl.z + ((hl.z - capeIsland.cz) / hd) * R.capeOffset,
      }
    : { x: capeIsland.cx, z: capeIsland.cz };
  let best = 0;
  let bd = Infinity;
  for (let i = 0; i < n; i++) {
    const d = Math.hypot(pts[i * 2] - tip.x, pts[i * 2 + 1] - tip.z);
    if (d < bd) {
      bd = d;
      best = i;
    }
  }
  return {
    pts,
    cum,
    length: cum[n],
    capeS: cum[best],
    cape: { x: tip.x, z: tip.z, reach: capeIsland.reach },
  };
}

/** Position and unit heading on the loop at arclength `s` (wraps). */
export function routeAt(
  route: WhaleRoute,
  s: number,
  out: { x: number; z: number; hx: number; hz: number },
): void {
  const n = route.pts.length / 2;
  const L = route.length;
  const at = (q: number, o: { x: number; z: number }): void => {
    const t = mod(q, L);
    let lo = 0;
    let hi = n;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (route.cum[mid] <= t) lo = mid;
      else hi = mid;
    }
    const j = (lo + 1) % n;
    const f = (t - route.cum[lo]) / Math.max(1e-6, route.cum[lo + 1] - route.cum[lo]);
    o.x = route.pts[lo * 2] + (route.pts[j * 2] - route.pts[lo * 2]) * f;
    o.z = route.pts[lo * 2 + 1] + (route.pts[j * 2 + 1] - route.pts[lo * 2 + 1]) * f;
  };
  const a = { x: 0, z: 0 };
  const b = { x: 0, z: 0 };
  at(s - 7, a);
  at(s + 7, b);
  const hx = b.x - a.x;
  const hz = b.z - a.z;
  const hl = Math.hypot(hx, hz) || 1;
  at(s, out);
  out.hx = hx / hl;
  out.hz = hz / hl;
}

/* --------------------------------------- schedule --------------------------------------- */

export interface WhaleEvent {
  /** Day second the event starts (u = 0), 0 … DAY. */
  t: number;
  /** Loop arclength the whale is at when the event starts. */
  s: number;
}

/** Event start seconds of one day: the first at the cape hour, gaps 120 ± jitter (sum = the day). */
export function whaleTimes(seed: number): number[] {
  const S = WHALE.schedule;
  const rng = createRng(seed).fork('whale-schedule');
  const raw = Array.from({ length: S.count }, () => rng.next());
  const mean = raw.reduce((a, b) => a + b, 0) / S.count;
  const dev = raw.map((x) => (x - mean) * 2 * S.gapJitter);
  const big = Math.max(...dev.map(Math.abs), 1e-9);
  const k = Math.min(1, S.gapJitter / big);
  // zero-mean deviations keep the sum, so gaps are exactly `gap` on average and span the day
  const gaps = dev.map((d) => S.gap + d * k);
  const first = WHALE.capeHour * SPH - EVENT_MID_OFFSET_S;
  const out: number[] = [];
  let t = first;
  for (let i = 0; i < S.count; i++) {
    out.push(mod(t, DAY));
    t += gaps[i];
  }
  return out;
}

/** Event seconds into the surfacing at which the whale is "off the cape" (back up, spouting). */
export const EVENT_MID_OFFSET_S = 8;

/** The day's events with their loop positions (one lap per day, the cape pass pinned). */
export function whaleEvents(route: WhaleRoute, seed: number): WhaleEvent[] {
  const times = whaleTimes(seed);
  const t0 = times[0];
  return times.map((t) => {
    const lap = mod(t - t0, DAY) / DAY;
    return {
      t,
      s: mod(
        route.capeS - WHALE.event.glide * EVENT_MID_OFFSET_S + lap * route.length,
        route.length,
      ),
    };
  });
}

/** The running event at day second `day` (event seconds `u` from -lead to `end`), or null. */
export function whaleEventAt(
  events: readonly WhaleEvent[],
  day: number,
  lead = 0.5,
): { index: number; u: number } | null {
  for (let i = 0; i < events.length; i++) {
    const u = mod(day - events[i].t + lead, DAY) - lead;
    if (u <= WHALE.event.end) return { index: i, u };
  }
  return null;
}
