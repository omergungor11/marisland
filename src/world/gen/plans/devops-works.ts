/**
 * DevOps "Ember Works" (TASK-405): the facilities on the three cone-foot shelves of Emberpeak
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
import { DEVOPS_CULTURE, DEVOPS_CULTURE_SITE } from '../../../content/cultures/devops.ts';
import { DEVOPS_WORKS as W } from '../../../content/props-themes/devops.ts';
import { FLATTEN, LOT_FOOTPRINT, VILLAGE } from '../../../content/settlements.ts';
import { QA_FACTORY } from '../../../content/themes/qa.ts';
import { DEVOPS_SITE } from '../../../content/themes/devops.ts';
import { heightAt, THEME_IDS, Zone } from '../../types.ts';
import type { DistrictData, FixtureData, IslandData, StorySpot, XZ } from '../../types.ts';
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
  ring,
  sdfAt,
  shapeDist,
  shapesOverlap,
  siteFree,
  tryLot,
  unit,
  type Shape,
  type SiteCtx,
  type SitePlan,
} from '../sites.ts';

const S = DEVOPS_SITE;
const C = DEVOPS_CULTURE_SITE;

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
        // TASK-422: the first hall rings the forge bell (foundry v1), the others stay v0
        furnaces.length === 0 ? C.forgeBellVariant : 0,
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

/* ------------------------------------------------------------------------------------------ */
/* TASK-422 "Kor Demircileri" (Ember Smiths): the culture kit placed on the facilities above.   */
/* ------------------------------------------------------------------------------------------ */

/** Local (x, z) of a fixture facing `rotY` → world (local +z = dirOf(rotY), +x = (sin, −cos)). */
const local = (p: XZ, rotY: number, x: number, z: number): XZ => ({
  x: p.x + Math.sin(rotY) * x + Math.cos(rotY) * z,
  z: p.z - Math.cos(rotY) * x + Math.sin(rotY) * z,
});

interface SpotOpts {
  r: number;
  /** Stay within `tol` u of height `y` (same shelf / pad level). */
  y?: number;
  tol?: number;
  minShore?: number;
  maxRelief?: number;
  /** Obstacles this spot may touch (its own facility's shapes). */
  ignore?: (o: Shape) => boolean;
  /** Footpath pins to keep clear (the path leaves there). */
  pins?: readonly XZ[];
  /** Block the footpath grid under it (kitFixture). */
  block?: boolean;
  /** Keep out of the falloff of pads on another level (props out on open slopes). */
  falloff?: boolean;
}

/** A small kit prop fits at `p`: on land, level, clear of every other obstacle. */
function spotOk(ctx: SiteCtx, isl: IslandData, p: XZ, o: SpotOpts): boolean {
  if (!onIsland(ctx, isl, p.x, p.z) || sdfAt(ctx, p.x, p.z) < (o.minShore ?? 1)) return false;
  const y = heightAt(ctx.h, p.x, p.z);
  if (y < 0.5 || (o.y !== undefined && Math.abs(y - o.y) > (o.tol ?? 0.6))) return false;
  const sh = discShape(p.x, p.z, o.r);
  if (relief(ctx, sh) > (o.maxRelief ?? C.maxRelief)) return false;
  if (o.pins?.some((q) => dist(q, p) < C.pinClear + o.r)) return false;
  for (const s of ctx.shapes[isl.id])
    if (s.tag !== 'plaza' && !o.ignore?.(s) && shapesOverlap(s, sh, C.gap)) return false;
  if (!levelSafe(ctx, isl, sh, C.padMargin)) return false;
  // nor inside the falloff of a pad on another level (the ground there tilts after flattening)
  if (o.falloff)
    for (const q of ctx.pads) {
      if (q.islandId !== isl.id || o.ignore?.(q.shape)) continue;
      if (Math.abs(heightAt(ctx.h, q.shape.x, q.shape.z) - y) <= C.falloffTol) continue;
      if (shapeDist(q.shape, p.x, p.z) < q.margin + FLATTEN.falloff + o.r) return false;
    }
  return true;
}

/**
 * A kit prop: the fixture, its disc obstacle and a small level pad. `block`: footpaths route round
 * it (off for props by the pier root and the lot doors, where a blocked disc can cut a link).
 */
function kitFixture(
  ctx: SiteCtx,
  isl: IslandData,
  defId: string,
  p: XZ,
  rotY: number,
  r: number,
  variant?: number,
  block = false,
): void {
  ctx.fixtures.push({
    defId,
    x: p.x,
    z: p.z,
    rotY,
    islandId: isl.id,
    ...(variant === undefined ? {} : { variant }),
  });
  const sh = discShape(p.x, p.z, r);
  addShape(ctx, isl, sh, block);
  addPad(ctx, isl, sh, C.padMargin);
}

/** First spot of `cands` that fits; pushes the fixture + its (non-blocking) disc. */
function kitAt(
  ctx: SiteCtx,
  isl: IslandData,
  defId: string,
  cands: readonly XZ[],
  rotY: (p: XZ) => number,
  o: SpotOpts,
  variant?: number,
): XZ | null {
  for (const p of cands) {
    if (!spotOk(ctx, isl, p, o)) continue;
    kitFixture(ctx, isl, defId, p, rotY(p), o.r, variant, o.block);
    return p;
  }
  return null;
}

const islandFx = (ctx: SiteCtx, isl: IslandData, defId: string): FixtureData[] =>
  ctx.fixtures.filter((f) => f.islandId === isl.id && f.defId === defId);

/** Obstacle centred on a segment of `pts` (a rail corridor / pipe run rect). */
const onLine =
  (pts: readonly XZ[]) =>
  (o: Shape): boolean =>
    o.r === 0 && pts.some((q, j) => j > 0 && segDist(o, pts[j - 1], q) < 0.05);

type StoryFn = (kind: string, p: XZ, dy: number, rotY: number) => void;

/** Story spot writer into `out` (defs from the culture ledger, pos.y = dy above the ground). */
function storyInto(isl: IslandData, out: StorySpot[]): StoryFn {
  return (kind, p, dy, rotY) => {
    const def = DEVOPS_CULTURE.storySpots.find((s) => s.kind === kind);
    out.push({
      kind,
      islandId: isl.id,
      // y above the ground: buildSettlements resolves it once the pads are flat
      pos: { x: p.x, y: dy, z: p.z },
      rotY,
      defs: def?.defs ?? [],
    });
  };
}

/**
 * The onsen (placed first, right after the pool landmark, so the cooling towers and pipes keep
 * off the bath): story spots appended to `stories`.
 */
export function placeOnsen(
  ctx: SiteCtx,
  isl: IslandData,
  spring: XZ,
  centre: XZ,
  stories: StorySpot[],
): void {
  onsen(ctx, isl, spring, centre, storyInto(isl, stories));
}

/**
 * Place the rest of the Ember Smiths kit (ISLAND_CULTURES §2.3) around the finished facilities;
 * story spots appended to `stories`. Everything draws from `rng` (the island's `culture` fork);
 * counts and offsets live in DEVOPS_CULTURE_SITE.
 */
export function placeCulture(
  ctx: SiteCtx,
  isl: IslandData,
  plan: SitePlan,
  rng: Rng,
  site: { root: XZ | null; terraces: readonly number[]; centre: XZ },
  stories: StorySpot[],
): void {
  const story = storyInto(isl, stories);
  const yardFx = islandFx(ctx, isl, 'containerYard')[0];
  const pins = plan.links.map((l) => l.pin);
  if (site.root)
    gate(ctx, isl, site.root, yardFx ?? site.centre, yardFx ? 'yard' : 'none', story, pins);
  if (yardFx) {
    quayKit(ctx, isl, yardFx, story, pins);
    crates(ctx, isl, yardFx, rng.fork('crates'));
  }
  foundryKit(ctx, isl, plan, rng.fork('ingots'), story, pins);
  shrine(ctx, isl, site.terraces, pins);
}

/** Onsen deck on the hot-spring rim (facing the pool) + the bath house beside / behind it. */
function onsen(ctx: SiteCtx, isl: IslandData, spring: XZ, centre: XZ, story: StoryFn): void {
  const O = C.onsen;
  const pool = (o: Shape): boolean => o.r > 0 && dist(o, spring) < 0.05;
  const inland = unit(spring, centre);
  const rectOk = (p: XZ, rotY: number, w: number, d: number, margin: number): boolean => {
    const sh = rectShape(p.x, p.z, rotY, w, d);
    if (!onLand(ctx, isl, sh, O.minShore) || relief(ctx, sh) > O.maxRelief) return false;
    for (const s of ctx.shapes[isl.id])
      if (s.tag !== 'plaza' && !pool(s) && shapesOverlap(s, sh, 0.4)) return false;
    return siteFree(ctx, isl, sh) && levelSafe(ctx, isl, sh, margin);
  };
  // deck spots on the pool rim (one radius ring, the nearest that has any), best first
  let decks: { p: XZ; rot: number; s: number }[] = [];
  for (const r of O.deckOff) {
    for (let k = 0; k < O.angles; k++) {
      const d = dirOf((k / O.angles) * Math.PI * 2);
      const p = add(spring, d, r);
      const rot = ang(-d.x, -d.z);
      if (!rectOk(p, rot, O.deck[0], O.deck[1], O.deckMargin)) continue;
      const rel = relief(ctx, rectShape(p.x, p.z, rot, O.deck[0], O.deck[1]));
      decks.push({ p, rot, s: rel + (O.inland * (1 - (d.x * inland.x + d.z * inland.z))) / 2 });
    }
    if (decks.length > 0) break;
  }
  if (decks.length === 0) return;
  decks = decks.sort((a, b) => a.s - b.s).slice(0, O.deckTries);
  // the bath house: the flattest spot on a ring round the pool at its level, nearest the deck,
  // door to the pool; the first deck spot that leaves room for one wins
  const [hw, hd] = O.house;
  const y0 = heightAt(ctx.h, spring.x, spring.z);
  const homes = ring(spring, O.houseRing[0], O.houseRing[1], 1, O.angles, 0)
    .filter((q) => Math.abs(heightAt(ctx.h, q.x, q.z) - y0) <= O.houseLevel)
    .map((q) => {
      const face = unit(q, spring);
      return { q, rot: ang(face.x, face.z) };
    })
    .filter((h) => rectOk(h.q, h.rot, hw, hd, FLATTEN.lotMargin));
  let pick = { deck: decks[0], house: null as { q: XZ; rot: number } | null };
  for (const deck of decks) {
    const dsh = rectShape(deck.p.x, deck.p.z, deck.rot, O.deck[0], O.deck[1]);
    let bs = Infinity;
    for (const h of homes) {
      if (shapesOverlap(dsh, rectShape(h.q.x, h.q.z, h.rot, hw, hd), 0.4)) continue;
      const sc =
        relief(ctx, rectShape(h.q.x, h.q.z, h.rot, hw, hd)) + O.houseNear * dist(h.q, deck.p);
      if (sc < bs) {
        bs = sc;
        pick = { deck, house: h };
      }
    }
    if (pick.house) break;
  }
  const { p, rot } = pick.deck;
  putFixture(ctx, isl, 'onsenDeck', p, rot, O.deck[0], O.deck[1], undefined, O.deckMargin, false);
  const [cx, cz, cy] = O.capybara;
  story('onsenCapybara', local(p, rot, cx, cz), cy, rot);
  const h = pick.house;
  if (h) putFixture(ctx, isl, 'onsenHouse', h.q, h.rot, hw, hd, undefined, FLATTEN.lotMargin);
}

/** The gate (pier root): incident sign + a siren across the lane, lava lanterns to the yard. */
function gate(
  ctx: SiteCtx,
  isl: IslandData,
  root: XZ,
  to: XZ,
  kind: 'yard' | 'none',
  story: StoryFn,
  pins: readonly XZ[],
): void {
  const u = unit(root, to);
  const n = { x: -u.z, z: u.x };
  const I = C.incident;
  let signSide = 0;
  find: for (const [along, off] of I.at)
    for (const sg of [1, -1]) {
      const side = { x: n.x * sg, z: n.z * sg };
      const p = add(add(root, u, along), side, off);
      // the board faces the pier root: crews read it as they come ashore
      const to = unit(p, root);
      const face = ang(to.x, to.z);
      const o = { pins, r: 1.1, maxRelief: I.maxRelief, minShore: I.minShore };
      if (!kitAt(ctx, isl, 'incidentSign', [p], () => face, o, I.variant)) continue;
      story('incidentWatch', add(p, to, 1.8), 0, face + Math.PI);
      signSide = sg;
      break find;
    }
  // the harbour siren across the lane from the sign (either side without one)
  const [ha, hs] = C.horns.pier;
  const hc = (signSide ? [-signSide] : [1, -1]).flatMap((sg) =>
    ha.map((a) => add(add(root, u, a), n, sg * hs)),
  );
  kitAt(ctx, isl, 'signalHorn', hc, () => ang(u.x, u.z), {
    pins,
    r: 0.6,
    maxRelief: C.horns.maxRelief,
  });
  const L = C.lanterns;
  const len = kind === 'yard' ? dist(root, to) - W.yard.footprint[1] / 2 - 1 : 18;
  let made = 0;
  for (let s = L.avenueStart; s <= len && made < L.avenueMax; s += L.avenuePitch)
    for (const sg of [1, -1]) {
      const p = add(add(root, u, s), n, sg * L.avenueOff);
      if (kitAt(ctx, isl, 'lavaLantern', [p], () => ang(u.x, u.z), { pins, r: 0.35 })) made++;
    }
  // the rest along the quay edge, spaced off every lamp already standing there
  const a = isl.anchors.harbour;
  if (!a) return;
  const H = S.harbour;
  const F = frameOf(a);
  const lamps = ctx.fixtures.filter(
    (f) => f.islandId === isl.id && (f.defId === 'lanternPost' || f.defId === 'lavaLantern'),
  );
  for (let du = -H.paveR; du <= H.paveR && made < L.quayMax; du += 1)
    for (let dv = -H.paveR; dv <= H.paveR && made < L.quayMax; dv += 1) {
      const p = F.at(du, dv);
      if (dist(p, a) > H.paveR || heightAt(ctx.h, p.x, p.z) > H.maxY) continue;
      const sd = sdfAt(ctx, p.x, p.z);
      if (sd < H.quay.lampShore[0] || sd > H.quay.lampShore[1]) continue;
      if (lamps.some((q) => dist(q, p) < L.quayGap)) continue;
      if (!kitAt(ctx, isl, 'lavaLantern', [p], () => F.rotY, { pins, r: 0.35 })) continue;
      lamps.push(ctx.fixtures[ctx.fixtures.length - 1]);
      made++;
    }
}

/** Container yard: the pager rock by the control tower; the cat / nap story spots. */
function quayKit(
  ctx: SiteCtx,
  isl: IslandData,
  yard: FixtureData,
  story: StoryFn,
  pins: readonly XZ[],
): void {
  const rot = yard.rotY;
  const f = dirOf(rot);
  const lx = { x: f.z, z: -f.x };
  const tower = add(add(yard, lx, W.yard.tower.x), f, W.yard.tower.z);
  const pin = add(tower, f, 2.6);
  // no incident sign at the pier root: it stands by the tower path instead, facing its walkers
  const I = C.incident;
  if (islandFx(ctx, isl, 'incidentSign').length === 0) {
    const sc = I.tower.x.map((x) => add(add(pin, lx, x), f, I.tower.z));
    const o = { pins: pins.filter((q) => dist(q, pin) > 0.01), r: 1.1, maxRelief: I.maxRelief };
    const s = kitAt(ctx, isl, 'incidentSign', sc, () => rot, o, I.variant);
    if (s) story('incidentWatch', add(s, f, 1.8), 0, rot + Math.PI);
  }
  const P = C.pager;
  const pc = [
    ...P.out.flatMap((o) => P.side.map((s) => add(add(tower, f, o), lx, s))),
    ...P.end.map(([x, z]) => add(add(tower, lx, x), f, z)),
  ].filter((p) => dist(p, pin) >= P.pinClear);
  const pager = kitAt(ctx, isl, 'pagerRock', pc, (p) => ang(p.x - tower.x, p.z - tower.z), {
    pins,
    r: 0.6,
    maxRelief: 1,
  });
  if (pager) story('pagerCrab', pager, 0, 0);
  story('craneCat', add(yard, lx, W.yard.crane.x), W.crane.top, rot);
  const row = islandFx(ctx, isl, 'containerRow')[0];
  if (row) story('containerNap', row, 2 * W.container.h, row.rotY);
  else story('containerNap', yard, W.stack.tiers[0] * W.container.h, rot);
}

/**
 * Foundry: the first furnace hall's ingot stacks (hot v0 by the mouth → cooled v2 away from it)
 * and a siren at its yard edge; an anvil outside each smithy door; lava lanterns along the
 * rail's seaward side and the ore-cart flower at its far end.
 */
function foundryKit(
  ctx: SiteCtx,
  isl: IslandData,
  plan: SitePlan,
  rng: Rng,
  story: StoryFn,
  pins: readonly XZ[],
): void {
  const halls = islandFx(ctx, isl, 'foundry');
  const furnace = halls[0];
  if (furnace) {
    const y = heightAt(ctx.h, furnace.x, furnace.z);
    const G = C.ingots;
    const n = rng.int(G.count[0], G.count[1]);
    const own = (o: Shape): boolean => o.r === 0 && dist(o, furnace) < 0.05;
    // the row beside a hall's mouth (the first hall first), the longest one wins
    let best: { at: XZ[]; rot: number } = { at: [], rot: 0 };
    for (const h of halls)
      for (const sg of [1, -1]) {
        const got: XZ[] = [];
        const mine = (o: Shape): boolean => o.r === 0 && dist(o, h) < 0.05;
        const yh = heightAt(ctx.h, h.x, h.z);
        for (let k = 0; k < n; k++) {
          const ax = sg * (G.along[0] + k * G.along[1]);
          const p = local(h, h.rotY, ax, G.out[0] + k * G.out[1]);
          const o = { pins, r: 0.75, y: yh, tol: 0.6, ignore: mine, maxRelief: G.maxRelief };
          if (!spotOk(ctx, isl, p, o)) break;
          got.push(p);
        }
        if (got.length > best.at.length) best = { at: got, rot: h.rotY };
      }
    const m = best.at.length;
    for (const [k, p] of best.at.entries()) {
      const v = m > 1 ? Math.round((k * 2) / (m - 1)) : 0;
      kitFixture(ctx, isl, 'ingotStack', p, best.rot + (k % 2 ? 0.25 : -0.25), 0.75, v, true);
    }
    const [hx, hz] = C.horns.furnace;
    kitAt(
      ctx,
      isl,
      'signalHorn',
      [-hx, hx].map((x) => local(furnace, furnace.rotY, x, hz)),
      () => furnace.rotY,
      { pins, r: 0.6, y, tol: 0.6, ignore: own, maxRelief: C.horns.maxRelief, block: true },
    );
  }
  let hammer = false;
  for (const s of islandFx(ctx, isl, 'smithy').slice(0, C.anvils.max)) {
    const [ax, az] = C.anvils.at;
    const dz = W.smithy.footprint[1] / 2 + az;
    const sx = W.smithy.footprint[0] / 2 + C.anvils.side;
    const cands = [
      ...[ax, -ax].map((x) => local(s, s.rotY, x, dz)),
      ...[sx, -sx].map((x) => local(s, s.rotY, x, 0.6)),
    ];
    const a = kitAt(ctx, isl, 'anvil', cands, () => s.rotY + 0.4, { pins, r: 0.45, block: true });
    // a smith at the first anvil (hammer pose), standing on its door side
    if (a && !hammer) {
      hammer = true;
      story('anvilHammer', add(a, dirOf(s.rotY), 0.9), 0, s.rotY + Math.PI);
    }
  }
  const rail = plan.lines?.find((l) => l.islandId === isl.id && l.kind === 'rail');
  if (!rail) return;
  const a = rail.points[0];
  const b = rail.points[rail.points.length - 1];
  const u = unit(a, b);
  const len = dist(a, b);
  // seaward = away from the furnace step
  const away = furnace ? unit(furnace, add(a, u, len / 2)) : { x: -u.z, z: u.x };
  const sg = away.x * -u.z + away.z * u.x >= 0 ? 1 : -1;
  const n = { x: -u.z * sg, z: u.x * sg };
  const y = heightAt(ctx.h, a.x, a.z);
  const L = C.lanterns;
  const ignore = onLine(rail.points);
  let made = 0;
  for (let s = 1; s <= len - 1 && made < L.railMax; s += L.railPitch) {
    // seaward side first, else the step side
    const cands = [1, -1].map((k) => add(add(a, u, s), n, k * L.railOff));
    const o = { pins, r: 0.35, y, tol: 0.8, ignore, block: true };
    if (kitAt(ctx, isl, 'lavaLantern', cands, () => ang(n.x, n.z), o)) made++;
  }
  story('cartFlower', add(b, u, -1), W.rail.top, ang(u.x, u.z));
}

/** The server shrine beside the top data center hall, facing out to sea with it. */
function shrine(
  ctx: SiteCtx,
  isl: IslandData,
  terraces: readonly number[],
  pins: readonly XZ[],
): void {
  const S2 = C.shrine;
  for (const li of terraces) {
    const l = ctx.lots[li];
    const y = heightAt(ctx.h, l.x, l.z);
    const c = [1, -1].flatMap((sg) => [
      local(l, l.rotY, sg * (l.w / 2 + S2.side), l.d / 2 + S2.front),
      local(l, l.rotY, sg * (l.w / 2 - S2.inset), l.d / 2 + S2.apron),
    ]);
    if (kitAt(ctx, isl, 'serverShrine', c, () => l.rotY, { pins, r: 0.8, y, tol: 0.8 })) return;
  }
}

/** Valve wheels beside the longest run of each pipe line (wheel facing away from the pipe). */
export function placeValves(ctx: SiteCtx, isl: IslandData, plan: SitePlan): void {
  const V = C.valves;
  let made = 0;
  for (const line of plan.lines ?? []) {
    if (made >= V.max) break;
    if (line.islandId !== isl.id || line.kind !== 'pipe') continue;
    const pts = line.points;
    const runs = pts
      .map((q, j) => ({ j, L: j > 0 ? dist(pts[j - 1], q) : 0 }))
      .filter((r) => r.L >= V.minRun)
      .sort((a, b) => b.L - a.L);
    const ignore = onLine(pts);
    const o = {
      pins: plan.links.map((l) => l.pin),
      r: 0.8,
      maxRelief: V.maxRelief,
      ignore,
      falloff: true,
    };
    find: for (const { j, L } of runs) {
      const u = unit(pts[j - 1], pts[j]);
      for (const t of V.at)
        for (const sg of [1, -1]) {
          const m = add(pts[j - 1], u, L * t);
          const n = { x: -u.z * sg, z: u.x * sg };
          if (kitAt(ctx, isl, 'pipeValveWheel', [add(m, n, V.off)], () => ang(n.x, n.z), o)) {
            made++;
            break find;
          }
        }
    }
  }
}

/** Imported cargo crates (cargoCrate, THEME_IDS-order variants) in small piles beside the yard. */
function crates(ctx: SiteCtx, isl: IslandData, yard: FixtureData, rng: Rng): void {
  const K = C.crates;
  const H = S.harbour;
  const a = isl.anchors.harbour;
  if (!a) return;
  const cand: XZ[] = [];
  for (let u = -K.search; u <= K.search; u += 1.5)
    for (let v = -K.search; v <= K.search; v += 1.5) {
      const p = local(yard, yard.rotY, u, v);
      if (dist(p, a) > H.paveR || heightAt(ctx.h, p.x, p.z) > H.maxY) continue;
      cand.push(p);
    }
  // nearest the yard first: the crates wait beside the stacks
  const ysh = rectShape(yard.x, yard.z, yard.rotY, ...W.yard.footprint);
  cand.sort((p, q) => shapeDist(ysh, p.x, p.z) - shapeDist(ysh, q.x, q.z));
  for (const pile of K.piles) {
    const v = THEME_IDS.indexOf(pile.theme);
    const p = cand.find((q) => spotOk(ctx, isl, q, { r: K.pileR, minShore: H.quay.minShore }));
    if (!p) continue;
    for (let k = 0; k < pile.n; k++) {
      const off = k === 0 ? 0 : rng.range(0.45, K.pileR - 0.15);
      const q = add(p, dirOf(rng.range(0, Math.PI * 2)), off);
      const rotY = rng.range(0, Math.PI * 2);
      ctx.fixtures.push({
        defId: 'cargoCrate',
        x: q.x,
        z: q.z,
        rotY,
        islandId: isl.id,
        variant: v,
      });
    }
    addShape(ctx, isl, discShape(p.x, p.z, K.pileR), false);
  }
}
