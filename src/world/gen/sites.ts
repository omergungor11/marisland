import type { Rng } from '../../core/rng.ts';
import { clamp, smoothstep } from '../../core/math/index.ts';
import { FRAMING } from '../../content/camera.ts';
import {
  DOCK,
  FIXTURE_RADIUS,
  FLATTEN,
  LANDMARKS,
  LOT_FOOTPRINT,
  LOT_KIND,
  OUTPOSTS,
  PATHS,
  VILLAGE,
  type CampusSpec,
} from '../../content/settlements.ts';
import { OFFICE_DEFS } from '../../content/offices.ts';
import { THEMES } from '../../content/themes/index.ts';
import type {
  DistrictData,
  DockData,
  FieldPatchData,
  FixtureData,
  Heightfield,
  IslandData,
  LandmarkData,
  LotData,
  MooringData,
  Polyline,
  StreamData,
  XZ,
} from '../types.ts';
import { heightAt, sampleGrid, Zone } from '../types.ts';
import { cellX, cellZ, gridRange } from './grid.ts';
import { leewardness } from './heightfield.ts';
import {
  addCellPath,
  addEdge,
  addNode,
  addVirtual,
  forSamplesNearSegment,
  gridAStar,
  pathStep,
  resample,
  type PathNetwork,
} from './paths.ts';

/**
 * Settlement site primitives (M14b TASK-361, D-029): planner state (`SiteCtx`), the plan record
 * (`SitePlan`) and the building blocks every planner composes — lot / landmark / fixture
 * placement, docks and moorings, stilt huts, campus quad + lanes + lots, buoys, tide pools,
 * link requests and network seeding. Moved verbatim out of settlements.ts; the per-theme
 * planners (world/gen/plans) and the legacy archetype planners (settlements.ts) both use them.
 * Pure data; every random decision draws from the `Rng` the caller passes in.
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

export interface Pad {
  islandId: number;
  /** Footprint (core = footprint grown by `margin`). */
  shape: Shape;
  margin: number;
  T: number;
}

export interface PendingLot extends LotData {
  key: number;
  settlement: number;
}

export interface LinkReq {
  pin: XZ;
  kind: 'path' | 'stair';
  /** Stilt hut: boardwalk from this door (water) to `pin` (shore). */
  boardwalkFrom?: XZ;
  /** Keep the search within `half` u of segment a→b (stair: forces switchbacks). */
  corridor?: { a: XZ; b: XZ; half: number };
  done(key: number | null): void;
}

/** One island's settlement plan (a `world.settlements` entry before the network is built). */
export interface SitePlan {
  kind: string;
  hub: XZ;
  plaza: { x: number; z: number; r: number } | null;
  lots: number[];
  landmarks: number[];
  docks: number[];
  links: LinkReq[];
  hubKey: number;
  /** Theme districts (M14b): collected into `world.districts` in plan order. */
  districts: DistrictData[];
  /** Theme polylines (M14b, e.g. kind 'pipe'): appended to `world.fences` in plan order. */
  lines?: Polyline[];
}

/** Shared planner state across all islands (one per `buildSettlements` call). */
export interface SiteCtx {
  h: Heightfield;
  n: number;
  sdf: Float32Array;
  zone: Uint8Array;
  islandMap: Uint8Array;
  windDir: number;
  islands: readonly IslandData[];
  streams: StreamData[];
  fields: readonly FieldPatchData[];
  net: PathNetwork;
  blocked: Uint8Array;
  hasNet: boolean[];
  /** Per island: walkable land component of the campus quad (campus lots must stand on it). */
  reach: (Uint8Array | null)[];
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

export const ang = (dx: number, dz: number): number => Math.atan2(dz, dx);
export const segDist = (p: XZ, a: XZ, b: XZ): number => {
  const vx = b.x - a.x;
  const vz = b.z - a.z;
  const l2 = vx * vx + vz * vz;
  const t = l2 > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * vx + (p.z - a.z) * vz) / l2)) : 0;
  return Math.hypot(p.x - a.x - vx * t, p.z - a.z - vz * t);
};
export const dirOf = (a: number): XZ => ({ x: Math.cos(a), z: Math.sin(a) });
export const add = (p: XZ, d: XZ, t: number): XZ => ({ x: p.x + d.x * t, z: p.z + d.z * t });
export const dist = (a: XZ, b: XZ): number => Math.hypot(a.x - b.x, a.z - b.z);
export const unit = (from: XZ, to: XZ): XZ => {
  const l = dist(from, to) || 1;
  return { x: (to.x - from.x) / l, z: (to.z - from.z) / l };
};

export function cellOf(ctx: SiteCtx, x: number, z: number): number {
  const ix = Math.round((x - ctx.h.originX) / ctx.h.cellSize);
  const iz = Math.round((z - ctx.h.originZ) / ctx.h.cellSize);
  if (ix < 0 || iz < 0 || ix >= ctx.n || iz >= ctx.n) return -1;
  return iz * ctx.n + ix;
}
export const cellPos = (ctx: SiteCtx, i: number): XZ => ({
  x: cellX(i % ctx.n),
  z: cellZ(Math.floor(i / ctx.n)),
});
export const sdfAt = (ctx: SiteCtx, x: number, z: number): number =>
  sampleGrid(ctx.h, ctx.sdf, x, z, -999);
export const onIsland = (ctx: SiteCtx, isl: IslandData, x: number, z: number): boolean => {
  const i = cellOf(ctx, x, z);
  return i >= 0 && ctx.islandMap[i] === isl.id + 1;
};

/** Height relief (max − min) over a rect/disc footprint (centre, corners, edge mids). */
export function relief(ctx: SiteCtx, sh: Shape): number {
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
/** The 4 grid samples around (x, z) are this island's land, so a pad raises all of them. */
export function cellOnLand(ctx: SiteCtx, isl: IslandData, x: number, z: number): boolean {
  const fx = Math.floor((x - ctx.h.originX) / ctx.h.cellSize);
  const fz = Math.floor((z - ctx.h.originZ) / ctx.h.cellSize);
  if (fx < 0 || fz < 0 || fx >= ctx.n - 1 || fz >= ctx.n - 1) return false;
  for (const i of [
    fz * ctx.n + fx,
    fz * ctx.n + fx + 1,
    (fz + 1) * ctx.n + fx,
    (fz + 1) * ctx.n + fx + 1,
  ])
    if (ctx.islandMap[i] !== isl.id + 1 || ctx.sdf[i] <= 0 || ctx.h.data[i] <= 0) return false;
  return true;
}

/**
 * Shape on this island's land with at least `minShore` u of shore distance at its centre and
 * every corner at least `cornerMin` u above sea; rect corners also sit in all-land grid cells
 * (the flatten pad then levels them — a water sample would drag a corner down).
 */
export function onLand(
  ctx: SiteCtx,
  isl: IslandData,
  sh: Shape,
  minShore: number,
  cornerMin = 0.3,
): boolean {
  if (!onIsland(ctx, isl, sh.x, sh.z) || sdfAt(ctx, sh.x, sh.z) < minShore) return false;
  const pts =
    sh.r > 0 ? [0, 1, 2, 3, 4, 5].map((k) => add(sh, dirOf(k * 1.047), sh.r)) : shapeCorners(sh);
  for (const p of pts) {
    if (!onIsland(ctx, isl, p.x, p.z) || heightAt(ctx.h, p.x, p.z) < cornerMin) return false;
    if (sh.r === 0 && !cellOnLand(ctx, isl, p.x, p.z)) return false;
  }
  return true;
}

export function clear(
  ctx: SiteCtx,
  isl: IslandData,
  sh: Shape,
  gap: number,
  inPlaza = false,
): boolean {
  for (const o of ctx.shapes[isl.id]) {
    if (inPlaza && o.tag === 'plaza') continue;
    if (shapesOverlap(o, sh, gap)) return false;
  }
  for (const lane of ctx.lanes[isl.id])
    for (const p of lane) if (shapeDist(sh, p.x, p.z) < PATHS.halfWidth + 0.4) return false;
  return true;
}

/** Register an obstacle; `block` rasterises it into the path-blocking grid. */
export function addShape(ctx: SiteCtx, isl: IslandData, sh: Shape, block: boolean): void {
  ctx.shapes[isl.id].push(sh);
  if (!block) return;
  const R = (sh.r > 0 ? sh.r : Math.hypot(sh.hw, sh.hd)) + 1;
  const [x0, x1] = gridRange(sh.x - R, sh.x + R);
  const [z0, z1] = gridRange(sh.z - R, sh.z + R);
  for (let iz = z0; iz <= z1; iz++)
    for (let ix = x0; ix <= x1; ix++)
      if (shapeDist(sh, cellX(ix), cellZ(iz)) <= 0.5) ctx.blocked[iz * ctx.n + ix] = 1;
}

export function addPad(ctx: SiteCtx, isl: IslandData, sh: Shape, margin: number): void {
  ctx.pads.push({ islandId: isl.id, shape: sh, margin, T: 0 });
}

export function pushLandmark(
  ctx: SiteCtx,
  isl: IslandData,
  kind: string,
  p: XZ,
  rotY: number,
): number {
  const spec = LANDMARKS[kind];
  ctx.landmarks.push({ kind, x: p.x, z: p.z, rotY, islandId: isl.id });
  if (spec?.radius) addShape(ctx, isl, discShape(p.x, p.z, spec.radius), true);
  if (spec?.flatten) addPad(ctx, isl, discShape(p.x, p.z, spec.flatten), FLATTEN.discMargin);
  return ctx.landmarks.length - 1;
}

export function pushFixture(
  ctx: SiteCtx,
  isl: IslandData,
  defId: string,
  p: XZ,
  rotY: number,
): void {
  ctx.fixtures.push({ defId, x: p.x, z: p.z, rotY, islandId: isl.id });
  const r = FIXTURE_RADIUS[defId] ?? 0.5;
  addShape(ctx, isl, discShape(p.x, p.z, r), true);
}

/** Theme swap (THEMES[theme].defSwap): legacy archetype lot def → the department's def. */
export const themedDef = (isl: IslandData, defId: string): string =>
  THEMES[isl.theme].defSwap[defId] ?? defId;

/** Footprint of `defId` after the theme swap. */
export const footprintOf = (isl: IslandData, defId: string): readonly [number, number] =>
  LOT_FOOTPRINT[themedDef(isl, defId)];

/** Footprint samples (centre + corners) on Zone.field. */
export function fieldSamples(ctx: SiteCtx, sh: Shape): number {
  let c = 0;
  for (const p of [{ x: sh.x, z: sh.z }, ...shapeCorners(sh)]) {
    const i = cellOf(ctx, p.x, p.z);
    if (i >= 0 && ctx.zone[i] === Zone.field) c++;
  }
  return c;
}

/** Lots keep off streams and never cover a crop-field patch centre. */
export function siteFree(ctx: SiteCtx, isl: IslandData, sh: Shape): boolean {
  for (const f of ctx.fields)
    if (f.islandId === isl.id && shapeDist(sh, f.x, f.z) <= 0) return false;
  for (const s of ctx.streams) {
    if (s.islandId !== isl.id) continue;
    for (const q of s.points) if (shapeDist(sh, q.x, q.z) < OUTPOSTS.cabinStreamClear) return false;
  }
  return true;
}

/** Place a lot (def after the theme swap); −1 when it does not fit. */
export function tryLot(
  ctx: SiteCtx,
  isl: IslandData,
  def: string,
  p: XZ,
  rotY: number,
  settlement: number,
  opts: {
    minShore: number;
    maxRelief: number;
    water?: boolean;
    inPlaza?: boolean;
    /** Corner height floor before flattening (default 0.3; the sandbar outpost uses 0). */
    cornerMin?: number;
  },
): number {
  const defId = themedDef(isl, def);
  const [w, d] = LOT_FOOTPRINT[defId];
  const sh = rectShape(p.x, p.z, rotY, w, d);
  if (!opts.water) {
    if (!onLand(ctx, isl, sh, opts.minShore, opts.cornerMin)) return -1;
    if (relief(ctx, sh) > opts.maxRelief) return -1;
    if (!siteFree(ctx, isl, sh)) return -1;
    const reach = ctx.reach[isl.id];
    if (reach) {
      const door = add(p, dirOf(rotY), d / 2 + 1);
      if (!reach[cellOf(ctx, p.x, p.z)] || !reach[cellOf(ctx, door.x, door.z)]) return -1;
    }
  }
  if (!clear(ctx, isl, sh, VILLAGE.lotGap, opts.inPlaza)) return -1;
  // a 2-variant office def cannot alternate roofs around a triangle of itself (D12)
  if (OFFICE_DEFS[defId]) {
    const near = ctx.lots.filter(
      (l) => l.islandId === isl.id && l.defId === defId && dist(l, p) < VILLAGE.roofNeighbour,
    );
    for (let a = 0; a < near.length; a++)
      for (let b = a + 1; b < near.length; b++)
        if (dist(near[a], near[b]) < VILLAGE.roofNeighbour) return -1;
  }
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

export const doorOf = (l: LotData, extra = 1.0): XZ => add(l, dirOf(l.rotY), l.d / 2 + extra);

// ---------------------------------------------------------------------------
// Docks.

export interface DockSite {
  root: XZ;
  dir: XZ;
  segments: number;
  carve: boolean;
}

export function findDock(
  ctx: SiteCtx,
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
export function carveWater(
  ctx: SiteCtx,
  a: XZ,
  b: XZ,
  core: number,
  falloff: number,
  depth: number,
): void {
  forSamplesNearSegment(ctx.h, a, b, core + falloff, (i, d) => {
    const y = ctx.h.data[i];
    if (y >= 0 || ctx.sdf[i] > 0) return;
    const w = 1 - smoothstep(core, core + falloff, d);
    const t = y + (-depth - y) * w;
    if (t < y) ctx.h.data[i] = t;
  });
}

export function placeDock(
  ctx: SiteCtx,
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
export function dockWithLink(
  ctx: SiteCtx,
  isl: IslandData,
  plan: SitePlan,
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
export function bestSample(
  ctx: SiteCtx,
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
export function ring(
  c: XZ,
  r0: number,
  r1: number,
  step: number,
  angles: number,
  phase: number,
): XZ[] {
  const out: XZ[] = [];
  for (let r = r0; r <= r1 + 1e-6; r += step)
    for (let k = 0; k < angles; k++) out.push(add(c, dirOf(phase + (k / angles) * Math.PI * 2), r));
  return out;
}

export function landmarkAccess(ctx: SiteCtx, lmIndex: number, toward: XZ): XZ {
  const lm = ctx.landmarks[lmIndex];
  const r = LANDMARKS[lm.kind]?.radius ?? 1;
  return add(lm, unit(lm, toward), r + 1.2);
}

export function linkLandmark(
  ctx: SiteCtx,
  plan: SitePlan,
  lmIndex: number,
  toward: XZ,
  kind: 'path' | 'stair' = 'path',
): void {
  plan.links.push({ pin: landmarkAccess(ctx, lmIndex, toward), kind, done: () => undefined });
}

export function linkLot(ctx: SiteCtx, plan: SitePlan, li: number): void {
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
// Campus lanes (Phase 3): shared by the HQ village and every department campus.

/** Weighted picker over a theme's lot mix. */
export function mixPicker(mix: readonly (readonly [string, number])[], rng: Rng): () => string {
  let total = 0;
  for (const [, w] of mix) total += w;
  return () => {
    let t = rng.next() * total;
    for (const [d, w] of mix) {
      t -= w;
      if (t < 0) return d;
    }
    return mix[mix.length - 1][0];
  };
}

export const lotArea = (def: string): number => LOT_FOOTPRINT[def][0] * LOT_FOOTPRINT[def][1];

/**
 * Lot defs to try for one slot: the drawn def, then the smaller defs of the mix (fill) — never
 * the crown def as a filler (it would crowd out the buildings; crownLot places one).
 */
export function slotDefs(
  first: string,
  mix: readonly (readonly [string, number])[],
  crown: string | null,
): string[] {
  const smaller = mix
    .map(([d]) => d)
    .filter((d) => d !== crown && lotArea(d) < lotArea(first))
    .sort((a, b) => lotArea(b) - lotArea(a) || (a < b ? -1 : 1));
  return [first, ...smaller];
}

export interface LaneOpts {
  /** Quad / plaza centre and radius; lanes start at its hub cell. */
  centre: XZ;
  quadR: number;
  hubCell: number;
  /** Heading of lane 0 (rad); `laneEnd` pins lane 0's far end (harbour pier, archetype hub). */
  a0: number;
  laneEnd: XZ | null;
  spec: CampusSpec;
  rng: Rng;
  sIdx: number;
}

/**
 * Lanes radiating from the quad (A* on the grid, added to the network) with lots from the
 * theme's `lotMix` along both sides, facing the lane, until `target` lots stand. Extracted from
 * the Hearthholm village (TASK-302). Returns the new lot indices.
 */
export function layLanes(ctx: SiteCtx, isl: IslandData, o: LaneOpts, target = -1): number[] {
  const { spec, rng } = o;
  const goal = target >= 0 ? target : rng.int(spec.lots[0], spec.lots[1]);
  const mix = THEMES[isl.theme].lotMix;
  const pick = mixPicker(mix, rng);
  const step = pathStep({ ...stepCtx(ctx, isl), stair: false });
  const lots: number[] = [];
  for (const off of spec.lanes) {
    if (lots.length >= goal) break;
    const a = o.a0 + (off * Math.PI) / 180;
    let endCell = -1;
    if (off === 0 && o.laneEnd) endCell = nearestPathCell(ctx, isl, o.laneEnd);
    else
      for (let L = spec.laneLength; L >= o.quadR + 10; L -= 4) {
        const p = add(o.centre, dirOf(a), L);
        if (!onIsland(ctx, isl, p.x, p.z) || sdfAt(ctx, p.x, p.z) < 3) continue;
        endCell = nearestPathCell(ctx, isl, p);
        if (endCell >= 0) break;
      }
    if (endCell < 0 || endCell === o.hubCell) continue;
    const cells = gridAStar({
      ...islandWindow(ctx, isl),
      start: o.hubCell,
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
    // lots along both sides, facing the lane; slot spacing follows the drawn footprints
    let s = o.quadR + 2.6;
    const total = lane.length - 1;
    let drawn = [pick(), pick()];
    while (s < total - 1 && lots.length < goal) {
      const k = Math.min(total - 1, Math.floor(s));
      const p = lane[k];
      const t = unit(p, lane[k + 1]);
      const nrm = { x: -t.z, z: t.x };
      let wMax = 0;
      for (let si = 0; si < 2; si++) {
        if (lots.length >= goal) break;
        const side = si === 0 ? 1 : -1;
        const rotY = ang(-nrm.x * side, -nrm.z * side);
        for (const def of slotDefs(drawn[si], mix, THEMES[isl.theme].crown)) {
          const [w, d] = LOT_FOOTPRINT[def];
          const c = add(p, nrm, side * (VILLAGE.laneClear + d / 2));
          if (fieldSamples(ctx, rectShape(c.x, c.z, rotY, w, d)) > spec.maxFieldSamples) continue;
          const li = tryLot(ctx, isl, def, c, rotY, o.sIdx, {
            minShore: spec.minShore,
            maxRelief: spec.maxRelief,
          });
          if (li >= 0) {
            lots.push(li);
            wMax = Math.max(wMax, w);
            break;
          }
        }
      }
      const next = [pick(), pick()];
      const wNext = Math.max(LOT_FOOTPRINT[next[0]][0], LOT_FOOTPRINT[next[1]][0]);
      s += (wMax || wNext) / 2 + wNext / 2 + VILLAGE.lotGap + rng.range(0, VILLAGE.laneJitter);
      drawn = next;
    }
  }
  return lots;
}

/** The highest of `lots` that can hold the theme's crown def becomes the crown (like the tower house). */
export function crownLot(ctx: SiteCtx, isl: IslandData, lots: readonly number[]): void {
  const crown = THEMES[isl.theme].crown;
  if (!crown) return;
  const [w, d] = LOT_FOOTPRINT[crown];
  const y = (li: number): number => heightAt(ctx.h, ctx.lots[li].x, ctx.lots[li].z);
  let ti = -1;
  for (const li of lots) {
    const l = ctx.lots[li];
    if (l.w < w || l.d < d || l.kind === 'hut') continue;
    if (ti < 0 || y(li) > y(ti)) ti = li;
  }
  if (ti < 0) return;
  const lot = ctx.lots[ti];
  lot.defId = crown;
  lot.kind = LOT_KIND[crown];
  lot.w = w;
  lot.d = d;
  const pad = ctx.pads.find((p) => p.shape.x === lot.x && p.shape.z === lot.z);
  if (pad) pad.shape = rectShape(lot.x, lot.z, lot.rotY, w, d);
}

/**
 * Walkable land (shore distance ≥ PATHS.minShore, 8-connected) reachable from the sample
 * nearest `from`: lots on the far piece of a broken atoll ring could never link up.
 */
export function walkableFrom(ctx: SiteCtx, isl: IslandData, from: XZ): Uint8Array | null {
  const start = cellOf(ctx, from.x, from.z);
  if (start < 0) return null;
  const n = ctx.n;
  const ok = (i: number): boolean =>
    ctx.islandMap[i] === isl.id + 1 && ctx.sdf[i] >= PATHS.minShore;
  const seen = new Uint8Array(n * n);
  const stack = [start];
  seen[start] = 1;
  while (stack.length > 0) {
    const c = stack.pop() as number;
    const cx = c % n;
    for (let dz = -1; dz <= 1; dz++)
      for (let dx = -1; dx <= 1; dx++) {
        const x = cx + dx;
        const j = c + dz * n + dx;
        if (x < 0 || x >= n || j < 0 || j >= seen.length || seen[j] || !ok(j)) continue;
        seen[j] = 1;
        stack.push(j);
      }
  }
  return seen;
}

/**
 * Best spot for one lot of `def` within `inner + spec.ring` of `centre`: every land sample,
 * facing the centre or sideways, scored by relief then distance. Returns the lot index or −1.
 */
export function placeNear(
  ctx: SiteCtx,
  isl: IslandData,
  def: string,
  centre: XZ,
  inner: number,
  spec: CampusSpec,
  sIdx: number,
): number {
  const [w, d] = LOT_FOOTPRINT[def];
  const r0 = inner + spec.ring[0];
  let rot = 0;
  const rots = new Map<number, number>();
  const p = bestSample(ctx, isl, centre, r0 + spec.ring[1], (q, i) => {
    if (ctx.sdf[i] < spec.minShore || dist(q, centre) < r0) return Infinity;
    const f = unit(q, centre);
    const a = ang(f.x, f.z);
    let best = Infinity;
    for (const r of [a, a + Math.PI / 2, a - Math.PI / 2]) {
      const sh = rectShape(q.x, q.z, r, w, d);
      if (fieldSamples(ctx, sh) > spec.maxFieldSamples || !onLand(ctx, isl, sh, spec.minShore))
        continue;
      const rel = relief(ctx, sh);
      if (rel > spec.maxRelief || rel >= best) continue;
      if (!clear(ctx, isl, sh, VILLAGE.lotGap) || !siteFree(ctx, isl, sh)) continue;
      best = rel;
      rot = r;
    }
    if (best === Infinity) return Infinity;
    rots.set(i, rot);
    return best + 0.08 * dist(q, centre);
  });
  if (!p) return -1;
  const ci = cellOf(ctx, p.x, p.z);
  return tryLot(ctx, isl, def, p, rots.get(ci) ?? 0, sIdx, {
    minShore: spec.minShore,
    maxRelief: spec.maxRelief,
  });
}

/**
 * Department campus on a non-HQ island (plan §4.1), after its archetype plan: `campusQuad` then
 * `campusLots`.
 */
export function planCampus(
  ctx: SiteCtx,
  isl: IslandData,
  plan: SitePlan,
  spec: CampusSpec,
  rng: Rng,
  sIdx: number,
): void {
  campusLots(ctx, isl, plan, spec, rng, sIdx, campusQuad(ctx, isl, plan, spec));
}

/**
 * Seed the island's path network at `p` (a virtual hub node joined to the nearest walkable
 * sample) and make it the plan's hub. Returns that sample, or −1 (nothing changed) when none
 * lies within 4 u.
 */
export function seedHub(ctx: SiteCtx, isl: IslandData, plan: SitePlan, p: XZ): number {
  const hubCell = nearestPathCell(ctx, isl, p);
  if (hubCell < 0) return -1;
  const hubKey = addVirtual(ctx.net, isl.id, p);
  addNode(ctx.net, hubCell, isl.id);
  addEdge(ctx.net, hubKey, hubCell, 'path');
  ctx.hasNet[isl.id] = true;
  plan.hubKey = hubKey;
  return hubCell;
}

/**
 * Campus quad: the flattest `spec.quadR` disc within `spec.quadSearch` (growing) of `plan.hub`,
 * leeward, off fields and obstacles. When found it becomes the plan's plaza (flattened pad,
 * Zone.plaza, a 'plaza' obstacle). Draws no random numbers. Returns its centre or null.
 */
export function campusQuad(
  ctx: SiteCtx,
  isl: IslandData,
  plan: SitePlan,
  spec: CampusSpec,
): XZ | null {
  const quadShape = (p: XZ): Shape => discShape(p.x, p.z, spec.quadR);
  let quad: XZ | null = null;
  // second pass relaxed (×2 relief, 0.7 × shore): a rough quad beats none
  for (let pass = 0; pass < 2 && !quad; pass++)
    for (
      let R = spec.quadSearch;
      R <= spec.quadSearch + 5 * VILLAGE.searchGrow && !quad;
      R += VILLAGE.searchGrow
    ) {
      const minShore = Math.max(spec.quadMinShore, spec.quadR + 1) * (pass ? 0.7 : 1);
      const maxRelief = spec.quadMaxRelief * (pass ? 2 : 1);
      quad = bestSample(ctx, isl, plan.hub, R, (p, i) => {
        if (ctx.sdf[i] < minShore) return Infinity;
        const sh = quadShape(p);
        const r = relief(ctx, sh);
        if (r > maxRelief || !clear(ctx, isl, sh, 2) || !siteFree(ctx, isl, sh)) return Infinity;
        return (
          r +
          0.02 * dist(p, plan.hub) +
          spec.quadLee * (1 - leewardness(isl, ctx.windDir, p.x, p.z)) +
          0.3 * fieldSamples(ctx, rectShape(p.x, p.z, 0, spec.quadR * 2, spec.quadR * 2))
        );
      });
    }
  if (quad) {
    plan.plaza = { x: quad.x, z: quad.z, r: spec.quadR };
    addShape(ctx, isl, { ...discShape(quad.x, quad.z, spec.quadR + 0.5), tag: 'plaza' }, false);
    addPad(ctx, isl, quadShape(quad), FLATTEN.discMargin);
  }
  return quad;
}

/**
 * Campus lots around `quad` (from `campusQuad`; null = around `plan.hub`, no lanes): the
 * signature building (biggest `lotMix` def), lanes with `lotMix` lots from a network hub seeded
 * at the quad, a ring fill when the lanes run out of room, the theme crown, then door links,
 * nearest first. Lots stand on the quad's walkable land component.
 */
export function campusLots(
  ctx: SiteCtx,
  isl: IslandData,
  plan: SitePlan,
  spec: CampusSpec,
  rng: Rng,
  sIdx: number,
  quad: XZ | null,
): void {
  const target = rng.int(spec.lots[0], spec.lots[1]);
  const centre = quad ?? plan.hub;
  ctx.reach[isl.id] = walkableFrom(ctx, isl, centre);
  const lots: number[] = [];
  // signature building first (the biggest def of the mix), unless the archetype lot already
  // became one: lanes on slopes / the atoll ring rarely hold a 7 × 4 pad
  const mix = THEMES[isl.theme].lotMix;
  const crown = THEMES[isl.theme].crown;
  const main = mix
    .map(([d]) => d)
    .filter((d) => d !== crown)
    .sort((a, b) => lotArea(b) - lotArea(a) || (a < b ? -1 : 1))[0];
  if (main && !plan.lots.some((li) => ctx.lots[li].defId === main)) {
    const li = placeNear(ctx, isl, main, centre, quad ? spec.quadR : 0, spec, sIdx);
    if (li >= 0) lots.push(li);
  }
  if (quad) {
    const hubCell = seedHub(ctx, isl, plan, quad);
    if (hubCell >= 0) {
      // lane 0 heads for the archetype hub (dock / landmark side) when it is not right here
      const far = dist(quad, plan.hub) > spec.quadR + 10;
      const h = far ? unit(quad, plan.hub) : unit({ x: isl.cx, z: isl.cz }, quad);
      lots.push(
        ...layLanes(
          ctx,
          isl,
          {
            centre: quad,
            quadR: spec.quadR,
            hubCell,
            a0: ang(h.x, h.z),
            laneEnd: far ? plan.hub : null,
            spec,
            rng: rng.fork('lanes'),
            sIdx,
          },
          Math.max(0, target - lots.length),
        ),
      );
    }
  }
  // ring fill around the quad (or the archetype hub when no quad fits), facing it
  if (lots.length < target) {
    const pick = mixPicker(mix, rng.fork('ring'));
    const r0 = (quad ? spec.quadR : 0) + spec.ring[0];
    const cand = ring(centre, r0, r0 + spec.ring[1], 1.5, 32, rng.range(0, 1));
    for (const p of cand) {
      if (lots.length >= target) break;
      const drawn = pick(); // per candidate, so a too-big draw does not stall the fill
      const f = unit(p, centre);
      const a = ang(f.x, f.z);
      // facing the quad, else sideways (narrow land: the atoll ring, ledges)
      slot: for (const def of slotDefs(drawn, mix, crown))
        for (const rotY of [a, a + Math.PI / 2, a - Math.PI / 2]) {
          const [w, d] = LOT_FOOTPRINT[def];
          if (fieldSamples(ctx, rectShape(p.x, p.z, rotY, w, d)) > spec.maxFieldSamples) continue;
          const li = tryLot(ctx, isl, def, p, rotY, sIdx, {
            minShore: spec.minShore,
            maxRelief: spec.maxRelief,
          });
          if (li >= 0) {
            lots.push(li);
            break slot;
          }
        }
    }
  }
  ctx.reach[isl.id] = null;
  crownLot(ctx, isl, lots);
  lots.sort((a, b) => dist(ctx.lots[a], centre) - dist(ctx.lots[b], centre));
  for (const li of lots) linkLot(ctx, plan, li);
}

// ---------------------------------------------------------------------------
// Archetype planners.

export function newPlan(kind: string, hub: XZ): SitePlan {
  return {
    kind,
    hub,
    plaza: null,
    lots: [],
    landmarks: [],
    docks: [],
    links: [],
    hubKey: -1,
    districts: [],
  };
}

/** Stilt hut over water at `p`, facing the shore, with a boardwalk link. */
export function placeStiltHut(
  ctx: SiteCtx,
  isl: IslandData,
  plan: SitePlan,
  p: XZ,
  sIdx: number,
): number {
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

/**
 * Keep the plan's last link request (a dock's stair) within PATHS.stairCorridor u of segment
 * a→b, so the A* search climbs in switchbacks instead of wandering round the island.
 */
export function stairCorridor(plan: SitePlan, a: XZ, b: XZ): void {
  plan.links[plan.links.length - 1].corridor = { a, b, half: PATHS.stairCorridor };
}

/**
 * OUTPOSTS.buoys buoys in the island's lee water (depth / shore-distance windows, spaced, clear
 * of obstacles). `rng` is consumed whole (pass a dedicated fork, e.g. `rng.fork('buoys')`).
 */
export function placeBuoys(ctx: SiteCtx, isl: IslandData, rng: Rng): void {
  const nb = rng.int(OUTPOSTS.buoys[0], OUTPOSTS.buoys[1]);
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
  rng.shuffle(spots);
  const placed: XZ[] = [];
  for (const p of spots) {
    if (placed.length >= nb) break;
    if (placed.some((o) => dist(o, p) < OUTPOSTS.buoySpacing)) continue;
    if (ctx.shapes[isl.id].some((o) => shapeDist(o, p.x, p.z) < 4)) continue;
    placed.push(p);
    pushFixture(ctx, isl, 'buoy', p, rng.range(0, Math.PI * 2));
  }
}

/**
 * OUTPOSTS.tidePools tide pools on the island's wet sand (spaced, clear of obstacles). `rng` is
 * consumed whole (pass a dedicated fork, e.g. `rng.fork('tidepools')`).
 */
export function placeTidePools(ctx: SiteCtx, isl: IslandData, rng: Rng): void {
  const nt = rng.int(OUTPOSTS.tidePools[0], OUTPOSTS.tidePools[1]);
  const wet: XZ[] = [];
  const [ax0, ax1] = gridRange(isl.minX, isl.maxX);
  const [az0, az1] = gridRange(isl.minZ, isl.maxZ);
  for (let iz = az0; iz <= az1; iz++)
    for (let ix = ax0; ix <= ax1; ix++) {
      const i = iz * ctx.n + ix;
      if (ctx.islandMap[i] === isl.id + 1 && ctx.zone[i] === Zone.sandWet && ctx.sdf[i] >= 1)
        wet.push(cellPos(ctx, i));
    }
  rng.shuffle(wet);
  const pools: XZ[] = [];
  for (const p of wet) {
    if (pools.length >= nt) break;
    if (pools.some((o) => dist(o, p) < OUTPOSTS.tidePoolSpacing)) continue;
    if (ctx.shapes[isl.id].some((o) => shapeDist(o, p.x, p.z) < 3)) continue;
    pools.push(p);
    pushFixture(ctx, isl, 'tidePool', p, rng.range(0, Math.PI * 2));
  }
}

/**
 * W9 hero heading (camera-controls azimuth, deg): the twin of camera/poses.ts `heroAzimuth`
 * on layout data (the camera reads the same IslandData cx / cz / reach). settlements.test
 * checks both agree, so the hut stays off the line the camera actually looks along.
 */
export function heroHeading(isl: IslandData, islands: readonly IslandData[]): number {
  const h = FRAMING.hero;
  const DEG = Math.PI / 180;
  let best: number = h.azimuthDeg;
  let bestScore = -Infinity;
  for (let k = -h.searchSteps; k <= h.searchSteps; k++) {
    const az = h.azimuthDeg + k * h.searchStepDeg;
    const vx = -Math.sin(az * DEG);
    const vz = -Math.cos(az * DEG);
    let clearDeg = 180;
    for (const o of islands) {
      if (o.id === isl.id) continue;
      const dx = o.cx - isl.cx;
      const dz = o.cz - isl.cz;
      const d = Math.hypot(dx, dz);
      if (d < 1e-6) continue;
      const sep = Math.acos(clamp((dx * vx + dz * vz) / d, -1, 1)) / DEG;
      clearDeg = Math.min(clearDeg, sep - Math.atan(o.reach / d) / DEG);
    }
    const score = Math.min(clearDeg, h.clearDeg) - h.turnCost * Math.abs(k * h.searchStepDeg);
    if (score > bestScore) {
      bestScore = score;
      best = az;
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Network helpers.

export function islandWindow(
  ctx: SiteCtx,
  isl: IslandData,
): { n: number; x0: number; z0: number; x1: number; z1: number } {
  const [x0, x1] = gridRange(isl.minX, isl.maxX);
  const [z0, z1] = gridRange(isl.minZ, isl.maxZ);
  return { n: ctx.n, x0, z0, x1, z1 };
}

export function stepCtx(ctx: SiteCtx, isl: IslandData) {
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
export function localWindow(
  ctx: SiteCtx,
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
export function nearestPathCell(ctx: SiteCtx, isl: IslandData, p: XZ): number {
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
