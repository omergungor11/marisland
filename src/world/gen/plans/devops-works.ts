/**
 * DevOps "Ember Works" (TASK-402): the facilities on the three cone-foot shelves of Emberpeak
 * (content/islands.ts `shelves`; anchors carry the shelf centre and its outward heading):
 * - Geothermal data center: dataCenter lots on the `datacenter` / `datacenterUpper` shelves
 *   (two levels, doors to the sea) beyond the hot-spring plant; worker lodges by the ops quad;
 * - Deployment harbour (`harbour`): paved quay, the container yard (stacks + a gantry crane, its
 *   boom over the quay), a control tower by the pier, and a CI/CD belt (QA conveyor segments;
 *   crates ride it in render/movers.ts) from a rack shed to the yard;
 * - Lava foundry (`foundry` + `foundryUpper`): furnace halls on the upper step, a rail line
 *   along the lower shelf (carts in render/movers.ts), smithies inland of it, lodges seaward.
 * Every random decision draws from the `rng` it is given; tuning lives in DEVOPS_SITE.
 */
import type { Rng } from '../../../core/rng.ts';
import { DEVOPS_WORKS as W } from '../../../content/props-themes/devops.ts';
import { FLATTEN, LOT_FOOTPRINT, VILLAGE } from '../../../content/settlements.ts';
import { QA_FACTORY } from '../../../content/themes/qa.ts';
import { DEVOPS_SITE } from '../../../content/themes/devops.ts';
import { heightAt, Zone } from '../../types.ts';
import type { DistrictData, IslandData, XZ } from '../../types.ts';
import { cellX, cellZ, gridRange } from '../grid.ts';
import {
  add,
  addPad,
  addShape,
  ang,
  bestSample,
  clear,
  discShape,
  segDist,
  dirOf,
  dist,
  onIsland,
  onLand,
  rectShape,
  relief,
  sdfAt,
  shapeDist,
  siteFree,
  tryLot,
  unit,
  type Shape,
  type SiteCtx,
  type SitePlan,
} from '../sites.ts';

const S = DEVOPS_SITE;

/** Write `zone` on this island's land samples inside `sh`. */
export function paintZone(ctx: SiteCtx, isl: IslandData, sh: Shape, zone: number): void {
  const R = (sh.r > 0 ? sh.r : Math.hypot(sh.hw, sh.hd)) + 1;
  const [x0, x1] = gridRange(sh.x - R, sh.x + R);
  const [z0, z1] = gridRange(sh.z - R, sh.z + R);
  for (let iz = z0; iz <= z1; iz++)
    for (let ix = x0; ix <= x1; ix++) {
      const i = iz * ctx.n + ix;
      if (ctx.islandMap[i] !== isl.id + 1 || ctx.sdf[i] <= 0) continue;
      if (shapeDist(sh, cellX(ix), cellZ(iz)) <= 0) ctx.zone[i] = zone;
    }
}

export function district(
  isl: IslandData,
  kind: DistrictData['kind'],
  sh: Shape,
  rotY: number,
): DistrictData {
  return { islandId: isl.id, kind, x: sh.x, z: sh.z, rotY, w: sh.hw * 2, d: sh.hd * 2 };
}

/** Shelf frame: `at(u, v)` = anchor + u along the coast (tangent) + v out to sea. */
interface Frame {
  o: XZ;
  f: XZ;
  t: XZ;
  rotY: number;
  at(u: number, v: number): XZ;
}

function frameOf(a: { x: number; z: number; rotY: number }): Frame {
  const f = dirOf(a.rotY);
  const t = { x: -f.z, z: f.x };
  return { o: a, f, t, rotY: a.rotY, at: (u, v) => add(add(a, t, u), f, v) };
}

interface FitOpts {
  search: number;
  minShore: number;
  maxRelief: number;
  gap: number;
  /** Pad margin (flatten core past the footprint); default FIX_MARGIN. */
  margin?: number;
  /** Rasterise into the path-blocking grid (default true; quay stock leaves paths free). */
  block?: boolean;
  /** Keep the centre within `tol` u of height `y` (stay on one shelf level). */
  level?: { y: number; tol: number };
}

/** Fixture pad margin: smaller than a lot's, so shelf pieces sit closer to a step edge. */
const FIX_MARGIN = 1.2;

/** applyPads' conservative relaxation bound of a pad (circumradius + margin). */
const padBound = (sh: Shape, margin: number): number =>
  (sh.r > 0 ? sh.r : Math.hypot(sh.hw, sh.hd)) + margin;

/**
 * A pad for `sh` at its ground level would not be relaxed together with a pad on another
 * level (> STEP_TOL apart): applyPads ties every pair within the sum of their bounds, which
 * would flatten a shelf step away.
 */
function levelSafe(ctx: SiteCtx, isl: IslandData, sh: Shape, margin: number): boolean {
  const y = heightAt(ctx.h, sh.x, sh.z);
  const b = padBound(sh, margin);
  for (const p of ctx.pads) {
    if (p.islandId !== isl.id) continue;
    if (Math.abs(heightAt(ctx.h, p.shape.x, p.shape.z) - y) <= STEP_TOL) continue;
    if (dist(p.shape, sh) <= padBound(p.shape, p.margin) + b) return false;
  }
  return true;
}
const STEP_TOL = 1.2;

/** Nearest spot to `target` where a `w × d` rect facing `rotY` fits (on land, level, clear). */
function fitRect(
  ctx: SiteCtx,
  isl: IslandData,
  target: XZ,
  rotY: number,
  w: number,
  d: number,
  o: FitOpts,
): XZ | null {
  return bestSample(ctx, isl, target, o.search, (q, i) => {
    if (ctx.sdf[i] < o.minShore) return Infinity;
    if (o.level && Math.abs(ctx.h.data[i] - o.level.y) > o.level.tol) return Infinity;
    const sh = rectShape(q.x, q.z, rotY, w, d);
    if (!onLand(ctx, isl, sh, o.minShore)) return Infinity;
    const r = relief(ctx, sh);
    if (r > o.maxRelief || !clear(ctx, isl, sh, o.gap) || !siteFree(ctx, isl, sh)) return Infinity;
    if (!levelSafe(ctx, isl, sh, o.margin ?? FIX_MARGIN)) return Infinity;
    return dist(q, target) + r;
  });
}

/** Place a fixture with a rect obstacle (blocking) and a level pad under it. */
function putFixture(
  ctx: SiteCtx,
  isl: IslandData,
  defId: string,
  p: XZ,
  rotY: number,
  w: number,
  d: number,
  variant?: number,
  margin = FIX_MARGIN,
  block = true,
): Shape {
  ctx.fixtures.push({
    defId,
    x: p.x,
    z: p.z,
    rotY,
    islandId: isl.id,
    ...(variant === undefined ? {} : { variant }),
  });
  const sh = rectShape(p.x, p.z, rotY, w, d);
  addShape(ctx, isl, sh, block);
  addPad(ctx, isl, sh, margin);
  return sh;
}

/** Fit + place; null when nothing fits. */
function fixtureNear(
  ctx: SiteCtx,
  isl: IslandData,
  defId: string,
  target: XZ,
  rotY: number,
  size: readonly [number, number],
  o: FitOpts,
  variant?: number,
): XZ | null {
  const p = fitRect(ctx, isl, target, rotY, size[0], size[1], o);
  if (p) putFixture(ctx, isl, defId, p, rotY, size[0], size[1], variant, o.margin, o.block);
  return p;
}

/**
 * Geothermal data center: `perLevel[k]` dataCenter lots on shelf level k ([lower, upper]
 * anchors), side by side along the shelf, doors out to sea. Returns lot indices, top first.
 */
export function placeDataCenters(ctx: SiteCtx, isl: IslandData, sIdx: number): number[] {
  const T = S.terraces;
  const [w, d] = LOT_FOOTPRINT.dataCenter;
  const lots: number[] = [];
  // upper level first (top first in the result); the lower pads then keep off its pad bound
  (['datacenterUpper', 'datacenter'] as const).forEach((key, k) => {
    const a = isl.anchors[key];
    if (!a) return;
    const F = frameOf(a);
    const n = T.perLevel[k];
    const level = { y: heightAt(ctx.h, a.x, a.z), tol: T.levelTol };
    for (let j = 0; j < n; j++) {
      const target = F.at((j - (n - 1) / 2) * T.side, T.out[k]);
      const p = fitRect(ctx, isl, target, F.rotY, w, d, {
        search: T.search,
        minShore: T.minShore,
        maxRelief: T.maxRelief,
        gap: VILLAGE.lotGap,
        margin: FLATTEN.lotMargin,
        level,
      });
      if (!p) continue;
      const li = tryLot(ctx, isl, 'dataCenter', p, F.rotY, sIdx, {
        minShore: T.minShore,
        maxRelief: T.maxRelief,
      });
      if (li >= 0) lots.push(li);
    }
  });
  return lots;
}

/** Worker lodges (cottage fixtures) on a ring around the ops quad, doors to the quad. */
export function placeQuadLodges(ctx: SiteCtx, isl: IslandData, quad: XZ, rng: Rng): void {
  const L = S.quadLodges;
  const phase = rng.range(0, Math.PI * 2);
  let made = 0;
  for (let k = 0; k < 16 && made < L.count; k++) {
    const a = phase + (k / 16) * Math.PI * 2;
    const target = add(quad, dirOf(a), (L.ring[0] + L.ring[1]) / 2);
    const face = ang(quad.x - target.x, quad.z - target.z);
    const p = fixtureNear(
      ctx,
      isl,
      'cottage',
      target,
      face,
      LOT_FOOTPRINT.cottage,
      { search: (L.ring[1] - L.ring[0]) / 2, minShore: 3, maxRelief: 2, gap: VILLAGE.lotGap },
      L.variants[made % L.variants.length],
    );
    if (p) made++;
  }
}

/**
 * Deployment harbour on the `harbour` shelf, part 1 (before the rack yard, so the big prefab gets
 * the level quay first): the container yard (stacks, gantry crane, control tower) and a footpath
 * to the tower door. Returns the yard centre (null when it does not fit).
 */
export function placeContainerYard(ctx: SiteCtx, isl: IslandData, plan: SitePlan): XZ | null {
  const H = S.harbour;
  const a = isl.anchors.harbour;
  if (!a) return null;
  const F = frameOf(a);
  let yard: XZ | null = null;
  let rot = F.rotY;
  for (const turn of H.yardTurns)
    for (const [u, v] of H.yardSlots) {
      if (yard) break;
      rot = F.rotY + turn;
      yard = fixtureNear(ctx, isl, 'containerYard', F.at(u, v), rot, W.yard.footprint, {
        search: H.yardSearch,
        minShore: H.minShore,
        maxRelief: H.yardRelief,
        gap: 1.2,
      });
    }
  // a footpath to the control tower door (local x = (sin rot, −cos rot), z = (cos rot, sin rot))
  if (yard) {
    const f = dirOf(rot);
    const x = { x: f.z, z: -f.x };
    const tower = add(add(yard, x, W.yard.tower.x), f, W.yard.tower.z);
    plan.links.push({ pin: add(tower, f, 2.6), kind: 'path', done: () => undefined });
  }
  return yard;
}

/**
 * Deployment harbour, part 2: the CI/CD belt from the nearest build-hall rack shed (`sheds`) into
 * the yard, then the concrete quay (paved last, the ramp down the beach into the water included).
 */
export function finishHarbour(
  ctx: SiteCtx,
  isl: IslandData,
  yard: XZ | null,
  sheds: readonly number[],
  root: XZ | null,
  rng: Rng,
): void {
  const H = S.harbour;
  const a = isl.anchors.harbour;
  if (!a) return;
  const F = frameOf(a);
  // CI/CD belt: the nearest rack shed → the yard (it ends just inside the yard's edge)
  let best: { a: XZ; b: XZ } | null = null;
  if (yard) {
    const fx = ctx.fixtures.find((q) => q.defId === 'containerYard' && q.islandId === isl.id);
    const ysh = rectShape(yard.x, yard.z, fx?.rotY ?? F.rotY, ...W.yard.footprint);
    for (const li of sheds) {
      const l = ctx.lots[li];
      const L = shapeDist(ysh, l.x, l.z);
      if (L < H.belt[0] || L > H.belt[1]) continue;
      if (!best || L < shapeDist(ysh, best.a.x, best.a.z)) best = { a: l, b: yard };
    }
  }
  if (best) belt(ctx, isl, best.a, best.b);
  dressQuay(ctx, isl, F, yard, root, rng);
  // concrete quay (the ramp down the beach into the water included)
  const R = H.paveR;
  const [x0, x1] = gridRange(a.x - R, a.x + R);
  const [z0, z1] = gridRange(a.z - R, a.z + R);
  for (let iz = z0; iz <= z1; iz++)
    for (let ix = x0; ix <= x1; ix++) {
      const i = iz * ctx.n + ix;
      if (ctx.islandMap[i] !== isl.id + 1 || ctx.sdf[i] <= 0) continue;
      if (Math.hypot(cellX(ix) - a.x, cellZ(iz) - a.z) > R) continue;
      if (ctx.h.data[i] <= H.maxY) ctx.zone[i] = Zone.plaza;
    }
}

/** Push a small fixture (no pad) with a non-blocking disc obstacle. */
function smallFixture(
  ctx: SiteCtx,
  isl: IslandData,
  defId: string,
  p: XZ,
  rotY: number,
  r: number,
  variant?: number,
): void {
  ctx.fixtures.push({
    defId,
    x: p.x,
    z: p.z,
    rotY,
    islandId: isl.id,
    ...(variant === undefined ? {} : { variant }),
  });
  addShape(ctx, isl, discShape(p.x, p.z, r), false);
}

/**
 * Quay dressing (density pass): stock and machinery kits on a shuffled grid over the paved quay
 * (crate and cable-spool piles, fuel tanks, forklifts, loose container rows), a clear lane from
 * the pier root to the yard, lamp posts along the quay edge. Existing defs keep their variants
 * already drawn on the island (crate 1, cable spools 0/1, lantern post 1).
 */
function dressQuay(
  ctx: SiteCtx,
  isl: IslandData,
  F: Frame,
  yard: XZ | null,
  root: XZ | null,
  rng: Rng,
): void {
  const H = S.harbour;
  const Q = H.quay;
  // the lane pier root → yard and a clear apron round the pier root (its footpath leaves there)
  const lane = (p: XZ): boolean =>
    !!root && (dist(p, root) < Q.rootClear || (!!yard && segDist(p, root, yard) < Q.lane + 1.5));
  const onQuay = (p: XZ, shore: number): boolean => {
    if (!onIsland(ctx, isl, p.x, p.z) || dist(p, F.o) > H.paveR) return false;
    if (heightAt(ctx.h, p.x, p.z) > H.maxY) return false;
    return sdfAt(ctx, p.x, p.z) >= shore;
  };
  const free = (p: XZ, r: number): boolean => clear(ctx, isl, discShape(p.x, p.z, r), 0.6);
  const cand: XZ[] = [];
  for (let u = -H.paveR; u <= H.paveR; u += Q.pitch)
    for (let v = -H.paveR; v <= H.paveR; v += Q.pitch) {
      const p = F.at(u, v);
      if (onQuay(p, Q.minShore) && !lane(p)) cand.push(p);
    }
  rng.shuffle(cand);
  // machinery first (each kind up to its cap, each grid spot used once), then stock piles
  const taken = new Set<XZ>();
  // quay stock never blocks the footpath grid (the pier's path must reach the hub)
  const fit = {
    search: Q.bigSearch,
    minShore: Q.minShore,
    maxRelief: H.maxRelief,
    gap: 0.8,
    block: false,
  };
  let row = 0;
  for (const [kind, def, size] of [
    ['row', 'containerRow', W.row.footprint],
    ['tank', 'fuelTank', W.tank.footprint],
    ['forklift', 'forklift', W.forklift.footprint],
  ] as const) {
    let n = 0;
    for (const p of cand) {
      if (n >= Q.caps[kind]) break;
      if (taken.has(p)) continue;
      const rot =
        kind === 'forklift'
          ? rng.range(0, Math.PI * 2)
          : F.rotY + (kind === 'row' ? (row % 2) * Math.PI : rng.chance(0.5) ? 0 : Math.PI / 2);
      const q = fixtureNear(ctx, isl, def, p, rot, size, fit);
      if (!q) continue;
      taken.add(p);
      if (kind === 'row') row++;
      n++;
    }
  }
  let piles = 0;
  for (const p of cand) {
    if (piles >= Q.piles) break;
    if (taken.has(p) || !free(p, Q.pileR + 0.6)) continue;
    const crates = rng.next() < Q.crateShare;
    const n = rng.int(Q.pile[0], Q.pile[1]);
    for (let k = 0; k < n; k++) {
      const q = add(p, dirOf(rng.range(0, Math.PI * 2)), k === 0 ? 0 : rng.range(0.6, Q.pileR));
      ctx.fixtures.push({
        defId: crates ? 'crate' : 'cableSpool',
        x: q.x,
        z: q.z,
        rotY: rng.range(0, Math.PI * 2),
        islandId: isl.id,
        variant: crates ? 1 : k % 2,
      });
    }
    addShape(ctx, isl, discShape(p.x, p.z, Q.pileR + 0.4), false);
    taken.add(p);
    piles++;
  }
  // lamp posts along the quay edge, spaced, off the lane
  const lamps: XZ[] = [];
  const edge: XZ[] = [];
  for (let u = -H.paveR; u <= H.paveR; u += 1)
    for (let v = -H.paveR; v <= H.paveR; v += 1) {
      const p = F.at(u, v);
      const s = sdfAt(ctx, p.x, p.z);
      if (s < Q.lampShore[0] || s > Q.lampShore[1] || !onQuay(p, Q.lampShore[0])) continue;
      edge.push(p);
    }
  for (const p of edge) {
    if (lamps.length >= Q.lamps) break;
    if (lane(p) || lamps.some((q) => dist(q, p) < Q.lampGap) || !free(p, 0.4)) continue;
    smallFixture(ctx, isl, 'lanternPost', p, F.rotY, 0.4, 1);
    lamps.push(p);
  }
}

/**
 * Village infill (density pass): cottage lodges and rack sheds on the data center and foundry
 * shelves (rows either side of each anchor, on its level, doors out to sea).
 */
export function placeVillage(ctx: SiteCtx, isl: IslandData): void {
  const V = S.village;
  for (const [key, want] of Object.entries(V.perShelf)) {
    const a = isl.anchors[key];
    if (!a) continue;
    const F = frameOf(a);
    const level = { y: heightAt(ctx.h, a.x, a.z), tol: V.levelTol };
    const slots: XZ[] = [];
    for (const v of V.rows)
      for (let k = 0; k <= V.span / V.spacing; k++)
        for (const sg of k === 0 ? [1] : [1, -1]) slots.push(F.at(sg * k * V.spacing, v));
    let made = 0;
    for (const p of slots) {
      if (made >= want) break;
      const shed = (made + 1) % V.shedEvery === 0;
      const fit = {
        search: V.search,
        minShore: V.minShore,
        maxRelief: V.maxRelief,
        gap: VILLAGE.lotGap,
        level,
      };
      const q = shed
        ? fixtureNear(ctx, isl, 'rackShed', p, F.rotY, LOT_FOOTPRINT.rackShed, fit, made % 2)
        : fixtureNear(ctx, isl, 'cottage', p, F.rotY, LOT_FOOTPRINT.cottage, fit, 0);
      if (q) made++;
    }
  }
}

/**
 * CI/CD belt from `a` to `b`: conveyor segments on the centre line (crates run a → b), skipping
 * the ends inside the two footprints; null-op when a leg would stand on another obstacle.
 */
function belt(ctx: SiteCtx, isl: IslandData, a: XZ, b: XZ): boolean {
  const seg = QA_FACTORY.belt.seg;
  const L = dist(a, b);
  const u = unit(a, b);
  const n = Math.ceil(L / seg);
  const off = (L - n * seg) / 2;
  const own = ctx.shapes[isl.id].filter(
    (o) => shapeDist(o, a.x, a.z) <= 0 || shapeDist(o, b.x, b.z) <= 0,
  );
  const others = ctx.shapes[isl.id].filter((o) => !own.includes(o) && o.tag !== 'plaza');
  const segs: XZ[] = [];
  for (let k = 0; k < n; k++) {
    const c = add(a, u, off + (k + 0.5) * seg);
    if (own.some((o) => shapeDist(o, c.x, c.z) < -1)) continue;
    if (others.some((o) => shapeDist(o, c.x, c.z) < 0.6)) return false;
    if (heightAt(ctx.h, c.x, c.z) < 0.6) return false;
    segs.push(c);
  }
  if (segs.length < 2) return false;
  const rotY = ang(u.x, u.z);
  for (const c of segs)
    ctx.fixtures.push({ defId: 'conveyor', x: c.x, z: c.z, rotY, islandId: isl.id });
  const mid = add(a, u, L / 2);
  const corridor = rectShape(mid.x, mid.z, rotY + Math.PI / 2, L, 1.4);
  addShape(ctx, isl, corridor, false);
  addPad(ctx, isl, corridor, 0.5);
  return true;
}

/**
 * Lava foundry: furnace halls on the upper step (mouths to the sea), a rail line along the lower
 * shelf, smithies inland of it and worker lodges seaward. The rail is a 'rail' polyline.
 */
export function placeFoundry(ctx: SiteCtx, isl: IslandData, plan: SitePlan, rng: Rng): XZ[] {
  const Fd = S.foundry;
  const lower = isl.anchors.foundry;
  const upper = isl.anchors.foundryUpper;
  const furnaces: XZ[] = [];
  if (!lower) return furnaces;
  const fit: FitOpts = {
    search: Fd.search,
    minShore: Fd.minShore,
    maxRelief: Fd.maxRelief,
    gap: 1.2,
  };
  if (upper) {
    const U = frameOf(upper);
    const n = rng.int(Fd.furnaces[0], Fd.furnaces[1]);
    for (let k = 0; k < n; k++) {
      const p = fixtureNear(
        ctx,
        isl,
        'foundry',
        U.at((k - (n - 1) / 2) * Fd.furnaceSide, 0),
        U.rotY,
        W.foundry.footprint,
        { ...fit, maxRelief: Fd.maxRelief + 1 },
      );
      if (p) furnaces.push(p);
      if (p)
        paintZone(
          ctx,
          isl,
          { ...rectShape(p.x, p.z, U.rotY, Fd.yardR * 2, Fd.yardR * 2) },
          Zone.plaza,
        );
    }
  }
  const F = frameOf(lower);
  const rail = railLine(ctx, isl, F);
  if (!rail) return furnaces;
  const [ra, rb] = rail;
  (plan.lines ??= []).push({ islandId: isl.id, kind: 'rail', closed: false, points: [ra, rb] });
  const ru = unit(ra, rb);
  const L = dist(ra, rb);
  const mid = add(ra, ru, L / 2);
  // small level pads along the rail (a long corridor pad would be tied to the upper step)
  const nPads = Math.max(2, Math.round(L / Fd.railPad) + 1);
  for (let k = 0; k < nPads; k++) {
    const c = add(ra, ru, (L * k) / (nPads - 1));
    addPad(ctx, isl, discShape(c.x, c.z, 1.4), 0.4);
  }
  addShape(ctx, isl, rectShape(mid.x, mid.z, ang(ru.x, ru.z) + Math.PI / 2, L, 2.2), false);
  plan.links.push({ pin: add(mid, F.f, 1.8), kind: 'path', done: () => undefined });
  // the shop row seaward of the rail, doors to the rail: smithies and lodges alternate; a slot
  // the preferred one does not fit takes the other (the smaller lodge first)
  const ns = rng.int(Fd.smithies[0], Fd.smithies[1]);
  const nl = rng.int(Fd.lodges[0], Fd.lodges[1]);
  const n = ns + nl;
  let smithies = 0;
  let lodges = 0;
  const shop = (def: 'smithy' | 'cottage', at: XZ): boolean => {
    const size = def === 'smithy' ? W.smithy.footprint : LOT_FOOTPRINT.cottage;
    const v = def === 'cottage' ? 0 : undefined;
    return !!fixtureNear(
      ctx,
      isl,
      def,
      at,
      F.rotY + Math.PI,
      size,
      { ...fit, search: Fd.shopSearch },
      v,
    );
  };
  for (let k = 0; k < n; k++) {
    const at = add(add(mid, ru, (k - (n - 1) / 2) * Fd.pitch), F.f, Fd.rowOff);
    const first = (k % 2 === 0 && smithies < ns) || lodges >= nl ? 'smithy' : 'cottage';
    const other = first === 'smithy' ? 'cottage' : 'smithy';
    const def = shop(first, at) ? first : shop(other, at) ? other : null;
    if (def === 'smithy') smithies++;
    else if (def === 'cottage') lodges++;
  }
  return furnaces;
}

/** The longest level straight run along the shelf tangent near its anchor (≥ rail[0] u). */
function railLine(ctx: SiteCtx, isl: IslandData, F: Frame): [XZ, XZ] | null {
  const Fd = S.foundry;
  let best: [XZ, XZ] | null = null;
  let bl = 0;
  for (const dv of Fd.railOut) {
    const c = F.at(0, dv);
    if (!onIsland(ctx, isl, c.x, c.z)) continue;
    const y0 = heightAt(ctx.h, c.x, c.z);
    const ok = (q: XZ): boolean =>
      onIsland(ctx, isl, q.x, q.z) &&
      sdfAt(ctx, q.x, q.z) >= Fd.minShore + 0.5 &&
      Math.abs(heightAt(ctx.h, q.x, q.z) - y0) <= 0.8 &&
      ctx.shapes[isl.id].every((o) => o.tag === 'plaza' || shapeDist(o, q.x, q.z) > 1.4) &&
      levelSafe(ctx, isl, discShape(q.x, q.z, 1.4), 0.4);
    if (!ok(c)) continue;
    const ends: XZ[] = [];
    for (const sgn of [-1, 1]) {
      let s = 0;
      while (s < Fd.rail[1] / 2 && ok(add(c, F.t, sgn * (s + 1)))) s += 1;
      ends.push(add(c, F.t, sgn * s));
    }
    const L = dist(ends[0], ends[1]);
    if (L > bl + 1) {
      bl = L;
      best = [ends[0], ends[1]];
    }
  }
  return best && bl >= Fd.rail[0] ? best : null;
}
