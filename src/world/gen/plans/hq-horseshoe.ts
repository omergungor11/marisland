/**
 * HQ harbour town (M52 TASK-661, D-170; moved to HQ by TASK-666, D-171; rebuilt by TASK-674, D-173
 * as an open crescent quay on Hearthholm's own bay). Pure data, no rng. `planMarina` (hq.ts) runs on
 * the cove dock after the Seven Streets: it keeps the ferry pier where it is with the harbour
 * skeleton's T-head (HARBOURS.hq) and berth, lays a paved quay along the bay's natural waterline
 * from horn to horn with the house row on its land side, and returns a `Harbour` whose arm is the
 * light's stub jetty, so `finishHarbour` lays the T-head kit and the light unchanged; null = HQ's
 * plain pier and the M29 comb marina (world/gen/marina.ts). The star fort and the channel gates are
 * the post-route stage's (marina.ts), which keeps the fort off the quay and in the bay's mouth.
 * Numbers: content/themes/hq-horseshoe-site.ts; pieces: MARINA_KIT (content/themes/hq-horseshoe.ts).
 *
 * 1. Bay: rays from the bay centre (`anchors.harbour`, the archetype's bay, on the water) find the
 *    waterline round the back of the bay; the run of hits between the two horns, resampled every
 *    1 u and smoothed, is the quay's water edge. Ordered so the water lies on the left of travel
 *    (heading + 90°); index 0 is the light's end.
 * 2. Fit, per 1 u station: the promenade (and where the house row stands, the full quay width)
 *    must need little cut and fill, stay off reserved sites, other bodies and the ferry pier /
 *    T-head / approach; the pier root is a gap in the deck, other unfit stretches up to `bridge` u
 *    too; the longest fit stretch is the quay. Tiers by the houses that fit: full → short → none.
 * 3. Ground: the deck at `deckY` (fill and cut, the island's silhouette is the bay's own), a stone
 *    face to a berth strip dredged along the quay, a cut bank or a fill flank behind; a stub jetty
 *    at each end along the end tangent. Shore SDF and water zones re-derived (exact EDT,
 *    `waterBandZone`), the berth water Zone.lagoon; the deck Zone.plaza, faces Zone.rock
 *    (`finishMarina`).
 * 4. Town (reserved at plan time, placed on the final ground in `finishMarina`): the house row on
 *    the deck's land side, fronts to the water, an alley after every few houses; a terrace on the
 *    quay edge before every restaurant / café / gelato house; stalls before other houses; boats
 *    stern-to along the quay plus finger pontoons with a boat each side; the round tower on the far
 *    stub (the harbour light: `finishHarbour` on the near stub's head); lanterns at house joints and
 *    a bollard behind every stern line.
 *
 * Anchor contract (world u; rotY = xz heading (cos, sin); `y` = world height on the final ground;
 * `…Size` = two numbers, not a position). Missing when the seed has no quay (plans-hq-horseshoe.test
 * fit table). Water side: every quay heading θ has the water at θ + 90°, i.e. the unit normal to
 * the water is (−sin θ, cos θ).
 * - `marinaQuay0..K`: the quay's centre line every ≈ `quayStep` u, 0 = the light's end (on seed 1001
 *   the north horn) → round the bay head → K = the tower's end; rotY = heading toward the next
 *   point (the last: the arriving one); y = the ground there (the deck's `deckY`, lower in the pier
 *   root's gap and the ramps beside it). The water edge is the centre line + `marinaQuaySize.x / 2`
 *   toward the water (the deck runs `MARINA_SITE.ring.innerFlat` u past it, then the stone face
 *   falls over `ring.face` u to the berth strip, dredged `berth.width` u out); the promenade is the
 *   outer `ring.promenade` u (terraces on its edge, the walk at `MARINA_SITE.walk` u in from the
 *   water edge); the house row stands on the inner part, where it stands the deck runs the full
 *   width (+ `ring.edgeFlat`), elsewhere only the promenade is paved. Where a hill stands behind,
 *   the water edge is built out over the shallows (`fit.outMax` u at most) rather than the hill cut.
 *   `marinaQuaySize` = { x: quay width (water edge → house backs), z: deck height }.
 * - `marinaBasin` + `marinaBasinSize`: the bay. Centre = the point the bay was traced from (on the
 *   water, y 0), rotY = the mouth heading (out to sea); size { x: 2 × the mean distance from the
 *   centre to the quay's water edge, z: 2 × the largest such distance } (a disc of radius z / 2
 *   holds all the bay water along the quay; most of the open mouth sector is in it too).
 * - `marinaMouth`: the middle of the open mouth between the two stub heads, on the water (y 0),
 *   rotY = out to sea (perpendicular to the head-to-head line, away from the quay).
 * - `marinaStubL` / `marinaStubT`: the light's / the tower's stub jetty, pivot = its root at the
 *   quay's end, rotY = out along the stub (head = root + len × heading), y = deck; `marinaStubSize`
 *   = { x: the light stub's length, z: the tower stub's } (0: no stub fitted, the light / tower stand
 *   on the quay's end); width 2 × `MARINA_SITE.stub.half`, deck height, rock flanks.
 * - `marinaTower`: the tower's pivot on its stub, rotY = its front (toward `marinaBasin`).
 * - `marinaFort`: the star fort's site in the mouth, on the water (y 0), rotY = toward the T-head;
 *   the boat routes keep off it and world/gen/marina.ts stands the fort there (missing: none fit,
 *   marina.ts searches the mouth after the routes).
 * - `marinaHouse0..N`: house pivots (row order, light end first), rotY = front (to the water).
 *   `marinaHouseKind0..N` = { x: its MARINA_KIT.house index (0 seafood restaurant … 5 chandlery),
 *   z: the `marinaTerrace` index in front of it (−1 none), rotY 0 } (numbers, not a position).
 * - `marinaTerrace0..M`: terrace pivots on the quay edge (row order), rotY = front (to the water).
 * - `marinaBerth0..B`: moored boats (quay order; pontoon boats included), y 0, rotY = bow heading
 *   (out from the quay).
 * - `marinaPontoon0..P`: pontoon segment pivots, y 0, rotY = along the run (out from the quay).
 * The skeleton anchors keep their meaning: `harbourPier0/1`, `harbourHeadSize`, `ferryBerth`,
 * `harbourBasin(Size)` (= the square inside the bay disc round `marinaBasin`, rotY = pier heading),
 * `harbourArm0..K` (the light stub's centre line, 0 = its head → its root) and `harbourLight` (on
 * its head).
 */
import { MARINA_KIT, type KitRef } from '../../../content/themes/hq-horseshoe.ts';
import { MARINA_SITE as M } from '../../../content/themes/hq-horseshoe-site.ts';
import { DOCK, PATHS } from '../../../content/settlements.ts';
import { HQ_MARINA, STAR_FORT } from '../../../content/themes/hq-marina.ts';
import { lerp, smoothstep } from '../../../core/math/index.ts';
import {
  heightAt,
  sampleGrid,
  Zone,
  type IslandData,
  type Polyline,
  type XZ,
} from '../../types.ts';
import { cellX, cellZ, gridRange } from '../grid.ts';
import {
  add,
  addShape,
  ang,
  cellOf,
  clear,
  discShape,
  dist,
  onIsland,
  rectShape,
  segDist,
  shapeCorners,
  shapeDist,
  type DockSite,
  type Shape,
  type SiteCtx,
} from '../sites.ts';
import {
  harbourParams,
  pierSegments,
  refreshCoast,
  type ArmPoint,
  type Harbour,
} from './harbour.ts';
import type { HarbourParams } from '../../../content/harbours.ts';
import * as dm from '../../../core/math/dmath.ts';

const DEG = Math.PI / 180;
/** Grid spacing (u). */
const CELL = cellX(1) - cellX(0);

/** A 1 u station of the quay's water edge. */
interface Station {
  e: XZ;
  /** Unit tangent (light end → tower end) and the unit normal to the water (t turned +90°). */
  t: XZ;
  n: XZ;
  /** Arc length from the quay's start (u). */
  s: number;
  /** Deck laid here, and its land edge (u inland from the water edge). */
  deck: boolean;
  land: number;
  /** The house row may stand here. */
  house: boolean;
  /** Distance (u) to the nearest station without deck inside the quay (ramp), ∞ none. */
  gapD: number;
}

/** A stub jetty: root on the quay's end, head out over the water, centre line root → head. */
interface Stub {
  root: XZ;
  head: XZ;
  dir: XZ;
  len: number;
}

/** One placed piece (anchors and fixtures follow these, quay order). */
interface Piece {
  kit: KitRef;
  p: XZ;
  rot: number;
  /** Houses: MARINA_KIT.house index, and the index of the terrace in front (−1: none). */
  kind?: number;
  terrace?: number;
}

/** The planned quay town. */
export interface Marina {
  hb: Harbour;
  st: Station[];
  /** Bay centre (the trace origin) and the mean / largest distance to the water edge. */
  C: XZ;
  rMean: number;
  rMax: number;
  stubL: Stub;
  stubT: Stub;
  tier: 'full' | 'short';
  houses: Piece[];
  terraces: Piece[];
  stalls: Piece[];
  boats: Piece[];
  pontoons: Piece[];
  tower: Piece | null;
  /** The star fort's site in the bay's mouth (placed after the routes, world/gen/marina.ts). */
  fort: XZ | null;
  lanterns: XZ[];
  bollards: { p: XZ; rot: number }[];
  /** Alley backs: where the lanes up toward the plaza start (the plan links them to the network). */
  alleys: XZ[];
  /** Deck samples and their level, faces / banks / stub flanks (rock), berth water (lagoon). */
  deck: Map<number, number>;
  rock: number[];
  berth: number[];
}

/** Pier geometry the quay keeps off (frame: `u` out along the pier, `v` across). */
interface PierFrame {
  root: XZ;
  u: XZ;
  v: XZ;
  L: number;
  end: XZ;
  head: Shape;
  /** The island's harbour numbers (pier head, berth, approach). */
  P: HarbourParams;
}

function nearPier(f: PierFrame, p: XZ, pad: number, land = true): boolean {
  const F = M.fit;
  const P = f.P;
  if (segDist(p, f.root, f.end) < F.pierGap + pad) return true;
  // new land keeps the pier leaving the shore (DOCK.awayRate at every segment end, + `awayPad`)
  if (land)
    for (let t = DOCK.segment; t <= f.L + 1e-6; t += DOCK.segment) {
      const q = add(f.root, f.u, t);
      if (dist(p, q) < DOCK.awayRate * t - DOCK.awaySlack + F.awayPad) return true;
    }
  if (shapeDist(f.head, p.x, p.z) < F.headGap + pad) return true;
  const dx = p.x - f.root.x;
  const dz = p.z - f.root.z;
  const uu = dx * f.u.x + dz * f.u.z;
  const vv = dx * f.v.x + dz * f.v.z;
  const A = P.berth.approach;
  const ap = F.approachPad + pad;
  return uu >= f.L - ap && uu <= f.L + P.berth.out + A.len + ap && Math.abs(vv) <= A.half + ap;
}

/**
 * Cells of the window round `c` within `reserveGap` u of this island's reserved shapes (`shapes`),
 * within `groundGap` u of a pad's core (`ground`: a later pad moves it, the quay leaves it as it
 * is), near its lanes (`lanes`), or within `clearOther` of another body's land (`other`).
 */
function masks(ctx: SiteCtx, isl: IslandData, c: XZ, R: number) {
  const [x0, x1] = gridRange(c.x - R, c.x + R);
  const [z0, z1] = gridRange(c.z - R, c.z + R);
  const shapes = new Uint8Array(ctx.n * ctx.n);
  const ground = new Uint8Array(ctx.n * ctx.n);
  const lanes = new Uint8Array(ctx.n * ctx.n);
  const other = new Uint8Array(ctx.n * ctx.n);
  const gap = M.fit.reserveGap;
  const paint = (sh: Shape, g: number, into: Uint8Array): void => {
    const sr = (sh.r > 0 ? sh.r : Math.hypot(sh.hw, sh.hd)) + g + 1;
    const [a0, a1] = gridRange(Math.max(c.x - R, sh.x - sr), Math.min(c.x + R, sh.x + sr));
    const [b0, b1] = gridRange(Math.max(c.z - R, sh.z - sr), Math.min(c.z + R, sh.z + sr));
    for (let iz = b0; iz <= b1; iz++)
      for (let ix = a0; ix <= a1; ix++)
        if (shapeDist(sh, cellX(ix), cellZ(iz)) <= g) into[iz * ctx.n + ix] = 1;
  };
  for (const sh of ctx.shapes[isl.id]) paint(sh, gap, shapes);
  // (a pad levels its core and blends past it: the quay leaves that ground to the pad)
  for (const pad of ctx.pads)
    if (pad.islandId === isl.id) paint(pad.shape, pad.margin + M.fit.groundGap, ground);
  const lr = PATHS.halfWidth + gap;
  for (const lane of ctx.lanes[isl.id])
    for (const p of lane) {
      const [a0, a1] = gridRange(p.x - lr, p.x + lr);
      const [b0, b1] = gridRange(p.z - lr, p.z + lr);
      for (let iz = b0; iz <= b1; iz++)
        for (let ix = a0; ix <= a1; ix++)
          if (Math.hypot(cellX(ix) - p.x, cellZ(iz) - p.z) <= lr) lanes[iz * ctx.n + ix] = 1;
    }
  const own = isl.id + 1;
  const O = M.fit.clearOther;
  for (let iz = z0; iz <= z1; iz++)
    for (let ix = x0; ix <= x1; ix++) {
      const m = ctx.islandMap[iz * ctx.n + ix];
      if (m === 0 || m === own) continue;
      const [a0, a1] = gridRange(cellX(ix) - O, cellX(ix) + O);
      const [b0, b1] = gridRange(cellZ(iz) - O, cellZ(iz) + O);
      for (let jz = b0; jz <= b1; jz++)
        for (let jx = a0; jx <= a1; jx++)
          if (Math.hypot(cellX(jx) - cellX(ix), cellZ(jz) - cellZ(iz)) <= O)
            other[jz * ctx.n + jx] = 1;
    }
  return { shapes, ground, lanes, other };
}

type Masks = ReturnType<typeof masks>;

/** Polyline resampled every `step` u of arc (both ends kept). */
function resample(pts: readonly XZ[], step: number): XZ[] {
  if (pts.length < 2) return pts.slice();
  const out: XZ[] = [pts[0]];
  let need = step;
  for (let k = 1; k < pts.length; k++) {
    const a = pts[k - 1];
    const b = pts[k];
    const L = dist(a, b);
    let at = 0;
    while (L - at >= need - 1e-9) {
      at += need;
      const t = at / L;
      out.push({ x: lerp(a.x, b.x, t), z: lerp(a.z, b.z, t) });
      need = step;
    }
    need -= L - at;
  }
  const last = pts[pts.length - 1];
  if (dist(out[out.length - 1], last) > step * 0.25) out.push(last);
  else out[out.length - 1] = last;
  return out;
}

/**
 * The bay's waterline round the back, from `B` (on the water) with the mouth heading `phi`: the
 * smoothed water edge, 1 u apart, water on the left of travel. Null when there is no bay.
 */
function traceBay(ctx: SiteCtx, isl: IslandData, B: XZ): XZ[] | null {
  const T = M.bay;
  const phi = isl.anchors.harbour?.rotY ?? 0;
  const sdf = (p: XZ): number => sampleGrid(ctx.h, ctx.sdf, p.x, p.z, -999);
  if (sdf(B) > T.edge) return null;
  const N = Math.round(360 / T.angleStep);
  const own = isl.id + 1;
  const hit = new Float64Array(N).fill(-1);
  const dirs: XZ[] = [];
  for (let j = 0; j < N; j++) {
    const a = phi + j * T.angleStep * DEG;
    const d = { x: dm.cos(a), z: dm.sin(a) };
    dirs.push(d);
    let prev: number = T.rMin;
    for (let r = T.rMin + T.rayStep; r <= T.rMax + 1e-6; r += T.rayStep) {
      const p = add(B, d, r);
      if (sdf(p) <= T.edge) {
        prev = r;
        continue;
      }
      const m = ctx.islandMap[cellOf(ctx, p.x, p.z)];
      if (m !== 0 && m !== own) break;
      let lo: number = prev;
      let hi = r;
      for (let k = 0; k < 8; k++) {
        const mid = (lo + hi) / 2;
        if (sdf(add(B, d, mid)) > T.edge) hi = mid;
        else lo = mid;
      }
      hit[j] = (lo + hi) / 2;
      break;
    }
  }
  // the run round the back (opposite the mouth), from the hit nearest the back
  let j0 = -1;
  for (let k = 0; k <= N / 8 && j0 < 0; k++)
    for (const j of [N / 2 + k, N / 2 - k]) {
      const jj = Math.round(j);
      if (j0 < 0 && hit[jj] >= 0) j0 = jj;
    }
  if (j0 < 0) return null;
  let lo = j0;
  let hi = j0;
  while (hi + 1 < N && hit[hi + 1] >= 0 && Math.abs(hit[hi + 1] - hit[hi]) <= T.jump) hi++;
  while (lo - 1 > 0 && hit[lo - 1] >= 0 && Math.abs(hit[lo - 1] - hit[lo]) <= T.jump) lo--;
  const raw: XZ[] = [];
  for (let j = lo; j <= hi; j++) raw.push(add(B, dirs[j], hit[j]));
  let pts = resample(raw, 1);
  for (let pass = 0; pass < T.smooth; pass++) {
    const prev = pts;
    pts = prev.map((q, i) =>
      i === 0 || i === prev.length - 1
        ? q
        : {
            x: (prev[i - 1].x + 2 * q.x + prev[i + 1].x) / 4,
            z: (prev[i - 1].z + 2 * q.z + prev[i + 1].z) / 4,
          },
    );
  }
  pts = resample(pts, 1);
  // trim the horn tips: the water side turned away from the bay centre
  const lim = dm.cos(T.maxOff * DEG);
  const facing = (k: number): boolean => {
    const a = pts[Math.max(0, k - 1)];
    const b = pts[Math.min(pts.length - 1, k + 1)];
    const l = dist(a, b) || 1;
    const n = { x: -(b.z - a.z) / l, z: (b.x - a.x) / l };
    const q = pts[k];
    const r = dist(B, q) || 1;
    return (n.x * (B.x - q.x) + n.z * (B.z - q.z)) / r >= lim;
  };
  let a = 0;
  let b = pts.length - 1;
  while (a < b && !facing(a)) a++;
  while (b > a && !facing(b)) b--;
  pts = pts.slice(a, b + 1);
  return pts.length - 1 >= T.minArc ? pts : null;
}

/** Stations of a water-edge polyline (1 u apart). */
function stationsOf(pts: readonly XZ[]): Station[] {
  return pts.map((e, k) => {
    // (the tangent over ± `tangentSpan` u: the 2 u grid's wobble left in the edge does not turn it)
    const a = pts[Math.max(0, k - M.bay.tangentSpan)];
    const b = pts[Math.min(pts.length - 1, k + M.bay.tangentSpan)];
    const l = dist(a, b) || 1;
    const t = { x: (b.x - a.x) / l, z: (b.z - a.z) / l };
    return {
      e,
      t,
      n: { x: -t.z, z: t.x },
      s: k,
      deck: false,
      land: 0,
      house: false,
      gapD: Infinity,
    };
  });
}

/**
 * Which stations take the deck and the house row, and how far each one's water edge is built out
 * (`fit.outMax` at most: the promenade, and the house row against a hill, may stand on the
 * shallows in front of the old waterline); the quay = the longest fit stretch. Returns its
 * stations (water edge built out, resampled every 1 u, arc from its start), or null.
 */
function fitQuay(ctx: SiteCtx, isl: IslandData, f: PierFrame, all: Station[], mk: Masks) {
  const F = M.fit;
  const R = M.ring;
  const deckY = R.deckY;
  const own = isl.id + 1;
  const full = R.width + R.edgeFlat;
  const xP: number[] = [];
  const xH: number[] = [];
  const gap: boolean[] = [];
  const otherBody = (i: number): boolean => {
    const m = ctx.islandMap[i];
    return (m !== 0 && m !== own) || mk.other[i] === 1;
  };
  for (const st of all) {
    let g = false;
    let lost = false;
    // the old ground at old offset `o` inland of the waterline
    const cell = (o: number): number => {
      const q = add(st.e, st.n, -o);
      return cellOf(ctx, q.x, q.z);
    };
    for (let o = -F.outMax - M.berth.width; o <= full + R.flank + 1e-6; o += 1) {
      const i = cell(o);
      if (otherBody(i)) lost = true;
    }
    let p = Infinity;
    let h = Infinity;
    for (let x = 0; x <= F.outMax + 1e-6 && h === Infinity; x += 0.5) {
      let okP = true;
      let okH = true;
      // (from the deck's own edge past the water edge: new land too)
      for (let o = -R.innerFlat; o <= full + 1e-6; o += 1) {
        const q = add(st.e, st.n, x - o);
        const i = cellOf(ctx, q.x, q.z);
        const h0 = ctx.h.data[i];
        if (o < 0) {
          if (h0 <= 0 && nearPier(f, q, 0, true)) okP = false;
          continue;
        }
        if (x === 0 && (nearPier(f, q, 0, h0 <= 0) || dist(q, f.root) < F.rootGap)) g = true;
        const bad =
          mk.shapes[i] === 1 || mk.ground[i] === 1 || h0 < -F.maxFill || nearPier(f, q, 0, h0 <= 0);
        // (the level margin past the house backs may run round a reserved site: its ground stays)
        if (o <= R.promenade) {
          if (bad || h0 > deckY + F.maxCut) okP = false;
        } else if (o <= R.width && (bad || mk.lanes[i] || h0 > deckY + F.houseCut)) okH = false;
      }
      if (okP && p === Infinity) p = x;
      if (okP && okH) h = x;
    }
    gap.push(g);
    xP.push(lost || g ? Infinity : p);
    xH.push(lost || g ? Infinity : h);
  }
  const prom = xP.map((x) => x < Infinity);
  const houseOk = xH.map((x) => x < Infinity);
  // stretches split by unfit runs longer than `bridge` (the pier's gap never splits)
  const segs: [number, number][] = [];
  let start = -1;
  let bad = 0;
  for (let k = 0; k <= all.length; k++) {
    const ok = k < all.length && prom[k];
    const pass = k < all.length && gap[k];
    if (ok) {
      if (start < 0) start = k;
      bad = 0;
      continue;
    }
    if (start < 0) continue;
    if (!pass) bad++;
    if (k === all.length || bad > F.bridge) {
      let end = k - 1;
      while (end > start && !prom[end]) end--;
      segs.push([start, end]);
      start = -1;
      bad = 0;
    }
  }
  let best: [number, number] | null = null;
  let bs = -1;
  for (const [a, b] of segs) {
    let s = 0;
    for (let k = a; k <= b; k++) s += (prom[k] ? 1 : 0) + (houseOk[k] ? 2 : 0);
    if (s > bs) {
      bs = s;
      best = [a, b];
    }
  }
  if (!best) return null;
  const [k0, k1] = best;
  const n0 = k1 - k0 + 1;
  // the house row wants at least `minRow` u of row in a stretch
  const house = houseOk.slice(k0, k1 + 1);
  for (let k = 0; k < n0;) {
    if (!house[k]) {
      k++;
      continue;
    }
    let e = k;
    while (e + 1 < n0 && house[e + 1]) e++;
    if (e - k + 1 < F.minRow) for (let j = k; j <= e; j++) house[j] = false;
    k = e + 1;
  }
  // the build-out per station: the house row's where it stands, else the promenade's; widened by
  // `outWiden` stations each way and smoothed so the water edge stays fair
  const x0 = house.map((hk, k) => (hk ? xH[k0 + k] : prom[k0 + k] ? xP[k0 + k] : 0));
  let x = x0.map((_, k) => {
    let m = 0;
    for (let j = Math.max(0, k - F.outWiden); j <= Math.min(n0 - 1, k + F.outWiden); j++)
      if (!gap[k0 + j]) m = Math.max(m, x0[j]);
    return gap[k0 + k] ? 0 : m;
  });
  for (let pass = 0; pass < F.outSmooth; pass++) {
    const prev = x;
    x = prev.map((v, k) => (k === 0 || k === n0 - 1 ? v : (prev[k - 1] + 2 * v + prev[k + 1]) / 4));
  }
  let built: XZ[] = [];
  for (let k = 0; k < n0; k++) built.push(add(all[k0 + k].e, all[k0 + k].n, x[k]));
  for (let pass = 0; pass < F.edgeSmooth; pass++) {
    const prev = built;
    built = prev.map((q, k) =>
      k === 0 || k === n0 - 1
        ? q
        : {
            x: (prev[k - 1].x + 2 * q.x + prev[k + 1].x) / 4,
            z: (prev[k - 1].z + 2 * q.z + prev[k + 1].z) / 4,
          },
    );
  }
  // resampled every 1 u; each new station takes the flags of the old one at the same arc fraction
  const cum = [0];
  for (let k = 1; k < n0; k++) cum.push(cum[k - 1] + dist(built[k - 1], built[k]));
  const pts = resample(built, 1);
  const st = stationsOf(pts);
  let j = 0;
  st.forEach((s, k) => {
    const a = Math.min(k, cum[n0 - 1]);
    while (j + 1 < n0 && cum[j + 1] <= a) j++;
    const o = j + 1 < n0 && cum[j + 1] - a < a - cum[j] ? j + 1 : j;
    s.deck = prom[k0 + o];
    s.house = house[o];
    s.land = s.house ? full : R.promenade;
  });
  for (let k = 0; k < st.length; k++) {
    if (st[k].deck) continue;
    for (let i = 0; i < st.length; i++) st[i].gapD = Math.min(st[i].gapD, Math.abs(i - k));
  }
  return st;
}

/** Stub jetty off the quay end `k` (0 or last) along the end tangent; shorter lens if needed. */
function fitStub(
  ctx: SiteCtx,
  isl: IslandData,
  f: PierFrame,
  st: Station[],
  atEnd: boolean,
  mk: Masks,
): Stub {
  const S = M.stub;
  const own = isl.id + 1;
  const k = atEnd ? st.length - 1 : 0;
  const span = Math.min(4, st.length - 1);
  const a = st[atEnd ? k - span : k + span].e;
  const b = st[k].e;
  const l = dist(a, b) || 1;
  const dir = { x: (b.x - a.x) / l, z: (b.z - a.z) / l };
  const root = add(st[k].e, st[k].n, -S.half);
  for (const len of S.lens) {
    const head = add(root, dir, len);
    let ok = true;
    for (let t = 0; t <= len + S.half + 1e-6 && ok; t += 1)
      for (let o = -S.half - M.ring.flank; o <= S.half + M.ring.flank + 1e-6 && ok; o += 1) {
        const q = add(add(root, dir, t), { x: -dir.z, z: dir.x }, o);
        const i = cellOf(ctx, q.x, q.z);
        const h0 = ctx.h.data[i];
        const m = ctx.islandMap[i];
        if ((m !== 0 && m !== own) || mk.other[i]) ok = false;
        else if (h0 <= 0 && nearPier(f, q, 0, true)) ok = false;
        else if (Math.abs(o) <= S.half && t <= len) {
          if (mk.shapes[i] || h0 < -M.fit.maxFill - 0.5 || h0 > M.ring.deckY + M.fit.maxCut)
            ok = false;
          else if (nearPier(f, q, 0, h0 <= 0)) ok = false;
        }
      }
    if (ok) return { root, head, dir, len };
  }
  return { root, head: root, dir, len: 0 };
}

/** Raise the deck and the stubs, cut the face and the berth strip; new land and the samples. */
function shapeGround(ctx: SiteCtx, isl: IslandData, f: PierFrame, mr: Marina, mk: Masks) {
  const R = M.ring;
  const B = M.berth;
  const deckY = R.deckY;
  const own = isl.id + 1;
  const { st } = mr;
  const inland = R.width + R.edgeFlat + Math.max(R.bank, R.flank) + 1;
  const sea = B.width + B.fall + 1;
  let x0 = Infinity;
  let x1 = -Infinity;
  let z0 = Infinity;
  let z1 = -Infinity;
  const grow = (p: XZ, r: number): void => {
    x0 = Math.min(x0, p.x - r);
    x1 = Math.max(x1, p.x + r);
    z0 = Math.min(z0, p.z - r);
    z1 = Math.max(z1, p.z + r);
  };
  for (const s of st) grow(s.e, Math.max(inland, sea));
  for (const sb of [mr.stubL, mr.stubT]) grow(sb.head, M.stub.half + R.flank + 1);
  const [ix0, ix1] = gridRange(x0, x1);
  const [iz0, iz1] = gridRange(z0, z1);
  const land: number[] = [];
  const last = st.length - 1;
  for (let iz = iz0; iz <= iz1; iz++)
    for (let ix = ix0; ix <= ix1; ix++) {
      const i = iz * ctx.n + ix;
      const m = ctx.islandMap[i];
      if ((m !== 0 && m !== own) || mk.shapes[i] || mk.ground[i]) continue;
      const p = { x: cellX(ix), z: cellZ(iz) };
      const h0 = ctx.h.data[i];
      let y = h0;
      // the quay: the nearest station
      let k = 0;
      let bd = Infinity;
      for (let j = 0; j < st.length; j++) {
        const d = (st[j].e.x - p.x) ** 2 + (st[j].e.z - p.z) ** 2;
        if (d < bd) {
          bd = d;
          k = j;
        }
      }
      const s = st[k];
      const rx = p.x - s.e.x;
      const rz = p.z - s.e.z;
      const along = rx * s.t.x + rz * s.t.z;
      const o = -(rx * s.n.x + rz * s.n.z);
      const beyond = (k === 0 && along < -0.75) || (k === last && along > 0.75);
      if (
        !beyond &&
        s.deck &&
        o <= s.land + Math.max(R.bank, R.flank) &&
        o >= -(B.width + B.fall)
      ) {
        let target = h0;
        let kind: 'deck' | 'rock' | 'berth' | null = null;
        // (water further inland than any build-out is another shore's, across a narrow horn: kept)
        const across = h0 <= 0 && o > M.fit.outMax;
        const fi = R.innerFlat;
        if (o >= -fi && o <= s.land) {
          if (!across) {
            target = deckY;
            kind = 'deck';
          }
        } else if (o > s.land) {
          const q = o - s.land;
          if (h0 > deckY) {
            target = Math.min(h0, lerp(deckY, h0, smoothstep(0, R.bank, q)));
            if (h0 - target > 0.6) kind = 'rock';
          } else if (h0 > 0) target = Math.max(h0, lerp(deckY, h0, smoothstep(0, R.flank, q)));
        } else if (!nearPier(f, p, -1.5, false)) {
          if (o >= -fi - R.face) {
            // (a face sample over the old water stays under it: the deck's edge is the new shore)
            target = Math.min(h0, lerp(deckY, -B.depth, (-o - fi) / R.face));
            if (h0 <= 0) target = Math.min(target, -0.05);
            kind = 'rock';
          } else if (o >= -B.width) {
            target = Math.min(h0, -B.depth);
            kind = 'berth';
          } else target = Math.min(h0, lerp(-B.depth, h0, smoothstep(0, B.fall, -o - B.width)));
        }
        // a deck end beside a gap ramps down to the old ground
        const rf = s.gapD === Infinity ? 1 : smoothstep(0, R.ramp, s.gapD);
        y = lerp(h0, target, rf);
        if (kind === 'deck') mr.deck.set(i, y);
        else if (kind === 'rock') mr.rock.push(i);
        else if (kind === 'berth') mr.berth.push(i);
      }
      // the stubs
      for (const sb of [mr.stubL, mr.stubT]) {
        if (sb.len <= 0) continue;
        const d = segDist(p, sb.root, sb.head) - M.stub.half;
        if (d <= 0) {
          y = deckY;
          mr.deck.set(i, deckY);
        } else if (d <= R.flank && y < deckY) {
          y = Math.max(y, lerp(deckY, h0, smoothstep(0, R.flank, d)));
          mr.rock.push(i);
        }
      }
      if (y === h0) continue;
      ctx.h.data[i] = y;
      if (y > 0 && h0 <= 0) {
        ctx.islandMap[i] = own;
        land.push(i);
      } else if (y <= 0 && h0 > 0) ctx.islandMap[i] = 0;
    }
  // (a new land sample touching no land side-on is a speck off the quay's edge: back under water)
  const n = ctx.n;
  return land.filter((i) => {
    const touches = [1, -1, n, -n].some((d) => ctx.h.data[i + d] > 0);
    if (touches) return true;
    ctx.h.data[i] = -0.05;
    ctx.islandMap[i] = 0;
    mr.deck.delete(i);
    return false;
  });
}

/**
 * Footprint level on the deck: centre, corners and edge mids within `tol` of `deckY`, on the island,
 * no grid sample under them left as it was round a reserved site (`kept`: a neighbouring pad may
 * still move it); `edge`: a piece on the quay edge, only its centre and back half (its front is
 * over the face).
 */
function level(
  ctx: SiteCtx,
  isl: IslandData,
  kept: Uint8Array,
  sh: Shape,
  tol: number,
  edge = false,
): boolean {
  const cs = shapeCorners(sh);
  const pts: XZ[] = [{ x: sh.x, z: sh.z }];
  for (let k = 0; k < 4; k++) {
    const a = cs[k];
    const b = cs[(k + 1) % 4];
    pts.push(a, { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 });
  }
  // (back = away from the facing: corners 1, 2 and the mid between them)
  if (edge)
    pts.splice(1, pts.length - 1, cs[1], cs[2], {
      x: (cs[1].x + cs[2].x) / 2,
      z: (cs[1].z + cs[2].z) / 2,
    });
  const own = (p: XZ): boolean => {
    const [a0, a1] = gridRange(p.x - CELL, p.x + CELL - 1e-6);
    const [b0, b1] = gridRange(p.z - CELL, p.z + CELL - 1e-6);
    for (let iz = b0; iz <= b1; iz++)
      for (let ix = a0; ix <= a1; ix++) if (kept[iz * ctx.n + ix]) return false;
    return true;
  };
  return pts.every(
    (p) =>
      onIsland(ctx, isl, p.x, p.z) &&
      Math.abs(heightAt(ctx.h, p.x, p.z) - M.ring.deckY) <= tol &&
      own(p),
  );
}

/** Kit piece variant `k` of a cycle, any integer index. */
const cyc = <T>(list: readonly T[], k: number): T =>
  list[((k % list.length) + list.length) % list.length];

/** Water edge point, tangent and water normal at arc `s` of the quay (interpolated, clamped). */
function stAt(st: readonly Station[], s: number): { e: XZ; t: XZ; n: XZ; k: number } {
  const k = Math.max(0, Math.min(st.length - 2, Math.floor(s)));
  const f = Math.max(0, Math.min(1, s - k));
  const a = st[k];
  const b = st[k + 1];
  const tx = lerp(a.t.x, b.t.x, f);
  const tz = lerp(a.t.z, b.t.z, f);
  const l = Math.hypot(tx, tz) || 1;
  return {
    e: { x: lerp(a.e.x, b.e.x, f), z: lerp(a.e.z, b.e.z, f) },
    t: { x: tx / l, z: tz / l },
    n: { x: -tz / l, z: tx / l },
    k: Math.round(s),
  };
}

/** True when every station of [s0, s1] passes `ok`. */
const spanOk = (st: readonly Station[], s0: number, s1: number, ok: (s: Station) => boolean) => {
  if (s0 < 0 || s1 > st.length - 1) return false;
  for (let k = Math.floor(s0); k <= Math.ceil(s1); k++) if (!ok(st[k])) return false;
  return true;
};

/**
 * Slots of the house row along the quay (arc of each house's centre and its cycle index). A house
 * takes the stretch of stations over which both its front line and its back line run its width
 * (on a horn the backs close up, in the bay the fronts).
 */
function rowSlots(st: readonly Station[]): { s: number; k: number; alleyAfter: boolean }[] {
  const H = M.house;
  const R = M.ring;
  const houseAt = (k: number): KitRef => cyc(MARINA_KIT.house, cyc(H.cycle, k));
  const line = (o: number): number[] => {
    const cum = [0];
    for (let k = 1; k < st.length; k++) {
      const a = add(st[k - 1].e, st[k - 1].n, -o);
      const b = add(st[k].e, st[k].n, -o);
      cum.push(cum[k - 1] + dist(a, b));
    }
    return cum;
  };
  const front = line(R.promenade);
  const back = line(R.width - H.backInset);
  const at = (cum: number[], s: number): number => {
    const k = Math.max(0, Math.min(st.length - 2, Math.floor(s)));
    return lerp(cum[k], cum[k + 1], Math.max(0, Math.min(1, s - k)));
  };
  /** The arc past `s0` where both lines have run `len` u (∞ past the end). */
  const reach = (s0: number, len: number): number => {
    for (let s1 = s0; s1 <= st.length - 1 + 1e-6; s1 += 0.1)
      if (at(front, s1) - at(front, s0) >= len && at(back, s1) - at(back, s0) >= len) return s1;
    return Infinity;
  };
  const out: { s: number; k: number; alleyAfter: boolean }[] = [];
  const end = st.length - 1 - H.endKeep;
  let s: number = H.endKeep;
  let k = 0;
  let run = 0;
  while (s < end) {
    const s1 = reach(s, houseAt(k).w);
    if (s1 > end) break;
    if (!spanOk(st, s - 0.5, s1 + 0.5, (x) => x.house && x.deck)) {
      s = Math.floor(s) + 1;
      run = 0;
      continue;
    }
    run++;
    const alley = run % H.alleyEvery === 0;
    out.push({ s: (s + s1) / 2, k, alleyAfter: alley });
    s = reach(s1, alley ? H.alley : H.gap);
    k++;
  }
  // at most `max`: trimmed from both ends, the middle of the row kept
  while (out.length > H.max) {
    if (out.length % 2 === 0) out.pop();
    else out.shift();
  }
  if (out.length > 0) out[out.length - 1].alleyAfter = false;
  return out;
}

/**
 * Plan the quay town on the island's bay with the cove dock `site`; null when no quay fits (the
 * caller keeps its plain pier). Reserves the town; `finishMarina` places it on the final ground.
 * `laid`: the pier is already placed with this many segments (the T-head goes on its end).
 * `toward`: where the alleys climb to (the plaza); an alley whose line there is not all land is
 * dropped.
 */
export function planMarina(
  ctx: SiteCtx,
  isl: IslandData,
  site: DockSite | null,
  laid?: number,
  toward?: XZ,
): Marina | null {
  const P = harbourParams(isl.theme);
  const B = isl.anchors.harbour;
  if (!P || !site || !B) return null;
  const segments = laid ?? Math.min(P.pier.segments, pierSegments(ctx, P, site));
  if (segments < P.pier.minSegments) return null;
  const L = segments * DOCK.segment;
  const u = site.dir;
  const rotY = ang(u.x, u.z);
  const end = add(site.root, u, L);
  const head = rectShape(end.x, end.z, rotY, P.pier.head.w, P.pier.head.d);
  const C = { x: B.x, z: B.z };
  const edge = traceBay(ctx, isl, C);
  if (!edge) return null;
  const v0 = { x: -u.z, z: u.x };
  const f: PierFrame = { root: site.root, u, v: v0, L, end, head, P };
  const mk = masks(ctx, isl, C, M.bay.rMax + M.ring.width + M.berth.width + 12);
  const st = fitQuay(ctx, isl, f, stationsOf(edge), mk);
  if (!st || st.length < M.bay.minArc * 0.5) return null;
  const slots = rowSlots(st);
  const tier: Marina['tier'] | null =
    slots.length >= M.fit.fullHouses ? 'full' : slots.length >= M.fit.shortHouses ? 'short' : null;
  if (!tier) return null;
  // the full width is paved only along the row the slots take (alleys included); elsewhere the
  // promenade alone, so the street lots keep the rest of the shore
  const row = new Uint8Array(st.length);
  slots.forEach((sl, j) => {
    const w = cyc(MARINA_KIT.house, cyc(M.house.cycle, sl.k)).w;
    const next = slots[j + 1];
    const to = next && next.s - sl.s < w + M.house.alley + 3 ? next.s : sl.s + w / 2 + 3;
    for (
      let k = Math.max(0, Math.floor(sl.s - w / 2 - 3));
      k <= Math.min(st.length - 1, Math.ceil(to));
      k++
    )
      row[k] = 1;
  });
  st.forEach((x, k) => {
    x.house = x.house && row[k] === 1;
    x.land = x.house ? M.ring.width + M.ring.edgeFlat : M.ring.promenade;
  });
  const stubL = fitStub(ctx, isl, f, st, false, mk);
  const stubT = fitStub(ctx, isl, f, st, true, mk);
  let rSum = 0;
  let rMax = 0;
  for (const s of st) {
    const d = dist(C, s.e);
    rSum += d;
    rMax = Math.max(rMax, d);
  }
  const before = ctx.sdf.slice();
  // the light stub's centre line (head → root) is the skeleton's arm
  const arm: ArmPoint[] = [];
  const nL = { x: stubL.dir.z, z: -stubL.dir.x };
  const armLen = Math.max(1, stubL.len);
  const armDir = stubL.len > 0 ? stubL.dir : { x: -st[0].t.x, z: -st[0].t.z };
  for (let s = 0; s <= armLen + 1e-6; s += 1) {
    const p = add(stubL.root, armDir, armLen - s);
    arm.push({ x: p.x, z: p.z, s, nx: nL.x, nz: nL.z, half: M.stub.half });
  }
  const side = Math.SQRT2 * (rSum / st.length) * 0.7;
  // (v: across the pier toward the bay's back, the side the skeleton's arm would take)
  const sigma: 1 | -1 =
    v0.x * (st[0].e.x - site.root.x) + v0.z * (st[0].e.z - site.root.z) >= 0 ? 1 : -1;
  const hb: Harbour = {
    isl,
    P,
    root: site.root,
    u,
    v: { x: v0.x * sigma, z: v0.z * sigma },
    sigma,
    rotY,
    site: { ...site, segments },
    end,
    berth: add(end, u, P.berth.out),
    arm,
    bend: arm.length - 1,
    land: [],
    before,
    basin: rectShape(C.x, C.z, rotY, side, side),
  };
  const mr: Marina = {
    hb,
    st,
    C,
    rMean: rSum / st.length,
    rMax,
    stubL,
    stubT,
    tier,
    houses: [],
    terraces: [],
    stalls: [],
    boats: [],
    pontoons: [],
    tower: null,
    fort: null,
    lanterns: [],
    bollards: [],
    alleys: [],
    deck: new Map(),
    rock: [],
    berth: [],
  };
  const land = shapeGround(ctx, isl, f, mr, mk);
  refreshCoast(ctx, land);
  for (const i of mr.berth) if (ctx.h.data[i] < 0) ctx.zone[i] = Zone.lagoon;
  layTown(ctx, isl, f, mr, slots, toward, mk);
  mr.fort = fortSite(ctx, isl, f, mr);
  // the T-head and the berth stay free of other sites; the skeleton anchors (y: finishHarbour)
  addShape(ctx, isl, head, false);
  const pub = (key: string, p: XZ, r: number): void => {
    isl.anchors[key] = { x: p.x, z: p.z, rotY: r };
  };
  pub('harbourPier0', site.root, rotY);
  pub('harbourPier1', end, rotY);
  pub('harbourHeadSize', { x: P.pier.head.w, z: P.pier.head.d }, 0);
  pub('ferryBerth', hb.berth, rotY);
  pub('harbourBasin', C, rotY);
  pub('harbourBasinSize', { x: side, z: side }, 0);
  return mr;
}

/** Houses, terraces, stalls, lanterns, boats, pontoons and the tower; every footprint reserved. */
function layTown(
  ctx: SiteCtx,
  isl: IslandData,
  f: PierFrame,
  mr: Marina,
  slots: ReturnType<typeof rowSlots>,
  toward: XZ | undefined,
  mk: Masks,
): void {
  const { st } = mr;
  const H = M.house;
  const R = M.ring;
  const houseAt = (k: number): KitRef => cyc(MARINA_KIT.house, cyc(H.cycle, k));
  const front = (n: XZ): number => ang(n.x, n.z);
  const kept: { slot: (typeof slots)[number]; kit: KitRef; p: XZ; rot: number }[] = [];
  for (const slot of slots) {
    const kit = houseAt(slot.k);
    const a = stAt(st, slot.s);
    const p = add(a.e, a.n, -(R.width - H.backInset - kit.d / 2));
    const rot = front(a.n);
    const sh = rectShape(p.x, p.z, rot, kit.w, kit.d);
    if (!level(ctx, isl, mk.ground, sh, H.maxRelief) || !clear(ctx, isl, sh, 0.2)) continue;
    addShape(ctx, isl, sh, true);
    kept.push({ slot, kit, p, rot });
  }
  mr.houses = kept.map(({ slot, kit, p, rot }) => ({
    kit,
    p,
    rot,
    kind: cyc(H.cycle, slot.k) % MARINA_KIT.house.length,
    terrace: -1,
  }));
  // alley backs (lanes up toward the plaza): after the flagged houses, mid-gap, on a dry line
  for (const { slot, kit } of kept) {
    if (!slot.alleyAfter) continue;
    const a = stAt(st, slot.s + kit.w / 2 + H.alley / 2);
    const pin = add(a.e, a.n, -(R.width - 0.6));
    if (toward) {
      const n = Math.ceil(dist(pin, toward) / 2);
      let dry = true;
      for (let j = 0; j <= n && dry; j++) {
        const q = { x: lerp(pin.x, toward.x, j / n), z: lerp(pin.z, toward.z, j / n) };
        if (heightAt(ctx.h, q.x, q.z) < 0.3) dry = false;
      }
      if (!dry) continue;
    }
    mr.alleys.push(pin);
  }
  // terraces before restaurants, stalls before other houses (middle of the row first)
  const T = M.terrace;
  const mid = kept.length > 0 ? (kept[0].slot.s + kept[kept.length - 1].slot.s) / 2 : 0;
  const order = [...kept].sort(
    (x, y) => Math.abs(x.slot.s - mid) - Math.abs(y.slot.s - mid) || x.slot.s - y.slot.s,
  );
  const stallOf = new Set<number>();
  for (const h of order) {
    const v = cyc(H.cycle, h.slot.k);
    if (H.restaurant[v] !== undefined || stallOf.size >= M.stall.count) continue;
    stallOf.add(h.slot.k);
  }
  for (const h of kept) {
    const v = cyc(H.cycle, h.slot.k);
    const ti = H.restaurant[v];
    const a = stAt(st, h.slot.s);
    if (ti !== undefined) {
      const kit = MARINA_KIT.terrace[ti];
      const p = add(a.e, a.n, -(T.edge + kit.d / 2));
      const rot = front(a.n);
      const sh = rectShape(p.x, p.z, rot, kit.w, kit.d);
      if (level(ctx, isl, mk.ground, sh, H.maxRelief, true) && clear(ctx, isl, sh, 0.1)) {
        addShape(ctx, isl, sh, false);
        mr.terraces.push({ kit, p, rot });
        mr.houses[kept.indexOf(h)].terrace = mr.terraces.length - 1;
      }
    } else if (stallOf.has(h.slot.k)) {
      const kit = cyc(MARINA_KIT.stall, M.stall.variants[mr.stalls.length]);
      const p = add(a.e, a.n, -(M.stall.edge + kit.d / 2));
      const rot = front(a.n);
      const sh = rectShape(p.x, p.z, rot, kit.w, kit.d);
      if (level(ctx, isl, mk.ground, sh, H.maxRelief, true) && clear(ctx, isl, sh, 0.1)) {
        addShape(ctx, isl, sh, false);
        mr.stalls.push({ kit, p, rot });
      }
    }
  }
  // lanterns at house joints on the water edge
  for (let j = 0; j + 1 < kept.length; j++) {
    if (j % M.lantern.every !== 0 && !kept[j].slot.alleyAfter) continue;
    const s0 = kept[j].slot.s + kept[j].kit.w / 2;
    const s1 = kept[j + 1].slot.s - kept[j + 1].kit.w / 2;
    if (s1 - s0 > H.alley * 1.5) continue;
    const a = stAt(st, (s0 + s1) / 2);
    const p = add(a.e, a.n, -M.lantern.inset);
    const sh = discShape(p.x, p.z, 0.3);
    if (!clear(ctx, isl, sh, 0.1)) continue;
    addShape(ctx, isl, sh, true);
    mr.lanterns.push(p);
  }
  // the tower on its stub, `tower.back` u in from the head, else further in, else on the quay's end
  const tk = MARINA_KIT.tower;
  const sb = mr.stubT;
  const last = st[st.length - 1];
  const spots: XZ[] = [];
  for (let b = M.tower.back; b <= sb.len + 1e-6; b += 1) spots.push(add(sb.head, sb.dir, -b));
  for (let k = 0; k <= 6; k += 2) {
    const a = stAt(st, st.length - 1 - k);
    spots.push(add(a.e, a.n, -R.promenade / 2));
  }
  if (sb.len <= 0) spots.unshift(add(last.e, last.n, -R.promenade / 2));
  for (const tp of spots) {
    const trot = ang(mr.C.x - tp.x, mr.C.z - tp.z);
    const tsh = rectShape(tp.x, tp.z, trot, tk.w, tk.d);
    if (!level(ctx, isl, mk.ground, tsh, 0.4) || !clear(ctx, isl, tsh, 0.2)) continue;
    addShape(ctx, isl, tsh, true);
    mr.tower = { kit: tk, p: tp, rot: trot };
    break;
  }
  // (the boats and their bollards before the promenade is reserved: a bollard stands on it)
  layBoats(ctx, isl, f, mr);
  // the promenade and the deck reserved (walkable), the stubs, the berth strip (water)
  for (let s = 0; s < st.length; s += 3) {
    const x = st[s];
    if (!x.deck) continue;
    const fi = M.ring.innerFlat;
    const c = add(x.e, x.n, -(x.land - fi) / 2);
    addShape(ctx, isl, rectShape(c.x, c.z, ang(x.n.x, x.n.z), 3.4, x.land + fi), false);
    const w = add(x.e, x.n, M.berth.width / 2);
    addShape(ctx, isl, rectShape(w.x, w.z, ang(x.n.x, x.n.z), 3.4, M.berth.width), false);
  }
  for (const b of [mr.stubL, mr.stubT]) {
    if (b.len <= 0) continue;
    const c = add(b.root, b.dir, b.len / 2);
    const r = ang(b.dir.x, b.dir.z);
    addShape(ctx, isl, rectShape(c.x, c.z, r, 2 * M.stub.half + 1, b.len + 2 * M.stub.half), false);
  }
}

/**
 * The star fort's site (HQ_MARINA.fort.ring): on the water in the bay's mouth, on a `grid` lattice
 * from `mouthIn` u inside the line between the stub heads to `out[1]` u out, `across` u past either
 * head; the walls on water `maxDepth` deep at most, `gap` u off the quay's face, its stubs and the
 * ferry pier / approach, `boat` u + `gap` off every moored boat; the spot nearest the point `at` of
 * the way from the light's stub head to the tower's, `out[0]` u out. Published as `marinaFort`
 * (the boat routes keep off it; marina.ts stands the fort there). Null: none fits.
 */
function fortSite(ctx: SiteCtx, isl: IslandData, f: PierFrame, mr: Marina): XZ | null {
  const R = HQ_MARINA.fort.ring;
  const W = STAR_FORT.outerR + R.gap;
  const a = mr.stubL.len > 0 ? mr.stubL.head : mr.stubL.root;
  const b = mr.stubT.len > 0 ? mr.stubT.head : mr.stubT.root;
  const len = dist(a, b) || 1;
  const t = { x: (b.x - a.x) / len, z: (b.z - a.z) / len };
  const qm = mr.st[Math.floor(mr.st.length / 2)].e;
  let o = { x: -t.z, z: t.x };
  if (o.x * (a.x - qm.x) + o.z * (a.z - qm.z) < 0) o = { x: -o.x, z: -o.z };
  const berthEnd = add(mr.hb.berth, f.u, f.P.berth.approach.len);
  const boats = [...mr.boats, ...mr.pontoons].map((pc) => pc.p);
  const sh = M.stub.half + M.ring.flank + W;
  const target = { u: R.at * len, v: R.out[0] };
  let best: XZ | null = null;
  let bd = Infinity;
  for (let v = -R.mouthIn; v <= R.out[1] + 1e-6; v += R.grid)
    for (let u = -R.across; u <= len + R.across + 1e-6; u += R.grid) {
      const d = Math.hypot(u - target.u, v - target.v);
      if (d >= bd) continue;
      const c = add(add(a, t, u), o, v);
      const y = heightAt(ctx.h, c.x, c.z);
      if (y > -HQ_MARINA.depth.min || y < -R.maxDepth) continue;
      let wet = true;
      for (let k = 0; k < 8 && wet; k++) {
        const q = add(
          c,
          { x: dm.cos(k * Math.PI * 0.25), z: dm.sin(k * Math.PI * 0.25) },
          STAR_FORT.outerR,
        );
        if (heightAt(ctx.h, q.x, q.z) >= 0) wet = false;
      }
      if (!wet) continue;
      if (mr.st.some((s) => dist(s.e, c) < M.ring.face + W)) continue;
      if (boats.some((q) => dist(q, c) < R.boat + W)) continue;
      if ([mr.stubL, mr.stubT].some((s) => segDist(c, s.root, s.head) < sh)) continue;
      if (segDist(c, f.root, f.end) < STAR_FORT.outerR + R.pierGap) continue;
      if (
        segDist(c, mr.hb.berth, berthEnd) <
        STAR_FORT.outerR + f.P.berth.approach.half + R.approachGap
      )
        continue;
      const own = Math.hypot(c.x - isl.cx, c.z - isl.cz);
      if (ctx.islands.some((i) => i !== isl && Math.hypot(c.x - i.cx, c.z - i.cz) < own)) continue;
      bd = d;
      best = c;
    }
  return best;
}

/** Finger pontoons with a boat each side, then stern-to boats along the rest of the quay. */
function layBoats(ctx: SiteCtx, isl: IslandData, f: PierFrame, mr: Marina): void {
  const { st } = mr;
  const Y = M.yacht;
  const O = M.pontoon;
  const pk = MARINA_KIT.pontoon;
  const r0 = Y.faceGap / 2;
  const wet = (p: XZ): boolean => heightAt(ctx.h, p.x, p.z) < -0.6 && !nearPier(f, p, 1, false);
  const deckSpan = (s0: number, s1: number): boolean =>
    spanOk(st, s0 - Y.endKeep, s1 + Y.endKeep, (x) => x.deck && x.gapD > Y.endKeep);
  const taken: [number, number][] = [];
  const boats: Piece[] = [];
  const order: number[] = [];
  const pboats = O.boats.map((v) => MARINA_KIT.yacht[v]);
  const half = pk.w / 2 + O.side + Math.max(...pboats.map((b) => b.w));
  for (let j = 0; j < O.runs; j++) {
    const want = O.at[j] * (st.length - 1);
    let at = -1;
    for (let d = 0; d <= st.length && at < 0; d++)
      for (const s of [want + d, want - d]) {
        if (at >= 0 || !deckSpan(s - half, s + half)) continue;
        if (taken.some(([a, b]) => s + half + Y.gap > a && s - half - Y.gap < b)) continue;
        const a = stAt(st, s);
        const tipP = add(a.e, a.n, r0 + pk.d * O.segs);
        const sideP = [-1, 1].map((k) => add(add(a.e, a.n, r0 + 2), a.t, k * half));
        if (!wet(add(a.e, a.n, r0 + 0.5)) || !wet(tipP) || !sideP.every(wet)) continue;
        at = s;
      }
    if (at < 0) continue;
    const a = stAt(st, at);
    for (let k = 0; k < O.segs; k++) {
      const p = add(a.e, a.n, r0 + pk.d * (k + 0.5));
      mr.pontoons.push({ kit: pk, p, rot: ang(a.n.x, a.n.z) });
    }
    pboats.forEach((b, k) => {
      const off = (k === 0 ? -1 : 1) * (pk.w / 2 + O.side + b.w / 2);
      const p = add(add(a.e, a.n, r0 + b.d / 2 + 0.3), a.t, off);
      boats.push({ kit: b, p, rot: ang(a.n.x, a.n.z) });
      order.push(at + off);
    });
    taken.push([at - half, at + half]);
  }
  // stern-to along the quay, light end → tower end: every berth that fits, then at most `max`
  // spread evenly along the quay
  const cands: { pc: Piece; o: number; a: ReturnType<typeof stAt> }[] = [];
  let s = 0;
  for (let k = 0; s < st.length - 1; k++) {
    const b = cyc(MARINA_KIT.yacht, cyc(Y.cycle, k));
    const w = b.w + Y.gap;
    const block = taken.find(([t0, t1]) => s + w > t0 - Y.gap && s < t1 + Y.gap);
    if (block) {
      s = block[1] + Y.gap;
      k--;
      continue;
    }
    const c = s + w / 2;
    const a = stAt(st, c);
    const p = add(a.e, a.n, Y.faceGap + b.d / 2);
    const bow = add(a.e, a.n, Y.faceGap + b.d);
    if (!deckSpan(s, s + w) || !wet(p) || !wet(bow) || !wet(add(a.e, a.n, Y.faceGap))) {
      s += 1;
      k--;
      continue;
    }
    cands.push({ pc: { kit: b, p, rot: ang(a.n.x, a.n.z) }, o: c, a });
    s += w;
  }
  const pick =
    cands.length <= Y.max
      ? cands
      : Array.from(
          { length: Y.max },
          (_, j) => cands[Math.round((j * (cands.length - 1)) / (Y.max - 1))],
        );
  for (const { pc, o, a } of pick) {
    boats.push(pc);
    order.push(o);
    const q = add(a.e, a.n, -M.bollard.inset);
    const sh = discShape(q.x, q.z, 0.25);
    if (clear(ctx, isl, sh, 0.05)) {
      addShape(ctx, isl, sh, true);
      mr.bollards.push({ p: q, rot: ang(a.n.x, a.n.z) });
    }
  }
  // quay order
  mr.boats = boats
    .map((b, k) => ({ b, o: order[k] }))
    .sort((x, y) => x.o - y.o)
    .map((x) => x.b);
}

/**
 * Finish (final ground): the deck levelled and painted (plaza, faces and banks rock), the berth
 * water lagoon, the anchors with their heights, every fixture. Returns the quay walk polylines
 * (joined to the alley lanes and the pier root) for the path graph.
 */
export function finishMarina(ctx: SiteCtx, mr: Marina, paths: readonly Polyline[]): Polyline[] {
  const { st, hb } = mr;
  const isl = hb.isl;
  const R = M.ring;
  const deckY = R.deckY;
  // the deck level again: neighbouring pads' falls and the lanes' carve reached onto it
  for (const [i, y] of mr.deck) {
    ctx.h.data[i] = y;
    ctx.zone[i] = Zone.plaza;
  }
  for (const i of mr.rock)
    if (!mr.deck.has(i) && ctx.h.data[i] > 0 && ctx.h.data[i] < deckY + 6) ctx.zone[i] = Zone.rock;
  for (const i of mr.berth) if (ctx.h.data[i] < 0) ctx.zone[i] = Zone.lagoon;
  const H = (p: XZ): number => heightAt(ctx.h, p.x, p.z);
  const pub = (key: string, p: XZ, rotY: number, y: number): void => {
    isl.anchors[key] = { x: p.x, z: p.z, rotY, y };
  };
  const hL = mr.stubL.len > 0 ? mr.stubL.head : mr.stubL.root;
  const hT = mr.stubT.len > 0 ? mr.stubT.head : mr.stubT.root;
  const mouth = { x: (hL.x + hT.x) / 2, z: (hL.z + hT.z) / 2 };
  const qm = st[Math.floor(st.length / 2)].e;
  let out = { x: -(hT.z - hL.z), z: hT.x - hL.x };
  if (out.x * (mouth.x - qm.x) + out.z * (mouth.z - qm.z) < 0) out = { x: -out.x, z: -out.z };
  const mo = ang(out.x, out.z);
  pub('marinaBasin', mr.C, mo, 0);
  isl.anchors.marinaBasinSize = { x: 2 * mr.rMean, z: 2 * mr.rMax, rotY: 0 };
  pub('marinaMouth', mouth, mo, 0);
  // the centre line, `quayStep` apart
  const line = resample(
    st.map((x) => add(x.e, x.n, -R.width / 2)),
    M.quayStep,
  );
  const n = line.length - 1;
  line.forEach((p, k) => {
    const q = line[Math.min(k + 1, n)];
    const o = line[Math.max(k - 1, 0)];
    const r = k < n ? ang(q.x - p.x, q.z - p.z) : ang(p.x - o.x, p.z - o.z);
    pub(`marinaQuay${k}`, p, r, H(p));
  });
  isl.anchors.marinaQuaySize = { x: R.width, z: deckY, rotY: 0 };
  for (const [key, b] of [
    ['marinaStubL', mr.stubL],
    ['marinaStubT', mr.stubT],
  ] as const)
    pub(key, b.root, ang(b.dir.x, b.dir.z), H(b.root));
  isl.anchors.marinaStubSize = { x: mr.stubL.len, z: mr.stubT.len, rotY: 0 };
  const fix = (defId: string, p: XZ, rotY: number, variant: number, y: number): void => {
    ctx.fixtures.push({ defId, x: p.x, z: p.z, rotY, islandId: isl.id, variant, y });
  };
  // (houses on the ground under their pivot; edge pieces at the deck: the quay face starts under them)
  const put = (list: readonly Piece[], key: string, y0: number | null): void =>
    list.forEach((pc, k) => {
      const y = y0 ?? H(pc.p);
      pub(`${key}${k}`, pc.p, pc.rot, y);
      fix(pc.kit.defId, pc.p, pc.rot, pc.kit.variant, y);
    });
  put(mr.houses, 'marinaHouse', null);
  mr.houses.forEach((h, k) => {
    isl.anchors[`marinaHouseKind${k}`] = { x: h.kind ?? 0, z: h.terrace ?? -1, rotY: 0 };
  });
  put(mr.terraces, 'marinaTerrace', deckY);
  put(mr.boats, 'marinaBerth', 0);
  put(mr.pontoons, 'marinaPontoon', 0);
  for (const s of mr.stalls) fix(s.kit.defId, s.p, s.rot, s.kit.variant, deckY);
  if (mr.fort) pub('marinaFort', mr.fort, ang(hb.end.x - mr.fort.x, hb.end.z - mr.fort.z), 0);
  if (mr.tower) {
    pub('marinaTower', mr.tower.p, mr.tower.rot, H(mr.tower.p));
    fix(mr.tower.kit.defId, mr.tower.p, mr.tower.rot, mr.tower.kit.variant, H(mr.tower.p));
  }
  const water = (p: XZ): number => {
    let bd = Infinity;
    let r = 0;
    for (const s of st) {
      const d = dist(s.e, p);
      if (d < bd) {
        bd = d;
        r = ang(s.n.x, s.n.z);
      }
    }
    return r;
  };
  for (const p of mr.lanterns) fix(M.lantern.defId, p, water(p), M.lantern.variant, deckY);
  for (const o of mr.bollards) fix(M.bollard.defId, o.p, o.rot, M.bollard.variant, deckY);
  return promenade(ctx, mr, paths);
}

/**
 * The quay walk `walk` u in from the water edge, light end → tower end, split where it would leave
 * the land; every piece starts from a lane end within reach (an alley's first, then the pier
 * root's, then any other), and every other lane end within reach joins it too.
 */
function promenade(ctx: SiteCtx, mr: Marina, paths: readonly Polyline[]): Polyline[] {
  const { st, hb } = mr;
  const isl = hb.isl;
  const ends: XZ[] = [];
  for (const pl of paths)
    if (pl.islandId === isl.id && pl.points.length > 1)
      ends.push(pl.points[0], pl.points[pl.points.length - 1]);
  const nearest = (p: XZ, max: number): XZ | null => {
    let best: XZ | null = null;
    for (const e of ends) if (dist(e, p) <= max && (!best || dist(e, p) < dist(best, p))) best = e;
    return best;
  };
  const pieces: XZ[][] = [];
  let cur: XZ[] = [];
  const endKeep = M.house.endKeep;
  for (let s = endKeep; s <= st.length - 1 - endKeep + 1e-6; s += 2) {
    const a = stAt(st, s);
    const p = add(a.e, a.n, -M.walk);
    if (heightAt(ctx.h, p.x, p.z) < 0.2) {
      if (cur.length > 1) pieces.push(cur);
      cur = [];
      continue;
    }
    cur.push(p);
  }
  if (cur.length > 1) pieces.push(cur);
  // (a lane end may sit on the waterline: the pier root's)
  const dryLine = (a: XZ, b: XZ): boolean => {
    const n = Math.ceil(dist(a, b));
    for (let k = 1; k < n; k++) {
      const q = { x: lerp(a.x, b.x, k / n), z: lerp(a.z, b.z, k / n) };
      if (heightAt(ctx.h, q.x, q.z) < 0.05) return false;
    }
    return true;
  };
  const nodes: XZ[] = [];
  for (const a of mr.alleys) {
    const e = nearest(a, 4);
    if (e) nodes.push(e);
  }
  const root = nearest(hb.root, 3);
  if (root) nodes.push(root);
  // (and any other lane of the island that ends by the quay)
  for (const e of ends) if (!nodes.includes(e)) nodes.push(e);
  const out: Polyline[] = [];
  for (const pc of pieces) {
    // join every lane end that comes down within reach of this piece
    const joins: { k: number; e: XZ }[] = [];
    for (const e of nodes) {
      let bk = -1;
      let bd = Infinity;
      pc.forEach((q, k) => {
        const d = dist(q, e);
        if (d < bd) {
          bd = d;
          bk = k;
        }
      });
      if (bk >= 0 && bd <= M.ring.width + 4 && dryLine(e, pc[bk]) && !joins.some((j) => j.k === bk))
        joins.push({ k: bk, e });
    }
    if (joins.length === 0) continue;
    // one polyline per join: the lane end, down, then each way along the piece
    const j = joins[0];
    out.push({
      islandId: isl.id,
      kind: 'path',
      closed: false,
      points: [j.e, ...pc.slice(0, j.k + 1).reverse()],
    });
    out.push({ islandId: isl.id, kind: 'path', closed: false, points: [j.e, ...pc.slice(j.k)] });
    for (const o of joins.slice(1))
      out.push({ islandId: isl.id, kind: 'path', closed: false, points: [o.e, pc[o.k]] });
  }
  return out;
}

/** The two stub jetties from the anchors (root, head), light's first; a stub of length 0 included. */
export function stubsOf(isl: IslandData): { root: XZ; head: XZ }[] {
  const A = isl.anchors;
  const size = A.marinaStubSize;
  if (!size) return [];
  const out: { root: XZ; head: XZ }[] = [];
  for (const [key, len] of [
    ['marinaStubL', size.x],
    ['marinaStubT', size.z],
  ] as const) {
    const s = A[key];
    if (s)
      out.push({ root: s, head: { x: s.x + dm.cos(s.rotY) * len, z: s.z + dm.sin(s.rotY) * len } });
  }
  return out;
}

/** True when `p` lies on the quay (its deck and berth strip, a stub): the town's pieces (tests). */
export function inMarina(isl: IslandData, p: XZ): boolean {
  const A = isl.anchors;
  const q = A.marinaQuaySize;
  if (!q || !A.marinaQuay0) return false;
  // the nearest centre-line segment; its water side reaches the berth strip
  let bd = Infinity;
  let o = 0;
  for (let k = 0; A[`marinaQuay${k + 1}`]; k++) {
    const a = A[`marinaQuay${k}`];
    const b = A[`marinaQuay${k + 1}`];
    const d = segDist(p, a, b);
    if (d >= bd) continue;
    bd = d;
    const l = dist(a, b) || 1;
    o = ((p.x - a.x) * -(b.z - a.z) + (p.z - a.z) * (b.x - a.x)) / l;
  }
  if (
    o >= -(q.x / 2 + M.ring.edgeFlat) &&
    o <= q.x / 2 + M.berth.width &&
    bd <= q.x / 2 + M.berth.width
  )
    return true;
  for (const s of stubsOf(isl))
    if (segDist(p, s.root, s.head) <= M.stub.half + M.ring.flank) return true;
  return false;
}

/** Boat-route keep-out discs over the quay's berth strip and round its stub heads (world/index.ts). */
export function marinaKeepOut(
  islands: readonly IslandData[],
): { x: number; z: number; r: number; hard: number }[] {
  const out: { x: number; z: number; r: number; hard: number }[] = [];
  const K = M.keepOut;
  for (const isl of islands) {
    const A = isl.anchors;
    const qs = A.marinaQuaySize;
    if (!qs || !A.marinaQuay0) continue;
    const r = M.berth.width / 2 + K.pad;
    for (let k = 0; A[`marinaQuay${k}`]; k += 2) {
      const q = A[`marinaQuay${k}`];
      const o = qs.x / 2 + M.berth.width / 2;
      out.push({ x: q.x - dm.sin(q.rotY) * o, z: q.z + dm.cos(q.rotY) * o, r, hard: K.hard });
    }
    for (const s of stubsOf(isl))
      out.push({ x: s.head.x, z: s.head.z, r: M.stub.half + M.ring.flank + K.pad, hard: K.hard });
    // (the fort's site: the smoothed routes keep `fort.clearRoute` u off its centre)
    const ft = A.marinaFort;
    if (ft) out.push({ x: ft.x, z: ft.z, r: HQ_MARINA.fort.clearRoute / K.hard + 1, hard: K.hard });
  }
  return out;
}
