/**
 * Beacon Rock cable car loop (TASK-518, D-097): pure closed forms of the M1 gondolas on the
 * TASK-516 line. The loop runs out on track 0 (the summit station's local +x side) from the
 * summit terminal over the mid pylons to the far terminal, round its bullwheel behind the tower,
 * back on track 1 and round the summit bullwheel. A gondola's place on the loop is a function of
 * the sim time only (a table of arc length → time, built once): it slows into every pylon sheave
 * and terminal, rounds the wheels at `wheelSpeed`, dwells at each terminal's landing (the end of
 * the wheel turn) and runs `speed` between. Gondolas ride the same table `period / count` apart
 * in time, so they never meet. Seats: world/gen/plans/marketing-anchors.ts (`beaconTracks`).
 */
import { MARKETING_ANCHORS as A } from '../content/themes/marketing-anchors.ts';
import { MARKETING_M27_MOTION as M } from '../content/themes/marketing-m27-site.ts';
import { beaconTracks, cablePoint, type P3 } from './gen/plans/marketing-anchors.ts';
import type { IslandData } from './types.ts';

const G = M.gondola;

type Piece =
  | { kind: 'span'; a: P3; b: P3; len: number }
  | { kind: 'wheel'; c: P3; r: number; a0: number; sweep: number; len: number };

export interface CableLoop {
  islandId: number;
  pieces: Piece[];
  /** Arc length at the start of every piece (horizontal for spans, the arc for wheels). */
  start: number[];
  length: number;
  /** Loop time table: t[i] = time at arc i × `ds` (dwells included at their arc). */
  ds: number;
  t: Float64Array;
  period: number;
  /** Arcs of the corners (mid pylon sheaves) and terminal ends, for the heading blend. */
  corners: { s: number; hIn: number; hOut: number }[];
}

export interface GondolaPose {
  /** Grip on the cable (world). */
  x: number;
  y: number;
  z: number;
  /** Heading of travel, xz (cos, sin); render yaw = π/2 − heading. */
  heading: number;
  /** Signed speed factor 0..1 and its change (for the braking kick). */
  v: number;
  dv: number;
}

const ang = (x: number, z: number): number => Math.atan2(z, x);
const smooth = (t: number): number => {
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
};
const lerpAng = (a: number, b: number, t: number): number => {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
};

/** The loop of an island's cable line (null: no line). */
export function cableLoop(isl: IslandData): CableLoop | null {
  const [t0, t1] = beaconTracks(isl);
  const n = t0.length;
  if (n < 2) return null;
  const pieces: Piece[] = [];
  const span = (a: P3, b: P3): void => {
    pieces.push({ kind: 'span', a, b, len: Math.hypot(b.x - a.x, b.z - a.z) });
  };
  /** Half turn round terminal k from `a` (on the rim) through its back (local −z). */
  const wheel = (k: number, a: P3): void => {
    const an = isl.anchors[`cable${k}`];
    const c = { x: an.x, y: a.y, z: an.z };
    const a0 = ang(a.x - c.x, a.z - c.z);
    const back = ang(-Math.cos(an.rotY), -Math.sin(an.rotY));
    // the half turn whose midpoint (a0 ± π/2) is the back
    const sweep = Math.cos(a0 + Math.PI / 2 - back) >= 0 ? Math.PI : -Math.PI;
    pieces.push({ kind: 'wheel', c, r: A.cable.track, a0, sweep, len: Math.PI * A.cable.track });
  };
  for (let k = 0; k + 1 < n; k++) span(t0[k], t0[k + 1]);
  wheel(n - 1, t0[n - 1]);
  for (let k = n - 1; k > 0; k--) span(t1[k], t1[k - 1]);
  wheel(0, t1[0]);
  const start: number[] = [];
  let length = 0;
  for (const p of pieces) {
    start.push(length);
    length += p.len;
  }
  // corners: every span end at a pylon (sheave) and every terminal end of a span
  const corners: CableLoop['corners'] = [];
  const hOf = (p: Piece, atEnd: boolean): number => {
    if (p.kind === 'span') return ang(p.b.x - p.a.x, p.b.z - p.a.z);
    const th = p.a0 + (atEnd ? p.sweep : 0);
    return th + (p.sweep > 0 ? Math.PI / 2 : -Math.PI / 2);
  };
  pieces.forEach((p, i) => {
    const q = pieces[(i + 1) % pieces.length];
    corners.push({ s: start[i] + p.len, hIn: hOf(p, true), hOut: hOf(q, false) });
  });
  // time table: speed from the distance to the nearest stop (sheave / terminal), wheels slow
  const ds = 0.05;
  const steps = Math.ceil(length / ds);
  const t = new Float64Array(steps + 1);
  const stops = corners.map((c) => c.s);
  // the landings: the end of each wheel turn
  const landings: number[] = [];
  pieces.forEach((p, i) => {
    if (p.kind === 'wheel') landings.push(start[i] + p.len);
  });
  let pi = 0;
  for (let i = 1; i <= steps; i++) {
    const s = Math.min(length, (i - 0.5) * ds);
    while (pi + 1 < pieces.length && start[pi + 1] <= s) pi++;
    let v: number;
    if (pieces[pi].kind === 'wheel') v = G.wheelSpeed;
    else {
      let d = Infinity;
      for (const c of stops) {
        const dd = Math.abs(s - c);
        d = Math.min(d, dd, length - dd);
      }
      d = Math.min(d, s - start[pi], start[pi] + pieces[pi].len - s);
      v = G.corner.speed + (G.speed - G.corner.speed) * smooth(d / G.corner.reach);
    }
    t[i] = t[i - 1] + ds / v;
    for (const L of landings) if (L > (i - 1) * ds && L <= i * ds) t[i] += G.dwell;
  }
  return { islandId: isl.id, pieces, start, length, ds, t, period: t[steps], corners };
}

/** Arc length of the loop at loop time `u` ∈ [0, period). */
function arcAt(L: CableLoop, u: number): number {
  const { t } = L;
  let lo = 0;
  let hi = t.length - 1;
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1;
    if (t[m] <= u) lo = m;
    else hi = m;
  }
  const f = t[hi] > t[lo] ? (u - t[lo]) / (t[hi] - t[lo]) : 0;
  // a dwell sits inside the step that holds the landing: the gondola waits at its arc there
  const step = t[hi] - t[lo];
  const run = L.ds / G.wheelSpeed;
  const ff = step > run * 1.5 ? Math.min(1, (f * step) / run) : f;
  return Math.min(L.length, (lo + ff) * L.ds);
}

/** Pose of gondola `k` of `count` at sim time `time`. */
export function gondolaPose(L: CableLoop, k: number, time: number, out: GondolaPose): GondolaPose {
  const P = L.period;
  const u0 = time + (k / G.count) * P;
  const u = ((u0 % P) + P) % P;
  const s = arcAt(L, u);
  const s2 = arcAt(L, (u + 0.2) % P);
  const s3 = arcAt(L, (u + 0.4) % P);
  const v1 = ((s2 - s + L.length) % L.length) / 0.2 / G.speed;
  const v2 = ((s3 - s2 + L.length) % L.length) / 0.2 / G.speed;
  let i = 0;
  while (i + 1 < L.pieces.length && L.start[i + 1] <= s) i++;
  const p = L.pieces[i];
  const f = p.len > 0 ? (s - L.start[i]) / p.len : 0;
  let heading: number;
  if (p.kind === 'span') {
    const c = cablePoint(p.a, p.b, Math.min(1, Math.max(0, f)));
    out.x = c.x;
    out.y = c.y;
    out.z = c.z;
    heading = ang(p.b.x - p.a.x, p.b.z - p.a.z);
  } else {
    const th = p.a0 + p.sweep * f;
    out.x = p.c.x + Math.cos(th) * p.r;
    out.y = p.c.y;
    out.z = p.c.z + Math.sin(th) * p.r;
    heading = th + (p.sweep > 0 ? Math.PI / 2 : -Math.PI / 2);
  }
  // turn through a sheave: blend the headings within the corner reach (spans only)
  if (p.kind === 'span') {
    const R = G.corner.reach;
    const prev = L.corners[(i + L.pieces.length - 1) % L.pieces.length];
    const next = L.corners[i];
    const dIn = s - L.start[i];
    const dOut = L.start[i] + p.len - s;
    if (dIn < R && L.pieces[(i + L.pieces.length - 1) % L.pieces.length].kind === 'span')
      heading = lerpAng(prev.hIn, prev.hOut, 0.5 + 0.5 * smooth(dIn / R));
    else if (dOut < R && L.pieces[(i + 1) % L.pieces.length].kind === 'span')
      heading = lerpAng(next.hIn, next.hOut, 0.5 - 0.5 * smooth(dOut / R));
  }
  out.heading = heading;
  out.v = Math.min(1, v1);
  out.dv = v2 - v1;
  return out;
}

export function newGondolaPose(): GondolaPose {
  return { x: 0, y: 0, z: 0, heading: 0, v: 0, dv: 0 };
}

/** Every Beacon Rock loop of the world's islands. */
export function cableLoops(islands: readonly IslandData[]): CableLoop[] {
  const out: CableLoop[] = [];
  for (const isl of islands) {
    const L = cableLoop(isl);
    if (L) out.push(L);
  }
  return out;
}
