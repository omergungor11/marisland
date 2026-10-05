import type { Rng } from '../../core/rng.ts';
import { hashInts } from '../../core/hash.ts';
import { smoothstep } from '../../core/math/index.ts';
import {
  DOCK,
  FIXTURE_RADIUS,
  FLATTEN,
  LANDMARKS,
  LOT_FOOTPRINT,
  LOT_KIND,
  LOT_ROOFS,
  OUTPOSTS,
  PATHS,
  ROOFED_KINDS,
  VILLAGE,
} from '../../content/settlements.ts';
import type {
  WorldData,
  DockData,
  FieldPatchData,
  FixtureData,
  Heightfield,
  IslandData,
  LandmarkData,
  LotData,
  MooringData,
  PathGraph,
  Polyline,
  SettlementData,
  StreamData,
  XZ,
} from '../types.ts';
import { heightAt, sampleGrid, Zone } from '../types.ts';
import { cellX, cellZ, gridRange } from './grid.ts';
import { leewardness } from './heightfield.ts';
import type { OccupancyGrid } from './scatter.ts';
import {
  addCellPath,
  addEdge,
  addNode,
  addVirtual,
  buildPathGraph,
  createNetwork,
  forSamplesNearSegment,
  gridAStar,
  pathStep,
  resample,
  writePaths,
  type PathNetwork,
} from './paths.ts';

/**
 * Settlements (ARCHITECTURE §2 step 5, TASK-131): plaza, lots, landmarks,
 * docks, moorings and fixtures per archetype (ART_BIBLE §4), flattened pads in
 * the heightfield, the footpath network (paths.ts) and Millbrook fences.
 * Pure data; every decision draws from rng.fork('sites', islandId, …).
 */

// ---------------------------------------------------------------------------
// Shapes (oriented rect or disc) for overlap tests and blocking.

export interface Shape {
  x: number;
  z: number;
  /** Facing (depth axis) = (c, s); width axis = (−s, c). */
  c: number;
  s: number;
  hw: number;
  hd: number;
  /** > 0 → disc of this radius (hw/hd ignored). */
  r: number;
  /** 'plaza' shapes don't block plaza furniture. */
  tag?: string;
}

export function rectShape(x: number, z: number, rotY: number, w: number, d: number): Shape {
  return { x, z, c: Math.cos(rotY), s: Math.sin(rotY), hw: w / 2, hd: d / 2, r: 0 };
}

export function discShape(x: number, z: number, r: number): Shape {
  return { x, z, c: 1, s: 0, hw: r, hd: r, r };
}

/** Signed distance from (x, z) to the shape (negative inside). */
export function shapeDist(sh: Shape, x: number, z: number): number {
  const dx = x - sh.x;
  const dz = z - sh.z;
  if (sh.r > 0) return Math.hypot(dx, dz) - sh.r;
  const u = -dx * sh.s + dz * sh.c;
  const v = dx * sh.c + dz * sh.s;
  const eu = Math.abs(u) - sh.hw;
  const ev = Math.abs(v) - sh.hd;
  return eu > 0 || ev > 0 ? Math.hypot(Math.max(eu, 0), Math.max(ev, 0)) : Math.max(eu, ev);
}

/** True when two shapes come closer than `gap` (SAT for rect pairs). */
export function shapesOverlap(a: Shape, b: Shape, gap: number): boolean {
  if (a.r > 0 && b.r > 0) return Math.hypot(a.x - b.x, a.z - b.z) < a.r + b.r + gap;
  if (a.r > 0) return shapeDist(b, a.x, a.z) < a.r + gap;
  if (b.r > 0) return shapeDist(a, b.x, b.z) < b.r + gap;
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const g = gap / 2;
  const axes: [number, number][] = [
    [a.c, a.s],
    [-a.s, a.c],
    [b.c, b.s],
    [-b.s, b.c],
  ];
  for (const [ax, az] of axes) {
    const ra =
      (a.hd + g) * Math.abs(a.c * ax + a.s * az) + (a.hw + g) * Math.abs(-a.s * ax + a.c * az);
    const rb =
      (b.hd + g) * Math.abs(b.c * ax + b.s * az) + (b.hw + g) * Math.abs(-b.s * ax + b.c * az);
    if (Math.abs(dx * ax + dz * az) >= ra + rb) return false;
  }
  return true;
}

/** Footprint corners of a rect shape. */
export function shapeCorners(sh: Shape): XZ[] {
  const out: XZ[] = [];
  for (const [su, sv] of [
    [1, 1],
    [1, -1],
    [-1, -1],
    [-1, 1],
  ]) {
    const u = su * sh.hw;
    const v = sv * sh.hd;
    out.push({ x: sh.x - u * sh.s + v * sh.c, z: sh.z + u * sh.c + v * sh.s });
  }
  return out;
}

export const lotShape = (l: LotData): Shape => rectShape(l.x, l.z, l.rotY, l.w, l.d);

// ---------------------------------------------------------------------------

interface Pad {
  islandId: number;
  /** Footprint (core = footprint grown by `margin`). */
  shape: Shape;
  margin: number;
  T: number;
}

interface PendingLot extends LotData {
  key: number;
  settlement: number;
}

interface LinkReq {
  pin: XZ;
  kind: 'path' | 'stair';
  /** Stilt hut: boardwalk from this door (water) to `pin` (shore). */
  boardwalkFrom?: XZ;
  /** Keep the search within `half` u of segment a→b (stair: forces switchbacks). */
  corridor?: { a: XZ; b: XZ; half: number };
  done(key: number | null): void;
}

interface Plan {
  kind: string;
  hub: XZ;
  plaza: { x: number; z: number; r: number } | null;
  lots: number[];
  landmarks: number[];
  docks: number[];
  links: LinkReq[];
  hubKey: number;
}

interface Ctx {
  h: Heightfield;
  n: number;
  sdf: Float32Array;
  zone: Uint8Array;
  islandMap: Uint8Array;
  windDir: number;
  streams: StreamData[];
  net: PathNetwork;
  blocked: Uint8Array;
  hasNet: boolean[];
  pads: Pad[];
  /** Obstacles per island (lots, landmarks, fixtures, docks, plaza). */
  shapes: Shape[][];
  /** Lane polylines per island (lots keep clear of them). */
  lanes: XZ[][][];
  lots: PendingLot[];
  landmarks: LandmarkData[];
  docks: (DockData & { node: number })[];
  moorings: MooringData[];
  fixtures: FixtureData[];
}

const ang = (dx: number, dz: number): number => Math.atan2(dz, dx);
const segDist = (p: XZ, a: XZ, b: XZ): number => {
  const vx = b.x - a.x;
  const vz = b.z - a.z;
  const l2 = vx * vx + vz * vz;
  const t = l2 > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * vx + (p.z - a.z) * vz) / l2)) : 0;
  return Math.hypot(p.x - a.x - vx * t, p.z - a.z - vz * t);
};
const dirOf = (a: number): XZ => ({ x: Math.cos(a), z: Math.sin(a) });
const add = (p: XZ, d: XZ, t: number): XZ => ({ x: p.x + d.x * t, z: p.z + d.z * t });
const dist = (a: XZ, b: XZ): number => Math.hypot(a.x - b.x, a.z - b.z);
const unit = (from: XZ, to: XZ): XZ => {
  const l = dist(from, to) || 1;
  return { x: (to.x - from.x) / l, z: (to.z - from.z) / l };
};

function cellOf(ctx: Ctx, x: number, z: number): number {
  const ix = Math.round((x - ctx.h.originX) / ctx.h.cellSize);
  const iz = Math.round((z - ctx.h.originZ) / ctx.h.cellSize);
  if (ix < 0 || iz < 0 || ix >= ctx.n || iz >= ctx.n) return -1;
  return iz * ctx.n + ix;
}
const cellPos = (ctx: Ctx, i: number): XZ => ({
  x: cellX(i % ctx.n),
  z: cellZ(Math.floor(i / ctx.n)),
});
const sdfAt = (ctx: Ctx, x: number, z: number): number => sampleGrid(ctx.h, ctx.sdf, x, z, -999);
const onIsland = (ctx: Ctx, isl: IslandData, x: number, z: number): boolean => {
  const i = cellOf(ctx, x, z);
  return i >= 0 && ctx.islandMap[i] === isl.id + 1;
};

/** Height relief (max − min) over a rect/disc footprint (centre, corners, edge mids). */
function relief(ctx: Ctx, sh: Shape): number {
  let lo = Infinity;
  let hi = -Infinity;
  const pts: XZ[] = [{ x: sh.x, z: sh.z }];
  if (sh.r > 0) {
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      pts.push(add(sh, dirOf(a), sh.r), add(sh, dirOf(a), sh.r / 2));
    }
  } else {
    const cs = shapeCorners(sh);
    for (let k = 0; k < 4; k++) {
      const a = cs[k];
      const b = cs[(k + 1) % 4];
      pts.push(a, { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 });
    }
  }
  for (const p of pts) {
    const y = heightAt(ctx.h, p.x, p.z);
    if (y < lo) lo = y;
    if (y > hi) hi = y;
  }
  return hi - lo;
}

/** Shape fully on this island's land with at least `minShore` u of shore distance at its centre. */
function onLand(ctx: Ctx, isl: IslandData, sh: Shape, minShore: number): boolean {
  if (!onIsland(ctx, isl, sh.x, sh.z) || sdfAt(ctx, sh.x, sh.z) < minShore) return false;
  const pts =
    sh.r > 0 ? [0, 1, 2, 3, 4, 5].map((k) => add(sh, dirOf(k * 1.047), sh.r)) : shapeCorners(sh);
  for (const p of pts)
    if (!onIsland(ctx, isl, p.x, p.z) || heightAt(ctx.h, p.x, p.z) < 0.3) return false;
  return true;
}

function clear(ctx: Ctx, isl: IslandData, sh: Shape, gap: number, inPlaza = false): boolean {
  for (const o of ctx.shapes[isl.id]) {
    if (inPlaza && o.tag === 'plaza') continue;
    if (shapesOverlap(o, sh, gap)) return false;
  }
  for (const lane of ctx.lanes[isl.id])
    for (const p of lane) if (shapeDist(sh, p.x, p.z) < PATHS.halfWidth + 0.4) return false;
  return true;
}

/** Register an obstacle; `block` rasterises it into the path-blocking grid. */
function addShape(ctx: Ctx, isl: IslandData, sh: Shape, block: boolean): void {
  ctx.shapes[isl.id].push(sh);
  if (!block) return;
  const R = (sh.r > 0 ? sh.r : Math.hypot(sh.hw, sh.hd)) + 1;
  const [x0, x1] = gridRange(sh.x - R, sh.x + R);
  const [z0, z1] = gridRange(sh.z - R, sh.z + R);
  for (let iz = z0; iz <= z1; iz++)
    for (let ix = x0; ix <= x1; ix++)
      if (shapeDist(sh, cellX(ix), cellZ(iz)) <= 0.5) ctx.blocked[iz * ctx.n + ix] = 1;
}

function addPad(ctx: Ctx, isl: IslandData, sh: Shape, margin: number): void {
  ctx.pads.push({ islandId: isl.id, shape: sh, margin, T: 0 });
}

function pushLandmark(ctx: Ctx, isl: IslandData, kind: string, p: XZ, rotY: number): number {
  const spec = LANDMARKS[kind];
  ctx.landmarks.push({ kind, x: p.x, z: p.z, rotY, islandId: isl.id });
  if (spec?.radius) addShape(ctx, isl, discShape(p.x, p.z, spec.radius), true);
  if (spec?.flatten) addPad(ctx, isl, discShape(p.x, p.z, spec.flatten), FLATTEN.discMargin);
  return ctx.landmarks.length - 1;
}

function pushFixture(ctx: Ctx, isl: IslandData, defId: string, p: XZ, rotY: number): void {
  ctx.fixtures.push({ defId, x: p.x, z: p.z, rotY, islandId: isl.id });
  const r = FIXTURE_RADIUS[defId] ?? 0.5;
  addShape(ctx, isl, discShape(p.x, p.z, r), true);
}

function tryLot(
  ctx: Ctx,
  isl: IslandData,
  defId: string,
  p: XZ,
  rotY: number,
  settlement: number,
  opts: { minShore: number; maxRelief: number; water?: boolean; inPlaza?: boolean },
): number {
  const [w, d] = LOT_FOOTPRINT[defId];
  const sh = rectShape(p.x, p.z, rotY, w, d);
  if (!opts.water) {
    if (!onLand(ctx, isl, sh, opts.minShore)) return -1;
    if (relief(ctx, sh) > opts.maxRelief) return -1;
  }
  if (!clear(ctx, isl, sh, VILLAGE.lotGap, opts.inPlaza)) return -1;
  addShape(ctx, isl, sh, true);
  if (!opts.water) addPad(ctx, isl, sh, FLATTEN.lotMargin);
  ctx.lots.push({
    defId,
    x: p.x,
    z: p.z,
    rotY,
    islandId: isl.id,
    kind: LOT_KIND[defId],
    w,
    d,
    node: -1,
    variant: 0,
    role: 'legacy',
    key: -1,
    settlement,
  });
  return ctx.lots.length - 1;
}

const doorOf = (l: LotData, extra = 1.0): XZ => add(l, dirOf(l.rotY), l.d / 2 + extra);

// ---------------------------------------------------------------------------
// Docks.

interface DockSite {
  root: XZ;
  dir: XZ;
  segments: number;
  carve: boolean;
}

function findDock(
  ctx: Ctx,
  isl: IslandData,
  opts: {
    near: XZ;
    maxDist: number;
    prefer: XZ;
    toward?: XZ;
    lee?: number;
    carve: boolean;
    maxSegments?: number;
    /** End depth target (default DOCK.endDepth). */
    endDepth?: number;
    /** Also require the end past the shallow colour band (zone mid/deep). */
    edge?: boolean;
  },
): DockSite | null {
  const n = ctx.n;
  const maxSeg = opts.maxSegments ?? DOCK.maxSegments;
  const [x0, x1] = gridRange(opts.near.x - opts.maxDist, opts.near.x + opts.maxDist);
  const [z0, z1] = gridRange(opts.near.z - opts.maxDist, opts.near.z + opts.maxDist);
  let best: DockSite | null = null;
  let bestScore = Infinity;
  let fallback: DockSite | null = null;
  let fallbackScore = Infinity;
  const need = opts.endDepth ?? DOCK.endDepth;
  const g = DOCK.normalSpan;
  for (let iz = Math.max(1, z0); iz <= Math.min(n - 2, z1); iz++)
    for (let ix = Math.max(1, x0); ix <= Math.min(n - 2, x1); ix++) {
      const i = iz * n + ix;
      if (ctx.islandMap[i] !== isl.id + 1) continue;
      const s = ctx.sdf[i];
      if (s <= 0 || s > 2.5) continue;
      const p = { x: cellX(ix), z: cellZ(iz) };
      if (dist(p, opts.near) > opts.maxDist) continue;
      // shore normal from the SDF gradient over ±normalSpan u (the 1-cell difference
      // follows coast facets, which let a pier run along the shore — sweep D8, 4004)
      const gx = sdfAt(ctx, p.x + g, p.z) - sdfAt(ctx, p.x - g, p.z);
      const gz = sdfAt(ctx, p.x, p.z + g) - sdfAt(ctx, p.x, p.z - g);
      const gl = Math.hypot(gx, gz);
      if (gl < 1e-3) continue;
      const dir = { x: -gx / gl, z: -gz / gl };
      const root = add(p, dir, s);
      const perp = { x: -dir.z, z: dir.x };
      let score0 = 0;
      let segs = -1;
      let depthOnly = -1;
      let reach = 0;
      for (let k = 1; k <= maxSeg; k++) {
        const t = DOCK.segment * k;
        const q = add(root, dir, t);
        const y = heightAt(ctx.h, q.x, q.z);
        const sq = sdfAt(ctx, q.x, q.z);
        // over water, both sides clear, and moving away from the shore (never along it)
        if (y > -0.05 || sq > -0.5 || -sq < DOCK.awayRate * t - DOCK.awaySlack) break;
        if (heightAt(ctx.h, q.x + perp.x * 1.6, q.z + perp.z * 1.6) > -0.05) break;
        if (heightAt(ctx.h, q.x - perp.x * 1.6, q.z - perp.z * 1.6) > -0.05) break;
        reach = k;
        if (y <= -need && k >= DOCK.minSegments) {
          // past the turquoise band too (zone mid/deep), so boats moor in blue water
          const zq = ctx.zone[cellOf(ctx, q.x, q.z)];
          if (!opts.edge || zq === Zone.mid || zq === Zone.deep) {
            segs = k;
            break;
          }
          if (depthOnly < 0) depthOnly = k;
        }
      }
      if (segs < 0 && depthOnly > 0) {
        segs = depthOnly;
        score0 = DOCK.shallowEndPenalty;
      }
      let score = score0 + 0.2 * dist(root, opts.prefer);
      if (opts.toward) {
        const tw = unit(root, opts.toward);
        score += 6 * (1 - (tw.x * dir.x + tw.z * dir.z));
      }
      if (opts.lee !== undefined)
        score += opts.lee * (1 - leewardness(isl, ctx.windDir, root.x, root.z));
      if (segs > 0) {
        score += segs;
        if (score < bestScore) {
          bestScore = score;
          best = { root, dir, segments: segs, carve: false };
        }
      } else if (opts.carve && reach >= DOCK.minSegments) {
        // too shallow within reach: the longest clear run (capped), channel carved to depth
        const segments = Math.min(reach, DOCK.carveSegments);
        const q = add(root, dir, DOCK.segment * segments);
        score += segments + 3 * Math.max(0, need + heightAt(ctx.h, q.x, q.z));
        if (score < fallbackScore) {
          fallbackScore = score;
          fallback = { root, dir, segments, carve: true };
        }
      }
    }
  return best ?? fallback;
}

/** Deepen water samples near a segment/disc to `depth` (smooth falloff); land untouched. */
function carveWater(ctx: Ctx, a: XZ, b: XZ, core: number, falloff: number, depth: number): void {
  forSamplesNearSegment(ctx.h, a, b, core + falloff, (i, d) => {
    const y = ctx.h.data[i];
    if (y >= 0 || ctx.sdf[i] > 0) return;
    const w = 1 - smoothstep(core, core + falloff, d);
    const t = y + (-depth - y) * w;
    if (t < y) ctx.h.data[i] = t;
  });
}

function placeDock(
  ctx: Ctx,
  isl: IslandData,
  site: DockSite,
  rng: Rng,
  boats: { rowboats: number; sailboats: number },
): number {
  const L = site.segments * DOCK.segment;
  const end = add(site.root, site.dir, L);
  if (site.carve) {
    carveWater(
      ctx,
      add(site.root, site.dir, 2),
      add(end, site.dir, 4),
      DOCK.channelWidth / 2,
      1.5,
      DOCK.channelDepth,
    );
    carveWater(ctx, end, end, 2.5, 2, DOCK.channelDepth);
  }
  const basin = add(end, site.dir, DOCK.basinOffset);
  carveWater(ctx, basin, basin, DOCK.basinRadius, 2, DOCK.channelDepth);
  const rotY = ang(site.dir.x, site.dir.z);
  ctx.docks.push({
    x: site.root.x,
    z: site.root.z,
    rotY,
    segments: site.segments,
    islandId: isl.id,
    node: -1,
  });
  const di = ctx.docks.length - 1;
  const mid = add(site.root, site.dir, L / 2);
  addShape(ctx, isl, rectShape(mid.x, mid.z, rotY, 1.6, L), false);
  // moorings: rowboats along the sides (depth ≥ 0.8), sailboats off the end
  const perp = { x: -site.dir.z, z: site.dir.x };
  const slots: { p: XZ; side: number }[] = [];
  for (let k = 1; k < site.segments; k++)
    for (const side of [1, -1]) {
      const p = add(add(site.root, site.dir, DOCK.segment * k + 1), perp, side * DOCK.mooringSide);
      if (heightAt(ctx.h, p.x, p.z) <= -DOCK.rowboatDepth) slots.push({ p, side });
    }
  rng.shuffle(slots);
  const rows: { p: XZ; side: number }[] = [];
  for (const s of slots) {
    if (rows.length >= boats.rowboats) break;
    if (rows.some((o) => dist(o.p, s.p) < 2.6)) continue;
    rows.push(s);
  }
  rows.sort((a, b) => dist(a.p, site.root) - dist(b.p, site.root));
  for (const r of rows) {
    ctx.moorings.push({ defId: 'rowboat', x: r.p.x, z: r.p.z, rotY, islandId: isl.id, dock: di });
    addShape(ctx, isl, rectShape(r.p.x, r.p.z, rotY, 1.2, 2.6), false);
  }
  const sail: XZ[] = [
    add(end, site.dir, 3.4),
    add(add(end, site.dir, -1.5), perp, 2.6),
    add(add(end, site.dir, -1.5), perp, -2.6),
  ];
  let placed = 0;
  for (const p of sail) {
    if (placed >= boats.sailboats) break;
    if (heightAt(ctx.h, p.x, p.z) > -1.5 || sdfAt(ctx, p.x, p.z) > -2) continue;
    const sh = rectShape(p.x, p.z, rotY, 1.8, 5);
    if (ctx.shapes[isl.id].some((o) => shapesOverlap(o, sh, 0.3))) continue;
    ctx.moorings.push({ defId: 'sailboat', x: p.x, z: p.z, rotY, islandId: isl.id, dock: di });
    addShape(ctx, isl, sh, false);
    placed++;
  }
  return di;
}

/** Dock + its link request. */
function dockWithLink(
  ctx: Ctx,
  isl: IslandData,
  plan: Plan,
  site: DockSite | null,
  rng: Rng,
  boats: { rowboats: number; sailboats: number },
  kind: 'path' | 'stair' = 'path',
): number {
  if (!site) return -1;
  const di = placeDock(ctx, isl, site, rng, boats);
  plan.docks.push(di);
  plan.links.push({
    pin: site.root,
    kind,
    done: (key) => {
      ctx.docks[di].node = key ?? -1;
    },
  });
  return di;
}

// ---------------------------------------------------------------------------
// Search helpers.

/** Best land sample (min score) within `radius` of `c` satisfying `ok`. */
function bestSample(
  ctx: Ctx,
  isl: IslandData,
  c: XZ,
  radius: number,
  score: (p: XZ, i: number) => number,
): XZ | null {
  const [x0, x1] = gridRange(c.x - radius, c.x + radius);
  const [z0, z1] = gridRange(c.z - radius, c.z + radius);
  let best: XZ | null = null;
  let bs = Infinity;
  for (let iz = z0; iz <= z1; iz++)
    for (let ix = x0; ix <= x1; ix++) {
      const i = iz * ctx.n + ix;
      if (ctx.islandMap[i] !== isl.id + 1) continue;
      const p = { x: cellX(ix), z: cellZ(iz) };
      if (dist(p, c) > radius) continue;
      const s = score(p, i);
      if (s < bs) {
        bs = s;
        best = p;
      }
    }
  return best;
}

/** Ring candidates around `c` (radii × angles), in a deterministic order. */
function ring(c: XZ, r0: number, r1: number, step: number, angles: number, phase: number): XZ[] {
  const out: XZ[] = [];
  for (let r = r0; r <= r1 + 1e-6; r += step)
    for (let k = 0; k < angles; k++) out.push(add(c, dirOf(phase + (k / angles) * Math.PI * 2), r));
  return out;
}

function landmarkAccess(ctx: Ctx, lmIndex: number, toward: XZ): XZ {
  const lm = ctx.landmarks[lmIndex];
  const r = LANDMARKS[lm.kind]?.radius ?? 1;
  return add(lm, unit(lm, toward), r + 1.2);
}

function linkLandmark(
  ctx: Ctx,
  plan: Plan,
  lmIndex: number,
  toward: XZ,
  kind: 'path' | 'stair' = 'path',
): void {
  plan.links.push({ pin: landmarkAccess(ctx, lmIndex, toward), kind, done: () => undefined });
}

function linkLot(ctx: Ctx, plan: Plan, li: number): void {
  const lot = ctx.lots[li];
  plan.lots.push(li);
  plan.links.push({
    pin: doorOf(lot),
    kind: 'path',
    done: (key) => {
      lot.key = key ?? -1;
    },
  });
}

// ---------------------------------------------------------------------------
// Archetype planners.

function newPlan(kind: string, hub: XZ): Plan {
  return { kind, hub, plaza: null, lots: [], landmarks: [], docks: [], links: [], hubKey: -1 };
}

function planHearthholm(ctx: Ctx, isl: IslandData, rng: Rng, sIdx: number): Plan | null {
  const harbour = isl.anchors.harbour;
  if (!harbour) return null;
  const pr = VILLAGE.plazaRadius;
  const plazaShape = (p: XZ): Shape => discShape(p.x, p.z, pr);
  let plazaC: XZ | null = null;
  for (
    let R = VILLAGE.plazaSearch;
    R <= VILLAGE.plazaSearch + 5 * VILLAGE.searchGrow && !plazaC;
    R += VILLAGE.searchGrow
  ) {
    plazaC = bestSample(ctx, isl, harbour, R, (p, i) => {
      if (ctx.sdf[i] < Math.max(VILLAGE.plazaMinShore, pr + 1)) return Infinity;
      return relief(ctx, plazaShape(p)) + 0.02 * dist(p, harbour);
    });
  }
  if (!plazaC) return null;
  const plan = newPlan('village', plazaC);
  plan.plaza = { x: plazaC.x, z: plazaC.z, r: pr };
  addShape(ctx, isl, { ...discShape(plazaC.x, plazaC.z, pr + 0.5), tag: 'plaza' }, false);
  addPad(ctx, isl, plazaShape(plazaC), FLATTEN.discMargin);

  // dock into the bay, short walk from the plaza
  const dockSite = findDock(ctx, isl, {
    near: harbour,
    maxDist: 50,
    prefer: plazaC,
    toward: harbour,
    carve: true,
    edge: true,
  });
  const boatsRng = rng.fork('moorings');
  dockWithLink(ctx, isl, plan, dockSite, boatsRng, {
    rowboats: boatsRng.int(VILLAGE.rowboats[0], VILLAGE.rowboats[1]),
    sailboats: boatsRng.int(VILLAGE.sailboats[0], VILLAGE.sailboats[1]),
  });

  const toSea = dockSite ? unit(plazaC, dockSite.root) : unit(plazaC, harbour);
  const a0 = ang(toSea.x, toSea.z);
  // clocktower: inland edge of the plaza, facing the harbour
  const ct = add(plazaC, toSea, -(pr + 0.5));
  if (onLand(ctx, isl, discShape(ct.x, ct.z, 2), 3))
    plan.landmarks.push(pushLandmark(ctx, isl, 'clocktower', ct, a0));

  // well (towards the clocktower) and market stalls between the harbour lane and the side lanes
  pushFixture(ctx, isl, 'well', add(plazaC, toSea, -2.5), a0);
  const stallRng = rng.fork('stalls');
  const nStalls = stallRng.int(VILLAGE.stalls[0], VILLAGE.stalls[1]);
  const side = stallRng.chance(0.5) ? 1 : -1;
  const stallAngles = [37 * side, -37 * side, 108 * side, -108 * side, 160 * side].map(
    (d) => a0 + (d * Math.PI) / 180,
  );
  const stalls: number[] = [];
  for (const a of stallAngles) {
    if (stalls.length >= nStalls) break;
    const p = add(plazaC, dirOf(a), pr - 1.1);
    const li = tryLot(ctx, isl, 'marketStall', p, a + Math.PI, sIdx, {
      minShore: 2,
      maxRelief: 3,
      inPlaza: true,
    });
    if (li >= 0) stalls.push(li);
  }

  // hub + lanes
  const hubCell = nearestPathCell(ctx, isl, plazaC);
  if (hubCell < 0) return null;
  const hubKey = addVirtual(ctx.net, isl.id, plazaC);
  addNode(ctx.net, hubCell, isl.id);
  addEdge(ctx.net, hubKey, hubCell, 'path');
  ctx.hasNet[isl.id] = true;
  plan.hubKey = hubKey;

  const lotRng = rng.fork('lots');
  const target = lotRng.int(VILLAGE.cottages[0], VILLAGE.cottages[1]) + 1; // +1 → tower house
  const offsets = VILLAGE.lanes;
  const step = pathStep({ ...stepCtx(ctx, isl), stair: false });
  const houses: number[] = [];
  for (const off of offsets) {
    if (houses.length >= target) break;
    const a = a0 + (off * Math.PI) / 180;
    let endCell = -1;
    if (off === 0 && dockSite) endCell = nearestPathCell(ctx, isl, dockSite.root);
    else
      for (let L = VILLAGE.laneLength; L >= pr + 10; L -= 4) {
        const p = add(plazaC, dirOf(a), L);
        if (!onIsland(ctx, isl, p.x, p.z) || sdfAt(ctx, p.x, p.z) < 3) continue;
        endCell = nearestPathCell(ctx, isl, p);
        if (endCell >= 0) break;
      }
    if (endCell < 0 || endCell === hubCell) continue;
    const cells = gridAStar({
      ...islandWindow(ctx, isl),
      start: hubCell,
      goal: endCell,
      step,
      hScale: 2,
    });
    if (!cells || cells.length < 3) continue;
    addCellPath(ctx.net, cells, isl.id, 'path');
    const lane = resample(
      cells.map((c) => cellPos(ctx, c)),
      1,
      false,
    );
    ctx.lanes[isl.id].push(lane);
    // lots along both sides, facing the lane
    let s = pr + 2.6;
    const total = lane.length - 1;
    while (s < total - 1 && houses.length < target) {
      const k = Math.min(total - 1, Math.floor(s));
      const p = lane[k];
      const q = lane[k + 1];
      const t = unit(p, q);
      const nrm = { x: -t.z, z: t.x };
      for (const side of [1, -1]) {
        if (houses.length >= target) break;
        const c = add(p, nrm, side * VILLAGE.laneOffset);
        const li = tryLot(ctx, isl, 'cottage', c, ang(-nrm.x * side, -nrm.z * side), sIdx, {
          minShore: VILLAGE.lotMinShore,
          maxRelief: VILLAGE.lotMaxRelief,
        });
        if (li >= 0) houses.push(li);
      }
      s += LOT_FOOTPRINT.cottage[0] + VILLAGE.lotGap + lotRng.range(0, VILLAGE.laneJitter);
    }
  }
  // tower house: the highest cottage becomes the tower
  if (houses.length > 0) {
    let ti = houses[0];
    for (const li of houses)
      if (
        heightAt(ctx.h, ctx.lots[li].x, ctx.lots[li].z) >
        heightAt(ctx.h, ctx.lots[ti].x, ctx.lots[ti].z)
      )
        ti = li;
    const lot = ctx.lots[ti];
    const [w, d] = LOT_FOOTPRINT.towerHouse;
    lot.defId = 'towerHouse';
    lot.kind = LOT_KIND.towerHouse;
    lot.w = w;
    lot.d = d;
    const pad = ctx.pads.find((p) => p.shape.x === lot.x && p.shape.z === lot.z);
    if (pad) pad.shape = rectShape(lot.x, lot.z, lot.rotY, w, d);
  }

  for (const li of stalls) linkLot(ctx, plan, li);
  // houses link after stalls (closest first so spurs attach to lanes)
  houses.sort((a, b) => dist(ctx.lots[a], plazaC) - dist(ctx.lots[b], plazaC));
  for (const li of houses) linkLot(ctx, plan, li);

  // stilt huts on the bay water, boardwalk to the shore
  const hutRng = rng.fork('stilt');
  const nHuts = hutRng.int(VILLAGE.stiltHuts[0], VILLAGE.stiltHuts[1]);
  const spots: XZ[] = [];
  const [x0, x1] = gridRange(harbour.x - VILLAGE.stiltSearch, harbour.x + VILLAGE.stiltSearch);
  const [z0, z1] = gridRange(harbour.z - VILLAGE.stiltSearch, harbour.z + VILLAGE.stiltSearch);
  for (let iz = z0; iz <= z1; iz++)
    for (let ix = x0; ix <= x1; ix++) {
      const i = iz * ctx.n + ix;
      const y = ctx.h.data[i];
      const s = -ctx.sdf[i];
      if (y > -VILLAGE.stiltDepth[0] || y < -VILLAGE.stiltDepth[1]) continue;
      if (s < VILLAGE.stiltShore[0] || s > VILLAGE.stiltShore[1]) continue;
      const p = cellPos(ctx, i);
      if (dist(p, harbour) > VILLAGE.stiltSearch) continue;
      spots.push(p);
    }
  hutRng.shuffle(spots);
  // inside the bay = water enclosed by land on many sides (crescent arms)
  const enclosure = (p: XZ): number => {
    let hits = 0;
    for (let r = 0; r < 12; r++) {
      const d = dirOf((r / 12) * Math.PI * 2);
      for (let t = 2; t <= VILLAGE.bayRay; t += 2)
        if (heightAt(ctx.h, p.x + d.x * t, p.z + d.z * t) > 0) {
          hits++;
          break;
        }
    }
    return hits;
  };
  const enc = spots.map(enclosure);
  let huts = 0;
  for (const minEnc of VILLAGE.bayEnclosure) {
    for (let j = 0; j < spots.length && huts < nHuts; j++) {
      if (enc[j] < minEnc) continue;
      if (placeStiltHut(ctx, isl, plan, spots[j], sIdx) >= 0) huts++;
    }
    if (huts > 0) break;
  }
  return plan;
}

/** Stilt hut over water at `p`, facing the shore, with a boardwalk link. */
function placeStiltHut(ctx: Ctx, isl: IslandData, plan: Plan, p: XZ, sIdx: number): number {
  const i = cellOf(ctx, p.x, p.z);
  const n = ctx.n;
  if (i < n || i >= n * (n - 1)) return -1;
  const gx = ctx.sdf[i + 1] - ctx.sdf[i - 1];
  const gz = ctx.sdf[i + n] - ctx.sdf[i - n];
  if (Math.hypot(gx, gz) < 1e-3) return -1;
  const toShore = unit({ x: 0, z: 0 }, { x: gx, z: gz });
  const rotY = ang(toShore.x, toShore.z);
  const sh = rectShape(p.x, p.z, rotY, 3, 3);
  for (const c of shapeCorners(sh)) if (heightAt(ctx.h, c.x, c.z) > -0.3) return -1;
  // boardwalk: door → first land point with sdf ≥ 1
  const door = add(p, toShore, 1.8);
  let shore: XZ | null = null;
  for (let t = 0; t <= 9; t += 0.5) {
    const q = add(door, toShore, t);
    if (onIsland(ctx, isl, q.x, q.z) && sdfAt(ctx, q.x, q.z) >= 1.2) {
      shore = q;
      break;
    }
  }
  if (!shore) return -1;
  for (const o of ctx.shapes[isl.id]) if (shapesOverlap(o, sh, 2.5)) return -1;
  // keep huts apart and off the pier + its turning basin (sweep D8: overlapping / hugging huts)
  for (const l of ctx.lots)
    if (l.kind === 'hut' && l.islandId === isl.id && dist(l, p) < VILLAGE.stiltSpacing) return -1;
  for (const d of ctx.docks) {
    if (d.islandId !== isl.id) continue;
    const dd = dirOf(d.rotY);
    const tip = add(d, dd, d.segments * DOCK.segment + DOCK.basinOffset);
    if (segDist(p, d, tip) < VILLAGE.stiltDockClear) return -1;
  }
  const li = tryLot(ctx, isl, 'stiltHut', p, rotY, sIdx, {
    minShore: 0,
    maxRelief: 99,
    water: true,
  });
  if (li < 0) return -1;
  const bw = rectShape(
    (door.x + shore.x) / 2,
    (door.z + shore.z) / 2,
    rotY,
    1.4,
    dist(door, shore),
  );
  addShape(ctx, isl, bw, false);
  const lot = ctx.lots[li];
  plan.lots.push(li);
  plan.links.push({
    pin: shore,
    kind: 'path',
    boardwalkFrom: door,
    done: (key) => {
      lot.key = key ?? -1;
    },
  });
  return li;
}

function planBeaconRock(ctx: Ctx, isl: IslandData, rng: Rng, sIdx: number): Plan | null {
  const lh = isl.anchors.lighthouse;
  if (!lh) return null;
  const landing = isl.anchors.landing ?? lh;
  const plan = newPlan('lighthouse', lh);
  const li = pushLandmark(ctx, isl, 'lighthouse', lh, lh.rotY);
  plan.landmarks.push(li);
  plan.hub = landmarkAccess(ctx, li, landing);
  plan.links.push({ pin: plan.hub, kind: 'path', done: () => undefined });
  // keeper hut
  const cand = ring(lh, OUTPOSTS.keeperRing[0], OUTPOSTS.keeperRing[1], 1.5, 16, rng.range(0, 1));
  let best = -1;
  for (const maxRelief of [2, 3.5, 6]) {
    let bs = Infinity;
    let bp: XZ | null = null;
    for (const p of cand) {
      const face = unit(p, lh);
      const sh = rectShape(p.x, p.z, ang(face.x, face.z), 3, 3);
      if (!onLand(ctx, isl, sh, 3) || !clear(ctx, isl, sh, 1.5)) continue;
      const r = relief(ctx, sh);
      if (r > maxRelief) continue;
      const s = r + 0.05 * dist(p, lh);
      if (s < bs) {
        bs = s;
        bp = p;
      }
    }
    if (bp) {
      const face = unit(bp, lh);
      best = tryLot(ctx, isl, 'cottage', bp, ang(face.x, face.z), sIdx, { minShore: 3, maxRelief });
      if (best >= 0) break;
    }
  }
  // landing dock, then the stair up to the lighthouse
  const site = findDock(ctx, isl, { near: landing, maxDist: 18, prefer: landing, carve: true });
  dockWithLink(ctx, isl, plan, site, rng.fork('moorings'), { rowboats: 1, sailboats: 0 }, 'stair');
  if (site) {
    const req = plan.links[plan.links.length - 1];
    req.corridor = { a: site.root, b: plan.hub, half: PATHS.stairCorridor };
  }
  if (best >= 0) linkLot(ctx, plan, best);
  // buoys in the lee water
  const bRng = rng.fork('buoys');
  const nb = bRng.int(OUTPOSTS.buoys[0], OUTPOSTS.buoys[1]);
  const spots: XZ[] = [];
  const R = isl.reach + OUTPOSTS.buoyShore[1];
  const [x0, x1] = gridRange(isl.cx - R, isl.cx + R);
  const [z0, z1] = gridRange(isl.cz - R, isl.cz + R);
  for (let iz = z0; iz <= z1; iz++)
    for (let ix = x0; ix <= x1; ix++) {
      const i = iz * ctx.n + ix;
      const y = -ctx.h.data[i];
      const s = -ctx.sdf[i];
      if (y < OUTPOSTS.buoyDepth[0] || y > OUTPOSTS.buoyDepth[1]) continue;
      if (s < OUTPOSTS.buoyShore[0] || s > OUTPOSTS.buoyShore[1]) continue;
      const p = cellPos(ctx, i);
      if (leewardness(isl, ctx.windDir, p.x, p.z) < 0.6) continue;
      spots.push(p);
    }
  bRng.shuffle(spots);
  const placed: XZ[] = [];
  for (const p of spots) {
    if (placed.length >= nb) break;
    if (placed.some((o) => dist(o, p) < OUTPOSTS.buoySpacing)) continue;
    if (ctx.shapes[isl.id].some((o) => shapeDist(o, p.x, p.z) < 4)) continue;
    placed.push(p);
    pushFixture(ctx, isl, 'buoy', p, bRng.range(0, Math.PI * 2));
  }
  return plan;
}

function planMillbrook(ctx: Ctx, isl: IslandData, rng: Rng, sIdx: number): Plan | null {
  const knolls = Object.keys(isl.anchors)
    .filter((k) => k.startsWith('knoll'))
    .sort()
    .map((k) => isl.anchors[k]);
  const pond = isl.anchors.pond;
  const hub = bestSample(ctx, isl, { x: isl.cx, z: isl.cz }, isl.reach, (p, i) => {
    if (ctx.sdf[i] < 12) return Infinity;
    if (knolls.some((k) => dist(k, p) < 14)) return Infinity;
    if (pond && dist(pond, p) < 12) return Infinity;
    const r = relief(ctx, discShape(p.x, p.z, 8));
    return r + (ctx.zone[i] === Zone.field ? 0.6 : 0) + 0.01 * dist(p, { x: isl.cx, z: isl.cz });
  });
  if (!hub) return null;
  const plan = newPlan('farm', hub);
  plan.links.push({ pin: hub, kind: 'path', done: () => undefined });
  const wm: number[] = [];
  for (const k of knolls) {
    if (!onLand(ctx, isl, discShape(k.x, k.z, 3), 3)) continue;
    const li = pushLandmark(ctx, isl, 'windmill', k, k.rotY);
    plan.landmarks.push(li);
    wm.push(li);
  }
  // barn + cottages around the yard, facing it
  const lotRng = rng.fork('lots');
  const nCot = lotRng.int(OUTPOSTS.farmCottages[0], OUTPOSTS.farmCottages[1]);
  const cand = lotRng.shuffle(
    ring(hub, OUTPOSTS.farmRing[0], OUTPOSTS.farmRing[1], 2.5, 14, lotRng.range(0, 1)),
  );
  const fieldCount = (sh: Shape): number => {
    let c = 0;
    for (const p of [{ x: sh.x, z: sh.z }, ...shapeCorners(sh)]) {
      const i = cellOf(ctx, p.x, p.z);
      if (i >= 0 && ctx.zone[i] === Zone.field) c++;
    }
    return c;
  };
  const lots: number[] = [];
  for (const def of ['barn', ...Array.from({ length: nCot }, () => 'cottage')]) {
    for (const maxField of [0, 2, 5]) {
      let placed = -1;
      for (const p of cand) {
        const f = unit(p, hub);
        const rotY = ang(f.x, f.z);
        const [w, d] = LOT_FOOTPRINT[def];
        if (fieldCount(rectShape(p.x, p.z, rotY, w, d)) > maxField) continue;
        if (pond && dist(pond, p) < 10) continue;
        placed = tryLot(ctx, isl, def, p, rotY, sIdx, {
          minShore: VILLAGE.lotMinShore,
          maxRelief: 1.8,
        });
        if (placed >= 0) break;
      }
      if (placed >= 0) {
        lots.push(placed);
        break;
      }
    }
  }
  // lee dock
  const site = findDock(ctx, isl, {
    near: hub,
    maxDist: isl.reach + 10,
    prefer: hub,
    lee: 40,
    carve: true,
  });
  dockWithLink(ctx, isl, plan, site, rng.fork('moorings'), {
    rowboats: rng.fork('boats').int(1, 2),
    sailboats: 0,
  });
  for (const li of wm) linkLandmark(ctx, plan, li, hub);
  if (pond)
    plan.links.push({ pin: add(pond, unit(pond, hub), 8.5), kind: 'path', done: () => undefined });
  for (const li of lots) linkLot(ctx, plan, li);
  return plan;
}

function planEmberpeak(ctx: Ctx, isl: IslandData, _rng: Rng): Plan | null {
  const spring = isl.anchors.hotspring;
  const crater = isl.anchors.crater;
  if (crater) pushLandmark(ctx, isl, 'volcanoCrater', crater, 0);
  if (!spring) return null;
  const li = pushLandmark(ctx, isl, 'hotSpring', spring, spring.rotY);
  // lee beach: nearest gentle shore sample, leeward
  const beach = bestSample(ctx, isl, spring, 40, (p, i) => {
    const s = ctx.sdf[i];
    if (s < 1.5 || s > 3.5) return Infinity;
    return dist(p, spring) - 20 * leewardness(isl, ctx.windDir, p.x, p.z);
  });
  const plan = newPlan('spring', spring);
  if (crater) plan.landmarks.push(ctx.landmarks.length - 2);
  plan.landmarks.push(li);
  plan.hub = landmarkAccess(ctx, li, beach ?? { x: isl.cx, z: isl.cz });
  plan.links.push({ pin: plan.hub, kind: 'path', done: () => undefined });
  if (beach) plan.links.push({ pin: beach, kind: 'path', done: () => undefined });
  return plan;
}

function planPalmlagoon(ctx: Ctx, isl: IslandData, rng: Rng, sIdx: number): Plan | null {
  const wreck = isl.anchors.wreck;
  if (wreck) {
    const li = pushLandmark(ctx, isl, 'sunkenShip', wreck, rng.fork('wreck').range(0, Math.PI * 2));
    void li;
  }
  const lagoon = isl.anchors.lagoon ?? { x: isl.cx, z: isl.cz };
  const plan = newPlan('beachhut', lagoon);
  if (wreck) plan.landmarks.push(ctx.landmarks.length - 1);
  // stilt hut on the lagoon edge
  const hutRng = rng.fork('stilt');
  const spots: XZ[] = [];
  const R = isl.radius * 0.8;
  const [x0, x1] = gridRange(lagoon.x - R, lagoon.x + R);
  const [z0, z1] = gridRange(lagoon.z - R, lagoon.z + R);
  for (let iz = z0; iz <= z1; iz++)
    for (let ix = x0; ix <= x1; ix++) {
      const i = iz * ctx.n + ix;
      const y = ctx.h.data[i];
      const s = -ctx.sdf[i];
      if (y > -VILLAGE.stiltDepth[0] || y < -VILLAGE.stiltDepth[1]) continue;
      if (s < VILLAGE.stiltShore[0] || s > VILLAGE.stiltShore[1]) continue;
      const p = cellPos(ctx, i);
      if (dist(p, lagoon) > R) continue;
      if (wreck && dist(p, wreck) < 12) continue;
      spots.push(p);
    }
  hutRng.shuffle(spots);
  let hut = -1;
  for (const p of spots) {
    hut = placeStiltHut(ctx, isl, plan, p, sIdx);
    if (hut >= 0) break;
  }
  if (hut >= 0) {
    const req = plan.links[plan.links.length - 1];
    plan.hub = req.pin;
  } else {
    const hub = bestSample(ctx, isl, lagoon, isl.reach, (p, i) =>
      ctx.sdf[i] < 2 ? Infinity : -ctx.sdf[i] + 0.01 * dist(p, lagoon),
    );
    if (!hub) return null;
    plan.hub = hub;
    plan.links.push({ pin: hub, kind: 'path', done: () => undefined });
  }
  // dock in a channel if the water allows (no carving on the atoll)
  const ch = isl.anchors.channel0;
  if (ch) {
    const site = findDock(ctx, isl, {
      near: ch,
      maxDist: 16,
      prefer: plan.hub,
      carve: false,
      maxSegments: 5,
      endDepth: DOCK.lagoonEndDepth,
    });
    dockWithLink(ctx, isl, plan, site, rng.fork('moorings'), { rowboats: 1, sailboats: 0 });
  }
  // tide pools on wet sand
  const tRng = rng.fork('tidepools');
  const nt = tRng.int(OUTPOSTS.tidePools[0], OUTPOSTS.tidePools[1]);
  const wet: XZ[] = [];
  const [ax0, ax1] = gridRange(isl.minX, isl.maxX);
  const [az0, az1] = gridRange(isl.minZ, isl.maxZ);
  for (let iz = az0; iz <= az1; iz++)
    for (let ix = ax0; ix <= ax1; ix++) {
      const i = iz * ctx.n + ix;
      if (ctx.islandMap[i] === isl.id + 1 && ctx.zone[i] === Zone.sandWet && ctx.sdf[i] >= 1)
        wet.push(cellPos(ctx, i));
    }
  tRng.shuffle(wet);
  const pools: XZ[] = [];
  for (const p of wet) {
    if (pools.length >= nt) break;
    if (pools.some((o) => dist(o, p) < OUTPOSTS.tidePoolSpacing)) continue;
    if (ctx.shapes[isl.id].some((o) => shapeDist(o, p.x, p.z) < 3)) continue;
    pools.push(p);
    pushFixture(ctx, isl, 'tidePool', p, tRng.range(0, Math.PI * 2));
  }
  return plan;
}

function planMossgrove(ctx: Ctx, isl: IslandData, rng: Rng, sIdx: number): Plan | null {
  const tree = isl.anchors.giantTree;
  if (!tree) return null;
  const ti = pushLandmark(ctx, isl, 'giantTree', tree, tree.rotY);
  const mouth = isl.anchors.streamMouth;
  const stream = ctx.streams.find((s) => s.islandId === isl.id);
  const streamDist = (p: XZ): number => {
    let best = Infinity;
    for (const q of stream?.points ?? []) best = Math.min(best, dist(p, q));
    return best;
  };
  let cabin = -1;
  if (mouth) {
    const cand = ring(mouth, OUTPOSTS.cabinRing[0], OUTPOSTS.cabinRing[1], 2, 16, rng.range(0, 1));
    let bs = Infinity;
    let bp: XZ | null = null;
    let bRot = 0;
    for (const p of cand) {
      if (streamDist(p) < OUTPOSTS.cabinStreamClear + 2.5) continue;
      const f = unit(p, mouth);
      const rotY = ang(f.x, f.z);
      const sh = rectShape(p.x, p.z, rotY, 4, 3);
      if (!onLand(ctx, isl, sh, 4) || !clear(ctx, isl, sh, 1.5)) continue;
      const r = relief(ctx, sh);
      if (r > OUTPOSTS.cabinMaxRelief) continue;
      const s = r + 0.1 * Math.abs(dist(p, mouth) - 9);
      if (s < bs) {
        bs = s;
        bp = p;
        bRot = rotY;
      }
    }
    if (bp)
      cabin = tryLot(ctx, isl, 'logCabin', bp, bRot, sIdx, {
        minShore: 4,
        maxRelief: OUTPOSTS.cabinMaxRelief,
      });
  }
  const plan = newPlan('cabin', tree);
  plan.landmarks.push(ti);
  if (cabin >= 0) {
    plan.hub = doorOf(ctx.lots[cabin]);
    linkLot(ctx, plan, cabin);
    linkLandmark(ctx, plan, ti, ctx.lots[cabin]);
  } else {
    plan.hub = landmarkAccess(ctx, ti, { x: isl.cx, z: isl.cz });
    plan.links.push({ pin: plan.hub, kind: 'path', done: () => undefined });
  }
  return plan;
}

function planLonelyPalm(ctx: Ctx, isl: IslandData): void {
  const palm = isl.anchors.palm;
  if (palm) pushLandmark(ctx, isl, 'lonelyPalm', palm, palm.rotY);
  const bottle = isl.anchors.bottle;
  if (bottle) pushFixture(ctx, isl, 'messageBottle', bottle, bottle.rotY);
}

// ---------------------------------------------------------------------------
// Network helpers.

function islandWindow(
  ctx: Ctx,
  isl: IslandData,
): { n: number; x0: number; z0: number; x1: number; z1: number } {
  const [x0, x1] = gridRange(isl.minX, isl.maxX);
  const [z0, z1] = gridRange(isl.minZ, isl.maxZ);
  return { n: ctx.n, x0, z0, x1, z1 };
}

function stepCtx(ctx: Ctx, isl: IslandData) {
  return {
    h: ctx.h,
    sdf: ctx.sdf,
    islandMap: ctx.islandMap,
    zone: ctx.zone,
    islandId: isl.id,
    blocked: ctx.blocked,
    net: ctx.net,
  };
}

/** Island window clipped to ±half u around p (local searches first, cheap). */
function localWindow(
  ctx: Ctx,
  isl: IslandData,
  p: XZ,
  half: number,
): { n: number; x0: number; z0: number; x1: number; z1: number } {
  const w = islandWindow(ctx, isl);
  const [x0, x1] = gridRange(p.x - half, p.x + half);
  const [z0, z1] = gridRange(p.z - half, p.z + half);
  return {
    n: w.n,
    x0: Math.max(w.x0, x0),
    z0: Math.max(w.z0, z0),
    x1: Math.min(w.x1, x1),
    z1: Math.min(w.z1, z1),
  };
}

/** Nearest walkable sample to `p` (same island, inland, not blocked), within 4 u. */
function nearestPathCell(ctx: Ctx, isl: IslandData, p: XZ): number {
  const c = cellOf(ctx, p.x, p.z);
  if (c < 0) return -1;
  const cx = c % ctx.n;
  const cz = Math.floor(c / ctx.n);
  let best = -1;
  let bd = Infinity;
  for (let dz = -2; dz <= 2; dz++)
    for (let dx = -2; dx <= 2; dx++) {
      const x = cx + dx;
      const z = cz + dz;
      if (x < 0 || z < 0 || x >= ctx.n || z >= ctx.n) continue;
      const i = z * ctx.n + x;
      if (ctx.islandMap[i] !== isl.id + 1 || ctx.sdf[i] < PATHS.minShore || ctx.blocked[i])
        continue;
      const d = Math.hypot(cellX(x) - p.x, cellZ(z) - p.z);
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
  return best;
}

/** Connect `pin` to the island's network (seeding it if empty). Returns the pin's node key. */
function attach(ctx: Ctx, isl: IslandData, req: LinkReq): number | null {
  const start = nearestPathCell(ctx, isl, req.pin);
  if (start < 0) return null;
  if (!ctx.hasNet[isl.id]) {
    addNode(ctx.net, start, isl.id);
    ctx.hasNet[isl.id] = true;
  } else if (!ctx.net.cells[start]) {
    const base = pathStep({ ...stepCtx(ctx, isl), stair: req.kind === 'stair' });
    const near = localWindow(ctx, isl, req.pin, PATHS.linkWindow);
    const search = (corr: LinkReq['corridor'], win = islandWindow(ctx, isl)): number[] | null =>
      gridAStar({
        ...win,
        start,
        goal: -1,
        isGoal: (i) => ctx.net.cells[i] === 1 && ctx.islandMap[i] === isl.id + 1,
        step: corr
          ? (a, b, d) => {
              const p = cellPos(ctx, b);
              return segDist(p, corr.a, corr.b) > corr.half ? Infinity : base(a, b, d);
            }
          : base,
        hScale: 0,
      });
    const cells =
      (req.corridor ? search(req.corridor) : null) ?? search(undefined, near) ?? search(undefined);
    if (!cells) return null;
    addCellPath(ctx.net, cells, isl.id, req.kind);
  }
  const v = addVirtual(ctx.net, isl.id, req.pin);
  addEdge(ctx.net, v, start, req.kind);
  if (!req.boardwalkFrom) return v;
  const door = addVirtual(ctx.net, isl.id, req.boardwalkFrom);
  addEdge(ctx.net, door, v, 'boardwalk');
  return door;
}

// ---------------------------------------------------------------------------
// Flatten.

/**
 * Plateau pads: T = mean footprint height (≥ FLATTEN.minHeight), neighbours
 * with overlapping cores relaxed to differ ≤ FLATTEN.maxStep. Core samples
 * take the (distance-weighted) pad height; a smooth falloff blends outward.
 * Land samples only — the land mask / shore SDF never change. Returns the
 * core mask (protected from path carving).
 */
function applyPads(ctx: Ctx): Uint8Array {
  const { h, n, sdf, islandMap } = ctx;
  const pads = ctx.pads;
  const bound = (p: Pad): number =>
    (p.shape.r > 0 ? p.shape.r : Math.hypot(p.shape.hw, p.shape.hd)) + p.margin;
  for (const p of pads) {
    let sum = 0;
    let cnt = 0;
    const R = bound(p);
    const [x0, x1] = gridRange(p.shape.x - R, p.shape.x + R);
    const [z0, z1] = gridRange(p.shape.z - R, p.shape.z + R);
    for (let iz = z0; iz <= z1; iz++)
      for (let ix = x0; ix <= x1; ix++) {
        const i = iz * n + ix;
        if (islandMap[i] !== p.islandId + 1 || sdf[i] <= 0) continue;
        if (shapeDist(p.shape, cellX(ix), cellZ(iz)) > 0.5) continue;
        sum += h.data[i];
        cnt++;
      }
    p.T = Math.max(FLATTEN.minHeight, cnt > 0 ? sum / cnt : heightAt(h, p.shape.x, p.shape.z));
  }
  for (let it = 0; it < 12; it++)
    for (let a = 0; a < pads.length; a++)
      for (let b = a + 1; b < pads.length; b++) {
        const A = pads[a];
        const B = pads[b];
        if (A.islandId !== B.islandId) continue;
        if (dist(A.shape, B.shape) > bound(A) + bound(B)) continue;
        const d = A.T - B.T;
        const ex = Math.abs(d) - FLATTEN.maxStep;
        if (ex <= 0) continue;
        const m = (ex / 2) * Math.sign(d);
        A.T -= m;
        B.T += m;
      }
  const N = n * n;
  const coreW = new Float32Array(N);
  const coreT = new Float32Array(N);
  const fallW = new Float32Array(N);
  const fallT = new Float32Array(N);
  const fallMax = new Float32Array(N);
  for (const p of pads) {
    const R = bound(p) + FLATTEN.falloff;
    const [x0, x1] = gridRange(p.shape.x - R, p.shape.x + R);
    const [z0, z1] = gridRange(p.shape.z - R, p.shape.z + R);
    for (let iz = z0; iz <= z1; iz++)
      for (let ix = x0; ix <= x1; ix++) {
        const i = iz * n + ix;
        if (sdf[i] <= 0 || h.data[i] <= 0) continue;
        const dFoot = shapeDist(p.shape, cellX(ix), cellZ(iz));
        const dCore = dFoot - p.margin;
        if (dCore <= 0) {
          const w = 1 / (0.25 + Math.max(0, dFoot));
          coreW[i] += w;
          coreT[i] += w * p.T;
        } else if (dCore < FLATTEN.falloff) {
          const w = 1 - smoothstep(0, FLATTEN.falloff, dCore);
          fallW[i] += w;
          fallT[i] += w * p.T;
          if (w > fallMax[i]) fallMax[i] = w;
        }
      }
  }
  const protect = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    if (coreW[i] > 0) {
      h.data[i] = coreT[i] / coreW[i];
      protect[i] = 1;
    } else if (fallW[i] > 0) {
      const t = fallT[i] / fallW[i];
      h.data[i] = h.data[i] + (t - h.data[i]) * fallMax[i];
    }
  }
  return protect;
}

// ---------------------------------------------------------------------------
// Fences (Millbrook): straight runs along field-patch edges, gaps at paths.

/**
 * Fence the field patches nearest the farm hub along their rectangle edges
 * (sweep D11: traced component outlines broke into short "sticks" inside the
 * fields). Edges shared with an already fenced patch are skipped; samples off
 * the plateau, near paths/obstacles or on non-field ground open gaps; runs
 * shorter than OUTPOSTS.fenceMinRun posts are dropped.
 */
function fieldFences(
  ctx: Ctx,
  isl: IslandData,
  hub: XZ,
  rng: Rng,
  paths: Polyline[],
  fields: readonly FieldPatchData[],
): Polyline[] {
  const fieldCells = (f: FieldPatchData): number => {
    const sh = rectShape(f.x, f.z, f.rotY, f.w, f.d);
    let c = 0;
    forSamplesNearSegment(ctx.h, f, f, Math.hypot(f.w, f.d) / 2, (i) => {
      if (ctx.zone[i] !== Zone.field || ctx.islandMap[i] !== isl.id + 1) return;
      if (shapeDist(sh, cellX(i % ctx.n), cellZ(Math.floor(i / ctx.n))) <= 0) c++;
    });
    return c;
  };
  const cand = fields
    .filter((f) => f.islandId === isl.id && fieldCells(f) >= OUTPOSTS.fenceMinCells)
    .sort((a, b) => dist(a, hub) - dist(b, hub));
  const k = Math.min(cand.length, rng.int(OUTPOSTS.fenceFields[0], OUTPOSTS.fenceFields[1]));
  const nearPath = (p: XZ): boolean => {
    for (const pl of paths) {
      if (pl.islandId !== isl.id) continue;
      for (const q of pl.points) if (dist(p, q) < PATHS.halfWidth + 1.4) return true;
    }
    return false;
  };
  const fenceable = (p: XZ): boolean => {
    if (!onIsland(ctx, isl, p.x, p.z) || sdfAt(ctx, p.x, p.z) < 1.5 || nearPath(p)) return false;
    const i = cellOf(ctx, p.x, p.z);
    const z = ctx.zone[i];
    if (z !== Zone.field && z !== Zone.grass && z !== Zone.meadow) return false;
    return !ctx.shapes[isl.id].some((o) => shapeDist(o, p.x, p.z) < 1);
  };
  const out: Polyline[] = [];
  const posts: XZ[] = [];
  const step = OUTPOSTS.fenceStep;
  for (let f = 0; f < k; f++) {
    const c = cand[f];
    const loop = shapeCorners(rectShape(c.x, c.z, c.rotY, c.w, c.d));
    const pts: XZ[] = [];
    for (let e = 0; e < 4; e++) {
      const a = loop[e];
      const b = loop[(e + 1) % 4];
      const m = Math.max(1, Math.round(dist(a, b) / step));
      for (let j = 0; j < m; j++) pts.push(add(a, unit(a, b), (dist(a, b) * j) / m));
    }
    const ok = pts.map((p) => fenceable(p) && !posts.some((q) => dist(p, q) < step * 0.75));
    const runs: XZ[][] = [];
    if (ok.every(Boolean)) {
      out.push({ islandId: isl.id, kind: 'fence', closed: true, points: pts });
      posts.push(...pts);
      continue;
    }
    // rotate so the loop starts at a gap, then split into runs
    const startAt = ok.indexOf(false);
    let run: XZ[] = [];
    for (let j = 1; j <= pts.length; j++) {
      const idx = (startAt + j) % pts.length;
      if (ok[idx]) run.push(pts[idx]);
      else {
        runs.push(run);
        run = [];
      }
    }
    runs.push(run);
    for (const r of runs) {
      if (r.length < OUTPOSTS.fenceMinRun) continue;
      out.push({ islandId: isl.id, kind: 'fence', closed: false, points: r });
      posts.push(...r);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Roof colours (sweep D12): neighbouring lots never share a roof colour.

/** Roof colour (palette ROOFS index) of a lot's def + variant; −1 = not part of the rule. */
export function lotRoof(l: { defId: string; kind: string; variant: number }): number {
  if (!ROOFED_KINDS.includes(l.kind as LotData['kind'])) return -1;
  const roofs = LOT_ROOFS[l.defId];
  return roofs ? roofs[l.variant % roofs.length] : -1;
}

/** Neighbour lists for the roof rule: roofed lots on one island closer than VILLAGE.roofNeighbour. */
export function roofNeighbours(lots: readonly LotData[]): number[][] {
  const nb: number[][] = lots.map(() => []);
  for (let a = 0; a < lots.length; a++)
    for (let b = a + 1; b < lots.length; b++) {
      const A = lots[a];
      const B = lots[b];
      if (A.islandId !== B.islandId || !LOT_ROOFS[A.defId] || !LOT_ROOFS[B.defId]) continue;
      if (!ROOFED_KINDS.includes(A.kind) || !ROOFED_KINDS.includes(B.kind)) continue;
      if (dist(A, B) >= VILLAGE.roofNeighbour) continue;
      nb[a].push(b);
      nb[b].push(a);
    }
  return nb;
}

/**
 * Pick every lot's variant (in place). Lots are coloured in index order; each
 * tries its variants in an order fixed by its seeded hash and takes the first
 * whose roof differs from every already-coloured neighbour, backtracking when
 * stuck (bounded); on exhaustion the least-conflicting variant wins.
 */
function assignLotVariants(lots: LotData[], seed: number): void {
  const nb = roofNeighbours(lots);
  const order = lots.map((l, i) => {
    const k = LOT_ROOFS[l.defId]?.length ?? 1;
    const vs = Array.from({ length: k }, (_, v) => v);
    const h = vs.map((v) => hashInts(seed, i, v));
    return vs.sort((x, y) => h[x] - h[y]);
  });
  const set = new Uint8Array(lots.length);
  const ok = (i: number, v: number): boolean => {
    const r = lotRoof({ ...lots[i], variant: v });
    if (r < 0) return true;
    for (const j of nb[i]) if (set[j] && lotRoof(lots[j]) === r) return false;
    return true;
  };
  let budget = 20000;
  const solve = (i: number): boolean => {
    if (i >= lots.length) return true;
    for (const v of order[i]) {
      if (budget-- <= 0) return false;
      if (!ok(i, v)) continue;
      lots[i].variant = v;
      set[i] = 1;
      if (solve(i + 1)) return true;
      set[i] = 0;
    }
    return false;
  };
  if (solve(0)) return;
  // fallback (not 3-colourable or over budget): greedy, fewest clashes
  set.fill(0);
  for (let i = 0; i < lots.length; i++) {
    let best = order[i][0];
    let bc = Infinity;
    for (const v of order[i]) {
      const r = lotRoof({ ...lots[i], variant: v });
      let c = 0;
      for (const j of nb[i]) if (set[j] && r >= 0 && lotRoof(lots[j]) === r) c++;
      if (c < bc) {
        bc = c;
        best = v;
      }
    }
    lots[i].variant = best;
    set[i] = 1;
  }
}

// ---------------------------------------------------------------------------

export interface SettlementInput {
  h: Heightfield;
  sdf: Float32Array;
  zone: Uint8Array;
  islandMap: Uint8Array;
  islands: IslandData[];
  windDir: number;
  streams: StreamData[];
  /** Millbrook crop-field rectangles (fences follow their edges). */
  fields: FieldPatchData[];
}

export interface SettlementResult {
  settlements: SettlementData[];
  lots: LotData[];
  landmarks: LandmarkData[];
  docks: DockData[];
  moorings: MooringData[];
  fixtures: FixtureData[];
  fences: Polyline[];
  paths: Polyline[];
  pathGraph: PathGraph;
  /** Obstacles per island (occupancy marking). */
  shapes: Shape[][];
}

/**
 * Plan every island's settlement, flatten the pads, connect the footpath
 * network, write Zone.plaza / Zone.path (+ carve) and trace fences.
 * Mutates `h.data` (pads on land, dock channels in water) and `zone`.
 */
export function buildSettlements(input: SettlementInput, rng: Rng): SettlementResult {
  const n = input.h.n;
  const ctx: Ctx = {
    h: input.h,
    n,
    sdf: input.sdf,
    zone: input.zone,
    islandMap: input.islandMap,
    windDir: input.windDir,
    streams: input.streams,
    net: createNetwork(n),
    blocked: new Uint8Array(n * n),
    hasNet: input.islands.map(() => false),
    pads: [],
    shapes: input.islands.map(() => []),
    lanes: input.islands.map(() => []),
    lots: [],
    landmarks: [],
    docks: [],
    moorings: [],
    fixtures: [],
  };
  const plans: (Plan & { islandId: number })[] = [];
  for (const isl of input.islands) {
    const r = rng.fork('sites', isl.id);
    const sIdx = plans.length;
    let plan: Plan | null = null;
    switch (isl.archetype) {
      case 'hearthholm':
        plan = planHearthholm(ctx, isl, r, sIdx);
        break;
      case 'beaconrock':
        plan = planBeaconRock(ctx, isl, r, sIdx);
        break;
      case 'millbrook':
        plan = planMillbrook(ctx, isl, r, sIdx);
        break;
      case 'emberpeak':
        plan = planEmberpeak(ctx, isl, r);
        break;
      case 'palmlagoon':
        plan = planPalmlagoon(ctx, isl, r, sIdx);
        break;
      case 'mossgrove':
        plan = planMossgrove(ctx, isl, r, sIdx);
        break;
      case 'lonelypalm':
        planLonelyPalm(ctx, isl);
        break;
    }
    if (plan) plans.push({ ...plan, islandId: isl.id });
  }

  const protect = applyPads(ctx);

  // connect: hub first (seeds the network), then the rest in plan order
  for (const plan of plans) {
    const isl = input.islands[plan.islandId];
    for (const req of plan.links) {
      const key = attach(ctx, isl, req);
      if (plan.hubKey < 0 && key !== null && !req.boardwalkFrom) plan.hubKey = key;
      if (plan.hubKey < 0 && key !== null && req.boardwalkFrom) {
        // stilt-hut hub (Palmlagoon): the shore end of the boardwalk
        const l = ctx.net.adj.get(key);
        plan.hubKey = l && l.length > 0 ? l[0].to : key;
      }
      req.done(key);
    }
  }

  const valid = (x: number, z: number, islandId: number): boolean => {
    if (sdfAt(ctx, x, z) < 0.3) return false;
    const sh = islandId >= 0 ? ctx.shapes[islandId] : [];
    for (const o of sh) if (o.r === 0 && shapeDist(o, x, z) < 0.2) return false;
    return true;
  };
  const built = buildPathGraph(ctx.net, n, valid);

  // drop lots that could not be connected; remap settlement indices
  const lotMap = new Int32Array(ctx.lots.length).fill(-1);
  const lots: LotData[] = [];
  ctx.lots.forEach((l, i) => {
    const node = l.key >= 0 ? built.nodeOf.get(l.key) : undefined;
    if (node === undefined) return;
    lotMap[i] = lots.length;
    lots.push({
      defId: l.defId,
      x: l.x,
      z: l.z,
      rotY: l.rotY,
      islandId: l.islandId,
      kind: l.kind,
      w: l.w,
      d: l.d,
      node,
      variant: 0,
      role: l.role,
    });
  });
  assignLotVariants(lots, rng.fork('roofs').nextU32());
  const docks: DockData[] = ctx.docks.map((d) => ({
    x: d.x,
    z: d.z,
    rotY: d.rotY,
    segments: d.segments,
    islandId: d.islandId,
    node: d.node >= 0 ? (built.nodeOf.get(d.node) ?? -1) : -1,
  }));

  // zones: plaza discs, fields under lots → grass, then paths (+ carve)
  for (const plan of plans) {
    if (!plan.plaza) continue;
    const { x, z, r } = plan.plaza;
    forSamplesNearSegment(ctx.h, plan.plaza, plan.plaza, r, (i) => {
      if (ctx.sdf[i] > 0 && ctx.islandMap[i] === plan.islandId + 1) ctx.zone[i] = Zone.plaza;
    });
    void x;
    void z;
  }
  for (const l of lots) {
    if (l.kind === 'hut') continue;
    const sh = lotShape(l);
    forSamplesNearSegment(ctx.h, l, l, Math.hypot(sh.hw, sh.hd) + 1, (i) => {
      if (ctx.zone[i] === Zone.field && shapeDist(sh, cellX(i % n), cellZ(Math.floor(i / n))) < 1)
        ctx.zone[i] = Zone.grass;
    });
  }
  writePaths(ctx.h, ctx.zone, ctx.sdf, built.paths, protect);

  const fences: Polyline[] = [];
  for (const plan of plans) {
    const isl = input.islands[plan.islandId];
    if (isl.archetype !== 'millbrook') continue;
    fences.push(
      ...fieldFences(
        ctx,
        isl,
        plan.hub,
        rng.fork('sites', isl.id).fork('fences'),
        built.paths,
        input.fields,
      ),
    );
  }

  const settlements: SettlementData[] = plans.map((p) => {
    const hubNode = p.hubKey >= 0 ? (built.nodeOf.get(p.hubKey) ?? -1) : -1;
    const hubPos =
      hubNode >= 0
        ? { x: built.graph.nodes[hubNode * 2], z: built.graph.nodes[hubNode * 2 + 1] }
        : p.hub;
    return {
      islandId: p.islandId,
      kind: p.kind,
      theme: input.islands[p.islandId].theme,
      hub: { x: hubPos.x, z: hubPos.z, node: hubNode },
      plaza: p.plaza,
      lots: p.lots.map((i) => lotMap[i]).filter((i) => i >= 0),
      landmarks: p.landmarks,
      docks: p.docks,
    };
  });

  return {
    settlements,
    lots,
    landmarks: ctx.landmarks,
    docks,
    moorings: ctx.moorings,
    fixtures: ctx.fixtures,
    fences,
    paths: built.paths,
    pathGraph: built.graph,
    shapes: ctx.shapes,
  };
}

/** Occupancy value for structures (ground cover avoids these; trees avoid any non-zero). */
export const OCC_STRUCTURE = 2;
/** Occupancy value for footpaths. */
export const OCC_PATH = 1;

/**
 * Mark settlement obstacles (lots, landmarks, fixtures, docks, moorings,
 * boardwalks, plaza) as OCC_STRUCTURE and footpaths as OCC_PATH, before scatter.
 */
export function markSites(occ: OccupancyGrid, world: WorldData, shapes: Shape[][]): void {
  const c = occ.cell;
  const markShape = (sh: Shape, value: number, pad: number): void => {
    const R = (sh.r > 0 ? sh.r : Math.hypot(sh.hw, sh.hd)) + pad + c;
    const x0 = Math.max(0, Math.floor((sh.x - R - occ.originX) / c));
    const x1 = Math.min(occ.n - 1, Math.floor((sh.x + R - occ.originX) / c));
    const z0 = Math.max(0, Math.floor((sh.z - R - occ.originZ) / c));
    const z1 = Math.min(occ.n - 1, Math.floor((sh.z + R - occ.originZ) / c));
    for (let iz = z0; iz <= z1; iz++)
      for (let ix = x0; ix <= x1; ix++) {
        const x = occ.originX + (ix + 0.5) * c;
        const z = occ.originZ + (iz + 0.5) * c;
        if (shapeDist(sh, x, z) <= pad) {
          const i = iz * occ.n + ix;
          if (occ.data[i] < value) occ.data[i] = value;
        }
      }
  };
  for (const list of shapes) for (const sh of list) markShape(sh, OCC_STRUCTURE, 0.75);
  for (const p of world.paths)
    for (const q of p.points) markShape(discShape(q.x, q.z, PATHS.halfWidth), OCC_PATH, 0);
}
