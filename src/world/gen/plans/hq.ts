/**
 * HQ island plan: the Seven Gates Crossroads on the Hearthholm crescent (M20 TASK-466, D-057 /
 * D-058 / D-060; zones `mar-plans/study/hq-design.md` §1.2).
 *
 * - Z1 Compass Plaza: a round paved disc by the harbour (district kind 'compass', the TASK-468
 *   mosaic's hook), the Orchestrator Tower on its inland side, two coffee kiosks by the harbour
 *   lane, the coffee cart and the notice board.
 * - Z2 Seven Streets: one per island, aimed at that island's real centre (`ctx.islands`); HQ's
 *   own is the harbour lane to the ferry pier. Each ends in that culture's `cultureGate`; a
 *   heading whose land runs out within HQ_PLAN.streets.shoreGateRun of the rim is a shore street
 *   (gate on the beach + a mooring post). Along each: the culture's goods stalls, crates in its
 *   colour, a pennant line of its cut, lots from the theme mix, avenue trees, and the ground is
 *   painted in the culture's street zone (`streetZone(k)`, a tinted paving).
 * - Z3 Quay: plaza paving round the pier root; the Harbour Guild pier kit (awning, timetable,
 *   signpost, bell, crane, crates, perches), the ferry office in the shallows.
 * - Z5 Post Yard on the hill shoulder: the mail line's high pylon, parcels stall, sacks, crates;
 *   the low pylon stands by the pier root (render/mail-lines.ts strings the cable).
 * - Z6 Guild Terrace: a levelled disc above the plaza with the Guild Hall (hqAnnex v2), beds and
 *   benches, linked down by a stair.
 * - Z7 Summit: the semaphore tower on the peak, benches looking out.
 * - Z8 Ridge: lookouts on the plateau behind the likely waterfall lips (bench, lantern, fence).
 * - Z9 Bay beach: tide pools (message bottles / driftwood come from the theme scatter).
 *
 * Layout numbers: content HQ_PLAN; kit numbers: content HQ_CULTURE_SITE. Every random decision
 * draws from a labelled fork of `rng`.
 */
import {
  FIXTURE_RADIUS,
  FLATTEN,
  LOT_FOOTPRINT,
  PATHS,
  VILLAGE,
} from '../../../content/settlements.ts';
import { HQ_PLAN } from '../../../content/themes/hq.ts';
import { THEMES } from '../../../content/themes/index.ts';
import { HQ_CULTURE, HQ_CULTURE_SITE } from '../../../content/cultures/hq.ts';
import { CULTURE_GATE } from '../../../content/props-themes/m20.ts';
import { mailAnchorWorld, mailCablePoint } from '../../../content/props-themes/m20.ts';
import type { Rng } from '../../../core/rng.ts';
import type { IslandData, Polyline, StorySpot, XZ } from '../../types.ts';
import { heightAt, streetZone, THEME_IDS, Zone } from '../../types.ts';
import { cellX, cellZ, gridRange } from '../grid.ts';
import { addCellPath, forSamplesNearSegment, gridAStar, pathStep, resample } from '../paths.ts';
import {
  add,
  addPad,
  addShape,
  ang,
  bestSample,
  cellOf,
  cellPos,
  clear,
  crownLot,
  dirOf,
  discShape,
  dist,
  dockWithLink,
  doorOf,
  findDock,
  islandWindow,
  linkLot,
  localWindow,
  mixPicker,
  nearestPathCell,
  newPlan,
  onIsland,
  onLand,
  placeTidePools,
  pushFixture,
  pushLandmark,
  rectShape,
  relief,
  sdfAt,
  seedHub,
  segDist,
  shapeDist,
  shapesOverlap,
  siteFree,
  slotDefs,
  stepCtx,
  tryLot,
  unit,
  type Shape,
  type SiteCtx,
  type SitePlan,
} from '../sites.ts';
import type { ThemePlanner } from './types.ts';

const DEG = Math.PI / 180;
const GREEN: readonly number[] = [Zone.grass, Zone.meadow, Zone.forest, Zone.field];
const HQ_K = THEME_IDS.indexOf('hq');

/** Obstacles only (lanes ignored, the plaza disc ignored): small decor beside paths. */
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

/** Every grid cell within `r` of `p` is this island's land above the water. */
function landCells(ctx: SiteCtx, isl: IslandData, p: XZ, r: number): boolean {
  const [x0, x1] = gridRange(p.x - r, p.x + r);
  const [z0, z1] = gridRange(p.z - r, p.z + r);
  for (let iz = z0; iz <= z1; iz++)
    for (let ix = x0; ix <= x1; ix++) {
      if (Math.hypot(cellX(ix) - p.x, cellZ(iz) - p.z) > r) continue;
      const i = iz * ctx.n + ix;
      if (ctx.islandMap[i] !== isl.id + 1 || ctx.sdf[i] <= 0 || ctx.h.data[i] <= 0) return false;
    }
  return true;
}

/** Blocking disc of a culture def (FIXTURE_RADIUS, also the life solid). */
const rad = (def: string): number => FIXTURE_RADIUS[def] ?? 0.5;

/** Local frame: origin, `d` = along, `n` = side. */
interface Frame {
  o: XZ;
  d: XZ;
  n: XZ;
}
const at = (f: Frame, along: number, side: number): XZ => add(add(f.o, f.d, along), f.n, side);
/** Fixture local +x (the yaw convention of settlement-props): side axis of a prop facing `rotY`. */
const sideAxis = (rotY: number): XZ => ({ x: Math.sin(rotY), z: -Math.cos(rotY) });

/** One of the seven streets. */
interface Street {
  /** THEME_IDS index of the culture (0 = HQ, the harbour lane). */
  k: number;
  lane: XZ[];
  /** Shore street: the gate stands on the beach (D-058). */
  shore: boolean;
  /** The culture's island lies past the pier: its gate stands on the harbour lane's rim exit. */
  shared?: boolean;
  gate: { p: XZ; rotY: number } | null;
}

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

/** Ground tests shared by the kit placements (HQ_CULTURE_SITE numbers). */
interface Kit {
  ground(p: XZ, r: number, y: readonly [number, number], maxRelief: number): boolean;
  free(p: XZ, r: number, gap?: number): boolean;
  /** Plaza furniture: off the obstacles, only just off the lane centrelines (the plaza is one paved disc). */
  freeIn(p: XZ, r: number): boolean;
  padOk(p: XZ): boolean;
  /** Dry land for a prop of radius `r`; a padded prop (levelled under it) tolerates more slope. */
  land(p: XZ, r: number, pad?: boolean): boolean;
  /** Waterline ground (perches, crane, mooring posts). */
  quay(p: XZ, r: number, pad?: boolean): boolean;
  /** First (along, side) candidate of the frame accepted by `ok` (sides outer, along inner). */
  first(
    f: Frame,
    along: readonly number[],
    side: readonly number[],
    ok: (p: XZ) => boolean,
  ): { p: XZ; along: number; side: number } | null;
  /** Beside the lane nearest `from`: `steps` u along it away from `from`, `side` u off it. */
  beside(
    from: XZ,
    steps: readonly number[],
    side: readonly number[],
    r: number,
    pad?: boolean,
  ): XZ | null;
}

function kitHelpers(ctx: SiteCtx, isl: IslandData, apron: XZ | null): Kit {
  const S = HQ_CULTURE_SITE;
  const ground: Kit['ground'] = (p, r, y, maxRelief) => {
    if (!onIsland(ctx, isl, p.x, p.z)) return false;
    const h = heightAt(ctx.h, p.x, p.z);
    if (h < y[0] || h > y[1]) return false;
    for (let k = 0; k < 6; k++) {
      const q = add(p, dirOf((k * Math.PI) / 3), r);
      if (heightAt(ctx.h, q.x, q.z) < y[0] - 0.1) return false;
    }
    return relief(ctx, discShape(p.x, p.z, r)) <= maxRelief;
  };
  const free: Kit['free'] = (p, r, gap = 0.3) =>
    freeOfShapes(ctx, isl, discShape(p.x, p.z, r), gap) &&
    offLanes(ctx, isl, p, r) &&
    (!apron || dist(p, apron) >= S.apron + r);
  const freeIn: Kit['freeIn'] = (p, r) =>
    freeOfShapes(ctx, isl, discShape(p.x, p.z, r), 0.3) &&
    ctx.lanes[isl.id].every((lane) => lane.every((q) => dist(p, q) >= r + S.plazaLaneGap)) &&
    (!apron || dist(p, apron) >= S.apron + r);
  /**
   * A levelled prop's pad core must not overlap a foreign pad core (plaza, lot, landmark): the
   * blend would tilt both plateaus. Otherwise the prop goes unpadded (and needs gentler ground).
   */
  const padFree = (p: XZ): boolean =>
    ctx.pads.every(
      (q) =>
        q.islandId !== isl.id ||
        q.group === S.padGroup ||
        shapeDist(q.shape, p.x, p.z) >= q.margin + S.padCore,
    );
  const padOk: Kit['padOk'] = (p) => padFree(p) && sdfAt(ctx, p.x, p.z) >= S.padCore;
  const maxRelief = (p: XZ, r: number, pad: boolean): number =>
    pad && padOk(p) ? S.padRelief : pad || r >= 1 ? S.wideRelief : S.relief;
  const land: Kit['land'] = (p, r, pad = false) =>
    ground(p, r, [S.minY, Infinity], maxRelief(p, r, pad)) &&
    sdfAt(ctx, p.x, p.z) >= r &&
    free(p, r);
  const quay: Kit['quay'] = (p, r, pad = false) =>
    ground(p, r * 0.5, S.quayY, maxRelief(p, r, pad)) &&
    sdfAt(ctx, p.x, p.z) <= S.quayShore &&
    free(p, r);
  const first: Kit['first'] = (f, along, side, ok) => {
    for (const s of side)
      for (const a of along) {
        const p = at(f, a, s);
        if (ok(p)) return { p, along: a, side: s };
      }
    return null;
  };
  const beside: Kit['beside'] = (from, steps, side, r, pad = false) => {
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
  return { ground, free, freeIn, padOk, land, quay, first, beside };
}

export const planHq: ThemePlanner = ({ ctx, isl, rng, sIdx }) => {
  const harbour = isl.anchors.harbour;
  if (!harbour) return null;
  const P = HQ_PLAN;
  const R = P.plaza.radius;

  // ---- Z1 Compass Plaza: the flattest disc near the harbour
  const plazaShape = (p: XZ): Shape => discShape(p.x, p.z, R);
  let plaza: XZ | null = null;
  for (const maxY of [P.plaza.maxY, Infinity])
    for (
      let s = P.plaza.search;
      s <= P.plaza.search + 5 * VILLAGE.searchGrow && !plaza;
      s += VILLAGE.searchGrow
    )
      plaza = bestSample(ctx, isl, harbour, s, (p, i) => {
        if (ctx.sdf[i] < Math.max(P.plaza.minShore, R + 1) || ctx.h.data[i] > maxY) return Infinity;
        const high = Math.max(0, ctx.h.data[i] - P.plaza.lowY) * P.plaza.highCost;
        const cramped = Math.max(0, P.plaza.roomShore - ctx.sdf[i]) * P.plaza.roomCost;
        return relief(ctx, plazaShape(p)) + high + cramped + 0.02 * dist(p, harbour);
      });
  if (!plaza) return null;
  const plan = newPlan('village', plaza);
  plan.plaza = { x: plaza.x, z: plaza.z, r: R };
  addShape(ctx, isl, { ...discShape(plaza.x, plaza.z, R + 0.5), tag: 'plaza' }, false);
  addPad(ctx, isl, plazaShape(plaza), FLATTEN.discMargin);

  // ---- Ferry Terminal: pier into the bay, a short walk from the plaza
  const dockSite = findDock(ctx, isl, {
    near: harbour,
    maxDist: 50,
    prefer: plaza,
    toward: harbour,
    carve: true,
    edge: true,
  });
  const boatsRng = rng.fork('moorings');
  dockWithLink(ctx, isl, plan, dockSite, boatsRng, {
    rowboats: boatsRng.int(P.moorings.rowboats[0], P.moorings.rowboats[1]),
    sailboats: boatsRng.int(P.moorings.sailboats[0], P.moorings.sailboats[1]),
  });
  // the ferry office in the shallows beside the pier root, before the shore kit takes the room
  if (dockSite) placeFerryOffice(ctx, isl, dockSite.root, dockSite.dir);
  const toSea = dockSite ? unit(plaza, dockSite.root) : unit(plaza, harbour);
  const a0 = ang(toSea.x, toSea.z);
  plan.districts.push({
    islandId: isl.id,
    kind: 'compass',
    x: plaza.x,
    z: plaza.z,
    rotY: a0,
    w: 2 * R,
    d: 2 * R,
  });

  // ---- Orchestrator Tower: the plaza's inland side, facing the harbour (slides along the edge
  // when that spot is off the land); any side as the last resort
  let towerAt: XZ | null = null;
  const tryTower = (a: number, r: number): boolean => {
    const p = add(plaza, dirOf(a), r);
    if (!onLand(ctx, isl, discShape(p.x, p.z, 2), 3)) return false;
    plan.landmarks.push(pushLandmark(ctx, isl, 'clocktower', p, a0));
    towerAt = p;
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
  for (const [a, r] of tries) if (tryTower(a, r)) break;

  // ---- Z2 Seven Streets from the plaza hub
  const hubCell = seedHub(ctx, isl, plan, plaza);
  if (hubCell < 0) return null;
  const streets = layStreets(ctx, isl, plaza, hubCell, dockSite, rng.fork('streets'));

  // ---- coffee kiosks on the plaza edge, flanking the harbour lane, facing the centre, off the
  // street rays (a kiosk in a ray would block that street at the rim)
  const kiosks: number[] = [];
  const rays = streets.map((st) => {
    const q = st.lane[Math.min(st.lane.length - 1, Math.round(R))];
    return ang(q.x - plaza.x, q.z - plaza.z);
  });
  for (const d of P.kiosks.angles) {
    if (kiosks.length >= P.kiosks.count) break;
    const a = a0 + d * DEG;
    if (
      rays.some(
        (r) => Math.abs(Math.atan2(Math.sin(a - r), Math.cos(a - r))) < P.kiosks.rayGap * DEG,
      )
    )
      continue;
    const li = tryLot(
      ctx,
      isl,
      'coffeeKiosk',
      add(plaza, dirOf(a), R - P.kiosks.inset),
      a + Math.PI,
      sIdx,
      { minShore: 2, maxRelief: 3, inPlaza: true },
    );
    if (li >= 0) kiosks.push(li);
  }

  // ---- Z6 Guild Terrace first (the best flat ground), then the street lots; the crown lot on
  // a street when no terrace fits
  const terrace = placeTerrace(ctx, isl, plan, plaza, sIdx);
  // Z5 post yard + mail line before the street lots: its cable corridor is kept free of roofs
  const kit = kitHelpers(ctx, isl, dockSite?.root ?? null);
  placeYard(ctx, isl, plan, plaza, towerAt, dockSite, kit, rng.fork('yard'));
  const lots = streetLots(ctx, isl, plaza, streets, sIdx, rng.fork('lots'));
  if (terrace < 0) {
    crownLot(ctx, isl, lots);
    for (const li of lots)
      if (ctx.lots[li].defId === 'hqAnnex') ctx.lots[li].pin = HQ_CULTURE_SITE.guildHallVariant;
  }

  // ---- Z7 summit semaphore, the pier kit, Z8 ridge lookouts
  const summit = placeSummit(ctx, isl, plan, plaza, rng.fork('summit'));
  plan.stories = placeCulture(ctx, isl, plaza, a0, dockSite, kit, rng.fork('culture'));
  placeRidge(ctx, isl, plan, plaza, summit, rng.fork('ridge'));

  // ---- links: kiosks, lots nearest first, the terrace by its stair
  for (const li of kiosks) linkLot(ctx, plan, li);
  lots.sort((a, b) => dist(ctx.lots[a], plaza) - dist(ctx.lots[b], plaza));
  for (const li of lots) linkLot(ctx, plan, li);
  if (terrace >= 0) {
    const lot = ctx.lots[terrace];
    plan.lots.push(terrace);
    const door = doorOf(lot);
    plan.links.push({
      pin: door,
      kind: 'stair',
      corridor: { a: door, b: plaza, half: PATHS.stairCorridor },
      done: (key) => {
        lot.key = key ?? -1;
      },
    });
  }

  if (dockSite) paintQuay(ctx, isl, dockSite.root, dockSite.dir);
  placeStreetKit(ctx, isl, plaza, streets, kit, rng.fork('stalls'));
  paintLawn(ctx, isl, plaza);
  placeAvenue(ctx, isl, plaza);
  placeTidePools(ctx, isl, rng.fork('tidepools'));
  paintStreets(ctx, isl, streets);
  return plan;
};

// ---------------------------------------------------------------------------
// Z2 streets.

/**
 * One street per island, headed at its real centre: an A* lane from the plaza hub to the rim in
 * that heading (inside the plaza), then on through a corridor round the ideal line (other
 * streets' cells cost extra, so the rays stay separate), to the gate and a little past it. The
 * harbour lane (HQ's street) runs to the pier root. Gates stand on level ground on the lane.
 */
function layStreets(
  ctx: SiteCtx,
  isl: IslandData,
  plaza: XZ,
  hubCell: number,
  dockSite: { root: XZ; dir: XZ } | null,
  rng: Rng,
): Street[] {
  const S = HQ_PLAN.streets;
  const R = HQ_PLAN.plaza.radius;
  const streets: Street[] = [];
  const base = pathStep({ ...stepCtx(ctx, isl), stair: false });
  /** Lane cells hub → `goal` through a window; `corr` keeps the search near a→b. */
  const search = (
    start: number,
    goal: number,
    win: ReturnType<typeof islandWindow>,
    corr: { a: XZ; b: XZ; wide?: boolean } | null,
  ): number[] | null =>
    gridAStar({
      ...win,
      start,
      goal,
      step: corr
        ? (a, b, d) => {
            const p = cellPos(ctx, b);
            if (segDist(p, corr.a, corr.b) > S.corridor * (corr.wide ? S.wideCorridor : 1))
              return Infinity;
            const c = base(a, b, d);
            // another street's cells: no merging discount, a surcharge instead
            return ctx.net.cells[b] ? (c / PATHS.reuse) * S.crossCost : c;
          }
        : base,
      hScale: 2,
    });
  const lay = (k: number, end: XZ, rim: XZ | null): XZ[] | null => {
    const endCell = nearestPathCell(ctx, isl, end);
    if (endCell < 0 || endCell === hubCell) return null;
    let cells: number[] | null;
    if (rim) {
      const rimCell = nearestPathCell(ctx, isl, rim);
      if (rimCell < 0 || rimCell === hubCell) return null;
      const inner = search(hubCell, rimCell, localWindow(ctx, isl, plaza, R + 3), null);
      if (!inner) return null;
      // along the ray when it can be, else a wider corridor (round an earlier gate's posts)
      const outer =
        rimCell === endCell
          ? []
          : (search(rimCell, endCell, islandWindow(ctx, isl), { a: plaza, b: end }) ??
            search(rimCell, endCell, islandWindow(ctx, isl), { a: plaza, b: end, wide: true }));
      if (!outer) return null;
      cells = [...inner, ...outer.slice(1)];
    } else cells = search(hubCell, endCell, islandWindow(ctx, isl), null);
    if (!cells || cells.length < 3) return null;
    addCellPath(ctx.net, cells, isl.id, 'path');
    const lane = resample(
      cells.map((c) => cellPos(ctx, c)),
      1,
      false,
    );
    ctx.lanes[isl.id].push(lane);
    void k;
    return lane;
  };

  // the harbour lane first (HQ's own street, to the pier root). A culture whose island lies past
  // the pier (heading within `shareDeg` of it) shares that lane: its gate stands on the lane's
  // rim exit, HQ's inland of the pier apron (the pier end when the lane is long enough for both)
  const pierDir = dockSite ? unit(plaza, dockSite.root) : null;
  let harbour: XZ[] | null = null;
  if (dockSite) {
    harbour = lay(HQ_K, dockSite.root, null);
    if (harbour) streets.push({ k: HQ_K, lane: harbour, shore: false, gate: null });
  }
  for (let k = 0; k < THEME_IDS.length; k++) {
    if (k === HQ_K) continue;
    const o = ctx.islands.find((i) => i.theme === THEME_IDS[k]);
    if (!o) continue;
    const d = unit(plaza, { x: o.cx, z: o.cz });
    if (harbour && pierDir && d.x * pierDir.x + d.z * pierDir.z >= Math.cos(S.shareDeg * DEG)) {
      // on its ray only (the lane may bend off it): else the culture gets a street of its own
      const gate = placeGate(ctx, isl, plaza, harbour, R + S.sharedGateOut, k, false, d);
      if (gate) {
        streets.push({ k, lane: harbour, shore: false, shared: true, gate });
        continue;
      }
    }
    // land along the heading past the rim, up to the foot of a hill
    let landEnd = -2;
    for (let t = -1.5; t <= S.maxRun + S.beyond + 1; t += 0.5) {
      const p = add(plaza, d, R + t);
      const y = heightAt(ctx.h, p.x, p.z);
      if (!onIsland(ctx, isl, p.x, p.z) || sdfAt(ctx, p.x, p.z) < S.endMinShore) break;
      if (y < S.gateMinY) break;
      const q = add(plaza, d, R + t - 2);
      if (t > 0 && (y - heightAt(ctx.h, q.x, q.z)) / 2 > S.steep) break;
      landEnd = t;
    }
    if (landEnd < S.minRun) continue;
    const shore = landEnd <= S.shoreGateRun;
    const gateT = shore
      ? Math.max(S.minRun, landEnd - 1)
      : Math.min(S.maxRun, landEnd - S.gateInset);
    const endT = Math.max(gateT + 0.5, Math.min(landEnd, gateT + S.beyond));
    const lane = lay(k, add(plaza, d, R + endT), add(plaza, d, R - 1.5));
    if (!lane) continue;
    streets.push({
      k,
      lane,
      shore,
      gate: placeGate(ctx, isl, plaza, lane, R + gateT, k, shore, d),
    });
  }
  const hl = streets.find((st) => st.k === HQ_K);
  if (hl && dockSite) {
    const back = HQ_CULTURE_SITE.apron + HQ_CULTURE_SITE.streets.harbourGateBack;
    const total = hl.lane.length - 1;
    hl.gate = placeGate(
      ctx,
      isl,
      plaza,
      hl.lane,
      Math.max(R + S.sharedGateOut + S.hqGateGap, total - back),
      HQ_K,
      false,
      null,
    );
  }
  void rng;
  return streets;
}

/**
 * The culture gate on a lane at about `targetDist` u from the plaza centre, its passage along
 * the lane and its front toward the plaza, on level ground (slides back up the street until the
 * relief and both posts' ground pass), on a small pad. Shore gates get the mooring post.
 */
function placeGate(
  ctx: SiteCtx,
  isl: IslandData,
  plaza: XZ,
  lane: readonly XZ[],
  targetDist: number,
  k: number,
  shore: boolean,
  /** The ideal ray from the plaza (unit); the gate must stand within `rayTol` of it (null = any). */
  ray: XZ | null,
): { p: XZ; rotY: number } | null {
  const S = HQ_PLAN.streets;
  let k0 = 1;
  for (let i = 1; i + 1 < lane.length; i++)
    if (Math.abs(dist(lane[i], plaza) - targetDist) < Math.abs(dist(lane[k0], plaza) - targetDist))
      k0 = i;
  const px = CULTURE_GATE.postX;
  const R = HQ_PLAN.plaza.radius;
  for (let i = k0; i >= 1 && dist(lane[k0], lane[i]) <= S.gateSlide; i--) {
    if (i + 1 >= lane.length) continue;
    const p = lane[i];
    // never back into the plaza; on its rim the plaza pad levels the gate (no relief test)
    const dp = dist(p, plaza);
    // sea gates (and HQ's own on a short harbour lane) may stand on the plaza paving inside the rim
    if (dp < R + S.minRun) break;
    // a gate that the lane carried off its ray (round the tower) is no compass ray: skip it
    if (ray) {
      const off = Math.acos(
        Math.max(-1, Math.min(1, ((p.x - plaza.x) * ray.x + (p.z - plaza.z) * ray.z) / dp)),
      );
      if (off > S.rayDeg * DEG) continue;
    }
    const onRim = dp <= R + 0.5;
    // a rim gate's feet must stand on the plaza pad's land cells (water cells stay unlevelled)
    if (onRim && !landCells(ctx, isl, p, px + 1.2)) continue;
    const t = unit(lane[i - 1], lane[i + 1]);
    const rotY = ang(-t.x, -t.z);
    const ax = sideAxis(rotY);
    const posts = [add(p, ax, px), add(p, ax, -px)];
    if (posts.some((q) => !onIsland(ctx, isl, q.x, q.z) || heightAt(ctx.h, q.x, q.z) < S.gateMinY))
      continue;
    // a padded gate (every core cell on land; the pad relaxes to any neighbouring plateau, so
    // the street keeps one level through it) takes the disc relief cap; a gate by the water
    // stays unpadded and may stand on a street that slopes along its length, but its two feet
    // must be level across it
    const padded = !onRim && landCells(ctx, isl, p, S.gatePad + 0.6);
    const feet = Math.abs(
      heightAt(ctx.h, posts[0].x, posts[0].z) - heightAt(ctx.h, posts[1].x, posts[1].z),
    );
    if (
      padded &&
      relief(ctx, discShape(p.x, p.z, px + 0.3)) > (shore ? S.shoreGateRelief : S.gateRelief)
    )
      continue;
    if (
      !onRim &&
      !padded &&
      (feet > S.unpaddedFeet ||
        !landCells(ctx, isl, p, px + 1.2) ||
        relief(ctx, discShape(p.x, p.z, px + 0.3)) > S.gateRelief)
    )
      continue;
    if (posts.some((q) => !freeOfShapes(ctx, isl, discShape(q.x, q.z, CULTURE_GATE.postR), 0.2)))
      continue;
    // gates keep apart; HQ's own may follow a shared culture gate down the harbour lane
    const gap = k === HQ_K ? S.hqGateGap : S.gateGap;
    if (
      ctx.fixtures.some(
        (f) => f.islandId === isl.id && f.defId === 'cultureGate' && dist(f, p) < gap,
      )
    )
      continue;
    ctx.fixtures.push({ defId: 'cultureGate', x: p.x, z: p.z, rotY, islandId: isl.id, variant: k });
    for (const q of posts) addShape(ctx, isl, discShape(q.x, q.z, CULTURE_GATE.postR), true);
    if (padded) addPad(ctx, isl, discShape(p.x, p.z, S.gatePad), 0.5);
    // D-058: a gate by the water (shore street, or any gate this close to it) gets a mooring post
    if (shore || (k !== HQ_K && sdfAt(ctx, p.x, p.z) <= HQ_PLAN.shoreGate.nearShore))
      placeMooring(ctx, isl, p, t, rotY);
    return { p, rotY };
  }
  return null;
}

/** Shore gate mooring post (D-058): the first waterline spot past the gate, facing the gate. */
function placeMooring(ctx: SiteCtx, isl: IslandData, gate: XZ, t: XZ, rotY: number): void {
  const G = HQ_PLAN.shoreGate;
  const S = HQ_CULTURE_SITE;
  const ax = sideAxis(rotY);
  const r = rad(G.def);
  for (const reach of G.reach)
    for (const side of G.side) {
      const q = add(add(gate, t, reach), ax, side);
      if (!onIsland(ctx, isl, q.x, q.z)) continue;
      const y = heightAt(ctx.h, q.x, q.z);
      if (y < S.quayY[0] || y > S.quayY[1] || sdfAt(ctx, q.x, q.z) > S.quayShore) continue;
      if (!freeOfShapes(ctx, isl, discShape(q.x, q.z, r), 0.3) || !offLanes(ctx, isl, q, r))
        continue;
      // the pier perches' variant: one instanced group for every post on the island
      ctx.fixtures.push({
        defId: G.def,
        x: q.x,
        z: q.z,
        rotY: ang(-t.x, -t.z),
        islandId: isl.id,
        variant: S.perches.variant,
      });
      addShape(ctx, isl, discShape(q.x, q.z, r), true);
      return;
    }
}

/** Theme-mix lots along the full streets, both sides, slots interleaved across the streets. */
function streetLots(
  ctx: SiteCtx,
  isl: IslandData,
  plaza: XZ,
  streets: readonly Street[],
  sIdx: number,
  rng: Rng,
): number[] {
  const L = HQ_PLAN.streets.lots;
  const R = HQ_PLAN.plaza.radius;
  const mix = THEMES[isl.theme].lotMix;
  const crown = THEMES[isl.theme].crown;
  const pick = mixPicker(mix, rng);
  const goal = rng.int(L.target[0], L.target[1]);
  const lots: number[] = [];
  // slots: (street, lane index) every L.every u from `from` past the rim to `back` before the end
  const slots: { s: Street; k: number }[] = [];
  for (const s of streets) {
    if (s.shore || s.shared) continue;
    const total = s.lane.length - 1;
    for (let d = R + L.from; d < total - L.back; d += L.every) slots.push({ s, k: Math.floor(d) });
  }
  slots.sort((a, b) => a.k - b.k || a.s.k - b.s.k);
  for (const { s, k } of slots) {
    if (lots.length >= goal) break;
    const p = s.lane[k];
    const t = unit(p, s.lane[k + 1]);
    const nrm = { x: -t.z, z: t.x };
    const drawn = [pick(), pick()];
    for (let si = 0; si < 2; si++) {
      if (lots.length >= goal) break;
      const side = si === 0 ? 1 : -1;
      const rotY = ang(-nrm.x * side, -nrm.z * side);
      for (const def of slotDefs(drawn[si], mix, crown)) {
        const [w, d] = LOT_FOOTPRINT[def];
        const c = add(p, nrm, side * (VILLAGE.laneClear + d / 2));
        const li = tryLot(ctx, isl, def, c, rotY, sIdx, {
          minShore: L.minShore,
          maxRelief: L.maxRelief,
        });
        if (li >= 0) {
          lots.push(li);
          void w;
          break;
        }
      }
    }
  }
  // too few street slots (short / shore streets): lots fronting the plaza between the rays
  for (const gap of L.ringGap)
    for (let a = 0; a < 360 && lots.length < L.target[0]; a += L.ringStep) {
      const dir = dirOf(a * DEG);
      const rotY = ang(-dir.x, -dir.z);
      for (const def of slotDefs(pick(), mix, crown)) {
        const d = LOT_FOOTPRINT[def][1];
        const c = add(plaza, dir, R + 0.5 + gap + d / 2);
        const li = tryLot(ctx, isl, def, c, rotY, sIdx, {
          minShore: L.ringMinShore,
          maxRelief: L.maxRelief,
        });
        if (li >= 0) {
          lots.push(li);
          break;
        }
      }
    }
  return lots;
}

/** Paint every street's band in its culture's street zone (writePaths keeps it under the path). */
function paintStreets(ctx: SiteCtx, isl: IslandData, streets: readonly Street[]): void {
  const half = HQ_PLAN.streets.paintHalf;
  for (const s of streets) {
    if (s.shared) continue;
    const z = streetZone(s.k);
    for (let i = 0; i + 1 < s.lane.length; i++)
      forSamplesNearSegment(ctx.h, s.lane[i], s.lane[i + 1], half, (j) => {
        if (ctx.islandMap[j] !== isl.id + 1 || ctx.sdf[j] <= 0 || ctx.h.data[j] <= 0) return;
        if (ctx.zone[j] !== Zone.plaza) ctx.zone[j] = z;
      });
  }
}

/**
 * Street kit (hq-design H4): each street's goods stalls in its culture's variant with a crate or
 * two behind them, and a pennant line of its cut across the street near the plaza.
 */
function placeStreetKit(
  ctx: SiteCtx,
  isl: IslandData,
  plaza: XZ,
  streets: readonly Street[],
  kit: Kit,
  rng: Rng,
): void {
  const S = HQ_CULTURE_SITE.streets;
  const R = HQ_PLAN.plaza.radius;
  const stallR = rad('goodsStall');
  const crateR = rad('cargoCrate');
  const atDist = (lane: readonly XZ[], d: number): number => {
    let best = 1;
    for (let i = 1; i + 1 < lane.length; i++)
      if (Math.abs(dist(lane[i], plaza) - d) < Math.abs(dist(lane[best], plaza) - d)) best = i;
    return best;
  };
  const pole = (q: XZ): boolean =>
    onIsland(ctx, isl, q.x, q.z) &&
    heightAt(ctx.h, q.x, q.z) >= HQ_CULTURE_SITE.minY &&
    freeOfShapes(ctx, isl, discShape(q.x, q.z, S.pennant.poleR), 0.2) &&
    offLanes(ctx, isl, q, S.pennant.poleR);
  for (const s of streets) {
    const r = rng.fork('street', s.k);
    const gateD = s.gate ? dist(s.gate.p, plaza) : Infinity;
    // pennant line across the street past the rim (the harbour lane flies HQ's swallowtails)
    for (const along of s.shared ? [] : S.pennant.along) {
      const pk = atDist(s.lane, R + along);
      if (pk + 1 >= s.lane.length || dist(s.lane[pk], plaza) >= gateD - 2) continue;
      const p = s.lane[pk];
      const t = unit(s.lane[pk - 1], s.lane[pk + 1]);
      const nrm = { x: -t.z, z: t.x };
      const a = add(p, nrm, S.pennant.half);
      const b = add(p, nrm, -S.pennant.half);
      if (pole(a) && pole(b)) {
        const rotY = ang(t.x, t.z);
        ctx.fixtures.push({
          defId: 'pennantLine',
          x: p.x,
          z: p.z,
          rotY,
          islandId: isl.id,
          variant: s.k,
        });
        addShape(ctx, isl, discShape(a.x, a.z, S.pennant.poleR), true);
        addShape(ctx, isl, discShape(b.x, b.z, S.pennant.poleR), true);
        addShape(
          ctx,
          isl,
          rectShape(p.x, p.z, rotY, 2 * S.pennant.half, S.pennant.cordDepth),
          false,
        );
        break;
      }
    }
    // stalls: alternating sides along the street, the culture's goods; crates behind each
    const want =
      s.shore || s.shared ? S.stalls.shoreCount : r.int(S.stalls.count[0], S.stalls.count[1]);
    let placed = 0;
    for (let j = 0; j < S.stalls.along.length && placed < want; j++) {
      const k = atDist(s.lane, R + S.stalls.along[j]);
      if (k + 1 >= s.lane.length || dist(s.lane[k], plaza) > gateD - 2.5) continue;
      const p = s.lane[k];
      const t = unit(s.lane[k - 1], s.lane[k + 1]);
      const nrm = { x: -t.z, z: t.x };
      const sides = j % 2 ? S.stalls.side.map((x) => -x) : S.stalls.side;
      for (const side of sides) {
        const q = add(p, nrm, side);
        // levelled on its pad where one fits; next to the plaza pad the deck takes the ground
        const ok = kit.padOk(q)
          ? kit.land(q, stallR, true)
          : kit.ground(q, stallR, [HQ_CULTURE_SITE.minY, Infinity], S.stalls.relief) &&
            sdfAt(ctx, q.x, q.z) >= stallR &&
            kit.free(q, stallR);
        if (!ok) continue;
        const rotY = ang(-nrm.x * Math.sign(side), -nrm.z * Math.sign(side));
        putKit(ctx, isl, 'goodsStall', q, rotY, stallR, s.k, kit.padOk(q));
        placed++;
        const nc = r.int(S.stalls.crates[0], S.stalls.crates[1]);
        for (let c = 0; c < nc; c++) {
          const cq = add(
            add(q, nrm, Math.sign(side) * S.stalls.crateBack),
            t,
            S.stalls.crateAlong[c],
          );
          if (!kit.land(cq, crateR)) continue;
          putKit(ctx, isl, 'cargoCrate', cq, rotY + r.range(-0.3, 0.3), crateR, s.k);
        }
        break;
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Z6 terrace, Z5 yard, Z7 summit, Z8 ridge.

/**
 * Candidate centres in a ring (every HQ_PLAN.ringStride-th cell: the discs are several u wide),
 * scored; the first that passes `ok` wins (null = none).
 */
function ringSearch(
  ctx: SiteCtx,
  isl: IslandData,
  c: XZ,
  inner: number,
  outer: number,
  score: (p: XZ, i: number) => number,
  ok: (p: XZ) => boolean = () => true,
): XZ | null {
  const cand: { p: XZ; s: number }[] = [];
  const [x0, x1] = gridRange(c.x - outer, c.x + outer);
  const [z0, z1] = gridRange(c.z - outer, c.z + outer);
  const st = HQ_PLAN.ringStride;
  for (let iz = z0; iz <= z1; iz += st)
    for (let ix = x0; ix <= x1; ix += st) {
      const i = iz * ctx.n + ix;
      if (ctx.islandMap[i] !== isl.id + 1) continue;
      const p = { x: cellX(ix), z: cellZ(iz) };
      const d = dist(p, c);
      if (d < inner || d > outer) continue;
      const s = score(p, i);
      if (Number.isFinite(s)) cand.push({ p, s });
    }
  cand.sort((a, b) => a.s - b.s || a.p.z - b.p.z || a.p.x - b.p.x);
  for (const { p } of cand) if (ok(p)) return p;
  return null;
}

/**
 * Guild Terrace: a levelled disc above the plaza (its own pad level group), the Guild Hall
 * (hqAnnex v2) facing the plaza, a half ring of beds behind it, two benches by the door.
 * Returns the lot index or −1.
 */
function placeTerrace(
  ctx: SiteCtx,
  isl: IslandData,
  plan: SitePlan,
  plaza: XZ,
  sIdx: number,
): number {
  const T = HQ_PLAN.terrace;
  const plazaY = heightAt(ctx.h, plaza.x, plaza.z);
  const lanes = ctx.lanes[isl.id];
  const offStreets = (p: XZ): boolean =>
    lanes.every((lane) => lane.every((q) => dist(p, q) >= T.radius + T.laneClear));
  let c: XZ | null = null;
  let pass = 0;
  for (const maxRelief of T.passes) {
    pass = maxRelief;
    c = ringSearch(ctx, isl, plaza, T.inner, T.outer, (p, i) => {
      const y = ctx.h.data[i];
      if (ctx.sdf[i] < T.minShore) return Infinity;
      const sh = discShape(p.x, p.z, T.radius);
      if (!onLand(ctx, isl, sh, T.minShore)) return Infinity;
      const r = relief(ctx, sh);
      if (r > maxRelief || !clear(ctx, isl, sh, 1.5) || !siteFree(ctx, isl, sh)) return Infinity;
      if (!offStreets(p)) return Infinity;
      // flat, naturally high ground near the plaza first
      return r + (y >= plazaY + T.rise ? 0 : 2) + 0.06 * dist(p, plaza);
    });
    if (c) break;
  }
  if (!c) return -1;
  const f = unit(c, plaza);
  const face = ang(f.x, f.z);
  // earth the floor up to the terrace level where the ground is lower (ramps down round it)
  const floor = plazaY + T.liftTo;
  forSamplesNearSegment(ctx.h, c, c, T.radius + T.liftFalloff, (i, d) => {
    if (ctx.islandMap[i] !== isl.id + 1 || ctx.sdf[i] <= 0) return;
    const w = 1 - Math.min(1, Math.max(0, (d - T.radius) / T.liftFalloff));
    const k = w * w * (3 - 2 * w);
    const target = ctx.h.data[i] + (floor - ctx.h.data[i]) * k;
    if (target > ctx.h.data[i]) ctx.h.data[i] = target;
  });
  addPad(ctx, isl, discShape(c.x, c.z, T.radius), FLATTEN.discMargin, T.padStep, T.padGroup);
  const li = tryLot(ctx, isl, 'hqAnnex', add(c, f, 0.6), face, sIdx, {
    minShore: T.minShore,
    maxRelief: pass + 1,
  });
  if (li < 0) return -1;
  ctx.lots[li].pin = HQ_CULTURE_SITE.guildHallVariant;
  // the lot's own pad joins the terrace level (and keeps it against the street lots below)
  const pad = ctx.pads[ctx.pads.length - 1];
  if (pad.shape.x === ctx.lots[li].x && pad.shape.z === ctx.lots[li].z) {
    pad.group = T.padGroup;
    pad.step = T.padStep;
  }
  for (let k = 0; k < T.beds; k++) {
    const a = face + (110 + (k * 140) / Math.max(1, T.beds - 1)) * DEG;
    const p = add(c, dirOf(a), T.bedRing);
    if (!onIsland(ctx, isl, p.x, p.z) || heightAt(ctx.h, p.x, p.z) < 0.3) continue;
    if (!freeOfShapes(ctx, isl, discShape(p.x, p.z, rad('flowerBed')), 0.2)) continue;
    pushFixture(ctx, isl, 'flowerBed', p, a + Math.PI / 2);
  }
  for (const s of [1, -1].slice(0, T.benches)) {
    const a = face + s * 55 * DEG;
    const p = add(c, dirOf(a), T.bedRing + 0.3);
    if (!onIsland(ctx, isl, p.x, p.z) || heightAt(ctx.h, p.x, p.z) < 0.3) continue;
    if (!freeOfShapes(ctx, isl, discShape(p.x, p.z, rad('bench')), 0.2)) continue;
    pushFixture(ctx, isl, 'bench', p, face);
  }
  plan.districts.push({
    islandId: isl.id,
    kind: 'terrace',
    x: c.x,
    z: c.z,
    rotY: face,
    w: 2 * T.radius,
    d: 2 * T.radius,
  });
  // the open terrace and its pad's falloff stay clear of scatter and of the street lots (a lot
  // on the falloff tilts; non-blocking: the stair reaches the door)
  addShape(ctx, isl, discShape(c.x, c.z, T.radius + FLATTEN.discMargin), false);
  return li;
}

/**
 * Post yard on the hill shoulder with the mail line: the low pylon first (by the lane leaving
 * the pier root), then the first yard candidate whose cable to it clears the ground, the roofs
 * and the clock tower; the parcels stall, sacks, crates and a bench in the yard.
 */
function placeYard(
  ctx: SiteCtx,
  isl: IslandData,
  plan: SitePlan,
  plaza: XZ,
  tower: XZ | null,
  dockSite: { root: XZ; dir: XZ } | null,
  kit: Kit,
  rng: Rng,
): void {
  const Y = HQ_PLAN.yard;
  const M = HQ_CULTURE_SITE.mailLine;
  const r = rad('mailLine');
  // the low pylon (v1) by the pier root
  let low: XZ | null = null;
  if (dockSite) {
    low = kit.beside(dockSite.root, M.low.steps, M.low.side, r, true);
    if (!low) {
      const D = dockSite.dir;
      const pier: Frame = { o: dockSite.root, d: D, n: { x: -D.z, z: D.x } };
      low =
        kit.first(pier, M.low.along, M.low.pierSide, (p) => kit.land(p, r, true))?.p ??
        kit.first(pier, M.low.along, M.low.pierSide, (p) => kit.quay(p, r, true))?.p ??
        null;
    }
  }
  if (!low) return;
  const lowP = low;
  const plazaY = heightAt(ctx.h, plaza.x, plaza.z);
  const lots = ctx.lots.filter((l) => l.islandId === isl.id);
  const lotShapes = lots.map((l) => rectShape(l.x, l.z, l.rotY, l.w, l.d));
  const gates = ctx.fixtures.filter((f) => f.islandId === isl.id && f.defId === 'cultureGate');
  /** Cable from the yard pylon at `hi` to the low pylon: clears the ground, the roofs, the tower. */
  const cableOk = (hi: XZ): boolean => {
    const span = dist(hi, lowP);
    if (span < Y.cable.span[0] || span > Y.cable.span[1]) return false;
    if (tower && segDist(tower, hi, lowP) < Y.cable.towerClear) return false;
    const rotA = ang(lowP.x - hi.x, lowP.z - hi.z);
    const a = mailAnchorWorld(0, { x: hi.x, y: heightAt(ctx.h, hi.x, hi.z), z: hi.z }, rotA);
    const b = mailAnchorWorld(
      1,
      { x: lowP.x, y: heightAt(ctx.h, lowP.x, lowP.z), z: lowP.z },
      rotA + Math.PI,
    );
    const pads = ctx.pads.filter((q) => q.islandId === isl.id);
    for (let k = 1; k < Y.cable.samples; k++) {
      const t = k / Y.cable.samples;
      const c = mailCablePoint(a, b, t);
      let g = heightAt(ctx.h, c.x, c.z);
      // the span: roofs and pad plateaus (applyPads runs after the plans) under full clearance;
      // the ends drop to the anchors on the pylons' own pads, so only the head room counts there
      const end = t < Y.cable.endFrac || t > 1 - Y.cable.endFrac;
      // a plateau settles near its centre's ground: the pad top is estimated from there
      const top = (sh: Shape): number => heightAt(ctx.h, sh.x, sh.z) + Y.cable.padLift;
      if (!end)
        for (const q of pads)
          if (shapeDist(q.shape, c.x, c.z) <= q.margin) g = Math.max(g, top(q.shape));
      if (!end)
        for (const sh of lotShapes)
          if (shapeDist(sh, c.x, c.z) < 0.5) g = Math.max(g, top(sh) + Y.cable.lotHeight);
      if (!end && gates.some((q) => dist(q, c) < Y.cable.gateClear)) g += CULTURE_GATE.height;
      if (c.y < g + (end ? Y.cable.endClearance : Y.cable.clearance)) return false;
    }
    return true;
  };
  const c = ringSearch(
    ctx,
    isl,
    plaza,
    Y.inner,
    Y.outer,
    (p, i) => {
      const y = ctx.h.data[i];
      if (y < plazaY + Y.rise || ctx.sdf[i] < Y.minShore) return Infinity;
      const sh = discShape(p.x, p.z, Y.radius);
      if (!onLand(ctx, isl, sh, Y.minShore)) return Infinity;
      const rel = relief(ctx, sh);
      if (rel > Y.maxRelief || !clear(ctx, isl, sh, 1) || !siteFree(ctx, isl, sh)) return Infinity;
      return rel + 0.05 * dist(p, lowP);
    },
    (p) => cableOk(add(p, unit(p, lowP), HQ_CULTURE_SITE.yard.pylonOut)),
  );
  if (!c) return;
  const along = unit(c, lowP);
  const side = { x: -along.z, z: along.x };
  const yard: Frame = { o: c, d: along, n: side };
  const rotToLow = ang(along.x, along.z);
  addPad(
    ctx,
    isl,
    discShape(c.x, c.z, Y.radius),
    FLATTEN.discMargin,
    HQ_CULTURE_SITE.padStep,
    Y.padGroup,
  );
  const hi = add(c, along, HQ_CULTURE_SITE.yard.pylonOut);
  putKit(ctx, isl, 'mailLine', hi, rotToLow, r, 0);
  putKit(ctx, isl, 'mailLine', lowP, rotToLow + Math.PI, r, 1, kit.padOk(lowP));
  // the span stays clear of the street lots, kit and trees placed after it (paths pass under)
  const mid = add(hi, unit(hi, lowP), dist(hi, lowP) / 2);
  addShape(
    ctx,
    isl,
    { ...rectShape(mid.x, mid.z, rotToLow, Y.cable.corridor, dist(hi, lowP)), tag: 'cable' },
    false,
  );
  // the yard: inside its pad, so only land / free checks
  const YS = HQ_CULTURE_SITE.yard;
  const slot = (p: XZ, rr: number): boolean =>
    onIsland(ctx, isl, p.x, p.z) && sdfAt(ctx, p.x, p.z) >= rr + 1 && kit.free(p, rr);
  for (const a of YS.stall.along) {
    let done = false;
    for (const s of YS.stall.side) {
      const p = at(yard, a, s);
      if (!slot(p, rad('goodsStall'))) continue;
      putKit(
        ctx,
        isl,
        'goodsStall',
        p,
        ang(-side.x * Math.sign(s), -side.z * Math.sign(s)),
        rad('goodsStall'),
        YS.stall.variant,
      );
      done = true;
      break;
    }
    if (done) break;
  }
  const bagRng = rng.fork('bags');
  let bags = bagRng.int(YS.bags.count[0], YS.bags.count[1]);
  for (const [a, s] of YS.bags.slots) {
    if (bags <= 0) break;
    const p = at(yard, a, s);
    if (!slot(p, rad('mailbag'))) continue;
    putKit(ctx, isl, 'mailbag', p, bagRng.range(0, Math.PI * 2), rad('mailbag'), bags % 2);
    bags--;
  }
  const crateRng = rng.fork('crates');
  const colours = crateRng.shuffle(THEME_IDS.map((_, i) => i));
  let crates = crateRng.int(YS.crates.count[0], YS.crates.count[1]);
  for (const [a, s] of YS.crates.slots) {
    if (crates <= 0) break;
    const p = at(yard, a, s);
    if (!slot(p, rad('cargoCrate'))) continue;
    putKit(
      ctx,
      isl,
      'cargoCrate',
      p,
      rotToLow + crateRng.range(-0.3, 0.3),
      rad('cargoCrate'),
      colours[crates % colours.length],
    );
    crates--;
  }
  for (const s of YS.bench.side) {
    const p = at(yard, YS.bench.along, s);
    if (!slot(p, rad('bench'))) continue;
    pushFixture(ctx, isl, 'bench', p, ang(-side.x * Math.sign(s), -side.z * Math.sign(s)));
    break;
  }
  plan.districts.push({
    islandId: isl.id,
    kind: 'yard',
    x: c.x,
    z: c.z,
    rotY: rotToLow,
    w: 2 * Y.radius,
    d: 2 * Y.radius,
  });
  addShape(ctx, isl, discShape(c.x, c.z, Y.radius + FLATTEN.discMargin), false);
  const toPlaza = unit(c, plaza);
  plan.links.push({ pin: add(c, toPlaza, Y.radius + 1), kind: 'path', done: () => undefined });
}

/** Semaphore on the summit pad, benches round it looking out; a path up. Returns the peak. */
function placeSummit(
  ctx: SiteCtx,
  isl: IslandData,
  plan: SitePlan,
  plaza: XZ,
  rng: Rng,
): XZ | null {
  const S = HQ_PLAN.summit;
  const top: XZ = { x: isl.peakX, z: isl.peakZ };
  const fits = (p: XZ): boolean =>
    sdfAt(ctx, p.x, p.z) >= S.minShore &&
    onLand(ctx, isl, discShape(p.x, p.z, S.radius), S.minShore) &&
    clear(ctx, isl, discShape(p.x, p.z, S.radius), 0.5);
  // the peak itself, else the highest spot near it that holds the pad
  const peak = fits(top)
    ? top
    : bestSample(ctx, isl, top, S.search, (p, i) => (fits(p) ? -ctx.h.data[i] : Infinity));
  if (!peak) return null;
  const toPlaza = unit(peak, plaza);
  const face = ang(toPlaza.x, toPlaza.z);
  addPad(
    ctx,
    isl,
    discShape(peak.x, peak.z, S.radius),
    FLATTEN.discMargin,
    HQ_CULTURE_SITE.padStep,
  );
  putKit(
    ctx,
    isl,
    'semaphoreTower',
    peak,
    face,
    rad('semaphoreTower'),
    HQ_CULTURE_SITE.semaphore.variant,
  );
  for (let k = 0; k < S.benches; k++) {
    const a = face + Math.PI + (k - (S.benches - 1) / 2) * 70 * DEG;
    const p = add(peak, dirOf(a), S.benchRing);
    if (
      !onIsland(ctx, isl, p.x, p.z) ||
      !freeOfShapes(ctx, isl, discShape(p.x, p.z, rad('bench')), 0.2)
    )
      continue;
    pushFixture(ctx, isl, 'bench', p, a);
  }
  const lp = add(peak, dirOf(face + 90 * DEG), S.lantern);
  if (onIsland(ctx, isl, lp.x, lp.z)) pushFixture(ctx, isl, 'lanternPost', lp, face);
  addShape(ctx, isl, discShape(peak.x, peak.z, S.radius), false);
  plan.links.push({ pin: add(peak, toPlaza, S.radius + 1), kind: 'path', done: () => undefined });
  void rng;
  return peak;
}

/**
 * Ridge lookouts (hq-design H16 / H17): the best `balconies` waterfall-lip candidates of the bluff
 * rim (the same lip test as world/gen/waterfalls.ts, no jitter), a bench + lantern + fence on
 * the plateau `inland` u behind each (outside WATERFALLS.avoid.fixture of the lip), path-linked.
 */
function placeRidge(
  ctx: SiteCtx,
  isl: IslandData,
  plan: SitePlan,
  plaza: XZ,
  summit: XZ | null,
  rng: Rng,
): void {
  const G = HQ_PLAN.ridge;
  const { h, n, sdf, zone, islandMap } = ctx;
  const id = isl.id + 1;
  const cands: { p: XZ; d: XZ; score: number }[] = [];
  const [i0, i1] = gridRange(isl.minX, isl.maxX);
  const [j0, j1] = gridRange(isl.minZ, isl.maxZ);
  const at = (x: number, z: number): number => heightAt(h, x, z);
  for (let j = Math.max(1, j0); j <= Math.min(n - 2, j1); j++)
    for (let i = Math.max(1, i0); i <= Math.min(n - 2, i1); i++) {
      const k = j * n + i;
      if (islandMap[k] !== id || sdf[k] <= 0 || sdf[k] > G.lipSdf) continue;
      if (zone[k] === Zone.cliff || h.data[k] < G.lipMinH) continue;
      if ([k + 1, k - 1, k + n, k - n].every((m) => zone[m] !== Zone.cliff)) continue;
      const gx = sdf[k + 1] - sdf[k - 1];
      const gz = sdf[k + n] - sdf[k - n];
      const gl = Math.hypot(gx, gz);
      if (gl < 1e-4) continue;
      const p = { x: cellX(i), z: cellZ(j) };
      if (dist(p, plaza) < G.minPlaza || (summit && dist(p, summit) < G.minSummit)) continue;
      const d = { x: -gx / gl, z: -gz / gl };
      const tx = -d.z;
      const tz = d.x;
      const conc =
        (at(p.x + tx * 6, p.z + tz * 6) + at(p.x - tx * 6, p.z - tz * 6)) / 2 - at(p.x, p.z);
      cands.push({ p, d, score: 0.25 * h.data[k] + 1.2 * Math.min(Math.max(0, conc), 4) });
    }
  cands.sort((a, b) => b.score - a.score || a.p.z - b.p.z || a.p.x - b.p.x);
  const picked: XZ[] = [];
  for (const c of cands) {
    if (picked.length >= G.balconies) break;
    if (picked.some((q) => dist(q, c.p) < G.spacing)) continue;
    const b = add(c.p, c.d, -G.inland);
    if (!onIsland(ctx, isl, b.x, b.z) || sdfAt(ctx, b.x, b.z) < 3) continue;
    if (relief(ctx, discShape(b.x, b.z, 1.8)) > G.maxRelief) continue;
    if (!clear(ctx, isl, discShape(b.x, b.z, 2.2), 0.5)) continue;
    picked.push(c.p);
    const face = ang(c.d.x, c.d.z);
    const side = { x: -c.d.z, z: c.d.x };
    pushFixture(ctx, isl, 'bench', b, face);
    const lp = add(b, side, 1.7);
    if (onIsland(ctx, isl, lp.x, lp.z)) pushFixture(ctx, isl, 'lanternPost', lp, face);
    const rail = add(b, c.d, 1.1);
    const fence: Polyline = {
      islandId: isl.id,
      kind: 'fence',
      closed: false,
      points: [add(rail, side, -1.6), add(rail, side, 1.6)],
    };
    (plan.lines ??= []).push(fence);
    addShape(ctx, isl, rectShape(rail.x, rail.z, face + Math.PI / 2, 0.4, 3.4), true);
    plan.links.push({ pin: add(b, c.d, -1.4), kind: 'path', done: () => undefined });
  }
  void rng;
}

// ---------------------------------------------------------------------------
// Ground paint, ferry office, avenue.

/** Civic lawn instead of inland dry sand around the plaza and the lots (the beach stays). */
function paintLawn(ctx: SiteCtx, isl: IslandData, plaza: XZ): void {
  const L = HQ_PLAN.lawn;
  const lots = ctx.lots.filter((l) => l.islandId === isl.id && l.kind !== 'hut');
  const paint = (c: XZ, r: number): void =>
    forSamplesNearSegment(ctx.h, c, c, r, (i) => {
      if (ctx.islandMap[i] !== isl.id + 1 || ctx.zone[i] !== Zone.sandDry) return;
      if (ctx.sdf[i] >= L.minShore) ctx.zone[i] = Zone.grass;
    });
  paint(plaza, HQ_PLAN.plaza.radius + L.quadPad);
  for (const l of lots) paint(l, Math.hypot(l.w, l.d) / 2 + L.lotPad);
}

/** Stone quay (D-058): plaza paving along the shore either side of the pier root. */
function paintQuay(ctx: SiteCtx, isl: IslandData, root: XZ, dir: XZ): void {
  const Q = HQ_PLAN.quay;
  const perp = { x: -dir.z, z: dir.x };
  const a = add(root, perp, Q.halfAlong);
  const b = add(root, perp, -Q.halfAlong);
  forSamplesNearSegment(ctx.h, a, b, Q.inland + 0.5, (i) => {
    if (ctx.islandMap[i] !== isl.id + 1 || ctx.sdf[i] <= 0 || ctx.sdf[i] > Q.inland) return;
    if (ctx.h.data[i] <= 0) return;
    ctx.zone[i] = Zone.plaza;
  });
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

/** Round trees at a fixed spacing either side of every street; lanterns and benches between. */
function placeAvenue(ctx: SiteCtx, isl: IslandData, plaza: XZ): void {
  const A = HQ_PLAN.avenue;
  const R = HQ_PLAN.plaza.radius;
  const green = (p: XZ): boolean =>
    onIsland(ctx, isl, p.x, p.z) && sdfAt(ctx, p.x, p.z) >= 2.5 && GREEN.includes(zoneAtP(ctx, p));
  let slot = 0;
  for (const lane of ctx.lanes[isl.id]) {
    let next = -1;
    for (let k = 0; k + 1 < lane.length; k++) {
      const p = lane[k];
      if (dist(p, plaza) < R + A.start) continue;
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
// Harbour Guild culture (M19 TASK-420): the pier kit, the plaza cart and notice board.

/**
 * Culture props of the Harbour Guild round the plaza and the ferry pier. Returns the story spot
 * requests (one per CultureDef story kind whose anchor piece was placed).
 */
function placeCulture(
  ctx: SiteCtx,
  isl: IslandData,
  plaza: XZ,
  a0: number,
  dockSite: { root: XZ; dir: XZ } | null,
  kit: Kit,
  rng: Rng,
): StorySpot[] {
  const S = HQ_CULTURE_SITE;
  const anchors = new Map<string, { p: XZ; rotY: number }>();
  const { ground, freeIn, padOk, land, quay, first, beside } = kit;

  /** First plaza ring spot (angles from the harbour heading), facing the plaza centre. */
  const onPlaza = (
    rings: readonly number[],
    angles: readonly number[],
    r: number,
    inPlaza: boolean,
  ): { p: XZ; rotY: number } | null => {
    for (const ring of rings)
      for (const d of angles) {
        const p = add(plaza, dirOf(a0 + d * DEG), ring);
        // inside the plaza the plaza pad levels the ground (the plan sees it before the pads)
        const ok = inPlaza
          ? ground(p, r, [S.minY, Infinity], S.padRelief) && freeIn(p, r)
          : land(p, r, true);
        if (ok) return { p, rotY: ang(plaza.x - p.x, plaza.z - p.z) };
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
    // (a harbour too tight between the plaza and the water: on the plaza's harbour edge instead)
    const onRim = onPlaza(S.awning.quadRings, S.awning.quadAngles, rad('ferryAwning'), true);
    const aw =
      first(pier, S.awning.along, S.awning.side, (p) => land(p, rad('ferryAwning'), true)) ??
      (onRim && {
        p: onRim.p,
        side: (onRim.p.x - pier.o.x) * N.x + (onRim.p.z - pier.o.z) * N.z || 1,
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
    // facing the plaza)
    const bl = first(pier, S.bell.along, S.bell.side, (p) => land(p, rad('bellPost'), true));
    const blAlt = bl
      ? null
      : beside(dockSite.root, S.bell.steps, S.bell.laneSide, rad('bellPost'), true);
    const bp = bl?.p ?? blAlt;
    if (bp) {
      const face = bl
        ? ang(-N.x * Math.sign(bl.side), -N.z * Math.sign(bl.side))
        : ang(plaza.x - bp.x, plaza.z - bp.z);
      putKit(ctx, isl, 'bellPost', bp, face, rad('bellPost'), S.bell.variant, padOk(bp));
      anchors.set('bellPost', { p: bp, rotY: face });
    }

    const office = ctx.fixtures.find((f) => f.islandId === isl.id && f.defId === 'ferryOffice');
    if (office) anchors.set('ferryOffice', { p: office, rotY: office.rotY });
  }

  // plaza: coffee cart (serving side to the centre) inside, notice board on the rim
  // (R 10 plaza, TASK-466: the cart's outer rings and the notice board's rim rings lie on the
  // plaza paving, levelled by its pad)
  const cart =
    onPlaza(S.cart.rings, S.cart.angles, rad('coffeeCart'), true) ??
    onPlaza(S.cart.outer, S.cart.angles, rad('coffeeCart'), true);
  if (cart) {
    putKit(ctx, isl, 'coffeeCart', cart.p, cart.rotY, rad('coffeeCart'), S.cart.variant);
    anchors.set('coffeeCart', cart);
  }
  const notice = onPlaza(S.notice.rings, S.notice.angles, rad('guildNoticeBoard'), true);
  if (notice) {
    const v = S.notice.variant;
    putKit(ctx, isl, 'guildNoticeBoard', notice.p, notice.rotY, rad('guildNoticeBoard'), v);
  }

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
