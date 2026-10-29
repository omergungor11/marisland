/**
 * Research M28 "Summit Observatory" anchors (TASK-524, D-105): the Star Stair up the summit
 * crag's face, the meridian terrace beside the crag and the rim telescope deck sites. Plan time
 * (pre-pad ground, the summit / quad pads modelled): the stair's top landing and legs, the
 * meridian disc (its own pad) and the deck sites are searched and reserved, so the districts
 * placed after keep off them. Finish (pads levelled, footpaths carved): the stair is re-checked on
 * the final ground (else searched again) and its grade line carved into the crag; the decks are
 * re-measured (topped up from the free lip when fewer than two are left); every anchor is
 * published with its final height. No rng is drawn; no prop is placed (TASK-526 does).
 * Numbers: content/themes/research-anchors.ts (RESEARCH_ANCHORS).
 *
 * Anchor contract (world u; rotY = xz heading (cos, sin); `y` = world ground height):
 * - `starStair0..3` (`stairOf(isl)`): the stair polyline, 0 = the foot on the terrace lawn round
 *   the quad (≤ `stair.footReach` u past the quad pad core; TASK-526 links it to the network),
 *   1 / 2 = the switchbacks (each turns ≥ `stair.minTurn`), 3 = the top landing on the summit pad
 *   before the observatory door (`stair.top` u from the dome centre); y = ground; rotY = heading of
 *   the leg leaving the vertex (the top: the arriving leg's). The grade line foot → top is carved
 *   into the ground (≤ `stair.maxGrade`); the crag face leaves local pitches up to ≈ 2.5 over the
 *   2 u grid: lay it as a stair-kind path with STAIR_FLIGHT flights (rises ≤ 2.25 per 2 u run).
 * - `starLamp0..K-1` (6–8; 6–7 on the test seeds): lantern stations on the stair centre line, ≈ `stair.lampStep` u
 *   apart, y = ground, rotY = uphill heading of their leg (the side offset beside the steps is
 *   the placement's choice).
 * - `meridian`: centre of the 6 u dial disc on its flat pad at the crag's foot beside the summit
 *   (the bearing off the stair face, farthest from the quad and the headland), y = pad level,
 *   rotY = the noon sun's side (`southDeg`); `meridianSize` = { x: disc radius, z: disc radius }.
 *   Nothing stands on the disc (blocking reservation); the noon sun stands ≈ 86° high.
 * - `rimDeck0..K-1` (2–3): deck centre on the earth-wall lip, y = ground, rotY = outward shore
 *   normal (to sea); `rimDeckSize` = { x: width along the coast, z: depth }.
 * Every site is reserved (later pieces and scatter keep off). Tests track the rates (30 / 30).
 */
import { FLATTEN } from '../../../content/settlements.ts';
import { RESEARCH_ANCHORS as R } from '../../../content/themes/research-anchors.ts';
import { heightAt, type IslandData, type Polyline, type XZ } from '../../types.ts';
import { smoothstep } from '../../../core/math/index.ts';
import { cellX, cellZ, gridRange } from '../grid.ts';
import { coveness } from '../heightfield.ts';
import {
  add,
  addPad,
  addShape,
  ang,
  clear,
  dirOf,
  discShape,
  dist,
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
} from '../sites.ts';

const DEG = Math.PI / 180;
const TAU = Math.PI * 2;
const M = R.meridian;
const ST = R.stair;
const DK = R.deck;
const SOUTH = R.southDeg * DEG;
/** Shape tag of the stair's top-landing keep-out (the stair search skips it). */
const LANDING = 'starLanding';
/** Shape tag of the stair legs' reservation. */
const STAIR = 'starStair';
/** The pieces a stair took the place of (their pads stay; the stair's carve may cross them). */
const yielded = new WeakMap<IslandData, Shape[]>();
/** Shape tag of a rim deck reservation. */
const DECK = 'rimDeck';
/** Grid cells the stair carve moved, with the height change (TASK-526 paints the groove). */
const carved = new WeakMap<IslandData, Map<number, number>>();
/** Cells the Star Stair carve moved (cell index → height change, u); empty without a stair. */
export const stairCarve = (isl: IslandData): ReadonlyMap<number, number> =>
  carved.get(isl) ?? new Map();

/** Smallest absolute difference of two angles (rad). */
const angGap = (a: number, b: number): number => Math.abs(((a - b + 3 * Math.PI) % TAU) - Math.PI);
const heading = (a: XZ, b: XZ): number => ang(b.x - a.x, b.z - a.z);

function publish(isl: IslandData, key: string, p: XZ, rotY: number, y?: number): void {
  isl.anchors[key] = y === undefined ? { x: p.x, z: p.z, rotY } : { x: p.x, z: p.z, rotY, y };
}

/** Points of an island anchor chain `name0, name1, …` (empty when absent). */
export function anchorPoints(isl: IslandData, name: string): (XZ & { y: number; rotY: number })[] {
  const out: (XZ & { y: number; rotY: number })[] = [];
  for (let k = 0; isl.anchors[`${name}${k}`]; k++) {
    const a = isl.anchors[`${name}${k}`];
    out.push({ x: a.x, z: a.z, y: a.y ?? 0, rotY: a.rotY });
  }
  return out;
}

/** The Star Stair polyline (foot → top), empty when absent. */
export const stairOf = (isl: IslandData): (XZ & { y: number; rotY: number })[] =>
  anchorPoints(isl, 'starStair');

/**
 * R3 (plan time, right after the stair): the meridian disc at the crag's foot beside the summit,
 * its pad core `gap` u off the summit pad core (the crag face and the summit ring keep their
 * ground), on a bearing (every `stepDeg`) ≥ `flankGap` off the stair face; the bearing farthest
 * from the quad and the headland (the campus and the base keep their lawn) wins. Its own pad
 * and a blocking reservation (nothing stands on the dial). Returns the centre, or null.
 */
export function reserveMeridian(
  ctx: SiteCtx,
  isl: IslandData,
  obs: XZ,
  obsCore: number,
  quad: XZ,
): XZ | null {
  const face = stairAxis(obs, quad);
  const avoid = [quad, isl.anchors.headland].filter((p): p is XZ & { rotY: number } => !!p);
  // the dial's pad core stays off the summit pad core (the ring kit keeps its level)
  const d = obsCore + M.margin + M.gap + M.r;
  const cands: { c: XZ; score: number }[] = [];
  for (let k = 0; k * M.stepDeg < 360; k++) {
    const b = k * M.stepDeg * DEG;
    if (angGap(b, face) < M.flankGap * DEG) continue;
    const c = add(obs, dirOf(b), d);
    const score = avoid.reduce((acc, p) => acc + Math.cos(b - heading(obs, p)), 0);
    cands.push({ c, score });
  }
  cands.sort((p, q) => p.score - q.score);
  for (const { c } of cands) {
    const sh = discShape(c.x, c.z, M.r);
    // (its pad core keeps off the others: their floors and the stair's carve stay as they are)
    if (!onLand(ctx, isl, sh, M.minShore) || !clear(ctx, isl, sh, M.gap + M.margin)) continue;
    addShape(ctx, isl, sh, true);
    addPad(ctx, isl, sh, M.margin, M.step);
    return c;
  }
  return null;
}

/** Bearing of the stair face: the observatory → quad axis (the door side). */
const stairAxis = (obs: XZ, quad: XZ): number => heading(obs, quad);

/**
 * Plan time: keep the stair's top landing on the summit ring free (before the observatory door;
 * the academy's comet watch and the other summit kit pick their spots after this).
 */
export function reserveStairLanding(ctx: SiteCtx, isl: IslandData, obs: XZ, quad: XZ): void {
  const c = add(obs, dirOf(stairAxis(obs, quad)), ST.landing.at);
  addShape(ctx, isl, { ...discShape(c.x, c.z, ST.landing.r), tag: LANDING }, false);
}

interface StairCtx {
  ctx: SiteCtx;
  isl: IslandData;
  /** Obstacles the legs keep off. */
  shapes: Shape[];
  /** Footpath points (finish; empty at plan time). */
  walk: XZ[];
  /** Ground height (plan time: the pads' levels where they will be). */
  ground: (p: XZ) => number;
  /** The foot joins the network here (finish: by a footpath; plan time: by the quad plaza). */
  footOk: (p: XZ) => boolean;
  /** The shore / obstacle test rastered (`raster` u cells round the observatory; the search). */
  free?: (p: XZ) => boolean;
}

/** A point keeps `minShore` off the coast and `halfWidth` + `gap` off every obstacle. */
function pointFree(s: StairCtx, p: XZ): boolean {
  if (!onIsland(s.ctx, s.isl, p.x, p.z) || sdfAt(s.ctx, p.x, p.z) < ST.minShore) return false;
  const clearR = ST.halfWidth + ST.gap;
  for (const o of s.shapes)
    // the legs end on the plaza rim, never across the paving
    if (shapeDist(o, p.x, p.z) < (o.tag === 'plaza' ? -ST.plazaIn : clearR)) return false;
  return true;
}

/** `pointFree` rastered on `ST.raster` u cells within `reach` of `c` (nearest cell; outside: false). */
function rasterFree(s: StairCtx, c: XZ, reach: number): (p: XZ) => boolean {
  const e = ST.raster;
  const n = Math.ceil((2 * reach) / e) + 1;
  const x0 = c.x - reach;
  const z0 = c.z - reach;
  const ok = new Uint8Array(n * n);
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++)
      ok[j * n + i] = pointFree(s, { x: x0 + i * e, z: z0 + j * e }) ? 1 : 0;
  return (p) => {
    const i = Math.round((p.x - x0) / e);
    const j = Math.round((p.z - z0) / e);
    return i >= 0 && j >= 0 && i < n && j < n && ok[j * n + i] === 1;
  };
}

/**
 * True when a leg a → b keeps `minShore` off the coast, `halfWidth` + `gap` off every obstacle
 * and `pathGap` off every footpath outside `join` u of `ends` (sampled every `sample` u).
 */
function legClear(s: StairCtx, a: XZ, b: XZ, ends: readonly XZ[]): boolean {
  const n = Math.max(1, Math.ceil(dist(a, b) / ST.sample));
  for (let k = 0; k <= n; k++) {
    const p = { x: a.x + ((b.x - a.x) * k) / n, z: a.z + ((b.z - a.z) * k) / n };
    if (!(s.free ? s.free(p) : pointFree(s, p))) return false;
    if (!ends.some((e) => dist(p, e) <= ST.join))
      for (const w of s.walk) if (dist(w, p) < ST.pathGap) return false;
  }
  return true;
}

/** Arc lengths of a polyline's vertices (0 at the first). */
function arcOf(pts: readonly XZ[]): number[] {
  const arc = [0];
  for (let k = 1; k < pts.length; k++) arc.push(arc[k - 1] + dist(pts[k - 1], pts[k]));
  return arc;
}

/**
 * The stair's grade line: from the foot (pts[0]) to the top at one grade along the arc. Returns
 * the largest gap between the ground and the line (what the finish carve moves), or null when
 * the grade is over `maxGrade` (sampling stops once the gap passes `cap`).
 */
function stairCut(s: StairCtx, pts: readonly XZ[], cap = Infinity): number | null {
  const arc = arcOf(pts);
  const L = arc[arc.length - 1];
  const y0 = s.ground(pts[0]);
  const y1 = s.ground(pts[pts.length - 1]);
  if (Math.abs(y1 - y0) / L > ST.maxGrade) return null;
  let cut = 0;
  for (let k = 0; k + 1 < pts.length; k++) {
    const a = pts[k];
    const b = pts[k + 1];
    const n = Math.max(1, Math.ceil((arc[k + 1] - arc[k]) / ST.sample));
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const p = { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t };
      const line = y0 + ((y1 - y0) * (arc[k] + (arc[k + 1] - arc[k]) * t)) / L;
      cut = Math.max(cut, Math.abs(s.ground(p) - line));
      // (over the cap: the caller drops it anyway)
      if (cut > cap) return cut;
    }
  }
  return cut;
}

/** Heading change (rad) at a vertex. */
const turnAt = (a: XZ, b: XZ, c: XZ): number => angGap(heading(a, b), heading(b, c));

/**
 * R2: the stair up the crag face, searched in the face frame round the observatory (top landing
 * on the summit pad, two switchbacks, the foot on the quad terrace): every leg clear, the grade
 * line ≤ `maxGrade`, the least cut (+ length / turn penalties) wins. Returns foot → top, or null.
 */
function findStair(s: StairCtx, obs: XZ, quad: XZ, top: number, quadY: number): XZ[] | null {
  // only the obstacles and walks within the lattice's reach matter
  const reach = ST.radial[1] + Math.max(...ST.tiers.map((t) => Math.max(...t.across))) + 4;
  const near = (p: XZ): boolean => dist(p, obs) < reach;
  const sn: StairCtx = { ...s, shapes: s.shapes.filter(near), walk: s.walk.filter(near) };
  sn.free = rasterFree(sn, obs, reach);
  // the strict lattice coarse then fine, then the wider tiers, until one finds a stair
  for (const tier of ST.tiers)
    for (const step of tier.steps) {
      const best = searchStair(sn, obs, quad, top, quadY, step, tier);
      if (best) return best;
    }
  return null;
}

/** One lattice of the stair search (`findStair`). */
function searchStair(
  s: StairCtx,
  obs: XZ,
  quad: XZ,
  top: number,
  quadY: number,
  step: number,
  tier: (typeof ST.tiers)[number],
): XZ[] | null {
  const axis = stairAxis(obs, quad);
  let best: XZ[] | null = null;
  let bs = Infinity;
  const [r0, r1] = ST.radial;
  for (const t of tier.turns) {
    const phi = axis + t * DEG;
    const eu = dirOf(phi);
    const ev = dirOf(phi + Math.PI / 2);
    const at = (u: number, v: number): XZ => ({
      x: obs.x + eu.x * u + ev.x * v,
      z: obs.z + eu.z * u + ev.z * v,
    });
    for (const sg of [1, -1])
      for (const a of tier.across)
        for (const rt of ST.top) {
          const p0 = at(rt, 0);
          // the last leg's clearance per (u2, u3, foot offset): the same for every u1
          const leg2 = new Map<string, boolean>();
          if (s.ground(p0) < top - 0.3) continue;
          for (let u1 = r0; u1 <= r1; u1 += step) {
            const p1 = at(u1, -sg * a);
            if (dist(p0, p1) < ST.minLeg || !legClear(s, p0, p1, [p0])) continue;
            for (let u2 = u1 + step; u2 <= r1; u2 += step) {
              const p2 = at(u2, sg * a);
              if (turnAt(p0, p1, p2) < ST.minTurn * DEG || !legClear(s, p1, p2, [p0])) continue;
              for (let u3 = u2 + step; u3 <= r1; u3 += step)
                for (const f of ST.footAcross) {
                  if (f > a) continue;
                  const p3 = at(u3, -sg * f);
                  if (turnAt(p1, p2, p3) < ST.minTurn * DEG) continue;
                  const len = dist(p0, p1) + dist(p1, p2) + dist(p2, p3);
                  if (len < ST.length[0] || len > ST.length[1]) continue;
                  // near the preferred length, the axis and the quad (the foot on its rim first)
                  const pen =
                    0.02 * Math.abs(len - ST.length[2]) +
                    0.002 * Math.abs(t) +
                    ST.footCost * dist(p3, quad);
                  if (pen >= bs) continue;
                  if (s.ground(p3) > quadY + ST.footAbove || !s.footOk(p3)) continue;
                  // the first and last legs keep apart
                  if (
                    Math.min(segDist(p2, p0, p1), segDist(p3, p0, p1), segDist(p1, p2, p3)) <
                    ST.legGap
                  )
                    continue;
                  const k2 = `${u2},${u3},${f}`;
                  let c2 = leg2.get(k2);
                  if (c2 === undefined) leg2.set(k2, (c2 = legClear(s, p2, p3, [p0, p3])));
                  if (!c2) continue;
                  const cap = Math.min(tier.maxCut, (bs - pen) / ST.cutCost);
                  const cut = stairCut(s, [p3, p2, p1, p0], cap);
                  if (cut === null || cut > cap) continue;
                  if (cut * ST.cutCost + pen < bs) {
                    bs = cut * ST.cutCost + pen;
                    best = [p3, p2, p1, p0];
                  }
                }
            }
          }
        }
  }
  return best;
}

/** Leg reservations (`reserve` each side: the carve's reach), tagged the stair's own. */
const legShapes = (pts: readonly XZ[]): Shape[] =>
  pts.slice(1).map((b, k) => {
    const a = pts[k];
    const m = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
    return { ...rectShape(m.x, m.z, heading(a, b), 2 * ST.reserve, dist(a, b)), tag: STAIR };
  });

/**
 * R2 (plan time, after the quad ring and the landing): the stair searched on the ground the pads
 * will leave (the summit / quad pad levels blended out over their falloff), its legs reserved
 * (`reserve` each side; later pieces keep off). Returns foot → top, or null.
 */
export function planStair(
  ctx: SiteCtx,
  isl: IslandData,
  obs: XZ,
  obsCore: number,
  quad: XZ,
  quadCore: number,
): XZ[] | null {
  const top = heightAt(ctx.h, obs.x, obs.z);
  const quadY = heightAt(ctx.h, quad.x, quad.z);
  // the pads' levels: the core flat, blended out over the falloff (applyPads, one pad at a time)
  const padded = (p: XZ, c: XZ, core: number, y: number, h: number): number =>
    h + (y - h) * (1 - smoothstep(0, FLATTEN.falloff, dist(p, c) - core));
  const ground = (p: XZ): number =>
    padded(p, quad, quadCore, quadY, padded(p, obs, obsCore, top, heightAt(ctx.h, p.x, p.z)));
  // (the observatory: the stair arrives at its door, the legs run outward from the landing)
  const all = ctx.shapes[isl.id].filter((o) => o.tag !== LANDING && dist(o, obs) > 0.05);
  const footOk = (p: XZ): boolean => dist(p, quad) <= quadCore + ST.footReach;
  const search = (shapes: Shape[]): XZ[] | null =>
    findStair({ ctx, isl, shapes, walk: [], ground, footOk }, obs, quad, top, quadY);
  // the quad ring may stand on the only face: then the stair wins over the `yieldTo` pieces it
  // runs through (their fixtures and obstacles go; their pads stay)
  const yielding = (o: Shape): boolean =>
    ctx.fixtures.some(
      (f) =>
        f.islandId === isl.id &&
        (ST.yieldTo as readonly string[]).includes(f.defId) &&
        f.x === o.x &&
        f.z === o.z,
    );
  let stair = search(all);
  if (!stair) {
    stair = search(all.filter((o) => !yielding(o)));
    if (stair) {
      const legs = legShapes(stair);
      const gone = all.filter((o) => yielding(o) && legs.some((l) => shapesOverlap(l, o, ST.gap)));
      ctx.shapes[isl.id] = ctx.shapes[isl.id].filter((o) => !gone.includes(o));
      // (their pads stay: a neighbour's core may lean on them; the stair's carve may cross them)
      yielded.set(isl, gone);
      for (let i = ctx.fixtures.length - 1; i >= 0; i--) {
        const f = ctx.fixtures[i];
        if (f.islandId === isl.id && gone.some((o) => o.x === f.x && o.z === f.z))
          ctx.fixtures.splice(i, 1);
      }
    }
  }
  // non-blocking: the later pieces keep off; footpaths may still cross (a blocking zigzag can
  // wall the quad hub in)
  if (stair) for (const sh of legShapes(stair)) addShape(ctx, isl, sh, false);
  return stair;
}

/**
 * Finish: carve the stair's grade line (foot → top at one grade along the arc) into the ground:
 * within `carve.core` u of a leg (the nearest leg per cell) the ground takes the line, blended out
 * over `carve.fall` (cut and fill); never inside a pad's core (the summit and quad pads it joins:
 * the landing and the foot stand there) nor within `carve.keepOff` of another pad's core (the
 * pads of the pieces it replaced excepted) or of an obstacle.
 */
function carveStair(ctx: SiteCtx, isl: IslandData, pts: readonly XZ[], joins: readonly XZ[]): void {
  const h = ctx.h;
  const arc = arcOf(pts);
  const L = arc[arc.length - 1];
  const y0 = heightAt(h, pts[0].x, pts[0].z);
  const y1 = heightAt(h, pts[pts.length - 1].x, pts[pts.length - 1].z);
  // the pads of the pieces the stair replaced are no obstacle; the summit and quad pads it joins
  // keep their cores (the landing and the foot stand there) but not the keep-off
  const gone = yielded.get(isl) ?? [];
  const joined = (o: Shape): boolean => joins.some((j) => dist(o, j) < 0.05);
  const pads = ctx.pads.filter((p) => p.islandId === isl.id && !gone.includes(p.shape));
  // (the observatory's own footprint stays: its floor is never carved)
  const keep = ctx.shapes[isl.id].filter(
    (o) => o.tag !== STAIR && o.tag !== LANDING && o.tag !== 'plaza' && !gone.includes(o),
  );
  const C = ST.carve;
  const R = C.core + C.fall;
  const moved = new Map<number, number>();
  carved.set(isl, moved);
  // per cell: the nearest leg's grade line (legs meet at the switchbacks)
  const best = new Map<number, { d: number; y: number }>();
  for (let k = 0; k + 1 < pts.length; k++) {
    const a = pts[k];
    const b = pts[k + 1];
    const len = arc[k + 1] - arc[k];
    const [x0, x1] = gridRange(Math.min(a.x, b.x) - R, Math.max(a.x, b.x) + R);
    const [z0, z1] = gridRange(Math.min(a.z, b.z) - R, Math.max(a.z, b.z) + R);
    for (let iz = z0; iz <= z1; iz++)
      for (let ix = x0; ix <= x1; ix++) {
        const p = { x: cellX(ix), z: cellZ(iz) };
        const t = Math.max(
          0,
          Math.min(1, ((p.x - a.x) * (b.x - a.x) + (p.z - a.z) * (b.z - a.z)) / (len * len)),
        );
        const d = dist(p, { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t });
        const i = iz * ctx.n + ix;
        if (d > R || (best.get(i)?.d ?? Infinity) <= d) continue;
        best.set(i, { d, y: y0 + ((y1 - y0) * (arc[k] + len * t)) / L });
      }
  }
  for (const [i, { d, y }] of best) {
    if (ctx.islandMap[i] !== isl.id + 1 || ctx.sdf[i] <= 0) continue;
    const x = cellX(i % ctx.n);
    const z = cellZ(Math.floor(i / ctx.n));
    if (pads.some((q) => shapeDist(q.shape, x, z) <= q.margin + (joined(q.shape) ? 0 : C.keepOff)))
      continue;
    if (keep.some((o) => shapeDist(o, x, z) <= C.keepOff)) continue;
    const w = d <= C.core ? 1 : 1 - smoothstep(0, C.fall, d - C.core);
    const dy = (y - h.data[i]) * w;
    h.data[i] += dy;
    moved.set(i, dy);
  }
}

/** Lantern stations every ≈ lampStep u along the polyline (count clamped to `lamps`). */
function lampStations(pts: readonly XZ[]): { p: XZ; rot: number }[] {
  const lens = pts.slice(1).map((p, k) => dist(pts[k], p));
  const L = lens.reduce((a, b) => a + b, 0);
  const n = Math.min(ST.lamps[1], Math.max(ST.lamps[0], Math.round(L / ST.lampStep)));
  const out: { p: XZ; rot: number }[] = [];
  for (let k = 0; k < n; k++) {
    let s = ((k + 0.5) * L) / n;
    let j = 0;
    while (j < lens.length - 1 && s > lens[j]) s -= lens[j++];
    const a = pts[j];
    const b = pts[j + 1];
    const f = s / lens[j];
    out.push({ p: { x: a.x + (b.x - a.x) * f, z: a.z + (b.z - a.z) * f }, rot: heading(a, b) });
  }
  return out;
}

/** A rim deck site: centre on the lip and its outward heading. */
export interface DeckSite {
  c: XZ;
  rot: number;
}

const deckShape = (d: DeckSite): Shape => rectShape(d.c.x, d.c.z, d.rot, DK.w, DK.d);

/** Deck relief, its sea edge on the lip and the drop past it (the measured edge rules). */
function deckGround(ctx: SiteCtx, d: DeckSite, rel: number): boolean {
  const y = heightAt(ctx.h, d.c.x, d.c.z);
  if (relief(ctx, deckShape(d)) > rel) return false;
  const edge = add(d.c, dirOf(d.rot), DK.d / 2 + DK.lipIn);
  if (heightAt(ctx.h, edge.x, edge.z) < y - rel) return false;
  const past = add(d.c, dirOf(d.rot), DK.d / 2 + DK.beyond);
  return heightAt(ctx.h, past.x, past.z) <= y - DK.drop;
}

/**
 * Deck candidates on the earth-wall lip (every `grid` u, shore distance in `shore`), the most
 * windward first; `ok` adds the obstacle / footpath rules of the phase.
 */
function deckCands(
  ctx: SiteCtx,
  isl: IslandData,
  ok: (d: DeckSite) => boolean,
  rel: number = DK.maxRelief,
  shore: readonly [number, number] = DK.shore,
): DeckSite[] {
  const windward = ctx.windDir + Math.PI;
  const cands: (DeckSite & { key: number })[] = [];
  const docks = ctx.docks.filter((d) => d.islandId === isl.id);
  const head = isl.anchors.headland;
  const e = 0.75;
  for (let z = isl.minZ; z <= isl.maxZ; z += DK.grid)
    for (let x = isl.minX; x <= isl.maxX; x += DK.grid) {
      if (!onIsland(ctx, isl, x, z)) continue;
      const sd = sdfAt(ctx, x, z);
      if (sd < shore[0] || sd > shore[1]) continue;
      // outward normal: down the shore distance
      const gx = sdfAt(ctx, x + e, z) - sdfAt(ctx, x - e, z);
      const gz = sdfAt(ctx, x, z + e) - sdfAt(ctx, x, z - e);
      if (Math.hypot(gx, gz) < 1e-6) continue;
      const d = { c: { x, z }, rot: ang(-gx, -gz) };
      if (coveness(isl, ctx.windDir, x, z) >= DK.cove) continue;
      if (docks.some((k) => dist(k, d.c) < DK.pier)) continue;
      if (head && dist(head, d.c) < DK.promontory) continue;
      if (!deckGround(ctx, d, rel) || !ok(d)) continue;
      cands.push({ ...d, key: -Math.cos(d.rot - windward) });
    }
  cands.sort((p, q) => p.key - q.key);
  return cands.map((k) => ({ c: k.c, rot: k.rot }));
}

/** Up to `count[1]` candidates at least `apart` u apart, in candidate order. */
function spread(cands: readonly DeckSite[], apart: number): DeckSite[] {
  const out: DeckSite[] = [];
  for (const k of cands) {
    if (out.length >= DK.count[1]) break;
    if (out.some((o) => dist(o.c, k.c) < apart)) continue;
    out.push(k);
  }
  return out;
}

/**
 * R4 (plan time, after the headland base): deck sites on the earth-wall lip the districts left,
 * the most windward first, `apart` u apart (down to `minApart` when fewer than `count[0]` fit).
 * Reserved blocking: the footpaths and every later piece keep off.
 */
export function reserveRimDecks(ctx: SiteCtx, isl: IslandData): DeckSite[] {
  const cands = deckCands(ctx, isl, (d) => clear(ctx, isl, deckShape(d), DK.gap));
  let out = spread(cands, DK.apart);
  if (out.length < DK.count[0]) out = spread(cands, DK.minApart);
  for (const d of out) {
    addShape(ctx, isl, { ...deckShape(d), tag: DECK }, true);
  }
  return out;
}

/**
 * Finish: the plan-time decks whose floor a later pad's falloff left within `settleRelief` (the
 * deck stands on posts) and no footpath on them.
 */
function settleDecks(
  ctx: SiteCtx,
  isl: IslandData,
  decks: readonly DeckSite[],
  walk: readonly XZ[],
): DeckSite[] {
  const offPaths = (d: DeckSite): boolean =>
    !walk.some((w) => shapeDist(deckShape(d), w.x, w.z) < DK.pathGap);
  const out = decks.filter((d) => relief(ctx, deckShape(d)) <= DK.settleRelief && offPaths(d));
  if (out.length >= DK.count[0]) return out;
  // top up from the final lip: the free spots the districts left (their own gaps kept), on the
  // `topUp` band and gap
  const T = DK.topUp;
  const others = ctx.shapes[isl.id].filter((o) => o.tag !== DECK);
  const cands = deckCands(
    ctx,
    isl,
    (d) => offPaths(d) && !others.some((o) => shapesOverlap(o, deckShape(d), T.gap)),
    DK.settleRelief,
    T.shore,
  );
  for (const d of cands) {
    if (out.length >= DK.count[0]) break;
    if (out.some((o) => dist(o.c, d.c) < T.apart)) continue;
    out.push(d);
    addShape(ctx, isl, deckShape(d), false);
  }
  return out;
}

/**
 * Finish pass (TASK-524): publishes the meridian, settles the Star Stair on the final ground (the
 * plan-time one when its paths and cut still hold, else a fresh search), carves its grade line,
 * publishes it and its lantern stations, settles the rim decks.
 */
export function reserveResearchAnchors(
  ctx: SiteCtx,
  isl: IslandData,
  obs: XZ | null,
  quad: XZ,
  quadCore: number,
  planned: readonly XZ[] | null,
  meridian: XZ | null,
  decks: readonly DeckSite[],
  paths: readonly Polyline[],
): void {
  const H = (p: XZ): number => heightAt(ctx.h, p.x, p.z);
  if (meridian) {
    publish(isl, 'meridian', meridian, SOUTH, H(meridian));
    publish(isl, 'meridianSize', { x: M.r, z: M.r }, 0);
  }
  const walk = paths.filter((p) => p.islandId === isl.id).flatMap((p) => p.points);
  if (obs) {
    const shapes = ctx.shapes[isl.id].filter(
      (o) => o.tag !== LANDING && o.tag !== STAIR && dist(o, obs) > 0.05,
    );
    // the foot on the terrace lawn round the quad (TASK-526 links it to the network)
    const footOk = (p: XZ): boolean => dist(p, quad) <= quadCore + ST.footReach;
    // the observatory door's own walk (it ends at the landing: the stair takes it over) is no
    // obstacle
    const door = add(obs, dirOf(stairAxis(obs, quad)), ST.landing.at);
    const others = paths
      .filter((p) => p.islandId === isl.id)
      .filter((p) => !p.points.some((q) => dist(q, door) <= ST.landing.r + ST.join))
      .flatMap((p) => p.points);
    const sc: StairCtx = { ctx, isl, shapes, walk: others, ground: H, footOk };
    // (the later pieces kept their own gaps off the reserved legs: only the paths and the cut)
    const ok = (pts: readonly XZ[]): boolean => {
      const ends = [pts[0], pts[pts.length - 1]];
      const free = { ...sc, shapes: [] };
      if (!pts.slice(1).every((b, k) => legClear(free, pts[k], b, ends))) return false;
      const cut = stairCut(sc, pts);
      return cut !== null && cut <= ST.tiers[ST.tiers.length - 1].maxCut && footOk(pts[0]);
    };
    const kept = planned && ok(planned) ? planned : null;
    const stair = kept ?? findStair(sc, obs, quad, H(obs), H(quad));
    if (stair) {
      if (!kept) for (const sh of legShapes(stair)) addShape(ctx, isl, sh, false);
      carveStair(ctx, isl, stair, [obs, quad]);
      stair.forEach((p, k) =>
        publish(
          isl,
          `starStair${k}`,
          p,
          k < stair.length - 1 ? heading(p, stair[k + 1]) : heading(stair[k - 1], p),
          H(p),
        ),
      );
      lampStations(stair).forEach((l, k) => publish(isl, `starLamp${k}`, l.p, l.rot, H(l.p)));
    }
  }
  settleDecks(ctx, isl, decks, walk).forEach((d, k) =>
    publish(isl, `rimDeck${k}`, d.c, d.rot, H(d.c)),
  );
  if (isl.anchors.rimDeck0) publish(isl, 'rimDeckSize', { x: DK.w, z: DK.d }, 0);
}
