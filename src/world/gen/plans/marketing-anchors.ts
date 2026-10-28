/**
 * Beacon Rock M27 "Cable Carnival" anchors (TASK-516, D-095): the windward sea stacks become
 * stations, a cable-car line runs from the summit lip over them, an ON AIR neon column hangs on the
 * windward cliff. Runs in the Marketing plan's `finish` (after the pads are levelled and the
 * footpaths carved), so every earlier piece keeps its place and the faces measured are the final
 * ground; the shapes are reserved (non-blocking: scatter keeps off) and the station keeps off the
 * footpaths. world/index.ts keeps boat routes off the pool and seamarks off the pool and spans.
 * Numbers: content/themes/marketing-anchors.ts (MARKETING_ANCHORS).
 *
 * Anchor contract (world u; rotY = xz heading (cos, sin); `y` = world height where set):
 * - `stackTop{k}` (k = the profile's `stack{k}`): the flat top's centre, y = top height,
 *   rotY = seaward (summit → stack); `stackTop{k}Size` = { x: r, z: r }, r = usable top radius.
 *   Missing when the top is lower than `stack.minTop` or narrower than `stack.minR`.
 * - `cable0..N-1` (`anchorChain(isl, 'cable')`, N ≥ 2): 0 = the summit lip station, N-1 = the far
 *   station on the last stack, between = mid pylons on stack tops (angle stations: the line turns
 *   ≤ `cable.maxTurn` there, sweeping along the stacks' arc). y = the pivot's ground; the cable
 *   seat = y + `cable.seat.station` (ends) or `cable.seat.pylon` (mid). rotY: the ends face along
 *   the line (0 → 1, N-1 → N-2); a mid pylon = the bisector of its arriving and leaving headings.
 *   `beaconCable(isl)` returns the seats; `cablePoint` the sagged curve; spans are straight in xz.
 * - `transmitter`: mast pivot on a stack top (y = ground), rotY = the mast heading that stands its
 *   three guy eyes (`guyEyes`) on the top, nearest seaward (TASK-518).
 * - `seaBillboard`: point on the board plane at its centre (y = board centre), rotY = the face's
 *   outward normal; `seaBillboardSize` = { x: board width, z: board height }. The stack face lies
 *   behind the plane by 0 … `billboard.maxGap` over the whole board.
 * - `diveTower`: platform pivot on a stack top rim (y = ground), rotY = toward the pool;
 *   `divePool`: pool centre on the sea (y = 0), rotY = the same heading; `divePoolSize` =
 *   { x: pool radius, z: shallowest seabed depth inside the pool (u below sea level) }.
 * - `onAir`: point on the letter-column plane on the windward cliff (y = column centre), rotY = the
 *   face's outward normal; `onAirSize` = { x: usable width, z: usable vertical extent }; the cliff
 *   lies behind the plane by 0 … `neon.maxGap` over that rect; the rect keeps out of the cable
 *   corridor seen from the sea (`corridorMargin` ≥ 0, `neon.corridor`; TASK-523, D-102).
 * Any anchor is missing when its site does not fit (tests track the rates). No rng is drawn.
 */
import { MARKETING_ANCHORS as A } from '../../../content/themes/marketing-anchors.ts';
import { Zone, heightAt } from '../../types.ts';
import { PATHS } from '../../../content/settlements.ts';
import type { Heightfield, IslandData, Polyline, XZ } from '../../types.ts';
import {
  add,
  addShape,
  ang,
  bestSample,
  cellOf,
  clear,
  dirOf,
  discShape,
  dist,
  onLand,
  rectShape,
  relief,
  sdfAt,
  segDist,
  shapeDist,
  type Shape,
  type SiteCtx,
} from '../sites.ts';

const DEG = Math.PI / 180;
const TAU = Math.PI * 2;
const C = A.cable;

export interface P3 {
  x: number;
  y: number;
  z: number;
}

const turn = (a: number, b: number): number => {
  const d = Math.abs(a - b) % TAU;
  return d > Math.PI ? TAU - d : d;
};
const heading = (a: XZ, b: XZ): number => ang(b.x - a.x, b.z - a.z);
const xzOf = (p: XZ): [number, number] => [p.x, p.z];

/** Sag (u) of a span of length `len`. */
export const cableSag = (len: number): number =>
  Math.min(C.sagMax, Math.max(C.sagMin, len * C.sagFrac));

/** Point of the cable at t in [0, 1] from seat `a` to seat `b` (the mailCablePoint parabola). */
export function cablePoint(a: P3, b: P3, t: number): P3 {
  const sag = cableSag(Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z));
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t - sag * 4 * t * (1 - t),
    z: a.z + (b.z - a.z) * t,
  };
}

/** Cable seats of an island's `cable…` chain (empty when absent). */
export function beaconCable(isl: IslandData): P3[] {
  const out: P3[] = [];
  for (let k = 0; isl.anchors[`cable${k}`]; k++) {
    const a = isl.anchors[`cable${k}`];
    out.push({ x: a.x, y: a.y ?? 0, z: a.z });
  }
  return out.map((p, k) => ({
    ...p,
    y: p.y + (k === 0 || k === out.length - 1 ? C.seat.station : C.seat.pylon),
  }));
}

/** Headings of a line's pieces: the ends face along the line, a mid pylon = the bisector. */
export function lineRots(pts: readonly XZ[]): number[] {
  const n = pts.length;
  return pts.map((p, k) =>
    k === 0
      ? heading(p, pts[1])
      : k === n - 1
        ? heading(p, pts[n - 2])
        : bisector(heading(pts[k - 1], p), heading(p, pts[k + 1])),
  );
}

/** Local +x of a fixture heading `rot` in world xz (local +z = (cos rot, sin rot)). */
export const sideOf = (rot: number): XZ => ({ x: Math.sin(rot), z: -Math.cos(rot) });

/**
 * The loop's two tracks (TASK-518) over the pivots `pts` (ground `ys`, headings `rots`): cable
 * seats ± `track` across each piece, in line order 0 → N−1. Track 0 runs on the summit station's
 * local +x side (its landing), track 1 on the other, which is the far terminal's local +x side.
 */
export function trackSeats(
  pts: readonly XZ[],
  ys: readonly number[],
  rots: readonly number[] = lineRots(pts),
): [P3[], P3[]] {
  const n = pts.length;
  const out: [P3[], P3[]] = [[], []];
  pts.forEach((p, k) => {
    const s = sideOf(rots[k]);
    const sg = (k === n - 1 ? -1 : 1) * C.track;
    const y = ys[k] + (k === 0 || k === n - 1 ? C.seat.station : C.seat.pylon);
    out[0].push({ x: p.x + s.x * sg, y, z: p.z + s.z * sg });
    out[1].push({ x: p.x - s.x * sg, y, z: p.z - s.z * sg });
  });
  return out;
}

/** The two tracks of an island's cable line from its anchors (empty when absent). */
export function beaconTracks(isl: IslandData): [P3[], P3[]] {
  const pts: XZ[] = [];
  const ys: number[] = [];
  const rots: number[] = [];
  for (let k = 0; isl.anchors[`cable${k}`]; k++) {
    const a = isl.anchors[`cable${k}`];
    pts.push({ x: a.x, z: a.z });
    ys.push(a.y ?? 0);
    rots.push(a.rotY);
  }
  return pts.length < 2 ? [[], []] : trackSeats(pts, ys, rots);
}

/**
 * Lowest gondola-floor margin of a span (u): min over the samples outside `endSkip` of
 * floor − (ground + clearLand) on land, floor − clearWater over the sea (≥ 0 = clear).
 */
export function spanMargin(h: Heightfield, a: P3, b: P3): number {
  const L = Math.hypot(b.x - a.x, b.z - a.z);
  let m = Infinity;
  for (let s = C.endSkip; s <= L - C.endSkip + 1e-6; s += C.step) {
    const c = cablePoint(a, b, s / L);
    const g = heightAt(h, c.x, c.z);
    const floor = c.y - C.hang;
    m = Math.min(m, g > 0 ? floor - g - C.clearLand : floor - C.clearWater);
  }
  return m;
}

interface StackTop {
  k: number;
  c: XZ;
  y: number;
  r: number;
  sea: number;
}

/** Flat top of the profile stack `stack{k}` (null: too low / narrow). */
function stackTop(ctx: SiteCtx, isl: IslandData, k: number, summit: XZ): StackTop | null {
  const S = A.stack;
  const an = isl.anchors[`stack${k}`];
  let top = -Infinity;
  const pts: { p: XZ; y: number }[] = [];
  for (let dz = -S.search; dz <= S.search + 1e-6; dz += 0.5)
    for (let dx = -S.search; dx <= S.search + 1e-6; dx += 0.5) {
      if (dx * dx + dz * dz > S.search * S.search) continue;
      const p = { x: an.x + dx, z: an.z + dz };
      const y = heightAt(ctx.h, p.x, p.z);
      pts.push({ p, y });
      top = Math.max(top, y);
    }
  if (top < S.minTop) return null;
  let sx = 0;
  let sz = 0;
  let n = 0;
  for (const { p, y } of pts)
    if (y >= top - S.topTol) {
      sx += p.x;
      sz += p.z;
      n++;
    }
  const c = { x: sx / n, z: sz / n };
  const y = heightAt(ctx.h, c.x, c.z);
  let r = 0;
  for (let rr = 0.25; rr <= S.maxR + 1e-6; rr += 0.25) {
    let ok = true;
    for (let q = 0; q < 24 && ok; q++) {
      const p = add(c, dirOf((q / 24) * TAU), rr);
      if (heightAt(ctx.h, p.x, p.z) < y - S.rimTol) ok = false;
    }
    if (!ok) break;
    r = rr;
  }
  if (r < S.minR) return null;
  return { k, c, y, r, sea: heading(summit, c) };
}

/** Grid of candidate pivots on a stack top whose `pr` disc stays inside the usable radius. */
function topCands(t: StackTop, pr: number): XZ[] {
  const out: XZ[] = [];
  const R = t.r - pr;
  if (R < 0) return out;
  for (let dz = -R; dz <= R + 1e-6; dz += 0.25)
    for (let dx = -R; dx <= R + 1e-6; dx += 0.25)
      if (dx * dx + dz * dz <= R * R + 1e-6) out.push({ x: t.c.x + dx, z: t.c.z + dz });
  return out.sort((a, b) => dist(a, t.c) - dist(b, t.c) || a.x - b.x || a.z - b.z);
}

interface Pool {
  q: XZ;
  pool: XZ;
  h: number;
  depth: number;
}

/** Pools off a stack (platform pivot on the rim, pool centre, heading), best first. */
function divePools(ctx: SiteCtx, t: StackTop, spans: readonly [XZ, XZ][]): Pool[] {
  const D = A.diveTower;
  const out: { p: Pool; s: number }[] = [];
  for (let i = 0; i < 72; i++) {
    const h = (i / 72) * TAU;
    if (spans.some(([a, b]) => turn(h, heading(a, b)) < D.spanOff * DEG)) continue;
    const q = add(t.c, dirOf(h), t.r - D.r);
    for (let d = D.reach[0]; d <= D.reach[1] + 1e-6; d += 0.5) {
      const pool = add(q, dirOf(h), d);
      const cd = -heightAt(ctx.h, pool.x, pool.z);
      if (cd < D.centreDepth) continue;
      let depth = cd;
      let ok = true;
      for (let j = 0; j < 16 && ok; j++) {
        for (const rr of [D.poolR, D.poolR / 2]) {
          const p = add(pool, dirOf((j / 16) * TAU), rr);
          const dp = -heightAt(ctx.h, p.x, p.z);
          if (dp < D.depth || sdfAt(ctx, p.x, p.z) > -D.shore) ok = false;
          depth = Math.min(depth, dp);
        }
      }
      if (!ok) continue;
      if (spans.some(([a, b]) => segDist(pool, a, b) < D.poolR + D.poolClear)) continue;
      out.push({ p: { q, pool, h, depth }, s: d + 4 * turn(h, t.sea) });
      break;
    }
  }
  return out.sort((a, b) => a.s - b.s).map((x) => x.p);
}

/** Ground heights along `n` from `origin` shifted across by every 0.5 u in ± maxW / 2. */
interface FaceProfile {
  origin: XZ;
  n: XZ;
  tx: XZ;
  maxW: number;
  /** Per offset: [height at the origin, then at s = 0.1, 0.2, … reach]. */
  hs: Float32Array[];
}

const FACE_STEP = 0.1;

function faceProfile(ctx: SiteCtx, origin: XZ, n: XZ, maxW: number, reach: number): FaceProfile {
  const tx = { x: -n.z, z: n.x };
  const steps = Math.floor(reach / FACE_STEP);
  const hs: Float32Array[] = [];
  for (let o = -maxW / 2; o <= maxW / 2 + 1e-6; o += 0.5) {
    const o0 = add(origin, tx, o);
    const a = new Float32Array(steps + 1);
    for (let j = 0; j <= steps; j++) {
      const p = add(o0, n, j * FACE_STEP);
      a[j] = heightAt(ctx.h, p.x, p.z);
    }
    hs.push(a);
  }
  return { origin, n, tx, maxW, hs };
}

/**
 * The plane of a face seen along `n` from the profile origin (on top of the face): for every
 * offset across (± w/2, 0.5 u apart) and every height in [yLo, yHi] (0.5 u apart) the first point
 * along n below that height. Returns the plane distance (the outermost), the gap range and the
 * face points, or null where the face is missing.
 */
function facePlane(
  pr: FaceProfile,
  w: number,
  yLo: number,
  yHi: number,
): { d: number; gap: number; pts: XZ[] } | null {
  let dMax = -Infinity;
  let dMin = Infinity;
  const pts: XZ[] = [];
  for (let o = -w / 2; o <= w / 2 + 1e-6; o += 0.5) {
    const a = pr.hs[Math.round((o + pr.maxW / 2) / 0.5)];
    if (!a) return null;
    for (let y = yLo; y <= yHi + 1e-6; y += 0.5) {
      if (a[0] <= y) return null;
      let j = 1;
      while (j < a.length && a[j] > y) j++;
      if (j >= a.length) return null;
      const hit = j * FACE_STEP;
      pts.push(add(add(pr.origin, pr.tx, o), pr.n, hit));
      dMax = Math.max(dMax, hit);
      dMin = Math.min(dMin, hit);
    }
  }
  // nothing in front of the face (a bump below / beside it) may poke through the plane
  const jp = Math.round(dMax / FACE_STEP);
  for (let o = -w / 2; o <= w / 2 + 1e-6; o += 0.5) {
    const a = pr.hs[Math.round((o + pr.maxW / 2) / 0.5)];
    if (jp < a.length && a[jp] > yLo + 0.2) return null;
  }
  return { d: dMax, gap: dMax - dMin, pts };
}

interface Site {
  /** Pivot of the stack's cable piece (mid pylon / far station), null when off the line. */
  pylon: XZ | null;
  prop: XZ | null;
}

/**
 * Lay out a stack top: the cable piece (radius `pr`, through which the spans to `nbrs` run) as
 * near the centre as it fits, and the role prop (one of `qs`, ≥ `minD` from the piece and `ok`)
 * off the spans by `qClear`. Null when they do not fit.
 */
function layTop(
  t: StackTop,
  pr: number,
  nbrs: readonly XZ[],
  qs: readonly XZ[],
  minD: number,
  qClear: number,
  ok: (p: XZ, q: XZ) => boolean = () => true,
): Site | null {
  if (qs.length === 0) return { pylon: topCands(t, pr)[0] ?? null, prop: null };
  for (const p of topCands(t, pr))
    for (const q of qs) {
      if (dist(p, q) < minD) continue;
      if (nbrs.some((b) => segDist(q, p, b) < qClear)) continue;
      if (!ok(p, q)) continue;
      return { pylon: p, prop: q };
    }
  return null;
}

/**
 * Two square footprints (centre, half size, heading of local +z) at least `gap` apart: a
 * separating axis among the four edge normals.
 */
export function squaresApart(
  a: XZ,
  ha: number,
  ra: number,
  b: XZ,
  hb: number,
  rb: number,
  gap: number,
): boolean {
  const axes = [dirOf(ra), sideOf(ra), dirOf(rb), sideOf(rb)];
  const da = [dirOf(ra), sideOf(ra)];
  const db = [dirOf(rb), sideOf(rb)];
  const proj = (u: XZ, e: XZ[], h: number): number =>
    h * (Math.abs(u.x * e[0].x + u.z * e[0].z) + Math.abs(u.x * e[1].x + u.z * e[1].z));
  return axes.some(
    (u) =>
      Math.abs(u.x * (b.x - a.x) + u.z * (b.z - a.z)) >= proj(u, da, ha) + proj(u, db, hb) + gap,
  );
}

/**
 * Guy eye feet of the transmitter (antennaTower v2, drawn at `scale`) at `q`, mast heading `rot`
 * (world xz).
 */
export function guyEyes(q: XZ, rot: number, scale = 1): XZ[] {
  const G = A.transmitter.guy;
  const sx = sideOf(rot);
  const sz = dirOf(rot);
  return [0, 1, 2].map((k) => {
    const a = (k / 3) * TAU + G.phase;
    const lx = Math.sin(a) * G.radius * scale;
    const lz = Math.cos(a) * G.radius * scale;
    return { x: q.x + sx.x * lx + sz.x * lz, z: q.z + sx.z * lx + sz.z * lz };
  });
}

/**
 * Mast headings (nearest `pref` first) whose three guy eyes stand on ground within
 * `guy.below` / `guy.above` of the pivot ground.
 */
function guyTurns(ctx: SiteCtx, q: XZ, pref: number, scale: number): number[] {
  const G = A.transmitter.guy;
  const y0 = heightAt(ctx.h, q.x, q.z);
  const out: number[] = [];
  for (let i = 0; i < G.turns; i++) {
    const rot = pref + (i % 2 ? 1 : -1) * Math.ceil(i / 2) * (TAU / G.turns);
    const ok = guyEyes(q, rot, scale).every((e) => {
      const y = heightAt(ctx.h, e.x, e.z);
      return y >= y0 - G.below && y <= y0 + G.above;
    });
    if (ok) out.push(rot);
  }
  return out;
}

/** The stack sites in chain order and the summit station (centres only, before the top layout). */
interface Chain {
  station: XZ;
  stacks: StackTop[];
}

/**
 * Spans `from`… of a chain clear (seats from the pivots' ground), the turns at their start pylons
 * too. `summit`: the obstacles a low cable must keep off.
 */
function chainOk(
  ctx: SiteCtx,
  lh: XZ,
  summit: readonly Shape[],
  pts: readonly XZ[],
  from: number,
  to = pts.length - 1,
): boolean {
  // both tracks of the loop (TASK-518): seats ± track across every piece
  const tracks = trackSeats(
    pts,
    pts.map((p) => heightAt(ctx.h, p.x, p.z)),
  );
  for (let k = from; k < to; k++) {
    const L = dist(pts[k], pts[k + 1]);
    if (L > C.maxSpan || L < 2 * C.endSkip) return false;
    if (k > 0 && turn(heading(pts[k - 1], pts[k]), heading(pts[k], pts[k + 1])) > C.maxTurn * DEG)
      return false;
    for (const tr of tracks) {
      const a = tr[k];
      const b = tr[k + 1];
      if (segDist(lh, a, b) < C.towerClear) return false;
      if (spanMargin(ctx.h, a, b) < 0) return false;
      const La = dist(a, b);
      for (let s = C.endSkip; s <= La - C.endSkip + 1e-6; s += C.step) {
        const c = cablePoint(a, b, s / La);
        // the cabin floor far above an obstacle (the 2.2 u hang + 10 u of TASK-516) passes it
        if (c.y - C.hang - heightAt(ctx.h, c.x, c.z) > 7.8) continue;
        if (summit.some((sh) => shapeDist(sh, c.x, c.z) < C.shapeGap)) return false;
      }
    }
  }
  return true;
}

/** Summit station for stacks in this order (null: none fits). */
function findChain(
  ctx: SiteCtx,
  isl: IslandData,
  lh: XZ,
  top: number,
  summit: readonly Shape[],
  walk: readonly XZ[],
  stacks: readonly StackTop[],
): Chain | null {
  const S = C.station;
  const rest = stacks.map((t) => t.c);
  // the stack-to-stack spans do not depend on the station (the turn at the first stack does)
  if (!chainOk(ctx, lh, summit, [lh, ...rest], 1)) return null;
  const p = bestSample(ctx, isl, lh, S.search, (q) => {
    if (heightAt(ctx.h, q.x, q.z) < top - S.drop || dist(q, lh) < C.towerClear + S.r)
      return Infinity;
    const sh = discShape(q.x, q.z, S.r);
    if (!onLand(ctx, isl, sh, 0.5) || relief(ctx, sh) > S.relief) return Infinity;
    if (!clear(ctx, isl, sh, S.gap)) return Infinity;
    if (walk.some((w) => dist(w, q) < S.r + PATHS.halfWidth + S.gap)) return Infinity;
    const pts = [q, ...rest];
    if (!chainOk(ctx, lh, summit, pts, 0, 1)) return Infinity;
    if (pts.length > 2 && !chainOk(ctx, lh, summit, pts, 1, 2)) return Infinity;
    // the plateau run the cable crosses before the lip, then the first span's length
    const h0 = heading(q, rest[0]);
    let run = 0;
    while (run < 20 && heightAt(ctx.h, ...xzOf(add(q, dirOf(h0), run))) > top - S.drop) run += 0.5;
    return run + 0.05 * dist(q, rest[0]);
  });
  return p ? { station: p, stacks: [...stacks] } : null;
}

/** Orders of `items` (all permutations), best first by `score` (Infinity dropped). */
function orders<T>(items: readonly T[], score: (o: T[]) => number): T[][] {
  const out: { o: T[]; s: number }[] = [];
  const rec = (o: T[], left: T[]): void => {
    if (left.length === 0) {
      const s = score(o);
      if (Number.isFinite(s)) out.push({ o, s });
      return;
    }
    left.forEach((t, i) => rec([...o, t], [...left.slice(0, i), ...left.slice(i + 1)]));
  };
  rec([], [...items]);
  return out.sort((a, b) => a.s - b.s).map((x) => x.o);
}

/** Chain order score from the tower: total turn (rad) + length / 100; Infinity past maxTurn. */
function orderScore(lh: XZ, o: readonly StackTop[]): number {
  const pts = [lh, ...o.map((t) => t.c)];
  let s = 0;
  for (let k = 1; k + 1 < pts.length; k++) {
    const tr = turn(heading(pts[k - 1], pts[k]), heading(pts[k], pts[k + 1]));
    if (tr > C.maxTurn * DEG) return Infinity;
    s += tr;
  }
  for (let k = 0; k + 1 < pts.length; k++) s += dist(pts[k], pts[k + 1]) / 100;
  return s;
}

/** Non-empty subsets of `items`, largest first (stable). */
function subsets<T>(items: readonly T[]): T[][] {
  const out: T[][] = [];
  for (let m = (1 << items.length) - 1; m > 0; m--) out.push(items.filter((_, i) => m & (1 << i)));
  return out.sort((a, b) => b.length - a.length);
}

const setAnchor = (isl: IslandData, key: string, p: XZ, rotY: number, y?: number): void => {
  isl.anchors[key] = y === undefined ? { x: p.x, z: p.z, rotY } : { x: p.x, z: p.z, rotY, y };
};
const setSize = (isl: IslandData, key: string, w: number, d: number): void => {
  isl.anchors[key] = { x: w, z: d, rotY: 0 };
};

type Role = 'billboard' | 'dive' | 'transmitter';

/**
 * All the M27 anchors of Beacon Rock, from the plan's `finish` (final ground, footpaths built).
 * `lh` = the Broadcast Tower foot, `top` = its ground height.
 */
export function reserveBeaconAnchors(
  ctx: SiteCtx,
  isl: IslandData,
  lh: XZ,
  top: number,
  paths: readonly Polyline[],
): void {
  const summit = isl.anchors.lighthouse ?? lh;
  const tops: StackTop[] = [];
  for (let k = 0; isl.anchors[`stack${k}`]; k++) {
    const t = stackTop(ctx, isl, k, summit);
    if (t) tops.push(t);
  }
  const summitShapes = ctx.shapes[isl.id].filter((sh) => heightAt(ctx.h, sh.x, sh.z) > top - 6);
  // footpath points near the summit (the station keeps off the walks)
  const walk = paths
    .filter((p) => p.islandId === isl.id)
    .flatMap((p) => p.points)
    .filter((p) => dist(p, lh) < C.station.search + C.station.r + PATHS.halfWidth + 1);
  // ---- the cable line: most stacks first, the smoothest order first, the first that clears
  let chain: Chain | null = null;
  search: for (const sub of subsets(tops))
    for (const o of orders(sub, (x) => orderScore(lh, x))) {
      chain = findChain(ctx, isl, lh, top, summitShapes, walk, o);
      if (chain) break search;
    }
  const onChain = (t: StackTop): number => (chain ? chain.stacks.indexOf(t) : -1);
  const nbrsOf = (t: StackTop): XZ[] => {
    const i = onChain(t);
    if (!chain || i < 0) return [];
    const pts = [chain.station, ...chain.stacks.map((s) => s.c)];
    return [pts[i], pts[i + 2]].filter((p): p is XZ => !!p);
  };
  const pieceR = (t: StackTop): number => {
    const i = onChain(t);
    if (!chain || i < 0) return 0;
    return i === chain.stacks.length - 1 ? C.farR : C.pylonR;
  };
  // ---- role feasibility per stack
  const spansAt = (t: StackTop): [XZ, XZ][] => nbrsOf(t).map((b) => [t.c, b]);
  const sites = new Map<string, { site: Site; extra?: unknown }>();
  const tryRole = (role: Role, t: StackTop): boolean => {
    const key = `${role}${t.k}`;
    if (sites.has(key)) return !!sites.get(key);
    let res: { site: Site; extra?: unknown } | null = null;
    const pr = pieceR(t);
    const nb = nbrsOf(t);
    if (role === 'billboard') {
      const bb = billboardFace(ctx, t);
      if (bb)
        res = { site: { pylon: pr ? (topCands(t, pr)[0] ?? null) : null, prop: null }, extra: bb };
    } else if (role === 'transmitter') {
      const T = A.transmitter;
      // the guys need rock all round (TASK-518): the full mast first, then smaller ones
      for (const sc of T.scales) {
        const qr = T.r * sc;
        const qs: XZ[] = [];
        if (pr === 0) qs.push(t.c);
        else
          for (let i = 0; i < 24; i++) {
            // round the rim from the seaward side
            const h = t.sea + (i % 2 ? 1 : -1) * Math.ceil(i / 2) * (TAU / 24);
            qs.push(add(t.c, dirOf(h), t.r - qr));
          }
        // then the rest of the top, centre first
        qs.push(...topCands(t, qr).filter((_, i) => i % 4 === 0));
        // mast turns whose three guy eyes stand on the top, per candidate (cached)
        const turns = new Map<XZ, number[]>();
        const turnsAt = (q: XZ): number[] => {
          let l = turns.get(q);
          if (!l) turns.set(q, (l = guyTurns(ctx, q, t.sea, sc)));
          return l;
        };
        const eyesOff = (p: XZ | null, q: XZ): number | null =>
          turnsAt(q).find(
            (rot) =>
              !p ||
              guyEyes(q, rot, sc).every(
                (e) => dist(e, p) >= pr + T.guy.gap && segDist(p, e, q) >= pr * 0.75,
              ),
          ) ?? null;
        let site: Site | null = null;
        let rot: number | null = null;
        if (pr) {
          site = layTop(
            t,
            pr,
            nb,
            qs,
            pr + qr + A.topGap,
            T.clear,
            (p, q) => eyesOff(p, q) !== null,
          );
          if (site?.prop) rot = eyesOff(site.pylon, site.prop);
        } else
          for (const q of qs) {
            rot = eyesOff(null, q);
            if (rot !== null) {
              site = { pylon: null, prop: q };
              break;
            }
          }
        if (site && site.prop && rot !== null) {
          res = { site, extra: { rot, sc } };
          break;
        }
      }
    } else {
      const D = A.diveTower;
      // the two lattices' square footprints apart (pylon heading from its spans, tower → pool);
      // the full tower first, then smaller ones (TASK-518)
      const pRot = (p: XZ): number =>
        nb.length === 2 ? bisector(heading(nb[0], p), heading(p, nb[1])) : heading(p, nb[0] ?? t.c);
      const pools = divePools(ctx, t, spansAt(t));
      scales: for (const sc of D.scales)
        for (const pool of pools) {
          const site = pr
            ? layTop(t, pr, nb, [pool.q], D.minApart * sc, D.clear, (p, q) =>
                squaresApart(p, C.pylonHalf, pRot(p), q, D.half * sc, pool.h, D.gap),
              )
            : { pylon: null, prop: pool.q };
          if (site && site.prop) {
            res = { site, extra: { pool, sc } };
            break scales;
          }
        }
    }
    sites.set(key, res as never);
    return !!res;
  };
  // assignment: most roles, billboard on the far station's stack, dive tower not on it
  const roles: Role[] = ['billboard', 'dive', 'transmitter'];
  const far = chain ? chain.stacks[chain.stacks.length - 1] : null;
  let best: (StackTop | null)[] = [null, null, null];
  let bestScore = -Infinity;
  const opts: (StackTop | null)[] = [...tops, null];
  for (const b of opts)
    for (const d of opts)
      for (const x of opts) {
        const pick = [b, d, x];
        const used = pick.filter((t): t is StackTop => !!t);
        if (new Set(used).size !== used.length) continue;
        if (pick.some((t, i) => t && !tryRole(roles[i], t))) continue;
        let s = used.length * 10;
        if (b && b === far) s += 3;
        if (d && d !== far) s += 1;
        if (s > bestScore) {
          bestScore = s;
          best = pick;
        }
      }
  // ---- publish
  for (const t of tops) {
    setAnchor(isl, `stackTop${t.k}`, t.c, t.sea, t.y);
    setSize(isl, `stackTop${t.k}Size`, t.r, t.r);
    addShape(ctx, isl, discShape(t.c.x, t.c.z, t.r), false);
  }
  const pylonOf = new Map<StackTop, XZ>();
  best.forEach((t, i) => {
    if (!t) return;
    const r = sites.get(`${roles[i]}${t.k}`);
    if (!r) return;
    if (r.site.pylon) pylonOf.set(t, r.site.pylon);
    const y = (p: XZ): number => heightAt(ctx.h, p.x, p.z);
    if (roles[i] === 'transmitter' && r.site.prop) {
      const { rot, sc } = r.extra as { rot: number; sc: number };
      setAnchor(isl, 'transmitter', r.site.prop, rot, y(r.site.prop));
      setSize(isl, 'transmitterSize', sc, sc);
    }
    if (roles[i] === 'dive' && r.site.prop) {
      const { pool, sc } = r.extra as { pool: Pool; sc: number };
      setAnchor(isl, 'diveTower', r.site.prop, pool.h, y(r.site.prop));
      setSize(isl, 'diveTowerSize', sc, sc);
      setAnchor(isl, 'divePool', pool.pool, pool.h, 0);
      setSize(isl, 'divePoolSize', A.diveTower.poolR, pool.depth);
      addShape(ctx, isl, discShape(pool.pool.x, pool.pool.z, A.diveTower.poolR), false);
    }
    if (roles[i] === 'billboard') {
      const bb = r.extra as Face;
      setAnchor(isl, 'seaBillboard', bb.p, bb.h, bb.y);
      setSize(isl, 'seaBillboardSize', bb.w, bb.ht);
      addShape(ctx, isl, rectShape(bb.p.x, bb.p.z, bb.h, bb.w, 2), false);
    }
  });
  let firstSpan: [XZ, XZ] | null = null;
  let line: { tracks: XZ[][]; station: XZ } | null = null;
  if (chain) {
    const pts = [
      chain.station,
      ...chain.stacks.map((t) => pylonOf.get(t) ?? topCands(t, pieceR(t))[0] ?? t.c),
    ];
    // the top layout moves a pivot ≤ the top radius: re-check the whole line (none if it fails)
    if (chainOk(ctx, lh, summitShapes, pts, 0)) {
      const n = pts.length;
      const rots = lineRots(pts);
      pts.forEach((p, k) => setAnchor(isl, `cable${k}`, p, rots[k], heightAt(ctx.h, p.x, p.z)));
      addShape(ctx, isl, discShape(pts[0].x, pts[0].z, C.station.r), false);
      for (let k = 0; k + 1 < n; k++) {
        const a = pts[k];
        const b = pts[k + 1];
        const m = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
        addShape(ctx, isl, rectShape(m.x, m.z, heading(a, b), C.strip, dist(a, b)), false);
      }
      firstSpan = [pts[0], pts[1]];
      line = {
        tracks: trackSeats(
          pts,
          pts.map((p) => heightAt(ctx.h, p.x, p.z)),
          rots,
        ),
        station: pts[0],
      };
    }
  }
  // ---- ON AIR neon on the windward cliff
  const neon = neonFace(ctx, isl, summit, top, firstSpan, line);
  if (neon) {
    setAnchor(isl, 'onAir', neon.p, neon.h, neon.y);
    setSize(isl, 'onAirSize', neon.w, neon.ht);
    addShape(ctx, isl, rectShape(neon.p.x, neon.p.z, neon.h, neon.w, 3), false);
  }
}

/** Heading halfway between two headings (the shorter way). */
function bisector(a: number, b: number): number {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return a + d / 2;
}

interface Face {
  /** Plane point at the column / board centre, its y, outward heading, width, height. */
  p: XZ;
  y: number;
  h: number;
  w: number;
  ht: number;
}

/** M3: the widest seaward board plane on a stack's flank. */
function billboardFace(ctx: SiteCtx, t: StackTop): Face | null {
  const B = A.billboard;
  const yHi = t.y - B.topBelow;
  if (yHi - B.yLo < B.minH) return null;
  let best: Face | null = null;
  let bs = -Infinity;
  for (let i = -Math.floor(B.arc / B.headStep); i <= Math.floor(B.arc / B.headStep); i++) {
    const h = t.sea + i * B.headStep * DEG;
    const n = dirOf(h);
    const pr = faceProfile(ctx, t.c, n, B.maxW, t.r + 6);
    for (let w = B.maxW; w >= B.minW - 1e-6; w -= B.wStep) {
      // the board hangs from under the top; it grows down while the face stays behind it
      let face: { d: number; ht: number } | null = null;
      for (let ht = B.minH; yHi - ht >= B.yLo - 1e-6; ht += 0.5) {
        const f = facePlane(pr, w, yHi - ht, yHi);
        if (!f || f.gap > B.maxGap) break;
        face = { d: f.d, ht };
      }
      if (!face) continue;
      const s = w * face.ht - 0.05 * Math.abs(i * B.headStep);
      if (s > bs) {
        bs = s;
        best = { p: add(t.c, n, face.d), y: yHi - face.ht / 2, h, w, ht: face.ht };
      }
      break;
    }
  }
  return best;
}

/**
 * M4: the letter column on the windward cliff, nearest the view heading, off the first span and
 * out of the cable corridor (`corridorMargin`, TASK-523).
 */
function neonFace(
  ctx: SiteCtx,
  isl: IslandData,
  summit: XZ,
  top: number,
  span: [XZ, XZ] | null,
  line: { tracks: XZ[][]; station: XZ } | null,
): Face | null {
  const N = A.neon;
  const need = N.letters * N.letter + 2 * N.pad;
  const windward = ctx.windDir + Math.PI;
  const yHi = top - N.lipBelow;
  let best: Face | null = null;
  let bs = Infinity;
  for (let i = -Math.floor(N.arc / N.headStep); i <= Math.floor(N.arc / N.headStep); i++) {
    const a = windward + i * N.headStep * DEG;
    // the lip along heading a: the last plateau sample, then 1 u back inland
    let lip: XZ | null = null;
    for (let s = 0; s < isl.reach; s += 0.25) {
      const p = add(summit, dirOf(a), s);
      if (heightAt(ctx.h, p.x, p.z) < yHi) {
        lip = p;
        break;
      }
    }
    if (!lip) continue;
    // outward normal: the shore SDF gradient at the face (falls toward the sea)
    const e = 1;
    const gx = sdfAt(ctx, lip.x + e, lip.z) - sdfAt(ctx, lip.x - e, lip.z);
    const gz = sdfAt(ctx, lip.x, lip.z + e) - sdfAt(ctx, lip.x, lip.z - e);
    const gl = Math.hypot(gx, gz);
    if (gl < 1e-6) continue;
    const n = { x: -gx / gl, z: -gz / gl };
    const h = ang(n.x, n.z);
    if (turn(h, windward) > N.arc * DEG) continue;
    const origin = add(lip, n, -1.5);
    const pr = faceProfile(ctx, origin, n, N.maxW, 14);
    for (let w = N.maxW; w >= N.minW - 1e-6; w -= N.wStep) {
      let ext = 0;
      let face: { d: number; gap: number; pts: XZ[] } | null = null;
      for (let x = need; x <= N.maxExtent + 1e-6 && yHi - x >= N.yLo; x += 0.5) {
        const f = facePlane(pr, w, yHi - x, yHi);
        if (!f || f.gap > N.maxGap) break;
        const cliff = f.pts.filter((p) => ctx.zone[cellOf(ctx, p.x, p.z)] === Zone.cliff).length;
        if (cliff < N.cliffShare * f.pts.length) break;
        ext = x;
        face = f;
      }
      if (!face) continue;
      const p = add(origin, n, face.d);
      if (span) {
        const tx = { x: -n.z, z: n.x };
        const ends = [add(p, tx, -w / 2), p, add(p, tx, w / 2)];
        if (ends.some((q) => segDist(q, span[0], span[1]) < N.cableClear)) continue;
      }
      // TASK-523: out of the cable corridor as seen from the sea (both tracks, the station)
      if (line && corridorMargin(p, h, w, line.tracks, line.station) < 0) continue;
      const s = turn(h, windward + N.viewDeg * DEG) + 0.05 * face.gap - 0.02 * (w + ext);
      if (s < bs) {
        bs = s;
        best = { p, y: yHi - ext / 2, h, w, ht: ext };
      }
      break;
    }
  }
  return best;
}

/**
 * TASK-523 (D-102): worst margin (u, ≥ 0 = clear) of a sign rect (plane centre `p`, outward
 * heading `rot`, width `w`) against the cable corridor `tracks` (xz polylines of both tracks) and
 * the summit station disc at `station`, by `neon.corridor` (see content). Infinity when nothing
 * is near.
 */
export function corridorMargin(
  p: XZ,
  rot: number,
  w: number,
  tracks: readonly (readonly XZ[])[],
  station: XZ | null,
): number {
  const K2 = A.neon.corridor;
  const n = dirOf(rot);
  const tv = Math.tan(K2.view * DEG);
  const frame = (q: XZ): [number, number] => {
    const dx = q.x - p.x;
    const dz = q.z - p.z;
    return [dx * n.x + dz * n.z, Math.abs(dz * n.x - dx * n.z)];
  };
  let m = Infinity;
  for (const t of tracks)
    for (let k = 0; k + 1 < t.length; k++) {
      // the part of the span inside the window (d is linear along it), sampled ends included
      const d0 = frame(t[k])[0];
      const d1 = frame(t[k + 1])[0];
      let u0 = 0;
      let u1 = 1;
      if (Math.abs(d1 - d0) > 1e-9) {
        const ua = (-K2.back - d0) / (d1 - d0);
        const ub = (K2.depth - d0) / (d1 - d0);
        u0 = Math.max(0, Math.min(ua, ub));
        u1 = Math.min(1, Math.max(ua, ub));
      } else if (d0 < -K2.back || d0 > K2.depth) continue;
      if (u1 < u0) continue;
      const L = dist(t[k], t[k + 1]) * (u1 - u0);
      const steps = Math.max(1, Math.ceil(L / (C.step / 2)));
      for (let i = 0; i <= steps; i++) {
        const u = u0 + ((u1 - u0) * i) / steps;
        const q = { x: t[k].x + (t[k + 1].x - t[k].x) * u, z: t[k].z + (t[k + 1].z - t[k].z) * u };
        const [d, l] = frame(q);
        m = Math.min(m, l - K2.half - w / 2 - K2.gap - Math.max(d, 0) * tv);
      }
    }
  if (station) {
    const [d, l] = frame(station);
    if (d >= -K2.back - C.station.r && d <= K2.depth + C.station.r)
      m = Math.min(m, l - C.station.r - w / 2 - K2.gap - Math.max(d, 0) * tv);
  }
  return m;
}

/** Boat-route keep-out discs (no coarse route node inside) round the dive pool. */
export function beaconRouteKeepOut(
  islands: readonly IslandData[],
): { x: number; z: number; r: number }[] {
  const out: { x: number; z: number; r: number }[] = [];
  for (const isl of islands) {
    const pool = isl.anchors.divePool;
    const size = isl.anchors.divePoolSize;
    if (pool && size) out.push({ x: pool.x, z: pool.z, r: size.x + A.seaKeepOut.route });
  }
  return out;
}

/** Seamark keep-out discs (sea stacks, buoys stay off) round the dive pool and the cable spans. */
export function beaconSeaKeepOut(
  islands: readonly IslandData[],
): { x: number; z: number; r: number }[] {
  const out: { x: number; z: number; r: number }[] = [];
  const K = A.seaKeepOut;
  for (const isl of islands) {
    const pool = isl.anchors.divePool;
    const size = isl.anchors.divePoolSize;
    if (pool && size) out.push({ x: pool.x, z: pool.z, r: size.x + K.pool });
    const seats = beaconCable(isl);
    for (let k = 0; k + 1 < seats.length; k++) {
      const a = seats[k];
      const b = seats[k + 1];
      const L = dist(a, b);
      for (let s = 0; s <= L + 1e-6; s += C.discStep) {
        const p = add(a, { x: (b.x - a.x) / L, z: (b.z - a.z) / L }, s);
        out.push({ x: p.x, z: p.z, r: K.span });
      }
    }
  }
  return out;
}
