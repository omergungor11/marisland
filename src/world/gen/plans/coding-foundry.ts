/**
 * Coding M33 sites (TASK-544, D-121; plan D-116): Bot Foundry line, Drone Port, robot test track and
 * Data Lake, pure data. Plan time (before the culture kit and the M22 beds): every rect is searched
 * on the pre-pad ground, reserved blocking, given a pad and levelled at once. The links join the
 * network after the lots. Finish (pads levelled, footpaths written): the lake is cut into its pad,
 * the zones are painted on the final ground (D-109), the anchors published. No prop is placed:
 * TASK-545 does. Numbers: content/themes/coding-foundry.ts (CODING_FOUNDRY).
 *
 * The lake follows the Tech Park pools (Zone.crater on flat ground), not the sea: the plateau stands
 * ≈ 9 u above y = 0, where the one water mesh lies, so a sea-level basin would need a pit far wider
 * than the free ground. No coast, no shore SDF and no boat route changes.
 *
 * Anchor contract (world u; rotY = xz heading (cos, sin); y = final ground). A prop whose local +x
 * runs along heading h takes fixture rotY = h + π/2; one whose local +z does takes rotY = h. `…Size`
 * = two numbers, not a position. Each group is absent when it has no site on this seed.
 * - `foundryLine0` / `foundryLine1`: belt centre line, start → exit end, rotY = its heading;
 *   `foundryLineSize` = { x: rect width, z: rect length }. Rect centre + heading: `foundryYard`.
 * - `foundrySeg0..N-1`: conveyorLine segment centres, rotY = belt heading; the last one is v1 (chute).
 * - `foundryStation0..2`: belt points of body → head → antenna; `foundryArm0..2`: arm bases off the
 *   belt on its +side, rotY = heading to the belt; `foundryCrate0..2`: crate spots behind them.
 * - `foundryExit`: where the hopping bot lands, rotY = belt heading. `foundryGate`: on the network.
 * - `dronePort`: H pad centre, rotY = yard long axis (toward the hangar), the courier hub;
 *   `dronePortYard` rect centre, `dronePortSize` = { x: width, z: length }; `droneMast0..3`;
 *   `droneHangar` rotY = heading to the pad; `dronePortGate`.
 * - `botTrack0..K-1` (3–4): botCourse stations in walking order, rotY = walking heading;
 *   `botTrackYard` rect centre, `botTrackSize` = { x: width, z: length }; `botTrackGate` (start end).
 * - `dataLake` / `dataLakeSize` / `dataLakeWobble` (world/data-lake.ts), `dataLakeYard`,
 *   `dataLakeYardSize` = { x: width, z: length }, `dataLakeRim0..K`: outline, y = level, rotY =
 *   outward normal. `lakePod0..K-1` (2–3): serverPod centres, rotY = heading to the water (its
 *   +z, the `intake` hook reaches over the water); `lakePavilion`; `lakeCloud` (tether anchor) with
 *   rotY = outward; `lakeGate`.
 */
import { FLATTEN, PATHS } from '../../../content/settlements.ts';
import { CODING_FOUNDRY as S } from '../../../content/themes/coding-foundry.ts';
import { CODING_FOUNDRY_MOTION } from '../../../content/themes/coding-foundry-motion.ts';
import { smoothstep } from '../../../core/math/index.ts';
import type { Rng } from '../../../core/rng.ts';
import { lakeEdge, lakePoint, type LakeOutline } from '../../data-lake.ts';
import { heightAt, Zone, type IslandData, type XZ, type ZoneId } from '../../types.ts';
import { cellX, cellZ, gridRange } from '../grid.ts';
import { slopeAtCell } from '../zones.ts';
import {
  add,
  addPad,
  addShape,
  ang,
  clear,
  cellOf,
  dirOf,
  discShape,
  dist,
  nearestPathCell,
  onLand,
  rectShape,
  relief,
  sdfAt,
  segDist,
  shapeDist,
  shapeNear,
  shapesOverlap,
  unit,
  type Shape,
  type SitePlan,
  type SiteCtx,
} from '../sites.ts';
import * as dm from '../../../core/math/dmath.ts';

const DEG = Math.PI / 180;
const SR = S.search;

/** A rect site: centre, long-axis heading, length along it, width across. */
interface Rect {
  c: XZ;
  a: number;
  len: number;
  wid: number;
  sh: Shape;
}

export interface Foundry {
  line: (Rect & { segments: number; gates: XZ[] }) | null;
  port: (Rect & { spec: (typeof S.port.sizes)[number]; gates: XZ[] }) | null;
  track: (Rect & { stations: number; gates: XZ[] }) | null;
  lake: (Rect & { outline: LakeOutline; gates: XZ[]; shore: ShorePieces }) | null;
}

/** A shore spot: centre, its outward heading, its keep-out radius. */
interface ShoreSpot {
  p: XZ;
  out: number;
  r: number;
}

interface ShorePieces {
  pods: ShoreSpot[];
  pavilion: ShoreSpot | null;
  cloud: ShoreSpot | null;
}

/** Pad group of the lake and its shore pieces: one level. */
const LAKE_GROUP = 544;

const rectOf = (c: XZ, a: number, len: number, wid: number): Rect => ({
  c,
  a,
  len,
  wid,
  sh: rectShape(c.x, c.z, a, wid, len),
});

/** The rect's reservation: `keep` past its footprint (a later piece's pad core stays off its core). */
const reservedOf = (r: Rect): Shape =>
  rectShape(r.c.x, r.c.z, r.a, r.wid + 2 * S.keep, r.len + 2 * S.keep);

/** True when the rect's pad core would touch another pad's core (they would tilt each other). */
const padsClash = (ctx: SiteCtx, isl: IslandData, r: Rect): boolean =>
  ctx.pads.some(
    (q) =>
      q.islandId === isl.id && shapesOverlap(q.shape, r.sh, q.margin + S.padMargin + S.padClear),
  );

/** Frame point of a rect: `u` along its long axis, `v` across (+v = heading turned +90°). */
const rectAt = (r: { c: XZ; a: number }, u: number, v: number): XZ => {
  const d = dirOf(r.a);
  return { x: r.c.x + d.x * u - d.z * v, z: r.c.z + d.z * u + d.x * v };
};

/** Rect limits of one piece. */
interface RectLimits {
  minShore: number;
  edgeShore: number;
  maxRelief: number;
}

/** The rect's edges and inside keep `edgeShore` off the coast (a concave bay between corners). */
function shoreHolds(ctx: SiteCtx, isl: IslandData, r: Rect, edge: number): boolean {
  const nu = Math.ceil(r.len / 4);
  const nv = Math.ceil(r.wid / 4);
  for (let i = 0; i <= nu; i++)
    for (let j = 0; j <= nv; j++) {
      const p = rectAt(r, (i / nu - 0.5) * r.len, (j / nv - 0.5) * r.wid);
      if (sdfAt(ctx, p.x, p.z) < edge) return false;
      if (ctx.islandMap[cellOf(ctx, p.x, p.z)] !== isl.id + 1) return false;
    }
  return true;
}

/**
 * Best free `len` × `wid` rect (lowest score): headings off the campus axis plus along the local
 * shore (the free lawns are crescents round the plateau rim). Coarse grid, the fine one when nothing
 * fits. Null when nothing does.
 */
function findRect(
  ctx: SiteCtx,
  isl: IslandData,
  campus: number,
  len: number,
  wid: number,
  lim: RectLimits,
  free: Float32Array,
  score: (p: XZ) => number,
): Rect | null {
  const [x0, x1] = gridRange(isl.minX, isl.maxX);
  const [z0, z1] = gridRange(isl.minZ, isl.maxZ);
  const n = ctx.n;
  for (const step of [SR.step, SR.fine]) {
    let best: Rect | null = null;
    let bs = Infinity;
    for (let iz = z0; iz <= z1; iz += step)
      for (let ix = x0; ix <= x1; ix += step) {
        const i = iz * n + ix;
        if (ctx.islandMap[i] !== isl.id + 1 || ctx.sdf[i] < lim.minShore) continue;
        // the disc of the rect's half width round its centre lies inside it, at any heading
        if (free[i] < wid / 2 + S.keep + SR.gap) continue;
        const p = { x: cellX(ix), z: cellZ(iz) };
        const base = score(p) + SR.rimCost * ctx.sdf[i];
        if (base >= bs) continue;
        const along = ang(ctx.sdf[i + 1] - ctx.sdf[i - 1], ctx.sdf[i + n] - ctx.sdf[i - n]);
        for (const a of [along + Math.PI / 2, ...SR.turns.map((t) => campus + t * DEG)]) {
          const r = rectOf(p, a, len, wid);
          if (!onLand(ctx, isl, r.sh, lim.minShore)) continue;
          const rel = relief(ctx, r.sh);
          if (rel > lim.maxRelief) continue;
          const sc = base + SR.reliefCost * rel;
          if (sc >= bs) continue;
          if (!shoreHolds(ctx, isl, r, lim.edgeShore)) continue;
          if (padsClash(ctx, isl, r) || !clear(ctx, isl, reservedOf(r), SR.gap)) continue;
          bs = sc;
          best = r;
        }
      }
    if (best) return best;
  }
  return null;
}

/** Distance per cell of `isl` to the nearest obstacle or lane (the search's quick reject). */
function clearanceField(ctx: SiteCtx, isl: IslandData): Float32Array {
  const free = new Float32Array(ctx.n * ctx.n);
  const lanes = ctx.lanes[isl.id].flat();
  const [x0, x1] = gridRange(isl.minX, isl.maxX);
  const [z0, z1] = gridRange(isl.minZ, isl.maxZ);
  for (let iz = z0; iz <= z1; iz++)
    for (let ix = x0; ix <= x1; ix++) {
      const i = iz * ctx.n + ix;
      if (ctx.islandMap[i] !== isl.id + 1) continue;
      const x = cellX(ix);
      const z = cellZ(iz);
      let c = Infinity;
      for (const o of ctx.shapes[isl.id]) {
        const d = shapeDist(o, x, z);
        if (d < c) c = d;
      }
      for (const q of lanes) {
        const d = Math.hypot(q.x - x, q.z - z) - PATHS.halfWidth - 0.4;
        if (d < c) c = d;
      }
      free[i] = c;
    }
  return free;
}

/** A new obstacle into the clearance field. */
function blockField(ctx: SiteCtx, isl: IslandData, free: Float32Array, sh: Shape): void {
  const [x0, x1] = gridRange(isl.minX, isl.maxX);
  const [z0, z1] = gridRange(isl.minZ, isl.maxZ);
  for (let iz = z0; iz <= z1; iz++)
    for (let ix = x0; ix <= x1; ix++) {
      const i = iz * ctx.n + ix;
      if (ctx.islandMap[i] !== isl.id + 1) continue;
      const d = shapeDist(sh, cellX(ix), cellZ(iz));
      if (d < free[i]) free[i] = d;
    }
}

/** Bearing preference off the island centre: −cost on the bearing, +cost opposite. */
const bearingScore =
  (isl: IslandData, deg: number, cost: number) =>
  (p: XZ): number =>
    -cost * dm.cos(dm.atan2(p.z - isl.cz, p.x - isl.cx) - deg * DEG);

/** Free spots just outside the rect's edges the hub can walk to, nearest `toward` first. */
function gatesOf(ctx: SiteCtx, isl: IslandData, I: FoundryInput, r: Rect, toward: XZ): XZ[] {
  const out = S.keep + S.gateOut;
  const mids = [
    rectAt(r, r.len / 2 + out, 0),
    rectAt(r, -r.len / 2 - out, 0),
    rectAt(r, 0, r.wid / 2 + out),
    rectAt(r, 0, -r.wid / 2 - out),
  ].sort((p, q) => dist(p, toward) - dist(q, toward));
  const free = mids.filter(
    (p) =>
      onLand(ctx, isl, discShape(p.x, p.z, 0.5), 1) &&
      !ctx.shapes[isl.id].some((o) => shapeNear(o, p.x, p.z, 0.6)) &&
      pinsJoined(ctx, isl, I.hub, [p], []),
  );
  return free.length > 0 ? free : [mids[0]];
}

/**
 * True when every point of `pins` stays on the walkable ground of `from`'s component (the links
 * route round the sites; a site across a neck of the plateau would cut one off). Reads the shapes
 * held so far as blocked (`held`).
 */
function pinsJoined(
  ctx: SiteCtx,
  isl: IslandData,
  from: XZ,
  pins: readonly XZ[],
  held: readonly Shape[],
): boolean {
  const start = nearestPathCell(ctx, isl, from);
  if (start < 0) return false;
  const seen = new Uint8Array(ctx.n * ctx.n);
  const open = (i: number, from: number): boolean => {
    if (seen[i] || ctx.islandMap[i] !== isl.id + 1 || ctx.blocked[i]) return false;
    if (ctx.sdf[i] < PATHS.minShore) return false;
    if (Math.abs(ctx.h.data[i] - ctx.h.data[from]) / ctx.h.cellSize > PATHS.maxSlope) return false;
    const x = cellX(i % ctx.n);
    const z = cellZ(Math.floor(i / ctx.n));
    return !held.some((sh) => shapeDist(sh, x, z) <= 0.5);
  };
  const stack = [start];
  seen[start] = 1;
  while (stack.length) {
    const i = stack.pop() as number;
    for (const j of [i - 1, i + 1, i - ctx.n, i + ctx.n])
      if (open(j, i)) {
        seen[j] = 1;
        stack.push(j);
      }
  }
  // a lot's own footprint is blocked: any walkable cell near the pin will do (its door link starts there)
  const R = S.joinCells;
  return pins.every((p) => {
    const c = cellOf(ctx, p.x, p.z);
    if (c < 0) return false;
    for (let dz = -R; dz <= R; dz++)
      for (let dx = -R; dx <= R; dx++) if (seen[c + dz * ctx.n + dx]) return true;
    return false;
  });
}

const lineLen = (segments: number): number => S.line.lead + segments * S.line.segment + S.line.tail;
const trackLen = (stations: number): number => stations * S.track.pitch + 2 * S.track.end;
const lakeRect = (a: number, b: number): [number, number] => {
  const w = 1 + S.lake.wobble;
  return [2 * (a * w + S.lake.margin), 2 * (b * w + S.lake.margin)];
};

/**
 * The shore pieces round the planned lake, each at the free outline angle nearest its wish: on land
 * with a level footprint, clear of everything (the lake rect excepted, they lean over its margin).
 * Their pads join the lake's level. `ctx.shapes` must not hold the lake rect yet.
 */
function placeShore(
  ctx: SiteCtx,
  isl: IslandData,
  o: LakeOutline,
  gate: XZ,
  lakeShape: Shape,
): ShorePieces {
  const L = S.lake;
  const c = dm.cos(o.rotY);
  const s = dm.sin(o.rotY);
  const gx = gate.x - o.x;
  const gz = gate.z - o.z;
  const gu = (gx * c + gz * s) / o.a;
  const gv = (-gx * s + gz * c) / o.b;
  // the pods on the long side across from the gate, the pavilion at the tip farther from it
  const side = gv >= 0 ? -Math.PI / 2 : Math.PI / 2;
  const far = gu >= 0 ? Math.PI : 0;
  const lane = (p: XZ): number => segDist(p, gate, o);
  const spot = (t0: number, out: number, r: number): ShoreSpot | null => {
    for (let k = 0; k < L.shoreSteps; k++) {
      const t = t0 + ((k % 2 ? 1 : -1) * Math.ceil(k / 2) * (Math.PI * 2)) / L.shoreSteps;
      const p = lakePoint(o, t, out);
      const sh = discShape(p.x, p.z, r);
      if (lane(p) < r + L.laneGap || lakeEdge(o, p.x, p.z) < L.quayIn) continue;
      if (!onLand(ctx, isl, sh, L.pieceShore) || relief(ctx, sh) > L.pieceRelief) continue;
      if (!clear(ctx, isl, sh, L.pieceGap)) continue;
      if (
        ctx.pads.some(
          (q) =>
            q.islandId === isl.id &&
            q.shape !== lakeShape &&
            q.group !== LAKE_GROUP &&
            shapesOverlap(q.shape, sh, q.margin),
        )
      )
        continue;
      addShape(ctx, isl, sh, true);
      addPad(ctx, isl, sh, L.pieceMargin, undefined, LAKE_GROUP);
      const on = lakePoint(o, t, 0);
      return { p, out: ang(p.x - on.x, p.z - on.z), r };
    }
    return null;
  };
  const P = L.pods;
  const pods: ShoreSpot[] = [];
  const dT = (P.spacing / o.a) * 1;
  for (let k = 0; k < P.count; k++) {
    const q = spot(side + (k - (P.count - 1) / 2) * dT, P.out, P.r);
    if (q) pods.push(q);
  }
  return {
    pods,
    pavilion: spot(far, L.pavilion.out, L.pavilion.r),
    cloud: spot(far + Math.PI, L.cloud.out, L.cloud.r),
  };
}

/** What the plan hands the searches. */
export interface FoundryInput {
  /** Tech Park centre, a walk sample on it (the links' component), the campus axis. */
  park: XZ;
  hub: XZ;
  campus: number;
  /** Lot doors, turbines, the dock: stay joined to the hub. */
  targets: readonly XZ[];
  /** Kite Hill summit: a pad's falloff stays off its flank. */
  hill: XZ | null;
}

/**
 * A piece search: the first size whose best rect fits and keeps the targets joined. Short stubs
 * before each target stay free. The rect comes back held in `ctx.shapes` until `done`.
 */
function fitter(ctx: SiteCtx, isl: IslandData, I: FoundryInput) {
  const stubs = I.targets.map((t) => {
    const u = unit(t, I.park);
    const m = add(t, u, S.stub.len / 2);
    return rectShape(m.x, m.z, ang(u.x, u.z), S.stub.width, S.stub.len);
  });
  const shapes = ctx.shapes[isl.id];
  const base = shapes.length;
  shapes.push(...stubs);
  if (I.hill) shapes.push(discShape(I.hill.x, I.hill.z, S.hillClear));
  const held: Shape[] = [];
  const free = clearanceField(ctx, isl);
  const fit = <T>(
    sizes: readonly T[],
    dims: (t: T) => readonly [number, number],
    lim: RectLimits,
    score: (p: XZ) => number,
  ): { r: Rect; size: T } | null => {
    for (const size of sizes) {
      const [len, wid] = dims(size);
      const r = findRect(ctx, isl, I.campus, len, wid, lim, free, score);
      if (!r) continue;
      const sh = reservedOf(r);
      if (pinsJoined(ctx, isl, I.hub, I.targets, [...held, sh])) {
        held.push(sh);
        shapes.push(sh);
        blockField(ctx, isl, free, sh);
        return { r, size };
      }
    }
    return null;
  };
  return { fit, done: () => void (shapes.length = base) };
}

/** Heading of the rect that runs from its end nearer `from` to the other. */
function turned(r: Rect, from: XZ): Rect {
  const start = rectAt(r, -r.len / 2, 0);
  const end = rectAt(r, r.len / 2, 0);
  return dist(start, from) <= dist(end, from) ? r : rectOf(r.c, r.a + Math.PI, r.len, r.wid);
}

/**
 * Level the ground under a site now (the pad's own rule, `applyPads` repeats it), so the kit and the
 * beds searched after read the slope the pad leaves, and reserve it blocking, with its pad. When that
 * slope cuts a target off (a ramp to the dock), the ground goes back and the site is dropped: false.
 */
function reserve(ctx: SiteCtx, isl: IslandData, I: FoundryInput, r: Rect, group?: number): boolean {
  const R = Math.hypot(r.len, r.wid) / 2 + S.padMargin + FLATTEN.falloff;
  const [x0, x1] = gridRange(r.c.x - R, r.c.x + R);
  const [z0, z1] = gridRange(r.c.z - R, r.c.z + R);
  const land = (i: number): boolean =>
    ctx.islandMap[i] === isl.id + 1 && ctx.sdf[i] > 0 && ctx.h.data[i] > 0;
  let sum = 0;
  let cnt = 0;
  for (let iz = z0; iz <= z1; iz++)
    for (let ix = x0; ix <= x1; ix++) {
      const i = iz * ctx.n + ix;
      if (!land(i) || shapeDist(r.sh, cellX(ix), cellZ(iz)) > 0.5) continue;
      sum += ctx.h.data[i];
      cnt++;
    }
  const T = Math.max(FLATTEN.minHeight, cnt > 0 ? sum / cnt : heightAt(ctx.h, r.c.x, r.c.z));
  const moved: [number, number][] = [];
  for (let iz = z0; iz <= z1; iz++)
    for (let ix = x0; ix <= x1; ix++) {
      const i = iz * ctx.n + ix;
      if (!land(i)) continue;
      const d = shapeDist(r.sh, cellX(ix), cellZ(iz)) - S.padMargin;
      if (d >= FLATTEN.falloff) continue;
      moved.push([i, ctx.h.data[i]]);
      ctx.h.data[i] += (T - ctx.h.data[i]) * (d <= 0 ? 1 : 1 - smoothstep(0, FLATTEN.falloff, d));
    }
  const sh = reservedOf(r);
  if (!pinsJoined(ctx, isl, I.hub, I.targets, [sh])) {
    for (const [i, y] of moved) ctx.h.data[i] = y;
    return false;
  }
  addShape(ctx, isl, sh, true);
  addPad(ctx, isl, r.sh, S.padMargin, S.padStep, group);
  return true;
}

/**
 * Plan time, before the culture kit: the lake (with its shore pieces), the line, the port and the
 * track, each at the largest size that fits, in scale with the island. A site that fits at no size
 * publishes nothing (the fallback).
 */
export function planFoundry(ctx: SiteCtx, isl: IslandData, rng: Rng, I: FoundryInput): Foundry {
  const out: Foundry = { line: null, port: null, track: null, lake: null };
  const { fit, done } = fitter(ctx, isl, I);
  const lake = fit(
    S.lake.sizes.filter((k) => k[0] <= isl.radius * S.lake.share),
    (s) => lakeRect(s[0], s[1]),
    S.lake.limits,
    bearingScore(isl, S.lake.bearing, S.lake.bearingCost),
  );
  const line = fit(
    S.line.segments.filter((k) => k * S.line.segment <= isl.radius * S.line.share),
    (s) => [lineLen(s), S.line.width],
    SR,
    bearingScore(isl, S.line.bearing, S.line.bearingCost),
  );
  const from = line ? rectAt(turned(line.r, I.park), -line.r.len / 2, 0) : I.park;
  const port = fit(
    S.port.sizes,
    (k) => k.size,
    SR,
    (p) => S.port.nearCost * dist(p, from),
  );
  const track = fit(
    S.track.stations,
    (k) => [trackLen(k), S.track.width],
    SR,
    (p) => S.track.nearCost * dist(p, from),
  );
  done();
  if (line && reserve(ctx, isl, I, line.r)) {
    // the exit end toward the park: the new bots walk that way
    const t = turned(line.r, I.park);
    const r = rectOf(t.c, t.a + Math.PI, t.len, t.wid);
    out.line = { ...r, segments: line.size, gates: gatesOf(ctx, isl, I, r, I.park) };
  }
  if (port && reserve(ctx, isl, I, port.r)) {
    out.port = { ...port.r, spec: port.size, gates: gatesOf(ctx, isl, I, port.r, I.park) };
  }
  if (track && reserve(ctx, isl, I, track.r)) {
    // walking order: from the end nearer the line exit (else the park)
    const r = turned(track.r, out.line ? rectAt(out.line, out.line.len / 2, 0) : I.park);
    out.track = { ...r, stations: track.size, gates: gatesOf(ctx, isl, I, r, from) };
  }
  if (lake && reserve(ctx, isl, I, lake.r, LAKE_GROUP)) {
    const outline: LakeOutline = {
      x: lake.r.c.x,
      z: lake.r.c.z,
      rotY: lake.r.a,
      a: lake.size[0],
      b: lake.size[1],
      wobble: S.lake.wobble,
      phase: rng.fork('lakeWobble').range(0, Math.PI * 2),
    };
    const gates = gatesOf(ctx, isl, I, lake.r, I.park);
    // (the shore pieces lean over the lake's own reservation and pad)
    const own = ctx.shapes[isl.id].pop() as Shape;
    const shore = placeShore(ctx, isl, outline, gates[0], lake.r.sh);
    ctx.shapes[isl.id].push(own);
    out.lake = { ...lake.r, outline, gates, shore };
  }
  return out;
}

/**
 * Path links of the sites (after the lots: the older paths keep their routes). A link that finds no
 * way tries the site's next gate (the network walks `plan.links` as it grows); the gate that joined
 * is the first of `gates`. A site with none publishes nothing, as one without room.
 */
export function foundryLinks(plan: SitePlan, f: Foundry): void {
  const link = (k: 'line' | 'port' | 'track' | 'lake', at: number): void => {
    const site = f[k];
    if (!site) return;
    plan.links.push({
      pin: site.gates[at],
      kind: 'path',
      done: (key) => {
        if (key !== null) site.gates = [site.gates[at]];
        else if (at + 1 < site.gates.length) link(k, at + 1);
        else f[k] = null;
      },
    });
  };
  for (const k of ['line', 'port', 'track', 'lake'] as const) link(k, 0);
}

/** Paint a rect's ground, and clean the stale slope zones its pad left (D-109). */
function groundOf(ctx: SiteCtx, isl: IslandData, r: Rect, zone: ZoneId | null): void {
  const reach = S.repaint.reach;
  const R = Math.hypot(r.len, r.wid) / 2 + reach + 1;
  const [x0, x1] = gridRange(r.c.x - R, r.c.x + R);
  const [z0, z1] = gridRange(r.c.z - R, r.c.z + R);
  for (let iz = z0; iz <= z1; iz++)
    for (let ix = x0; ix <= x1; ix++) {
      const i = iz * ctx.n + ix;
      if (ctx.islandMap[i] !== isl.id + 1 || ctx.sdf[i] <= 0) continue;
      const d = shapeDist(r.sh, cellX(ix), cellZ(iz));
      if (d > reach) continue;
      if (d <= 0 && zone !== null) {
        ctx.zone[i] = zone;
        continue;
      }
      const z = ctx.zone[i];
      const slope = slopeAtCell(ctx.h, ix, iz);
      if ((z === Zone.rock || z === Zone.cliff) && slope < S.repaint.flatSlope)
        ctx.zone[i] = Zone.grass;
      else if ((z === Zone.grass || z === Zone.meadow) && slope > S.repaint.steepSlope)
        ctx.zone[i] = Zone.cliff;
    }
}

/** Quay paving under a shore piece. */
function paintDisc(ctx: SiteCtx, isl: IslandData, p: XZ, r: number): void {
  const [x0, x1] = gridRange(p.x - r, p.x + r);
  const [z0, z1] = gridRange(p.z - r, p.z + r);
  for (let iz = z0; iz <= z1; iz++)
    for (let ix = x0; ix <= x1; ix++) {
      const i = iz * ctx.n + ix;
      if (ctx.islandMap[i] !== isl.id + 1 || ctx.sdf[i] <= 0) continue;
      if (Math.hypot(cellX(ix) - p.x, cellZ(iz) - p.z) <= r) ctx.zone[i] = Zone.plaza;
    }
}

/** Cut the lake into its levelled pad and zone it; returns the water level. */
function cutLake(ctx: SiteCtx, isl: IslandData, r: Rect, o: LakeOutline): number {
  const L = S.lake;
  const level = heightAt(ctx.h, r.c.x, r.c.z) - L.dip;
  const R = Math.hypot(r.len, r.wid) / 2 + 1;
  const [x0, x1] = gridRange(r.c.x - R, r.c.x + R);
  const [z0, z1] = gridRange(r.c.z - R, r.c.z + R);
  for (let iz = z0; iz <= z1; iz++)
    for (let ix = x0; ix <= x1; ix++) {
      const i = iz * ctx.n + ix;
      if (ctx.islandMap[i] !== isl.id + 1 || ctx.sdf[i] <= 0) continue;
      const x = cellX(ix);
      const z = cellZ(iz);
      const d = lakeEdge(o, x, z);
      if (d <= 0) {
        ctx.h.data[i] = level;
        ctx.zone[i] = Zone.crater;
      } else if (d < L.bank) {
        ctx.h.data[i] = level + L.dip * smoothstep(0, L.bank, d);
      }
      if (d > 0 && d <= L.quay) ctx.zone[i] = Zone.plaza;
    }
  return level;
}

/** Final ground: lake cut, every site zoned, the anchors published. */
export function finishFoundry(ctx: SiteCtx, isl: IslandData, f: Foundry): void {
  const H = (p: XZ): number => heightAt(ctx.h, p.x, p.z);
  const pub = (key: string, p: XZ, rotY: number, y?: number): void => {
    isl.anchors[key] = { x: p.x, z: p.z, rotY, y: y ?? H(p) };
  };
  const size = (key: string, x: number, z: number): void => {
    isl.anchors[key] = { x, z, rotY: 0 };
  };
  // (gravel, as the solar farm: same material class as the lawn, so a soft edge, no 2 u zigzag at 45°)
  for (const r of [f.line, f.track, f.port]) if (r) groundOf(ctx, isl, r, Zone.field);
  if (f.lake) {
    groundOf(ctx, isl, f.lake, null);
    const { pods, pavilion, cloud } = f.lake.shore;
    for (const q of [...pods, pavilion, cloud])
      if (q) paintDisc(ctx, isl, q.p, q.r + S.lake.pieceQuay);
  }

  if (f.line) {
    const r = f.line;
    const lead = -r.len / 2 + S.line.lead;
    const belt = r.segments * S.line.segment;
    const on = (u: number, v = 0): XZ => rectAt(r, lead + u, v);
    pub('foundryYard', r.c, r.a);
    size('foundryLineSize', r.wid, r.len);
    pub('foundryLine0', on(0), r.a);
    pub('foundryLine1', on(belt), r.a);
    for (let k = 0; k < r.segments; k++) pub(`foundrySeg${k}`, on((k + 0.5) * S.line.segment), r.a);
    for (let k = 0; k < 3; k++) {
      const u = (belt * (k + 1)) / 4;
      pub(`foundryStation${k}`, on(u), r.a);
      pub(`foundryArm${k}`, on(u, S.line.armOffset), r.a - Math.PI / 2);
      pub(`foundryCrate${k}`, on(u, S.line.crateOut), r.a - Math.PI / 2);
    }
    pub('foundryExit', on(belt + S.line.exit), r.a);
    pub('foundryGate', r.gates[0], r.a);
  }
  if (f.port) {
    const r = f.port;
    const P = r.spec;
    const pad = rectAt(r, P.padU, 0);
    pub('dronePort', pad, r.a);
    pub('dronePortYard', r.c, r.a);
    size('dronePortSize', r.wid, r.len);
    [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ].forEach(([su, sv], k) =>
      pub(`droneMast${k}`, rectAt(r, P.padU + su * P.mast, sv * P.mast), r.a),
    );
    pub('droneHangar', rectAt(r, P.hangarU, 0), r.a + Math.PI);
    pub('dronePortGate', r.gates[0], r.a);
  }
  if (f.track) {
    const r = f.track;
    pub('botTrackYard', r.c, r.a);
    size('botTrackSize', r.wid, r.len);
    for (let k = 0; k < r.stations; k++)
      pub(`botTrack${k}`, rectAt(r, -r.len / 2 + S.track.end + (k + 0.5) * S.track.pitch, 0), r.a);
    pub('botTrackGate', r.gates[0], r.a);
  }
  if (f.lake) {
    const r = f.lake;
    const o = r.outline;
    const level = cutLake(ctx, isl, r, o);
    pub('dataLake', o, o.rotY, level);
    size('dataLakeSize', o.a, o.b);
    size('dataLakeWobble', o.wobble, o.phase);
    pub('dataLakeYard', r.c, r.a);
    size('dataLakeYardSize', r.wid, r.len);
    const L = S.lake;
    for (let k = 0; k < L.rimPoints; k++) {
      const t = (k / L.rimPoints) * Math.PI * 2;
      const p = lakePoint(o, t, 0);
      const q = lakePoint(o, t, 1);
      pub(`dataLakeRim${k}`, p, ang(q.x - p.x, q.z - p.z), level);
    }
    const { pods, pavilion, cloud } = r.shore;
    if (pavilion) pub('lakePavilion', pavilion.p, pavilion.out);
    if (cloud) pub('lakeCloud', cloud.p, cloud.out);
    pods.forEach((q, k) => pub(`lakePod${k}`, q.p, q.out + Math.PI));
    pub('lakeGate', r.gates[0], r.a);
  }
  placeFoundryKit(ctx, isl);
}

/**
 * The kit on the published anchors (TASK-545, D-124), a group only where its site found room: no
 * RNG, nothing here rolls. Arm swing groups, bots and the cloud are movers (render/foundry-movers.ts):
 * the store holds the bases, crates and the rest that stands still.
 */
function placeFoundryKit(ctx: SiteCtx, isl: IslandData): void {
  const A = isl.anchors;
  const fx = (defId: string, key: string, rotY: number, variant = 0): void => {
    const p = A[key];
    if (p) ctx.fixtures.push({ defId, x: p.x, z: p.z, rotY, islandId: isl.id, variant });
  };
  // a prop with local +x along heading h takes rotY = h + π/2 (see the contract above)
  const alongX = (h: number): number => h + Math.PI / 2;
  if (A.foundryLine0) {
    let n = 0;
    while (A[`foundrySeg${n}`]) n++;
    for (let k = 0; k < n; k++)
      fx('conveyorLine', `foundrySeg${k}`, alongX(A[`foundrySeg${k}`].rotY), k === n - 1 ? 1 : 0);
    for (let k = 0; k < 3; k++) {
      fx('assemblyArm', `foundryArm${k}`, A[`foundryArm${k}`].rotY, 2);
      fx('foundryPart', `foundryCrate${k}`, A[`foundryCrate${k}`].rotY, k);
    }
  }
  if (A.dronePort) {
    const pad = A.dronePort;
    fx('dronePad', 'dronePort', pad.rotY);
    fx('droneHangar', 'droneHangar', A.droneHangar.rotY);
    for (let k = 0; A[`droneMast${k}`]; k++) {
      const m = A[`droneMast${k}`];
      // the cradle (+x) toward the pad; tall and low posts by turns
      fx('chargeMast', `droneMast${k}`, alongX(ang(pad.x - m.x, pad.z - m.z)), k % 2);
    }
  }
  if (A.botTrack0) {
    const order = CODING_FOUNDRY_MOTION.track.order;
    for (let k = 0; A[`botTrack${k}`]; k++)
      fx('botCourse', `botTrack${k}`, alongX(A[`botTrack${k}`].rotY), order[k % order.length]);
  }
  if (A.dataLake) {
    for (let k = 0; A[`lakePod${k}`]; k++) fx('serverPod', `lakePod${k}`, A[`lakePod${k}`].rotY);
    if (A.lakePavilion) fx('quantumPavilion', 'lakePavilion', A.lakePavilion.rotY);
  }
}
