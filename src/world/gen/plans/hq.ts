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
 * - Harbour Guild culture (M19 TASK-420, ISLAND_CULTURES §2.1): the crown lot builds the Guild Hall
 *   (hqAnnex v2); ferry awning, timetable, signpost, mail bags, crane, seven-colour crates and gull
 *   perches at the pier root; bell post up the harbour lane; coffee cart and notice board on the
 *   quad; pennant lines across the lanes; one story spot per anchored kit piece.
 *
 * No cottages, tower house, market stalls, well or stilt huts. Layout numbers: content HQ_PLAN,
 * culture numbers: content HQ_CULTURE_SITE.
 */
import { CAMPUS, FIXTURE_RADIUS, FLATTEN, PATHS, VILLAGE } from '../../../content/settlements.ts';
import { HQ_PLAN } from '../../../content/themes/hq.ts';
import { HQ_CULTURE, HQ_CULTURE_SITE } from '../../../content/cultures/hq.ts';
import type { Rng } from '../../../core/rng.ts';
import type { IslandData, StorySpot, XZ } from '../../types.ts';
import { heightAt, THEME_IDS, Zone } from '../../types.ts';
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
  rectShape,
  relief,
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
  // the crown is the Harbour Guild hall (hqAnnex v2, same far silhouette as v1)
  for (const li of offices)
    if (ctx.lots[li].defId === 'hqAnnex') ctx.lots[li].pin = HQ_CULTURE_SITE.guildHallVariant;

  // ---- Meeting Garden
  const garden = placeGarden(ctx, isl, plan, quad, sIdx, rng.fork('garden'));

  for (const li of kiosks) linkLot(ctx, plan, li);
  offices.sort((a, b) => dist(ctx.lots[a], quad) - dist(ctx.lots[b], quad));
  for (const li of offices) linkLot(ctx, plan, li);
  if (garden >= 0) linkLot(ctx, plan, garden);

  if (dockSite) placeFerryOffice(ctx, isl, dockSite.root, dockSite.dir);
  placeBanners(ctx, isl, quad, dockSite);
  plan.stories = placeCulture(ctx, isl, quad, a0, dockSite, rng.fork('culture'));
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

// ---------------------------------------------------------------------------
// Harbour Guild culture (M19 TASK-420).

/** Local frame: origin, `d` = along (toward the sea), `n` = side. */
interface Frame {
  o: XZ;
  d: XZ;
  n: XZ;
}
const at = (f: Frame, along: number, side: number): XZ => add(add(f.o, f.d, along), f.n, side);
/** Blocking disc of a culture def (FIXTURE_RADIUS, also the life solid). */
const rad = (def: string): number => FIXTURE_RADIUS[def] ?? 0.5;

/**
 * Fixture with a planner-chosen variant and a blocking disc of radius `r`; `pad` levels the ground
 * under it (a small plateau that never pulls its neighbours' levels: HQ_CULTURE_SITE.padStep).
 */
function putKit(
  ctx: SiteCtx,
  isl: IslandData,
  defId: string,
  p: XZ,
  rotY: number,
  r: number,
  variant: number,
  pad = false,
): void {
  ctx.fixtures.push({ defId, x: p.x, z: p.z, rotY, islandId: isl.id, variant });
  addShape(ctx, isl, discShape(p.x, p.z, r), true);
  const S = HQ_CULTURE_SITE;
  if (pad) {
    const margin = Math.max(0.5, S.padCore - r);
    addPad(ctx, isl, discShape(p.x, p.z, r), margin, S.padStep, S.padGroup);
  }
}

/**
 * Culture props of the Harbour Guild around the quad and the ferry pier. Returns the story spot
 * requests (one per CultureDef story kind whose anchor piece was placed).
 */
function placeCulture(
  ctx: SiteCtx,
  isl: IslandData,
  quad: XZ,
  a0: number,
  dockSite: { root: XZ; dir: XZ } | null,
  rng: Rng,
): StorySpot[] {
  const S = HQ_CULTURE_SITE;
  const anchors = new Map<string, { p: XZ; rotY: number }>();
  const apron = dockSite?.root ?? null;
  const ground = (p: XZ, r: number, y: readonly [number, number], maxRelief: number): boolean => {
    if (!onIsland(ctx, isl, p.x, p.z)) return false;
    const h = heightAt(ctx.h, p.x, p.z);
    if (h < y[0] || h > y[1]) return false;
    for (let k = 0; k < 6; k++) {
      const q = add(p, dirOf((k * Math.PI) / 3), r);
      if (heightAt(ctx.h, q.x, q.z) < y[0] - 0.1) return false;
    }
    return relief(ctx, discShape(p.x, p.z, r)) <= maxRelief;
  };
  const free = (p: XZ, r: number, gap = 0.3): boolean =>
    freeOfShapes(ctx, isl, discShape(p.x, p.z, r), gap) &&
    offLanes(ctx, isl, p, r) &&
    (!apron || dist(p, apron) >= S.apron + r);
  /**
   * A levelled prop's pad core must not overlap a foreign pad core (quad, lot, landmark): the
   * blend would tilt both plateaus. Otherwise the prop goes unpadded (and needs gentler ground).
   */
  const padFree = (p: XZ): boolean =>
    ctx.pads.every(
      (q) =>
        q.islandId !== isl.id ||
        q.group === S.padGroup ||
        shapeDist(q.shape, p.x, p.z) >= q.margin + S.padCore,
    );
  /** The pad levels the prop: no foreign core under it and its whole core on land. */
  const padOk = (p: XZ): boolean => padFree(p) && sdfAt(ctx, p.x, p.z) >= S.padCore;
  /**
   * Ground relief a prop tolerates: padded > small > wide or levelled-but-unpadded (near flat; a
   * neighbouring plateau's falloff may still tilt it a little).
   */
  const maxRelief = (p: XZ, r: number, pad: boolean): number =>
    pad && padOk(p) ? S.padRelief : pad || r >= 1 ? S.wideRelief : S.relief;
  /** Dry land for a prop of radius `r`; a padded prop (levelled under it) tolerates more slope. */
  const land = (p: XZ, r: number, pad = false): boolean =>
    ground(p, r, [S.minY, Infinity], maxRelief(p, r, pad)) &&
    sdfAt(ctx, p.x, p.z) >= r &&
    free(p, r);
  const quay = (p: XZ, r: number, pad = false): boolean =>
    ground(p, r * 0.5, S.quayY, maxRelief(p, r, pad)) &&
    sdfAt(ctx, p.x, p.z) <= S.quayShore &&
    free(p, r);
  /** First (along, side) candidate of the frame accepted by `ok` (sides outer, along inner). */
  const first = (
    f: Frame,
    along: readonly number[],
    side: readonly number[],
    ok: (p: XZ) => boolean,
  ): { p: XZ; along: number; side: number } | null => {
    for (const s of side)
      for (const a of along) {
        const p = at(f, a, s);
        if (ok(p)) return { p, along: a, side: s };
      }
    return null;
  };

  /**
   * Beside the lane nearest `from`: `steps` u along the lane away from it, `side` u off its
   * centreline (the first dry, free spot).
   */
  const beside = (
    from: XZ,
    steps: readonly number[],
    side: readonly number[],
    r: number,
    pad = false,
  ): XZ | null => {
    let best: { lane: readonly XZ[]; k: number } | null = null;
    let bd = Infinity;
    for (const lane of ctx.lanes[isl.id])
      lane.forEach((q, k) => {
        const d = dist(q, from);
        if (d < bd) {
          bd = d;
          best = { lane, k };
        }
      });
    if (!best) return null;
    const { lane, k } = best as { lane: readonly XZ[]; k: number };
    const dirK = k < lane.length / 2 ? 1 : -1;
    for (const s of side)
      for (const st of steps) {
        const j = k + dirK * Math.round(st);
        if (j < 1 || j + 1 >= lane.length) continue;
        const t = unit(lane[j - 1], lane[j + 1]);
        const p = add(lane[j], { x: -t.z, z: t.x }, s);
        if (land(p, r, pad)) return p;
      }
    return null;
  };

  /** First quad ring spot (angles from the harbour heading), facing the quad centre. */
  const onQuad = (
    rings: readonly number[],
    angles: readonly number[],
    r: number,
    inPlaza: boolean,
  ): { p: XZ; rotY: number } | null => {
    for (const ring of rings)
      for (const d of angles) {
        const p = add(quad, dirOf(a0 + d * DEG), ring);
        const ok = inPlaza
          ? ground(p, r, [S.minY, Infinity], maxRelief(p, r, false)) && free(p, r)
          : land(p, r, true);
        if (ok) return { p, rotY: ang(quad.x - p.x, quad.z - p.z) };
      }
    return null;
  };

  if (dockSite) {
    const D = dockSite.dir;
    const N = { x: -D.z, z: D.x };
    const pier: Frame = { o: dockSite.root, d: D, n: N };
    /** Awning frame: `out` > 0 = away from the lane (the awning's side of the pier). */
    const awFrame = (a: { p: XZ; side: number }): Frame => {
      const sg = Math.sign(a.side);
      return { o: a.p, d: D, n: { x: N.x * sg, z: N.z * sg } };
    };
    const toSea = ang(D.x, D.z);

    // pier signpost (seven-board fan) beside the path that leaves the pier root, first so that
    // every pier gets one; fallback: the pier frame
    const sp =
      beside(dockSite.root, S.signpost.steps, S.signpost.side, rad('pierSignpost')) ??
      first(pier, S.signpost.along, S.signpost.side, (p) => land(p, rad('pierSignpost')))?.p;
    if (sp) {
      putKit(ctx, isl, 'pierSignpost', sp, toSea, rad('pierSignpost'), S.signpost.variant);
      anchors.set('pierSignpost', { p: sp, rotY: toSea });
    }

    // ferry awning inland of the pier root, open side to the water
    // (a harbour too tight between the quad and the water: on the quad's harbour edge instead)
    const onPlaza = onQuad(S.awning.quadRings, S.awning.quadAngles, rad('ferryAwning'), true);
    const aw =
      first(pier, S.awning.along, S.awning.side, (p) => land(p, rad('ferryAwning'), true)) ??
      (onPlaza && {
        p: onPlaza.p,
        side: (onPlaza.p.x - pier.o.x) * N.x + (onPlaza.p.z - pier.o.z) * N.z || 1,
      });
    if (aw) {
      putKit(
        ctx,
        isl,
        'ferryAwning',
        aw.p,
        toSea,
        rad('ferryAwning'),
        S.awning.variant,
        padOk(aw.p),
      );
      anchors.set('ferryAwning', { p: aw.p, rotY: toSea });
    }
    // timetable beside the awning (away from the lane), else beside the pier path; read from
    // the pier root
    const ttOk = (p: XZ): boolean => land(p, rad('timetableBoard'), true);
    const tt =
      (aw ? first(awFrame(aw), S.timetable.along, S.timetable.out, ttOk)?.p : null) ??
      beside(dockSite.root, S.timetable.steps, S.timetable.laneSide, rad('timetableBoard'), true);
    if (tt) {
      const face = ang(dockSite.root.x - tt.x, dockSite.root.z - tt.z);
      const v = S.timetable.variant;
      putKit(ctx, isl, 'timetableBoard', tt, face, rad('timetableBoard'), v, padOk(tt));
      anchors.set('timetableBoard', { p: tt, rotY: face });
    }
    // mail bags at the post spot: beside the awning, else beside the pier path
    const bagRng = rng.fork('kit', 1);
    const bags = bagRng.int(S.mailbag.count[0], S.mailbag.count[1]);
    for (let k = 0; k < bags; k++) {
      const ok = (p: XZ): boolean => land(p, rad('mailbag'));
      const mb =
        (aw ? first(awFrame(aw), S.mailbag.along, S.mailbag.out, ok)?.p : null) ??
        beside(dockSite.root, S.mailbag.steps, S.mailbag.laneSide, rad('mailbag'));
      if (!mb) break;
      const rot = bagRng.range(0, Math.PI * 2);
      putKit(ctx, isl, 'mailbag', mb, rot, rad('mailbag'), k % 2);
      if (k === 0) anchors.set('mailbag', { p: mb, rotY: rot });
    }

    // hand crane on the quay edge, jib over the water (local +x = jib)
    const cr = first(pier, S.crane.along, S.crane.side, (p) => quay(p, rad('harbourCrane'), true));
    if (cr) {
      const jib = toSea + Math.PI / 2;
      putKit(
        ctx,
        isl,
        'harbourCrane',
        cr.p,
        jib,
        rad('harbourCrane'),
        S.crane.variant,
        padOk(cr.p),
      );
    }

    // cargo crates in the seven culture colours, in clusters by the crane
    const crateRng = rng.fork('kit', 2);
    const colours = crateRng.shuffle(THEME_IDS.map((_, i) => i));
    let ci = 0;
    for (const cl of S.crates.clusters) {
      const spots = (c: XZ, sg: number): XZ[] =>
        S.crates.grid.slice(0, cl.size).map(([a, s]) => add(add(c, D, a), N, s * sg));
      const okCluster = (c: XZ, sg: number): boolean =>
        spots(c, sg).every((p) => land(p, rad('cargoCrate')) || quay(p, rad('cargoCrate')));
      let placed: XZ[] | null = null;
      for (const s of cl.side) {
        for (const a of cl.along) {
          const c = at(pier, a, s);
          if (okCluster(c, Math.sign(s))) {
            placed = spots(c, Math.sign(s));
            break;
          }
        }
        if (placed) break;
      }
      if (!placed) continue;
      for (const p of placed) {
        if (ci >= colours.length) break;
        const rot = toSea + crateRng.range(-0.25, 0.25);
        putKit(ctx, isl, 'cargoCrate', p, rot, rad('cargoCrate'), colours[ci++]);
      }
    }

    // gull perches on the waterline beside the pier
    const gullRng = rng.fork('kit', 3);
    const nPerch = gullRng.int(S.perches.count[0], S.perches.count[1]);
    const perches: XZ[] = [];
    for (const s of S.perches.side)
      for (const a of S.perches.along) {
        if (perches.length >= nPerch) break;
        const p = at(pier, a, s);
        if (perches.some((q) => dist(q, p) < S.perches.gap) || !quay(p, rad('gullPerch'))) continue;
        const rot = gullRng.range(0, Math.PI * 2);
        putKit(ctx, isl, 'gullPerch', p, rot, rad('gullPerch'), S.perches.variant);
        if (perches.length === 0) anchors.set('gullPerch', { p, rotY: rot });
        perches.push(p);
      }

    // harbour bell up the lane from the pier root, facing the lane (else beside the pier path,
    // facing the quad)
    const bl = first(pier, S.bell.along, S.bell.side, (p) => land(p, rad('bellPost'), true));
    const blAlt = bl
      ? null
      : beside(dockSite.root, S.bell.steps, S.bell.laneSide, rad('bellPost'), true);
    const bp = bl?.p ?? blAlt;
    if (bp) {
      const face = bl
        ? ang(-N.x * Math.sign(bl.side), -N.z * Math.sign(bl.side))
        : ang(quad.x - bp.x, quad.z - bp.z);
      putKit(ctx, isl, 'bellPost', bp, face, rad('bellPost'), S.bell.variant, padOk(bp));
      anchors.set('bellPost', { p: bp, rotY: face });
    }

    const office = ctx.fixtures.find((f) => f.islandId === isl.id && f.defId === 'ferryOffice');
    if (office) anchors.set('ferryOffice', { p: office, rotY: office.rotY });
  }

  // quad: coffee cart (serving side to the centre) inside, notice board on the rim
  const cart =
    onQuad(S.cart.rings, S.cart.angles, rad('coffeeCart'), true) ??
    onQuad(S.cart.outer, S.cart.angles, rad('coffeeCart'), false);
  if (cart) {
    putKit(ctx, isl, 'coffeeCart', cart.p, cart.rotY, rad('coffeeCart'), S.cart.variant);
    anchors.set('coffeeCart', cart);
  }
  const notice = onQuad(S.notice.rings, S.notice.angles, rad('guildNoticeBoard'), false);
  if (notice) {
    const v = S.notice.variant;
    putKit(
      ctx,
      isl,
      'guildNoticeBoard',
      notice.p,
      notice.rotY,
      rad('guildNoticeBoard'),
      v,
      padOk(notice.p),
    );
  }

  placePennants(ctx, isl, quad, apron, rng.fork('kit', 4));

  const stories: StorySpot[] = [];
  for (const st of HQ_CULTURE.storySpots) {
    const a = anchors.get(st.defs[0]);
    if (!a) continue;
    // y is set on the final ground by buildSettlements
    const pos = { x: a.p.x, y: 0, z: a.p.z };
    stories.push({ kind: st.kind, islandId: isl.id, pos, rotY: a.rotY, defs: st.defs });
  }
  return stories;
}

/**
 * Pennant lines across the lanes (cord along local x between poles at ±half): lane 0 (to the
 * pier) every `spacing` u past the quad edge, then the first free gate of the other lanes. The
 * first line flies HQ's swallowtails, the rest other cultures without repeats.
 */
function placePennants(
  ctx: SiteCtx,
  isl: IslandData,
  quad: XZ,
  pierRoot: XZ | null,
  rng: Rng,
): void {
  const S = HQ_CULTURE_SITE;
  const P = S.pennants;
  const R = HQ_PLAN.quad.radius;
  const count = rng.int(P.count[0], P.count[1]);
  const others = rng.shuffle(THEME_IDS.map((_, i) => i).filter((i) => THEME_IDS[i] !== P.first));
  const variants = [THEME_IDS.indexOf(P.first), ...others];
  const banners = ctx.fixtures.filter((f) => f.islandId === isl.id && f.defId === 'banner');
  let placed = 0;
  const lines: XZ[] = [];
  const pole = (q: XZ): boolean =>
    onIsland(ctx, isl, q.x, q.z) &&
    heightAt(ctx.h, q.x, q.z) >= S.minY &&
    freeOfShapes(ctx, isl, discShape(q.x, q.z, P.poleR), 0.2) &&
    offLanes(ctx, isl, q, P.poleR);
  const tryAt = (lane: readonly XZ[], k: number): boolean => {
    const p = lane[k];
    const t = unit(lane[k - 1], lane[k + 1]);
    const nrm = { x: -t.z, z: t.x };
    const a = add(p, nrm, P.half);
    const b = add(p, nrm, -P.half);
    if (!pole(a) || !pole(b)) return false;
    if (banners.some((f) => dist(f, p) < P.bannerClear)) return false;
    if (lines.some((q) => dist(q, p) < P.spacing)) return false;
    if (pierRoot && dist(p, pierRoot) < S.apron + P.half) return false;
    ctx.fixtures.push({
      defId: 'pennantLine',
      x: p.x,
      z: p.z,
      rotY: ang(t.x, t.z),
      islandId: isl.id,
      variant: variants[placed++ % variants.length],
    });
    addShape(ctx, isl, discShape(a.x, a.z, P.poleR), true);
    addShape(ctx, isl, discShape(b.x, b.z, P.poleR), true);
    // the span under the cord: walkable, but no later lamp or tree grows into the pennants
    addShape(ctx, isl, rectShape(p.x, p.z, ang(t.x, t.z), 2 * P.half, P.cordDepth), false);
    lines.push(p);
    return true;
  };
  ctx.lanes[isl.id].forEach((lane, li) => {
    let next = 0;
    for (let k = 1; k + 1 < lane.length && placed < count; k++) {
      if (k < next || dist(lane[k], quad) < R + P.start) continue;
      if (!tryAt(lane, k)) continue;
      if (li > 0) break;
      next = k + P.spacing;
    }
  });
}
