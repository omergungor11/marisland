/**
 * "Horseshoe Harbour" (M52 TASK-661, D-170; moved from Marketing to HQ by TASK-666, D-171): the
 * marina town round a round basin beside the HQ ferry pier in the cove. Pure data, no rng.
 * `planMarina` (hq.ts) runs on the cove dock: it runs the pier out to a T-head (HARBOURS.hq), keeps
 * the berth and publishes the harbour skeleton's anchors, and returns a `Harbour` whose arm is the
 * light mole, so `finishHarbour` lays the T-head kit and the light on it unchanged; null = HQ's
 * plain pier and the M29 comb marina (world/gen/marina.ts). The star fort and the channel gates are
 * the post-route stage's (marina.ts), which keeps the fort off the ring and its mouth.
 * Numbers: content/themes/hq-horseshoe-site.ts; pieces: MARINA_KIT (content/themes/hq-horseshoe.ts).
 *
 * 1. Fit: a basin centre on a grid in the pier frame (both sides of the pier), a mouth heading and
 *    a basin radius per tier; the ring = an arc of the centre-line circle (radius basinR + width/2)
 *    from the light mole's head (the pier side) round the back to the tower mole's head, `width` u
 *    wide, round caps on the heads, `mouth` u between them. Rejected where it would cut high land,
 *    fill from too deep, touch another body or a reserved site, crowd the pier / T-head / the ferry
 *    approach, hold land in the basin, open its mouth onto anything but sea, or hang off the coast.
 *    Tiers: full ring (largest basin first) → the tower mole shortened → none.
 * 2. Ground: the ring is land of this island at `deckY` (fill and cut; the deck runs `edgeFlat` u
 *    past the outer edge so house backs stand level, the bluff rises behind it), its sea flank falls
 *    to the bed over `flank` u, the basin is dredged to `basin.depth` (a sheer stone face), the mouth
 *    blends out; shore SDF and water zones re-derived (exact EDT, `waterBandZone`), the basin water
 *    Zone.lagoon; the deck is painted Zone.plaza, the moles' sea faces Zone.rock (`finishMarina`).
 * 3. Town (reserved at plan time, placed on the final ground in `finishMarina`): house rows on the
 *    ring's outer part (main row on the back arc with alleys, a row down each mole), fronts to the
 *    basin; a terrace on the quay edge before every restaurant / café / gelato house; stalls before
 *    other houses; boats moored stern-to round the basin edge plus finger pontoons with a boat each
 *    side; the round tower on the tower mole's head (the harbour light: `finishHarbour` on the light
 *    mole's head); lanterns at house joints and a bollard behind every stern line.
 *
 * Anchor contract (world u; rotY = xz heading (cos, sin); `y` = world height on the final ground;
 * `…Size` = two numbers). Missing when the seed has no marina (plans-hq-horseshoe.test fit table).
 * - `marinaBasin` + `marinaBasinSize`: basin centre (y 0), rotY = the mouth heading; size { x, z } =
 *   the basin diameter (the deck's inner edge).
 * - `marinaMouth`: mid-mouth between the mole heads on the water (y 0), rotY = out to sea.
 * - `marinaQuay0..K`: the ring's centre line every ≈ `quayStep` u, 0 = the light mole's head →
 *   round the back → the tower mole's head; rotY = heading toward the next point; y = deck.
 *   `marinaQuaySize` = { x: ring width, z: deck height }.
 * - `marinaTower`: the tower's pivot on the tower mole's head, rotY = its front (to the basin centre).
 * - `marinaHouse0..N`: house pivots (ring order), rotY = front (to the basin centre).
 *   `marinaHouseKind0..N` = { x: its MARINA_KIT.house index (0 seafood restaurant … 5 chandlery),
 *   z: the `marinaTerrace` index in front of it (−1 none), rotY 0 } (numbers, not a position).
 * - `marinaTerrace0..M`: terrace pivots on the quay edge (ring order), rotY = front (to the water).
 * - `marinaBerth0..B`: moored boats (ring order; pontoon boats included), y 0, rotY = bow heading.
 * - `marinaPontoon0..P`: pontoon segment pivots, y 0, rotY = along the run (toward the basin centre).
 * The skeleton anchors keep their meaning: `harbourPier0/1`, `harbourHeadSize`, `ferryBerth`,
 * `harbourBasin(Size)` (= the square inside the marina basin, rotY = pier heading), `harbourArm0..K`
 * (the light mole's centre line, 0 = its head → the back arc) and `harbourLight` (on its head).
 */
import { MARINA_KIT, type KitRef } from '../../../content/themes/hq-horseshoe.ts';
import { MARINA_SITE as M } from '../../../content/themes/hq-horseshoe-site.ts';
import { DOCK, PATHS } from '../../../content/settlements.ts';
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

const TAU = Math.PI * 2;
const DEG = Math.PI / 180;

/** The ring's geometry. Local angle `a` runs from the mouth axis toward the light (pier) side. */
interface Ring {
  C: XZ;
  /** Mouth heading (world angle) and the side sign: world angle = phi + ps · a. */
  phi: number;
  ps: 1 | -1;
  Rb: number;
  Rc: number;
  W: number;
  /** Local angles of the light / tower cap centres (the ring covers a ∈ [aL, 2π − aT]). */
  aL: number;
  aT: number;
}

/** Where a sample lies relative to the ring. */
interface Where {
  /** Distance to the deck (≤ 0 inside). */
  d: number;
  r: number;
  a: number;
  inArc: boolean;
}

/** One placed piece (anchors and fixtures follow these, ring order). */
interface Piece {
  kit: KitRef;
  p: XZ;
  rot: number;
  /** Houses: MARINA_KIT.house index, and the index of the terrace in front (−1: none). */
  kind?: number;
  terrace?: number;
}

/** The planned marina town. */
export interface Marina {
  hb: Harbour;
  g: Ring;
  tier: 'full' | 'short';
  houses: Piece[];
  terraces: Piece[];
  stalls: Piece[];
  boats: Piece[];
  pontoons: Piece[];
  tower: Piece | null;
  lanterns: XZ[];
  bollards: { p: XZ; rot: number }[];
  /** Alley backs: where the lanes up the bluff start (the plan links them to the network). */
  alleys: XZ[];
  /** Grid samples of the deck / the basin (zones painted on the final ground). */
  deck: number[];
  basin: number[];
}

const wrap = (a: number): number => {
  const t = a % TAU;
  return t < 0 ? t + TAU : t;
};
const sTot = (g: Ring): number => (TAU - g.aL - g.aT) * g.Rc;
/** World point at local angle `a`, radius `r`. */
const at = (g: Ring, a: number, r: number): XZ => {
  const w = g.phi + g.ps * a;
  return { x: g.C.x + dm.cos(w) * r, z: g.C.z + dm.sin(w) * r };
};
const capL = (g: Ring): XZ => at(g, g.aL, g.Rc);
const capT = (g: Ring): XZ => at(g, TAU - g.aT, g.Rc);
/** Facing from `p` to the basin centre. */
const toCentre = (g: Ring, p: XZ): number => ang(g.C.x - p.x, g.C.z - p.z);

function where(g: Ring, p: XZ): Where {
  const dx = p.x - g.C.x;
  const dz = p.z - g.C.z;
  const r = Math.hypot(dx, dz);
  const a = wrap(g.ps * (dm.atan2(dz, dx) - g.phi));
  const W2 = g.W / 2;
  if (a >= g.aL && a <= TAU - g.aT) {
    const s = (a - g.aL) * g.Rc;
    const t = smoothstep(0, M.ring.taper, Math.min(s, sTot(g) - s));
    const d = Math.max(g.Rb - M.ring.innerFlat * t - r, r - (g.Rc + W2 + M.ring.edgeFlat * t));
    return { d, r, a, inArc: true };
  }
  const d = Math.min(dist(p, capL(g)), dist(p, capT(g))) - W2;
  return { d, r, a, inArc: false };
}

/** Basin water: off the deck inside the centre-line circle (the mouth sector included). */
const inBasin = (g: Ring, w: Where): boolean => w.d > 0 && w.r < g.Rc;

/** Pier geometry the ring keeps off (frame: `u` out along the pier, `v` across). */
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
  // land keeps the pier leaving the shore (DOCK.awayRate at every segment end, + `awayPad`)
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

/** Cells of the window round `c` within `gap` u of this island's reserved shapes / lanes (or other land). */
function masks(ctx: SiteCtx, isl: IslandData, c: XZ, R: number) {
  const [x0, x1] = gridRange(c.x - R, c.x + R);
  const [z0, z1] = gridRange(c.z - R, c.z + R);
  const reserved = new Uint8Array(ctx.n * ctx.n);
  const other = new Uint8Array(ctx.n * ctx.n);
  const gap = M.fit.reserveGap;
  for (const sh of ctx.shapes[isl.id]) {
    const sr = (sh.r > 0 ? sh.r : Math.hypot(sh.hw, sh.hd)) + gap + 1;
    const [a0, a1] = gridRange(Math.max(c.x - R, sh.x - sr), Math.min(c.x + R, sh.x + sr));
    const [b0, b1] = gridRange(Math.max(c.z - R, sh.z - sr), Math.min(c.z + R, sh.z + sr));
    for (let iz = b0; iz <= b1; iz++)
      for (let ix = a0; ix <= a1; ix++)
        if (shapeDist(sh, cellX(ix), cellZ(iz)) <= gap) reserved[iz * ctx.n + ix] = 1;
  }
  const lr = PATHS.halfWidth + gap;
  for (const lane of ctx.lanes[isl.id])
    for (const p of lane) {
      const [a0, a1] = gridRange(p.x - lr, p.x + lr);
      const [b0, b1] = gridRange(p.z - lr, p.z + lr);
      for (let iz = b0; iz <= b1; iz++)
        for (let ix = a0; ix <= a1; ix++)
          if (Math.hypot(cellX(ix) - p.x, cellZ(iz) - p.z) <= lr) reserved[iz * ctx.n + ix] = 1;
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
  return { reserved, other };
}

/** Outer reach of the ground the ring touches (deck, flank, mouth blend). */
const reach = (g: Ring): number => g.Rc + g.W / 2 + M.ring.edgeFlat + M.ring.flank + 1;

/**
 * Fit score of a ring (lower is better), Infinity when it breaks a rule or cannot beat `cap` (the
 * best so far: fill and cut only add, so the cheap mouth / attach tests run first and the cell walk
 * stops once the running score reaches it; the pick is the same as a full walk).
 */
function score(
  ctx: SiteCtx,
  isl: IslandData,
  f: PierFrame,
  g: Ring,
  mk: { reserved: Uint8Array; other: Uint8Array },
  cap: number,
): number {
  const F = M.fit;
  const deckY = M.ring.deckY;
  const own = isl.id + 1;
  // the mouth opens on the sea
  const a = capL(g);
  const b = capT(g);
  const mc = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
  const md = { x: dm.cos(mouthHeading(g)), z: dm.sin(mouthHeading(g)) };
  for (let t = 0; t <= F.mouthLen + 1e-6; t += 2) {
    const q = add(mc, md, t);
    if (heightAt(ctx.h, q.x, q.z) > -F.mouthDepth) return Infinity;
    if (nearPier(f, q, -1.5, false)) return Infinity;
  }
  const s0 = sampleGrid(ctx.h, ctx.sdf, mc.x, mc.z, -999);
  const q = add(mc, md, F.mouthLen);
  if (sampleGrid(ctx.h, ctx.sdf, q.x, q.z, -999) > s0 - 3) return Infinity;
  // the back arc leans on the island
  const mid = (g.aL + TAU - g.aT) / 2;
  const B = M.house.backDeg * DEG;
  let hit = 0;
  let cnt = 0;
  for (let t = mid - B; t <= mid + B + 1e-6; t += 2 / g.Rc) {
    cnt++;
    for (let e = 0; e <= F.attachSdf + 1e-6; e += 1) {
      const p = at(g, t, g.Rc + g.W / 2 + M.ring.edgeFlat + e);
      if (sampleGrid(ctx.h, ctx.sdf, p.x, p.z, -999) > 0) {
        hit++;
        break;
      }
    }
  }
  const attach = hit / Math.max(1, cnt);
  if (attach < F.backAttach) return Infinity;
  const base = F.distW * dist(g.C, f.root) - F.attachW * attach;
  if (base >= cap) return Infinity;
  // the ground the ring takes
  const R = reach(g);
  const [x0, x1] = gridRange(g.C.x - R, g.C.x + R);
  const [z0, z1] = gridRange(g.C.z - R, g.C.z + R);
  let fill = 0;
  let cut = 0;
  for (let iz = z0; iz <= z1; iz++)
    for (let ix = x0; ix <= x1; ix++) {
      const i = iz * ctx.n + ix;
      const p = { x: cellX(ix), z: cellZ(iz) };
      const w = where(g, p);
      if (w.d > M.ring.flank) continue;
      const h0 = ctx.h.data[i];
      const m = ctx.islandMap[i];
      if ((m !== 0 && m !== own) || mk.other[i]) return Infinity;
      if (w.d <= 0) {
        if (h0 > deckY + F.maxCut || h0 < -F.maxFill || mk.reserved[i]) return Infinity;
        // the ring stays on its side of the pier
        if ((p.x - f.root.x) * f.v.x + (p.z - f.root.z) * f.v.z < 1) return Infinity;
        if (nearPier(f, p, 0)) return Infinity;
        fill += Math.max(0, deckY - h0);
        cut += Math.max(0, h0 - deckY);
        if (base + fill + F.cutW * cut >= cap) return Infinity;
      } else if (inBasin(g, w)) {
        if (h0 > F.basinLand || (mk.reserved[i] && h0 > 0)) return Infinity;
        cut += Math.max(0, h0 + M.basin.depth) * 0.25;
        if (base + fill + F.cutW * cut >= cap) return Infinity;
      } else if (h0 < deckY && w.d < 1 && nearPier(f, p, -1)) return Infinity;
    }
  return fill + F.cutW * cut + base;
}

/** Mouth heading (world): the bisector between the caps, out of the basin. */
const mouthHeading = (g: Ring): number => g.phi + (g.ps * (g.aT - g.aL)) / 2;

/** Ring with radius `Rb`, centre `C`, mouth `phi`; `short` = tower mole shortened. */
function makeRing(C: XZ, phi: number, ps: 1 | -1, Rb: number, short: boolean): Ring {
  const W = M.ring.width;
  const Rc = Rb + W / 2;
  const sh = Math.min(1, (M.ring.mouth + W) / (2 * Rc));
  const half = dm.atan2(sh, Math.sqrt(1 - sh * sh));
  return { C, phi, ps, Rb, Rc, W, aL: half, aT: half + (short ? M.ring.short / Rc : 0) };
}

/** Best ring per tier on either side of the pier; null when none fits. */
function fit(
  ctx: SiteCtx,
  isl: IslandData,
  site: DockSite,
  L: number,
): { g: Ring; f: PierFrame; sigma: 1 | -1; tier: Marina['tier'] } | null {
  const F = M.fit;
  const P = harbourParams(isl.theme);
  if (!P) return null;
  const u = site.dir;
  const end = add(site.root, u, L);
  const rotY = ang(u.x, u.z);
  const head = rectShape(end.x, end.z, rotY, P.pier.head.w, P.pier.head.d);
  const Rmax = Math.max(...M.ring.basinR) + M.ring.width + M.ring.edgeFlat + M.ring.flank;
  const mk = masks(ctx, isl, site.root, F.u[1] + F.v[1] + 2 * Rmax + 4);
  const tiers: { Rb: number; short: boolean; tier: Marina['tier'] }[] = [
    ...M.ring.basinR.map((Rb) => ({ Rb, short: false, tier: 'full' as const })),
    ...M.ring.basinR.map((Rb) => ({ Rb, short: true, tier: 'short' as const })),
  ];
  for (const T of tiers) {
    let best: { g: Ring; f: PierFrame; sigma: 1 | -1; s: number } | null = null;
    for (const sigma of [1, -1] as const) {
      const v = { x: -u.z * sigma, z: u.x * sigma };
      const f: PierFrame = { root: site.root, u, v, L, end, head, P };
      for (let cu = F.u[0]; cu <= F.u[1] + 1e-6; cu += F.step)
        for (let cv = F.v[0]; cv <= F.v[1] + 1e-6; cv += F.step) {
          const C = add(add(site.root, u, cu), v, T.Rb + cv);
          if (heightAt(ctx.h, C.x, C.z) > F.basinLand) continue;
          for (const md of F.mouthDeg) {
            const dir = add(
              { x: u.x * dm.cos(md * DEG), z: u.z * dm.cos(md * DEG) },
              v,
              dm.sin(md * DEG),
            );
            const phi = ang(dir.x, dir.z);
            // the light (pier) side: the side of the mouth axis the pier root lies on
            const side = (site.root.x - C.x) * -dir.z + (site.root.z - C.z) * dir.x;
            const ps: 1 | -1 = side >= 0 ? 1 : -1;
            const g = makeRing(C, phi, ps, T.Rb, T.short);
            const s = score(ctx, isl, f, g, mk, best?.s ?? Infinity);

            if (s < (best?.s ?? Infinity)) best = { g, f, sigma, s };
          }
        }
    }
    if (best) return { g: best.g, f: best.f, sigma: best.sigma, tier: T.tier };
  }
  return null;
}

/** Raise the ring, dredge the basin and the mouth; returns the new land and the deck / basin samples. */
function shapeGround(ctx: SiteCtx, isl: IslandData, g: Ring) {
  const deckY = M.ring.deckY;
  const R = reach(g) + M.basin.mouthFall;
  const [x0, x1] = gridRange(g.C.x - R, g.C.x + R);
  const [z0, z1] = gridRange(g.C.z - R, g.C.z + R);
  const land: number[] = [];
  const deck: number[] = [];
  const basin: number[] = [];
  for (let iz = z0; iz <= z1; iz++)
    for (let ix = x0; ix <= x1; ix++) {
      const i = iz * ctx.n + ix;
      const p = { x: cellX(ix), z: cellZ(iz) };
      const w = where(g, p);
      const h0 = ctx.h.data[i];
      let y = h0;
      if (w.d <= 0) {
        y = deckY;
        deck.push(i);
      } else if (inBasin(g, w)) {
        // the quay face: a linear ramp over `face` u from the deck's edge, so the waterline follows
        // the circle between grid samples instead of stepping with them
        y = Math.min(h0, -M.basin.depth);
        if (w.inArc && w.d < M.ring.face) y = lerp(deckY, -M.basin.depth, w.d / M.ring.face);
        basin.push(i);
      } else {
        if (!w.inArc && w.r < g.Rc + M.basin.mouthFall && h0 <= 0)
          y = Math.min(
            h0,
            lerp(-M.basin.depth, h0, smoothstep(g.Rc, g.Rc + M.basin.mouthFall, w.r)),
          );
        if (w.d <= M.ring.flank && h0 < deckY)
          y = Math.max(y, lerp(deckY, h0, smoothstep(0, M.ring.flank, w.d)));
      }
      if (y === h0) continue;
      ctx.h.data[i] = y;
      if (y > 0 && h0 <= 0) {
        ctx.islandMap[i] = isl.id + 1;
        land.push(i);
      } else if (y <= 0 && h0 > 0) ctx.islandMap[i] = 0;
    }
  return { land, deck, basin };
}

/**
 * Footprint level on the deck: centre, corners and edge mids within `tol` of `deckY`, on the island;
 * `edge`: a piece on the quay edge, only its centre and back half (its front is over the face).
 */
function level(ctx: SiteCtx, isl: IslandData, sh: Shape, tol: number, edge = false): boolean {
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
  return pts.every(
    (p) =>
      onIsland(ctx, isl, p.x, p.z) && Math.abs(heightAt(ctx.h, p.x, p.z) - M.ring.deckY) <= tol,
  );
}

/** Kit piece variant `k` of a cycle, any integer index. */
const cyc = <T>(list: readonly T[], k: number): T =>
  list[((k % list.length) + list.length) % list.length];

/**
 * Plan the marina on the island's cove dock `site`; null when no ring fits (the caller keeps its
 * plain pier). Reserves the town; `finishMarina` places it on the final ground. `laid`: the pier is
 * already placed with this many segments (HQ: the T-head goes on its end, no run-out).
 */
export function planMarina(
  ctx: SiteCtx,
  isl: IslandData,
  site: DockSite | null,
  laid?: number,
): Marina | null {
  const P = harbourParams(isl.theme);
  if (!P || !site) return null;
  // (the skeleton's run-out, capped at `pier.segments` the way its re-check after the arm does; no
  // DOCK.awayRate re-check: the ring keeps `fit.pierGap` off the whole pier instead, its tower mole
  // would otherwise shorten it to the stub)
  const segments = laid ?? Math.min(P.pier.segments, pierSegments(ctx, P, site));
  if (segments < P.pier.minSegments) return null;
  const L = segments * DOCK.segment;
  const pick = fit(ctx, isl, site, L);
  if (!pick) return null;
  const { g, f, sigma, tier } = pick;
  const before = ctx.sdf.slice();
  const ground = shapeGround(ctx, isl, g);
  refreshCoast(ctx, ground.land);
  for (const i of ground.basin) if (ctx.h.data[i] < 0) ctx.zone[i] = Zone.lagoon;
  const u = site.dir;
  const rotY = ang(u.x, u.z);
  // the light mole's centre line (head → the back arc) is the skeleton's arm
  const mid = (g.aL + TAU - g.aT) / 2;
  const B = M.house.backDeg * DEG;
  const arm: ArmPoint[] = [];
  for (let a = g.aL; a <= mid - B + 1e-6; a += 1 / g.Rc) {
    const p = at(g, a, g.Rc);
    const n = { x: (p.x - g.C.x) / g.Rc, z: (p.z - g.C.z) / g.Rc };
    arm.push({ x: p.x, z: p.z, s: (a - g.aL) * g.Rc, nx: n.x, nz: n.z, half: g.W / 2 });
  }
  const end = add(site.root, u, segments * DOCK.segment);
  const side = Math.SQRT2 * g.Rb;
  const hb: Harbour = {
    isl,
    P,
    root: site.root,
    u,
    v: f.v,
    sigma,
    rotY,
    site: { ...site, segments },
    end,
    berth: add(end, u, P.berth.out),
    arm,
    bend: arm.length - 1,
    land: [],
    before,
    basin: rectShape(g.C.x, g.C.z, rotY, side, side),
  };
  const mr: Marina = {
    hb,
    g,
    tier,
    houses: [],
    terraces: [],
    stalls: [],
    boats: [],
    pontoons: [],
    tower: null,
    lanterns: [],
    bollards: [],
    alleys: [],
    deck: ground.deck,
    basin: ground.basin,
  };
  layTown(ctx, isl, mr);
  // the T-head and the berth stay free of other sites; the skeleton anchors (y: finishHarbour)
  addShape(ctx, isl, rectShape(end.x, end.z, rotY, P.pier.head.w, P.pier.head.d), false);
  const pub = (key: string, p: XZ, r: number): void => {
    isl.anchors[key] = { x: p.x, z: p.z, rotY: r };
  };
  pub('harbourPier0', site.root, rotY);
  pub('harbourPier1', end, rotY);
  pub('harbourHeadSize', { x: P.pier.head.w, z: P.pier.head.d }, 0);
  pub('ferryBerth', hb.berth, rotY);
  pub('harbourBasin', g.C, rotY);
  pub('harbourBasinSize', { x: side, z: side }, 0);
  return mr;
}

/** Houses, terraces, stalls, lanterns, boats, pontoons and the tower; every footprint reserved. */
function layTown(ctx: SiteCtx, isl: IslandData, mr: Marina): void {
  const { g } = mr;
  const H = M.house;
  const kitD = Math.max(...MARINA_KIT.house.map((k) => k.d));
  const rH = g.Rc + g.W / 2 - H.backInset - kitD / 2;
  const rF = rH - kitD / 2;
  const mid = (g.aL + TAU - g.aT) / 2;
  const B = H.mainDeg * DEG;
  const lo = g.aL + H.headKeep / g.Rc;
  const hi = TAU - g.aT - H.headKeep / g.Rc;
  const alleyA = H.alley / rF;
  const gapA = H.gap / rF;
  const houseAt = (k: number): KitRef => cyc(MARINA_KIT.house, cyc(H.cycle, k));
  type Slot = { a: number; k: number; alleyAfter?: boolean };
  // main row: the most houses (≤ mainMax) with `alleys` alleys that fit the back arc, centred
  const main: Slot[] = [];
  for (let n = H.mainMax; n >= 1 && main.length === 0; n--) {
    const cuts = Array.from({ length: H.alleys }, (_, j) =>
      Math.round(((j + 1) * n) / (H.alleys + 1)),
    );
    let len = 0;
    for (let k = 0; k < n; k++) {
      len += houseAt(k).w / rF + (k > 0 ? gapA : 0);
      if (cuts.includes(k) && k > 0) len += alleyA - gapA;
    }
    if (len > 2 * B) continue;
    let a = mid - len / 2;
    for (let k = 0; k < n; k++) {
      if (k > 0) a += cuts.includes(k) ? alleyA : gapA;
      const w = houseAt(k).w / rF;
      main.push({ a: a + w / 2, k });
      a += w;
    }
    cuts.forEach((c) => {
      if (c > 0 && c < n) main[c - 1].alleyAfter = true;
    });
  }
  // mole rows from the main row's ends toward the heads, past an alley at each root
  const mole = (dir: 1 | -1): Slot[] => {
    const out: Slot[] = [];
    const first = dir > 0 ? main[main.length - 1] : main[0];
    let k = first ? first.k + dir : 0;
    let edge = first ? first.a + (dir * houseAt(first.k).w) / rF / 2 + dir * alleyA : mid + dir * B;
    for (let j = 0; j < H.moleMax; j++, k += dir) {
      const w = houseAt(k).w / rF;
      const c = edge + (dir * w) / 2;
      const far = edge + dir * w;
      if (dir > 0 ? far > hi : far < lo) break;
      out.push({ a: c, k });
      edge = far + dir * gapA;
    }
    return out;
  };
  const light = mole(-1).reverse();
  const tower = mole(1);
  if (light.length > 0) light[light.length - 1].alleyAfter = true;
  if (main.length > 0 && tower.length > 0) main[main.length - 1].alleyAfter = true;
  const slots = [...light, ...main, ...tower];
  // place: level deck, clear; a house that does not fit leaves its gap
  const kept: { s: Slot; kit: KitRef; p: XZ; rot: number }[] = [];
  for (const s of slots) {
    const kit = houseAt(s.k);
    const r = g.Rc + g.W / 2 - H.backInset - kit.d / 2;
    const p = at(g, s.a, r);
    const rot = toCentre(g, p);
    const sh = rectShape(p.x, p.z, rot, kit.w, kit.d);
    if (!level(ctx, isl, sh, H.maxRelief) || !clear(ctx, isl, sh, 0.2)) continue;
    addShape(ctx, isl, sh, true);
    kept.push({ s, kit, p, rot });
  }
  mr.houses = kept.map(({ s, kit, p, rot }) => ({
    kit,
    p,
    rot,
    kind: cyc(H.cycle, s.k) % MARINA_KIT.house.length,
    terrace: -1,
  }));
  // alley backs (lanes up the bluff): after the flagged houses, mid-gap
  for (let j = 0; j < kept.length; j++) {
    const { s, kit } = kept[j];
    if (!s.alleyAfter) continue;
    const a = s.a + kit.w / rF / 2 + alleyA / 2;
    if (a < mid - B - alleyA || a > mid + B + alleyA) continue;
    mr.alleys.push(at(g, a, g.Rc + g.W / 2 - 0.6));
  }
  // terraces before restaurants, stalls before other houses, lanterns at joints
  let stalls = 0;
  const T = M.terrace;
  const order = [...kept].sort(
    (x, y) => Math.abs(x.s.a - mid) - Math.abs(y.s.a - mid) || x.s.a - y.s.a,
  );
  const stallOf = new Set<number>();
  for (const h of order) {
    const v = cyc(H.cycle, h.s.k);
    if (H.restaurant[v] !== undefined || stalls >= M.stall.count) continue;
    stallOf.add(h.s.k);
    stalls++;
  }
  for (const h of kept) {
    const v = cyc(H.cycle, h.s.k);
    const ti = H.restaurant[v];
    if (ti !== undefined) {
      const kit = MARINA_KIT.terrace[ti];
      const p = at(g, h.s.a, g.Rb + T.edge + kit.d / 2);
      const rot = toCentre(g, p);
      const sh = rectShape(p.x, p.z, rot, kit.w, kit.d);
      if (level(ctx, isl, sh, M.house.maxRelief, true) && clear(ctx, isl, sh, 0.1)) {
        addShape(ctx, isl, sh, false);
        mr.terraces.push({ kit, p, rot });
        const house = mr.houses[kept.indexOf(h)];
        house.terrace = mr.terraces.length - 1;
      }
    } else if (stallOf.has(h.s.k)) {
      const kit = cyc(MARINA_KIT.stall, M.stall.variants[mr.stalls.length]);
      const p = at(g, h.s.a, g.Rb + M.stall.edge + kit.d / 2);
      const rot = toCentre(g, p);
      const sh = rectShape(p.x, p.z, rot, kit.w, kit.d);
      if (level(ctx, isl, sh, M.house.maxRelief, true) && clear(ctx, isl, sh, 0.1)) {
        addShape(ctx, isl, sh, false);
        mr.stalls.push({ kit, p, rot });
      }
    }
  }
  for (let j = 0; j + 1 < kept.length; j++) {
    if (j % M.lantern.every !== 0 && !kept[j].s.alleyAfter) continue;
    const a0 = kept[j].s.a + kept[j].kit.w / rF / 2;
    const a1 = kept[j + 1].s.a - kept[j + 1].kit.w / rF / 2;
    if (a1 - a0 > alleyA * 1.5) continue;
    const p = at(g, (a0 + a1) / 2, g.Rb + M.lantern.inset);
    const sh = discShape(p.x, p.z, 0.3);
    if (!clear(ctx, isl, sh, 0.1)) continue;
    addShape(ctx, isl, sh, true);
    mr.lanterns.push(p);
  }
  // the tower on the tower mole's head
  const tk = MARINA_KIT.tower;
  // (`tower.back` u of arc in from the cap centre: the cap alone is too small a level for its box)
  const tp = at(g, TAU - g.aT - M.tower.back / g.Rc, g.Rc);
  const trot = toCentre(g, tp);
  const tsh = rectShape(tp.x, tp.z, trot, tk.w, tk.d);
  if (level(ctx, isl, tsh, 0.4) && clear(ctx, isl, tsh, 0.2)) {
    addShape(ctx, isl, tsh, true);
    mr.tower = { kit: tk, p: tp, rot: trot };
  }
  // (the boats and their bollards before the promenade is reserved: a bollard stands on it)
  layBoats(ctx, isl, mr);
  // the promenade: the deck reserved (walkable) along the centre line
  for (let s = 0; s <= sTot(g) + 1e-6; s += 3) {
    const a = g.aL + s / g.Rc;
    const p = at(g, a, g.Rc);
    const t = ang(-(p.z - g.C.z), p.x - g.C.x);
    // (as wide as the level deck, its flat margin included: nothing else stands on its edge)
    addShape(ctx, isl, rectShape(p.x, p.z, t, g.W + 2 * M.ring.edgeFlat + 1, 3.4), false);
  }
  addShape(ctx, isl, discShape(g.C.x, g.C.z, g.Rb), false);
}

/** Finger pontoons with a boat each side, then stern-to boats round the rest of the basin edge. */
function layBoats(ctx: SiteCtx, isl: IslandData, mr: Marina): void {
  const { g } = mr;
  const Y = M.yacht;
  const O = M.pontoon;
  const mid = (g.aL + TAU - g.aT) / 2;
  const pk = MARINA_KIT.pontoon;
  const taken: [number, number][] = [];
  const r0 = g.Rb - Y.faceGap / 2;
  for (let j = 0; j < O.runs; j++) {
    const a = mid + O.atDeg[j] * DEG;
    const boats = O.boats.map((v) => MARINA_KIT.yacht[v]);
    const half = pk.w / 2 + O.side + Math.max(...boats.map((b) => b.w));
    const rIn = r0 - pk.d * O.segs;
    const ang0 = (half + Y.gap) / Math.max(1, rIn);
    for (let k = 0; k < O.segs; k++) {
      const p = at(g, a, r0 - pk.d * (k + 0.5));
      mr.pontoons.push({ kit: pk, p, rot: toCentre(g, p) });
    }
    const c = at(g, a, r0);
    const rad = { x: (g.C.x - c.x) / g.Rb, z: (g.C.z - c.z) / g.Rb };
    const tan = { x: -rad.z, z: rad.x };
    boats.forEach((b, k) => {
      const off = (k === 0 ? -1 : 1) * (pk.w / 2 + O.side + b.w / 2);
      const p = add(at(g, a, r0 - b.d / 2 - 0.3), tan, off);
      mr.boats.push({ kit: b, p, rot: ang(rad.x, rad.z) });
    });
    taken.push([a - ang0, a + ang0]);
  }
  // stern-to round the edge, light head → tower head
  const lo = g.aL + Y.headKeep / g.Rb;
  const hi = TAU - g.aT - Y.headKeep / g.Rb;
  const sterns: Piece[] = [];
  let a = lo;
  for (let k = 0; sterns.length < Y.max && a < hi; k++) {
    const b = cyc(MARINA_KIT.yacht, cyc(Y.cycle, k));
    const rBow = Math.max(1, g.Rb - Y.faceGap - b.d);
    const w = (b.w + Y.gap) / rBow;
    const c = a + w / 2;
    if (a + w > hi) break;
    const block = taken.find(([t0, t1]) => a + w > t0 && a < t1);
    if (block) {
      a = block[1];
      k--;
      continue;
    }
    const p = at(g, c, g.Rb - Y.faceGap - b.d / 2);
    if (heightAt(ctx.h, p.x, p.z) < -0.6) {
      sterns.push({ kit: b, p, rot: toCentre(g, p) });
      const q = at(g, c, g.Rb + M.bollard.inset);
      const sh = discShape(q.x, q.z, 0.25);
      if (clear(ctx, isl, sh, 0.05)) {
        addShape(ctx, isl, sh, true);
        mr.bollards.push({ p: q, rot: toCentre(g, q) });
      }
    }
    a += w;
  }
  // ring order: by local angle
  const la = (p: XZ): number => where(g, p).a;
  mr.boats = [...mr.boats, ...sterns].sort((x, y) => la(x.p) - la(y.p));
}

/**
 * Finish (final ground): the deck painted (plaza, the moles' sea faces rock), the basin lagoon,
 * the anchors with their heights, every fixture. Returns the quay promenade polylines (joined to
 * the alley lanes) for the path graph.
 */
export function finishMarina(ctx: SiteCtx, mr: Marina, paths: readonly Polyline[]): Polyline[] {
  const { g, hb } = mr;
  const isl = hb.isl;
  const deckY = M.ring.deckY;
  // the deck level again: neighbouring pads' falls and the lanes' carve reached onto it
  for (const i of mr.deck) {
    ctx.h.data[i] = deckY;
    ctx.zone[i] = Zone.plaza;
  }
  // flank cells above the sea: rock armour on the moles' sea side
  const R = reach(g);
  const [x0, x1] = gridRange(g.C.x - R, g.C.x + R);
  const [z0, z1] = gridRange(g.C.z - R, g.C.z + R);
  for (let iz = z0; iz <= z1; iz++)
    for (let ix = x0; ix <= x1; ix++) {
      const i = iz * ctx.n + ix;
      const w = where(g, { x: cellX(ix), z: cellZ(iz) });
      if (w.d <= 0 || w.d > M.ring.flank || inBasin(g, w)) continue;
      if (ctx.h.data[i] > 0 && ctx.h.data[i] < deckY && hb.before[i] <= 0) ctx.zone[i] = Zone.rock;
    }
  // (the quay face above the water: stone, a rim round the basin)
  for (const i of mr.basin) ctx.zone[i] = ctx.h.data[i] < 0 ? Zone.lagoon : Zone.rock;
  const H = (p: XZ): number => heightAt(ctx.h, p.x, p.z);
  const pub = (key: string, p: XZ, rotY: number, y: number): void => {
    isl.anchors[key] = { x: p.x, z: p.z, rotY, y };
  };
  const a = capL(g);
  const b = capT(g);
  pub('marinaBasin', g.C, mouthHeading(g), 0);
  isl.anchors.marinaBasinSize = { x: 2 * g.Rb, z: 2 * g.Rb, rotY: 0 };
  pub('marinaMouth', { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 }, mouthHeading(g), 0);
  const total = sTot(g);
  const n = Math.max(1, Math.round(total / M.quayStep));
  const line: XZ[] = [];
  for (let k = 0; k <= n; k++) line.push(at(g, g.aL + (k / n) * (total / g.Rc), g.Rc));
  line.forEach((p, k) => {
    const q = line[Math.min(k + 1, n)];
    const o = line[Math.max(k - 1, 0)];
    const r = k < n ? ang(q.x - p.x, q.z - p.z) : ang(p.x - o.x, p.z - o.z);
    pub(`marinaQuay${k}`, p, r, H(p));
  });
  isl.anchors.marinaQuaySize = { x: g.W, z: deckY, rotY: 0 };
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
  if (mr.tower) {
    pub('marinaTower', mr.tower.p, mr.tower.rot, H(mr.tower.p));
    fix(mr.tower.kit.defId, mr.tower.p, mr.tower.rot, mr.tower.kit.variant, H(mr.tower.p));
  }
  for (const p of mr.lanterns) fix(M.lantern.defId, p, toCentre(g, p), M.lantern.variant, deckY);
  for (const o of mr.bollards) fix(M.bollard.defId, o.p, o.rot, M.bollard.variant, deckY);
  return promenade(ctx, mr, paths);
}

/**
 * The quay walk: from the end node of the first alley lane down onto the promenade (between the
 * terraces and the house fronts), then both ways round the ring to the heads; a leg joins the pier
 * root's path end when the ground between them is all land.
 */
function promenade(ctx: SiteCtx, mr: Marina, paths: readonly Polyline[]): Polyline[] {
  const { g, hb } = mr;
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
  // (the first alley whose lane reached the network)
  const alley = mr.alleys.find((a) => nearest(a, 4));
  const node = alley ? nearest(alley, 4) : null;
  if (!alley || !node) return [];
  const rP = g.Rb + 2.85;
  const aA = where(g, alley).a;
  const H = M.house.headKeep / g.Rc;
  const leg = (a0: number, a1: number): XZ[] => {
    const pts: XZ[] = [];
    const n = Math.max(1, Math.round((Math.abs(a1 - a0) * rP) / 2));
    for (let k = 0; k <= n; k++) pts.push(at(g, a0 + ((a1 - a0) * k) / n, rP));
    return pts;
  };
  const down = at(g, aA, rP);
  const walk = (a1: number): Polyline => ({
    islandId: isl.id,
    kind: 'path',
    closed: false,
    points: [node, down, ...leg(aA, a1).slice(1)],
  });
  const out = [walk(g.aL + H), walk(TAU - g.aT - H)];
  // the pier root: its lane's end node, reached over land from the light mole's root
  const root = nearest(hb.root, 3);
  if (root) {
    const lightRoot = out[0].points[out[0].points.length - 1];
    const n = Math.ceil(dist(lightRoot, root));
    let dry = true;
    for (let k = 0; k <= n && dry; k++) {
      const q = { x: lerp(lightRoot.x, root.x, k / n), z: lerp(lightRoot.z, root.z, k / n) };
      if (heightAt(ctx.h, q.x, q.z) < 0.2) dry = false;
    }
    if (dry) out[0].points.push(root);
  }
  return out;
}

/**
 * True when `p` lies on the marina's deck (within its nominal outer edge) or in its basin: the town's
 * pieces, told apart from the island's other fixtures (tests).
 */
export function inMarina(isl: IslandData, p: XZ): boolean {
  const c = isl.anchors.marinaBasin;
  const s = isl.anchors.marinaBasinSize;
  const q = isl.anchors.marinaQuaySize;
  if (!c || !s || !q) return false;
  return dist(c, p) < s.x / 2 + q.x;
}

/** Boat-route keep-out discs round every marina ring, basin and mouth (world/index.ts). */
export function marinaKeepOut(
  islands: readonly IslandData[],
): { x: number; z: number; r: number; hard: number }[] {
  const out: { x: number; z: number; r: number; hard: number }[] = [];
  for (const isl of islands) {
    const c = isl.anchors.marinaBasin;
    const size = isl.anchors.marinaBasinSize;
    const qs = isl.anchors.marinaQuaySize;
    if (!c || !size || !qs) continue;
    const r = qs.x / 2 + M.ring.edgeFlat + M.keepOut.pad;
    out.push({ x: c.x, z: c.z, r: size.x / 2, hard: M.keepOut.hard });
    for (let k = 0; isl.anchors[`marinaQuay${k}`]; k += 2) {
      const q = isl.anchors[`marinaQuay${k}`];
      out.push({ x: q.x, z: q.z, r, hard: M.keepOut.hard });
    }
    // (TASK-666: and the mouth's way out, so no route runs across it)
    const m = isl.anchors.marinaMouth;
    if (m)
      for (let t = M.keepOut.mouth[0]; t <= M.fit.mouthLen + 1e-6; t += 2)
        out.push({
          x: m.x + dm.cos(m.rotY) * t,
          z: m.z + dm.sin(m.rotY) * t,
          r: M.keepOut.mouth[1],
          hard: M.keepOut.hard,
        });
  }
  return out;
}
