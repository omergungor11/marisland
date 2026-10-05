/**
 * Marketing island plan (Beacon Rock sea stack; M14b §2.4, TASK-365). The archetype gives the
 * stack, the summit and the lee landing; the theme puts on it:
 * - the Broadcast Tower (THEMES.marketing.landmarks) on the summit, the one dominant vertical;
 * - Landing: the pier + a megaphone kiosk, the stair up to the tower;
 * - Clifftop Stage: a small quad (plaza) with the stage facing it and banner poles round it;
 * - Studio Ledge: broadcastStudio + billboard office lots by the quad;
 * - two billboardV2 on ledges facing the archipelago centre, tops below the tower;
 * - ad buoys in the lee water.
 */
import { CAMPUS, FLATTEN, LOT_FOOTPRINT } from '../../../content/settlements.ts';
import { MARKETING_PLAN as P } from '../../../content/themes/marketing.ts';
import { THEMES } from '../../../content/themes/index.ts';
import type { IslandData, XZ } from '../../types.ts';
import { heightAt } from '../../types.ts';
import { gridRange } from '../grid.ts';
import {
  add,
  addPad,
  addShape,
  ang,
  campusQuad,
  cellPos,
  clear,
  dirOf,
  discShape,
  dist,
  dockWithLink,
  findDock,
  landmarkAccess,
  linkLot,
  newPlan,
  onLand,
  placeBuoys,
  placeNear,
  pushLandmark,
  rectShape,
  relief,
  seedHub,
  stairCorridor,
  unit,
  walkableFrom,
  type Shape,
  type SiteCtx,
  type SitePlan,
} from '../sites.ts';
import type { ThemePlanner } from './types.ts';

const DEG = Math.PI / 180;

/** A fixed prop (not a lot) with its own obstacle shape; `pad` flattens the ground under it. */
function fixture(
  ctx: SiteCtx,
  isl: IslandData,
  defId: string,
  p: XZ,
  rotY: number,
  sh: Shape,
  pad: boolean,
): void {
  ctx.fixtures.push({ defId, x: p.x, z: p.z, rotY, islandId: isl.id });
  addShape(ctx, isl, sh, true);
  if (pad) addPad(ctx, isl, sh, FLATTEN.discMargin);
}

/** Megaphone kiosk on land beside the pier root, facing the pier. */
function placeKiosk(ctx: SiteCtx, isl: IslandData, root: XZ): void {
  for (let r = P.kioskRing[0]; r <= P.kioskRing[1]; r++)
    for (let k = 0; k < 12; k++) {
      const p = add(root, dirOf((k / 12) * Math.PI * 2), r);
      const sh = discShape(p.x, p.z, P.kioskRadius);
      if (!onLand(ctx, isl, sh, 1.5, 0.4) || relief(ctx, sh) > 1) continue;
      if (!clear(ctx, isl, sh, 0.6)) continue;
      const f = unit(p, root);
      fixture(ctx, isl, 'megaphoneKiosk', p, ang(f.x, f.z), sh, false);
      return;
    }
}

/** Stage beside the quad (front steps toward it) and banner poles on the quad edge. */
function placeStage(ctx: SiteCtx, isl: IslandData, quad: XZ, avoid: XZ): void {
  const R = CAMPUS.marketing.quadR;
  const off = R + P.stage.gap + P.stage.d / 2;
  let best: { p: XZ; a: number; sh: Shape } | null = null;
  let bs = Infinity;
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2;
    const p = add(quad, dirOf(a), off);
    const sh = rectShape(p.x, p.z, a + Math.PI, P.stage.w, P.stage.d);
    if (!onLand(ctx, isl, sh, 2)) continue;
    const r = relief(ctx, sh);
    if (r > P.stage.maxRelief || !clear(ctx, isl, sh, 1, true)) continue;
    // flattest, then away from the tower (the tower keeps its own clearing)
    const s = r - 0.05 * dist(p, avoid);
    if (s < bs) {
      bs = s;
      best = { p, a, sh };
    }
  }
  if (!best) return;
  fixture(ctx, isl, 'stage', best.p, best.a + Math.PI, best.sh, true);
  for (const da of P.bannerPoles) {
    const a = best.a + da * DEG;
    const p = add(quad, dirOf(a), R + 0.6);
    const sh = discShape(p.x, p.z, 0.5);
    if (!onLand(ctx, isl, sh, 1) || !clear(ctx, isl, sh, 0.3, true)) continue;
    fixture(ctx, isl, 'bannerPole', p, a + Math.PI, sh, false);
  }
}

/**
 * billboardV2 ×count on the ledges facing the archipelago centre: footprint on land, ledge relief,
 * shore window, within `spreadDeg` of the island → centre heading, top below the tower's.
 */
function placeBillboards(ctx: SiteCtx, isl: IslandData, lhIndex: number): void {
  const B = P.billboard;
  const lm = ctx.landmarks[lhIndex];
  const topMax = heightAt(ctx.h, lm.x, lm.z) + P.towerHeight - B.belowTower;
  let cx = 0;
  let cz = 0;
  for (const o of ctx.islands) {
    cx += o.cx / ctx.islands.length;
    cz += o.cz / ctx.islands.length;
  }
  const centre = { x: cx, z: cz };
  const out = unit({ x: isl.cx, z: isl.cz }, centre);
  const spread = Math.cos(B.spreadDeg * DEG);
  const placed: XZ[] = [];
  const [x0, x1] = gridRange(isl.minX, isl.maxX);
  const [z0, z1] = gridRange(isl.minZ, isl.maxZ);
  for (let b = 0; b < B.count; b++) {
    let best: { p: XZ; rot: number; sh: Shape } | null = null;
    let bs = Infinity;
    for (let iz = z0; iz <= z1; iz++)
      for (let ix = x0; ix <= x1; ix++) {
        const i = iz * ctx.n + ix;
        if (ctx.islandMap[i] !== isl.id + 1) continue;
        const s = ctx.sdf[i];
        if (s < B.shore[0] || s > B.shore[1]) continue;
        const p = cellPos(ctx, i);
        const u = unit({ x: isl.cx, z: isl.cz }, p);
        const align = u.x * out.x + u.z * out.z;
        if (align < spread || placed.some((q) => dist(q, p) < B.spacing)) continue;
        if (heightAt(ctx.h, p.x, p.z) + B.height > topMax) continue;
        const f = unit(p, centre);
        const rot = ang(f.x, f.z);
        const sh = rectShape(p.x, p.z, rot, B.w, B.d);
        if (!onLand(ctx, isl, sh, B.shore[0])) continue;
        const r = relief(ctx, sh);
        if (r > B.maxRelief || !clear(ctx, isl, sh, 1.2)) continue;
        // facing the centre squarely, then flattest, then near the ledge edge
        const sc = (1 - align) * 4 + r + 0.15 * (s - B.shore[0]);
        if (sc < bs) {
          bs = sc;
          best = { p, rot, sh };
        }
      }
    if (!best) return;
    fixture(ctx, isl, 'billboardV2', best.p, best.rot, best.sh, true);
    placed.push(best.p);
  }
}

export const planMarketing: ThemePlanner = ({ ctx, isl, rng, sIdx }) => {
  // the Broadcast Tower on its anchor (the theme's landmark table)
  const lms = Object.entries(THEMES[isl.theme].landmarks).filter(([k]) => isl.anchors[k]);
  if (lms.length === 0) return null;
  const [anchorKey, spec] = lms[0];
  const lh = isl.anchors[anchorKey];
  const landing = isl.anchors.landing ?? lh;
  const plan: SitePlan = newPlan('lighthouse', lh);
  const lhIndex = pushLandmark(ctx, isl, spec.kind, lh, lh.rotY);
  plan.landmarks.push(lhIndex);
  plan.hub = landmarkAccess(ctx, lhIndex, landing);
  plan.links.push({ pin: plan.hub, kind: 'path', done: () => undefined });

  // Landing: pier + stair up to the tower, megaphone kiosk by the pier root
  const site = findDock(ctx, isl, {
    near: landing,
    maxDist: P.dockSearch,
    prefer: landing,
    carve: true,
  });
  dockWithLink(ctx, isl, plan, site, rng.fork('moorings'), { rowboats: 1, sailboats: 0 }, 'stair');
  if (site) {
    stairCorridor(plan, site.root, plan.hub);
    placeKiosk(ctx, isl, site.root);
  }

  // Clifftop Stage: quad (Zone.plaza) seeds the island network; stage + banner poles round it
  const cs = CAMPUS.marketing;
  const quad = campusQuad(ctx, isl, plan, cs);
  const centre = quad ?? plan.hub;
  if (quad) {
    seedHub(ctx, isl, plan, quad);
    placeStage(ctx, isl, quad, lh);
  }

  // Studio Ledge: the studio by the quad, its billboard office next to it, more studios to fill
  ctx.reach[isl.id] = walkableFrom(ctx, isl, centre);
  const lots: number[] = [];
  const studio = placeNear(ctx, isl, 'broadcastStudio', centre, quad ? cs.quadR : 0, cs, sIdx);
  if (studio >= 0) lots.push(studio);
  const bbCentre = studio >= 0 ? ctx.lots[studio] : centre;
  const bbInner =
    studio >= 0 ? P.billboardLotInner + LOT_FOOTPRINT.broadcastStudio[0] / 2 : quad ? cs.quadR : 0;
  const bb = placeNear(ctx, isl, 'billboard', bbCentre, bbInner, cs, sIdx);
  if (bb >= 0) lots.push(bb);
  const target = rng.fork('lots').int(P.lots[0], P.lots[1]);
  while (lots.length < target) {
    const li = placeNear(ctx, isl, 'broadcastStudio', centre, quad ? cs.quadR : 0, cs, sIdx);
    if (li < 0) break;
    lots.push(li);
  }
  ctx.reach[isl.id] = null;
  lots.sort((a, b) => dist(ctx.lots[a], centre) - dist(ctx.lots[b], centre));
  for (const li of lots) linkLot(ctx, plan, li);

  // billboards facing the archipelago, then ad buoys (the buoy layout, recoloured)
  placeBillboards(ctx, isl, lhIndex);
  const f0 = ctx.fixtures.length;
  placeBuoys(ctx, isl, rng.fork('buoys'));
  for (let k = f0; k < ctx.fixtures.length; k++) ctx.fixtures[k].defId = 'adBuoy';
  return plan;
};
