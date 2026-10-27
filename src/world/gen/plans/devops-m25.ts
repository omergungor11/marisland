/**
 * DevOps M25 "DevOps I" placement (TASK-507, D-089): the TASK-504 kit on the TASK-503 growth
 * anchors (devops-growth.ts). Runs right after `reserveGrowth`, before the Ember Smiths kit, the
 * lodges, the village and the M22 quick wins, so they keep off it. Numbers: DEVOPS_M25_SITE.
 * - D4 funicular: rackShed v2 stations on `funicular0..2`, two sections (foot → mid, mid → top) of
 *   zig-zag legs (`world.fences` kind 'funicular', uphill order, joint `levels`). The candidate
 *   zig-zags are reserved here; `finish` (after the pads and paths) builds the one with the least
 *   earthwork on the final ground, cuts / fills the ground to its grade line and puts a lava
 *   lantern at every zig-zag vertex (world/funicular.ts).
 * - D13 ore cableway: mailLine v3 at the quarry edge and on `cablewayTo`, v2 pylons between.
 * - D14 smiths' lane: goodsStall v7 rows facing across the `smithsLane` strip (one level pad).
 * - D9 onsen town: onsenHouse v1 / v2 along the `onsenTown` bank facing the pool, a capybara spot.
 * - D7 geyser field: 4–6 geyserCone on the `geyserField` rect (hashed by `rng`).
 * The summit watch tower (D5, antennaMast v2) is the M22 ridge lot. Missing anchors skip a piece.
 */
import type { Rng } from '../../../core/rng.ts';
import { mailCablePoint } from '../../../content/props-themes/m20.ts';
import { DEVOPS_M25 } from '../../../content/themes/devops-m25.ts';
import { DEVOPS_M25_SITE, oreAnchorWorld } from '../../../content/themes/devops-m25-site.ts';
import { DEVOPS_GROWTH } from '../../../content/themes/devops-growth.ts';
import { DEVOPS_CULTURE } from '../../../content/cultures/devops.ts';
import { FLATTEN } from '../../../content/settlements.ts';
import { planRail, railEarthworks, type RailLine } from '../../funicular.ts';
import { heightAt } from '../../types.ts';
import type { IslandData, StorySpot, XZ } from '../../types.ts';
import {
  add,
  addPad,
  addShape,
  ang,
  bestSample,
  discShape,
  dist,
  dirOf,
  onIsland,
  onLand,
  rectShape,
  relief,
  sdfAt,
  segDist,
  shapeDist,
  shapesOverlap,
  type Shape,
  type SiteCtx,
  type SitePlan,
} from '../sites.ts';

const S = DEVOPS_M25_SITE;

/** No obstacle of the island (but the `skip` ones) within `gap` of `sh`. */
function clearOf(
  ctx: SiteCtx,
  isl: IslandData,
  sh: Shape,
  gap: number,
  skip: readonly Shape[],
): boolean {
  for (const o of ctx.shapes[isl.id]) {
    if (skip.includes(o)) continue;
    if (shapesOverlap(o, sh, gap)) return false;
  }
  return true;
}

/** The reservation shapes the growth stage put at anchor `p` (centre within 0.05 u). */
const reservedAt = (ctx: SiteCtx, isl: IslandData, ...ps: XZ[]): Shape[] =>
  ctx.shapes[isl.id].filter((o) => ps.some((p) => dist(o, p) < 0.05));

function fixture(
  ctx: SiteCtx,
  isl: IslandData,
  defId: string,
  p: XZ,
  rotY: number,
  variant: number | undefined,
  sh: Shape,
  o: { block: boolean; pad?: number },
): void {
  ctx.fixtures.push({
    defId,
    x: p.x,
    z: p.z,
    rotY,
    islandId: isl.id,
    ...(variant === undefined ? {} : { variant }),
  });
  addShape(ctx, isl, sh, o.block);
  if (o.pad !== undefined) addPad(ctx, isl, sh, o.pad);
}

export interface M25Result {
  /** Stations placed (0, 2 or 3), pylons, stalls, houses, geysers. */
  stations: number;
  pylons: number;
  stalls: number;
  houses: number;
  geysers: number;
  /**
   * Late pass (plan.finish, after the pads and the paths): picks every section's zig-zag on the
   * final ground among the reserved candidates and writes the rail lines + vertex lanterns.
   */
  finish(): void;
}

export function placeM25(
  ctx: SiteCtx,
  isl: IslandData,
  plan: SitePlan,
  rng: Rng,
  stories: StorySpot[],
): M25Result {
  // the pylons first: the funicular candidates keep off them (the cable passes overhead)
  const pylons = placeCableway(ctx, isl);
  const fun = placeFunicular(ctx, isl);
  const stalls = placeSmiths(ctx, isl);
  const houses = placeOnsenTown(ctx, isl, stories);
  const geysers = placeGeysers(ctx, isl, rng.fork('geysers'));
  return {
    stations: fun.stations,
    pylons,
    stalls,
    houses,
    geysers,
    finish: () => finishFunicular(ctx, isl, plan, fun),
  };
}

/* ------------------------------------ D4 funicular ------------------------------------ */

/**
 * Zig-zag from stub point `P` to stub point `Q`: `n` legs whose inner vertices swing off the
 * P → Q axis by `W` to `sign` and `-ρW` to the other side in turn (ρ 0 = one-sided).
 */
function zigzag(P: XZ, Q: XZ, n: number, W: number, sign: number, rho: number): XZ[] {
  const D = dist(P, Q);
  const u = { x: (Q.x - P.x) / D, z: (Q.z - P.z) / D };
  const t = { x: -u.z, z: u.x };
  const pts: XZ[] = [P];
  for (let i = 1; i < n; i++) {
    const s = (i % 2 === 1 ? 1 : -rho) * sign * W;
    pts.push(add(add(P, u, (D * i) / n), t, s));
  }
  pts.push(Q);
  return pts;
}

/**
 * Cheap pre-score of a zig-zag (Infinity = never): every leg long enough, on land off the shore,
 * clear of every obstacle but `skip`; then how far the legs' ground grades exceed the rail's.
 */
function preScore(
  ctx: SiteCtx,
  isl: IslandData,
  pts: readonly XZ[],
  skip: readonly Shape[],
): number {
  const F = S.funicular;
  const maxGrade = S.rail.pitchStep * S.rail.maxStep;
  let over = 0;
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const L = dist(a, b);
    if (L < F.minLeg) return Infinity;
    const d = dirOf(ang(b.x - a.x, b.z - a.z));
    let prev = heightAt(ctx.h, a.x, a.z);
    for (let s = 1; s <= L; s += 1) {
      const p = add(a, d, s);
      if (!onIsland(ctx, isl, p.x, p.z) || sdfAt(ctx, p.x, p.z) < F.minShore) return Infinity;
      const y = heightAt(ctx.h, p.x, p.z);
      over += Math.max(0, Math.abs(y - prev) - maxGrade);
      prev = y;
    }
    // the rect's depth axis is its rotY: along the leg
    const sh = rectShape((a.x + b.x) / 2, (a.z + b.z) / 2, ang(b.x - a.x, b.z - a.z), 1.6, L);
    if (!clearOf(ctx, isl, sh, F.gap, skip)) return Infinity;
  }
  return over;
}

interface Candidate {
  pts: XZ[];
  n: number;
  score: number;
}

/** The best `keep` zig-zags P → Q on the ground as it is now (before the pads), best first. */
function candidates(
  ctx: SiteCtx,
  isl: IslandData,
  P: XZ,
  Q: XZ,
  skip: readonly Shape[],
): Candidate[] {
  const F = S.funicular;
  const pre: { pts: XZ[]; n: number; pre: number }[] = [];
  for (const n of F.legs)
    for (const W of n === 1 ? [0] : F.swing)
      for (const rho of n <= 2 ? [1] : [1, 0])
        for (const sign of n === 1 ? [1] : [1, -1]) {
          const pts = zigzag(P, Q, n, W, sign, rho);
          const v = preScore(ctx, isl, pts, skip);
          if (Number.isFinite(v)) pre.push({ pts, n, pre: v + F.perLeg * n });
        }
  pre.sort((p, q) => p.pre - q.pre);
  const out: Candidate[] = [];
  for (const { pts, n } of pre.slice(0, F.level)) {
    const line = gradeLine(ctx, pts);
    if (!line) continue;
    out.push({ pts, n, score: sectionScore(line, n) });
  }
  return out.sort((p, q) => p.score - q.score).slice(0, F.keep);
}

/** Grade line of `pts` from the ground at its first stub point to the ground at its last. */
function gradeLine(ctx: SiteCtx, pts: readonly XZ[]): RailLine | null {
  const c = S.rail.clearance;
  const a = pts[0];
  const b = pts[pts.length - 1];
  return planRail(ctx.h, pts, heightAt(ctx.h, a.x, a.z) + c, heightAt(ctx.h, b.x, b.z) + c);
}

const sectionScore = (line: RailLine, n: number): number =>
  line.cost + S.funicular.perLeg * n + S.funicular.perU * line.arc[line.arc.length - 1];

/**
 * The mid station: the `funicular1` anchor, unless it splits the climb badly (its share of the
 * foot → top rise outside `midShare`, or it stands within `minSection` of the top); then the disc
 * on the foot → top line nearest half height (none fits: the anchor).
 */
function balancedMid(
  ctx: SiteCtx,
  isl: IslandData,
  s0: XZ,
  s1: XZ,
  s2: XZ | null,
  skip: readonly Shape[],
): XZ {
  const F = S.funicular;
  if (!s2) return s1;
  const y = (p: XZ): number => heightAt(ctx.h, p.x, p.z);
  const rise = y(s2) - y(s0);
  const share = rise > 0 ? (y(s1) - y(s0)) / rise : 0.5;
  if (share >= F.midShare[0] && share <= F.midShare[1] && dist(s1, s2) >= F.minSection) return s1;
  const D = dist(s0, s2);
  const u = { x: (s2.x - s0.x) / D, z: (s2.z - s0.z) / D };
  const ym = (y(s0) + y(s2)) / 2;
  const c = add(s0, u, D / 2);
  const r = DEVOPS_GROWTH.funicular.stationR;
  const p = bestSample(ctx, isl, c, D / 2, (q) => {
    const along = (q.x - s0.x) * u.x + (q.z - s0.z) * u.z;
    const side = Math.abs((q.x - s0.x) * -u.z + (q.z - s0.z) * u.x);
    if (along < F.minSection || D - along < F.minSection || side > F.midSide) return Infinity;
    const sh = discShape(q.x, q.z, r);
    if (!onLand(ctx, isl, sh, 2)) return Infinity;
    if (relief(ctx, sh) > F.midRelief) return Infinity;
    if (!clearOf(ctx, isl, sh, 1, skip)) return Infinity;
    return Math.abs(y(q) - ym) + 0.2 * side;
  });
  return p ?? s1;
}

/**
 * Stations on the anchors (rackShed v2, level pads; each faces along its station axis) and the
 * candidate zig-zags of each section, their strips reserved (lots and kit keep off, paths cross).
 * Without a fitting upper section the mid station is the top (front down the line).
 */
/** The funicular as placed: stations, candidate zig-zags per section, the shapes it owns. */
interface FunicularPlan {
  stations: number;
  sections: Candidate[][];
  /** Station rects (their pads), anchor discs and candidate strips: the earthworks may cut there. */
  own: Shape[];
}

function placeFunicular(ctx: SiteCtx, isl: IslandData): FunicularPlan {
  const F = S.funicular;
  const none = { stations: 0, sections: [], own: [] };
  const st = [0, 1, 2].map((k) => isl.anchors[`funicular${k}`]);
  if (!st[0] || !st[1]) return none;
  const s0 = st[0];
  const s2 = st[2] ?? null;
  const skip = reservedAt(ctx, isl, ...(s2 ? [s0, st[1], s2] : [s0, st[1]]));
  const s1 = balancedMid(ctx, isl, s0, st[1], s2, skip);
  const up0 = ang(s1.x - s0.x, s1.z - s0.z);
  const P0 = add(s0, dirOf(up0), F.stubFront);
  // the mid station: axis along foot → top (the line passes through it, front down the line)
  const upM = s2 ? ang(s2.x - s0.x, s2.z - s0.z) : up0;
  const P1 = add(s1, dirOf(upM), -F.stubFront);
  const lower = candidates(ctx, isl, P0, P1, skip);
  if (lower.length === 0) return none;
  let upper: Candidate[] = [];
  let upT = 0;
  if (s2) {
    upT = ang(s2.x - s1.x, s2.z - s1.z);
    const P2 = add(s1, dirOf(upM), F.stubBack);
    const P3 = add(s2, dirOf(upT), -F.stubFront);
    upper = candidates(ctx, isl, P2, P3, skip);
  }
  const stations: { p: XZ; rot: number }[] = [{ p: s0, rot: up0 }];
  if (upper.length > 0) {
    stations.push({ p: s1, rot: upM + Math.PI });
    stations.push({ p: s2 as XZ, rot: upT + Math.PI });
  } else {
    // no upper section: the mid station ends the line, its front at the lower stub point
    stations.push({ p: s1, rot: upM + Math.PI });
  }
  const P = F.station;
  const own: Shape[] = [...skip];
  for (const { p, rot } of stations) {
    const c = add(p, dirOf(rot), P.z);
    const sh = rectShape(c.x, c.z, rot, P.w, P.d);
    fixture(ctx, isl, 'rackShed', p, rot, DEVOPS_M25.station.variant, sh, {
      block: true,
      pad: P.padMargin,
    });
    own.push(sh);
  }
  const sections = upper.length > 0 ? [lower, upper] : [lower];
  for (const cands of sections)
    for (const c of cands)
      for (let k = 0; k + 1 < c.pts.length; k++) {
        const a = c.pts[k];
        const b = c.pts[k + 1];
        const sh = rectShape(
          (a.x + b.x) / 2,
          (a.z + b.z) / 2,
          ang(b.x - a.x, b.z - a.z),
          F.strip,
          dist(a, b),
        );
        addShape(ctx, isl, sh, false);
        own.push(sh);
      }
  return { stations: stations.length, sections, own };
}

/**
 * Per section: the candidate with the least earthwork on the final ground; the ground cut /
 * filled to its grade line (every other obstacle and pad core untouched), its line + levels;
 * then a lava lantern by every zig-zag vertex, clear of both sections' cars (a car pivoting at a
 * vertex sweeps half its length round it) on ground level enough for a post.
 */
function finishFunicular(ctx: SiteCtx, isl: IslandData, plan: SitePlan, fun: FunicularPlan): void {
  const F = S.funicular;
  const built: XZ[][] = [];
  for (const cands of fun.sections) {
    let best: { c: Candidate; line: RailLine } | null = null;
    let bs = Infinity;
    for (const c of cands) {
      const line = gradeLine(ctx, c.pts);
      if (!line || line.cost > F.maxCost) continue;
      const sc = sectionScore(line, c.n);
      if (sc < bs) {
        bs = sc;
        best = { c, line };
      }
    }
    if (!best) continue;
    earthworks(ctx, isl, best.line, fun.own);
    built.push(best.c.pts);
    (plan.lines ??= []).push({
      islandId: isl.id,
      kind: 'funicular',
      closed: false,
      points: best.c.pts,
      levels: best.line.pts.map((p) => p.y),
    });
  }
  const legs = built.flatMap((pts) => pts.slice(1).map((q, k) => [pts[k], q] as const));
  const sweep = DEVOPS_M25.car.length / 2 + 0.4;
  for (const pts of built)
    for (let k = 1; k + 1 < pts.length; k++) {
      const v = pts[k];
      const back = dirOf(ang(pts[k - 1].x - v.x, pts[k - 1].z - v.z));
      const fwd = dirOf(ang(pts[k + 1].x - v.x, pts[k + 1].z - v.z));
      const bis = { x: back.x + fwd.x, z: back.z + fwd.z };
      const bl = Math.hypot(bis.x, bis.z);
      const a0 = bl > 1e-3 ? ang(-bis.x, -bis.z) : ang(-back.z, back.x);
      for (const r of F.lantern)
        for (const da of [0, 0.45, -0.45, 0.9, -0.9]) {
          const p = add(v, dirOf(a0 + da), r);
          if (!onIsland(ctx, isl, p.x, p.z) || heightAt(ctx.h, p.x, p.z) < 0.5) continue;
          if (legs.some(([a, b]) => segDist(p, a, b) < sweep)) continue;
          const sh = discShape(p.x, p.z, 0.45);
          if (!clearOf(ctx, isl, sh, 0.2, fun.own)) continue;
          // a post needs gentle ground (the 2 u grid can't hold a level stand this close to the rail)
          if (postRelief(ctx, p, F.lanternR) > F.lanternRelief) continue;
          ctx.fixtures.push({
            defId: 'lavaLantern',
            x: p.x,
            z: p.z,
            rotY: a0 + da + Math.PI,
            islandId: isl.id,
          });
          addShape(ctx, isl, sh, false);
          break;
        }
    }
}

/**
 * Ground writer of the late earthworks: blends cell `i` toward `target` by `w`, never into
 * another pad's core or within `keepOff` of another obstacle (lots, fixtures, rails,
 * reservations), only round the funicular's own shapes. Returns false when a cell was kept.
 */
function groundWriter(
  ctx: SiteCtx,
  isl: IslandData,
  own: readonly Shape[],
): (i: number, target: number, w: number) => boolean {
  const h = ctx.h;
  const pads = ctx.pads.filter((p) => p.islandId === isl.id && !own.includes(p.shape));
  const keep = ctx.shapes[isl.id].filter((o) => !own.includes(o));
  return (i, target, w) => {
    if (ctx.islandMap[i] !== isl.id + 1 || ctx.sdf[i] <= 0) return false;
    const x = h.originX + (i % h.n) * h.cellSize;
    const z = h.originZ + Math.floor(i / h.n) * h.cellSize;
    if (pads.some((p) => shapeDist(p.shape, x, z) <= p.margin)) return false;
    if (keep.some((o) => shapeDist(o, x, z) <= S.rail.keepOff)) return false;
    h.data[i] = Math.max(FLATTEN.minHeight, h.data[i] + (target - h.data[i]) * w);
    return true;
  };
}

/** Cut / fill the island's ground to the line's pivot line (groundWriter rules). */
function earthworks(ctx: SiteCtx, isl: IslandData, line: RailLine, own: readonly Shape[]): void {
  const write = groundWriter(ctx, isl, own);
  railEarthworks(ctx.h, line, S.rail.core, S.rail.fall, (i, target, w) => void write(i, target, w));
}

/** Ground relief round a post at `p`: centre + 8 samples at radius `r`. */
function postRelief(ctx: SiteCtx, p: XZ, r: number): number {
  const ys = [heightAt(ctx.h, p.x, p.z)];
  for (let k = 0; k < 8; k++) {
    const q = add(p, dirOf((k * Math.PI) / 4), r);
    ys.push(heightAt(ctx.h, q.x, q.z));
  }
  return Math.max(...ys) - Math.min(...ys);
}

/* ---------------------------------- D13 ore cableway ---------------------------------- */

/** v3 at the quarry edge and on the foundry step, v2 between; returns the pylon count. */
function placeCableway(ctx: SiteCtx, isl: IslandData): number {
  const from = isl.anchors.cablewayFrom;
  const to = isl.anchors.cablewayTo;
  const size = isl.anchors.quarrySize;
  if (!from || !to || !size) return 0;
  const C = S.cableway;
  const [v2, v3] = DEVOPS_M25.ore.pylonVariants;
  const B = DEVOPS_M25.ore.bucket;
  // the quarry station on the quarry's foundry-side edge, front toward the foundry
  const q = add(from, dirOf(from.rotY), size.z / 2 - 1.5);
  const head = ang(to.x - q.x, to.z - q.z);
  const L = dist(q, to);
  const skip = reservedAt(ctx, isl, from, to);
  const yAt = (p: XZ): number => heightAt(ctx.h, p.x, p.z);
  const seat = (v: number, p: XZ, rot: number, back = false) =>
    oreAnchorWorld(v, { x: p.x, y: yAt(p), z: p.z }, rot, back);
  for (let n = Math.max(1, Math.ceil(L / C.span)); n <= C.maxPylons + 1; n++) {
    const mids: XZ[] = [];
    let ok = true;
    for (let k = 1; k < n && ok; k++) {
      // the nominal spot, nudged along the line (nearest first, ≤ 45 % of a span, ≥ 5 u) until
      // clear of every other obstacle
      const base = (L * k) / n;
      let got: XZ | null = null;
      const reach = Math.max(5, Math.floor((0.45 * L) / n));
      for (let j = 0; j <= 2 * reach; j++) {
        const dz = (j % 2 === 1 ? 1 : -1) * Math.ceil(j / 2);
        const p = add(q, dirOf(head), base + dz);
        const sh = discShape(p.x, p.z, C.pylonR);
        if (onLand(ctx, isl, sh, 1) && clearOf(ctx, isl, sh, 0.3, skip)) {
          got = p;
          break;
        }
      }
      if (got) mids.push(got);
      else ok = false;
    }
    if (!ok) continue;
    // the bucket bottoms clear the ground on every span
    const chain = [q, ...mids, to];
    const seats = chain.map((p, k) =>
      k === 0
        ? seat(v3, p, head)
        : k === chain.length - 1
          ? seat(v3, p, head + Math.PI)
          : seat(v2, p, head, true),
    );
    const fronts = chain.map((p, k) =>
      k > 0 && k < chain.length - 1 ? seat(v2, p, head) : seats[k],
    );
    for (let k = 0; k + 1 < chain.length && ok; k++) {
      const a = fronts[k];
      const b = seats[k + 1];
      for (let t = 0.1; t < 0.95; t += 0.1) {
        const c = mailCablePoint(a, b, t);
        if (c.y - B.grip < heightAt(ctx.h, c.x, c.z) + C.clear) ok = false;
      }
    }
    if (!ok) continue;
    chain.forEach((p, k) => {
      const end = k === 0 || k === chain.length - 1;
      const rot = k === chain.length - 1 ? head + Math.PI : head;
      fixture(ctx, isl, 'mailLine', p, rot, end ? v3 : v2, discShape(p.x, p.z, C.pylonR), {
        block: true,
      });
    });
    return chain.length;
  }
  return 0;
}

/* ---------------------------------- D14 smiths' lane ---------------------------------- */

function placeSmiths(ctx: SiteCtx, isl: IslandData): number {
  const lane = isl.anchors.smithsLane;
  const size = isl.anchors.smithsLaneSize;
  if (!lane || !size) return 0;
  const M = S.smiths;
  const w = size.x;
  const d = size.z;
  const f = dirOf(lane.rotY);
  const t = { x: -f.z, z: f.x };
  // the strip levels as one pad (its core = the strip) unless that pad's falloff would reach the
  // core of a pad on another level (the foundry rail, the lodges: they stay level); then each
  // stall gets a small pad of its own under the same rule, else it needs level ground
  const y = (p: XZ): number => heightAt(ctx.h, p.x, p.z);
  const clash = (sh: Shape, extra: number): boolean =>
    ctx.pads.some(
      (o) =>
        o.islandId === isl.id &&
        shapesOverlap(o.shape, sh, o.margin + extra + FLATTEN.falloff) &&
        Math.abs(y(o.shape) - y(sh)) > M.levelGap,
    );
  const m = M.padMargin;
  const strip = rectShape(lane.x, lane.z, lane.rotY, w - 2 * m, d - 2 * m);
  const whole = !clash(strip, m);
  if (whole) addPad(ctx, isl, strip, m);
  const n = Math.max(1, Math.floor((w - 0.6) / M.pitch));
  let made = 0;
  for (const side of [-1, 1]) {
    // row 1 is staggered by half a pitch when the lane has room for it
    const stagger = side > 0 && (n + 0.5) * M.pitch <= w - 0.6 ? M.pitch / 2 : 0;
    const off = side * (d / 2 - M.inset);
    for (let k = 0; k < n; k++) {
      const along = (k - (n - 1) / 2) * M.pitch + stagger;
      const p = add(add(lane, f, off), t, along);
      const sh = discShape(p.x, p.z, M.padR);
      const pad = whole || clash(sh, m) ? undefined : m;
      if (!whole && pad === undefined && relief(ctx, sh) > M.maxRelief) continue;
      fixture(
        ctx,
        isl,
        'goodsStall',
        p,
        side < 0 ? lane.rotY : lane.rotY + Math.PI,
        DEVOPS_M25.smith.variant,
        sh,
        { block: true, pad },
      );
      made++;
    }
  }
  return made;
}

/* ----------------------------------- D9 onsen town ----------------------------------- */

function placeOnsenTown(ctx: SiteCtx, isl: IslandData, stories: StorySpot[]): number {
  const town = isl.anchors.onsenTown;
  const size = isl.anchors.onsenTownSize;
  if (!town || !size) return 0;
  const O = S.onsen;
  const [hw, hd] = O.house;
  const f = dirOf(town.rotY);
  const t = { x: -f.z, z: f.x };
  const n = Math.min(O.max, Math.floor((size.x + O.gap) / (hw + O.gap)));
  const [va, vb] = DEVOPS_M25.onsen.variants;
  let made = 0;
  for (let k = 0; k < n; k++) {
    const along = (k - (n - 1) / 2) * (hw + O.gap);
    // the row stands on the pool side of the bank
    const p = add(add(town, t, along), f, size.z / 2 - hd / 2 - 0.4);
    const sh = rectShape(p.x, p.z, town.rotY, hw, hd);
    if (!onLand(ctx, isl, sh, 0.5)) continue;
    fixture(ctx, isl, 'onsenHouse', p, town.rotY, k % 2 === 0 ? va : vb, sh, {
      block: true,
      pad: O.padMargin,
    });
    made++;
  }
  if (made > 0) {
    const def = DEVOPS_CULTURE.storySpots.find((s) => s.kind === 'onsenTown');
    // the capybaras doze on the bank behind the houses (spot frame: +z toward the pool)
    const p = add(town, f, -size.z / 2 + O.capybaras);
    stories.push({
      kind: 'onsenTown',
      islandId: isl.id,
      pos: { x: p.x, y: 0, z: p.z },
      rotY: town.rotY,
      defs: def?.defs ?? ['onsenHouse'],
    });
  }
  return made;
}

/* ---------------------------------- D7 geyser field ---------------------------------- */

function placeGeysers(ctx: SiteCtx, isl: IslandData, rng: Rng): number {
  const field = isl.anchors.geyserField;
  const size = isl.anchors.geyserFieldSize;
  if (!field || !size) return 0;
  const G = S.geysers;
  const r = DEVOPS_M25.geyser.radius;
  const want = Math.max(G.min, Math.min(G.max, Math.round((size.x * size.z) / G.area)));
  const f = dirOf(field.rotY);
  const t = { x: -f.z, z: f.x };
  const skip = reservedAt(ctx, isl, field);
  const hw = size.x / 2 - G.inset;
  const hd = size.z / 2 - G.inset;
  const put: XZ[] = [];
  for (let tries = 0; tries < want * 30 && put.length < want; tries++) {
    const p = add(add(field, t, rng.range(-hw, hw)), f, rng.range(-hd, hd));
    if (put.some((o) => dist(o, p) < G.spacing)) continue;
    const sh = discShape(p.x, p.z, r);
    if (!onLand(ctx, isl, sh, 1) || !clearOf(ctx, isl, sh, 0.4, skip)) continue;
    fixture(ctx, isl, 'geyserCone', p, rng.range(0, Math.PI * 2), undefined, sh, {
      block: true,
      pad: G.padMargin,
    });
    put.push(p);
  }
  return put.length;
}
