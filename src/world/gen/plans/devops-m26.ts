/**
 * DevOps M26 "DevOps II" placement (TASK-509c, D-093): the TASK-509b lava pack on the TASK-503 growth
 * anchors (devops-growth.ts). `placeM26` runs right after `placeM25` (before the Ember Smiths kit, the
 * lodges, the village and the M22 quick wins, which keep off it); its `finish` runs in `plan.finish`
 * after the funicular earthworks and before the road lanterns. Numbers: DEVOPS_M26_SITE.
 * - D1 lava bed (finish): carved along the `lavaChannel` anchors, `world.fences` kind 'lava' with the
 *   bed height per point in `levels` (render/lava.ts `lavaFlows` reads it; the fall stays at `lavaFall`).
 * - D3 ember bridge: emberBridge v0 on the most level crossing of the channel's lower reach; the bed is
 *   blocked for footpaths elsewhere and both ends are linked (planned before the paths); in finish its
 *   pivot y is planned (`FixtureData.y`), the abutments levelled and ramped to the path. (v1, the rail
 *   bridge, is for a track over the bed: no seed has one, the funicular and foundry rail keep off.)
 * - D6 crater deck on `craterDeck` (disc pad) + a stargazer story spot (`deckGazer`, finish).
 * - D17 glass kiln beside the smiths' lane, mouth toward the lane (rect pad).
 * - D10 obsidian decor on the `obsidianBeach` rect and the shelf in front of it.
 * - D18 breakwater near the `breakwater` anchor where its rubble foot stays buried in the seabed.
 * Missing anchors skip a piece. Every random choice draws from `rng`.
 */
import type { Rng } from '../../../core/rng.ts';
import { DEVOPS_M26 } from '../../../content/themes/devops-m26.ts';
import { DEVOPS_M26_SITE } from '../../../content/themes/devops-m26-site.ts';
import { DEVOPS_GROWTH } from '../../../content/themes/devops-growth.ts';
import { DEVOPS_CULTURE } from '../../../content/cultures/devops.ts';
import { FLATTEN } from '../../../content/settlements.ts';
import { DEVOPS_M25_SITE } from '../../../content/themes/devops-m25-site.ts';
import { heightAt } from '../../types.ts';
import type { IslandData, StorySpot, XZ } from '../../types.ts';
import { anchorChain } from './devops-growth.ts';
import {
  add,
  addPad,
  addShape,
  ang,
  bestSample,
  clear,
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
  siteFree,
  type Shape,
  type SiteCtx,
  type SitePlan,
} from '../sites.ts';

const S = DEVOPS_M26_SITE;
const smooth = (t: number): number => {
  const u = Math.max(0, Math.min(1, t));
  return u * u * (3 - 2 * u);
};

export interface M26Result {
  deck: boolean;
  kiln: boolean;
  obsidian: number;
  breakwater: boolean;
  bridge: boolean;
  /**
   * Late pass (plan.finish, after the funicular earthworks, before the road lanterns): carves the
   * lava bed, builds the bridge over it and adds the deck's story spot.
   */
  finish(): void;
}

export function placeM26(
  ctx: SiteCtx,
  isl: IslandData,
  plan: SitePlan,
  rng: Rng,
  stories: StorySpot[],
): M26Result {
  const deck = placeCraterDeck(ctx, isl);
  const bridge = planBridge(ctx, isl, plan);
  const kiln = placeKiln(ctx, isl);
  const obsidian = placeObsidian(ctx, isl, rng.fork('obsidian'));
  const breakwater = placeBreakwater(ctx, isl);
  return {
    deck: deck !== null,
    bridge: bridge !== null,
    kiln,
    obsidian,
    breakwater,
    finish: () => {
      const bed = carveLava(ctx, isl, plan, bridge ? [bridge.sh] : []);
      if (bed && bridge) buildBridge(ctx, isl, bed, bridge);
      if (deck) {
        deckGround(ctx, isl, deck);
        deckStory(deck, isl, stories);
      }
    },
  };
}

/* ------------------------------------ ground writer ------------------------------------ */

/**
 * Late earthworks writer (the TASK-507 `groundWriter` rules): blends cell `i` toward `target` by `w`,
 * never into another pad's core or within `keepOff` of another obstacle (lots, fixtures, rails,
 * reservations) — only round `own`. `cutOnly` never raises the ground.
 */
function groundWriter(
  ctx: SiteCtx,
  isl: IslandData,
  own: readonly Shape[],
): (i: number, target: number, w: number, cutOnly: boolean) => void {
  const h = ctx.h;
  const pads = ctx.pads.filter((p) => p.islandId === isl.id && !own.includes(p.shape));
  const keep = ctx.shapes[isl.id].filter((o) => !own.includes(o));
  const keepOff = DEVOPS_M25_SITE.rail.keepOff;
  return (i, target, w, cutOnly) => {
    if (ctx.islandMap[i] !== isl.id + 1 || ctx.sdf[i] <= 0) return;
    if (cutOnly && target >= h.data[i]) return;
    const x = h.originX + (i % h.n) * h.cellSize;
    const z = h.originZ + Math.floor(i / h.n) * h.cellSize;
    if (pads.some((p) => shapeDist(p.shape, x, z) <= p.margin)) return;
    if (keep.some((o) => shapeDist(o, x, z) <= keepOff)) return;
    h.data[i] = Math.max(FLATTEN.minHeight, h.data[i] + (target - h.data[i]) * w);
  };
}

/** Grid cells within `r` of `c` (row-major order). */
function cellsNear(ctx: SiteCtx, c: XZ, r: number, visit: (i: number, p: XZ) => void): void {
  const h = ctx.h;
  const x0 = Math.max(0, Math.floor((c.x - r - h.originX) / h.cellSize));
  const x1 = Math.min(h.n - 1, Math.ceil((c.x + r - h.originX) / h.cellSize));
  const z0 = Math.max(0, Math.floor((c.z - r - h.originZ) / h.cellSize));
  const z1 = Math.min(h.n - 1, Math.ceil((c.z + r - h.originZ) / h.cellSize));
  for (let iz = z0; iz <= z1; iz++)
    for (let ix = x0; ix <= x1; ix++)
      visit(iz * h.n + ix, { x: h.originX + ix * h.cellSize, z: h.originZ + iz * h.cellSize });
}

/* ------------------------------------- D1 lava bed ------------------------------------- */

/** The carved bed: centre line (the anchors), bed height per point, arc length per point. */
interface LavaBed {
  pts: XZ[];
  levels: number[];
  arc: number[];
  own: Shape[];
}

/** Bed height at arc `s` (linear between the points). */
function bedAt(bed: LavaBed, s: number): number {
  const { arc, levels } = bed;
  if (s <= 0) return levels[0];
  for (let k = 0; k + 1 < arc.length; k++)
    if (s <= arc[k + 1]) {
      const t = (s - arc[k]) / Math.max(arc[k + 1] - arc[k], 1e-6);
      return levels[k] + (levels[k + 1] - levels[k]) * t;
    }
  return levels[levels.length - 1];
}

/**
 * Bed levels along the channel (dense, then per point): `depth` below the ground, never climbing
 * downstream (a shoulder is cut, ≤ `maxCut`), never below `minBed`; the ground cut / filled to it
 * across the core and cut back to the ground over the blend; the line recorded as kind 'lava'.
 */
function carveLava(
  ctx: SiteCtx,
  isl: IslandData,
  plan: SitePlan,
  /** Shapes standing on the bed (the bridge): the carve runs under them. */
  over: readonly Shape[],
): LavaBed | null {
  const L = S.lava;
  const pts = anchorChain(isl, 'lavaChannel');
  if (pts.length < 2) return null;
  const arc = [0];
  for (let k = 1; k < pts.length; k++) arc.push(arc[k - 1] + dist(pts[k - 1], pts[k]));
  const total = arc[arc.length - 1];
  const yAt = (p: XZ): number => heightAt(ctx.h, p.x, p.z);
  const pointAt = (s: number): XZ => {
    let k = 0;
    while (k < pts.length - 2 && arc[k + 1] < s) k++;
    const t = (s - arc[k]) / Math.max(arc[k + 1] - arc[k], 1e-6);
    return {
      x: pts[k].x + (pts[k + 1].x - pts[k].x) * t,
      z: pts[k].z + (pts[k + 1].z - pts[k].z) * t,
    };
  };
  const n = Math.max(2, Math.ceil(total / L.sample) + 1);
  const dense: number[] = [];
  let run = Infinity;
  for (let j = 0; j < n; j++) {
    const s = (j / (n - 1)) * total;
    const g = yAt(pointAt(s)) - L.depth;
    run = Math.max(Math.min(run, g), g - L.maxCut, L.minBed);
    dense.push(run);
  }
  const levelAt = (s: number): number => {
    const f = (s / total) * (n - 1);
    const j = Math.min(n - 2, Math.floor(f));
    return dense[j] + (dense[j + 1] - dense[j]) * (f - j);
  };
  const levels = arc.map(levelAt);
  const own = [...lavaStrips(ctx, isl, pts), ...over];
  const write = groundWriter(ctx, isl, own);
  const R = L.core + L.fall;
  const best = new Map<number, { d: number; y: number }>();
  for (let k = 0; k + 1 < pts.length; k++) {
    const a = pts[k];
    const b = pts[k + 1];
    const len = arc[k + 1] - arc[k];
    const u = { x: (b.x - a.x) / len, z: (b.z - a.z) / len };
    cellsNear(ctx, { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 }, len / 2 + R, (i, p) => {
      const along = (p.x - a.x) * u.x + (p.z - a.z) * u.z;
      // nothing behind the notch or past the lip (the wall face and the fall stay as they are)
      if ((k === 0 && along < 0) || (k + 2 === pts.length && along > len)) return;
      const t = Math.max(0, Math.min(len, along));
      const d = Math.hypot(p.x - (a.x + u.x * t), p.z - (a.z + u.z * t));
      if (d > R) return;
      const o = best.get(i);
      if (!o || d < o.d) best.set(i, { d, y: levelAt(arc[k] + t) });
    });
  }
  for (const [i, { d, y }] of best)
    write(i, y, d <= L.core ? 1 : 1 - smooth((d - L.core) / L.fall), d > L.core);
  (plan.lines ??= []).push({
    islandId: isl.id,
    kind: 'lava',
    closed: false,
    points: pts,
    levels,
  });
  return { pts, levels, arc, own };
}

/* ----------------------------------- D3 ember bridge ----------------------------------- */

/** The planned bridge: centre on the channel, span axis `n` (local +z), channel axis `u`, arc `s`. */
interface BridgeSite {
  X: XZ;
  n: XZ;
  u: XZ;
  s: number;
  sh: Shape;
}

/** The reserved lava strip rects (centred on the channel segment mids, devops-growth.ts). */
const lavaStrips = (ctx: SiteCtx, isl: IslandData, pts: readonly XZ[]): Shape[] =>
  ctx.shapes[isl.id].filter((o) =>
    pts.some(
      (p, k) =>
        k + 1 < pts.length &&
        dist(o, { x: (p.x + pts[k + 1].x) / 2, z: (p.z + pts[k + 1].z) / 2 }) < 0.05,
    ),
  );

/**
 * D3 (the TASK-467 glass-bridge pattern): the best level crossing of the channel's lower reach — both
 * banks (± `bank` across it) land with a gentle footing, within `maxBank` of each other, the deck rect
 * clear of every obstacle but the lava strip — gets the bridge; the channel is blocked for footpaths
 * everywhere else (cells only, so existing nodes stay valid) and both bridge ends are linked, so the
 * paths that need the other bank walk over it. Without a site the bed is left open.
 */
function planBridge(ctx: SiteCtx, isl: IslandData, plan: SitePlan): BridgeSite | null {
  const B = S.bridge;
  const D = DEVOPS_M26.bridge;
  const pts = anchorChain(isl, 'lavaChannel');
  if (pts.length < 3) return null;
  const own = lavaStrips(ctx, isl, pts);
  const arc = [0];
  for (let k = 1; k < pts.length; k++) arc.push(arc[k - 1] + dist(pts[k - 1], pts[k]));
  const total = arc[arc.length - 1];
  const y = (p: XZ): number => heightAt(ctx.h, p.x, p.z);
  let best: BridgeSite | null = null;
  let bs = Infinity;
  for (let k = 0; k + 1 < pts.length; k++) {
    const len = arc[k + 1] - arc[k];
    const u = { x: (pts[k + 1].x - pts[k].x) / len, z: (pts[k + 1].z - pts[k].z) / len };
    for (let t = 0; t < len; t += 1) {
      const s = arc[k] + t;
      if (s < total * B.reach[0] || s > total - B.reach[1]) continue;
      const X = add(pts[k], u, t);
      const n = { x: -u.z, z: u.x };
      const A = add(X, n, B.bank);
      const C = add(X, n, -B.bank);
      if (!onIsland(ctx, isl, A.x, A.z) || !onIsland(ctx, isl, C.x, C.z)) continue;
      if (sdfAt(ctx, A.x, A.z) < B.minShore || sdfAt(ctx, C.x, C.z) < B.minShore) continue;
      const step = Math.abs(y(A) - y(C));
      if (step > B.maxBank) continue;
      const rl = Math.max(
        relief(ctx, discShape(A.x, A.z, B.footR)),
        relief(ctx, discShape(C.x, C.z, B.footR)),
      );
      if (rl > B.footRelief) continue;
      const sh = rectShape(X.x, X.z, ang(n.x, n.z), D.width, D.length);
      if (
        !clearOf(ctx, isl, rectShape(X.x, X.z, ang(n.x, n.z), D.width + 2, D.length + 2), 0.3, own)
      )
        continue;
      // level first, then a gentle footing, then downstream (by the fall)
      const score = 2 * step + rl + B.downstream * (total - s);
      if (score < bs) {
        bs = score;
        best = { X, n, u, s, sh };
      }
    }
  }
  if (!best) return null;
  addShape(ctx, isl, best.sh, false);
  // the channel is blocked for footpaths but under the deck
  for (let k = 0; k + 1 < pts.length; k++) {
    const a = pts[k];
    const b = pts[k + 1];
    const len = arc[k + 1] - arc[k];
    const u = { x: (b.x - a.x) / len, z: (b.z - a.z) / len };
    cellsNear(ctx, { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 }, len / 2 + B.block + 1, (i, p) => {
      const along = Math.max(0, Math.min(len, (p.x - a.x) * u.x + (p.z - a.z) * u.z));
      const q = add(a, u, along);
      if (dist(p, q) > B.block) return;
      if (Math.abs(arc[k] + along - best.s) < B.gap && dist(p, best.X) < D.length / 2) return;
      ctx.blocked[i] = 1;
    });
  }
  for (const sg of [1, -1]) {
    const pin = add(best.X, best.n, sg * (D.length / 2 + B.pin));
    plan.links.push({ pin, kind: 'path', done: () => undefined });
  }
  return best;
}

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

/**
 * The bridge on its site (finish, after the lava carve): pivot = mean bank height (± `bank` across);
 * the abutments are levelled to it and ramped up to the deck ends, the arch keeps the bed.
 */
function buildBridge(ctx: SiteCtx, isl: IslandData, bed: LavaBed, site: BridgeSite): void {
  const B = S.bridge;
  const D = DEVOPS_M26.bridge;
  const { X, n, u } = site;
  const A = add(X, n, B.bank);
  const C = add(X, n, -B.bank);
  const y = Math.max(
    (heightAt(ctx.h, A.x, A.z) + heightAt(ctx.h, C.x, C.z)) / 2,
    bedAt(bed, site.s) + S.lava.depth,
  );
  abutments(ctx, isl, X, n, u, y, [...bed.own, site.sh]);
  ctx.fixtures.push({
    defId: 'emberBridge',
    x: X.x,
    z: X.z,
    rotY: ang(n.x, n.z),
    islandId: isl.id,
    variant: D.variants[0],
    y,
  });
}

/**
 * Bridge earthworks round centre `X` (span axis `n`, channel axis `u`): under the abutments the
 * ground rises from the pivot `y` (by the arch) to the deck end, then ramps back down to the path
 * over `ramp`, blended out sideways and past the ramp. The arch (|s| < clear / 2) keeps the bed.
 */
function abutments(
  ctx: SiteCtx,
  isl: IslandData,
  X: XZ,
  n: XZ,
  u: XZ,
  y: number,
  own: readonly Shape[],
): void {
  const B = S.bridge;
  const [a0, a1] = B.abut;
  const write = groundWriter(ctx, isl, own);
  const reach = a1 + B.ramp + B.fall;
  cellsNear(ctx, X, Math.hypot(reach, B.core + B.fall), (i, p) => {
    const s = Math.abs((p.x - X.x) * n.x + (p.z - X.z) * n.z);
    const l = Math.abs((p.x - X.x) * u.x + (p.z - X.z) * u.z);
    if (s < a0 || s > reach || l > B.core + B.fall) return;
    const top = y + B.rampTop;
    const target =
      s <= a1
        ? y + B.rampTop * smooth((s - a0 - 0.8) / (a1 - a0 - 1.2))
        : top - B.rampTop * smooth((s - a1) / B.ramp);
    const wl = l <= B.core ? 1 : 1 - smooth((l - B.core) / B.fall);
    const ws = s <= a1 + B.ramp ? 1 : 1 - smooth((s - a1 - B.ramp) / B.fall);
    write(i, target, wl * ws, false);
  });
}

/* ------------------------------------- D6 crater deck ------------------------------------- */

function placeCraterDeck(ctx: SiteCtx, isl: IslandData): Deck | null {
  const a = isl.anchors.craterDeck;
  if (!a) return null;
  const fx = { defId: 'craterDeck', x: a.x, z: a.z, rotY: a.rotY, islandId: isl.id };
  ctx.fixtures.push(fx);
  addShape(ctx, isl, discShape(a.x, a.z, DEVOPS_GROWTH.craterDeck.r), true);
  return { p: { x: a.x, z: a.z }, rot: a.rotY, anchor: { x: a.x, z: a.z }, fx };
}

interface Deck {
  /** Pivot (moved by `deckGround`), heading toward the crater, the anchor, the fixture record. */
  p: XZ;
  rot: number;
  anchor: XZ;
  fx: { x: number; z: number };
}

/** Ground relief under the deck floor at `p`: centre + 8 samples at radius r. */
function floorRelief(ctx: SiteCtx, p: XZ): number {
  const ys = [heightAt(ctx.h, p.x, p.z)];
  for (let k = 0; k < 8; k++) {
    const q = add(p, dirOf((k * Math.PI) / 4), DEVOPS_M26.deck.r);
    ys.push(heightAt(ctx.h, q.x, q.z));
  }
  return Math.max(...ys) - Math.min(...ys);
}

/**
 * The deck's ground (finish, after the funicular cut its grade line by the top station): the pivot
 * slides ≤ \`slide\` u on the anchor disc to the spot with the least floor relief (the station pad
 * may have cut the rim behind it), then the ground is levelled to the mean height under the floor
 * within \`core\`, blended out over \`fall\` (groundWriter rules: the rail strips, the station and every
 * other obstacle keep their ground). No pad: a pad's falloff would reach the rail.
 */
function deckGround(ctx: SiteCtx, isl: IslandData, deck: Deck): void {
  const D = S.deck;
  const f = dirOf(deck.rot);
  const t = { x: -f.z, z: f.x };
  let best = deck.anchor;
  let bs = floorRelief(ctx, best);
  for (const along of D.slide)
    for (const side of D.slide) {
      const q = add(add(deck.anchor, f, along), t, side);
      const r = floorRelief(ctx, q) + D.slideCost * Math.hypot(along, side);
      if (r < bs - 1e-6) {
        bs = r;
        best = q;
      }
    }
  deck.p = best;
  deck.fx.x = best.x;
  deck.fx.z = best.z;
  const p = best;
  const ys = [heightAt(ctx.h, p.x, p.z)];
  for (let k = 0; k < 8; k++) {
    const q = add(p, dirOf((k * Math.PI) / 4), DEVOPS_M26.deck.r);
    ys.push(heightAt(ctx.h, q.x, q.z));
  }
  const y = ys.reduce((u, v) => u + v, 0) / ys.length;
  const write = groundWriter(
    ctx,
    isl,
    ctx.shapes[isl.id].filter((o) => dist(o, deck.anchor) < 0.05),
  );
  cellsNear(ctx, p, D.core + D.fall, (i, c) => {
    const d = dist(c, p);
    if (d <= D.core + D.fall)
      write(i, y, d <= D.core ? 1 : 1 - smooth((d - D.core) / D.fall), false);
  });
}

/** The stargazer on the deck floor (TABLEAU `deckGazer`, spot frame +z = toward the crater). */
function deckStory(deck: Deck, isl: IslandData, stories: StorySpot[]): void {
  const def = DEVOPS_CULTURE.storySpots.find((s) => s.kind === 'deckGazer');
  stories.push({
    kind: 'deckGazer',
    islandId: isl.id,
    pos: { x: deck.p.x, y: DEVOPS_M26.deck.floorY, z: deck.p.z },
    rotY: deck.rot,
    defs: def?.defs ?? ['craterDeck'],
  });
}

/* ------------------------------------- D17 glass kiln ------------------------------------- */

/**
 * The kiln on the best free level rect round the smiths' lane (else the foundry), its mouth (+z)
 * toward the lane centre; a pad whose falloff would reach another pad core on another level (the
 * lane, the foundry rail) is not taken.
 */
function placeKiln(ctx: SiteCtx, isl: IslandData): boolean {
  const K = S.kiln;
  const lane = isl.anchors.smithsLane;
  const size = isl.anchors.smithsLaneSize;
  const near = lane ?? isl.anchors.foundry;
  if (!near) return false;
  const reach = lane && size ? Math.hypot(size.x, size.z) / 2 : 0;
  const y = (p: XZ): number => heightAt(ctx.h, p.x, p.z);
  const clash = (sh: Shape): boolean =>
    ctx.pads.some(
      (o) =>
        o.islandId === isl.id &&
        shapesOverlap(o.shape, sh, o.margin + K.padMargin + FLATTEN.falloff) &&
        Math.abs(y(o.shape) - y(sh)) > K.levelGap,
    );
  // the mouth faces the lane centre, or turns up to `turn` away from it (a cost per radian)
  const rectAt = (p: XZ, dr: number): { sh: Shape; rot: number } => {
    const rot = ang(near.x - p.x, near.z - p.z) + dr;
    const c = add(p, dirOf(rot), K.z);
    return { sh: rectShape(c.x, c.z, rot, K.w, K.d), rot };
  };
  const fit = (q: XZ, dr: number): number => {
    const d = dist(q, near);
    if (d < reach + K.ring[0] - 2) return Infinity;
    const { sh } = rectAt(q, dr);
    if (!onLand(ctx, isl, sh, K.minShore)) return Infinity;
    const rl = relief(ctx, sh);
    if (rl > K.maxRelief || !clear(ctx, isl, sh, K.gap) || !siteFree(ctx, isl, sh)) return Infinity;
    if (clash(sh)) return Infinity;
    return rl + 0.25 * d + K.turnCost * Math.abs(dr);
  };
  const turns = [0, K.turn, -K.turn];
  const p = bestSample(ctx, isl, near, reach + K.ring[1], (q) =>
    Math.min(...turns.map((dr) => fit(q, dr))),
  );
  if (!p) return false;
  const dr = turns.reduce((m, r) => (fit(p, r) < fit(p, m) ? r : m), 0);
  const { sh, rot } = rectAt(p, dr);
  ctx.fixtures.push({ defId: 'glassKiln', x: p.x, z: p.z, rotY: rot, islandId: isl.id });
  addShape(ctx, isl, sh, true);
  addPad(ctx, isl, sh, K.padMargin);
  return true;
}

/* ----------------------------------- D10 obsidian beach ----------------------------------- */

/**
 * Obsidian decor on the beach rect and the shelf in front (out to `reach`): per variant in `want`
 * order, hashed tries until its count is met — sea stacks with the seabed in `stackDepth`, the slab
 * at the waterline (`slabY`), clusters / the cairn on gentle land above `landY`.
 */
function placeObsidian(ctx: SiteCtx, isl: IslandData, rng: Rng): number {
  const O = S.obsidian;
  const a = isl.anchors.obsidianBeach;
  if (!a) return 0;
  const [w, d] = DEVOPS_GROWTH.obsidian.size;
  const f = dirOf(a.rotY);
  const t = { x: -f.z, z: f.x };
  // the beach reservation is the decor's own ground
  const own = ctx.shapes[isl.id].filter((o) => dist(o, a) < 0.05);
  const put: { p: XZ; v: number }[] = [];
  for (const [v, count] of O.want) {
    let got = 0;
    for (let k = 0; k < O.tries && got < count; k++) {
      const p = add(add(a, t, rng.range(-w / 2, w / 2)), f, rng.range(-d / 2, d / 2 + O.reach));
      const rot = rng.range(0, Math.PI * 2);
      if (put.some((o) => dist(o.p, p) < Math.max(O.spacing[o.v], O.spacing[v]))) continue;
      const y = heightAt(ctx.h, p.x, p.z);
      const sh = discShape(p.x, p.z, O.radius[v]);
      if (v === 1) {
        if (y < O.stackDepth[0] || y > O.stackDepth[1]) continue;
      } else if (v === 2) {
        if (y < O.slabY[0] || y > O.slabY[1]) continue;
      } else {
        if (y < O.landY || !onIsland(ctx, isl, p.x, p.z)) continue;
        if (relief(ctx, sh) > O.landRelief || !clearOf(ctx, isl, sh, 0.4, own)) continue;
      }
      ctx.fixtures.push({
        defId: 'obsidianShard',
        x: p.x,
        z: p.z,
        rotY: rot,
        islandId: isl.id,
        variant: v,
      });
      if (y > 0) addShape(ctx, isl, sh, false);
      put.push({ p, v });
      got++;
    }
  }
  return put.length;
}

/* ------------------------------------- D18 breakwater ------------------------------------- */

/**
 * The breakwater near the `breakwater` anchor: per variant (`order`), shifted toward the shore and
 * along the arm until every footprint sample's seabed lies between the buried foot and the crest
 * clearance, clear of every pier of the island. The head variant turns its light toward the harbour.
 */
function placeBreakwater(ctx: SiteCtx, isl: IslandData): boolean {
  const W = S.breakwater;
  const D = DEVOPS_M26.breakwater;
  const bw = isl.anchors.breakwater;
  const hb = isl.anchors.harbour;
  if (!bw || !hb) return false;
  const arm = dirOf(bw.rotY);
  const shore = dirOf(hb.rotY + Math.PI);
  const across = { x: -arm.z, z: arm.x };
  const piers = ctx.docks
    .filter((d) => d.islandId === isl.id)
    .map((d): [XZ, XZ] => [d, add(d, dirOf(d.rotY), d.segments * 2)]);
  const fits = (c: XZ, len: number): boolean => {
    for (let s = -len / 2; s <= len / 2 + 1e-6; s += 1)
      for (let q = -D.footW / 2; q <= D.footW / 2 + 1e-6; q += D.footW / 4) {
        const p = add(add(c, arm, s), across, q);
        const y = heightAt(ctx.h, p.x, p.z);
        if (y < D.footY + W.footClear || y > -W.crestClear) return false;
      }
    const e0 = add(c, arm, -len / 2);
    const e1 = add(c, arm, len / 2);
    for (const [a, b] of piers)
      for (let k = 0; k <= 8; k++) {
        const p = add(a, { x: b.x - a.x, z: b.z - a.z }, k / 8);
        if (segDist(p, e0, e1) < W.pierClear) return false;
      }
    return true;
  };
  for (const v of W.order)
    for (const sh of W.shore)
      for (const sl of W.slide) {
        const c = add(add(bw, shore, sh), arm, sl);
        if (!fits(c, D.length[v])) continue;
        // the head's round end (+z) and light toward the harbour axis
        const toHarbour = (hb.x - c.x) * arm.x + (hb.z - c.z) * arm.z;
        const rot = v === 2 && toHarbour < 0 ? bw.rotY + Math.PI : bw.rotY;
        ctx.fixtures.push({
          defId: 'devopsBreakwater',
          x: c.x,
          z: c.z,
          rotY: rot,
          islandId: isl.id,
          variant: v,
        });
        return true;
      }
  return false;
}

/**
 * Boat-route keep-out discs along every placed DevOps breakwater (world/index.ts `buildRoutes`):
 * radius `keepOut` every 2 u of its length, so no route node sits in it.
 */
export function breakwaterKeepOut(
  fixtures: readonly { defId: string; x: number; z: number; rotY: number; variant?: number }[],
): { x: number; z: number; r: number }[] {
  const out: { x: number; z: number; r: number }[] = [];
  for (const f of fixtures) {
    if (f.defId !== 'devopsBreakwater') continue;
    const len = DEVOPS_M26.breakwater.length[f.variant ?? 0];
    const a = dirOf(f.rotY);
    for (let s = -len / 2; s <= len / 2 + 1e-6; s += 2)
      out.push({ x: f.x + a.x * s, z: f.z + a.z * s, r: S.breakwater.keepOut });
  }
  return out;
}
