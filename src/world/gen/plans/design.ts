/**
 * Design island plan: the Glass Conservatory campus (M20 TASK-467, D-057 / D-058 / D-060) in the
 * Mossgrove forest dome, on top of the M14b art campus (TASK-367) and the Glass & Light kit
 * (TASK-425).
 * - Atelier Tree landmark on the giant-tree anchor (variant from the theme).
 * - Pier in the lee cove at the stream mouth.
 * - Conservatory Square (Z1): the conservatory on a levelled terrazzo disc near the dome top, the
 *   ateliers / pavilions in a ring round it, its 4 bays each leading to a path; bay 0 faces the
 *   pier and that path is the Prism Walk (Z4), lined with prism arches.
 * - Glass bridge (Z10) over the carved stream; the stream is otherwise blocked for paths.
 * - Glasshouse rows (2 × 3, rainbow order) beside the square; the stained windmill on a meadow
 *   on the shoulder opposite the tree (Z6). Pine filler is cleared round the new districts.
 * - Sculpture Garden, Easel Walk, Mushroom Grove as before; two spray rainbows off the bluff.
 * Every decision draws from forks of `rng`; numbers live in content/themes/design.ts and
 * content/cultures/design.ts.
 */
import type { Rng } from '../../../core/rng.ts';
import { DESIGN_SITES } from '../../../content/themes/design.ts';
import { THEMES } from '../../../content/themes/index.ts';
import { DESIGN_CULTURE_SITE as C } from '../../../content/cultures/design.ts';
import { FIXTURE_RADIUS, FLATTEN, LOT_FOOTPRINT, PATHS } from '../../../content/settlements.ts';
import type { IslandData, StorySpot, XZ } from '../../types.ts';
import { heightAt, Zone } from '../../types.ts';
import { shoreSdf } from '../coast.ts';
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
  dirOf,
  discShape,
  dist,
  dockWithLink,
  findDock,
  islandWindow,
  landmarkAccess,
  linkLandmark,
  linkLot,
  lotShape,
  mixPicker,
  nearestPathCell,
  newPlan,
  onIsland,
  onLand,
  placeNear,
  pushLandmark,
  rectShape,
  sdfAt,
  seedHub,
  segDist,
  relief,
  ring,
  shapeDist,
  shapesOverlap,
  siteFree,
  slotDefs,
  stepCtx,
  tryLot,
  unit,
  walkableFrom,
  type Shape,
  type SiteCtx,
  type SitePlan,
} from '../sites.ts';
import type { ThemePlanner } from './types.ts';

const S = DESIGN_SITES;

/**
 * A levelling pad that cuts / fills more than `S.cut.relief` keeps its whole reach (shape +
 * margin + falloff) off the coast face band (TASK-467: the campus fills a small dome; a deep
 * pad on the bluff band steepens the face past the archipelago's face p95 cap).
 */
function cutOk(ctx: SiteCtx, sh: Shape, margin: number, r: number): boolean {
  if (r <= S.cut.relief) return true;
  const extent = sh.r > 0 ? sh.r : Math.hypot(sh.hw, sh.hd);
  return sdfAt(ctx, sh.x, sh.z) >= extent + margin + FLATTEN.falloff + S.cut.band;
}

/** A fixture with its own obstacle radius (pushFixture uses FIXTURE_RADIUS, unset for these). */
function fixture(
  ctx: SiteCtx,
  isl: IslandData,
  defId: string,
  p: XZ,
  rotY: number,
  r: number,
): void {
  ctx.fixtures.push({ defId, x: p.x, z: p.z, rotY, islandId: isl.id });
  addShape(ctx, isl, discShape(p.x, p.z, r), true);
}

const pathLink = (plan: SitePlan, pin: XZ): void => {
  plan.links.push({ pin, kind: 'path', done: () => undefined });
};

/** Distance from `p` to the nearest point of a polyline sampled at ≤ 1 u. */
const lineDist = (pts: readonly XZ[], p: XZ): number => {
  let best = Infinity;
  for (const q of pts) best = Math.min(best, dist(p, q));
  return best;
};

/** Point at (x, z) in the frame of a prop at `p` with yaw `rotY` (local +z = dirOf(rotY)). */
const local = (p: XZ, rotY: number, x: number, z: number): XZ => ({
  x: p.x + Math.sin(rotY) * x + Math.cos(rotY) * z,
  z: p.z - Math.cos(rotY) * x + Math.sin(rotY) * z,
});

/** Open ground: forest / lawn / rock cells of the island within `r` of segment a→b become meadow. */
function meadowNear(ctx: SiteCtx, isl: IslandData, a: XZ, b: XZ, r: number): void {
  forSamplesNearSegment(ctx.h, a, b, r, (i) => {
    if (ctx.islandMap[i] !== isl.id + 1 || ctx.sdf[i] <= 0) return;
    const z = ctx.zone[i];
    if (z === Zone.forest || z === Zone.grass || z === Zone.rock) ctx.zone[i] = Zone.meadow;
  });
}

/** Sculpture Garden: levelled meadow disc, sculptures on a ring facing its centre. */
function sculptureGarden(
  ctx: SiteCtx,
  isl: IslandData,
  plan: SitePlan,
  quad: XZ,
  stream: readonly XZ[],
  rng: Rng,
): XZ | null {
  const C = S.clearing;
  // one pass per radius: the first relief tier a sample meets dominates its score (= tiered
  // passes); a smaller clearing (≥ minRadius) when the full one finds no room (TASK-467)
  const tiers = C.maxRelief;
  let R = C.radius;
  let centre: XZ | null = null;
  for (; R >= C.minRadius && !centre; R--) {
    const Rr = R;
    centre = bestSample(ctx, isl, quad, isl.reach, (p, i) => {
      if (ctx.sdf[i] < Rr + C.shoreGap) return Infinity;
      const sh = discShape(p.x, p.z, Rr);
      const r = relief(ctx, sh);
      const tier = tiers.findIndex((m) => r <= m);
      if (tier < 0 || !onLand(ctx, isl, sh, Rr + C.shoreGap)) return Infinity;
      if (!cutOk(ctx, sh, FLATTEN.discMargin, r) || !clear(ctx, isl, sh, C.gap)) return Infinity;
      if (lineDist(stream, p) < Rr + C.streamClear) return Infinity;
      return tier * 1000 + r + C.quadDistCost * Math.abs(dist(p, quad) - C.quadDist);
    });
  }
  if (!centre) return null;
  R++;
  const c = centre;
  addShape(ctx, isl, { ...discShape(c.x, c.z, R), tag: 'clearing' }, false);
  addPad(ctx, isl, discShape(c.x, c.z, R), FLATTEN.discMargin);
  // open meadow ground (no forest floor) across the disc
  meadowNear(ctx, isl, c, c, R + 1);
  const n = rng.int(C.sculptures[0], C.sculptures[1]);
  const kinds = rng.shuffle([...C.kinds]);
  // sculptures on an arc round the centre, open toward the quad: the path walks in through
  // the gap (a closed ring of obstacles would wall the centre off on the 2 u path grid)
  const toQuad = unit(c, quad);
  const gap = (C.entranceDeg * Math.PI) / 180;
  const a0 = ang(toQuad.x, toQuad.z) + gap / 2 + rng.range(-0.1, 0.1);
  for (let k = 0; k < n; k++) {
    const a = a0 + ((k + 0.5) / n) * (Math.PI * 2 - gap);
    const p = add(c, { x: Math.cos(a), z: Math.sin(a) }, R * C.ringFrac);
    const face = unit(p, c);
    fixture(ctx, isl, kinds[k % kinds.length], p, ang(face.x, face.z), 1.6);
  }
  plan.districts.push({
    islandId: isl.id,
    kind: 'sculpture',
    x: c.x,
    z: c.z,
    rotY: 0,
    w: 2 * R,
    d: 2 * R,
  });
  return c;
}

/** Easel Walk: easels on one bank, downstream then upstream of the point nearest `from`. */
function easelWalk(ctx: SiteCtx, isl: IslandData, stream: readonly XZ[], from: XZ, rng: Rng): XZ[] {
  const E = S.easels;
  const pins: XZ[] = [];
  if (stream.length < 3) return pins;
  const want = rng.int(E.count[0], E.count[1]);
  let start = 0;
  for (let k = 1; k < stream.length; k++)
    if (dist(stream[k], from) < dist(stream[start], from)) start = k;
  const order: number[] = [];
  for (let k = Math.max(1, start); k < stream.length - 1; k++) order.push(k);
  for (let k = start - 1; k >= 1; k--) order.push(k);
  const used: XZ[] = [];
  for (const k of order) {
    if (used.length >= want) break;
    const p = stream[k];
    if (used.some((q) => dist(q, p) < E.spacing)) continue;
    const t = unit(stream[k - 1], stream[k + 1]);
    const nrm = { x: -t.z, z: t.x };
    // the bank facing `from` first
    const pref = (from.x - p.x) * nrm.x + (from.z - p.z) * nrm.z >= 0 ? 1 : -1;
    slot: for (const off of E.offsets)
      for (const side of [pref, -pref]) {
        const q = add(p, nrm, side * off);
        const sh = discShape(q.x, q.z, E.radius);
        if (!onLand(ctx, isl, sh, 1.5) || heightAt(ctx.h, q.x, q.z) < 0.6) continue;
        if (lineDist(stream, q) < off - 0.4) continue;
        if (relief(ctx, discShape(q.x, q.z, 1.2)) > E.maxRelief) continue;
        if (!clear(ctx, isl, sh, 0.8)) continue;
        const face = unit(q, p);
        fixture(ctx, isl, 'easel', q, ang(face.x, face.z), E.radius);
        used.push(p);
        pins.push(add(q, face, -E.pinBack));
        break slot;
      }
  }
  return pins;
}

/** Mushroom Grove: giant mushrooms clustered on forest ground away from the other sites. */
function mushroomGrove(
  ctx: SiteCtx,
  isl: IslandData,
  plan: SitePlan,
  quad: XZ,
  avoid: readonly XZ[],
  stream: readonly XZ[],
  rng: Rng,
): XZ | null {
  const G = S.grove;
  // tiered: forest ground within the relief cap first, then rougher forest, then any green
  // ground; a smaller separation when the campus leaves no room (TASK-467)
  let c: XZ | null = null;
  let R: number = G.radius[0];
  for (const minSep of G.minSep)
    for (const radius of G.radius) {
      if (c) break;
      R = radius;
      c = bestSample(ctx, isl, quad, isl.reach, (p, i) => {
        const z = ctx.zone[i];
        const green = z === Zone.forest || z === Zone.grass || z === Zone.meadow;
        if (!green || ctx.sdf[i] < R + 2) return Infinity;
        if (dist(p, quad) < minSep || avoid.some((q) => dist(p, q) < minSep)) return Infinity;
        const sh = discShape(p.x, p.z, R);
        const r = relief(ctx, sh);
        const tier =
          G.maxRelief.findIndex((m) => r <= m) + (z === Zone.forest ? 0 : G.maxRelief.length);
        if (r > G.maxRelief[G.maxRelief.length - 1] || !clear(ctx, isl, sh, 1)) return Infinity;
        if (lineDist(stream, p) < R + 2) return Infinity;
        return tier * 1000 + r + 0.05 * Math.abs(dist(p, quad) - G.quadDist);
      });
    }
  if (!c) return null;
  const want = rng.int(G.mushrooms[0], G.mushrooms[1]);
  const cand = rng.shuffle(ring(c, 1.5, R - 1, 1.2, 10, rng.range(0, 1)));
  const placed: XZ[] = [];
  for (const p of cand) {
    if (placed.length >= want) break;
    if (placed.some((q) => dist(q, p) < G.spacing)) continue;
    const sh = discShape(p.x, p.z, G.mushroomR);
    if (!onLand(ctx, isl, sh, 2) || !clear(ctx, isl, sh, 0.4)) continue;
    fixture(ctx, isl, 'giantMushroom', p, rng.range(0, Math.PI * 2), G.mushroomR);
    placed.push(p);
  }
  if (placed.length === 0) return null;
  plan.districts.push({
    islandId: isl.id,
    kind: 'garden',
    x: c.x,
    z: c.z,
    rotY: 0,
    w: 2 * R,
    d: 2 * R,
  });
  return c;
}

// ---------------------------------------------------------------------------
// Glass Conservatory campus (M20 TASK-467)

/**
 * The pier in the lee cove beside the stream mouth (Z5), preferably `dock.offset` u along the
 * shore from it (the creek under the glass bridge runs out there). Returns its root, or null.
 */
function placePier(
  ctx: SiteCtx,
  isl: IslandData,
  plan: SitePlan,
  stream: readonly XZ[],
  rng: Rng,
): XZ | null {
  const D = S.dock;
  const near = isl.anchors.streamMouth ?? isl.anchors.giantTree ?? { x: isl.cx, z: isl.cz };
  const n = stream.length;
  const t = n >= 4 ? unit(stream[n - 4], stream[n - 1]) : dirOf(ctx.windDir);
  const perp = { x: -t.z, z: t.x };
  let site = null;
  for (const side of [1, -1, 0]) {
    const s = findDock(ctx, isl, {
      near,
      maxDist: D.maxDist,
      prefer: add(near, perp, side * D.offset),
      lee: D.lee,
      carve: true,
    });
    if (!s) continue;
    if (!site || lineDist(stream, s.root) >= D.streamClear) site = s;
    if (lineDist(stream, site.root) >= D.streamClear) break;
  }
  dockWithLink(ctx, isl, plan, site, rng.fork('moorings'), {
    rowboats: D.rowboats,
    sailboats: 0,
  });
  return site ? site.root : null;
}

interface Square {
  /** Disc centre (= the conservatory) and radius; the conservatory's yaw (bay 0 = local +z). */
  c: XZ;
  R: number;
  rotY: number;
  /** Path pins just past the four bays (0 = toward the pier). */
  pins: XZ[];
}

/**
 * Conservatory Square (Z1, D1): the flattest `glade.quadR` disc near the dome top, off the
 * stream and the tree; the plan's plaza (terrazzo pad), the conservatory at its centre with bay
 * 0 toward the pier, the hub at bay 0's pin. The forest round it becomes meadow.
 */
function conservatorySquare(
  ctx: SiteCtx,
  isl: IslandData,
  plan: SitePlan,
  tree: XZ,
  stream: readonly XZ[],
  pier: XZ | null,
): Square | null {
  const Q = S.square;
  const R = S.glade.quadR;
  const centre = { x: isl.cx, z: isl.cz };
  // the tree's own disc (LANDMARKS.giantTree 5 u) plus the pass's gap, measured from the
  // octagon: the plaza ring may touch the tree's lawn, the glass house never does
  const treeR = FIXTURE_RADIUS.conservatory + 5;
  const c = bestSample(ctx, isl, centre, Q.search, (p, i) => {
    if (ctx.sdf[i] < Q.minShore) return Infinity;
    const sh = discShape(p.x, p.z, R);
    const r = relief(ctx, sh);
    const dt = dist(p, tree);
    const pass = Q.passes.findIndex(([gap, maxRelief]) => dt >= treeR + gap && r <= maxRelief);
    if (pass < 0 || !onLand(ctx, isl, sh, Q.minShore)) return Infinity;
    if (lineDist(stream, p) < R + Q.streamClear) return Infinity;
    return pass * 1000 + r + 0.03 * dist(p, centre);
  });
  if (!c) return null;
  plan.plaza = { x: c.x, z: c.z, r: R };
  addShape(ctx, isl, { ...discShape(c.x, c.z, R + 0.5), tag: 'plaza' }, false);
  addPad(ctx, isl, discShape(c.x, c.z, R), FLATTEN.discMargin);
  meadowNear(ctx, isl, c, c, R + Q.meadowRing);
  plan.districts.push({
    islandId: isl.id,
    kind: 'quad',
    x: c.x,
    z: c.z,
    rotY: 0,
    w: 2 * R,
    d: 2 * R,
  });
  // bay 0 (local +z) toward the pier, else toward the stream mouth, else away from the tree
  const toward = pier ?? isl.anchors.streamMouth ?? add(c, unit(tree, c), 10);
  const rotY = ang(toward.x - c.x, toward.z - c.z);
  const cR = FIXTURE_RADIUS.conservatory;
  ctx.fixtures.push({ defId: 'conservatory', x: c.x, z: c.z, rotY, islandId: isl.id, variant: 0 });
  addShape(ctx, isl, discShape(c.x, c.z, cR), true);
  const pins = [0, 1, 2, 3].map((k) => add(c, dirOf(rotY + (k * Math.PI) / 2), cR + Q.bayPin));
  plan.hub = pins[0];
  return { c, R, rotY, pins };
}

/**
 * The four bay paths: an A* lane from the hub cell (bay 0) to each bay's goal — bay 0 the pier,
 * a bay whose axis points at the tree the tree's access point, the others a far point along
 * the axis — kept inside a corridor round the axis (the plaza ring is always allowed, so the
 * lanes of the side / back bays walk round the conservatory). Lanes enter the network and
 * `ctx.lanes` (lots and chime lines read them). Returns the lanes' cell chains in bay order
 * (null = none).
 */
function bayLanes(
  ctx: SiteCtx,
  isl: IslandData,
  plan: SitePlan,
  sq: Square,
  tree: XZ,
  pier: XZ | null,
): (number[] | null)[] {
  const Q = S.square;
  const hubCell = seedHub(ctx, isl, plan, sq.pins[0]);
  const lanes: (number[] | null)[] = [null, null, null, null];
  if (hubCell < 0) return lanes;
  const base = pathStep({ ...stepCtx(ctx, isl), stair: false });
  const win = islandWindow(ctx, isl);
  const treeDir = unit(sq.c, tree);
  const treeCos = Math.cos((Q.treeBayDeg * Math.PI) / 180);
  for (let k = 0; k < 4; k++) {
    const d = dirOf(sq.rotY + (k * Math.PI) / 2);
    let goal: XZ | null = null;
    if (k === 0 && pier) goal = pier;
    else if (d.x * treeDir.x + d.z * treeDir.z >= treeCos)
      goal = landmarkAccess(ctx, plan.landmarks[0], sq.c);
    else
      for (let L = Q.laneLength; L >= Q.laneMin; L -= 4) {
        const p = add(sq.c, d, L);
        if (!onIsland(ctx, isl, p.x, p.z) || sdfAt(ctx, p.x, p.z) < 4) continue;
        if (nearestPathCell(ctx, isl, p) >= 0) {
          goal = p;
          break;
        }
      }
    if (!goal) continue;
    const endCell = nearestPathCell(ctx, isl, goal);
    if (endCell < 0 || endCell === hubCell) continue;
    const pin = sq.pins[k];
    const g = goal;
    let cells: number[] | null = null;
    for (const half of [...Q.corridor, Infinity]) {
      cells = gridAStar({
        ...win,
        start: hubCell,
        goal: endCell,
        step: (a, b, dd) => {
          const p = cellPos(ctx, b);
          if (dist(p, sq.c) <= sq.R + 3 || segDist(p, pin, g) <= half) return base(a, b, dd);
          return Infinity;
        },
        hScale: 2,
      });
      if (cells && cells.length >= 3) break;
      cells = null;
    }
    if (!cells) continue;
    addCellPath(ctx.net, cells, isl.id, 'path');
    const lane = resample(
      cells.map((i) => cellPos(ctx, i)),
      1,
      false,
    );
    ctx.lanes[isl.id].push(lane);
    lanes[k] = cells;
  }
  return lanes;
}

/** Obstacle-free (shapes only, lanes ignored: the arches stand astride a lane). */
function freeOfShapes(ctx: SiteCtx, isl: IslandData, sh: Shape, gap: number): boolean {
  for (const o of ctx.shapes[isl.id]) {
    if (o.tag === 'plaza') continue;
    if (shapesOverlap(o, sh, gap)) return false;
  }
  return true;
}

/**
 * Prism Walk (Z4, D3): prism arches astride the pier lane every `spacing` u from the bay, on
 * the middle cells of straight runs of the lane (≥ `run` collinear cells: the chain smoothing
 * of buildPathGraph keeps a straight run, so the final path passes under the crown whatever
 * the later junctions do), level across (each arch gets a small levelling pad) and high enough;
 * their posts are small obstacles, the walk through stays open. The forest along the lane
 * becomes meadow. Returns the arch positions (TASK-468 pools).
 */
function prismWalk(
  ctx: SiteCtx,
  isl: IslandData,
  cells: readonly number[],
  sq: Square,
  rng: Rng,
): XZ[] {
  const P = C.prismWalk;
  const out: XZ[] = [];
  const want = rng.int(P.count[0], P.count[1]);
  const pts = cells.map((i) => cellPos(ctx, i));
  for (let k = 0; k + 1 < pts.length; k++) meadowNear(ctx, isl, pts[k], pts[k + 1], P.meadow);
  // arc length along the raw lane; it starts at the hub cell (≈ bay 0)
  const arc: number[] = [0];
  for (let k = 1; k < pts.length; k++) arc.push(arc[k - 1] + dist(pts[k - 1], pts[k]));
  let k0 = 0;
  while (k0 < pts.length && dist(pts[k0], sq.c) < sq.R + 1) k0++;
  /** The arch site at lane cell k (mid-way in a straight run of `run` cells): posts, yaw and
   * cross-step; null when it does not fit. */
  const siteAt = (
    k: number,
    run: number,
    crossStep: number,
  ): { p: XZ; a: XZ; b: XZ; rotY: number; step: number } | null => {
    const half = Math.floor(run / 2);
    if (k - half < 0 || k + half >= pts.length) return null;
    const p = pts[k];
    const t = unit(pts[k - half], pts[k + half]);
    for (let m = k - half; m < k + half; m++) {
      const u = unit(pts[m], pts[m + 1]);
      if (u.x * t.x + u.z * t.z < 0.999) return null;
    }
    const n = { x: -t.z, z: t.x };
    const a = add(p, n, P.postX);
    const b = add(p, n, -P.postX);
    if (!onIsland(ctx, isl, a.x, a.z) || !onIsland(ctx, isl, b.x, b.z)) return null;
    const ya = heightAt(ctx.h, a.x, a.z);
    const yb = heightAt(ctx.h, b.x, b.z);
    const step = Math.abs(ya - yb);
    if (Math.min(ya, yb) < C.minY || step > crossStep) return null;
    if (!freeOfShapes(ctx, isl, discShape(a.x, a.z, P.postR), 0.3)) return null;
    if (!freeOfShapes(ctx, isl, discShape(b.x, b.z, P.postR), 0.3)) return null;
    // its levelling pad core must not overlap another pad's (two levels mixed under a post)
    if (!freeOfShapes(ctx, isl, discShape(p.x, p.z, P.pad), FLATTEN.discMargin)) return null;
    return { p, a, b, rotY: ang(t.x, t.z), step };
  };
  // from the first spot, each next one `spacing` u past the arch before it; the longest
  // straight run first (its middle cell is exactly on the final path), the short run after
  let s = arc[k0] + P.first;
  let last = -Infinity;
  while (s < arc[arc.length - 1] - 3 && out.length < want) {
    let best: { site: NonNullable<ReturnType<typeof siteAt>>; k: number } | null = null;
    for (const crossStep of P.crossStep) {
      for (const run of P.run) {
        for (let k = k0; k < pts.length; k++) {
          if (Math.abs(arc[k] - s) > P.window || arc[k] < last + P.minSpacing) continue;
          const site = siteAt(k, run, crossStep);
          if (site && (!best || site.step < best.site.step)) best = { site, k };
        }
        if (best) break;
      }
      if (best) break;
    }
    if (!best) {
      s += P.spacing;
      continue;
    }
    last = arc[best.k];
    s = last + P.spacing;
    const { p, a, b, rotY } = best.site;
    ctx.fixtures.push({ defId: 'prismArch', x: p.x, z: p.z, rotY, islandId: isl.id, variant: 0 });
    addShape(ctx, isl, discShape(a.x, a.z, P.postR), true);
    addShape(ctx, isl, discShape(b.x, b.z, P.postR), true);
    addPad(ctx, isl, discShape(p.x, p.z, P.pad), FLATTEN.discMargin);
    // keep-off: a later lot / kit pad core must not mix its level into the arch's
    addShape(ctx, isl, discShape(p.x, p.z, P.pad + P.keepOff), false);
    out.push(p);
  }
  return out;
}

/**
 * Glass bridge (Z10, D7) over the stream's tidal creek on the lee beach (see
 * DESIGN_CULTURE_SITE.bridge): the farthest-inland stream point whose two banks (± padX) are
 * level beach; the stream bed from the sea to `creekPast` u upstream of it is cut below sea
 * level (land cells, the shore SDF stays), the creek is blocked for paths (cells only, so
 * existing nodes stay valid) except at the bridge, and both ends are linked. Returns the pivot,
 * or null.
 */
function glassBridge(
  ctx: SiteCtx,
  isl: IslandData,
  plan: SitePlan,
  stream: readonly XZ[],
  sq: Square,
  pier: XZ | null,
): XZ | null {
  const B = C.bridge;
  // the stream runs summit → sea: walk from the mouth (last point) inland
  let best: { k: number; p: XZ; n: XZ; score: number } | null = null;
  for (let k = stream.length - 4; k >= 3; k--) {
    const p = stream[k];
    if (sdfAt(ctx, p.x, p.z) < B.minShore || dist(p, sq.c) < sq.R + B.squareClear) continue;
    const t = unit(stream[k - 3], stream[k + 3]);
    const n0 = ang(-t.z, t.x);
    for (const deg of B.angles) {
      const n = dirOf(n0 + (deg * Math.PI) / 180);
      const a = add(p, n, B.padX);
      const b = add(p, n, -B.padX);
      if (!onIsland(ctx, isl, a.x, a.z) || !onIsland(ctx, isl, b.x, b.z)) continue;
      const ya = heightAt(ctx.h, a.x, a.z);
      const yb = heightAt(ctx.h, b.x, b.z);
      if (Math.min(ya, yb) < B.bankY[0] || Math.max(ya, yb) > B.bankY[1]) continue;
      const step = Math.abs(ya - yb);
      const tier = B.bankStep.findIndex((m) => step <= m);
      if (tier < 0) continue;
      if (relief(ctx, discShape(a.x, a.z, 1.3)) > B.padRelief) continue;
      if (relief(ctx, discShape(b.x, b.z, 1.3)) > B.padRelief) continue;
      // the creek meanders: both pads clear of its whole cut reach, not just this segment
      const reach = stream.slice(Math.max(1, k - Math.round(B.creekPast)));
      if (lineDist(reach, a) < B.padX - 0.4 || lineDist(reach, b) < B.padX - 0.4) continue;
      const rotY = Math.atan2(n.x, -n.z);
      const deck = rectShape(p.x, p.z, rotY, 2 * B.padX + 2 * B.padR + 0.4, 2.6);
      if (!clear(ctx, isl, deck, 0.5)) continue;
      // the level tier first, then farthest inland (the longest creek), then the least turn
      const score = tier * 1000 - k * 10 + Math.abs(deg) / 10;
      if (!best || score < best.score) best = { k, p, n, score };
    }
  }
  if (!best) return null;
  const { k: kb, p, n } = best;
  const rotY = Math.atan2(n.x, -n.z);
  ctx.fixtures.push({ defId: 'glassBridge', x: p.x, z: p.z, rotY, islandId: isl.id, variant: 0 });
  const deck = rectShape(p.x, p.z, rotY, 2 * B.padX + 2 * B.padR + 0.4, 2.6);
  addShape(ctx, isl, deck, false);
  // the deck cells stay walkable for the A* once the creek under them is sea (shore SDF ≤ 0)
  {
    const Rr = Math.hypot(deck.hw, deck.hd) + 1;
    const [x0, x1] = gridRange(p.x - Rr, p.x + Rr);
    const [z0, z1] = gridRange(p.z - Rr, p.z + Rr);
    for (let iz = z0; iz <= z1; iz++)
      for (let ix = x0; ix <= x1; ix++)
        if (shapeDist(deck, cellX(ix), cellZ(iz)) <= 0.5) ctx.passable[iz * ctx.n + ix] = 1;
  }
  for (const s of [1, -1]) {
    const pad = add(p, n, s * B.padX);
    addShape(ctx, isl, discShape(pad.x, pad.z, B.padR), true);
    // its own level (Pad.step): an arch or lot pad next door must not tilt the deck
    addPad(ctx, isl, discShape(pad.x, pad.z, B.endPad), FLATTEN.discMargin, B.endPadStep);
    addShape(ctx, isl, discShape(pad.x, pad.z, B.endPad + 2 * FLATTEN.discMargin), false);
    pathLink(plan, add(p, n, s * (B.padX + B.padR + B.pin)));
  }
  // the creek: from the sea to `creekPast` u upstream of the bridge, every 1 u segment; the cut
  // cells are sea for everything after (the shore SDF is recomputed from the new land mask: pads
  // skip them, paths / lots / scatter keep off, the water shader sees a shore, Phase 2 edits
  // derive from a consistent SDF)
  const k0 = Math.max(1, kb - Math.round(B.creekPast));
  const fall = B.creekCore + B.creekFalloff;
  // the band starts `fall` u upstream of the cut: its round cap lowers cells past k0 too
  for (let k = Math.max(1, k0 - Math.ceil(fall)); k + 1 < stream.length; k++) {
    const a = stream[k];
    const b = stream[k + 1];
    // not beside the pier root: its link needs land cells with a shore margin round it
    const underDeck = segDist(p, a, b) < B.gapAlong;
    if (k >= k0 && (underDeck || !(pier && segDist(pier, a, b) < B.pierClear + fall)))
      forSamplesNearSegment(ctx.h, a, b, fall, (i, d) => {
        if (ctx.islandMap[i] !== isl.id + 1 || ctx.sdf[i] <= 0) return;
        const y = ctx.h.data[i];
        if (y <= B.creekDepth) return;
        // full depth inside the core, eased out over the falloff (1 − smoothstep)
        const u = Math.max(0, Math.min(1, (d - B.creekCore) / B.creekFalloff));
        const w = 1 - u * u * (3 - 2 * u);
        ctx.h.data[i] = y + (B.creekDepth - y) * w;
      });
    // blocked for paths (except the bridge gap and the pier root's cells): nothing walks the creek
    const m = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
    if (dist(m, p) < B.gapAlong || (pier && dist(m, pier) < B.pierClear)) continue;
    const t = unit(a, b);
    const sh = rectShape(m.x, m.z, ang(t.x, t.z), 2 * B.band, dist(a, b) + 0.2);
    const Rr = B.band + 2;
    const [x0, x1] = gridRange(m.x - Rr, m.x + Rr);
    const [z0, z1] = gridRange(m.z - Rr, m.z + Rr);
    for (let iz = z0; iz <= z1; iz++)
      for (let ix = x0; ix <= x1; ix++)
        if (shapeDist(sh, cellX(ix), cellZ(iz)) <= 0.5 && !ctx.passable[iz * ctx.n + ix])
          ctx.blocked[iz * ctx.n + ix] = 1;
  }
  const land = new Uint8Array(ctx.n * ctx.n);
  for (let i = 0; i < land.length; i++) land[i] = ctx.h.data[i] > 0 ? 1 : 0;
  ctx.sdf.set(shoreSdf(land, ctx.n));
  return p;
}

/**
 * Glasshouse rows (Z1, D2): a 2 × 3 block on a diagonal beside the square, doors toward it,
 * one levelled pad, hues from the content rows; pins in front and at both aisle ends. When no
 * block fits (the flank beside the square is too steep or taken), the two rows stand apart,
 * the second as near the first as it can.
 */
function glasshouseRows(
  ctx: SiteCtx,
  isl: IslandData,
  plan: SitePlan,
  sq: Square,
  rng: Rng,
): XZ | null {
  const G = C.glasshouses;
  const w = 2 * G.colGap + 2.5 + 0.6;
  const quadrants = rng.shuffle([0, 1, 2, 3]);
  const ringLots = plan.lots.map((li) => ctx.lots[li]);
  /** Best site for a block of `nRows` rows: the levelled tier first, then relief, distance. */
  const site = (nRows: number, near: XZ | null): { c: XZ; rotY: number } | null => {
    const d = (nRows - 1) * G.rowGap + 4 + 0.6;
    let best: { c: XZ; rotY: number; score: number } | null = null;
    for (const quadrant of quadrants)
      for (const off of G.angleOff)
        for (const L of G.dist) {
          const a = sq.rotY + (quadrant * Math.PI) / 2 + (off * Math.PI) / 180;
          const c = add(sq.c, dirOf(a), L);
          const f = unit(c, sq.c);
          const rotY = ang(f.x, f.z);
          const sh = rectShape(c.x, c.z, rotY, w, d);
          if (!onLand(ctx, isl, sh, G.minShore)) continue;
          if (!siteFree(ctx, isl, sh)) continue;
          const r = relief(ctx, sh);
          const tier = G.maxRelief.findIndex((m) => r <= m);
          if (tier < 0 || !clear(ctx, isl, sh, G.gap)) continue;
          if (!cutOk(ctx, sh, FLATTEN.lotMargin, r)) continue;
          // the ring lots came first: their pad cores stay apart from the block's
          if (ringLots.some((l) => shapesOverlap(sh, lotShape(l), G.lotGap))) continue;
          const score = tier * 1000 + r + 0.05 * L + (near ? 0.1 * dist(c, near) : 0);
          if (!best || score < best.score) best = { c, rotY, score };
        }
    return best;
  };
  /** Stand `rows` (content hue rows) on one pad at `c`, doors (local +z) toward the square. */
  const stand = (c: XZ, rotY: number, rows: readonly (readonly number[])[]): void => {
    const d = (rows.length - 1) * G.rowGap + 4 + 0.6;
    // lotMargin: the houses' corners only ever see the plateau (bilinear cells, FLATTEN)
    addPad(ctx, isl, rectShape(c.x, c.z, rotY, w, d), FLATTEN.lotMargin);
    addShape(ctx, isl, rectShape(c.x, c.z, rotY, w + 2 * G.keepOff, d + 2 * G.keepOff), false);
    meadowNear(ctx, isl, c, c, Math.hypot(w, d) / 2 + G.meadow);
    const z0 = ((rows.length - 1) * G.rowGap) / 2;
    rows.forEach((row, r) =>
      row.forEach((hue, i) => {
        const p = local(c, rotY, (i - 1) * G.colGap, z0 - r * G.rowGap);
        ctx.fixtures.push({
          defId: 'glasshouse',
          x: p.x,
          z: p.z,
          rotY,
          islandId: isl.id,
          variant: hue,
        });
        addShape(ctx, isl, rectShape(p.x, p.z, rotY, 2.5, 4), true);
      }),
    );
    pathLink(plan, local(c, rotY, 0, z0 + 2 + G.pin));
    if (rows.length > 1)
      for (const s of [1, -1]) pathLink(plan, local(c, rotY, s * (G.colGap + 1.25 + G.pin), 0));
    plan.districts.push({ islandId: isl.id, kind: 'glasshouses', x: c.x, z: c.z, rotY, w, d });
  };
  const block = site(G.rows.length, null);
  if (block) {
    stand(block.c, block.rotY, G.rows);
    return block.c;
  }
  let first: XZ | null = null;
  for (const row of G.rows) {
    const one = site(1, first);
    if (!one) continue;
    stand(one.c, one.rotY, [row]);
    first ??= one.c;
  }
  return first;
}

/**
 * Stained windmill (Z6, D9) on a meadow on the dome's shoulder: high, gentle, away from the
 * tree, the square and the stream; the rotor (local +z) into the wind; forest round it cleared.
 */
function windmillRidge(
  ctx: SiteCtx,
  isl: IslandData,
  plan: SitePlan,
  sq: Square,
  tree: XZ,
  stream: readonly XZ[],
): XZ | null {
  const W = C.windmill;
  const centre = { x: isl.cx, z: isl.cz };
  let c: XZ | null = null;
  for (const [minShore, treeClear, squareClear] of W.passes) {
    c = bestSample(ctx, isl, centre, W.dist[1], (p, i) => {
      const L = dist(p, centre);
      if (L < W.dist[0] || ctx.sdf[i] < minShore || ctx.h.data[i] < W.minY) return Infinity;
      if (dist(p, tree) < treeClear || dist(p, sq.c) < squareClear) return Infinity;
      if (lineDist(stream, p) < W.streamClear) return Infinity;
      const sh = discShape(p.x, p.z, W.discR);
      const r = relief(ctx, sh);
      const tier = W.maxRelief.findIndex((m) => r <= m);
      if (tier < 0 || !onLand(ctx, isl, sh, minShore)) return Infinity;
      if (!cutOk(ctx, sh, FLATTEN.discMargin, r) || !clear(ctx, isl, sh, 1)) return Infinity;
      return tier * 1000 + r - 0.1 * ctx.h.data[i] + 0.05 * Math.abs(L - W.preferDist);
    });
    if (c) break;
  }
  if (!c) return null;
  const rotY = ctx.windDir + Math.PI;
  ctx.fixtures.push({
    defId: 'stainedWindmill',
    x: c.x,
    z: c.z,
    rotY,
    islandId: isl.id,
    variant: 0,
  });
  addShape(ctx, isl, discShape(c.x, c.z, FIXTURE_RADIUS.stainedWindmill), true);
  addPad(ctx, isl, discShape(c.x, c.z, W.discR), FLATTEN.discMargin);
  // keep-off: no other pad core overlaps the mill's (the pad relaxation does not converge in a
  // crowded chain, and two levels would mix under a neighbour)
  addShape(ctx, isl, discShape(c.x, c.z, W.discR + 2 * FLATTEN.discMargin), false);
  meadowNear(ctx, isl, c, c, W.meadowR);
  pathLink(plan, add(c, unit(c, sq.c), W.pin));
  plan.districts.push({
    islandId: isl.id,
    kind: 'windmill',
    x: c.x,
    z: c.z,
    rotY,
    w: 2 * W.meadowR,
    d: 2 * W.meadowR,
  });
  return c;
}

/**
 * The ateliers / gallery pavilions in a ring round the square, facing it (the ring fill of
 * `campusLots` without its lanes: the bay lanes are already laid), door links nearest first.
 */
function squareLots(
  ctx: SiteCtx,
  isl: IslandData,
  plan: SitePlan,
  centre: XZ,
  reachFrom: XZ,
  rng: Rng,
  sIdx: number,
): void {
  const spec = S.glade;
  const inner = plan.plaza ? plan.plaza.r : 0;
  const target = rng.int(spec.lots[0], spec.lots[1]);
  ctx.reach[isl.id] = walkableFrom(ctx, isl, reachFrom);
  const lots: number[] = [];
  const mix = THEMES[isl.theme].lotMix;
  const crown = THEMES[isl.theme].crown;
  const main = mix
    .map(([d]) => d)
    .filter((d) => d !== crown)
    .sort(
      (a, b) =>
        LOT_FOOTPRINT[b][0] * LOT_FOOTPRINT[b][1] - LOT_FOOTPRINT[a][0] * LOT_FOOTPRINT[a][1] ||
        (a < b ? -1 : 1),
    )[0];
  if (main) {
    const li = placeNear(ctx, isl, main, centre, inner, spec, sIdx);
    if (li >= 0) lots.push(li);
  }
  const pick = mixPicker(mix, rng.fork('ring'));
  const r0 = inner + spec.ring[0];
  for (const p of ring(centre, r0, r0 + spec.ring[1], 1.5, 32, rng.range(0, 1))) {
    if (lots.length >= target) break;
    const drawn = pick();
    const f = unit(p, centre);
    const a = ang(f.x, f.z);
    slot: for (const def of slotDefs(drawn, mix, crown))
      for (const rotY of [a, a + Math.PI / 2, a - Math.PI / 2]) {
        const li = tryLot(ctx, isl, def, p, rotY, sIdx, {
          minShore: spec.minShore,
          maxRelief: spec.maxRelief,
        });
        if (li >= 0) {
          lots.push(li);
          break slot;
        }
      }
  }
  ctx.reach[isl.id] = null;
  lots.sort((a, b) => dist(ctx.lots[a], centre) - dist(ctx.lots[b], centre));
  for (const li of lots) linkLot(ctx, plan, li);
}

export const planDesign: ThemePlanner = ({ ctx, isl, rng, sIdx }) => {
  const theme = THEMES[isl.theme];
  // landmarks on their anchors (the Atelier Tree); the plan needs the tree
  const lms: number[] = [];
  for (const key of Object.keys(theme.landmarks).sort()) {
    const a = isl.anchors[key];
    if (a) lms.push(pushLandmark(ctx, isl, theme.landmarks[key].kind, a, a.rotY));
  }
  const treeAnchor = isl.anchors.giantTree;
  if (!treeAnchor || lms.length === 0) return null;
  const ti = lms[0];
  const plan = newPlan('campus', treeAnchor);
  plan.landmarks.push(...lms);
  plan.hub = landmarkAccess(ctx, ti, { x: isl.cx, z: isl.cz });

  const stream = resample(ctx.streams.find((s) => s.islandId === isl.id)?.points ?? [], 1, false);
  // the pier, the square (sets the hub), the bridge + stream band, then the bay lanes (A* round
  // the band), the prism walk on the pier lane, the lot ring round the square (before the other
  // sites: on a small dome they would take the flank), the glasshouses, the garden, the windmill
  // (its fallback passes move it in), the easels, the grove, the culture kit
  const pier = placePier(ctx, isl, plan, stream, rng.fork('pier'));
  const sq = conservatorySquare(ctx, isl, plan, treeAnchor, stream, pier);
  const centre = sq ? sq.c : plan.hub;
  if (sq) {
    glassBridge(ctx, isl, plan, stream, sq, pier);
    const lanes = bayLanes(ctx, isl, plan, sq, treeAnchor, pier);
    if (lanes[0]) prismWalk(ctx, isl, lanes[0], sq, rng.fork('prisms'));
  }
  squareLots(ctx, isl, plan, centre, sq ? sq.pins[0] : centre, rng.fork('glade'), sIdx);
  if (sq) glasshouseRows(ctx, isl, plan, sq, rng.fork('glasshouses'));
  const garden = sculptureGarden(ctx, isl, plan, centre, stream, rng.fork('sculptures'));
  if (sq) windmillRidge(ctx, isl, plan, sq, treeAnchor, stream);
  const easelPins = easelWalk(ctx, isl, stream, centre, rng.fork('easels'));
  const grove = mushroomGrove(
    ctx,
    isl,
    plan,
    centre,
    garden ? [garden, treeAnchor] : [treeAnchor],
    stream,
    rng.fork('grove'),
  );
  // Glass & Light culture (M19 TASK-425): after the lots, before the links (paths route round it)
  plan.stories = glassAndLight(ctx, isl, plan, rng.fork('culture'), {
    quad: sq ? sq.c : null,
    centre,
    garden,
    grove,
    stream,
    tree: ctx.landmarks[ti],
  });
  // connections: the tree, the bays, the garden centre, the bank path (in order along the
  // stream), the grove; the bridge, glasshouse and windmill pins were pushed by their planners
  linkLandmark(ctx, plan, ti, centre);
  if (sq) for (const p of sq.pins) pathLink(plan, p);
  if (garden) pathLink(plan, garden);
  for (const p of easelPins) pathLink(plan, p);
  if (grove) pathLink(plan, grove);
  return plan;
};

// ---------------------------------------------------------------------------
// Glass & Light Studio (M19 TASK-425, ISLAND_CULTURES §2.6)

interface GlassSite {
  quad: XZ | null;
  /** Quad centre (or the hub when no quad fits). */
  centre: XZ;
  garden: XZ | null;
  grove: XZ | null;
  stream: readonly XZ[];
  tree: XZ;
}

/** No obstacle within `gap` (shapes tagged in `skip` ignored) and off the lane lines. */
function freeOf(
  ctx: SiteCtx,
  isl: IslandData,
  sh: Shape,
  gap: number,
  skip: readonly string[] = [],
): boolean {
  for (const o of ctx.shapes[isl.id]) {
    if (o.tag && skip.includes(o.tag)) continue;
    if (shapesOverlap(o, sh, gap)) return false;
  }
  for (const lane of ctx.lanes[isl.id])
    for (const p of lane) if (shapeDist(sh, p.x, p.z) < PATHS.halfWidth + 0.4) return false;
  return true;
}

/** Paint the island's land cells inside `sh` with `zone` (the hot shop's terrazzo yard). */
function paintZone(ctx: SiteCtx, isl: IslandData, sh: Shape, zone: number): void {
  const R = Math.hypot(sh.hw, sh.hd) + 1;
  const [x0, x1] = gridRange(sh.x - R, sh.x + R);
  const [z0, z1] = gridRange(sh.z - R, sh.z + R);
  for (let iz = z0; iz <= z1; iz++)
    for (let ix = x0; ix <= x1; ix++) {
      const i = iz * ctx.n + ix;
      if (ctx.islandMap[i] !== isl.id + 1 || ctx.sdf[i] <= 0) continue;
      if (shapeDist(sh, cellX(ix), cellZ(iz)) <= 0) ctx.zone[i] = zone;
    }
}

/**
 * The Glass & Light kit round the Conservatory Square: the hot shop (workshop heart) on the
 * square's lee rim with its clutter, the gather ring, prisms between the garden sculptures (each
 * with its caustic), stained screens between the easels, orbs and caustics on the lawns, glass
 * chime lines across the bay lanes, the glass-roof gallery, two rainbows off the bluff, and the
 * story spots. Numbers in DESIGN_CULTURE_SITE; one rng sub-fork per kit piece / story.
 */
function glassAndLight(
  ctx: SiteCtx,
  isl: IslandData,
  plan: SitePlan,
  rng: Rng,
  s: GlassSite,
): StorySpot[] {
  const stories: StorySpot[] = [];
  const story = (kind: string, p: XZ, rotY: number, defs: readonly string[], y = 0): void => {
    stories.push({ kind, islandId: isl.id, pos: { x: p.x, y, z: p.z }, rotY, defs });
  };
  const place = (defId: string, p: XZ, rotY: number, variant: number, pad = true): void => {
    ctx.fixtures.push({ defId, x: p.x, z: p.z, rotY, islandId: isl.id, variant });
    const r = FIXTURE_RADIUS[defId];
    addShape(ctx, isl, discShape(p.x, p.z, r), true);
    if (pad) addPad(ctx, isl, discShape(p.x, p.z, r + 0.2), FLATTEN.discMargin);
  };
  /** Flat light patch: walkable (not path-blocking), but nothing grows or stands on it. */
  const caustic = (p: XZ, rotY: number, variant: number): void => {
    ctx.fixtures.push({ defId: 'causticDecal', x: p.x, z: p.z, rotY, islandId: isl.id, variant });
    addShape(ctx, isl, discShape(p.x, p.z, 0.55), false);
    addPad(ctx, isl, discShape(p.x, p.z, 0.6), FLATTEN.discMargin);
  };
  /** Small-prop site: on land, high enough, gentle, free. */
  const fits = (
    p: XZ,
    r: number,
    gap: number = C.gap,
    skip: readonly string[] = [],
    maxRelief: number = C.smallRelief,
  ): boolean => {
    const sh = discShape(p.x, p.z, r);
    return (
      onLand(ctx, isl, sh, C.kitShore) &&
      heightAt(ctx.h, p.x, p.z) >= C.minY &&
      relief(ctx, sh) <= maxRelief &&
      freeOf(ctx, isl, sh, gap, skip)
    );
  };
  const qR = s.quad ? S.glade.quadR : 0;
  const qc = s.centre;
  /** First ring candidate round `c` (radii r0..r1, nearest first) passing `ok`. */
  const firstOnRing = (
    c: XZ,
    r0: number,
    r1: number,
    rr: Rng,
    ok: (p: XZ) => boolean,
  ): XZ | null => {
    for (const p of ring(c, r0, r1, 1, 20, rr.range(0, 1))) if (ok(p)) return p;
    return null;
  };
  const isLawn = (p: XZ): boolean => {
    const i = cellOf(ctx, p.x, p.z);
    const z = i >= 0 ? ctx.zone[i] : -1;
    return z === Zone.grass || z === Zone.meadow;
  };

  // ---- the gallery: the pavilion lot nearest the quad gets the faceted glass roof
  // keep-off round the ring lots (the kit only): a kit pad core beside a lot would mix its
  // level under a lot corner (the pad relaxation does not settle a crowded ring)
  for (const li of plan.lots) {
    const l = ctx.lots[li];
    const m = 2 * C.lotKeepOff;
    addShape(ctx, isl, rectShape(l.x, l.z, l.rotY, l.w + m, l.d + m), false);
  }

  const pavilions = ctx.lots
    .map((l, i) => ({ l, i }))
    .filter(({ l }) => l.islandId === isl.id && l.defId === 'galleryPavilion');
  if (pavilions.length) {
    const g = pavilions.reduce((a, b) => (dist(b.l, qc) < dist(a.l, qc) ? b : a));
    ctx.lots[g.i].pin = C.glassPavilionVariant;
  }

  // ---- the hot shop on the quad rim, the lee side first (its smoke drifts off the glade)
  const H = C.hotShop;
  const hr = rng.fork('kit', 0);
  const lee = dirOf(ctx.windDir);
  let shop: { p: XZ; rotY: number } | null = null;
  const shopCand = ring(qc, qR + H.ring[0], qR + H.ring[1], H.step, H.samples, hr.range(0, 1));
  for (const maxRel of H.maxRelief) {
    let bs = Infinity;
    for (const p of shopCand) {
      const toQ = unit(p, qc);
      const rotY = ang(toQ.x, toQ.z);
      const yc = local(p, rotY, 0, H.yardZ);
      const yard = rectShape(yc.x, yc.z, rotY, H.core[0], H.core[1]);
      if (!onLand(ctx, isl, yard, 2) || relief(ctx, yard) > maxRel) continue;
      if (!clear(ctx, isl, yard, H.gap) || lineDist(s.stream, p) < H.yard[0] / 2 + 1) continue;
      const out = unit(qc, p);
      const sc =
        H.distCost * (dist(p, qc) - qR) + (H.leeCost * (1 - (out.x * lee.x + out.z * lee.z))) / 2;
      if (sc < bs) {
        bs = sc;
        shop = { p, rotY };
      }
    }
    if (shop) break;
  }
  let shopP: XZ | null = null;
  if (shop) {
    const { p, rotY } = shop;
    shopP = p;
    const yc = local(p, rotY, 0, H.yardZ);
    const yard = rectShape(yc.x, yc.z, rotY, H.core[0], H.core[1]);
    const heat = hr.int(0, 2);
    ctx.fixtures.push({ defId: 'hotShop', x: p.x, z: p.z, rotY, islandId: isl.id, variant: heat });
    addShape(ctx, isl, rectShape(p.x, p.z, rotY, H.rect[0], H.rect[1]), true);
    // lotMargin: the shop's corners are checked (rect pads, MEMORY gotcha)
    addPad(ctx, isl, yard, FLATTEN.lotMargin);
    paintZone(ctx, isl, yard, Zone.plaza);
    // workshop clutter: blowpipe rack by the furnace, the seconds shelf by the annealer, crates
    const W = C.workshop;
    const at = (xz: readonly number[]): XZ => local(p, rotY, xz[0], xz[1]);
    /** A clutter slot beside the shop: on land, gentle, touching nothing. */
    const slot = (q: XZ, defId: string): boolean => fits(q, FIXTURE_RADIUS[defId], 0.05);
    /** First free slot of `slots` for `defId`: its position and yaw. */
    const firstSlot = (slots: readonly (readonly number[])[], defId: string) => {
      for (const xz of slots) {
        const q = at(xz);
        if (slot(q, defId)) return { q, yaw: rotY + (xz[2] ? Math.PI : 0) };
      }
      return null;
    };
    const rack = firstSlot(W.blowpipeRack, 'blowpipeRack');
    // the clutter stands on the yard pad's plateau (lotMargin core): no pad of its own, whose
    // level would mix into the shop's corners
    if (rack) place('blowpipeRack', rack.q, rack.yaw, 0, false);
    const shelf = firstSlot(W.seconds, 'sampleShelf');
    if (shelf) {
      place('sampleShelf', shelf.q, shelf.yaw, W.secondsVariant, false);
      story('secondsGull', shelf.q, shelf.yaw, ['sampleShelf'], C.secondsGullY);
    }
    const hues = hr.shuffle([0, 1, 2, 3, 4]);
    const nc = hr.int(W.culletCount[0], W.culletCount[1]);
    W.cullet.slice(0, nc).forEach((xz, k) => {
      const q = at(xz);
      if (slot(q, 'culletCrate'))
        place('culletCrate', q, rotY + hr.range(-0.4, 0.4), hues[k], false);
    });
    const cat = C.annealerCat;
    story('annealerCat', local(p, rotY, cat[0], cat[2]), rotY, ['hotShop'], cat[1]);
    const gaffer = local(p, rotY, C.gaffer[0], C.gaffer[2]);
    story('gafferTurn', gaffer, rotY + Math.PI, ['hotShop', 'blowpipeRack']);
    pathLink(plan, local(p, rotY, 0, H.rect[1] / 2 + 2));
  }

  // ---- the gather ring (critique / demonstration circle) on the glade rim, apart from the shop
  const G = C.gather;
  const gr = rng.fork('kit', 3);
  const gR = FIXTURE_RADIUS.gatherRing;
  const gatherOk = (p: XZ): boolean => {
    if (shopP && dist(p, shopP) < G.shopDist) return false;
    const sh = discShape(p.x, p.z, gR + 0.6);
    return (
      onLand(ctx, isl, sh, 2) &&
      heightAt(ctx.h, p.x, p.z) >= C.minY &&
      relief(ctx, sh) <= G.maxRelief &&
      clear(ctx, isl, sh, 0.6)
    );
  };
  // on the glade rim, else just outside the sculpture garden
  const R7 = S.clearing.radius;
  const gp =
    firstOnRing(qc, qR + G.ring[0], qR + G.ring[1], gr, gatherOk) ??
    (s.garden ? firstOnRing(s.garden, R7 + 2, R7 + 10, gr, gatherOk) : null);
  if (gp) {
    place('gatherRing', gp, gr.range(0, Math.PI * 2), 0, false);
    addPad(ctx, isl, discShape(gp.x, gp.z, gR + 0.6), FLATTEN.discMargin);
    story('critique', gp, ang(qc.x - gp.x, qc.z - gp.z), ['gatherRing']);
    pathLink(plan, add(gp, unit(gp, qc), gR + 1));
  }

  // ---- prisms between the garden's sculptures (each throws a caustic toward the centre)
  const P = C.prisms;
  const pr = rng.fork('kit', 1);
  const wantPrisms = pr.int(P.count[0], P.count[1]);
  const prisms: { decal: XZ; toC: XZ }[] = [];
  const addPrism = (p: XZ, c: XZ): void => {
    const toC = unit(p, c);
    const v = pr.int(0, 2);
    place('prismSculpture', p, ang(toC.x, toC.z), v);
    const decal = add(p, toC, P.caustic);
    caustic(decal, ang(toC.x, toC.z) + Math.PI / 2, P.causticOf[v]);
    prisms.push({ decal, toC });
  };
  if (s.garden) {
    const g = s.garden;
    const R = S.clearing.radius;
    const kinds: readonly string[] = S.clearing.kinds;
    const sculpt = ctx.fixtures
      .filter((f) => f.islandId === isl.id && kinds.includes(f.defId) && dist(f, g) <= R)
      .map((f) => Math.atan2(f.z - g.z, f.x - g.x))
      .sort((a, b) => a - b);
    // internal gaps: every gap between neighbours but the widest (the entrance toward the quad)
    const gaps = sculpt.map((a, k) => {
      const b = k + 1 < sculpt.length ? sculpt[k + 1] : sculpt[0] + Math.PI * 2;
      return { mid: (a + b) / 2, w: b - a };
    });
    const widest = gaps.reduce((m, x, k) => (x.w > gaps[m].w ? k : m), 0);
    const inner = pr.shuffle(gaps.filter((_, k) => k !== widest));
    for (const gap of inner) {
      if (prisms.length >= wantPrisms) break;
      for (const f of P.ringFrac) {
        const p = add(g, dirOf(gap.mid), R * f);
        // inside the clearing pad (levelled later): no relief cap
        if (!fits(p, FIXTURE_RADIUS.prismSculpture, 0.3, ['clearing'], Infinity)) continue;
        addPrism(p, g);
        break;
      }
    }
  }
  // fallback: just outside the garden, then round the quad (prism + its caustic need the room)
  const prismRings: [XZ | null, number, number][] = [
    [s.garden, S.clearing.radius + P.outRing[0], S.clearing.radius + P.outRing[1]],
    [qc, qR + P.quadRing[0], qR + P.quadRing[1]],
  ];
  for (const [c, r0, r1] of prismRings)
    while (c && prisms.length < wantPrisms) {
      const p = firstOnRing(c, r0, r1, pr, (q) =>
        fits(q, FIXTURE_RADIUS.prismSculpture + P.caustic, C.gap, [], P.outRelief),
      );
      if (!p) break;
      addPrism(p, c);
    }
  if (prisms.length) {
    // the bot with a small prism and its mini rainbow, past the first prism's caustic
    const f = prisms[0];
    story('prismRainbow', add(f.decal, f.toC, C.prismBot), ang(-f.toC.x, -f.toC.z), [
      'prismSculpture',
      'causticDecal',
    ]);
  }

  // ---- stained screens between the easels along the walk, faces alternating east / west
  const SC = C.screens;
  const sr = rng.fork('kit', 2);
  const wantScreens = sr.int(SC.count[0], SC.count[1]);
  const screens: XZ[] = [];
  const sR = FIXTURE_RADIUS.stainedScreen;
  const addScreen = (p: XZ): void => {
    const rotY = (screens.length % 2 ? Math.PI : 0) + sr.range(-0.3, 0.3);
    place('stainedScreen', p, rotY, sr.int(0, 1));
    screens.push(p);
  };
  const nearestK = (p: XZ): number => {
    let best = 0;
    for (let k = 1; k < s.stream.length; k++)
      if (dist(s.stream[k], p) < dist(s.stream[best], p)) best = k;
    return best;
  };
  const easels = ctx.fixtures
    .filter((f) => f.islandId === isl.id && f.defId === 'easel')
    .map((f) => ({ p: { x: f.x, z: f.z }, k: nearestK(f) }))
    .sort((a, b) => a.k - b.k);
  for (let e = 0; e + 1 < easels.length && screens.length < wantScreens; e++) {
    const a = easels[e].p;
    const b = easels[e + 1].p;
    if (dist(a, b) > SC.maxPair || s.stream.length === 0) continue;
    const m = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
    const ts = unit(m, s.stream[nearestK(m)]);
    for (const off of [0.6, 0, 1.2]) {
      const p = add(m, ts, off);
      if (lineDist(s.stream, p) < sR + 0.8 || !fits(p, sR, 0.4, [], SC.maxRelief)) continue;
      addScreen(p);
      break;
    }
  }
  // fallback: round the garden edge, then the quad
  const fallbacks: [XZ | null, number][] = [
    [s.garden, S.clearing.radius],
    [qc, qR],
  ];
  for (const maxRel of [SC.maxRelief])
    for (const [c, r0] of fallbacks) {
      while (c && screens.length < wantScreens) {
        const p = firstOnRing(
          c,
          r0 + SC.ring[0],
          r0 + SC.ring[1],
          sr,
          (q) => screens.every((o) => dist(o, q) > 3) && fits(q, sR + 0.6, C.gap, [], maxRel),
        );
        if (!p) break;
        addScreen(p);
      }
    }

  // ---- glass orbs on the glade lawns, each with its own caustic
  const O = C.orbs;
  const or = rng.fork('kit', 5);
  const wantOrbs = or.int(O.count[0], O.count[1]);
  const orbs: XZ[] = [];
  for (const p of ring(qc, qR + O.ring[0], qR + O.ring[1], 1.5, 20, or.range(0, 1))) {
    if (orbs.length >= wantOrbs) break;
    if (orbs.some((q) => dist(q, p) < O.spacing) || !isLawn(p)) continue;
    if (!fits(p, FIXTURE_RADIUS.glassOrb + 1.0)) continue;
    const v = or.int(0, 2);
    place('glassOrb', p, or.range(0, Math.PI * 2), v);
    const a = or.range(0, Math.PI * 2);
    caustic(add(p, dirOf(a), 0.95), a + Math.PI / 2, O.causticOf[v]);
    orbs.push(p);
  }

  // ---- the bot holding a vase to the sun over one big amber caustic
  const V = C.vase;
  const vr = rng.fork('story', 4);
  const vp = firstOnRing(
    qc,
    qR + V.ring[0],
    qR + V.ring[1],
    vr,
    (p) => isLawn(p) && fits(p, 1.6, C.gap, [], V.maxRelief),
  );
  if (vp) {
    const a = vr.range(0, Math.PI * 2);
    caustic(add(vp, dirOf(a), V.caustic), a + Math.PI / 2, V.causticVariant);
    story('vaseToSun', vp, a, ['causticDecal']);
    // the bot's spot: walkable, but kept clear of the later kit
    addShape(ctx, isl, discShape(vp.x, vp.z, 0.6), false);
  }

  // ---- shards sorted in rainbow order: a cullet crate, the five caustics in hue order
  const SH = C.shards;
  const shr = rng.fork('story', 3);
  const rowLen = SH.first + 4 * SH.spacing + 0.5;
  let shards: { p: XZ; rotY: number } | null = null;
  // beside the hot shop, else on the glade rim; the row runs outward
  const phase = shr.range(0, 1);
  const shardRings: [XZ | null, number][] = [
    [shopP, SH.shopR],
    [qc, qR + 1],
  ];
  for (const [c, r0] of shardRings) {
    if (!c || shards) continue;
    for (const p of ring(c, r0 + SH.ring[0], r0 + SH.ring[1], 1, 16, phase)) {
      const d = unit(c, p);
      const rotY = ang(d.x, d.z);
      const mid = add(p, d, rowLen / 2 - 0.4);
      const strip = rectShape(mid.x, mid.z, rotY, 1.4, rowLen + 0.8);
      if (!onLand(ctx, isl, strip, 1.5) || relief(ctx, strip) > SH.maxRelief) continue;
      if (heightAt(ctx.h, p.x, p.z) < C.minY || !freeOf(ctx, isl, strip, 0.3)) continue;
      shards = { p, rotY };
      break;
    }
  }
  if (shards) {
    const { p, rotY } = shards;
    const d = dirOf(rotY);
    const mid = add(p, d, rowLen / 2 - 0.4);
    addPad(ctx, isl, rectShape(mid.x, mid.z, rotY, 1.4, rowLen + 0.8), FLATTEN.discMargin);
    place('culletCrate', p, rotY + 0.7, shr.int(0, 4));
    for (let k = 0; k < 5; k++) caustic(add(p, d, SH.first + k * SH.spacing), rotY, k);
    story('rainbowShards', add(p, d, SH.first + 2 * SH.spacing), rotY, [
      'culletCrate',
      'causticDecal',
    ]);
  }

  // ---- the fox staring at an orb at the forest edge (round the mushroom grove, else the garden)
  const F = C.foxOrb;
  const fr = rng.fork('story', 2);
  let fox: { p: XZ; c: XZ } | null = null;
  const foxRings: [XZ | null, number][] = [
    [s.grove, 0],
    [s.garden, S.clearing.radius - F.ring[0] + 2],
    [qc, qR + 4],
  ];
  for (const [fc, r0] of foxRings) {
    if (!fc || fox) continue;
    const p = firstOnRing(fc, r0 + F.ring[0], r0 + F.ring[1], fr, (q) => {
      if (!fits(q, FIXTURE_RADIUS.glassOrb + 0.2)) return false;
      return fits(add(q, unit(fc, q), F.fox), 0.5, 0.2);
    });
    if (p) fox = { p, c: fc };
  }
  if (fox) {
    place('glassOrb', fox.p, fr.range(0, Math.PI * 2), F.orbVariant);
    const out = unit(fox.c, fox.p);
    story('foxOrb', add(fox.p, out, F.fox), ang(-out.x, -out.z), ['glassOrb']);
  }

  // ---- glass chime lines (bunting v3) across the bay lanes, poles off the lane
  const CH = C.chimes;
  const cr = rng.fork('kit', 6);
  const wantChimes = cr.int(CH.count[0], CH.count[1]);
  const lines: XZ[] = [];
  const pole = (q: XZ): boolean =>
    onIsland(ctx, isl, q.x, q.z) &&
    heightAt(ctx.h, q.x, q.z) >= C.minY &&
    freeOf(ctx, isl, discShape(q.x, q.z, CH.poleR), 0.2);
  for (const lane of cr.shuffle([...ctx.lanes[isl.id]])) {
    if (lines.length >= wantChimes) break;
    for (let k = 1; k + 1 < lane.length; k++) {
      const p = lane[k];
      if (dist(p, qc) < qR + CH.start || lines.some((q) => dist(q, p) < CH.spacing)) continue;
      const t = unit(lane[k - 1], lane[k + 1]);
      const nrm = { x: -t.z, z: t.x };
      const a = add(p, nrm, CH.half);
      const b = add(p, nrm, -CH.half);
      if (!pole(a) || !pole(b)) continue;
      if (Math.abs(heightAt(ctx.h, a.x, a.z) - heightAt(ctx.h, b.x, b.z)) > CH.maxStep) continue;
      const rotY = ang(t.x, t.z);
      ctx.fixtures.push({
        defId: 'bunting',
        x: p.x,
        z: p.z,
        rotY,
        islandId: isl.id,
        variant: CH.variant,
      });
      addShape(ctx, isl, discShape(a.x, a.z, CH.poleR), true);
      addShape(ctx, isl, discShape(b.x, b.z, CH.poleR), true);
      addShape(ctx, isl, rectShape(p.x, p.z, rotY, 2 * CH.half, CH.cordDepth), false);
      lines.push(p);
      break;
    }
  }

  // ---- rainbows in the sea off the bluff foot (the spray rainbows of the waterfalls), their
  // plane along the shore, near the stream mouth; pivot at the waterline (FLOATING_FIXTURES).
  // D-060: two of them, the second at least `rainbows.minSep` from the first.
  const RB = C.rainbow;
  const mouth = s.stream.length
    ? [s.stream[0], s.stream[s.stream.length - 1]].reduce((a, b) =>
        sdfAt(ctx, b.x, b.z) < sdfAt(ctx, a.x, a.z) ? b : a,
      )
    : { x: isl.cx, z: isl.cz };
  const harbour = [
    ...ctx.docks.filter((d) => d.islandId === isl.id),
    ...ctx.moorings.filter((m) => m.islandId === isl.id),
  ];
  /** Lowest point of the arc's underside above `s` along it (0 past the inner band). */
  const under = (t: number): number =>
    Math.abs(t) < RB.inner ? Math.sqrt(RB.inner * RB.inner - t * t) : 0;
  const arcs: { c: XZ; th: number; sc: number }[] = [];
  const [bx0, bx1] = gridRange(isl.minX - 16, isl.maxX + 16);
  const [bz0, bz1] = gridRange(isl.minZ - 16, isl.maxZ + 16);
  for (let iz = bz0; iz <= bz1; iz += RB.step)
    for (let ix = bx0; ix <= bx1; ix += RB.step) {
      const c = { x: cellX(ix), z: cellZ(iz) };
      const sd = sdfAt(ctx, c.x, c.z);
      if (sd < RB.offshore[0] || sd > RB.offshore[1]) continue;
      if (harbour.some((d) => dist(d, c) < RB.dockClear)) continue;
      for (let k = 0; k < RB.angles; k++) {
        const th = (k / RB.angles) * Math.PI;
        const d = dirOf(th);
        let ok = true;
        for (let t = -RB.half; t <= RB.half + 1e-6 && ok; t += 1) {
          const g = heightAt(ctx.h, c.x + d.x * t, c.z + d.z * t);
          ok = g <= Math.max(RB.legMaxY, under(t) - RB.clearance);
        }
        if (!ok) continue;
        const a = add(c, d, RB.half);
        const b = add(c, d, -RB.half);
        const sc =
          RB.mouthCost * dist(c, mouth) +
          RB.alongCost * Math.abs(sdfAt(ctx, a.x, a.z) - sdfAt(ctx, b.x, b.z));
        arcs.push({ c, th, sc });
      }
    }
  arcs.sort((a, b) => a.sc - b.sc);
  const placedArcs: XZ[] = [];
  for (const arc of arcs) {
    if (placedArcs.length >= C.rainbows.count) break;
    if (placedArcs.some((p) => dist(p, arc.c) < C.rainbows.minSep)) continue;
    ctx.fixtures.push({
      defId: 'rainbowArc',
      x: arc.c.x,
      z: arc.c.z,
      // local x (the arc's span) along dirOf(th)
      rotY: arc.th + Math.PI / 2,
      islandId: isl.id,
      variant: 0,
    });
    placedArcs.push(arc.c);
  }
  return stories;
}
