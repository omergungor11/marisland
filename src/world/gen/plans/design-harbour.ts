/**
 * Design "Colour Wharf" (M31 TASK-537, D-127): the Design instance on the harbour skeleton
 * (harbour.ts). Plan-time sites round what the campus left, kit placed on the final ground (no rng;
 * numbers in content/themes/design-harbour.ts).
 *
 * Anchor contract (world u; rotY = xz heading (cos, sin); `y` = world height):
 * - `boathouse0..K` (`anchorPoints`): the row along the coast, rotY = the house's door heading (out
 *   to sea), y = 0 (the pivot on the waterline). Absent when no row fits. `boathouseFit` { x: 1 at the
 *   stream mouth, 0 fallback; z: u from the nearest house to the mouth }.
 * - `wharfPavilion`: the glass pavilion on the pier's axis, rotY = the pier heading.
 * - `lanternMoor`: where the lantern boat stands, rotY = its heading (bow to the sea), y = 0.
 * - `lanternLane0..K`: its way past the arm tip, sea → turn → `lanternMoor` → sea, in travel order,
 *   rotY = heading (life/boats.ts closes it round the island ring). Absent when no water route fits.
 * - `paintBuoy0..K`: the pots down the lagoon, mouth end first (the ritual's order), rotY = along the
 *   line, y = 0.
 */
import {
  WHARF_PASTELS,
  WHARF_SITE as W,
  WHARF_VARIANTS as WV,
} from '../../../content/themes/design-harbour.ts';
import { DOCK, PATHS } from '../../../content/settlements.ts';
import { heightAt, type IslandData, type XZ } from '../../types.ts';
import { cellX, cellZ, gridRange } from '../grid.ts';
import {
  add,
  addShape,
  ang,
  dist,
  rectShape,
  sdfAt,
  shapeCorners,
  shapeDist,
  shapesOverlap,
  type Shape,
  type SiteCtx,
} from '../sites.ts';
import { armAt, armLength, framePoint, frameOf, type Harbour } from './harbour.ts';
import { anchorPoints } from './research-anchors.ts';

const H = (ctx: SiteCtx, p: XZ): number => heightAt(ctx.h, p.x, p.z);

function publish(isl: IslandData, key: string, p: XZ, rotY: number, y?: number): void {
  isl.anchors[key] = y === undefined ? { x: p.x, z: p.z, rotY } : { x: p.x, z: p.z, rotY, y };
}

/** Obstacles only, the basin's reservation ignored (the row's doors look into it), and the lanes. */
function free(ctx: SiteCtx, hb: Harbour, sh: Shape, gap: number): boolean {
  for (const o of ctx.shapes[hb.isl.id]) {
    if (o === hb.basin) continue;
    if (shapesOverlap(o, sh, gap)) return false;
  }
  for (const lane of ctx.lanes[hb.isl.id])
    for (const p of lane) if (shapeDist(sh, p.x, p.z) < PATHS.halfWidth + 0.4) return false;
  return true;
}

/** Unit normal out to sea at p (down the shore SDF), from central differences. */
function seaward(ctx: SiteCtx, p: XZ): XZ {
  const gx = sdfAt(ctx, p.x - 1, p.z) - sdfAt(ctx, p.x + 1, p.z);
  const gz = sdfAt(ctx, p.x, p.z - 1) - sdfAt(ctx, p.x, p.z + 1);
  const l = Math.hypot(gx, gz);
  return l > 1e-6 ? { x: gx / l, z: gz / l } : { x: 0, z: 0 };
}

/** `p` moved onto the shore-distance contour `off` (a few Newton steps). */
function onContour(ctx: SiteCtx, p: XZ, off: number): XZ {
  let q = p;
  for (let k = 0; k < 3; k++) q = add(q, seaward(ctx, q), sdfAt(ctx, q.x, q.z) - off);
  return q;
}

const cellIndex = (ctx: SiteCtx, p: XZ): number =>
  ctx.n * Math.round((p.z - cellZ(0)) / ctx.h.cellSize) +
  Math.round((p.x - cellX(0)) / ctx.h.cellSize);

interface House extends XZ {
  rot: number;
}

/** A boathouse site at contour point `p`, or null. */
function houseAt(
  ctx: SiteCtx,
  hb: Harbour,
  stream: readonly XZ[],
  pins: readonly XZ[],
  p: XZ,
): House | null {
  const R = W.row;
  const n = seaward(ctx, p);
  if (n.x === 0 && n.z === 0) return null;
  const front = add(p, n, R.frontWet);
  if (H(ctx, front) > R.frontY || H(ctx, add(p, n, R.openWet)) > R.frontY) return null;
  // the old coast, not the arm the harbour grew
  if (hb.before[cellIndex(ctx, p)] < -R.maxOffArm) return null;
  const rot = ang(n.x, n.z);
  const sh = rectShape(p.x, p.z, rot, 2.9, 4.2);
  const back = add(p, n, -2);
  if (H(ctx, back) > R.rearMax) return null;
  for (const c of shapeCorners(sh)) if (H(ctx, c) > R.rearMax) return null;
  for (const s of stream)
    if (dist(s, p) < R.streamClear + 3 && shapeDist(sh, s.x, s.z) < R.streamClear) return null;
  for (const q of pins) if (shapeDist(sh, q.x, q.z) < R.pinKeep) return null;
  if (!free(ctx, hb, sh, R.gap)) return null;
  return { x: p.x, z: p.z, rot };
}

/** Walk the contour from `start` in direction `sense`: up to `count[1]` houses. */
function walkRow(
  ctx: SiteCtx,
  hb: Harbour,
  stream: readonly XZ[],
  pins: readonly XZ[],
  start: XZ,
  sense: 1 | -1,
): House[] {
  const R = W.row;
  const out: House[] = [];
  let p = onContour(ctx, start, R.offset);
  let misses = 0;
  for (let k = 0; k < 2 * R.count[1] + R.gapSteps && out.length < R.count[1]; k++) {
    const h = houseAt(ctx, hb, stream, pins, p);
    const prev = out[out.length - 1];
    if (h && prev && dist(h, prev) < R.minPitch) {
      // (the coast curves in here: one more stride, not a miss)
    } else if (h) out.push(h);
    else if (out.length === 0 || ++misses > R.gapSteps) break;
    const n = seaward(ctx, p);
    p = onContour(ctx, add(p, { x: -n.z * sense, z: n.x * sense }, R.spacing), R.offset);
  }
  return out;
}

/** Where the stream really meets the old coast (the `streamMouth` anchor lies out in the sea). */
function coastMouth(ctx: SiteCtx, hb: Harbour, stream: readonly XZ[]): XZ {
  for (let k = stream.length - 1; k >= 0; k--) {
    const p = stream[k];
    const i = cellIndex(ctx, p);
    if (hb.before[i] >= 0) return p;
  }
  return hb.isl.anchors.streamMouth ?? hb.root;
}

/**
 * The boathouse row, reserved and published: the best contour walk within `mouthReach` u of the
 * stream mouth, else (no room there) the best within `rootReach` of the pier root.
 */
function planRow(ctx: SiteCtx, hb: Harbour, stream: readonly XZ[], pins: readonly XZ[]): void {
  const R = W.row;
  const { isl } = hb;
  const mouth = coastMouth(ctx, hb, stream);
  const nearOf = (row: readonly House[]): number => Math.min(...row.map((h) => dist(h, mouth)));
  const best = (centre: XZ, reach: number, ok: (row: readonly House[]) => boolean): House[] => {
    const [x0, x1] = gridRange(centre.x - reach, centre.x + reach);
    const [z0, z1] = gridRange(centre.z - reach, centre.z + reach);
    let row: House[] = [];
    let bs = Infinity;
    for (let iz = z0; iz <= z1; iz++)
      for (let ix = x0; ix <= x1; ix++) {
        const i = iz * ctx.n + ix;
        if (ctx.islandMap[i] !== isl.id + 1) continue;
        const s = ctx.sdf[i];
        if (s < 0 || s > 2.5) continue;
        const start = { x: cellX(ix), z: cellZ(iz) };
        if (dist(start, centre) > reach) continue;
        for (const sense of [1, -1] as const) {
          const r = walkRow(ctx, hb, stream, pins, start, sense);
          if (r.length < R.count[0] || !ok(r)) continue;
          const sc =
            R.houseCost * (R.count[1] - r.length) +
            R.mouthCost * nearOf(r) +
            R.rootCost * Math.min(...r.map((h) => dist(h, hb.root)));
          if (sc < bs) {
            bs = sc;
            row = r;
          }
        }
      }
    return row;
  };
  let row = best(mouth, R.mouthReach, (r) => nearOf(r) <= R.mouthReach);
  const atMouth = row.length > 0;
  if (!atMouth) row = best(hb.root, R.rootReach, () => true);
  if (row.length === 0) return;
  row.forEach((h, k) => {
    publish(isl, `boathouse${k}`, h, h.rot, 0);
    addShape(ctx, isl, rectShape(h.x, h.z, h.rot, 2.9, 4.2), true);
  });
  publish(isl, 'boathouseFit', { x: atMouth ? 1 : 0, z: nearOf(row) }, 0);
}

/** The pavilion on the pier's axis (needs water under its whole deck). */
function planPavilion(ctx: SiteCtx, hb: Harbour): void {
  const P = W.pavilion;
  const L = hb.site.segments * DOCK.segment;
  for (let u = Math.max(P.minRoot, L * P.at); u <= L - 2.8; u += 0.5) {
    const c = framePoint(hb, u, 0);
    const pts = [-P.keep, P.keep].flatMap((a) =>
      [-P.keep, P.keep].map((b) => framePoint(hb, u + a, b)),
    );
    if (pts.some((q) => H(ctx, q) > P.maxWaterY)) continue;
    publish(hb.isl, 'wharfPavilion', c, hb.rotY, 0);
    addShape(ctx, hb.isl, rectShape(c.x, c.z, hb.rotY, 2 * P.keep, 2 * P.keep), false);
    return;
  }
}

/** Corner-cut, ends kept: rounds the turn and the mooring's approach. */
function chaikin(pts: readonly XZ[]): XZ[] {
  const out: XZ[] = [pts[0]];
  for (let k = 0; k + 1 < pts.length; k++) {
    const a = pts[k];
    const b = pts[k + 1];
    out.push(
      { x: a.x + (b.x - a.x) * 0.25, z: a.z + (b.z - a.z) * 0.25 },
      { x: a.x + (b.x - a.x) * 0.75, z: a.z + (b.z - a.z) * 0.75 },
    );
  }
  out.push(pts[pts.length - 1]);
  return out;
}

/**
 * The lantern boat's lanes: in by the lane away from the ring's run, round the turn at the back of
 * the basin, past the mooring, out by the other lane, so the ring continues forward; the first shift
 * of the lanes that keeps every sample in clear water wins.
 */
function planLantern(ctx: SiteCtx, hb: Harbour): void {
  const A = W.lantern;
  const { isl } = hb;
  const L = hb.site.segments * DOCK.segment;
  const tip = frameOf(hb, hb.arm[0]);
  const headEnd = hb.P.pier.head.w / 2;
  const v0 = (headEnd + tip.v - hb.arm[0].half) / 2;
  // the ring runs with growing angle round the island: out on the side it heads to
  const toRing = hb.sigma;
  const pier = rectShape(framePoint(hb, L / 2, 0).x, framePoint(hb, L / 2, 0).z, hb.rotY, 1.6, L);
  const head = rectShape(hb.end.x, hb.end.z, hb.rotY, hb.P.pier.head.w, hb.P.pier.head.d);
  const pav = isl.anchors.wharfPavilion;
  const pavShape = pav ? rectShape(pav.x, pav.z, hb.rotY, 6, 6) : null;
  const okAt = (p: XZ): boolean =>
    H(ctx, p) <= -A.minDepth &&
    sdfAt(ctx, p.x, p.z) <= -A.shore &&
    shapeDist(pier, p.x, p.z) >= A.clear &&
    shapeDist(head, p.x, p.z) >= A.clear &&
    (!pavShape || shapeDist(pavShape, p.x, p.z) >= A.clear * 0.3);
  for (const back of A.back)
    for (const sh of A.shift) {
      const vIn = v0 + sh - toRing * A.lane;
      const vOut = v0 + sh + toRing * A.lane;
      const uBack = Math.max(2.5, L - back);
      const raw: XZ[] = [
        framePoint(hb, L + A.sea, vIn),
        framePoint(hb, L + 3, vIn),
        framePoint(hb, uBack + 2.5, vIn),
        framePoint(hb, uBack, (vIn + vOut) / 2),
        framePoint(hb, uBack + 2.5, vOut),
        framePoint(hb, Math.max(L - A.moor, uBack + 3.2), vOut),
        framePoint(hb, L + 3, vOut),
        framePoint(hb, L + A.sea, vOut),
      ];
      const moorIdx = 5;
      const moor = raw[moorIdx];
      const line = chaikin(chaikin(raw));
      let ok = true;
      for (let k = 0; k + 1 < line.length && ok; k++) {
        const n = Math.max(1, Math.ceil(dist(line[k], line[k + 1]) / A.sample));
        for (let j = 0; j <= n && ok; j++)
          ok = okAt({
            x: line[k].x + ((line[k + 1].x - line[k].x) * j) / n,
            z: line[k].z + ((line[k + 1].z - line[k].z) * j) / n,
          });
      }
      if (!ok) continue;
      // the moor point joins the chain exactly (the smoothed line passes near it)
      let m = 0;
      line.forEach((p, k) => {
        if (dist(p, moor) < dist(line[m], moor)) m = k;
      });
      line[m] = moor;
      line.forEach((p, k) => {
        const q = line[Math.min(k + 1, line.length - 1)];
        const o = line[Math.max(k - 1, 0)];
        publish(isl, `lanternLane${k}`, p, ang(q.x - o.x, q.z - o.z), 0);
      });
      publish(isl, 'lanternMoor', moor, hb.rotY, 0);
      return;
    }
}

/** The paint pots down the lagoon, tip end first; the first inset that gives a full line wins. */
function planBuoys(ctx: SiteCtx, hb: Harbour): void {
  const B = W.buoys;
  const { isl } = hb;
  const lanes = anchorPoints(isl, 'lanternLane');
  const pier = rectShape(hb.end.x, hb.end.z, hb.rotY, hb.P.pier.head.w, hb.P.pier.head.d);
  const pick = (inset: number): { p: XZ; rot: number }[] => {
    const out: { p: XZ; rot: number }[] = [];
    const len = armLength(hb);
    for (let s = B.first; s <= len && out.length < B.count[1]; s += B.spacing) {
      const a = armAt(hb, s);
      const p = { x: a.x - a.nx * inset, z: a.z - a.nz * inset };
      if (H(ctx, p) > -B.minDepth || sdfAt(ctx, p.x, p.z) > -B.shore) continue;
      if (lanes.some((q) => dist(q, p) < B.routeClear)) continue;
      if (shapeDist(pier, p.x, p.z) < B.routeClear) continue;
      out.push({ p, rot: ang(-a.nz, a.nx) });
    }
    return out;
  };
  let best: { p: XZ; rot: number }[] = [];
  for (const inset of B.inset) {
    const line = pick(inset);
    if (line.length > best.length) best = line;
    if (best.length >= B.count[1]) break;
  }
  if (best.length < B.count[0]) return;
  best.forEach((b, k) => {
    publish(isl, `paintBuoy${k}`, b.p, b.rot, 0);
    addShape(ctx, isl, rectShape(b.p.x, b.p.z, b.rot, 1, 1), false);
  });
}

/** The wharf's sites (plan time, after the campus and the pier-root kiosks). */
export function planColourWharf(
  ctx: SiteCtx,
  hb: Harbour,
  stream: readonly XZ[],
  pins: readonly XZ[],
): void {
  planPavilion(ctx, hb);
  planLantern(ctx, hb);
  planRow(ctx, hb, stream, pins);
  planBuoys(ctx, hb);
}

/** The wharf's kit on its anchors (finish pass). */
export function placeColourWharfKit(ctx: SiteCtx, hb: Harbour): void {
  const { isl } = hb;
  const fix = (defId: string, p: XZ & { rotY: number }, variant: number): void => {
    ctx.fixtures.push({
      defId,
      x: p.x,
      z: p.z,
      rotY: p.rotY,
      islandId: isl.id,
      variant,
      y: 0,
    });
  };
  anchorPoints(isl, 'boathouse').forEach((a, k) =>
    fix('glasshouse', a, WV.boathouse + (k % WHARF_PASTELS.length)),
  );
  const pav = isl.anchors.wharfPavilion;
  if (pav) fix('conservatory', pav, WV.pavilion);
  anchorPoints(isl, 'paintBuoy').forEach((a, k) => fix('buoy', a, WV.paintPot + (k % 4)));
}
