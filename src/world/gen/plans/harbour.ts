/**
 * Ferry harbour skeleton (M31 TASK-532, D-112 / D-113): pure data, island-agnostic (numbers per
 * theme in content/harbours.ts). Grown at plan time from the island's lee cove dock site:
 *
 * 1. **T-head ferry pier** = the island's dock lengthened to `pier.segments` (the caller places
 *    it with `dockWithLink`, so the boat-route stop and with it the HQ ferry dwell at its head).
 * 2. **Breakwater arm**: the pre-arm shore-distance contour `arm.offset` u out, walked from the
 *    pier axis to the arm side (`sigma`, the feasible side whose seabed suits best), from arc
 *    `tipArc` (the tip) for `length` u, then straight back to the coast (the root). Water samples
 *    within the crest half width + flank are raised to the crest profile; the crest becomes land
 *    of this island (`islandMap`), the shore SDF is recomputed (exact EDT, same as generation) and
 *    the water zones whose shore distance moved are re-derived with the generation rule
 *    (`waterBandZone`): the water the arm encloses lies within ≈ 3.5 u of land, i.e. in the
 *    lagoon band. The new land's zones are painted in `finishHarbour` (final ground, D-109).
 * 3. **Basin** between the pier and the arm, dredged to `basin.depth` (cut only).
 * 4. Pier-root kiosk sites (shelter, booth, board) on the cove land, reserved blocking.
 *
 * Anchor contract (world u; rotY = xz heading (cos, sin); `y` = world height, set on the final
 * ground in `finishHarbour`; `…Size` = two numbers, not a position):
 * - `harbourPier0` / `harbourPier1`: the ferry pier's root (on the coast) and end, rotY = the pier
 *   heading (out to sea). It is the island's `world.docks` entry (segments × DOCK.segment long).
 *   `harbourHeadSize` = { x: T crossbar width across the pier, z: its depth along it }; the
 *   crossbar is centred on `harbourPier1`.
 * - `ferryBerth`: where the ferry stands, `berth.out` u past the pier end (the boat-route stop
 *   point: the route passes ≤ ROUTES.dockReach of the pier end); rotY = the pier heading.
 * - `harbourArm0..K` (`anchorPoints(isl, 'harbourArm')`): the arm's crest centre line every ≈ 2 u,
 *   0 = the tip → the root on the coast; rotY = heading toward the next point (the last: the
 *   arriving one); y = crest ground. `harbourArmSize` = { x: crest half width at the tip, z: crest
 *   height }. The crest land is ≈ 2 × (half + 1.3) u wide (the flank crosses the water line).
 * - `harbourLight`: on the crest centre line `light.inset` u back from the tip, rotY = out of the
 *   tip (the arm's heading at its end, seaward), y = crest ground.
 * - `harbourBasin` + `harbourBasinSize`: rect centre, rotY = pier heading, { x: width across the
 *   pier (pier side → arm side), z: length along it }; dredged ≥ `basin.depth` − blend.
 * - `harbourShelter` / `harbourBooth` / `harbourBoard`: footprint centres on the cove land by the
 *   pier root (sizes in `kiosks`), rotY = the pier heading (front to the sea), y = ground.
 * Every site is reserved (blocking on land, non-blocking on the water).
 */
import { HARBOURS, type HarbourParams } from '../../../content/harbours.ts';
import { DOCK } from '../../../content/settlements.ts';
import { lerp, smoothstep } from '../../../core/math/index.ts';
import { heightAt, sampleGrid, Zone, type IslandData, type ThemeId, type XZ } from '../../types.ts';
import { shoreSdfOwners } from '../coast.ts';
import { cellX, cellZ, gridRange } from '../grid.ts';
import { forSamplesNearSegment } from '../paths.ts';
import { waterBandZone } from '../zones.ts';
import {
  add,
  addShape,
  ang,
  carveWater,
  clear,
  dist,
  onLand,
  rectShape,
  relief,
  sdfAt,
  segDist,
  shapeCorners,
  type DockSite,
  type Shape,
  type SiteCtx,
} from '../sites.ts';

const DEG = Math.PI / 180;

/** A point of the arm's crest centre line. */
export interface ArmPoint extends XZ {
  /** Arc length from the tip (u). */
  s: number;
  /** Unit normal out to sea (away from the coast the arm follows). */
  nx: number;
  nz: number;
  /** Crest half width here (u). */
  half: number;
}

/** A planned harbour (the instance planners build on it). */
export interface Harbour {
  isl: IslandData;
  P: HarbourParams;
  /** Pier root on the coast, heading `u` (out to sea), `v` across toward the arm. */
  root: XZ;
  u: XZ;
  v: XZ;
  sigma: 1 | -1;
  rotY: number;
  /** The lengthened dock site (place it with `dockWithLink`). */
  site: DockSite;
  /** Pier end (the T-head centre) and the ferry berth. */
  end: XZ;
  berth: XZ;
  /** Crest centre line: tip → root bend (`bend` = index of the last contour point), then the spur. */
  arm: ArmPoint[];
  bend: number;
  /** Grid samples the arm turned into land. */
  land: number[];
  /** Shore SDF before the arm (which side of the arm a water sample lies on). */
  before: Float32Array;
  basin: Shape;
}

/** Harbour numbers of an island's theme, or null. */
export const harbourParams = (theme: ThemeId): HarbourParams | null =>
  (HARBOURS as Partial<Record<ThemeId, HarbourParams>>)[theme] ?? null;

/** World point at pier-frame coordinates (u along the pier, v toward the arm). */
export const framePoint = (hb: Harbour, u: number, v: number): XZ => ({
  x: hb.root.x + hb.u.x * u + hb.v.x * v,
  z: hb.root.z + hb.u.z * u + hb.v.z * v,
});

/** Pier-frame coordinates of a world point. */
export function frameOf(hb: Harbour, p: XZ): { u: number; v: number } {
  const dx = p.x - hb.root.x;
  const dz = p.z - hb.root.z;
  return { u: dx * hb.u.x + dz * hb.u.z, v: dx * hb.v.x + dz * hb.v.z };
}

/** True when `p` lies within `pad` u of the ferry approach corridor (berth → open sea). */
export function inApproach(hb: Harbour, p: XZ, pad = 0): boolean {
  const A = hb.P.berth.approach;
  const L = hb.site.segments * DOCK.segment;
  const f = frameOf(hb, p);
  return f.u >= L - pad && f.u <= L + hb.P.berth.out + A.len + pad && Math.abs(f.v) <= A.half + pad;
}

/** Arm point at arc `s` from the tip (clamped to the contour part, tip → bend). */
export function armAt(hb: Harbour, s: number): ArmPoint {
  const a = hb.arm;
  if (s <= 0) return a[0];
  for (let k = 0; k < hb.bend; k++) {
    const p = a[k];
    const q = a[k + 1];
    if (s <= q.s) {
      const t = (s - p.s) / Math.max(1e-6, q.s - p.s);
      const nx = lerp(p.nx, q.nx, t);
      const nz = lerp(p.nz, q.nz, t);
      const l = Math.hypot(nx, nz) || 1;
      return {
        x: lerp(p.x, q.x, t),
        z: lerp(p.z, q.z, t),
        s,
        nx: nx / l,
        nz: nz / l,
        half: lerp(p.half, q.half, t),
      };
    }
  }
  return a[hb.bend];
}

/** Arc length of the arm's contour part (tip → bend). */
export const armLength = (hb: Harbour): number => hb.arm[hb.bend].s;

const grid = (ctx: SiteCtx, f: Float32Array, p: XZ): number => sampleGrid(ctx.h, f, p.x, p.z, -999);

/** Unit gradient of a grid field at p (central differences over ±1 u), toward larger values. */
function gradAt(ctx: SiteCtx, f: Float32Array, p: XZ): XZ {
  const gx = grid(ctx, f, { x: p.x + 1, z: p.z }) - grid(ctx, f, { x: p.x - 1, z: p.z });
  const gz = grid(ctx, f, { x: p.x, z: p.z + 1 }) - grid(ctx, f, { x: p.x, z: p.z - 1 });
  const l = Math.hypot(gx, gz);
  return l > 1e-6 ? { x: gx / l, z: gz / l } : { x: 0, z: 0 };
}

interface Walk {
  pts: ArmPoint[];
  /** Index of the last contour point (the root spur follows). */
  bend: number;
  score: number;
}

/**
 * The arm on one side: the contour walk from the pier axis, cut to [tipArc, tipArc + length],
 * then the root spur back to the coast; null when it does not fit.
 */
function walkArm(
  ctx: SiteCtx,
  isl: IslandData,
  P: HarbourParams,
  root: XZ,
  u: XZ,
  vSide: XZ,
  end: XZ,
): Walk | null {
  const A = P.arm;
  const f = ctx.sdf;
  // start: on the pier axis where the shore distance reaches the offset
  let p: XZ | null = null;
  for (let t = 0; t <= A.offset + 10 && !p; t += 0.5) {
    const q = add(root, u, t);
    if (grid(ctx, f, q) <= -A.offset) p = q;
  }
  if (!p) return null;
  const project = (q: XZ): XZ => {
    let r = q;
    for (let k = 0; k < 3; k++) {
      const g = gradAt(ctx, f, r);
      r = add(r, g, -(grid(ctx, f, r) + A.offset));
    }
    return r;
  };
  p = project(p);
  const raw: XZ[] = [];
  const arcs: number[] = [];
  let arc = 0;
  let turn = 0;
  let prev: XZ | null = null;
  const maxArc = A.tipArc + A.length;
  for (let i = 0; i < (maxArc / A.step) * 2 && arc < maxArc; i++) {
    const g = gradAt(ctx, f, p);
    if (g.x === 0 && g.z === 0) break;
    // the contour tangent toward the arm side
    let t = { x: -g.z, z: g.x };
    if (t.x * vSide.x + t.z * vSide.z < 0 && !prev) t = { x: g.z, z: -g.x };
    else if (prev && t.x * prev.x + t.z * prev.z < 0) t = { x: g.z, z: -g.x };
    if (prev) turn += Math.atan2(prev.x * t.z - prev.z * t.x, prev.x * t.x + prev.z * t.z);
    if (Math.abs(turn) > A.maxTurnDeg * DEG) break;
    prev = t;
    const q = project(add(p, t, A.step));
    const depth = -heightAt(ctx.h, q.x, q.z);
    if (arc + A.step >= A.tipArc && (depth < A.depth[0] || depth > A.depth[1])) break;
    arc += dist(p, q);
    p = q;
    raw.push(q);
    arcs.push(arc);
  }
  const first = arcs.findIndex((a) => a >= A.tipArc);
  if (first < 0 || arc - arcs[first] < A.minLength) return null;
  const tipS = arcs[first];
  const span = arc - tipS;
  const pts: ArmPoint[] = [];
  for (let k = first; k < raw.length; k++) {
    const g = gradAt(ctx, f, raw[k]);
    const s = arcs[k] - tipS;
    pts.push({
      x: raw[k].x,
      z: raw[k].z,
      s,
      nx: -g.x,
      nz: -g.z,
      half: lerp(A.half[0], A.half[1], s / span),
    });
  }
  // the root: straight back to the coast from the last contour point (into the land 0.5 u)
  const bend = pts.length - 1;
  const last = pts[bend];
  const inward = { x: -last.nx, z: -last.nz };
  let s = last.s;
  let q: XZ = last;
  let reached = false;
  for (let k = 0; k < A.offset + 6; k++) {
    q = add(q, inward, 1);
    s += 1;
    pts.push({ x: q.x, z: q.z, s, nx: last.nx, nz: last.nz, half: A.half[1] });
    if (grid(ctx, f, q) >= 0.5) {
      reached = true;
      break;
    }
  }
  if (!reached) return null;
  // the basin mouth stays open: the tip keeps `mouth` u off the T-head's arm-side end
  const headEnd = add(end, vSide, P.pier.head.w / 2);
  if (dist(pts[0], headEnd) - pts[0].half < A.mouth) return null;
  // and no other land body within `clearOther` u
  const id1 = isl.id + 1;
  const R = A.clearOther;
  for (const a of pts) {
    const [x0, x1] = gridRange(a.x - R, a.x + R);
    const [z0, z1] = gridRange(a.z - R, a.z + R);
    for (let iz = z0; iz <= z1; iz++)
      for (let ix = x0; ix <= x1; ix++) {
        const m = ctx.islandMap[iz * ctx.n + ix];
        if (m !== 0 && m !== id1 && Math.hypot(cellX(ix) - a.x, cellZ(iz) - a.z) <= R) return null;
      }
  }
  let score = 0;
  let count = 0;
  for (const a of pts) {
    const y = heightAt(ctx.h, a.x, a.z);
    if (y >= 0) continue;
    score += (-y - A.idealDepth) ** 2;
    count++;
  }
  return { pts, bend, score: count > 0 ? score / count : Infinity };
}

/**
 * Pier segments the site can run out to (each new one over water, clear, leaving the shore);
 * `all`: every segment from the root re-checked (after the arm moved the shore).
 */
function pierSegments(ctx: SiteCtx, P: HarbourParams, site: DockSite, all = false): number {
  const side = { x: -site.dir.z, z: site.dir.x };
  let segs = all ? 0 : site.segments;
  for (let k = all ? 1 : site.segments + 1; k <= P.pier.segments; k++) {
    const t = DOCK.segment * k;
    const q = add(site.root, site.dir, t);
    if (heightAt(ctx.h, q.x, q.z) > -0.05) break;
    if (-sdfAt(ctx, q.x, q.z) < DOCK.awayRate * t - DOCK.awaySlack) break;
    const c = P.pier.sideClear;
    if (heightAt(ctx.h, q.x + side.x * c, q.z + side.z * c) > -0.05) break;
    if (heightAt(ctx.h, q.x - side.x * c, q.z - side.z * c) > -0.05) break;
    segs = k;
  }
  return segs;
}

/** Raise the water samples under the arm to its crest profile; returns the samples made land. */
function raiseArm(ctx: SiteCtx, isl: IslandData, P: HarbourParams, arm: ArmPoint[]): number[] {
  const A = P.arm;
  const reach = A.half[1] + A.flank;
  // nearest crest-line distance (and the half width there) per sample
  const best = new Map<number, { d: number; half: number }>();
  for (let k = 0; k + 1 < arm.length; k++) {
    const a = arm[k];
    const b = arm[k + 1];
    const vx = b.x - a.x;
    const vz = b.z - a.z;
    const l2 = vx * vx + vz * vz;
    forSamplesNearSegment(ctx.h, a, b, reach, (i, d) => {
      const x = cellX(i % ctx.n);
      const z = cellZ(Math.floor(i / ctx.n));
      const t = l2 > 0 ? Math.max(0, Math.min(1, ((x - a.x) * vx + (z - a.z) * vz) / l2)) : 0;
      const half = lerp(a.half, b.half, t);
      const o = best.get(i);
      if (!o || d < o.d) best.set(i, { d, half });
    });
  }
  const top = A.crestY;
  const edge = A.crestY * (1 - A.crestDome);
  const land: number[] = [];
  const cells = [...best.keys()].sort((p, q) => p - q);
  for (const i of cells) {
    const { d, half } = best.get(i) as { d: number; half: number };
    const y0 = ctx.h.data[i];
    if (y0 >= 0 || ctx.sdf[i] > 0) continue;
    const y =
      d <= half
        ? top - (top - edge) * (d / half) ** 2
        : lerp(edge, y0, smoothstep(half, half + A.flank, d));
    if (y <= y0) continue;
    ctx.h.data[i] = y;
    if (y > 0) {
      ctx.islandMap[i] = isl.id + 1;
      land.push(i);
    }
  }
  return land;
}

/**
 * New shore SDF after the arm (the generation EDT on `height > 0`), written in place; water samples
 * whose shore distance moved take the generation water band again; the new land is Zone.sandWet
 * until `finishHarbour` paints it.
 */
function refreshCoast(ctx: SiteCtx, land: readonly number[]): void {
  const N = ctx.n * ctx.n;
  const mask = new Uint8Array(N);
  for (let i = 0; i < N; i++) mask[i] = ctx.h.data[i] > 0 ? 1 : 0;
  const { sdf, owner } = shoreSdfOwners(mask, ctx.n, ctx.islandMap);
  for (let i = 0; i < N; i++) {
    if (sdf[i] === ctx.sdf[i]) continue;
    ctx.sdf[i] = sdf[i];
    const o = owner[i];
    if (sdf[i] <= 0 && o > 0 && o <= ctx.islands.length)
      ctx.zone[i] = waterBandZone(
        ctx.islands,
        [],
        ctx.windDir,
        cellX(i % ctx.n),
        cellZ(Math.floor(i / ctx.n)),
        -sdf[i],
        o,
      );
  }
  for (const i of land) ctx.zone[i] = Zone.sandWet;
}

function publish(isl: IslandData, key: string, p: XZ, rotY: number, y?: number): void {
  isl.anchors[key] = y === undefined ? { x: p.x, z: p.z, rotY } : { x: p.x, z: p.z, rotY, y };
}

/**
 * Kiosk site near pier-frame offset `at`: a `size` rect facing the sea on the cove land, off the
 * pier → `toward` avenue; the nearest valid candidate wins. Reserved blocking.
 */
function kiosk(
  ctx: SiteCtx,
  hb: Harbour,
  at: readonly [number, number],
  size: readonly [number, number],
  toward: XZ,
): XZ | null {
  const K = hb.P.kiosks;
  const pref = framePoint(hb, at[0], at[1]);
  // candidates nearest first (grid order on ties): the first valid one wins
  const n = Math.round(K.search / K.step);
  const cands: { p: XZ; d: number }[] = [];
  for (let a = -n; a <= n; a++)
    for (let b = -n; b <= n; b++) {
      const p = framePoint(hb, at[0] + a * K.step, at[1] + b * K.step);
      const d = dist(p, pref);
      if (d <= K.search) cands.push({ p, d });
    }
  cands.sort((x, y) => x.d - y.d);
  let best: { p: XZ; d: number } | null = null;
  for (const c of cands) {
    const { p } = c;
    const sh = rectShape(p.x, p.z, hb.rotY, size[0], size[1]);
    if (frameOf(hb, p).u > -size[1] / 2 - 0.5) continue;
    if (!onLand(ctx, hb.isl, sh, K.minShore)) continue;
    if (relief(ctx, sh) > K.maxRelief) continue;
    const lane = [{ x: p.x, z: p.z }, ...shapeCorners(sh)].map((q) => segDist(q, hb.root, toward));
    if (Math.min(...lane) < K.laneGap) continue;
    if (!clear(ctx, hb.isl, sh, K.gap)) continue;
    best = c;
    break;
  }
  if (!best) return null;
  addShape(ctx, hb.isl, rectShape(best.p.x, best.p.z, hb.rotY, size[0], size[1]), true);
  return best.p;
}

/**
 * Plan the harbour on `site` (the island's cove dock): pier length, arm side, the arm raised and
 * the coast refreshed, the basin dredged; anchors published (y in `finishHarbour`; the kiosks:
 * `placeKiosks`). Null when the island has no harbour numbers, no dock or no arm fits.
 */
export function planHarbour(ctx: SiteCtx, isl: IslandData, site: DockSite | null): Harbour | null {
  const P = harbourParams(isl.theme);
  if (!P || !site) return null;
  const segments = pierSegments(ctx, P, site);
  if (segments < P.pier.minSegments) return null;
  const u = site.dir;
  const end0 = add(site.root, u, segments * DOCK.segment);
  let pick: { w: Walk; sigma: 1 | -1 } | null = null;
  for (const sigma of [1, -1] as const) {
    const vSide = { x: -u.z * sigma, z: u.x * sigma };
    const w = walkArm(ctx, isl, P, site.root, u, vSide, end0);
    if (w && (!pick || w.score < pick.w.score)) pick = { w, sigma };
  }
  if (!pick) return null;
  const sigma = pick.sigma;
  const arm = pick.w.pts;
  const before = ctx.sdf.slice();
  const hb: Harbour = {
    isl,
    P,
    root: site.root,
    u,
    v: { x: -u.z * sigma, z: u.x * sigma },
    sigma,
    rotY: ang(u.x, u.z),
    site: { ...site, segments },
    end: end0,
    berth: add(end0, u, P.berth.out),
    arm,
    bend: pick.w.bend,
    land: [],
    before,
    basin: rectShape(0, 0, 0, 0, 0),
  };
  hb.land = raiseArm(ctx, isl, P, arm);
  refreshCoast(ctx, hb.land);
  // the arm moved the shore: the pier still leaves it at DOCK.awayRate (else it ends sooner)
  const segs = pierSegments(ctx, P, site, true);
  if (segs < hb.site.segments) {
    hb.site = { ...hb.site, segments: Math.max(P.pier.minSegments, segs) };
    hb.end = add(site.root, u, hb.site.segments * DOCK.segment);
    hb.berth = add(hb.end, u, P.berth.out);
  }
  const L = hb.site.segments * DOCK.segment;
  const end = hb.end;
  // reserve the crest (blocking: nothing stands on the breakwater but its own kit); over the old
  // water only (the root's last metres on the old coast stay the island's)
  const coarse = resampleArm(arm, 4);
  for (let k = 0; k + 1 < coarse.length; k++) {
    const a = coarse[k];
    const b = coarse[k + 1];
    if (grid(ctx, before, b) > -2) break;
    const m = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
    const w = 2 * (Math.max(a.half, b.half) + 1.3);
    addShape(ctx, isl, rectShape(m.x, m.z, ang(b.x - a.x, b.z - a.z), w, dist(a, b) + w), true);
  }
  // the basin: pier side → arm side, dredged
  const B = P.basin;
  let vMax = Infinity;
  for (const uu of [B.from, L / 2, L - 0.5])
    for (let v = B.pierGap; v <= 20; v += 0.5) {
      const q = framePoint(hb, uu, v);
      if (sdfAt(ctx, q.x, q.z) > -B.armGap || heightAt(ctx.h, q.x, q.z) >= 0) {
        vMax = Math.min(vMax, v - 0.5);
        break;
      }
    }
  const tipV = frameOf(hb, arm[0]).v - arm[0].half;
  vMax = Math.min(vMax, tipV, 20);
  const w = Math.max(1, vMax - B.pierGap);
  const c = framePoint(hb, (B.from + L) / 2, B.pierGap + w / 2);
  hb.basin = rectShape(c.x, c.z, hb.rotY, w, L - B.from);
  for (let v = B.pierGap + 0.6; v <= vMax - 0.6 + 1e-6; v += 1)
    carveWater(ctx, framePoint(hb, B.from, v), framePoint(hb, L - 0.5, v), 0.6, B.fall, B.depth);
  addShape(ctx, isl, hb.basin, false);
  // the T-head and the berth stay free of other sites
  const head = rectShape(end.x, end.z, hb.rotY, P.pier.head.w, P.pier.head.d);
  addShape(ctx, isl, head, false);
  // anchors (y on the final ground: finishHarbour)
  publish(isl, 'harbourPier0', hb.root, hb.rotY);
  publish(isl, 'harbourPier1', end, hb.rotY);
  publish(isl, 'harbourHeadSize', { x: P.pier.head.w, z: P.pier.head.d }, 0);
  publish(isl, 'ferryBerth', hb.berth, hb.rotY);
  publish(isl, 'harbourBasin', { x: c.x, z: c.z }, hb.rotY);
  publish(isl, 'harbourBasinSize', { x: w, z: L - B.from }, 0);
  return hb;
}

/**
 * The pier-root kiosk sites (shelter, booth, timetable board), each at its preferred side of the
 * pier root, else mirrored across the pier axis. Call it after the island's own districts (they
 * keep their ring slots and avenue pennants; the kiosks fit round them). `toward` = where the
 * pier-root avenue leads.
 */
export function placeKiosks(ctx: SiteCtx, hb: Harbour, toward: XZ): void {
  const K = hb.P.kiosks;
  const keys = [
    ['harbourShelter', K.shelter],
    ['harbourBooth', K.booth],
    ['harbourBoard', K.board],
  ] as const;
  for (const [key, k] of keys) {
    const p =
      kiosk(ctx, hb, k.at, k.size, toward) ?? kiosk(ctx, hb, [k.at[0], -k.at[1]], k.size, toward);
    if (p) publish(hb.isl, key, p, hb.rotY);
  }
}

/** The crest line resampled every ≈ `step` u (tip → root), both ends kept. */
function resampleArm(arm: readonly ArmPoint[], step: number): ArmPoint[] {
  const out: ArmPoint[] = [arm[0]];
  let acc = 0;
  for (let k = 1; k < arm.length; k++) {
    acc += dist(arm[k - 1], arm[k]);
    if (acc >= step - 1e-6 || k === arm.length - 1) {
      out.push(arm[k]);
      acc = 0;
    }
  }
  return out;
}

/**
 * Finish (final ground): the new land painted (`arm.rockY` / `armour` / `rockTip`), the
 * arm and light anchors published with their crest heights, the kiosk anchors' ground heights.
 */
export function finishHarbour(ctx: SiteCtx, hb: Harbour): void {
  const { isl, P } = hb;
  for (const i of hb.land) {
    const y = ctx.h.data[i];
    if (y <= 0) continue;
    if (y < P.arm.rockY) {
      ctx.zone[i] = Zone.sandWet;
      continue;
    }
    // the nearest crest-line point: seaward side → rock armour, sheltered side → dry sand
    const p = { x: cellX(i % ctx.n), z: cellZ(Math.floor(i / ctx.n)) };
    let best = 0;
    let bd = Infinity;
    for (let k = 0; k < hb.arm.length; k++) {
      const d = dist(p, hb.arm[k]);
      if (d < bd) {
        bd = d;
        best = k;
      }
    }
    const a = hb.arm[best];
    const out = (p.x - a.x) * a.nx + (p.z - a.z) * a.nz;
    ctx.zone[i] = a.s <= P.arm.rockTip || out >= P.arm.armour ? Zone.rock : Zone.sandDry;
  }
  const H = (p: XZ): number => heightAt(ctx.h, p.x, p.z);
  const line = resampleArm(hb.arm, 2);
  line.forEach((p, k) => {
    const q = k + 1 < line.length ? line[k + 1] : null;
    const r = q ? ang(q.x - p.x, q.z - p.z) : ang(p.x - line[k - 1].x, p.z - line[k - 1].z);
    publish(isl, `harbourArm${k}`, p, r, H(p));
  });
  publish(isl, 'harbourArmSize', { x: hb.arm[0].half, z: P.arm.crestY }, 0);
  const tip = hb.arm[0];
  const next = hb.arm[1];
  const out = ang(tip.x - next.x, tip.z - next.z);
  const light = armAt(hb, P.light.inset);
  publish(isl, 'harbourLight', light, out, H(light));
  for (const key of ['harbourPier0', 'harbourShelter', 'harbourBooth', 'harbourBoard']) {
    const a = isl.anchors[key];
    if (a) publish(isl, key, a, a.rotY, H(a));
  }
  for (const key of ['harbourPier1', 'ferryBerth', 'harbourBasin']) {
    const a = isl.anchors[key];
    if (a) publish(isl, key, a, a.rotY, 0);
  }
}

/**
 * Boat-route keep-out discs along every harbour's ferry pier and T-head (world/index.ts): `pier`
 * u round points every 2 u of the pier, `head` u round the crossbar's two ends, its own half depth
 * + 0.6 u along the rest of it, `head` u along the basin mouth (the crossbar's arm-side end → the
 * arm tip: the ferry comes in from the open sea). The berth (`berth.out` u out) stays reachable.
 */
export function harbourKeepOut(
  islands: readonly IslandData[],
): { x: number; z: number; r: number; hard: number }[] {
  const out: { x: number; z: number; r: number; hard: number }[] = [];
  for (const isl of islands) {
    const P = harbourParams(isl.theme);
    const a = isl.anchors.harbourPier0;
    const b = isl.anchors.harbourPier1;
    const size = isl.anchors.harbourHeadSize;
    if (!P || !a || !b || !size) continue;
    const L = dist(a, b);
    const u = { x: (b.x - a.x) / L, z: (b.z - a.z) / L };
    const hard = P.keepOut.hard;
    for (let t = 0; t < L - P.keepOut.head; t += 2)
      out.push({ x: a.x + u.x * t, z: a.z + u.z * t, r: P.keepOut.pier, hard });
    for (const k of [-0.5, 0.5])
      out.push({ x: b.x - u.z * size.x * k, z: b.z + u.x * size.x * k, r: P.keepOut.head, hard });
    // the crossbar between its ends: just its own depth (the berth node sits `berth.out` u out)
    for (const k of [-0.25, 0, 0.25])
      out.push({ x: b.x - u.z * size.x * k, z: b.z + u.x * size.x * k, r: size.z / 2 + 0.6, hard });
    // the basin mouth (arm tip → the crossbar's nearer end): the ferry comes in from the sea
    const tip = isl.anchors.harbourArm0;
    if (tip) {
      const ends = [-0.5, 0.5].map((k) => ({
        x: b.x - u.z * size.x * k,
        z: b.z + u.x * size.x * k,
      }));
      const e = dist(ends[0], tip) < dist(ends[1], tip) ? ends[0] : ends[1];
      const m = dist(e, tip);
      for (let t = 0; t <= m; t += 2)
        out.push({
          x: e.x + ((tip.x - e.x) * t) / m,
          z: e.z + ((tip.z - e.z) * t) / m,
          r: P.keepOut.head,
          hard,
        });
    }
  }
  return out;
}
