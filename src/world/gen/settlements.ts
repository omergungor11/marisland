import type { Rng } from '../../core/rng.ts';
import { hashInts } from '../../core/hash.ts';
import { smoothstep } from '../../core/math/index.ts';
import {
  CAMPUS,
  DOCK,
  FIXTURE_RADIUS,
  FLATTEN,
  LOT_FOOTPRINT,
  LOT_ROLE_BY_KIND,
  LOT_ROOFS,
  OUTPOSTS,
  PATHS,
  RESEARCH_OUTPOST,
  ROOFED_KINDS,
  VILLAGE,
} from '../../content/settlements.ts';
import { OFFICE_DEFS } from '../../content/offices.ts';
import { THEMES } from '../../content/themes/index.ts';
import type {
  ArchetypeId,
  WorldData,
  DistrictData,
  DockData,
  FieldPatchData,
  FixtureData,
  Heightfield,
  IslandData,
  LandmarkData,
  LotData,
  MooringData,
  PathGraph,
  Polyline,
  SettlementData,
  StreamData,
  XZ,
} from '../types.ts';
import { heightAt, Zone } from '../types.ts';
import { cellX, cellZ, gridRange } from './grid.ts';
import { leewardness } from './heightfield.ts';
import type { OccupancyGrid } from './scatter.ts';
import {
  addCellPath,
  addEdge,
  addNode,
  addVirtual,
  buildPathGraph,
  createNetwork,
  forSamplesNearSegment,
  gridAStar,
  pathStep,
  writePaths,
} from './paths.ts';
import { THEME_PLANNERS } from './plans/index.ts';
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
  fieldSamples,
  dirOf,
  dockWithLink,
  doorOf,
  findDock,
  footprintOf,
  heroHeading,
  islandWindow,
  landmarkAccess,
  layLanes,
  linkLandmark,
  linkLot,
  localWindow,
  lotShape,
  crownLot,
  nearestPathCell,
  newPlan,
  onIsland,
  onLand,
  placeBuoys,
  planCampus,
  placeStiltHut,
  placeTidePools,
  pushFixture,
  pushLandmark,
  rectShape,
  relief,
  ring,
  sdfAt,
  seedHub,
  segDist,
  shapeCorners,
  shapeDist,
  siteFree,
  stairCorridor,
  stepCtx,
  tryLot,
  unit,
  type LinkReq,
  type Pad,
  type Shape,
  type SiteCtx,
  type SitePlan,
} from './sites.ts';

/**
 * Settlements (ARCHITECTURE §2 step 5, TASK-131): plaza, lots, landmarks,
 * docks, moorings and fixtures per island, flattened pads in the heightfield,
 * the footpath network (paths.ts) and patchwork fences. Each island is planned by
 * `THEME_PLANNERS[isl.theme]` (world/gen/plans, M14b D-029) from the sites.ts
 * primitives; `legacy()` = the pre-M14b archetype planner below + the campus.
 * Pure data; every decision draws from rng.fork('sites', islandId, …).
 */

function planHearthholm(ctx: SiteCtx, isl: IslandData, rng: Rng, sIdx: number): SitePlan | null {
  const harbour = isl.anchors.harbour;
  if (!harbour) return null;
  const pr = VILLAGE.plazaRadius;
  const plazaShape = (p: XZ): Shape => discShape(p.x, p.z, pr);
  let plazaC: XZ | null = null;
  for (
    let R = VILLAGE.plazaSearch;
    R <= VILLAGE.plazaSearch + 5 * VILLAGE.searchGrow && !plazaC;
    R += VILLAGE.searchGrow
  ) {
    plazaC = bestSample(ctx, isl, harbour, R, (p, i) => {
      if (ctx.sdf[i] < Math.max(VILLAGE.plazaMinShore, pr + 1)) return Infinity;
      return relief(ctx, plazaShape(p)) + 0.02 * dist(p, harbour);
    });
  }
  if (!plazaC) return null;
  const plan = newPlan('village', plazaC);
  plan.plaza = { x: plazaC.x, z: plazaC.z, r: pr };
  addShape(ctx, isl, { ...discShape(plazaC.x, plazaC.z, pr + 0.5), tag: 'plaza' }, false);
  addPad(ctx, isl, plazaShape(plazaC), FLATTEN.discMargin);

  // dock into the bay, short walk from the plaza
  const dockSite = findDock(ctx, isl, {
    near: harbour,
    maxDist: 50,
    prefer: plazaC,
    toward: harbour,
    carve: true,
    edge: true,
  });
  const boatsRng = rng.fork('moorings');
  dockWithLink(ctx, isl, plan, dockSite, boatsRng, {
    rowboats: boatsRng.int(VILLAGE.rowboats[0], VILLAGE.rowboats[1]),
    sailboats: boatsRng.int(VILLAGE.sailboats[0], VILLAGE.sailboats[1]),
  });

  const toSea = dockSite ? unit(plazaC, dockSite.root) : unit(plazaC, harbour);
  const a0 = ang(toSea.x, toSea.z);
  // clocktower: inland edge of the plaza, facing the harbour
  // (sliding along the edge when that spot is off the land: the HQ's Orchestrator Tower)
  for (const da of [0, 30, -30, 60, -60]) {
    const ct = add(plazaC, dirOf(a0 + Math.PI + (da * Math.PI) / 180), pr + 0.5);
    if (!onLand(ctx, isl, discShape(ct.x, ct.z, 2), 3)) continue;
    plan.landmarks.push(pushLandmark(ctx, isl, 'clocktower', ct, a0));
    break;
  }

  // well (towards the clocktower) and market stalls between the harbour lane and the side lanes
  pushFixture(ctx, isl, 'well', add(plazaC, toSea, -2.5), a0);
  const stallRng = rng.fork('stalls');
  const nStalls = stallRng.int(VILLAGE.stalls[0], VILLAGE.stalls[1]);
  const side = stallRng.chance(0.5) ? 1 : -1;
  const stallAngles = [37 * side, -37 * side, 108 * side, -108 * side, 160 * side].map(
    (d) => a0 + (d * Math.PI) / 180,
  );
  const stalls: number[] = [];
  for (const a of stallAngles) {
    if (stalls.length >= nStalls) break;
    const p = add(plazaC, dirOf(a), pr - 1.1);
    const li = tryLot(ctx, isl, 'marketStall', p, a + Math.PI, sIdx, {
      minShore: 2,
      maxRelief: 3,
      inPlaza: true,
    });
    if (li >= 0) stalls.push(li);
  }

  // hub + lanes
  const hubCell = seedHub(ctx, isl, plan, plazaC);
  if (hubCell < 0) return null;

  const houses = layLanes(ctx, isl, {
    centre: plazaC,
    quadR: pr,
    hubCell,
    a0,
    laneEnd: dockSite ? dockSite.root : null,
    spec: CAMPUS.hq,
    rng: rng.fork('lots'),
    sIdx,
  });
  crownLot(ctx, isl, houses);

  for (const li of stalls) linkLot(ctx, plan, li);
  // houses link after stalls (closest first so spurs attach to lanes)
  houses.sort((a, b) => dist(ctx.lots[a], plazaC) - dist(ctx.lots[b], plazaC));
  for (const li of houses) linkLot(ctx, plan, li);

  // stilt huts on the bay water, boardwalk to the shore
  const hutRng = rng.fork('stilt');
  const nHuts = hutRng.int(VILLAGE.stiltHuts[0], VILLAGE.stiltHuts[1]);
  const spots: XZ[] = [];
  const [x0, x1] = gridRange(harbour.x - VILLAGE.stiltSearch, harbour.x + VILLAGE.stiltSearch);
  const [z0, z1] = gridRange(harbour.z - VILLAGE.stiltSearch, harbour.z + VILLAGE.stiltSearch);
  for (let iz = z0; iz <= z1; iz++)
    for (let ix = x0; ix <= x1; ix++) {
      const i = iz * ctx.n + ix;
      const y = ctx.h.data[i];
      const s = -ctx.sdf[i];
      if (y > -VILLAGE.stiltDepth[0] || y < -VILLAGE.stiltDepth[1]) continue;
      if (s < VILLAGE.stiltShore[0] || s > VILLAGE.stiltShore[1]) continue;
      const p = cellPos(ctx, i);
      if (dist(p, harbour) > VILLAGE.stiltSearch) continue;
      spots.push(p);
    }
  hutRng.shuffle(spots);
  // inside the bay = water enclosed by land on many sides (crescent arms)
  const enclosure = (p: XZ): number => {
    let hits = 0;
    for (let r = 0; r < 12; r++) {
      const d = dirOf((r / 12) * Math.PI * 2);
      for (let t = 2; t <= VILLAGE.bayRay; t += 2)
        if (heightAt(ctx.h, p.x + d.x * t, p.z + d.z * t) > 0) {
          hits++;
          break;
        }
    }
    return hits;
  };
  const enc = spots.map(enclosure);
  let huts = 0;
  for (const minEnc of VILLAGE.bayEnclosure) {
    for (let j = 0; j < spots.length && huts < nHuts; j++) {
      if (enc[j] < minEnc) continue;
      if (placeStiltHut(ctx, isl, plan, spots[j], sIdx) >= 0) huts++;
    }
    if (huts > 0) break;
  }
  return plan;
}

function planBeaconRock(ctx: SiteCtx, isl: IslandData, rng: Rng, sIdx: number): SitePlan | null {
  const lh = isl.anchors.lighthouse;
  if (!lh) return null;
  const landing = isl.anchors.landing ?? lh;
  const plan = newPlan('lighthouse', lh);
  const li = pushLandmark(ctx, isl, 'lighthouse', lh, lh.rotY);
  plan.landmarks.push(li);
  plan.hub = landmarkAccess(ctx, li, landing);
  plan.links.push({ pin: plan.hub, kind: 'path', done: () => undefined });
  // keeper hut
  const cand = ring(lh, OUTPOSTS.keeperRing[0], OUTPOSTS.keeperRing[1], 1.5, 16, rng.range(0, 1));
  let best = -1;
  const [kw, kd] = footprintOf(isl, 'cottage');
  for (const maxRelief of [2, 3.5, 6]) {
    let bs = Infinity;
    let bp: XZ | null = null;
    for (const p of cand) {
      const face = unit(p, lh);
      const sh = rectShape(p.x, p.z, ang(face.x, face.z), kw, kd);
      if (!onLand(ctx, isl, sh, 3) || !clear(ctx, isl, sh, 1.5)) continue;
      const r = relief(ctx, sh);
      if (r > maxRelief) continue;
      const s = r + 0.05 * dist(p, lh);
      if (s < bs) {
        bs = s;
        bp = p;
      }
    }
    if (bp) {
      const face = unit(bp, lh);
      best = tryLot(ctx, isl, 'cottage', bp, ang(face.x, face.z), sIdx, { minShore: 3, maxRelief });
      if (best >= 0) break;
    }
  }
  // landing dock, then the stair up to the lighthouse
  const site = findDock(ctx, isl, { near: landing, maxDist: 18, prefer: landing, carve: true });
  dockWithLink(ctx, isl, plan, site, rng.fork('moorings'), { rowboats: 1, sailboats: 0 }, 'stair');
  if (site) stairCorridor(plan, site.root, plan.hub);
  if (best >= 0) linkLot(ctx, plan, best);
  placeBuoys(ctx, isl, rng.fork('buoys'));
  return plan;
}

function planMillbrook(ctx: SiteCtx, isl: IslandData, rng: Rng, sIdx: number): SitePlan | null {
  const knolls = Object.keys(isl.anchors)
    .filter((k) => k.startsWith('knoll'))
    .sort()
    .map((k) => isl.anchors[k]);
  const pond = isl.anchors.pond;
  const hub = bestSample(ctx, isl, { x: isl.cx, z: isl.cz }, isl.reach, (p, i) => {
    if (ctx.sdf[i] < 12) return Infinity;
    if (knolls.some((k) => dist(k, p) < 14)) return Infinity;
    if (pond && dist(pond, p) < 12) return Infinity;
    const r = relief(ctx, discShape(p.x, p.z, 8));
    return r + (ctx.zone[i] === Zone.field ? 0.6 : 0) + 0.01 * dist(p, { x: isl.cx, z: isl.cz });
  });
  if (!hub) return null;
  const plan = newPlan('farm', hub);
  plan.links.push({ pin: hub, kind: 'path', done: () => undefined });
  const wm: number[] = [];
  for (const k of knolls) {
    if (!onLand(ctx, isl, discShape(k.x, k.z, 3), 3)) continue;
    const li = pushLandmark(ctx, isl, 'windmill', k, k.rotY);
    plan.landmarks.push(li);
    wm.push(li);
  }
  // barn + cottages around the yard, facing it
  const lotRng = rng.fork('lots');
  const nCot = lotRng.int(OUTPOSTS.farmCottages[0], OUTPOSTS.farmCottages[1]);
  const cand = lotRng.shuffle(
    ring(hub, OUTPOSTS.farmRing[0], OUTPOSTS.farmRing[1], 2.5, 14, lotRng.range(0, 1)),
  );
  const lots: number[] = [];
  for (const def of ['barn', ...Array.from({ length: nCot }, () => 'cottage')]) {
    for (const maxField of [0, 2, 5]) {
      let placed = -1;
      for (const p of cand) {
        const f = unit(p, hub);
        const rotY = ang(f.x, f.z);
        const [w, d] = footprintOf(isl, def);
        if (fieldSamples(ctx, rectShape(p.x, p.z, rotY, w, d)) > maxField) continue;
        if (pond && dist(pond, p) < 10) continue;
        placed = tryLot(ctx, isl, def, p, rotY, sIdx, {
          minShore: VILLAGE.lotMinShore,
          maxRelief: 1.8,
        });
        if (placed >= 0) break;
      }
      if (placed >= 0) {
        lots.push(placed);
        break;
      }
    }
  }
  // lee dock
  const site = findDock(ctx, isl, {
    near: hub,
    maxDist: isl.reach + 10,
    prefer: hub,
    lee: 40,
    carve: true,
  });
  dockWithLink(ctx, isl, plan, site, rng.fork('moorings'), {
    rowboats: rng.fork('boats').int(1, 2),
    sailboats: 0,
  });
  for (const li of wm) linkLandmark(ctx, plan, li, hub);
  if (pond)
    plan.links.push({ pin: add(pond, unit(pond, hub), 8.5), kind: 'path', done: () => undefined });
  for (const li of lots) linkLot(ctx, plan, li);
  return plan;
}

function planEmberpeak(ctx: SiteCtx, isl: IslandData, _rng: Rng): SitePlan | null {
  const spring = isl.anchors.hotspring;
  const crater = isl.anchors.crater;
  if (crater) pushLandmark(ctx, isl, 'volcanoCrater', crater, 0);
  if (!spring) return null;
  const li = pushLandmark(ctx, isl, 'hotSpring', spring, spring.rotY);
  // lee beach: nearest gentle shore sample, leeward
  const beach = bestSample(ctx, isl, spring, 40, (p, i) => {
    const s = ctx.sdf[i];
    if (s < 1.5 || s > 3.5) return Infinity;
    return dist(p, spring) - 20 * leewardness(isl, ctx.windDir, p.x, p.z);
  });
  const plan = newPlan('spring', spring);
  if (crater) plan.landmarks.push(ctx.landmarks.length - 2);
  plan.landmarks.push(li);
  plan.hub = landmarkAccess(ctx, li, beach ?? { x: isl.cx, z: isl.cz });
  plan.links.push({ pin: plan.hub, kind: 'path', done: () => undefined });
  if (beach) plan.links.push({ pin: beach, kind: 'path', done: () => undefined });
  return plan;
}

function planPalmlagoon(ctx: SiteCtx, isl: IslandData, rng: Rng, sIdx: number): SitePlan | null {
  const wreck = isl.anchors.wreck;
  if (wreck) {
    const li = pushLandmark(ctx, isl, 'sunkenShip', wreck, rng.fork('wreck').range(0, Math.PI * 2));
    void li;
  }
  const lagoon = isl.anchors.lagoon ?? { x: isl.cx, z: isl.cz };
  const plan = newPlan('beachhut', lagoon);
  if (wreck) plan.landmarks.push(ctx.landmarks.length - 1);
  // stilt hut on the lagoon edge
  const hutRng = rng.fork('stilt');
  const spots: XZ[] = [];
  const R = isl.radius * 0.8;
  const [x0, x1] = gridRange(lagoon.x - R, lagoon.x + R);
  const [z0, z1] = gridRange(lagoon.z - R, lagoon.z + R);
  for (let iz = z0; iz <= z1; iz++)
    for (let ix = x0; ix <= x1; ix++) {
      const i = iz * ctx.n + ix;
      const y = ctx.h.data[i];
      const s = -ctx.sdf[i];
      if (y > -VILLAGE.stiltDepth[0] || y < -VILLAGE.stiltDepth[1]) continue;
      if (s < VILLAGE.stiltShore[0] || s > VILLAGE.stiltShore[1]) continue;
      const p = cellPos(ctx, i);
      if (dist(p, lagoon) > R) continue;
      if (wreck && dist(p, wreck) < 12) continue;
      spots.push(p);
    }
  hutRng.shuffle(spots);
  let hut = -1;
  for (const p of spots) {
    hut = placeStiltHut(ctx, isl, plan, p, sIdx);
    if (hut >= 0) break;
  }
  if (hut >= 0) {
    const req = plan.links[plan.links.length - 1];
    plan.hub = req.pin;
  } else {
    const hub = bestSample(ctx, isl, lagoon, isl.reach, (p, i) =>
      ctx.sdf[i] < 2 ? Infinity : -ctx.sdf[i] + 0.01 * dist(p, lagoon),
    );
    if (!hub) return null;
    plan.hub = hub;
    plan.links.push({ pin: hub, kind: 'path', done: () => undefined });
  }
  // dock in a channel if the water allows (no carving on the atoll)
  const ch = isl.anchors.channel0;
  if (ch) {
    const site = findDock(ctx, isl, {
      near: ch,
      maxDist: 16,
      prefer: plan.hub,
      carve: false,
      maxSegments: 5,
      endDepth: DOCK.lagoonEndDepth,
    });
    dockWithLink(ctx, isl, plan, site, rng.fork('moorings'), { rowboats: 1, sailboats: 0 });
  }
  placeTidePools(ctx, isl, rng.fork('tidepools'));
  return plan;
}

function planMossgrove(ctx: SiteCtx, isl: IslandData, rng: Rng, sIdx: number): SitePlan | null {
  const tree = isl.anchors.giantTree;
  if (!tree) return null;
  const ti = pushLandmark(ctx, isl, 'giantTree', tree, tree.rotY);
  const mouth = isl.anchors.streamMouth;
  const stream = ctx.streams.find((s) => s.islandId === isl.id);
  const streamDist = (p: XZ): number => {
    let best = Infinity;
    for (const q of stream?.points ?? []) best = Math.min(best, dist(p, q));
    return best;
  };
  let cabin = -1;
  if (mouth) {
    const cand = ring(mouth, OUTPOSTS.cabinRing[0], OUTPOSTS.cabinRing[1], 2, 16, rng.range(0, 1));
    let bs = Infinity;
    let bp: XZ | null = null;
    let bRot = 0;
    const [cw, cd] = footprintOf(isl, 'logCabin');
    for (const p of cand) {
      if (streamDist(p) < OUTPOSTS.cabinStreamClear + 2.5) continue;
      const f = unit(p, mouth);
      const rotY = ang(f.x, f.z);
      const sh = rectShape(p.x, p.z, rotY, cw, cd);
      if (!onLand(ctx, isl, sh, 4) || !clear(ctx, isl, sh, 1.5) || !siteFree(ctx, isl, sh))
        continue;
      const r = relief(ctx, sh);
      if (r > OUTPOSTS.cabinMaxRelief) continue;
      const s = r + 0.1 * Math.abs(dist(p, mouth) - 9);
      if (s < bs) {
        bs = s;
        bp = p;
        bRot = rotY;
      }
    }
    if (bp)
      cabin = tryLot(ctx, isl, 'logCabin', bp, bRot, sIdx, {
        minShore: 4,
        maxRelief: OUTPOSTS.cabinMaxRelief,
      });
  }
  const plan = newPlan('cabin', tree);
  plan.landmarks.push(ti);
  if (cabin >= 0) {
    plan.hub = doorOf(ctx.lots[cabin]);
    linkLot(ctx, plan, cabin);
    linkLandmark(ctx, plan, ti, ctx.lots[cabin]);
  } else {
    plan.hub = landmarkAccess(ctx, ti, { x: isl.cx, z: isl.cz });
    plan.links.push({ pin: plan.hub, kind: 'path', done: () => undefined });
  }
  return plan;
}

/**
 * Lonely Palm = the Research outpost (plan §4.1): one hut ≥ palmClear from the palm and off
 * the W9 view line (so the palm silhouette stays clean), a telescope beside it, a short carved
 * dock with a rowboat. The hut door seeds the island's tiny path network.
 */
function planLonelyPalm(ctx: SiteCtx, isl: IslandData, rng: Rng, sIdx: number): SitePlan | null {
  const palm = isl.anchors.palm;
  if (palm) pushLandmark(ctx, isl, 'lonelyPalm', palm, palm.rotY);
  const bottle = isl.anchors.bottle;
  if (bottle) pushFixture(ctx, isl, 'messageBottle', bottle, bottle.rotY);
  if (!palm) return null;
  const O = RESEARCH_OUTPOST;
  // camera-controls azimuth → view direction −(sin az, cos az)
  const az = (heroHeading(isl, ctx.islands) * Math.PI) / 180;
  const view = { x: -Math.sin(az), z: -Math.cos(az) };
  const lineCos = Math.cos((O.viewClearDeg * Math.PI) / 180);
  const offLine = (p: XZ): boolean => {
    const u = unit(palm, p);
    return Math.abs(u.x * view.x + u.z * view.z) < lineCos;
  };
  const [w, d] = LOT_FOOTPRINT[O.def];
  let bp: XZ | null = null;
  let bRot = 0;
  let bs = Infinity;
  for (let r = O.palmClear; r <= isl.reach; r += 0.5)
    for (let k = 0; k < 32; k++) {
      const u = dirOf((k / 32) * Math.PI * 2);
      const p = add(palm, u, r);
      if (!offLine(p)) continue;
      const rotY = ang(u.x, u.z); // door away from the palm
      const sh = rectShape(p.x, p.z, rotY, w, d);
      if (!onLand(ctx, isl, sh, O.minShore, 0) || relief(ctx, sh) > O.maxRelief) continue;
      if (!clear(ctx, isl, sh, VILLAGE.lotGap) || !siteFree(ctx, isl, sh)) continue;
      // nearest to perpendicular to the view line, then nearest to the palm
      const s = Math.abs(u.x * view.x + u.z * view.z) + 0.05 * r;
      if (s < bs) {
        bs = s;
        bp = p;
        bRot = rotY;
      }
    }
  const hut = bp
    ? tryLot(ctx, isl, O.def, bp, bRot, sIdx, {
        minShore: O.minShore,
        maxRelief: O.maxRelief,
        cornerMin: 0,
      })
    : -1;
  if (hut < 0) return null;
  const lot = ctx.lots[hut];
  const plan = newPlan('outpost', doorOf(lot));
  linkLot(ctx, plan, hut);
  // telescope beside the hut (either side), on land, off the view line
  const fr = FIXTURE_RADIUS.telescope;
  const f = dirOf(lot.rotY);
  for (const side of [1, -1]) {
    const p = add(lot, { x: -f.z, z: f.x }, side * (w / 2 + O.telescopeGap));
    const sh = discShape(p.x, p.z, fr);
    if (!offLine(p) || dist(p, palm) < O.palmClear) continue;
    if (!onLand(ctx, isl, sh, 0.3) || !clear(ctx, isl, sh, 0.5)) continue;
    pushFixture(ctx, isl, 'telescope', p, lot.rotY);
    break;
  }
  const site = findDock(ctx, isl, {
    near: lot,
    maxDist: isl.reach + 6,
    prefer: lot,
    carve: true,
    maxSegments: O.dockSegments,
  });
  dockWithLink(ctx, isl, plan, site, rng.fork('moorings'), {
    rowboats: O.rowboats,
    sailboats: 0,
  });
  return plan;
}

/** Pre-M14b archetype planners: reached only through a theme planner's `legacy()`. */
const ARCHETYPE_PLANNERS: Readonly<
  Record<ArchetypeId, (ctx: SiteCtx, isl: IslandData, rng: Rng, sIdx: number) => SitePlan | null>
> = {
  hearthholm: planHearthholm,
  beaconrock: planBeaconRock,
  millbrook: planMillbrook,
  emberpeak: planEmberpeak,
  palmlagoon: planPalmlagoon,
  mossgrove: planMossgrove,
  lonelypalm: planLonelyPalm,
};

/**
 * Today's plan for an island: its archetype planner, then the department campus on top (HQ is
 * the village itself, Research the outpost itself).
 */
function legacyPlan(ctx: SiteCtx, isl: IslandData, rng: Rng, sIdx: number): SitePlan | null {
  const plan = ARCHETYPE_PLANNERS[isl.archetype](ctx, isl, rng, sIdx);
  if (plan && isl.theme !== 'hq' && isl.theme !== 'research')
    planCampus(ctx, isl, plan, CAMPUS[isl.theme], rng.fork('campus'), sIdx);
  return plan;
}

// ---------------------------------------------------------------------------
// Network.

/** Connect `pin` to the island's network (seeding it if empty). Returns the pin's node key. */
function attach(ctx: SiteCtx, isl: IslandData, req: LinkReq): number | null {
  const start = nearestPathCell(ctx, isl, req.pin);
  if (start < 0) return null;
  if (!ctx.hasNet[isl.id]) {
    addNode(ctx.net, start, isl.id);
    ctx.hasNet[isl.id] = true;
  } else if (!ctx.net.cells[start]) {
    const base = pathStep({ ...stepCtx(ctx, isl), stair: req.kind === 'stair' });
    const near = localWindow(ctx, isl, req.pin, PATHS.linkWindow);
    const search = (corr: LinkReq['corridor'], win = islandWindow(ctx, isl)): number[] | null =>
      gridAStar({
        ...win,
        start,
        goal: -1,
        isGoal: (i) => ctx.net.cells[i] === 1 && ctx.islandMap[i] === isl.id + 1,
        step: corr
          ? (a, b, d) => {
              const p = cellPos(ctx, b);
              return segDist(p, corr.a, corr.b) > corr.half ? Infinity : base(a, b, d);
            }
          : base,
        hScale: 0,
      });
    const cells =
      (req.corridor ? search(req.corridor) : null) ?? search(undefined, near) ?? search(undefined);
    if (!cells) return null;
    addCellPath(ctx.net, cells, isl.id, req.kind);
  }
  const v = addVirtual(ctx.net, isl.id, req.pin);
  addEdge(ctx.net, v, start, req.kind);
  if (!req.boardwalkFrom) return v;
  const door = addVirtual(ctx.net, isl.id, req.boardwalkFrom);
  addEdge(ctx.net, door, v, 'boardwalk');
  return door;
}

// ---------------------------------------------------------------------------
// Flatten.

/**
 * Plateau pads: T = mean footprint height (≥ FLATTEN.minHeight), neighbours
 * with overlapping cores relaxed to differ ≤ FLATTEN.maxStep. Core samples
 * take the (distance-weighted) pad height; a smooth falloff blends outward.
 * Land samples only — the land mask / shore SDF never change. Returns the
 * core mask (protected from path carving).
 */
function applyPads(ctx: SiteCtx): Uint8Array {
  const { h, n, sdf, islandMap } = ctx;
  const pads = ctx.pads;
  const bound = (p: Pad): number =>
    (p.shape.r > 0 ? p.shape.r : Math.hypot(p.shape.hw, p.shape.hd)) + p.margin;
  for (const p of pads) {
    let sum = 0;
    let cnt = 0;
    const R = bound(p);
    const [x0, x1] = gridRange(p.shape.x - R, p.shape.x + R);
    const [z0, z1] = gridRange(p.shape.z - R, p.shape.z + R);
    for (let iz = z0; iz <= z1; iz++)
      for (let ix = x0; ix <= x1; ix++) {
        const i = iz * n + ix;
        if (islandMap[i] !== p.islandId + 1 || sdf[i] <= 0) continue;
        if (shapeDist(p.shape, cellX(ix), cellZ(iz)) > 0.5) continue;
        sum += h.data[i];
        cnt++;
      }
    p.T = Math.max(FLATTEN.minHeight, cnt > 0 ? sum / cnt : heightAt(h, p.shape.x, p.shape.z));
  }
  for (let it = 0; it < 12; it++)
    for (let a = 0; a < pads.length; a++)
      for (let b = a + 1; b < pads.length; b++) {
        const A = pads[a];
        const B = pads[b];
        if (A.islandId !== B.islandId) continue;
        if (dist(A.shape, B.shape) > bound(A) + bound(B)) continue;
        const d = A.T - B.T;
        const ex = Math.abs(d) - FLATTEN.maxStep;
        if (ex <= 0) continue;
        const m = (ex / 2) * Math.sign(d);
        A.T -= m;
        B.T += m;
      }
  const N = n * n;
  const coreW = new Float32Array(N);
  const coreT = new Float32Array(N);
  const fallW = new Float32Array(N);
  const fallT = new Float32Array(N);
  const fallMax = new Float32Array(N);
  for (const p of pads) {
    const R = bound(p) + FLATTEN.falloff;
    const [x0, x1] = gridRange(p.shape.x - R, p.shape.x + R);
    const [z0, z1] = gridRange(p.shape.z - R, p.shape.z + R);
    for (let iz = z0; iz <= z1; iz++)
      for (let ix = x0; ix <= x1; ix++) {
        const i = iz * n + ix;
        if (sdf[i] <= 0 || h.data[i] <= 0) continue;
        const dFoot = shapeDist(p.shape, cellX(ix), cellZ(iz));
        const dCore = dFoot - p.margin;
        if (dCore <= 0) {
          const w = 1 / (0.25 + Math.max(0, dFoot));
          coreW[i] += w;
          coreT[i] += w * p.T;
        } else if (dCore < FLATTEN.falloff) {
          const w = 1 - smoothstep(0, FLATTEN.falloff, dCore);
          fallW[i] += w;
          fallT[i] += w * p.T;
          if (w > fallMax[i]) fallMax[i] = w;
        }
      }
  }
  const protect = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    if (coreW[i] > 0) {
      h.data[i] = coreT[i] / coreW[i];
      protect[i] = 1;
    } else if (fallW[i] > 0) {
      const t = fallT[i] / fallW[i];
      h.data[i] = h.data[i] + (t - h.data[i]) * fallMax[i];
    }
  }
  return protect;
}

// ---------------------------------------------------------------------------
// Fences (patchwork 'fields' themes): straight runs along field-patch edges, gaps at paths.

/**
 * Fence the field patches nearest the farm hub along their rectangle edges
 * (sweep D11: traced component outlines broke into short "sticks" inside the
 * fields). Edges shared with an already fenced patch are skipped; samples off
 * the plateau, near paths/obstacles or on non-field ground open gaps; runs
 * shorter than OUTPOSTS.fenceMinRun posts are dropped.
 */
function fieldFences(
  ctx: SiteCtx,
  isl: IslandData,
  hub: XZ,
  rng: Rng,
  paths: Polyline[],
  fields: readonly FieldPatchData[],
): Polyline[] {
  const fieldCells = (f: FieldPatchData): number => {
    const sh = rectShape(f.x, f.z, f.rotY, f.w, f.d);
    let c = 0;
    forSamplesNearSegment(ctx.h, f, f, Math.hypot(f.w, f.d) / 2, (i) => {
      if (ctx.zone[i] !== Zone.field || ctx.islandMap[i] !== isl.id + 1) return;
      if (shapeDist(sh, cellX(i % ctx.n), cellZ(Math.floor(i / ctx.n))) <= 0) c++;
    });
    return c;
  };
  const cand = fields
    .filter((f) => f.islandId === isl.id && fieldCells(f) >= OUTPOSTS.fenceMinCells)
    .sort((a, b) => dist(a, hub) - dist(b, hub));
  const k = Math.min(cand.length, rng.int(OUTPOSTS.fenceFields[0], OUTPOSTS.fenceFields[1]));
  const nearPath = (p: XZ): boolean => {
    for (const pl of paths) {
      if (pl.islandId !== isl.id) continue;
      for (const q of pl.points) if (dist(p, q) < PATHS.halfWidth + 1.4) return true;
    }
    return false;
  };
  const fenceable = (p: XZ): boolean => {
    if (!onIsland(ctx, isl, p.x, p.z) || sdfAt(ctx, p.x, p.z) < 1.5 || nearPath(p)) return false;
    const i = cellOf(ctx, p.x, p.z);
    const z = ctx.zone[i];
    if (z !== Zone.field && z !== Zone.grass && z !== Zone.meadow) return false;
    return !ctx.shapes[isl.id].some((o) => shapeDist(o, p.x, p.z) < 1);
  };
  const out: Polyline[] = [];
  const posts: XZ[] = [];
  const step = OUTPOSTS.fenceStep;
  for (let f = 0; f < k; f++) {
    const c = cand[f];
    const loop = shapeCorners(rectShape(c.x, c.z, c.rotY, c.w, c.d));
    const pts: XZ[] = [];
    for (let e = 0; e < 4; e++) {
      const a = loop[e];
      const b = loop[(e + 1) % 4];
      const m = Math.max(1, Math.round(dist(a, b) / step));
      for (let j = 0; j < m; j++) pts.push(add(a, unit(a, b), (dist(a, b) * j) / m));
    }
    const ok = pts.map((p) => fenceable(p) && !posts.some((q) => dist(p, q) < step * 0.75));
    const runs: XZ[][] = [];
    if (ok.every(Boolean)) {
      out.push({ islandId: isl.id, kind: 'fence', closed: true, points: pts });
      posts.push(...pts);
      continue;
    }
    // rotate so the loop starts at a gap, then split into runs
    const startAt = ok.indexOf(false);
    let run: XZ[] = [];
    for (let j = 1; j <= pts.length; j++) {
      const idx = (startAt + j) % pts.length;
      if (ok[idx]) run.push(pts[idx]);
      else {
        runs.push(run);
        run = [];
      }
    }
    runs.push(run);
    for (const r of runs) {
      if (r.length < OUTPOSTS.fenceMinRun) continue;
      out.push({ islandId: isl.id, kind: 'fence', closed: false, points: r });
      posts.push(...r);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Roof colours (sweep D12): neighbouring lots never share a roof colour.

/** Roof colour (palette ROOFS index) of a lot's def + variant; −1 = not part of the rule. */
export function lotRoof(l: { defId: string; kind: string; variant: number }): number {
  if (!ROOFED_KINDS.includes(l.kind as LotData['kind'])) return -1;
  const roofs = LOT_ROOFS[l.defId];
  return roofs ? roofs[l.variant % roofs.length] : -1;
}

/** Neighbour lists for the roof rule: roofed lots on one island closer than VILLAGE.roofNeighbour. */
export function roofNeighbours(lots: readonly LotData[]): number[][] {
  const nb: number[][] = lots.map(() => []);
  for (let a = 0; a < lots.length; a++)
    for (let b = a + 1; b < lots.length; b++) {
      const A = lots[a];
      const B = lots[b];
      if (A.islandId !== B.islandId || !LOT_ROOFS[A.defId] || !LOT_ROOFS[B.defId]) continue;
      if (!ROOFED_KINDS.includes(A.kind) || !ROOFED_KINDS.includes(B.kind)) continue;
      if (dist(A, B) >= VILLAGE.roofNeighbour) continue;
      nb[a].push(b);
      nb[b].push(a);
    }
  return nb;
}

/**
 * Pick every lot's variant (in place). Each connected group of roof neighbours is coloured on
 * its own, in index order; each lot tries its variants in an order fixed by its seeded hash and
 * takes the first whose roof differs from every already-coloured neighbour, backtracking when
 * stuck (bounded); on exhaustion that group falls back to the least-conflicting variants (an
 * odd ring of 2-variant office defs cannot alternate — it must not spoil the other groups).
 */
function assignLotVariants(lots: LotData[], seed: number): void {
  const nb = roofNeighbours(lots);
  const order = lots.map((l, i) => {
    const k = LOT_ROOFS[l.defId]?.length ?? 1;
    const vs = Array.from({ length: k }, (_, v) => v);
    const h = vs.map((v) => hashInts(seed, i, v));
    return vs.sort((x, y) => h[x] - h[y]);
  });
  const set = new Uint8Array(lots.length);
  const ok = (i: number, v: number): boolean => {
    const r = lotRoof({ ...lots[i], variant: v });
    if (r < 0) return true;
    for (const j of nb[i]) if (set[j] && lotRoof(lots[j]) === r) return false;
    return true;
  };
  const seen = new Uint8Array(lots.length);
  for (let i0 = 0; i0 < lots.length; i0++) {
    if (seen[i0]) continue;
    const group = [i0];
    seen[i0] = 1;
    for (let k = 0; k < group.length; k++)
      for (const j of nb[group[k]])
        if (!seen[j]) {
          seen[j] = 1;
          group.push(j);
        }
    group.sort((a, b) => a - b);
    let budget = 20000;
    const solve = (k: number): boolean => {
      if (k >= group.length) return true;
      const i = group[k];
      for (const v of order[i]) {
        if (budget-- <= 0) return false;
        if (!ok(i, v)) continue;
        lots[i].variant = v;
        set[i] = 1;
        if (solve(k + 1)) return true;
        set[i] = 0;
      }
      return false;
    };
    if (solve(0)) continue;
    // fallback (not colourable or over budget): greedy, fewest clashes
    for (const i of group) set[i] = 0;
    for (const i of group) {
      let best = order[i][0];
      let bc = Infinity;
      for (const v of order[i]) {
        const r = lotRoof({ ...lots[i], variant: v });
        let c = 0;
        for (const j of nb[i]) if (set[j] && r >= 0 && lotRoof(lots[j]) === r) c++;
        if (c < bc) {
          bc = c;
          best = v;
        }
      }
      lots[i].variant = best;
      set[i] = 1;
    }
  }
}

// ---------------------------------------------------------------------------

export interface SettlementInput {
  h: Heightfield;
  sdf: Float32Array;
  zone: Uint8Array;
  islandMap: Uint8Array;
  islands: IslandData[];
  windDir: number;
  streams: StreamData[];
  /** Millbrook crop-field rectangles (fences follow their edges). */
  fields: FieldPatchData[];
}

export interface SettlementResult {
  settlements: SettlementData[];
  lots: LotData[];
  landmarks: LandmarkData[];
  docks: DockData[];
  moorings: MooringData[];
  fixtures: FixtureData[];
  fences: Polyline[];
  paths: Polyline[];
  pathGraph: PathGraph;
  /** Theme districts of every plan, in plan order. */
  districts: DistrictData[];
  /** Obstacles per island (occupancy marking). */
  shapes: Shape[][];
}

/**
 * Plan every island's settlement, flatten the pads, connect the footpath
 * network, write Zone.plaza / Zone.path (+ carve) and trace fences.
 * Mutates `h.data` (pads on land, dock channels in water) and `zone`.
 */
export function buildSettlements(input: SettlementInput, rng: Rng): SettlementResult {
  const n = input.h.n;
  const ctx: SiteCtx = {
    h: input.h,
    n,
    sdf: input.sdf,
    zone: input.zone,
    islandMap: input.islandMap,
    windDir: input.windDir,
    islands: input.islands,
    streams: input.streams,
    fields: input.fields,
    net: createNetwork(n),
    blocked: new Uint8Array(n * n),
    hasNet: input.islands.map(() => false),
    reach: input.islands.map(() => null),
    pads: [],
    shapes: input.islands.map(() => []),
    lanes: input.islands.map(() => []),
    lots: [],
    landmarks: [],
    docks: [],
    moorings: [],
    fixtures: [],
  };
  const plans: (SitePlan & { islandId: number })[] = [];
  for (const isl of input.islands) {
    const r = rng.fork('sites', isl.id);
    const sIdx = plans.length;
    const plan = THEME_PLANNERS[isl.theme]({
      ctx,
      isl,
      rng: r,
      sIdx,
      legacy: () => legacyPlan(ctx, isl, r, sIdx),
    });
    if (plan) plans.push({ ...plan, islandId: isl.id });
  }

  const protect = applyPads(ctx);

  // connect: hub first (seeds the network), then the rest in plan order
  for (const plan of plans) {
    const isl = input.islands[plan.islandId];
    for (const req of plan.links) {
      const key = attach(ctx, isl, req);
      if (plan.hubKey < 0 && key !== null && !req.boardwalkFrom) plan.hubKey = key;
      if (plan.hubKey < 0 && key !== null && req.boardwalkFrom) {
        // stilt-hut hub (Palmlagoon): the shore end of the boardwalk
        const l = ctx.net.adj.get(key);
        plan.hubKey = l && l.length > 0 ? l[0].to : key;
      }
      req.done(key);
    }
  }

  const valid = (x: number, z: number, islandId: number): boolean => {
    if (sdfAt(ctx, x, z) < 0.3) return false;
    const sh = islandId >= 0 ? ctx.shapes[islandId] : [];
    for (const o of sh) if (o.r === 0 && shapeDist(o, x, z) < 0.2) return false;
    return true;
  };
  const built = buildPathGraph(ctx.net, n, valid);

  // drop lots that could not be connected; remap settlement indices
  const lotMap = new Int32Array(ctx.lots.length).fill(-1);
  const lots: LotData[] = [];
  ctx.lots.forEach((l, i) => {
    const node = l.key >= 0 ? built.nodeOf.get(l.key) : undefined;
    if (node === undefined) return;
    lotMap[i] = lots.length;
    lots.push({
      defId: l.defId,
      x: l.x,
      z: l.z,
      rotY: l.rotY,
      islandId: l.islandId,
      kind: l.kind,
      w: l.w,
      d: l.d,
      node,
      variant: 0,
      role: OFFICE_DEFS[l.defId] ? (LOT_ROLE_BY_KIND[l.kind] ?? 'office') : 'legacy',
    });
  });
  assignLotVariants(lots, rng.fork('roofs').nextU32());
  const docks: DockData[] = ctx.docks.map((d) => ({
    x: d.x,
    z: d.z,
    rotY: d.rotY,
    segments: d.segments,
    islandId: d.islandId,
    node: d.node >= 0 ? (built.nodeOf.get(d.node) ?? -1) : -1,
  }));

  // zones: plaza discs, fields under lots → grass, then paths (+ carve)
  for (const plan of plans) {
    if (!plan.plaza) continue;
    const { x, z, r } = plan.plaza;
    forSamplesNearSegment(ctx.h, plan.plaza, plan.plaza, r, (i) => {
      if (ctx.sdf[i] > 0 && ctx.islandMap[i] === plan.islandId + 1) ctx.zone[i] = Zone.plaza;
    });
    void x;
    void z;
  }
  for (const l of lots) {
    if (l.kind === 'hut') continue;
    const sh = lotShape(l);
    const R = Math.hypot(sh.hw, sh.hd) + FLATTEN.lotMargin;
    forSamplesNearSegment(ctx.h, l, l, R, (i) => {
      const z = ctx.zone[i];
      if (z !== Zone.field && z !== Zone.rock && z !== Zone.cliff) return;
      const d = shapeDist(sh, cellX(i % n), cellZ(Math.floor(i / n)));
      // fields under the footprint; slope zones left stale on a terraced pad core (plan risk #11)
      if (d < (z === Zone.field ? 1 : FLATTEN.lotMargin)) ctx.zone[i] = Zone.grass;
    });
  }
  writePaths(ctx.h, ctx.zone, ctx.sdf, built.paths, protect);

  const fences: Polyline[] = [];
  for (const plan of plans) {
    const isl = input.islands[plan.islandId];
    if (THEMES[isl.theme].patchwork !== 'fields') continue;
    fences.push(
      ...fieldFences(
        ctx,
        isl,
        plan.hub,
        rng.fork('sites', isl.id).fork('fences'),
        built.paths,
        input.fields,
      ),
    );
  }
  for (const plan of plans) if (plan.lines) fences.push(...plan.lines);

  const settlements: SettlementData[] = plans.map((p) => {
    const hubNode = p.hubKey >= 0 ? (built.nodeOf.get(p.hubKey) ?? -1) : -1;
    const hubPos =
      hubNode >= 0
        ? { x: built.graph.nodes[hubNode * 2], z: built.graph.nodes[hubNode * 2 + 1] }
        : p.hub;
    return {
      islandId: p.islandId,
      kind: p.kind,
      theme: input.islands[p.islandId].theme,
      hub: { x: hubPos.x, z: hubPos.z, node: hubNode },
      plaza: p.plaza,
      lots: p.lots.map((i) => lotMap[i]).filter((i) => i >= 0),
      landmarks: p.landmarks,
      docks: p.docks,
    };
  });
  // the first office of each settlement (archetype building / office nearest the quad) leads;
  // without an office, its first themed lot
  for (const s of settlements) {
    const li =
      s.lots.find((i) => lots[i].role === 'office') ??
      s.lots.find((i) => lots[i].role !== 'legacy');
    if (li !== undefined) lots[li].role = 'main';
  }

  return {
    settlements,
    lots,
    landmarks: ctx.landmarks,
    docks,
    moorings: ctx.moorings,
    fixtures: ctx.fixtures,
    fences,
    paths: built.paths,
    pathGraph: built.graph,
    districts: plans.flatMap((p) => p.districts),
    shapes: ctx.shapes,
  };
}

/** Occupancy value for structures (ground cover avoids these; trees avoid any non-zero). */
export const OCC_STRUCTURE = 2;
/** Occupancy value for footpaths. */
export const OCC_PATH = 1;

/**
 * Mark settlement obstacles (lots, landmarks, fixtures, docks, moorings,
 * boardwalks, plaza) as OCC_STRUCTURE and footpaths as OCC_PATH, before scatter.
 */
export function markSites(occ: OccupancyGrid, world: WorldData, shapes: Shape[][]): void {
  const c = occ.cell;
  const markShape = (sh: Shape, value: number, pad: number): void => {
    const R = (sh.r > 0 ? sh.r : Math.hypot(sh.hw, sh.hd)) + pad + c;
    const x0 = Math.max(0, Math.floor((sh.x - R - occ.originX) / c));
    const x1 = Math.min(occ.n - 1, Math.floor((sh.x + R - occ.originX) / c));
    const z0 = Math.max(0, Math.floor((sh.z - R - occ.originZ) / c));
    const z1 = Math.min(occ.n - 1, Math.floor((sh.z + R - occ.originZ) / c));
    for (let iz = z0; iz <= z1; iz++)
      for (let ix = x0; ix <= x1; ix++) {
        const x = occ.originX + (ix + 0.5) * c;
        const z = occ.originZ + (iz + 0.5) * c;
        if (shapeDist(sh, x, z) <= pad) {
          const i = iz * occ.n + ix;
          if (occ.data[i] < value) occ.data[i] = value;
        }
      }
  };
  for (const list of shapes) for (const sh of list) markShape(sh, OCC_STRUCTURE, 0.75);
  for (const p of world.paths)
    for (const q of p.points) markShape(discShape(q.x, q.z, PATHS.halfWidth), OCC_PATH, 0);
}
