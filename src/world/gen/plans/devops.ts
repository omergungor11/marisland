/**
 * DevOps island plan (Emberpeak volcano; M14b §2.3, TASK-364). The archetype supplies the cone,
 * the crater and the lee hot-spring terrace; the theme builds on them:
 * - Geothermal Plant: the hot spring becomes the cooling pool, two cooling towers beside it;
 * - Terraced Data Center: a staircase of level pads down the lee flank, one dataCenter each
 *   (concrete `Zone.plaza` written on every pad, `terrace` districts);
 * - Ops quad: the settlement plaza beside a terrace, at its level (network hub);
 * - Antenna Ridge: 2–3 antennaMast lots high on the rim shoulders;
 * - Rack Yard: rackShed lots + rackRow fixtures on the black-sand beach by the lee dock;
 * - Pipeline: a 'pipe' polyline from the plant to the nearest data center.
 * Every random decision draws from labelled forks of `rng`; tuning lives in DEVOPS_SITE.
 */
import type { Rng } from '../../../core/rng.ts';
import { FLATTEN, LOT_FOOTPRINT, VILLAGE } from '../../../content/settlements.ts';
import { DEVOPS_SITE } from '../../../content/themes/devops.ts';
import { heightAt, Zone } from '../../types.ts';
import type { DistrictData, IslandData, XZ } from '../../types.ts';
import { cellX, cellZ, gridRange } from '../grid.ts';
import { leewardness } from '../heightfield.ts';
import { gridAStar } from '../paths.ts';
import {
  add,
  addPad,
  addShape,
  ang,
  bestSample,
  cellOf,
  cellPos,
  clear,
  discShape,
  dist,
  dirOf,
  dockWithLink,
  findDock,
  islandWindow,
  linkLandmark,
  linkLot,
  newPlan,
  onIsland,
  onLand,
  pushLandmark,
  rectShape,
  relief,
  ring,
  sdfAt,
  seedHub,
  shapeDist,
  shapesOverlap,
  siteFree,
  tryLot,
  unit,
  type Shape,
  type SiteCtx,
  type SitePlan,
} from '../sites.ts';
import type { ThemePlanner } from './types.ts';

const S = DEVOPS_SITE;
const DC = 'dataCenter';

/** Lot-pad bound used by the flatten relaxation (settlements.ts applyPads). */
const padBound = (def: string): number => {
  const [w, d] = LOT_FOOTPRINT[def];
  return Math.hypot(w / 2, d / 2) + FLATTEN.lotMargin;
};

export const planDevops: ThemePlanner = ({ ctx, isl, rng, sIdx }) => {
  const crater = isl.anchors.crater;
  const spring = isl.anchors.hotspring;
  const craterLm = crater ? pushLandmark(ctx, isl, 'volcanoCrater', crater, 0) : -1;
  if (!spring) return null;
  const pool = pushLandmark(ctx, isl, 'hotSpring', spring, spring.rotY);
  const plan = newPlan('devops', spring);
  if (craterLm >= 0) plan.landmarks.push(craterLm);
  plan.landmarks.push(pool);
  const centre: XZ = crater ?? { x: isl.cx, z: isl.cz };

  const towers = placePlant(ctx, isl, spring);
  const plant = [spring, ...towers];

  // terraced data center, then the ops quad beside one of its pads
  const terraces = placeTerraces(ctx, isl, centre, plant, sIdx);
  for (const li of terraces) {
    const l = ctx.lots[li];
    const sh = rectShape(l.x, l.z, l.rotY, l.w + 2 * S.terraces.apron, l.d + 2 * S.terraces.apron);
    paintZone(ctx, isl, sh, Zone.plaza);
    plan.districts.push(district(isl, 'terrace', sh, l.rotY));
  }
  const top = terraces.length > 0 ? ctx.lots[terraces[0]] : null;
  const quad = placeQuad(ctx, isl, plan, terraces, plant);
  const hub = quad ?? (top ? add(top, dirOf(top.rotY), top.d / 2 + 1.5) : spring);
  plan.hub = hub;
  if (seedHub(ctx, isl, plan, hub) < 0)
    plan.links.push({ pin: hub, kind: 'path', done: () => undefined });

  for (const li of terraces) linkLot(ctx, plan, li);
  linkLandmark(ctx, plan, pool, hub);

  // antenna ridge high on the cone
  // pads that must not share a level with a terrace (or the quad tied to one) keep > both
  // relaxation bounds away
  const quadBound = S.quad.radius + FLATTEN.discMargin;
  const offTerraces = (p: XZ, def: string): boolean =>
    terraces.every((li) => dist(ctx.lots[li], p) > padBound(DC) + padBound(def)) &&
    (!quad || dist(quad, p) > quadBound + padBound(def));
  const masts = placeRidge(ctx, isl, centre, hub, rng.fork('ridge'), sIdx, offTerraces);
  // lee dock, rack yard on the beach beside it
  const site = findDock(ctx, isl, {
    near: hub,
    maxDist: isl.reach + 10,
    prefer: hub,
    lee: 40,
    carve: true,
  });
  const boats = rng.fork('boats');
  dockWithLink(ctx, isl, plan, site, rng.fork('moorings'), {
    rowboats: boats.int(S.dock.rowboats[0], S.dock.rowboats[1]),
    sailboats: 0,
  });
  const yard = site ? placeYard(ctx, isl, site.root, rng.fork('yard'), sIdx, offTerraces) : null;
  if (yard) {
    plan.districts.push(yard.district);
    for (const li of yard.lots) linkLot(ctx, plan, li);
  }
  for (const li of masts) linkLot(ctx, plan, li);

  // pipeline: plant → nearest data center
  if (towers.length > 0 && terraces.length > 0) {
    let best = terraces[0];
    for (const li of terraces)
      if (dist(ctx.lots[li], towers[0]) < dist(ctx.lots[best], towers[0])) best = li;
    const line = routePipe(ctx, isl, towers, ctx.lots[best]);
    if (line)
      (plan.lines ??= []).push({ islandId: isl.id, kind: 'pipe', closed: false, points: line });
  }
  return plan;
};

// ---------------------------------------------------------------------------

/** Write `zone` on this island's land samples inside `sh`. */
function paintZone(ctx: SiteCtx, isl: IslandData, sh: Shape, zone: number): void {
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

function district(
  isl: IslandData,
  kind: DistrictData['kind'],
  sh: Shape,
  rotY: number,
): DistrictData {
  return { islandId: isl.id, kind, x: sh.x, z: sh.z, rotY, w: sh.hw * 2, d: sh.hd * 2 };
}

/** Two cooling towers on the hot-spring terrace beside the pool (fixtures with level pads). */
function placePlant(ctx: SiteCtx, isl: IslandData, spring: XZ): XZ[] {
  const P = S.plant;
  const cand = ring(spring, P.ring[0], P.ring[1], 0.5, 36, 0);
  const towers: XZ[] = [];
  for (let k = 0; k < 2; k++) {
    let best: XZ | null = null;
    let bs = Infinity;
    for (const p of cand) {
      if (k === 1) {
        const d = dist(p, towers[0]);
        if (d < P.pair[0] || d > P.pair[1]) continue;
      }
      const sh = discShape(p.x, p.z, P.radius);
      if (!onLand(ctx, isl, sh, P.minShore) || !clear(ctx, isl, sh, 1)) continue;
      const r = relief(ctx, sh);
      if (r > P.maxRelief) continue;
      const s = r + 0.15 * dist(p, spring);
      if (s < bs) {
        bs = s;
        best = p;
      }
    }
    if (!best) break;
    const face = unit(best, spring);
    ctx.fixtures.push({
      defId: 'coolingTower',
      x: best.x,
      z: best.z,
      rotY: ang(face.x, face.z),
      islandId: isl.id,
    });
    const sh = discShape(best.x, best.z, P.radius);
    addShape(ctx, isl, sh, true);
    addPad(ctx, isl, sh, FLATTEN.discMargin);
    paintZone(ctx, isl, discShape(best.x, best.z, P.radius + 1), Zone.plaza);
    towers.push(best);
  }
  return towers;
}

/** A dataCenter footprint at `p`, door facing downhill (away from the crater); null = no fit. */
function terraceFit(ctx: SiteCtx, isl: IslandData, centre: XZ, p: XZ): TerraceFit | null {
  const T = S.terraces;
  const [w, d] = LOT_FOOTPRINT[DC];
  const u = unit(centre, p);
  const rotY = ang(u.x, u.z);
  const sh = rectShape(p.x, p.z, rotY, w, d);
  const yc = heightAt(ctx.h, p.x, p.z);
  if (yc < T.y[0] - 2 || yc > T.y[1] + 2 || !onLand(ctx, isl, sh, T.minShore)) return null;
  const r = relief(ctx, sh);
  if (r > T.maxRelief) return null;
  if (!clear(ctx, isl, sh, VILLAGE.lotGap) || !siteFree(ctx, isl, sh)) return null;
  const y = padLevel(ctx, isl, sh);
  if (y < T.y[0] || y > T.y[1]) return null;
  return { p, rotY, relief: r, y };
}

interface TerraceFit {
  p: XZ;
  rotY: number;
  relief: number;
  /** Pad level the flatten pass will give it (mean footprint height). */
  y: number;
}

/** Mean height of this island's land samples under `sh` (applyPads' pad level, before relaxing). */
function padLevel(ctx: SiteCtx, isl: IslandData, sh: Shape): number {
  const R = Math.hypot(sh.hw, sh.hd) + 1;
  const [x0, x1] = gridRange(sh.x - R, sh.x + R);
  const [z0, z1] = gridRange(sh.z - R, sh.z + R);
  let sum = 0;
  let cnt = 0;
  for (let iz = z0; iz <= z1; iz++)
    for (let ix = x0; ix <= x1; ix++) {
      const i = iz * ctx.n + ix;
      if (ctx.islandMap[i] !== isl.id + 1 || ctx.sdf[i] <= 0) continue;
      if (shapeDist(sh, cellX(ix), cellZ(iz)) > 0.5) continue;
      sum += ctx.h.data[i];
      cnt++;
    }
  return Math.max(FLATTEN.minHeight, cnt > 0 ? sum / cnt : heightAt(ctx.h, sh.x, sh.z));
}

/**
 * Terraced data center: the best chain of `count` dataCenter pads stepping down the lee flank
 * (each next pad `spacing` away and `rise` lower, keeping its heading). Returns lot indices, top
 * first; empty when no chain of `count[0]` fits.
 */
function placeTerraces(
  ctx: SiteCtx,
  isl: IslandData,
  centre: XZ,
  plant: readonly XZ[],
  sIdx: number,
): number[] {
  const T = S.terraces;
  const spring = plant[0];
  const farFromPlant = (p: XZ): boolean => plant.every((q) => dist(p, q) >= T.plantClear);
  const target = T.count[1];
  /**
   * Grow `chain` at its end: each next pad `spacing` away, its level `rise` from the last one
   * in direction `sense` (0 = pick on the first step), keeping the heading; returns the sense.
   */
  const extend = (chain: TerraceFit[], others: readonly TerraceFit[], sense0: number): number => {
    let sense = sense0;
    let dir: XZ | null = null;
    while (chain.length + others.length < target) {
      const prev = chain[chain.length - 1];
      let next: TerraceFit | null = null;
      let nextSense = 0;
      let ns = Infinity;
      for (const q of ring(prev.p, T.spacing[0], T.spacing[1], 1, 32, 0)) {
        if (!farFromPlant(q) || !onIsland(ctx, isl, q.x, q.z)) continue;
        if (chain.some((c) => dist(c.p, q) < T.spacing[0])) continue;
        if (others.some((c) => dist(c.p, q) < T.spacing[0])) continue;
        // cheap pre-filter on the centre height, then the real pad level
        const dc = Math.abs(prev.y - heightAt(ctx.h, q.x, q.z));
        if (dc < T.rise[0] - 1.5 || dc > T.rise[1] + 1.5) continue;
        const step = unit(prev.p, q);
        const turn = dir ? 1 - (step.x * dir.x + step.z * dir.z) : 0;
        if (3 * turn >= ns) continue;
        const fit = terraceFit(ctx, isl, centre, q);
        if (!fit) continue;
        const dy = prev.y - fit.y;
        const rise = Math.abs(dy);
        if (rise < T.rise[0] || rise > T.rise[1] || (sense !== 0 && Math.sign(dy) !== sense))
          continue;
        const s = Math.abs(rise - T.riseTarget) + 3 * turn + 0.3 * fit.relief;
        if (s >= ns) continue;
        ns = s;
        next = fit;
        nextSense = Math.sign(dy);
      }
      if (!next) break;
      dir = unit(prev.p, next.p);
      sense = nextSense;
      chain.push(next);
    }
    return sense;
  };
  let best: TerraceFit[] = [];
  // lee flank first; any side of the plant when the lee holds no chain
  for (const minLee of T.lee) {
    // start candidates around the plant, flattest first (cheap relief, then the full fit)
    const cand: { p: XZ; s: number }[] = [];
    const R = T.fromPlant[1];
    const [x0, x1] = gridRange(spring.x - R, spring.x + R);
    const [z0, z1] = gridRange(spring.z - R, spring.z + R);
    for (let iz = z0; iz <= z1; iz++)
      for (let ix = x0; ix <= x1; ix++) {
        const i = iz * ctx.n + ix;
        if (ctx.islandMap[i] !== isl.id + 1 || ctx.sdf[i] < T.minShore) continue;
        const p = cellPos(ctx, i);
        const d = dist(p, spring);
        if (d < T.fromPlant[0] || d > T.fromPlant[1] || !farFromPlant(p)) continue;
        if (leewardness(isl, ctx.windDir, p.x, p.z) < minLee) continue;
        const y = heightAt(ctx.h, p.x, p.z);
        if (y < T.y[0] - 2 || y > T.y[1] + 2) continue;
        const u = unit(centre, p);
        const r = relief(ctx, rectShape(p.x, p.z, ang(u.x, u.z), ...LOT_FOOTPRINT[DC]));
        cand.push({ p, s: r + 0.05 * Math.abs(d - T.fromPlant[0] - 4) });
      }
    cand.sort((a, b) => a.s - b.s);
    let tried = 0;
    for (const c of cand) {
      if (tried >= T.starts || best.length >= target) break;
      const st = terraceFit(ctx, isl, centre, c.p);
      if (!st) continue;
      tried++;
      const fwd = [st];
      const sense = extend(fwd, [], 0);
      let chain = fwd;
      if (fwd.length < target && sense !== 0) {
        // the start may sit mid-staircase: grow the other way too
        const back = [st];
        extend(back, fwd.slice(1), -sense);
        chain = [...back.slice(1).reverse(), ...fwd];
      }
      if (chain.length > best.length) best = chain;
    }
    if (best.length >= T.count[0]) break;
  }
  // top first
  best.sort((a, b) => b.y - a.y);
  if (best.length < T.count[0]) return [];
  const lots: number[] = [];
  for (const t of best) {
    const li = tryLot(ctx, isl, DC, t.p, t.rotY, sIdx, {
      minShore: T.minShore,
      maxRelief: T.maxRelief,
    });
    if (li >= 0) lots.push(li);
  }
  return lots;
}

/**
 * Ops quad (the settlement plaza): a level disc beside a terrace, far enough from the other
 * terraces and the plant that the flatten relaxation never ties their levels together.
 */
function placeQuad(
  ctx: SiteCtx,
  isl: IslandData,
  plan: SitePlan,
  terraces: readonly number[],
  plant: readonly XZ[],
): XZ | null {
  const Q = S.quad;
  const r = Q.radius;
  const bound = r + FLATTEN.discMargin;
  const keep = padBound(DC) + bound + 0.5;
  const plantKeep = bound + S.plant.radius + FLATTEN.discMargin + 2;
  const lotOf = (li: number) => ctx.lots[li];
  /** Beside terrace `k` at its level (their pads relax together), clear of every other one. */
  const search = (k: number, R: number, maxRelief: number, tol: number) => {
    const t = k >= 0 ? lotOf(terraces[k]) : null;
    const level = t ? padLevel(ctx, isl, rectShape(t.x, t.z, t.rotY, t.w, t.d)) : 0;
    return bestSample(ctx, isl, t ?? plant[0], R, (p, i) => {
      if (ctx.sdf[i] < r + 2) return Infinity;
      if (terraces.some((li, j) => j !== k && dist(lotOf(li), p) < keep)) return Infinity;
      if (plant.some((q) => dist(q, p) < plantKeep)) return Infinity;
      const sh = discShape(p.x, p.z, r);
      const rel = relief(ctx, sh);
      if (rel > maxRelief || !clear(ctx, isl, sh, 1.5)) return Infinity;
      const dl = t ? Math.abs(padLevel(ctx, isl, sh) - level) : 0;
      if (dl > tol) return Infinity;
      return rel + dl + 0.08 * dist(p, t ?? plant[0]);
    });
  };
  let quad: XZ | null = null;
  for (const [maxRelief, R, tol] of Q.passes) {
    for (let k = 0; k < terraces.length && !quad; k++) quad = search(k, R, maxRelief, tol);
    if (quad) break;
  }
  // no terrace level to share: anywhere around the plant, clear of every terrace
  quad ??= search(-1, Q.fallbackSearch, Q.passes[Q.passes.length - 1][0], 0);
  if (!quad) return null;
  plan.plaza = { x: quad.x, z: quad.z, r };
  addShape(ctx, isl, { ...discShape(quad.x, quad.z, r + 0.5), tag: 'plaza' }, false);
  addPad(ctx, isl, discShape(quad.x, quad.z, r), FLATTEN.discMargin);
  return quad;
}

/** Antenna masts on the rim shoulders: high, spread out, nearest the hub first. */
function placeRidge(
  ctx: SiteCtx,
  isl: IslandData,
  centre: XZ,
  hub: XZ,
  rng: Rng,
  sIdx: number,
  free: (p: XZ, def: string) => boolean,
): number[] {
  const G = S.ridge;
  const want = rng.int(G.count[0], G.count[1]);
  const cand = ring(centre, G.dist[0], G.dist[1], 1.5, G.angles, rng.range(0, 1))
    .map((p) => ({ p, y: heightAt(ctx.h, p.x, p.z) }))
    .filter((c) => c.y >= G.minY && onIsland(ctx, isl, c.p.x, c.p.z));
  // high first, then closer to the hub
  cand.sort((a, b) => b.y - 0.15 * dist(b.p, hub) - (a.y - 0.15 * dist(a.p, hub)));
  const lots: number[] = [];
  for (const c of cand) {
    if (lots.length >= want) break;
    if (lots.some((li) => dist(ctx.lots[li], c.p) < G.gap) || !free(c.p, 'antennaMast')) continue;
    const u = unit(centre, c.p);
    const li = tryLot(ctx, isl, 'antennaMast', c.p, ang(u.x, u.z), sIdx, {
      minShore: 4,
      maxRelief: G.maxRelief,
    });
    if (li >= 0) lots.push(li);
  }
  return lots;
}

/**
 * Rack yard on the beach beside the dock: `sheds` rackShed lots side by side (doors inland) and
 * a row of rackRow fixtures on their seaward side. Black sand first, any low land second.
 */
function placeYard(
  ctx: SiteCtx,
  isl: IslandData,
  root: XZ,
  rng: Rng,
  sIdx: number,
  free: (p: XZ, def: string) => boolean,
): { lots: number[]; district: DistrictData } | null {
  const Y = S.yard;
  const [sw, sd] = LOT_FOOTPRINT.rackShed;
  const nRacks = rng.int(Y.racks[0], Y.racks[1]);
  const passes: readonly (readonly number[])[] = [
    [Zone.sandBlack],
    [Zone.sandBlack, Zone.grass, Zone.meadow],
  ];
  for (const zones of passes) {
    const cand: { p: XZ; d: number }[] = [];
    const [x0, x1] = gridRange(root.x - Y.search[1], root.x + Y.search[1]);
    const [z0, z1] = gridRange(root.z - Y.search[1], root.z + Y.search[1]);
    for (let iz = z0; iz <= z1; iz++)
      for (let ix = x0; ix <= x1; ix++) {
        const i = iz * ctx.n + ix;
        if (ctx.islandMap[i] !== isl.id + 1 || ctx.sdf[i] < Y.minShore) continue;
        if (!zones.includes(ctx.zone[i])) continue;
        const p = cellPos(ctx, i);
        const d = dist(p, root);
        if (d < Y.search[0] || d > Y.search[1]) continue;
        cand.push({ p, d });
      }
    cand.sort((a, b) => a.d - b.d);
    for (const { p } of cand) {
      const g = inland(ctx, p);
      if (!g) continue;
      const rotY = ang(g.x, g.z);
      const t = { x: -g.z, z: g.x };
      const half = (sw + Y.shedGap) / 2;
      const spots = [add(add(p, t, half), g, sd / 2), add(add(p, t, -half), g, sd / 2)];
      const shapes = spots.map((q) => rectShape(q.x, q.z, rotY, sw, sd));
      const ok = shapes.every(
        (sh) =>
          onLand(ctx, isl, sh, Y.minShore) &&
          relief(ctx, sh) <= Y.maxRelief &&
          padLevel(ctx, isl, sh) <= Y.maxY &&
          clear(ctx, isl, sh, VILLAGE.lotGap) &&
          siteFree(ctx, isl, sh),
      );
      if (!ok || shapesOverlap(shapes[0], shapes[1], VILLAGE.lotGap - 0.01)) continue;
      if (!spots.every((q) => free(q, 'rackShed'))) continue;
      const lots: number[] = [];
      for (const q of spots.slice(0, Y.sheds)) {
        const li = tryLot(ctx, isl, 'rackShed', q, rotY, sIdx, {
          minShore: Y.minShore,
          maxRelief: Y.maxRelief,
        });
        if (li >= 0) lots.push(li);
      }
      if (lots.length === 0) continue;
      // racks: one row on the seaward side of the sheds, along the shore
      const pieces: Shape[] = lots.map((li) => {
        const l = ctx.lots[li];
        return rectShape(l.x, l.z, l.rotY, l.w, l.d);
      });
      let racks = 0;
      for (const k of [0, 1, -1, 2, -2]) {
        if (racks >= nRacks) break;
        const q = add(add(p, t, k * 2.2), g, -1.4);
        const sh = discShape(q.x, q.z, 0.9);
        if (!onIsland(ctx, isl, q.x, q.z) || heightAt(ctx.h, q.x, q.z) < 0.3) continue;
        if (sdfAt(ctx, q.x, q.z) < 1 || !clear(ctx, isl, sh, 0.3)) continue;
        ctx.fixtures.push({ defId: 'rackRow', x: q.x, z: q.z, rotY, islandId: isl.id });
        addShape(ctx, isl, sh, true);
        pieces.push(sh);
        racks++;
      }
      return { lots, district: enclose(isl, 'yard', pieces, p, rotY, Y.margin) };
    }
  }
  return null;
}

/** Inland unit direction at `p` (shore SDF gradient), null on a flat SDF. */
function inland(ctx: SiteCtx, p: XZ): XZ | null {
  const gx = sdfAt(ctx, p.x + 2, p.z) - sdfAt(ctx, p.x - 2, p.z);
  const gz = sdfAt(ctx, p.x, p.z + 2) - sdfAt(ctx, p.x, p.z - 2);
  const l = Math.hypot(gx, gz);
  return l < 1e-3 ? null : { x: gx / l, z: gz / l };
}

/** District rect (facing rotY) around `pieces`, grown by `margin`. */
function enclose(
  isl: IslandData,
  kind: DistrictData['kind'],
  pieces: readonly Shape[],
  origin: XZ,
  rotY: number,
  margin: number,
): DistrictData {
  const f = dirOf(rotY);
  const t = { x: -f.z, z: f.x };
  let u0 = Infinity;
  let u1 = -Infinity;
  let v0 = Infinity;
  let v1 = -Infinity;
  for (const sh of pieces) {
    const pts: XZ[] =
      sh.r > 0
        ? [0, 1, 2, 3].map((k) => add(sh, dirOf((k * Math.PI) / 2 + rotY), sh.r))
        : [
            [1, 1],
            [1, -1],
            [-1, -1],
            [-1, 1],
          ].map(([a, b]) => ({
            x: sh.x - a * sh.hw * sh.s + b * sh.hd * sh.c,
            z: sh.z + a * sh.hw * sh.c + b * sh.hd * sh.s,
          }));
    for (const q of pts) {
      const dx = q.x - origin.x;
      const dz = q.z - origin.z;
      const u = dx * t.x + dz * t.z;
      const v = dx * f.x + dz * f.z;
      u0 = Math.min(u0, u);
      u1 = Math.max(u1, u);
      v0 = Math.min(v0, v);
      v1 = Math.max(v1, v);
    }
  }
  const c = add(add(origin, t, (u0 + u1) / 2), f, (v0 + v1) / 2);
  return {
    islandId: isl.id,
    kind,
    x: c.x,
    z: c.z,
    rotY,
    w: u1 - u0 + 2 * margin,
    d: v1 - v0 + 2 * margin,
  };
}

/**
 * Pipeline from the plant to a data center: A* on the grid (land, off obstacles except at its
 * two ends, slope-limited), then straightened into long runs by line of sight. The pipe is
 * registered as a non-blocking obstacle (scatter keeps off it; footpaths may cross it).
 */
function routePipe(
  ctx: SiteCtx,
  isl: IslandData,
  towers: readonly XZ[],
  lot: { x: number; z: number; rotY: number; w: number; d: number },
): XZ[] | null {
  const P = S.pipeline;
  const tower = towers.reduce((a, b) => (dist(b, lot) < dist(a, lot) ? b : a));
  const start = add(tower, unit(tower, lot), S.plant.radius + 0.6);
  // end: just outside the lot's side nearest the plant
  const f = dirOf(lot.rotY);
  const t = { x: -f.z, z: f.x };
  const dx = start.x - lot.x;
  const dz = start.z - lot.z;
  const cu = Math.max(-lot.w / 2 - 0.8, Math.min(lot.w / 2 + 0.8, dx * t.x + dz * t.z));
  const cv = Math.max(-lot.d / 2 - 0.8, Math.min(lot.d / 2 + 0.8, dx * f.x + dz * f.z));
  const end = add(add(lot, t, cu), f, cv);
  const ends = [start, end];
  const shapes = ctx.shapes[isl.id];
  const valid = (x: number, z: number): boolean => {
    if (!onIsland(ctx, isl, x, z) || sdfAt(ctx, x, z) < P.minShore) return false;
    if (ends.some((e) => Math.hypot(e.x - x, e.z - z) < 2.5)) return true;
    for (const o of shapes) if (o.tag !== 'plaza' && shapeDist(o, x, z) < P.clear) return false;
    return true;
  };
  const s0 = cellOf(ctx, start.x, start.z);
  const g0 = cellOf(ctx, end.x, end.z);
  if (s0 < 0 || g0 < 0) return null;
  const run = ctx.h.cellSize;
  const cells = gridAStar({
    ...islandWindow(ctx, isl),
    start: s0,
    goal: g0,
    step: (a, b, d) => {
      const p = cellPos(ctx, b);
      if (!valid(p.x, p.z)) return Infinity;
      const slope = Math.abs(ctx.h.data[b] - ctx.h.data[a]) / (d * run);
      if (slope > P.maxSlope) return Infinity;
      return d * run * (1 + 3 * slope);
    },
    hScale: run,
  });
  if (!cells) return null;
  const raw = [start, ...cells.slice(1, -1).map((c) => cellPos(ctx, c)), end];
  // line-of-sight straightening
  const sight = (a: XZ, b: XZ): boolean => {
    const L = dist(a, b);
    const k = Math.max(1, Math.ceil(L / 0.5));
    let yPrev = heightAt(ctx.h, a.x, a.z);
    for (let j = 1; j <= k; j++) {
      const q = add(a, unit(a, b), (L * j) / k);
      if (!valid(q.x, q.z)) return false;
      const y = heightAt(ctx.h, q.x, q.z);
      if (Math.abs(y - yPrev) / (L / k) > P.maxSlope) return false;
      yPrev = y;
    }
    return true;
  };
  const out: XZ[] = [raw[0]];
  let i = 0;
  while (i < raw.length - 1) {
    let j = raw.length - 1;
    while (j > i + 1 && !sight(raw[i], raw[j])) j--;
    out.push(raw[j]);
    i = j;
  }
  for (let k = 1; k < out.length; k++) {
    const a = out[k - 1];
    const b = out[k];
    const m = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
    const u = unit(a, b);
    addShape(ctx, isl, rectShape(m.x, m.z, ang(u.x, u.z), P.halfWidth * 2, dist(a, b)), false);
  }
  return out;
}
