/**
 * HQ island plan (M14b §2.1, TASK-362): the Orchestrator's campus on the Hearthholm crescent.
 *
 * - Central Quad: a paved disc by the harbour, the Orchestrator Tower on its inland side, two
 *   coffee kiosks flanking the harbour lane.
 * - Ferry Terminal: the pier into the bay with its moorings, the ferry office in the shallows
 *   beside the pier root, a banner gate.
 * - Harbour Row: lanes from the quad (lane 0 runs to the pier) lined with theme `lotMix` lots;
 *   the highest becomes the hqAnnex crown.
 * - Meeting Garden: a flat lawn disc off the quad, a meeting pavilion ringed by flower beds.
 * - Avenue: round trees along the lanes with lanterns and benches between, banners at the gates.
 *
 * No cottages, tower house, market stalls, well or stilt huts. Layout numbers: content HQ_PLAN.
 */
import { CAMPUS, FLATTEN, PATHS, VILLAGE } from '../../../content/settlements.ts';
import { HQ_PLAN } from '../../../content/themes/hq.ts';
import type { Rng } from '../../../core/rng.ts';
import type { IslandData, XZ } from '../../types.ts';
import { heightAt, Zone } from '../../types.ts';
import { forSamplesNearSegment } from '../paths.ts';
import {
  add,
  addPad,
  addShape,
  ang,
  bestSample,
  cellOf,
  clear,
  crownLot,
  dirOf,
  discShape,
  dist,
  dockWithLink,
  findDock,
  layLanes,
  linkLot,
  newPlan,
  onIsland,
  onLand,
  pushFixture,
  pushLandmark,
  relief,
  sdfAt,
  seedHub,
  shapesOverlap,
  siteFree,
  tryLot,
  unit,
  type Shape,
  type SiteCtx,
  type SitePlan,
} from '../sites.ts';
import type { ThemePlanner } from './types.ts';

const DEG = Math.PI / 180;
const GREEN: readonly number[] = [Zone.grass, Zone.meadow, Zone.forest, Zone.field];

/** Obstacles only (lanes ignored, the quad's 'plaza' disc ignored): small decor beside paths. */
function freeOfShapes(ctx: SiteCtx, isl: IslandData, sh: Shape, gap: number): boolean {
  for (const o of ctx.shapes[isl.id]) {
    if (o.tag === 'plaza') continue;
    if (shapesOverlap(o, sh, gap)) return false;
  }
  return true;
}

/** Lane centrelines keep `r` + a path half-width clear of the point. */
function offLanes(ctx: SiteCtx, isl: IslandData, p: XZ, r: number): boolean {
  for (const lane of ctx.lanes[isl.id])
    for (const q of lane) if (dist(p, q) < PATHS.halfWidth + 0.3 + r) return false;
  return true;
}

const zoneAtP = (ctx: SiteCtx, p: XZ): number => {
  const i = cellOf(ctx, p.x, p.z);
  return i < 0 ? -1 : ctx.zone[i];
};

export const planHq: ThemePlanner = ({ ctx, isl, rng, sIdx }) => {
  const harbour = isl.anchors.harbour;
  if (!harbour) return null;
  const P = HQ_PLAN;
  const R = P.quad.radius;

  // ---- Central Quad: the flattest disc near the harbour
  const quadShape = (p: XZ): Shape => discShape(p.x, p.z, R);
  let quad: XZ | null = null;
  for (
    let s = P.quad.search;
    s <= P.quad.search + 5 * VILLAGE.searchGrow && !quad;
    s += VILLAGE.searchGrow
  )
    quad = bestSample(ctx, isl, harbour, s, (p, i) => {
      if (ctx.sdf[i] < Math.max(P.quad.minShore, R + 1)) return Infinity;
      return relief(ctx, quadShape(p)) + 0.02 * dist(p, harbour);
    });
  if (!quad) return null;
  const plan = newPlan('village', quad);
  plan.plaza = { x: quad.x, z: quad.z, r: R };
  addShape(ctx, isl, { ...discShape(quad.x, quad.z, R + 0.5), tag: 'plaza' }, false);
  addPad(ctx, isl, quadShape(quad), FLATTEN.discMargin);

  // ---- Ferry Terminal: pier into the bay, a short walk from the quad
  const dockSite = findDock(ctx, isl, {
    near: harbour,
    maxDist: 50,
    prefer: quad,
    toward: harbour,
    carve: true,
    edge: true,
  });
  const boatsRng = rng.fork('moorings');
  dockWithLink(ctx, isl, plan, dockSite, boatsRng, {
    rowboats: boatsRng.int(P.moorings.rowboats[0], P.moorings.rowboats[1]),
    sailboats: boatsRng.int(P.moorings.sailboats[0], P.moorings.sailboats[1]),
  });
  const toSea = dockSite ? unit(quad, dockSite.root) : unit(quad, harbour);
  const a0 = ang(toSea.x, toSea.z);
  plan.districts.push({
    islandId: isl.id,
    kind: 'quad',
    x: quad.x,
    z: quad.z,
    rotY: a0,
    w: 2 * R,
    d: 2 * R,
  });

  // ---- Orchestrator Tower: the quad's inland side, facing the harbour (slides along the edge
  // when that spot is off the land); any side as the last resort
  const towerAt = (a: number, r: number): boolean => {
    const p = add(quad, dirOf(a), r);
    if (!onLand(ctx, isl, discShape(p.x, p.z, 2), 3)) return false;
    plan.landmarks.push(pushLandmark(ctx, isl, 'clocktower', p, a0));
    return true;
  };
  const tries: [number, number][] = [
    ...P.tower.slide.map((d): [number, number] => [a0 + Math.PI + d * DEG, R - P.tower.inset]),
    ...P.tower.slide.map((d): [number, number] => [a0 + Math.PI + d * DEG, R + 0.5]),
    ...Array.from({ length: 12 }, (_, k): [number, number] => [
      a0 + k * 30 * DEG,
      R - P.tower.inset,
    ]),
  ];
  for (const [a, r] of tries) if (towerAt(a, r)) break;

  // ---- coffee kiosks on the quad edge, flanking the harbour lane, facing the centre
  const kiosks: number[] = [];
  for (const d of P.kiosks.angles) {
    if (kiosks.length >= P.kiosks.count) break;
    const a = a0 + d * DEG;
    const li = tryLot(
      ctx,
      isl,
      'coffeeKiosk',
      add(quad, dirOf(a), R - P.kiosks.inset),
      a + Math.PI,
      sIdx,
      {
        minShore: 2,
        maxRelief: 3,
        inPlaza: true,
      },
    );
    if (li >= 0) kiosks.push(li);
  }

  // ---- Harbour Row: lanes from the quad hub, lane 0 to the pier
  const hubCell = seedHub(ctx, isl, plan, quad);
  if (hubCell < 0) return null;
  const offices = layLanes(ctx, isl, {
    centre: quad,
    quadR: R,
    hubCell,
    a0,
    laneEnd: dockSite ? dockSite.root : null,
    spec: CAMPUS.hq,
    rng: rng.fork('lots'),
    sIdx,
  });
  crownLot(ctx, isl, offices);

  // ---- Meeting Garden
  const garden = placeGarden(ctx, isl, plan, quad, sIdx, rng.fork('garden'));

  for (const li of kiosks) linkLot(ctx, plan, li);
  offices.sort((a, b) => dist(ctx.lots[a], quad) - dist(ctx.lots[b], quad));
  for (const li of offices) linkLot(ctx, plan, li);
  if (garden >= 0) linkLot(ctx, plan, garden);

  if (dockSite) placeFerryOffice(ctx, isl, dockSite.root, dockSite.dir);
  placeBanners(ctx, isl, quad, dockSite);
  paintLawn(ctx, isl, quad);
  placeAvenue(ctx, isl, quad);
  return plan;
};

/** Civic lawn instead of inland dry sand around the quad and the campus lots (the beach stays). */
function paintLawn(ctx: SiteCtx, isl: IslandData, quad: XZ): void {
  const L = HQ_PLAN.lawn;
  const lots = ctx.lots.filter((l) => l.islandId === isl.id && l.kind !== 'hut');
  const paint = (c: XZ, r: number): void =>
    forSamplesNearSegment(ctx.h, c, c, r, (i) => {
      if (ctx.islandMap[i] !== isl.id + 1 || ctx.zone[i] !== Zone.sandDry) return;
      if (ctx.sdf[i] >= L.minShore) ctx.zone[i] = Zone.grass;
    });
  paint(quad, HQ_PLAN.quad.radius + L.quadPad);
  for (const l of lots) paint(l, Math.hypot(l.w, l.d) / 2 + L.lotPad);
}

/** Meeting pavilion on a flat lawn disc off the quad, flower beds round it. Returns the lot or −1. */
function placeGarden(
  ctx: SiteCtx,
  isl: IslandData,
  plan: SitePlan,
  quad: XZ,
  sIdx: number,
  rng: Rng,
): number {
  const G = HQ_PLAN.garden;
  // second pass relaxed (rougher, farther): a garden on a slope beats none
  let c: XZ | null = null;
  let maxRelief = 0;
  for (const pass of G.passes) {
    maxRelief = pass.maxRelief;
    c = bestSample(ctx, isl, quad, pass.outer, (p, i) => {
      const d = dist(p, quad);
      if (d < G.inner || ctx.sdf[i] < G.minShore) return Infinity;
      const sh = discShape(p.x, p.z, G.radius);
      if (!onLand(ctx, isl, sh, G.minShore)) return Infinity;
      const r = relief(ctx, sh);
      if (r > pass.maxRelief || !clear(ctx, isl, sh, 1) || !siteFree(ctx, isl, sh)) return Infinity;
      return r + 0.04 * d + (ctx.zone[i] === Zone.forest ? 0.4 : 0);
    });
    if (c) break;
  }
  if (!c) return -1;
  const f = unit(c, quad);
  const face = ang(f.x, f.z);
  const li = tryLot(ctx, isl, 'meetingPavilion', c, face, sIdx, {
    minShore: G.minShore,
    maxRelief,
  });
  if (li < 0) return -1;
  // beds on the ring, leaving the door side open; two benches facing the pavilion by the door
  const nb = rng.int(G.beds[0], G.beds[1]);
  for (let k = 0; k < nb; k++) {
    const a = face + (50 + (k * 260) / Math.max(1, nb - 1)) * DEG;
    const p = add(c, dirOf(a), G.bedRing);
    if (!onIsland(ctx, isl, p.x, p.z) || heightAt(ctx.h, p.x, p.z) < 0.3) continue;
    pushFixture(ctx, isl, 'flowerBed', p, a + Math.PI / 2);
  }
  for (const s of [1, -1].slice(0, G.benches)) {
    const a = face + s * 30 * DEG;
    const p = add(c, dirOf(a), G.bedRing + 0.4);
    if (!onIsland(ctx, isl, p.x, p.z) || heightAt(ctx.h, p.x, p.z) < 0.3) continue;
    pushFixture(ctx, isl, 'bench', p, a + Math.PI);
  }
  plan.districts.push({
    islandId: isl.id,
    kind: 'garden',
    x: c.x,
    z: c.z,
    rotY: face,
    w: 2 * G.radius,
    d: 2 * G.radius,
  });
  // flowering lawn under the garden (lawn / grove only: never paint sand or rock)
  forSamplesNearSegment(ctx.h, c, c, G.radius, (i) => {
    if (ctx.islandMap[i] !== isl.id + 1) return;
    if (ctx.zone[i] === Zone.grass || ctx.zone[i] === Zone.forest) ctx.zone[i] = G.paint;
  });
  // the open lawn stays clear of scatter (non-blocking: paths still cross it)
  addShape(ctx, isl, discShape(c.x, c.z, G.radius), false);
  return li;
}

/** Ferry office in the shallows beside the pier root, facing the pier (pivot = water level). */
function placeFerryOffice(ctx: SiteCtx, isl: IslandData, root: XZ, dir: XZ): void {
  const F = HQ_PLAN.ferry;
  const perp = { x: -dir.z, z: dir.x };
  for (const along of F.along)
    for (const side of [1, -1]) {
      const p = add(add(root, dir, along), perp, side * F.side);
      const y = heightAt(ctx.h, p.x, p.z);
      if (y < F.depth[0] || y > F.depth[1]) continue;
      const sh = discShape(p.x, p.z, F.radius);
      if (!freeOfShapes(ctx, isl, sh, 0.3)) continue;
      const toPier = { x: -perp.x * side, z: -perp.z * side };
      pushFixture(ctx, isl, 'ferryOffice', p, ang(toPier.x, toPier.z)); // FIXTURE_RADIUS 2.2
      return;
    }
}

/** Coral / cream banner pairs where the first lanes leave the quad, and a gate at the pier root. */
function placeBanners(
  ctx: SiteCtx,
  isl: IslandData,
  quad: XZ,
  dockSite: { root: XZ; dir: XZ } | null,
): void {
  const B = HQ_PLAN.banners;
  const R = HQ_PLAN.quad.radius;
  const pair = (p: XZ, t: XZ): void => {
    const nrm = { x: -t.z, z: t.x };
    for (const s of [1, -1]) {
      const q = add(p, nrm, s * B.gate);
      if (!onIsland(ctx, isl, q.x, q.z) || heightAt(ctx.h, q.x, q.z) < 0.3) continue;
      if (!freeOfShapes(ctx, isl, discShape(q.x, q.z, 0.4), 0.2)) continue;
      pushFixture(ctx, isl, 'banner', q, ang(t.x, t.z));
    }
  };
  for (const lane of ctx.lanes[isl.id].slice(0, B.lanes)) {
    const k = lane.findIndex((q) => dist(q, quad) >= R + B.out);
    if (k < 0 || k + 1 >= lane.length) continue;
    pair(lane[k], unit(lane[k], lane[k + 1]));
  }
  if (!dockSite) return;
  // the pier gate, unless the harbour lane's gate already stands there (short harbour lane)
  const gate = add(dockSite.root, dockSite.dir, -1.5);
  const near = ctx.fixtures.some(
    (f) => f.islandId === isl.id && f.defId === 'banner' && dist(f, gate) < B.pierClear,
  );
  if (!near) pair(gate, dockSite.dir);
}

/** Round trees at a fixed spacing either side of every lane; lanterns and benches between. */
function placeAvenue(ctx: SiteCtx, isl: IslandData, quad: XZ): void {
  const A = HQ_PLAN.avenue;
  const R = HQ_PLAN.quad.radius;
  const green = (p: XZ): boolean =>
    onIsland(ctx, isl, p.x, p.z) && sdfAt(ctx, p.x, p.z) >= 2.5 && GREEN.includes(zoneAtP(ctx, p));
  let slot = 0;
  for (const lane of ctx.lanes[isl.id]) {
    let next = -1;
    for (let k = 0; k + 1 < lane.length; k++) {
      const p = lane[k];
      if (dist(p, quad) < R + A.start) continue;
      if (next < 0) next = k;
      if (k < next) continue;
      next = k + A.spacing;
      const t = unit(p, lane[k + 1]);
      const nrm = { x: -t.z, z: t.x };
      slot++;
      for (const side of [1, -1]) {
        const toLane = ang(-nrm.x * side, -nrm.z * side);
        if (slot % A.lanternEvery === 0 && side === 1) {
          const q = add(p, nrm, side * A.lanternOffset);
          if (
            green(q) &&
            freeOfShapes(ctx, isl, discShape(q.x, q.z, 0.3), 0.3) &&
            offLanes(ctx, isl, q, 0.3)
          )
            pushFixture(ctx, isl, 'lanternPost', q, toLane);
          continue;
        }
        if (slot % A.bench.every === 0 && side === -1) {
          const q = add(p, nrm, side * A.bench.offset);
          if (
            green(q) &&
            freeOfShapes(ctx, isl, discShape(q.x, q.z, 0.7), 0.3) &&
            offLanes(ctx, isl, q, 0.6)
          )
            pushFixture(ctx, isl, 'bench', q, toLane);
          continue;
        }
        const q = add(p, nrm, side * A.offset);
        if (!green(q)) continue;
        const sh = discShape(q.x, q.z, A.clear);
        if (!clear(ctx, isl, sh, 0.3)) continue;
        pushFixture(ctx, isl, A.def, q, ang(t.x, t.z));
      }
    }
  }
}
