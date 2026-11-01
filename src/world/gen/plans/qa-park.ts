/**
 * QA "Thrill Test Park" site (M32 TASK-539, D-115 / D-119): pure data, no prop placed (TASK-540 builds
 * the kit, TASK-541 places and moves it). Plan time, tried together with the Proving Grounds' two test
 * tracks (plans/qa.ts `placeProvingAndPark`), before the campus (lots and lanes keep off): one blocking
 * stadium holding the coaster with the bumper rink in its infield, an apron on the station side (the path's end, board, candy cart) and the
 * level pads. Finish (pads applied, footpaths carved): the track's control points are fitted to the
 * final ground, checked and published, the zones repainted on the final ground (D-109). No rng is
 * drawn: same seed, same site. Numbers: content/themes/qa-park.ts (QA_PARK, COASTER_TEMPLATE).
 *
 * Anchor contract (world u; rotY = xz heading (cos, sin); `y` = world height; `…Size` = sizes, not a
 * position). All absent = no site on this seed (the island is otherwise untouched; skip the kit):
 * - `coaster` + `coasterSize`: the rect's centre = the **site origin**, rotY = **site rotY**, y = the
 *   station's ground; size { x: width, z: depth, y: the template's scale tier }.
 * - `coasterPt0..N-1`: the track's control points, x / z in world u, y = absolute height, in travel
 *   order, closed. `coasterTrackOf(isl)` returns them in the site's local frame.
 * - `coasterStation` + `coasterStationSize`: platform centre beside the station's level run, y = its
 *   rail height, rotY = direction of travel; size { x: width, z: length along the rails }.
 * - `coasterRink` + `coasterRinkSize`: bumper-car floor centre on its pad in the infield, y = pad
 *   level, rotY = site rotY; size { x, z }. Nothing else stands on it.
 * - `coasterEntry`: where the footpath ends, y = ground, rotY = heading into the station.
 * - `coasterBoard`: the TESTED ✓ board by the entry, y = ground, rotY = facing the arriving walkers.
 * - `coasterCandy`: the cotton-candy cart by the entry, same frame.
 *
 * Local frame = the prop frame of the rect: world = origin + x · (sin rotY, −cos rotY) + z ·
 * (cos rotY, sin rotY) (`coasterToWorld`), the same as a prop at rotY (three's rotation.y = π/2 − rotY).
 */
import {
  COASTER_PARTS,
  COASTER_TEMPLATE as TPL,
  QA_PARK as K,
  type CoasterPart,
  type CoasterTemplatePoint,
} from '../../../content/themes/qa-park.ts';
import { heightAt, Zone, type IslandData, type XZ } from '../../types.ts';
import { cellX, cellZ, gridRange } from '../grid.ts';
import { slopeAtCell } from '../zones.ts';
import {
  add,
  addPad,
  addShape,
  cellOnLand,
  clear,
  dirOf,
  discShape,
  dist,
  onIsland,
  onLand,
  rectShape,
  relief,
  sdfAt,
  shapeCorners,
  shapeDist,
  siteFree,
  type Shape,
  type SiteCtx,
  type SitePlan,
} from '../sites.ts';

const DEG = Math.PI / 180;
const TAG = 'qaPark';

/** One track point: [local x, absolute y, local z]. */
export type CoasterPoint = readonly [number, number, number];

/** The TASK-540 / TASK-541 contract: plain data, a closed centripetal Catmull-Rom spline. */
export interface CoasterTrack {
  /** Control points in the site's local frame, y absolute, travel order, closed. */
  points: ReadonlyArray<CoasterPoint>;
  origin: { x: number; z: number };
  rotY: number;
  /** Template scale tier (1, 0.9, 0.8): the loop's radius scales with it, the cars do not. */
  scale: number;
  /** Station's ground height. */
  groundY: number;
  /** Part → [first, last] control point index (`COASTER_PARTS` order). */
  parts: Readonly<Record<CoasterPart, readonly [number, number]>>;
}

/** Part → [first, last] control point index of a published track. */
export const COASTER_PART_RANGE: Readonly<Record<CoasterPart, readonly [number, number]>> = (() => {
  const out = {} as Record<CoasterPart, readonly [number, number]>;
  let k = 0;
  for (const part of COASTER_PARTS) {
    out[part] = [k, k + TPL[part].length - 1];
    k += TPL[part].length;
  }
  return out;
})();

const TEMPLATE: readonly CoasterTemplatePoint[] = COASTER_PARTS.flatMap((p) => [...TPL[p]]);

/** Site-frame (x, z) → world. */
export const coasterToWorld = (o: XZ, rotY: number, x: number, z: number): XZ => ({
  x: o.x + Math.sin(rotY) * x + Math.cos(rotY) * z,
  z: o.z - Math.cos(rotY) * x + Math.sin(rotY) * z,
});

/** World → site frame (x, z). */
const worldToCoaster = (o: XZ, rotY: number, p: XZ): XZ => {
  const dx = p.x - o.x;
  const dz = p.z - o.z;
  return {
    x: Math.sin(rotY) * dx - Math.cos(rotY) * dz,
    z: Math.cos(rotY) * dx + Math.sin(rotY) * dz,
  };
};

/**
 * Point `t` ∈ [0, 1] along segment points[i] → points[i + 1] of a closed centripetal Catmull-Rom
 * spline (Barry-Goldman). The site's own evaluator (fit + tests); TASK-540 owns the render one.
 */
export function coasterSplineAt(
  pts: ReadonlyArray<CoasterPoint>,
  i: number,
  t: number,
): [number, number, number] {
  const n = pts.length;
  const p0 = pts[(i + n - 1) % n];
  const p1 = pts[i % n];
  const p2 = pts[(i + 1) % n];
  const p3 = pts[(i + 2) % n];
  const step = (a: CoasterPoint, b: CoasterPoint): number =>
    Math.sqrt(Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2])) || 1e-6;
  const t1 = step(p0, p1);
  const t2 = t1 + step(p1, p2);
  const t3 = t2 + step(p2, p3);
  const u = t1 + (t2 - t1) * t;
  const out: [number, number, number] = [0, 0, 0];
  for (let c = 0; c < 3; c++) {
    const a1 = ((t1 - u) * p0[c] + u * p1[c]) / t1;
    const a2 = ((t2 - u) * p1[c] + (u - t1) * p2[c]) / (t2 - t1);
    const a3 = ((t3 - u) * p2[c] + (u - t2) * p3[c]) / (t3 - t2);
    const b1 = ((t2 - u) * a1 + u * a2) / t2;
    const b2 = ((t3 - u) * a2 + (u - t1) * a3) / (t3 - t1);
    out[c] = ((t2 - u) * b1 + (u - t1) * b2) / (t2 - t1);
  }
  return out;
}

/** The spline sampled every ≈ `step` u: local point, with the segment index it lies on. */
export function sampleCoaster(
  pts: ReadonlyArray<CoasterPoint>,
  step: number,
): { p: [number, number, number]; seg: number; t: number }[] {
  const out: { p: [number, number, number]; seg: number; t: number }[] = [];
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    const m = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) / step));
    for (let k = 0; k < m; k++) {
      const t = k / m;
      out.push({ p: coasterSplineAt(pts, i, t), seg: i, t });
    }
  }
  return out;
}

/** The published track of an island, or null when no site fits. */
export function coasterTrackOf(isl: IslandData): CoasterTrack | null {
  const o = isl.anchors.coaster;
  const sz = isl.anchors.coasterSize;
  if (!o || !sz) return null;
  const points: CoasterPoint[] = [];
  for (let k = 0; isl.anchors[`coasterPt${k}`]; k++) {
    const a = isl.anchors[`coasterPt${k}`];
    const l = worldToCoaster(o, o.rotY, a);
    points.push([l.x, a.y ?? 0, l.z]);
  }
  return {
    points,
    origin: { x: o.x, z: o.z },
    rotY: o.rotY,
    scale: sz.y ?? 1,
    groundY: o.y ?? 0,
    parts: COASTER_PART_RANGE,
  };
}

/** A reserved site (plan time). */
export interface ParkSite {
  p: XZ;
  rot: number;
  /** The template's x flipped (the station on the rect's other side). */
  mirror: boolean;
  scale: number;
  sh: Shape;
}

/** Local x of a template x on this site. */
const mx = (s: Pick<ParkSite, 'mirror' | 'scale'>, x: number): number =>
  (s.mirror ? -x : x) * s.scale;

const atLocal = (s: ParkSite, x: number, z: number): XZ => coasterToWorld(s.p, s.rot, x, z);

/** A rect in the site frame. */
const localRect = (s: ParkSite, x: number, z: number, w: number, d: number): Shape => {
  const c = atLocal(s, x, z);
  return rectShape(c.x, c.z, s.rot, w, d);
};

/** The station side's apron (entry, board, candy), outside the rect. */
function apronOf(s: ParkSite): { sh: Shape; side: number } {
  const A = K.apron;
  const side = s.mirror ? 1 : -1;
  const w = K.rect[0] * s.scale;
  return {
    sh: localRect(s, side * (w / 2 + A.w / 2), A.z * s.scale, A.w, A.d * s.scale),
    side,
  };
}

const entryOf = (s: ParkSite): XZ =>
  atLocal(s, apronOf(s).side * ((K.rect[0] * s.scale) / 2 + K.apron.entry), K.apron.z * s.scale);

/** The rect's real footprint: a stadium (the U-turns round its ends), mid rect + two end discs. */
function stadium(s: Pick<ParkSite, 'p' | 'rot' | 'scale'>): Shape[] {
  const w = K.rect[0] * s.scale;
  const d = K.rect[1] * s.scale;
  const off = (d - w) / 2;
  const at = (z: number): XZ => coasterToWorld(s.p, s.rot, 0, z);
  const e0 = at(off);
  const e1 = at(-off);
  return [
    rectShape(s.p.x, s.p.z, s.rot, w, d - w),
    discShape(e0.x, e0.z, w / 2),
    discShape(e1.x, e1.z, w / 2),
  ];
}

/** Stadium outline samples for the rim test (mid rect corners + the end caps' far points). */
function outline(pieces: readonly Shape[]): XZ[] {
  const [mid, a, b] = pieces;
  const pts = shapeCorners(mid);
  for (const c of [a, b])
    for (let k = 0; k < 12; k++) pts.push(add(c, dirOf((k * 2 * Math.PI) / 12), c.r));
  return pts;
}

/**
 * Candidate sites in trial order: per tier, the best frame in each `sectors` bearing round the yard,
 * outermost strip first (the middle stays whole for the test tracks). Each stands on land, its edge
 * `tier.rim` off the shore, level pads ≤ `maxRelief`, clear of every obstacle; the apron on the side
 * nearest the yard. Nothing is reserved here.
 */
export function* qaParkCandidates(ctx: SiteCtx, isl: IslandData, yard: XZ): Generator<ParkSite> {
  const cells: XZ[] = [];
  const [x0, x1] = gridRange(yard.x - K.search, yard.x + K.search);
  const [z0, z1] = gridRange(yard.z - K.search, yard.z + K.search);
  for (let iz = z0; iz <= z1; iz++)
    for (let ix = x0; ix <= x1; ix++) {
      const i = iz * ctx.n + ix;
      if (ctx.islandMap[i] === isl.id + 1 && ctx.sdf[i] >= K.minCentreShore)
        cells.push({ x: cellX(ix), z: cellZ(iz) });
    }
  // outermost first: a sector's first site then rules out most of the inner cells
  const shore = (c: XZ): number => sdfAt(ctx, c.x, c.z);
  cells.sort((a, b) => shore(a) - shore(b));
  const nRot = Math.round(180 / K.stepDeg);
  for (const tier of K.tiers) {
    const w = K.rect[0] * tier.scale;
    const d = K.rect[1] * tier.scale;
    const best: ({ s: ParkSite; score: number } | null)[] = Array.from(
      { length: K.sectors },
      () => null,
    );
    // (the end discs stand on land `rim` off the shore: the centre is at least that far in)
    const inner = w / 2 + tier.rim;
    for (const p of cells) {
      if (shore(p) < inner) continue;
      const a = Math.atan2(p.z - yard.z, p.x - yard.x) + Math.PI;
      const sector = Math.min(K.sectors - 1, Math.floor((a / (2 * Math.PI)) * K.sectors));
      const score0 = K.near * shore(p);
      const cur = best[sector];
      if (cur && score0 >= cur.score) continue;
      for (let k = 0; k < nRot; k++) {
        const rot = k * K.stepDeg * DEG;
        const sh = rectShape(p.x, p.z, rot, w, d);
        const pieces = stadium({ p, rot, scale: tier.scale });
        const rim = outline(pieces);
        if (rim.some((c) => !onIsland(ctx, isl, c.x, c.z) || sdfAt(ctx, c.x, c.z) < tier.rim))
          continue;
        if (pieces.some((q) => !clear(ctx, isl, q, K.gap))) continue;
        if (pieces.some((q) => !siteFree(ctx, isl, q))) continue;
        // the four frames of this rect: the station on either side, either way round
        for (const r of [rot, rot + Math.PI])
          for (const mirror of [false, true]) {
            const s: ParkSite = { p, rot: r, mirror, scale: tier.scale, sh };
            const c0 = best[sector];
            const score1 = score0 + K.entrySide * dist(entryOf(s), yard);
            if (c0 && score1 >= c0.score) continue;
            const rl = padRelief(ctx, isl, s);
            if (rl > K.maxRelief) continue;
            const score = score1 + K.reliefCost * rl;
            if ((c0 && score >= c0.score) || !apronFree(ctx, isl, s)) continue;
            best[sector] = { s, score };
          }
      }
    }
    const row = best.filter((b): b is { s: ParkSite; score: number } => !!b);
    row.sort((p, q) => p.score - q.score);
    for (const b of row) yield b.s;
  }
}

/** Largest relief under a level pad (the ground between them may fall away: the supports reach it). */
function padRelief(ctx: SiteCtx, isl: IslandData, s: ParkSite): number {
  let out = 0;
  for (const sh of padShapes(s)) {
    if (!onLand(ctx, isl, sh, K.minShore)) return Infinity;
    out = Math.max(out, relief(ctx, sh));
  }
  return out;
}

function apronFree(ctx: SiteCtx, isl: IslandData, s: ParkSite): boolean {
  const a = apronOf(s).sh;
  if (!onLand(ctx, isl, a, K.minShore)) return false;
  if (relief(ctx, a) > K.apron.maxRelief) return false;
  // (the apron is against the rect: only the others count)
  return clear(ctx, isl, a, K.apron.gap);
}

/** The level pads' footprints. */
const padShapes = (s: ParkSite): Shape[] =>
  Object.values(K.pads).map(([x, z, w, d]) =>
    localRect(s, mx(s, x), z * s.scale, w * s.scale, d * s.scale),
  );

/** Reserves the site: the stadium (blocking), the apron, the level pads. */
export function commitQaPark(ctx: SiteCtx, isl: IslandData, s: ParkSite): void {
  for (const q of stadium(s)) addShape(ctx, isl, { ...q, tag: TAG }, true);
  // non-blocking: the path ends in it, later pieces keep off
  addShape(ctx, isl, { ...apronOf(s).sh, tag: TAG }, false);
  for (const sh of padShapes(s)) addPad(ctx, isl, sh, K.padMargin * s.scale);
}

/** The footpath link to the entry (after the campus: the first links seed the network). */
export function linkQaPark(plan: SitePlan, s: ParkSite): void {
  plan.links.push({ pin: entryOf(s), kind: 'path', done: () => undefined });
}

/** Local → the raw control points on this site (before the fit): y over the station's ground. */
function rawPoints(s: ParkSite, groundY: number): [number, number, number][] {
  return TEMPLATE.map(([x, rise, z]) => [mx(s, x), groundY + rise * s.scale, z * s.scale]);
}

/**
 * Fits the control points to the final ground: wherever a sample's rail clearance is under the
 * floor the nearby control points rise (`fit.spread` per neighbour; the loop moves rigidly, the
 * station never: its pad is flat). Returns the points, or null when the ground still pokes through.
 */
function fitPoints(
  ctx: SiteCtx,
  s: ParkSite,
  raw: readonly [number, number, number][],
): [number, number, number][] | null {
  const F = K.fit;
  const [st0, st1] = COASTER_PART_RANGE.station;
  const [lp0, lp1] = COASTER_PART_RANGE.loop;
  const n = raw.length;
  const pts = raw.map((q) => [...q] as [number, number, number]);
  const floorOf = (seg: number): number =>
    (seg >= lp0 && seg <= lp1 ? K.clearance.loop : K.clearance.track) * s.scale;
  for (let pass = 0; pass <= F.passes; pass++) {
    const need = new Float64Array(n);
    let short = false;
    for (const q of sampleCoaster(pts, F.sample)) {
      const w = atLocal(s, q.p[0], q.p[2]);
      const lack = heightAt(ctx.h, w.x, w.z) + floorOf(q.seg) - q.p[1];
      if (lack <= 1e-4) continue;
      short = true;
      need[q.seg] = Math.max(need[q.seg], lack);
      const nx = (q.seg + 1) % n;
      need[nx] = Math.max(need[nx], lack);
    }
    if (!short) return pts;
    if (pass === F.passes) return null;
    const up = new Float64Array(n);
    for (let i = 0; i < n; i++)
      for (let o = -F.reach; o <= F.reach; o++) {
        const j = (i + o + n) % n;
        up[j] = Math.max(up[j], need[i] * F.spread ** Math.abs(o));
      }
    let loopUp = 0;
    for (let i = lp0; i <= lp1; i++) loopUp = Math.max(loopUp, up[i]);
    for (let i = 0; i < n; i++) {
      if (i >= st0 && i <= st1) continue;
      pts[i][1] += i >= lp0 && i <= lp1 ? loopUp : up[i];
    }
  }
  return null;
}

/**
 * A loop pad over the station's level rises the loop with it: the crest climbs with a ramp over the
 * lift (a steeper grade) and back down the drop, so it keeps `head` over the crown.
 */
function keepHead(
  s: ParkSite,
  pts: readonly [number, number, number][],
): [number, number, number][] {
  const [a, b] = COASTER_PART_RANGE.lift;
  const [, turn1] = COASTER_PART_RANGE.turn;
  const [, drop1] = COASTER_PART_RANGE.drop;
  const [lp0, lp1] = COASTER_PART_RANGE.loop;
  const peak = (i0: number, i1: number): number =>
    Math.max(...pts.slice(i0, i1 + 1).map((q) => q[1]));
  const up = peak(lp0, lp1) + K.head * s.scale - peak(a, turn1);
  return pts.map((q, i) => {
    if (up <= 0 || i < a || i > drop1) return q;
    const f = i <= b ? (i - a) / (b - a) : i <= turn1 ? 1 : (drop1 - i) / (drop1 - turn1);
    return [q[0], q[1] + up * f, q[2]];
  });
}

/** Every sample stands on this island's land (supports reach the ground) and off the shore. */
function trackOnLand(
  ctx: SiteCtx,
  isl: IslandData,
  s: ParkSite,
  pts: readonly [number, number, number][],
): boolean {
  for (const q of sampleCoaster(pts, K.fit.sample)) {
    const w = atLocal(s, q.p[0], q.p[2]);
    if (!onIsland(ctx, isl, w.x, w.z) || sdfAt(ctx, w.x, w.z) < K.minShore) return false;
    if (!cellOnLand(ctx, isl, w.x, w.z)) return false;
  }
  return true;
}

/**
 * Zones on the final ground (D-109): the zones were derived before the pads, so inside a pad's
 * reach a rock / cliff cell the pad levelled becomes lawn, a lawn cell the pad's edge steepened
 * becomes cliff (its colour would blend up the face).
 */
function repaintZones(ctx: SiteCtx, isl: IslandData, s: ParkSite): void {
  const Z = K.zones;
  const pads = padShapes(s);
  const margin = K.padMargin * s.scale;
  const R = Math.hypot(s.sh.hw, s.sh.hd) + Z.reach;
  const [x0, x1] = gridRange(s.p.x - R, s.p.x + R);
  const [z0, z1] = gridRange(s.p.z - R, s.p.z + R);
  for (let iz = z0; iz <= z1; iz++)
    for (let ix = x0; ix <= x1; ix++) {
      const i = iz * ctx.n + ix;
      if (ctx.islandMap[i] !== isl.id + 1 || ctx.sdf[i] <= 0) continue;
      const x = cellX(ix);
      const z = cellZ(iz);
      const d = Math.min(...pads.map((q) => shapeDist(q, x, z)));
      if (d > Z.reach) continue;
      const zn = ctx.zone[i];
      const slope = slopeAtCell(ctx.h, ix, iz);
      // (only inside a pad's core: a wall's gentler cells beside it keep their colour)
      if ((zn === Zone.rock || zn === Zone.cliff) && slope < Z.flat && d <= margin)
        ctx.zone[i] = Zone.grass;
      else if ((zn === Zone.grass || zn === Zone.meadow || zn === Zone.forest) && slope > Z.steep)
        ctx.zone[i] = Zone.cliff;
    }
}

/**
 * Finish: fits and checks the track on the final ground, publishes the anchors (none = the site's
 * rect stays an open lawn, the defined fallback) and repaints the zones.
 */
export function finishQaPark(ctx: SiteCtx, isl: IslandData, s: ParkSite): void {
  repaintZones(ctx, isl, s);
  const H = (p: XZ): number => heightAt(ctx.h, p.x, p.z);
  const groundY = H(atLocal(s, mx(s, K.station.x), K.station.z * s.scale));
  const fitted = fitPoints(ctx, s, rawPoints(s, groundY));
  if (!fitted || !trackOnLand(ctx, isl, s, fitted)) return;
  const pts = keepHead(s, fitted);
  const put = (key: string, p: XZ, rotY: number, y?: number): void => {
    isl.anchors[key] = y === undefined ? { x: p.x, z: p.z, rotY } : { x: p.x, z: p.z, rotY, y };
  };
  put('coaster', s.p, s.rot, groundY);
  isl.anchors.coasterSize = {
    x: K.rect[0] * s.scale,
    z: K.rect[1] * s.scale,
    rotY: 0,
    y: s.scale,
  };
  pts.forEach((q, k) => put(`coasterPt${k}`, atLocal(s, q[0], q[2]), 0, q[1]));
  const P = K.station;
  const railY = pts[COASTER_PART_RANGE.station[0]][1];
  put('coasterStation', atLocal(s, mx(s, P.x), P.z * s.scale), s.rot, railY);
  put('coasterStationSize', { x: P.w * s.scale, z: P.d * s.scale }, 0);
  const R = K.rink;
  const rink = atLocal(s, mx(s, R.x), R.z * s.scale);
  put('coasterRink', rink, s.rot, H(rink));
  put('coasterRinkSize', { x: R.w * s.scale, z: R.d * s.scale }, 0);
  const A = K.apron;
  const { side } = apronOf(s);
  const edge = side * ((K.rect[0] * s.scale) / 2 + A.entry);
  // facing out of the station side (the arriving walkers read the board)
  const out = Math.atan2(atLocal(s, side, 0).z - s.p.z, atLocal(s, side, 0).x - s.p.x);
  const e = atLocal(s, edge, A.z * s.scale);
  put('coasterEntry', e, out + Math.PI, H(e));
  const b = atLocal(s, edge, A.boardZ * s.scale);
  put('coasterBoard', b, out, H(b));
  const c = atLocal(s, edge, A.candyZ * s.scale);
  put('coasterCandy', c, out, H(c));
}
