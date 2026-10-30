/**
 * Research "Tide-Lab" harbour (M31 TASK-532, D-113): the Research instance on the harbour skeleton
 * (harbour.ts). Plan time, right after the skeleton (the campus districts placed after keep off
 * every reserved site); pure data, numbers in content/themes/research-harbour.ts. The only rng is
 * `rng.fork('harbour:city')` (which lattice columns carry the tower tops); nothing is placed: TASK-534
 * puts the TASK-533 kit on the anchors.
 *
 * Anchor contract (world u; rotY = xz heading (cos, sin); `y` = world height; `…Size` = two
 * numbers, not a position):
 * - `tideLab` + `tideLabSize`: the stilt lab's footprint centre over the water (open side of the
 *   ferry pier), rotY = the ferry pier heading (the lab's +z = out to sea), y = 0 (water line);
 *   size { x: width across the pier heading, z: depth along it }. The seabed under it (+ `gap`) is
 *   levelled into `lab.depth` (1.1–1.8 u deep).
 * - `tideLabPier0` / `tideLabPier1`: the lab pier from its root on the coast (y = ground) to the
 *   lab's shore-side edge (y = 0), rotY = heading root → lab.
 * - `subMooring`: the yellow submersible's hull centre in the basin beside the research vessel
 *   (the arm side), rotY = the ferry pier heading, y = 0; ≥ `sub.minDepth` u under the hull.
 * - `subDive`: the dive point seaward of the arm beside the sunken city, ≥ `dive.minDepth` u deep
 *   within `dive.ring` u; rotY = out to sea; y = seabed. Boat routes keep `dive.keepOut` u off.
 * - `tideGauge`: a waterline point on the cove beach (open side), rotY = the pier heading (sea),
 *   y = ground (≈ 0.1–0.5).
 * - `sunkenCity` + `sunkenCitySize`: the plaza centre (main street, middle column with water), rotY = the
 *   main street heading (toward the arm's root), y = its seabed; size { x: city length along the
 *   arm (u), z: lagoon width the rows span }.
 * - `ruinPaving{k}` / `ruinArch{k}` / `ruinColumn{k}` / `ruinTop{k}` (`anchorPoints`): the
 *   city's slots on the levelled seabed (y = seabed, 0.6–1.5 u under the water line), rotY = the
 *   local street heading along the lagoon (an arch spans the main street: its opening faces along
 *   rotY). 2–4 `ruinTop`s: a broken tower / arch top rising above the water there. Every slot
 *   lies in Zone.lagoon water (alpha 0.55), off the boat routes, the ferry approach, the pier and
 *   the basin.
 */
import { RESEARCH_HARBOUR as R } from '../../../content/themes/research-harbour.ts';
import { RESEARCH_SITE as S } from '../../../content/themes/research.ts';
import { DOCK } from '../../../content/settlements.ts';
import type { Rng } from '../../../core/rng.ts';
import { lerp, smoothstep } from '../../../core/math/index.ts';
import { heightAt, Zone, type IslandData, type XZ } from '../../types.ts';
import { forSamplesNearSegment } from '../paths.ts';
import {
  add,
  addShape,
  ang,
  cellOf,
  discShape,
  dist,
  rectShape,
  sdfAt,
  shapeCorners,
  shapeDist,
  type Shape,
  type SiteCtx,
} from '../sites.ts';
import {
  armAt,
  armLength,
  frameOf,
  framePoint,
  harbourParams,
  inApproach,
  type Harbour,
} from './harbour.ts';
import { anchorPoints } from './research-anchors.ts';

/** Ruin slot kinds (anchor chain names). */
export const RUIN_KINDS = ['ruinPaving', 'ruinArch', 'ruinColumn', 'ruinTop'] as const;
export type RuinKind = (typeof RUIN_KINDS)[number];

interface Slot extends XZ {
  kind: RuinKind;
  rot: number;
  /** Lattice column (along the arm) and row (−1 / 0 / +1 across the lagoon, 0 = main street). */
  i: number;
  j: number;
}

/** What the Research plan keeps for its finish pass. */
export interface TideLab {
  hb: Harbour;
  slots: Slot[];
}

const H = (ctx: SiteCtx, p: XZ): number => heightAt(ctx.h, p.x, p.z);

function publish(isl: IslandData, key: string, p: XZ, rotY: number, y?: number): void {
  isl.anchors[key] = y === undefined ? { x: p.x, z: p.z, rotY } : { x: p.x, z: p.z, rotY, y };
}

/** Footprint samples of a rect: centre, corners, edge mids and a coarse interior grid. */
function samples(sh: Shape, pad = 0): XZ[] {
  const out: XZ[] = [];
  const hw = sh.hw + pad;
  const hd = sh.hd + pad;
  for (let a = -2; a <= 2; a++)
    for (let b = -2; b <= 2; b++) {
      const u = (a / 2) * hw;
      const v = (b / 2) * hd;
      out.push({ x: sh.x - u * sh.s + v * sh.c, z: sh.z + u * sh.c + v * sh.s });
    }
  return out;
}

/** Clamp the seabed within `pad` of the rect into [−depth[1], −depth[0]], blended over `fall`. */
function levelUnder(
  ctx: SiteCtx,
  sh: Shape,
  pad: number,
  depth: readonly [number, number],
  fall: number,
): void {
  const reach = Math.hypot(sh.hw, sh.hd) + pad + fall + 1;
  forSamplesNearSegment(ctx.h, sh, sh, reach, (i) => {
    const y0 = ctx.h.data[i];
    if (y0 >= 0 || ctx.sdf[i] > 0) return;
    const p = {
      x: ctx.h.originX + (i % ctx.n) * ctx.h.cellSize,
      z: ctx.h.originZ + Math.floor(i / ctx.n) * ctx.h.cellSize,
    };
    const d = shapeDist(sh, p.x, p.z) - pad;
    const target = Math.min(-depth[0], Math.max(-depth[1], y0));
    const y = lerp(target, y0, smoothstep(0, fall, d));
    ctx.h.data[i] = Math.min(y, -0.05);
  });
}

/** The research vessel's basin slot: alongside the pier on the arm side, short of the T-head. */
export function vesselSlot(hb: Harbour): { p: XZ; rot: number } {
  const V = S.vessel;
  const L = hb.site.segments * DOCK.segment;
  const along = Math.max(
    V.halfLength + 0.5,
    L - hb.P.pier.head.d / 2 - V.halfLength - R.vessel.back,
  );
  return { p: framePoint(hb, along, V.side), rot: hb.rotY };
}

/** R5 stilt lab: the footprint on the open side + its pier back to the coast. */
function placeLab(ctx: SiteCtx, hb: Harbour): Shape | null {
  const L = R.lab;
  const [w, d] = L.size;
  const head = rectShape(hb.end.x, hb.end.z, hb.rotY, hb.P.pier.head.w, hb.P.pier.head.d);
  // cheap filters + score first, the obstacle check on the best candidates only
  const cands: { sh: Shape; score: number }[] = [];
  for (let u = L.u[0]; u <= L.u[1] + 1e-6; u += L.step)
    for (let v = L.v[0]; v <= L.v[1] + 1e-6; v += L.step) {
      const c = framePoint(hb, u, v);
      const sh = rectShape(c.x, c.z, hb.rotY, w, d);
      const pts = samples(sh, L.gap);
      if (pts.some((p) => H(ctx, p) >= -0.05 || sdfAt(ctx, p.x, p.z) > -0.4)) continue;
      if (pts.some((p) => inApproach(hb, p, L.approachGap))) continue;
      if (shapeCorners(sh).some((p) => shapeDist(head, p.x, p.z) < L.headGap)) continue;
      let cost = 0;
      for (const p of samples(sh)) {
        const dep = -H(ctx, p);
        cost += Math.max(0, L.depth[0] - dep) + Math.max(0, dep - L.depth[1]);
      }
      cands.push({ sh, score: cost + 0.3 * dist(c, framePoint(hb, L.pref[0], L.pref[1])) });
    }
  // (stable: equal scores keep the scan order)
  cands.sort((a, b) => a.score - b.score);
  const best =
    cands.find(
      (c) =>
        !ctx.shapes[hb.isl.id].some((o) =>
          samples(c.sh).some((p) => shapeDist(o, p.x, p.z) < L.gap),
        ),
    ) ?? null;
  if (!best) return null;
  const sh = best.sh;
  // the lab pier: from the shore-side edge back to the coast
  const edge = framePoint(hb, frameOf(hb, sh).u - d / 2, frameOf(hb, sh).v);
  let root: XZ | null = null;
  for (let t = 0; t <= 16; t += 0.25) {
    const q = add(edge, hb.u, -t);
    if (H(ctx, q) > 0.15 && sdfAt(ctx, q.x, q.z) > 0.3) {
      root = q;
      break;
    }
  }
  if (!root || dist(root, edge) < L.pierMin) return null;
  // (one grid cell past the gap: bilinear samples on the footprint edge read levelled cells only)
  levelUnder(ctx, sh, L.gap + 2, L.depth, L.fall);
  addShape(ctx, hb.isl, sh, false);
  const mid = { x: (root.x + edge.x) / 2, z: (root.z + edge.z) / 2 };
  addShape(ctx, hb.isl, rectShape(mid.x, mid.z, hb.rotY, L.pierWidth, dist(root, edge)), true);
  publish(hb.isl, 'tideLab', sh, hb.rotY, 0);
  publish(hb.isl, 'tideLabSize', { x: w, z: d }, 0);
  publish(hb.isl, 'tideLabPier0', root, hb.rotY, H(ctx, root));
  publish(hb.isl, 'tideLabPier1', edge, hb.rotY, 0);
  return sh;
}

/** R6 submersible mooring beside the vessel (further into the basin). */
function placeSub(ctx: SiteCtx, hb: Harbour): XZ | null {
  const V = S.vessel;
  const B = R.sub;
  const slot = vesselSlot(hb);
  const fv = frameOf(hb, slot.p);
  const off = V.halfBeam + B.gap + B.halfBeam;
  for (const du of [0, -1, 1, -2, 2, -3]) {
    const p = framePoint(hb, fv.u + du, fv.v + off);
    const sh = rectShape(p.x, p.z, hb.rotY, B.halfBeam * 2, B.halfLength * 2);
    const pts = samples(sh, 0.2);
    if (pts.some((q) => H(ctx, q) > -B.minDepth || sdfAt(ctx, q.x, q.z) > -0.5)) continue;
    if (pts.some((q) => shapeDist(hb.basin, q.x, q.z) > 0.3)) continue;
    addShape(ctx, hb.isl, sh, false);
    publish(hb.isl, 'subMooring', p, hb.rotY, 0);
    return p;
  }
  return null;
}

/** R19 tide gauge at the cove beach's waterline on the open side. */
function placeGauge(ctx: SiteCtx, hb: Harbour): XZ | null {
  const G = R.gauge;
  let best: { p: XZ; d: number } | null = null;
  for (let v = G.v[1]; v >= G.v[0] - 1e-6; v -= 0.5)
    for (let u = -8; u <= 3; u += 0.25) {
      const p = framePoint(hb, u, v);
      const s = sdfAt(ctx, p.x, p.z);
      if (s < G.shore[0] || s > G.shore[1] || H(ctx, p) <= 0.05) continue;
      if (ctx.islandMap[cellOf(ctx, p.x, p.z)] !== hb.isl.id + 1) continue;
      if (ctx.shapes[hb.isl.id].some((o) => shapeDist(o, p.x, p.z) < G.r + G.gap)) continue;
      const d = Math.abs(v - G.pref);
      if (!best || d < best.d) best = { p, d };
    }
  if (!best) return null;
  addShape(ctx, hb.isl, discShape(best.p.x, best.p.z, G.r), true);
  publish(hb.isl, 'tideGauge', best.p, hb.rotY, H(ctx, best.p));
  return best.p;
}

/**
 * The sunken city's lattice along the arm (see the content block): slots in the lagoon water the
 * arm encloses, kinds by street plan, 2–4 tops; the seabed under it levelled. Returns the slots
 * (empty when fewer than `minSlots` fit).
 */
function planCity(ctx: SiteCtx, hb: Harbour, avoid: readonly Shape[], rng: Rng): Slot[] {
  const C = R.city;
  const len = armLength(hb);
  const s0 = C.from;
  const s1 = len - C.endInset;
  if (s1 - s0 < C.pitch * 3) return [];
  const cols = Math.floor((s1 - s0) / C.pitch) + 1;
  interface Pt extends XZ {
    i: number;
    j: number;
    rot: number;
  }
  const pts: Pt[] = [];
  let width = 0;
  for (let i = 0; i < cols; i++) {
    const a = armAt(hb, s0 + i * C.pitch);
    const inward = { x: -a.nx, z: -a.nz };
    const ahead = armAt(hb, Math.min(len, s0 + i * C.pitch + 0.5));
    const back = armAt(hb, Math.max(0, s0 + i * C.pitch - 0.5));
    const rot = ang(ahead.x - back.x, ahead.z - back.z);
    // the lagoon cross-section: the water between the arm land and the coast, trimmed to
    // `armGap` off the arm side and `coastGap` off the coast side
    let w0 = -1;
    let w1 = -1;
    let wet = false;
    for (let t = 0; t <= hb.P.arm.offset + 4; t += 0.25) {
      const q = add(a, inward, t);
      if (H(ctx, q) >= 0) {
        if (wet) break;
        continue;
      }
      wet = true;
      const sd = sdfAt(ctx, q.x, q.z);
      if (w0 < 0 && sd <= -C.armGap) w0 = t;
      if (w0 >= 0 && sd <= -C.coastGap) w1 = t;
    }
    if (w0 < 0 || w1 <= w0) continue;
    const mid = (w0 + w1) / 2;
    width = Math.max(width, w1 - w0);
    for (const j of [-1, 0, 1]) {
      const t = mid + j * C.rowPitch;
      if (t < w0 || t > w1) continue;
      const p = add(a, inward, t);
      const k = cellOf(ctx, p.x, p.z);
      if (k < 0 || ctx.zone[k] !== Zone.lagoon || H(ctx, p) >= 0) continue;
      if (inApproach(hb, p, C.siteGap)) continue;
      if (avoid.some((o) => shapeDist(o, p.x, p.z) < C.siteGap)) continue;
      pts.push({ x: p.x, z: p.z, i, j, rot });
    }
  }
  // the plaza column: the middle of the columns that found water
  const present = [...new Set(pts.map((p) => p.i))];
  const ic = present.length > 0 ? present[Math.floor((present.length - 1) / 2)] : 0;
  const cross = (i: number): boolean => (i - ic) % C.crossEvery === 0;
  const slots: Slot[] = pts.map((p) => {
    const plaza = Math.abs(p.i - ic) <= C.plaza;
    const kind: RuinKind =
      p.j === 0 && cross(p.i) && p.i !== ic
        ? 'ruinArch'
        : p.j === 0 || cross(p.i) || plaza
          ? 'ruinPaving'
          : 'ruinColumn';
    return { x: p.x, z: p.z, kind, rot: p.rot, i: p.i, j: p.j };
  });
  if (slots.length < C.minSlots) return [];
  // the tops: columns (or arches) picked on the city fork, `topsApart` apart
  const cr = rng.fork('city');
  const want = cr.int(C.tops[0], C.tops[1]);
  const columns = slots.filter((s) => s.kind === 'ruinColumn' || s.kind === 'ruinArch');
  cr.shuffle(columns);
  const tops: Slot[] = [];
  for (const s of columns) {
    if (tops.length >= want) break;
    if (tops.some((t) => dist(t, s) < C.topsApart)) continue;
    tops.push(s);
  }
  if (tops.length < C.tops[0]) return [];
  for (const t of tops) t.kind = 'ruinTop';
  // the seabed: levelled under the slots, blended out
  const target = new Map<number, { y: number; d: number }>();
  for (const s of slots) {
    const y = s.kind === 'ruinPaving' || s.kind === 'ruinArch' ? -C.street : -C.block;
    forSamplesNearSegment(ctx.h, s, s, C.cellR + C.blend, (i, d) => {
      const o = target.get(i);
      if (!o || d < o.d) target.set(i, { y, d });
    });
  }
  for (const i of [...target.keys()].sort((a, b) => a - b)) {
    const y0 = ctx.h.data[i];
    if (y0 >= 0 || ctx.sdf[i] > 0) continue;
    const { y, d } = target.get(i) as { y: number; d: number };
    const v = lerp(y, y0, smoothstep(C.cellR, C.cellR + C.blend, d));
    ctx.h.data[i] = Math.min(v, d <= C.cellR ? -C.minDepth : -0.05);
  }
  for (const s of slots) addShape(ctx, hb.isl, discShape(s.x, s.z, 0.9), false);
  const ctr = cityMid(slots);
  const centre =
    slots.find((s) => s.i === ic && s.j === 0) ??
    slots.reduce((b, s) => (dist(s, ctr) < dist(b, ctr) ? s : b), slots[0]);
  publish(hb.isl, 'sunkenCity', centre, centre.rot, H(ctx, centre));
  publish(hb.isl, 'sunkenCitySize', { x: (cols - 1) * C.pitch, z: width }, 0);
  const count = new Map<RuinKind, number>();
  for (const s of slots) {
    const k = count.get(s.kind) ?? 0;
    count.set(s.kind, k + 1);
    publish(hb.isl, `${s.kind}${k}`, s, s.rot, H(ctx, s));
  }
  return slots;
}

const cityMid = (slots: readonly XZ[]): XZ => ({
  x: slots.reduce((a, s) => a + s.x, 0) / slots.length,
  z: slots.reduce((a, s) => a + s.z, 0) / slots.length,
});

/** R6 dive point: seaward of the arm beside the city, over deep water, off the ferry's way. */
function placeDive(ctx: SiteCtx, hb: Harbour, city: readonly XZ[]): XZ | null {
  const D = R.dive;
  const len = armLength(hb);
  const centre = city.length > 0 ? cityMid(city) : armAt(hb, len / 2);
  let best: { p: XZ; d: number } | null = null;
  for (let s = 0; s <= len + 1e-6; s += 1) {
    const a = armAt(hb, s);
    for (let t = D.out[0]; t <= D.out[1] + 1e-6; t += 1) {
      const p = { x: a.x + a.nx * t, z: a.z + a.nz * t };
      if (sdfAt(ctx, p.x, p.z) > -D.shore) continue;
      if (dist(p, hb.berth) < D.berthGap || inApproach(hb, p, D.ring + 2)) continue;
      let ok = H(ctx, p) <= -D.minDepth;
      for (let k = 0; k < 8 && ok; k++) {
        const q = { x: p.x + Math.cos(k * 0.785) * D.ring, z: p.z + Math.sin(k * 0.785) * D.ring };
        if (H(ctx, q) > -D.minDepth) ok = false;
      }
      if (!ok) continue;
      const d = dist(p, centre);
      if (!best || d < best.d) best = { p, d };
    }
  }
  if (!best) return null;
  addShape(ctx, hb.isl, discShape(best.p.x, best.p.z, D.ring), false);
  const a = best.p;
  publish(hb.isl, 'subDive', a, ang(a.x - centre.x, a.z - centre.z), H(ctx, a));
  return a;
}

/**
 * Plan time, right after the skeleton and the vessel: the lab, the sub mooring, the tide gauge,
 * the sunken city and the dive point.
 */
export function planTideLab(ctx: SiteCtx, hb: Harbour, rng: Rng): TideLab {
  const lab = placeLab(ctx, hb);
  placeSub(ctx, hb);
  placeGauge(ctx, hb);
  const pier = rectShape(
    (hb.root.x + hb.end.x) / 2,
    (hb.root.z + hb.end.z) / 2,
    hb.rotY,
    hb.P.pier.sideClear * 2,
    dist(hb.root, hb.end),
  );
  const avoid = [hb.basin, pier, ...(lab ? [lab] : [])];
  const slots = planCity(ctx, hb, avoid, rng.fork('harbour'));
  placeDive(ctx, hb, slots);
  return { hb, slots };
}

/** Finish (final ground): the anchors' heights re-read. */
export function finishTideLab(ctx: SiteCtx, t: TideLab): void {
  const isl = t.hb.isl;
  for (const key of ['tideLabPier0', 'tideGauge', 'subDive', 'sunkenCity']) {
    const a = isl.anchors[key];
    if (a) publish(isl, key, a, a.rotY, H(ctx, a));
  }
  for (const kind of RUIN_KINDS)
    anchorPoints(isl, kind).forEach((p, k) => publish(isl, `${kind}${k}`, p, p.rotY, H(ctx, p)));
}

/**
 * Boat-route / seamark keep-out discs round the Tide-Lab sites (world/index.ts): every ruin slot
 * (`city.keepOut`), the lab footprint (+ `lab.keepOut`) and the dive point (`dive.keepOut`).
 */
export function tideLabKeepOut(
  islands: readonly IslandData[],
): { x: number; z: number; r: number; hard: number }[] {
  const out: { x: number; z: number; r: number; hard: number }[] = [];
  for (const isl of islands) {
    const hard = harbourParams(isl.theme)?.keepOut.hard ?? 0;
    for (const kind of RUIN_KINDS)
      for (const p of anchorPoints(isl, kind))
        out.push({ x: p.x, z: p.z, r: R.city.keepOut, hard });
    const lab = isl.anchors.tideLab;
    const size = isl.anchors.tideLabSize;
    if (lab && size)
      out.push({ x: lab.x, z: lab.z, r: Math.hypot(size.x, size.z) / 2 + R.lab.keepOut, hard });
    const dive = isl.anchors.subDive;
    if (dive) out.push({ x: dive.x, z: dive.z, r: R.dive.keepOut, hard });
  }
  return out;
}
