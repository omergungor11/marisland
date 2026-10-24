/**
 * Coding island plan (M14b §2.2, TASK-363, D-029): a modern tech campus on the Millbrook plateau.
 * The archetype supplies the shape and its anchors (knolls, pond, patch grid); everything placed
 * here is the theme's:
 * - wind turbines on the knolls (plus the highest free plateau spots up to `turbine.count`),
 *   heights by rank: the highest stands the tallest (P2, one dominant vertical);
 * - Tech Park at the pond: the dip is filled, a mown lawn quad with the pond as a kerbed
 *   reflecting pool on blue-grey pavers, a perimeter walk, devOffice / devPod rows facing it,
 *   trees in rows across the quad ends, clipped hedges, bike racks;
 * - Server Yard (serverShed row on concrete) and Hack Garden (hedged outdoor desks);
 * - Solar farm: every profile patch rectangle trimmed to the clean ground left over, as a `solar`
 *   district (render lays the panel rows) on gravel; the remaining patch ground becomes lawn;
 * - a lee dock;
 * - the Wind Gardens culture (M19 TASK-421, `windGardens`): pergola desks, whiteboards and mug
 *   crates on the lawn, a giant duck and rubber ducks in the pools, hammocks at the turbine feet
 *   (the first is the nap), a kite field on the windward side, `{ }` hedges round the Hack
 *   Garden with a kite stuck on them, the chime pagoda on the tallest turbine, and story spots.
 * The campus frame is the patch grid: `u` along the patch axis, `v` across it. Numbers live in
 * content/themes/coding.ts (`CODING_PLAN`); every random draw comes from `rng` forks.
 */
import { CODING_CULTURE_SITES as CS } from '../../../content/cultures/coding.ts';
import {
  CODING_PLAN as P,
  CODING_RIM_BENCHES,
  CODING_RIM_WALK,
} from '../../../content/themes/coding.ts';
import { THEMES } from '../../../content/themes/index.ts';
import { FIXTURE_RADIUS, FLATTEN, LOT_FOOTPRINT, PATHS } from '../../../content/settlements.ts';
import type { Rng } from '../../../core/rng.ts';
import { smoothstep } from '../../../core/math/index.ts';
import type {
  DistrictData,
  DistrictKind,
  FieldPatchData,
  IslandData,
  Polyline,
  StorySpot,
  XZ,
} from '../../types.ts';
import { PATCHWORK } from '../../../content/islands.ts';
import { heightAt, Zone } from '../../types.ts';
import { cellX, cellZ, gridRange } from '../grid.ts';
import { rimSamples, rimWalkway, slopeAtXZ, type RimWalkway } from '../rim-walkway.ts';
import { addCellPath, gridAStar, pathStep, resample } from '../paths.ts';
import { slopeAtCell } from '../zones.ts';
import {
  add,
  addPad,
  addShape,
  cellOf,
  cellOnLand,
  cellPos,
  clear,
  discShape,
  dist,
  dockWithLink,
  findDock,
  islandWindow,
  linkLandmark,
  linkLot,
  nearestPathCell,
  newPlan,
  onIsland,
  onLand,
  placeNear,
  pushFixture,
  pushLandmark,
  rectShape,
  relief,
  segDist,
  shapesOverlap,
  seedHub,
  sdfAt,
  shapeDist,
  stepCtx,
  tryLot,
  unit,
  type Shape,
  type SiteCtx,
  type SitePlan,
} from '../sites.ts';
import type { ThemePlanner } from './types.ts';

/** Campus frame: origin + unit axes (u along the patch axis, v across it). */
interface Frame {
  o: XZ;
  a: number;
  U: XZ;
  V: XZ;
}

const frameAt = (o: XZ, a: number): Frame => ({
  o,
  a,
  U: { x: Math.cos(a), z: Math.sin(a) },
  V: { x: -Math.sin(a), z: Math.cos(a) },
});
const at = (f: Frame, u: number, v: number): XZ => ({
  x: f.o.x + f.U.x * u + f.V.x * v,
  z: f.o.z + f.U.z * u + f.V.z * v,
});
/** Rect of half extents (hu along U, hv along V) centred at frame (u, v). */
const frameRect = (f: Frame, u: number, v: number, hu: number, hv: number): Shape => {
  const c = at(f, u, v);
  return rectShape(c.x, c.z, f.a, hv * 2, hu * 2);
};
/** rotY whose facing is +U (s = 0), +V (1), −U (2), −V (3). */
const facing = (f: Frame, s: number): number => f.a + (s * Math.PI) / 2;
const district = (isl: IslandData, kind: DistrictKind, sh: Shape, a: number): DistrictData => ({
  islandId: isl.id,
  kind,
  x: sh.x,
  z: sh.z,
  rotY: a,
  w: sh.hw * 2,
  d: sh.hd * 2,
});

/** Zone every land sample of this island inside `sh` (grown by `grow`) as `zone`. */
function paint(ctx: SiteCtx, isl: IslandData, sh: Shape, zone: number, grow = 0): void {
  const R = Math.hypot(sh.hw, sh.hd) + grow + 2;
  const [x0, x1] = gridRange(sh.x - R, sh.x + R);
  const [z0, z1] = gridRange(sh.z - R, sh.z + R);
  for (let iz = z0; iz <= z1; iz++)
    for (let ix = x0; ix <= x1; ix++) {
      const i = iz * ctx.n + ix;
      if (ctx.islandMap[i] !== isl.id + 1 || ctx.sdf[i] <= 0) continue;
      if (shapeDist(sh, cellX(ix), cellZ(iz)) <= grow) ctx.zone[i] = zone;
    }
}

/**
 * Fill the pond dip up to the surrounding plateau (mean land height on the `fillRing` annulus),
 * full inside `fill[0]`, blended out to `fill[1]`. Slope zones left on the old banks become lawn.
 */
function fillPond(ctx: SiteCtx, isl: IslandData, pond: XZ): void {
  const [r0, r1] = P.park.fill;
  const [q0, q1] = P.park.fillRing;
  const [x0, x1] = gridRange(pond.x - q1, pond.x + q1);
  const [z0, z1] = gridRange(pond.z - q1, pond.z + q1);
  let sum = 0;
  let cnt = 0;
  for (let iz = z0; iz <= z1; iz++)
    for (let ix = x0; ix <= x1; ix++) {
      const i = iz * ctx.n + ix;
      const d = Math.hypot(cellX(ix) - pond.x, cellZ(iz) - pond.z);
      if (d < q0 || d > q1 || ctx.islandMap[i] !== isl.id + 1 || ctx.h.data[i] <= 0) continue;
      sum += ctx.h.data[i];
      cnt++;
    }
  if (cnt === 0) return;
  const T = sum / cnt;
  for (let iz = z0; iz <= z1; iz++)
    for (let ix = x0; ix <= x1; ix++) {
      const i = iz * ctx.n + ix;
      if (ctx.islandMap[i] !== isl.id + 1 || ctx.sdf[i] <= 0 || ctx.h.data[i] <= 0) continue;
      const d = Math.hypot(cellX(ix) - pond.x, cellZ(iz) - pond.z);
      if (d > r1) continue;
      const w = 1 - smoothstep(r0, r1, d);
      const y = ctx.h.data[i];
      if (y < T) ctx.h.data[i] = y + (T - y) * w;
      const z = ctx.zone[i];
      if (
        w > 0 &&
        (z === Zone.rock || z === Zone.cliff || z === Zone.sandDry || z === Zone.sandWet)
      )
        ctx.zone[i] = Zone.grass;
    }
}

/** Pool kerb: straight pieces along each side, corner pieces at the corners (outward facing). */
function poolKerb(ctx: SiteCtx, isl: IslandData, f: Frame, hu: number, hv: number): void {
  const fixture = (p: XZ, rotY: number, variant: number): void => {
    pushFixture(ctx, isl, 'reflectingPoolEdge', p, rotY);
    ctx.fixtures[ctx.fixtures.length - 1].variant = variant;
  };
  // corners: (+,+) faces +V, (−,+) −U, (−,−) −V, (+,−) +U (arms run back along both edges)
  const corners: [number, number, number][] = [
    [1, 1, 1],
    [-1, 1, 2],
    [-1, -1, 3],
    [1, -1, 0],
  ];
  for (const [su, sv, s] of corners) fixture(at(f, su * hu, sv * hv), facing(f, s), 1);
  // sides: [length, along-axis is U?, offset sign, facing]
  const sides: [number, boolean, number, number][] = [
    [hu * 2, true, 1, 1],
    [hu * 2, true, -1, 3],
    [hv * 2, false, 1, 0],
    [hv * 2, false, -1, 2],
  ];
  for (const [L, alongU, sgn, s] of sides) {
    const n = Math.max(1, Math.ceil((L - 2.4) / 2));
    for (let k = 0; k < n; k++) {
      const t = (k - (n - 1) / 2) * 2;
      const p = alongU ? at(f, t, sgn * hv) : at(f, sgn * hu, t);
      fixture(p, facing(f, s), 0);
    }
  }
}

/** Grid A* between two points, added to the network and the island's lanes; its cells. */
function walk(ctx: SiteCtx, isl: IslandData, a: XZ, b: XZ): number[] {
  const s = nearestPathCell(ctx, isl, a);
  const g = nearestPathCell(ctx, isl, b);
  if (s < 0 || g < 0 || s === g) return [];
  const cells = gridAStar({
    ...islandWindow(ctx, isl),
    start: s,
    goal: g,
    step: pathStep({ ...stepCtx(ctx, isl), stair: false }),
    hScale: 2,
  });
  if (!cells || cells.length < 2) return [];
  addCellPath(ctx.net, cells, isl.id, 'path');
  ctx.lanes[isl.id].push(
    resample(
      cells.map((c) => cellPos(ctx, c)),
      1,
      false,
    ),
  );
  return cells;
}

/**
 * Best site for a `size` (u, v) rect on a ring around `c` (deterministic candidate order, phase
 * from `phase`): on land, flat, clear of everything placed so far. Null when nothing fits.
 */
function siteOnRing(
  ctx: SiteCtx,
  isl: IslandData,
  f: Frame,
  size: readonly [number, number],
  ring: readonly [number, number],
  maxRelief: number,
  minShore: number,
  phase: number,
): Frame | null {
  let best: Frame | null = null;
  let bs = Infinity;
  for (let r = ring[0]; r <= ring[1]; r += 2)
    for (let k = 0; k < 24; k++) {
      const ang = phase + (k / 24) * Math.PI * 2;
      const p = add(f.o, { x: Math.cos(ang), z: Math.sin(ang) }, r);
      const g = frameAt(p, f.a);
      const sh = frameRect(g, 0, 0, size[0] / 2, size[1] / 2);
      if (!onLand(ctx, isl, sh, minShore)) continue;
      const rel = relief(ctx, sh);
      if (rel > maxRelief || !clear(ctx, isl, sh, 2)) continue;
      const s = rel + 0.03 * r;
      if (s < bs) {
        bs = s;
        best = g;
      }
    }
  return best;
}

/** Largest all-true axis rectangle of a row-major `rows × cols` mask: [r0, c0, r1, c1] or null. */
function maxRect(
  mask: Uint8Array,
  rows: number,
  cols: number,
): [number, number, number, number] | null {
  const hgt = new Int32Array(cols);
  let best: [number, number, number, number] | null = null;
  let area = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) hgt[c] = mask[r * cols + c] ? hgt[c] + 1 : 0;
    for (let c = 0; c < cols; c++) {
      let h = Infinity;
      for (let c2 = c; c2 < cols && hgt[c2] > 0; c2++) {
        h = Math.min(h, hgt[c2]);
        const a = h * (c2 - c + 1);
        if (a > area) {
          area = a;
          best = [r - h + 1, c, r, c2];
        }
      }
    }
  }
  return best;
}

/**
 * Candidate solar rectangles: the island's profile patches, then the other cells of the same
 * patch grid (PATCHWORK.cell at the patch angle) nearest the island centre first.
 */
function solarCells(
  ctx: SiteCtx,
  isl: IslandData,
  a: number,
): { real: FieldPatchData[]; grid: FieldPatchData[] } {
  const real = ctx.fields.filter((fp) => fp.islandId === isl.id);
  const [cu, cv] = PATCHWORK.cell;
  const fc = Math.cos(a);
  const fs = Math.sin(a);
  const R = isl.reach;
  const grid: FieldPatchData[] = [];
  const u0 = Math.floor((isl.cx * fc + isl.cz * fs - R) / cu);
  const u1 = Math.floor((isl.cx * fc + isl.cz * fs + R) / cu);
  const v0 = Math.floor((-isl.cx * fs + isl.cz * fc - R) / cv);
  const v1 = Math.floor((-isl.cx * fs + isl.cz * fc + R) / cv);
  for (let V = v0; V <= v1; V++)
    for (let U = u0; U <= u1; U++) {
      const uc = (U + 0.5) * cu;
      const vc = (V + 0.5) * cv;
      const x = uc * fc - vc * fs;
      const z = uc * fs + vc * fc;
      if (real.some((fp) => Math.hypot(fp.x - x, fp.z - z) < 1)) continue;
      if (!onIsland(ctx, isl, x, z)) continue;
      grid.push({ islandId: isl.id, x, z, rotY: a, w: cv, d: cu, color: 0 });
    }
  grid.sort(
    (p, q) => Math.hypot(p.x - isl.cx, p.z - isl.cz) - Math.hypot(q.x - isl.cx, q.z - isl.cz),
  );
  return { real, grid };
}

/** A trimmed, lattice-snapped solar block: its rect, the rotation of its rows and its area (u²). */
interface SolarBlock {
  sh: Shape;
  rot: number;
  area: number;
}

/**
 * The solar block one patch rectangle yields: trimmed to clean, free, flat ground and snapped to the
 * panel lattice; null when no block of the minimum lattice fits. Pure (reads the plan so far).
 */
function solarBlock(ctx: SiteCtx, isl: IslandData, fp: FieldPatchData): SolarBlock | null {
  const S = P.solar;
  const f = frameAt({ x: fp.x, z: fp.z }, fp.rotY);
  const rows = Math.floor(fp.w / S.step); // across (v)
  const cols = Math.floor(fp.d / S.step); // along (u)
  const mask = new Uint8Array(rows * cols);
  const uOf = (c: number): number => -fp.d / 2 + (c + 0.5) * S.step;
  const vOf = (r: number): number => -fp.w / 2 + (r + 0.5) * S.step;
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const p = at(f, uOf(c), vOf(r));
      if (!onIsland(ctx, isl, p.x, p.z) || !cellOnLand(ctx, isl, p.x, p.z)) continue;
      if (heightAt(ctx.h, p.x, p.z) < S.minHeight || sdfAt(ctx, p.x, p.z) < S.minShore) continue;
      const i = cellOf(ctx, p.x, p.z);
      if (slopeAtCell(ctx.h, i % ctx.n, Math.floor(i / ctx.n)) > S.maxSlope) continue;
      let free = true;
      for (const o of ctx.shapes[isl.id])
        if (shapeDist(o, p.x, p.z) < S.clear) {
          free = false;
          break;
        }
      if (free)
        for (const lane of ctx.lanes[isl.id]) {
          for (const q of lane)
            if (dist(q, p) < PATHS.halfWidth + S.clear) {
              free = false;
              break;
            }
          if (!free) break;
        }
      if (free) mask[r * cols + c] = 1;
    }
  const m = maxRect(mask, rows, cols);
  if (!m) return null;
  const [r0, c0, r1, c1] = m;
  // snap to the render lattice (rows along the district depth every `lattice.len`,
  // `lattice.pitch` apart, edge margin `lattice.margin`), rows along whichever side holds more
  // panels, so the rows fill the block instead of leaving a ragged rim
  const L = S.lattice;
  const fit = (along: number, across: number): [number, number] => [
    Math.floor((along - 2 * S.inset - 2 * L.margin) / L.len),
    Math.floor((across - 2 * S.inset - 2 * L.margin - L.depth) / L.pitch) + 1,
  ];
  const lu = (c1 - c0 + 1) * S.step;
  const lv = (r1 - r0 + 1) * S.step;
  const [sa, ra] = fit(lu, lv);
  const [sb, rb] = fit(lv, lu);
  const alongU = sa * ra >= sb * rb;
  const [segs, rowsN] = alongU ? [sa, ra] : [sb, rb];
  if (segs < S.minLattice[0] || rowsN < S.minLattice[1]) return null;
  const hAlong = (segs * L.len + 2 * L.margin) / 2;
  const hAcross = ((rowsN - 1) * L.pitch + L.depth + 2 * L.margin) / 2;
  const c = at(f, (uOf(c0) + uOf(c1)) / 2, (vOf(r0) + vOf(r1)) / 2);
  const rot = alongU ? fp.rotY : fp.rotY + Math.PI / 2;
  const sh = rectShape(c.x, c.z, rot, hAcross * 2, hAlong * 2);
  return { sh, rot, area: sh.hw * sh.hd * 4 };
}

/**
 * Solar districts: every patch rectangle of this island trimmed to clean, free, flat ground and
 * snapped to the panel lattice; other cells of the patch grid while the farm is below `minArea`.
 * R3-12 (D-062, M22): only the largest `keep` share of the blocks stays; the rest of the patch
 * ground turns to lawn, which is the room the pinwheel meadow, glyph bed and nap grove take.
 */
function solarFarm(ctx: SiteCtx, isl: IslandData, plan: SitePlan, a: number): Shape[] {
  const S = P.solar;
  const out: Shape[] = [];
  const { real, grid } = solarCells(ctx, isl, a);
  // dry run: the blocks the full farm would have, to rank them (no obstacles added yet)
  const ranked: { fp: FieldPatchData; area: number }[] = [];
  let area = 0;
  for (const fp of [...real, ...grid]) {
    if (grid.includes(fp) && area >= S.minArea) break;
    const b = solarBlock(ctx, isl, fp);
    if (!b) continue;
    ranked.push({ fp, area: b.area });
    area += b.area;
  }
  const keep = new Set(
    ranked
      .map((r, i) => ({ r, i }))
      .sort((p, q) => q.r.area - p.r.area || p.i - q.i)
      .slice(0, Math.max(1, Math.ceil(ranked.length * S.keep)))
      .map((x) => x.r.fp),
  );
  for (const { fp } of ranked) {
    if (!keep.has(fp)) continue;
    const b = solarBlock(ctx, isl, fp);
    if (!b) continue;
    addShape(ctx, isl, b.sh, true);
    paint(ctx, isl, b.sh, Zone.field, 0.5);
    plan.districts.push(district(isl, 'solar', b.sh, b.rot));
    out.push(b.sh);
  }
  return out;
}

export const planCoding: ThemePlanner = ({ ctx, isl, rng, sIdx }) => {
  const pond = isl.anchors.pond;
  if (!pond) return null;
  // patches are solar ground now, not crops: lots may stand on them (the farm planner kept off)
  const lc: SiteCtx = { ...ctx, fields: ctx.fields.filter((f) => f.islandId !== isl.id) };
  const centre = { x: isl.cx, z: isl.cz };
  const a = ctx.fields.find((fp) => fp.islandId === isl.id)?.rotY ?? 0;

  // ---- Tech Park frame: at the pond, nudged inland when the pond sits near the coast
  const K = P.park;
  const [lu, lv] = K.lawn;
  const cu = lu + K.walk;
  const cv = lv + K.walk;
  let f = frameAt(pond, a);
  for (const t of K.shift) {
    const g = frameAt(add(pond, unit(pond, centre), t), a);
    const core = frameRect(g, 0, 0, cu + 2, cv + 2);
    if (onLand(ctx, isl, core, 3, 1) && sdfAt(ctx, g.o.x, g.o.z) >= 10) {
      f = g;
      break;
    }
    f = g;
  }
  fillPond(ctx, isl, pond);
  const plan = newPlan('campus', f.o);

  // ---- wind turbines on the knolls (heights assigned by rank at the end)
  const T = P.turbine;
  const turbines: number[] = [];
  const addTurbine = (p: XZ, rotY: number): void => {
    // obstacle + flatten pad from LANDMARKS.windTurbine (= T.radius / T.flatten)
    const li = pushLandmark(ctx, isl, 'windTurbine', p, rotY);
    plan.landmarks.push(li);
    turbines.push(li);
  };
  const turbineSpec = THEMES[isl.theme].landmarks;
  for (const key of Object.keys(turbineSpec).sort()) {
    const k = isl.anchors[key];
    if (!k || turbines.length >= T.count) continue;
    if (!onLand(ctx, isl, discShape(k.x, k.z, 3), 3)) continue;
    addTurbine(k, k.rotY);
  }

  // ---- Tech Park: lawn quad, central paved plaza between twin reflecting pools, perimeter walk
  const lawn = frameRect(f, 0, 0, lu, lv);
  addShape(ctx, isl, lawn, true);
  addPad(ctx, isl, frameRect(f, 0, 0, cu, cv), FLATTEN.discMargin);
  if (dist(f.o, pond) > 3)
    addPad(ctx, isl, discShape(pond.x, pond.z, K.fill[0]), FLATTEN.discMargin);
  paint(ctx, isl, lawn, Zone.grass, 1);
  const [pu, pv] = K.paving;
  paint(ctx, isl, frameRect(f, 0, 0, pu / 2, pv / 2), Zone.plaza);
  const [qu, qv] = K.pool;
  for (const su of [-1, 1]) {
    const pf = frameAt(at(f, su * K.poolU, 0), a);
    paint(ctx, isl, frameRect(pf, 0, 0, qu / 2, qv / 2), Zone.crater);
    poolKerb(ctx, isl, pf, qu / 2, qv / 2);
  }
  plan.plaza = { x: f.o.x, z: f.o.z, r: K.plazaR };
  plan.districts.push(district(isl, 'quad', lawn, a));
  const corners = [at(f, -cu, -cv), at(f, cu, -cv), at(f, cu, cv), at(f, -cu, cv)];
  const walkCells: number[] = [];
  for (let k = 0; k < 4; k++) walkCells.push(...walk(ctx, isl, corners[k], corners[(k + 1) % 4]));
  // trees in rows across both quad ends, clipped hedges along the long edges
  // M22 C13: the quad-end trees wear fairy-light wreaths (variant k of the wreath dresses tree variant k)
  let treeN = 0;
  for (const su of [-1, 1])
    for (const v of K.treeV) {
      const tp = at(f, su * (lu - K.treeInset), v);
      pushFixture(ctx, isl, 'roundTree', tp, a);
      ctx.fixtures[ctx.fixtures.length - 1].variant = treeN % 3;
      wreath(ctx, isl, tp, a, treeN % 3);
      treeN++;
    }
  // M22 R3-12 warm park: a lantern post at each corner of the perimeter walk
  for (const su of [-1, 1])
    for (const sv of [-1, 1])
      pushFixture(
        ctx,
        isl,
        'lanternPost',
        at(f, su * (cu + CS.m22.lanternCorner), sv * (cv + CS.m22.lanternCorner)),
        a,
      );
  for (const u of K.hedgeU)
    for (const sv of [-1, 1]) {
      pushFixture(ctx, isl, 'hedge', at(f, u, sv * (lv - K.hedgeInset)), facing(f, 1));
      ctx.fixtures[ctx.fixtures.length - 1].variant = 0;
    }
  // hub: the walk sample nearest the middle of the quad end facing the island centre (on the
  // walk, so the hub and everything that links to the walk share one component)
  const endU = (centre.x - f.o.x) * f.U.x + (centre.z - f.o.z) * f.U.z >= 0 ? 1 : -1;
  let hub = at(f, endU * cu, 0);
  let hd = Infinity;
  for (const c of walkCells) {
    const q = cellPos(ctx, c);
    const d = dist(q, at(f, endU * cu, 0));
    if (d < hd) {
      hd = d;
      hub = q;
    }
  }
  // without a walkable hub sample the first link seeds the network
  seedHub(ctx, isl, plan, hub);

  // office rows facing the quad (+v row faces −V, −v row faces +V)
  const lots: number[] = [];
  for (const [ri, sv] of [
    [0, 1],
    [1, -1],
  ] as const) {
    const rotY = facing(f, sv > 0 ? 3 : 1);
    K.rows[ri].forEach((def0, k) => {
      for (const def of def0 === 'devOffice' ? ['devOffice', 'devPod'] : [def0]) {
        const d = LOT_FOOTPRINT[def][1];
        const p = at(f, K.slots[k], sv * (cv + K.rowGap + d / 2));
        const li = tryLot(lc, isl, def, p, rotY, sIdx, {
          minShore: K.minShore,
          maxRelief: K.maxRelief,
        });
        if (li >= 0) {
          lots.push(li);
          break;
        }
      }
    });
    // bike racks at the row ends
    for (const su of [-1, 1]) {
      const p = at(f, su * (K.slots[2] + 5), sv * (cv + K.rowGap + 1));
      if (
        onLand(ctx, isl, discShape(p.x, p.z, 0.8), 3) &&
        clear(ctx, isl, discShape(p.x, p.z, 0.8), 0.4)
      )
        pushFixture(ctx, isl, 'bikeRack', p, rotY);
    }
  }

  // ---- solar farm on the patches the park left (before the yard / garden: the T0 signature
  // gets the room, the small districts fit around it)
  const solar = solarFarm(ctx, isl, plan, a);

  // ---- Server Yard: a serverShed row on a concrete pad, facing the park
  const yr = rng.fork('yard');
  const Y = P.yard;
  const yf = siteOnRing(ctx, isl, f, Y.size, Y.ring, Y.maxRelief, Y.minShore, yr.range(0, 6.28));
  if (yf) {
    const toPark = (f.o.x - yf.o.x) * yf.V.x + (f.o.z - yf.o.z) * yf.V.z >= 0 ? 1 : 3;
    for (const u of Y.slots) {
      const li = tryLot(
        lc,
        isl,
        'serverShed',
        at(yf, u, toPark === 1 ? -0.6 : 0.6),
        facing(yf, toPark),
        sIdx,
        {
          minShore: Y.minShore,
          maxRelief: Y.maxRelief + 1,
        },
      );
      if (li >= 0) lots.push(li);
    }
    const yard = frameRect(yf, 0, 0, Y.size[0] / 2, Y.size[1] / 2);
    paint(ctx, isl, yard, Zone.path);
    addShape(ctx, isl, yard, false);
    plan.districts.push(district(isl, 'yard', yard, a));
  }

  // ---- Hack Garden: hedged outdoor desks (bench pairs) with a bike rack at the entrance
  let gardenSite: GardenSite | null = null;
  const gr = rng.fork('garden');
  const G = P.garden;
  const gf = siteOnRing(ctx, isl, f, G.size, G.ring, G.maxRelief, G.minShore, gr.range(0, 6.28));
  if (gf) {
    const [gu, gv] = [G.size[0] / 2, G.size[1] / 2];
    const garden = frameRect(gf, 0, 0, gu, gv);
    paint(ctx, isl, garden, Zone.meadow);
    const hedge = (p: XZ, rotY: number, variant = 0): void => {
      pushFixture(ctx, isl, 'hedge', p, rotY);
      ctx.fixtures[ctx.fixtures.length - 1].variant = variant;
    };
    for (const sv of [-1, 1])
      for (const u of [-3.4, -1.15, 1.15, 3.4]) hedge(at(gf, u, sv * (gv - 0.4)), facing(gf, 1));
    // closed end away from the park, entrance toward it
    const entrance = (f.o.x - gf.o.x) * gf.U.x + (f.o.z - gf.o.z) * gf.U.z >= 0 ? 1 : -1;
    // Wind Gardens: the closed end is a `{` (bracketHedge, opening into the garden), the entrance
    // is flanked by two `}` (TASK-421); the bracket's open side is its local +x
    const B = CS.garden;
    hedge(at(gf, -entrance * (gu - 0.4), 0), facing(gf, entrance > 0 ? 1 : 3), B.bracketVariant);
    for (const v of [-B.gateV, B.gateV])
      hedge(at(gf, entrance * (gu - 0.4), v), facing(gf, entrance > 0 ? 3 : 1), B.bracketVariant);
    gardenSite = { f: gf, entrance, gu };
    for (const u of [-2.2, 1.4])
      for (const sv of [-1, 1])
        pushFixture(ctx, isl, 'bench', at(gf, u, sv * 1.0), facing(gf, sv > 0 ? 3 : 1));
    pushFixture(ctx, isl, 'lanternPost', at(gf, -0.4, 0), a);
    pushFixture(
      ctx,
      isl,
      'bikeRack',
      at(gf, entrance * (gu + 1.2), gv - 1.2),
      facing(gf, entrance > 0 ? 0 : 2),
    );
    addShape(ctx, isl, garden, false);
    plan.districts.push(district(isl, 'garden', garden, a));
    plan.links.push({ pin: at(gf, entrance * (gu + 1.4), 0), kind: 'path', done: () => undefined });
  }

  // ---- extra turbines on the highest free plateau spots
  while (turbines.length < T.count) {
    const p = bestSampleHigh(ctx, isl, turbines, f.o);
    if (!p) break;
    addTurbine(p, ctx.windDir + Math.PI);
  }
  // heights by rank: the highest ground gets the tallest turbine (variant 0 = 15 u)
  const variants = Object.values(turbineSpec)
    .map((l) => l.variant)
    .sort((x, y) => x - y);
  turbines
    .slice()
    .sort((x, y) => {
      const lx = ctx.landmarks[x];
      const ly = ctx.landmarks[y];
      return heightAt(ctx.h, ly.x, ly.z) - heightAt(ctx.h, lx.x, lx.z) || x - y;
    })
    .forEach((li, r) => {
      ctx.landmarks[li].variant = variants[Math.min(r, variants.length - 1)] ?? 0;
    });
  // Wind Gardens: the tallest turbine wears the chime pagoda (same tower, same LOD1)
  for (const li of turbines)
    if (ctx.landmarks[li].variant === 0) {
      const m = ctx.landmarks[li];
      m.variant = CS.chimeVariant;
      addShape(ctx, isl, discShape(m.x, m.z, CS.chimeRadius), true);
    }

  // ---- lot floor: devPods around the park
  for (let tries = 0; lots.length < P.minLots && tries < P.minLots; tries++) {
    const li = placeNear(lc, isl, 'devPod', f.o, Math.hypot(cu, cv), P.fill, sIdx);
    if (li < 0) break;
    lots.push(li);
  }

  // ---- lee dock
  const site = findDock(ctx, isl, {
    near: f.o,
    maxDist: isl.reach + P.dock.maxDist,
    prefer: f.o,
    lee: P.dock.lee,
    carve: true,
  });
  dockWithLink(ctx, isl, plan, site, rng.fork('moorings'), {
    rowboats: rng.fork('boats').int(P.dock.rowboats[0], P.dock.rowboats[1]),
    sailboats: 0,
  });

  // ---- the rest of the patch ground becomes lawn
  const [x0, x1] = gridRange(isl.minX, isl.maxX);
  const [z0, z1] = gridRange(isl.minZ, isl.maxZ);
  for (let iz = z0; iz <= z1; iz++)
    for (let ix = x0; ix <= x1; ix++) {
      const i = iz * ctx.n + ix;
      if (ctx.islandMap[i] !== isl.id + 1 || ctx.zone[i] !== Zone.field) continue;
      const x = cellX(ix);
      const z = cellZ(iz);
      if (!solar.some((sh) => shapeDist(sh, x, z) <= 0.5)) ctx.zone[i] = Zone.grass;
    }

  // ---- Wind Gardens culture (M19 TASK-421): before the links, so the paths route round it
  plan.stories = windGardens(ctx, isl, rng.fork('culture'), {
    f,
    hubEnd: endU,
    garden: gardenSite,
    turbines,
    sheds: lots.filter((li) => ctx.lots[li].defId === 'serverShed'),
  });

  // ---- M22 quick wins (TASK-479): pinwheel meadow, hedge glyphs, windsock avenue, nap grove; the
  // pods get weather vanes. After the Wind Gardens kit, so none of it moves; before the links, so
  // the paths route round it
  // the later links run hub → lot doors / turbines / the dock: the big sites keep off those strips
  const targets: XZ[] = [
    ...lots.map((li) => ctx.lots[li] as XZ),
    ...turbines.map((li) => ctx.landmarks[li] as XZ),
    ...(site ? [site.root] : []),
  ];
  plan.stories.push(...m22Quick(ctx, isl, rng.fork('m22'), { f, targets }));
  // every pod wears a vane: the roof colouring picks devPod v2 or v3 (the v0 / v1 roofs) per pod
  for (const li of lots)
    if (ctx.lots[li].defId === 'devPod') ctx.lots[li].pin = CS.m22.vaneVariants;

  // ---- links: turbines (service paths), lots nearest the park first
  for (const li of turbines) linkLandmark(ctx, plan, li, f.o);
  lots.sort((x, y) => dist(ctx.lots[x], f.o) - dist(ctx.lots[y], f.o) || x - y);
  for (const li of lots) linkLot(ctx, plan, li);
  // C18 rim boardwalk + benches (TASK-484): once the footpaths exist (gaps at them)
  plan.finish = (paths) => {
    rimBenches(ctx, isl, rimWalkway(ctx, isl, CODING_RIM_WALK, paths), paths);
  };
  return plan;
};

/**
 * C18 benches (TASK-484): `CODING_RIM_BENCHES.count` timber benches on the inland edge of the rim
 * boardwalk, facing the sea; the first where one fits, the next as far from the placed ones as fits.
 */
function rimBenches(
  ctx: SiteCtx,
  isl: IslandData,
  walk: RimWalkway,
  paths: readonly Polyline[],
): void {
  const B = CODING_RIM_BENCHES;
  const cands: { sh: Shape; rotY: number }[] = [];
  for (const smp of rimSamples(walk, B.step)) {
    const p = add(smp.p, smp.inland, B.back);
    // front (+z) = (cos rotY, sin rotY) points down the normal, out to sea
    const rotY = Math.atan2(-smp.inland.z, -smp.inland.x);
    const sh = rectShape(p.x, p.z, rotY, B.rect[0], B.rect[1]);
    if (!onLand(ctx, isl, sh, 2) || relief(ctx, sh) > B.maxRelief) continue;
    if (slopeAtXZ(ctx, p.x, p.z) > CODING_RIM_WALK.maxSlope) continue;
    if (ctx.shapes[isl.id].some((o) => o.tag !== 'plaza' && shapesOverlap(o, sh, 0.3))) continue;
    if (
      paths.some(
        (pl) =>
          pl.islandId === isl.id &&
          pl.points.some(
            (q, k) =>
              k + 1 < pl.points.length &&
              segDist(p, q, pl.points[k + 1]) < B.rect[0] / 2 + CODING_RIM_WALK.pathGap,
          ),
      )
    )
      continue;
    cands.push({ sh, rotY });
  }
  const placed: Shape[] = [];
  while (placed.length < B.count) {
    let pick: { sh: Shape; rotY: number } | null = null;
    let bd = -1;
    for (const c of cands) {
      if (!placed.length) {
        pick = c;
        break;
      }
      const dmin = Math.min(...placed.map((o) => dist(o, c.sh)));
      if (dmin >= B.apart && dmin > bd) {
        bd = dmin;
        pick = c;
      }
    }
    if (!pick) break;
    placed.push(pick.sh);
    ctx.fixtures.push({
      defId: 'bench',
      x: pick.sh.x,
      z: pick.sh.z,
      rotY: pick.rotY,
      islandId: isl.id,
      variant: B.variant,
    });
    addShape(ctx, isl, pick.sh, false);
  }
}

/** Grid step (samples) of the quick-win site search. */
const SITE_STEP = 2;
/** Clear gap (u) kept round a quick-win site. */
const SITE_GAP = 1;

/** Fairy-light wreath on a tree at `p` (no obstacle of its own; the tree's variant and yaw). */
function wreath(ctx: SiteCtx, isl: IslandData, p: XZ, rotY: number, variant: number): void {
  ctx.fixtures.push({ defId: 'fairyWreath', x: p.x, z: p.z, rotY, islandId: isl.id, variant });
}

/**
 * A free `size` (along U, along V) rect for a frame at angle `a`: the best of the candidates on rings
 * round `from` (on land, flat, clear of everything placed), lowest `score(p, relief, ring)` wins.
 * Null when nothing fits.
 */
function findSite(
  ctx: SiteCtx,
  isl: IslandData,
  from: XZ,
  angles: readonly number[],
  size: readonly [number, number],
  ring: readonly [number, number],
  maxRelief: number,
  minShore: number,
  score: (p: XZ, relief: number, r: number) => number,
): Frame | null {
  let best: Frame | null = null;
  let bs = Infinity;
  const [x0, x1] = gridRange(isl.minX, isl.maxX);
  const [z0, z1] = gridRange(isl.minZ, isl.maxZ);
  for (let iz = z0; iz <= z1; iz += SITE_STEP)
    for (let ix = x0; ix <= x1; ix += SITE_STEP) {
      const i = iz * ctx.n + ix;
      if (ctx.islandMap[i] !== isl.id + 1 || ctx.sdf[i] < minShore) continue;
      const p = { x: cellX(ix), z: cellZ(iz) };
      const r = dist(p, from);
      if (r < ring[0] || r > ring[1]) continue;
      for (const a of angles) {
        const g = frameAt(p, a);
        const sh = frameRect(g, 0, 0, size[0] / 2, size[1] / 2);
        if (!onLand(ctx, isl, sh, minShore)) continue;
        const rel = relief(ctx, sh);
        if (rel > maxRelief || !clear(ctx, isl, sh, SITE_GAP)) continue;
        const sc = score(p, rel, r);
        if (sc < bs) {
          bs = sc;
          best = g;
        }
      }
    }
  return best;
}

/** Hedge-letter strokes (a along the reading direction, b up; 6 u tall, a in [0, w]). */
type Stroke = readonly [readonly [number, number], readonly [number, number]];
const GLYPH_W = { '{': 3.0, '}': 3.0, '<': 3.2, '>': 3.2, '/': 2.4 } as const;
const GLYPH_STROKES: Readonly<Record<keyof typeof GLYPH_W, readonly Stroke[]>> = {
  '{': [
    [
      [3.0, 5.6],
      [1.2, 5.6],
    ],
    [
      [1.2, 5.6],
      [1.2, 3.4],
    ],
    [
      [1.2, 3.0],
      [0.0, 3.0],
    ],
    [
      [1.2, 2.6],
      [1.2, 0.4],
    ],
    [
      [1.2, 0.4],
      [3.0, 0.4],
    ],
  ],
  '}': [
    [
      [0.0, 5.6],
      [1.8, 5.6],
    ],
    [
      [1.8, 5.6],
      [1.8, 3.4],
    ],
    [
      [1.8, 3.0],
      [3.0, 3.0],
    ],
    [
      [1.8, 2.6],
      [1.8, 0.4],
    ],
    [
      [1.8, 0.4],
      [0.0, 0.4],
    ],
  ],
  '<': [
    [
      [3.0, 5.6],
      [0.2, 3.0],
    ],
    [
      [0.2, 3.0],
      [3.0, 0.4],
    ],
  ],
  '>': [
    [
      [0.2, 5.6],
      [3.0, 3.0],
    ],
    [
      [3.0, 3.0],
      [0.2, 0.4],
    ],
  ],
  '/': [
    [
      [0.2, 0.4],
      [2.2, 5.6],
    ],
  ],
};

/**
 * M22 quick wins (TASK-479, WORLD_PLAN §4.3), placed once the Wind Gardens kit stands:
 * - C11 windsock avenue: poles along both long sides of the Tech Park, socks streaming downwind;
 * - C4 pinwheel meadow: a 6 x 8 grid of pinwheels (kite v3) facing the wind on a clover bed;
 * - C9 hedge glyphs: `{ < / > }`, 6 u letters of straight hedge pieces on a clover bed, leaning SE;
 * - C15 nap grove: two rows of hammocks strung between wreathed round trees on the west lobe, mugs,
 *   three `hammockNap` stories (the first nap stays at the turbine foot).
 * Every number is CODING_CULTURE_SITES.m22; every draw comes from a sub-fork of `rng`.
 */
function m22Quick(
  ctx: SiteCtx,
  isl: IslandData,
  rng: Rng,
  s: { f: Frame; targets: readonly XZ[] },
): StorySpot[] {
  const { f } = s;
  const M = CS.m22;
  const K = P.park;
  const stories: StorySpot[] = [];
  const wd = ctx.windDir;
  const fixture = (defId: string, p: XZ, rotY: number, variant: number): void => {
    ctx.fixtures.push({ defId, x: p.x, z: p.z, rotY, islandId: isl.id, variant });
  };
  const bed = (g: Frame, size: readonly [number, number]): void => {
    const sh = frameRect(g, 0, 0, size[0] / 2, size[1] / 2);
    addShape(ctx, isl, sh, true);
    addPad(ctx, isl, sh, FLATTEN.discMargin);
    paint(ctx, isl, sh, Zone.meadow);
  };
  // fixture heading (local +z) that turns local +x along (dx, dz)
  const headingOfX = (dx: number, dz: number): number => Math.atan2(dx, -dz);

  // ---- C11 windsock avenue: both long sides of the park, just outside the perimeter walk
  const W = M.windsocks;
  const cv = K.lawn[1] + K.walk;
  [1, -1].forEach((sv) =>
    W.u.forEach((u, k) => {
      const p = at(f, u, sv * (cv + W.out));
      // the sock streams along local +x: heading = wind + pi/2 points +x downwind
      pushFixture(ctx, isl, 'windsock', p, wd + Math.PI / 2);
      ctx.fixtures[ctx.fixtures.length - 1].variant = (k + (sv > 0 ? 0 : 1)) % 2;
    }),
  );

  // the grove and the glyphs come first (they need the big free rects), the meadow takes what is left
  const park = f.o;
  const centre = { x: isl.cx, z: isl.cz };
  // straight strips hub → every lot / turbine / the dock, kept clear while the sites are searched
  // (the links route later; a bed across a neck of the plateau would cut the dock off)
  const strips = s.targets.map((t) => {
    const len = dist(park, t);
    const g = frameAt(park, Math.atan2(t.z - park.z, t.x - park.x));
    return frameRect(g, len / 2, 0, len / 2, M.corridor / 2);
  });
  ctx.shapes[isl.id].push(...strips);

  // ---- C15 nap grove: hammocks strung between wreathed round trees, west lobe (the layouts are
  // tried in order: 2 rows of 3, then 3 rows of 2 hammocks)
  const G = M.grove;
  for (const [rows, cols] of G.layouts) {
    const gw = cols * G.pitchU + 2.4;
    const gd = rows * G.pitchV + 1.6;
    const ng = findSite(
      ctx,
      isl,
      centre,
      [0, Math.PI / 2],
      [gw, gd],
      [0, isl.reach],
      G.maxRelief,
      G.minShore,
      (p, rel) => p.x + 3 * rel,
    );
    if (!ng) continue;
    bed(ng, [gw, gd]);
    const gr = rng.fork('grove');
    let naps = 0;
    let n = 0;
    for (let r = 0; r < rows; r++) {
      const v = (r - (rows - 1) / 2) * G.pitchV;
      // alternate rows face away from each other: hammock yaw +V / -V
      const yaw = facing(ng, r % 2 === 0 ? 1 : 3);
      for (let j = 0; j <= cols; j++) {
        const tp = at(ng, (j - cols / 2) * G.pitchU + gr.range(-0.2, 0.2), v + gr.range(-0.2, 0.2));
        const ty = gr.range(0, Math.PI * 2);
        fixture('roundTree', tp, ty, (j + r) % 3);
        wreath(ctx, isl, tp, ty, (j + r) % 3);
      }
      for (let j = 0; j < cols; j++) {
        const u = (j + 0.5 - cols / 2) * G.pitchU;
        const hp = at(ng, u, v);
        // hammock variant 0 = a sleeper with a laptop (the nap), 1 = a book
        const variant = n % 2;
        fixture('hammock', hp, yaw, variant);
        if (variant === 0 && naps < 3) {
          naps++;
          const mug = at(ng, u + G.mug[0], v + (r % 2 === 0 ? G.mug[1] : -G.mug[1]));
          fixture('mugStack', mug, yaw, naps % 2);
          stories.push({
            kind: 'hammockNap',
            islandId: isl.id,
            pos: { x: hp.x, y: 0, z: hp.z },
            rotY: yaw,
            defs: ['hammock', 'mugStack'],
          });
        }
        n++;
      }
    }
    break;
  }
  // ---- C9 hedge glyphs `{ }` over `< / >` (stacked; or one row, or smaller, when that is what fits),
  // read from the south (up = -z), leaning SE
  const GL = M.glyphs;
  for (const layout of GL.layouts) {
    // the letter table is 6 u tall; `k` scales a layout down
    const k = layout.height / 6;
    const lineW = (l: readonly string[]): number =>
      k * l.reduce((t, c) => t + GLYPH_W[c as keyof typeof GLYPH_W], 0) + GL.gap * (l.length - 1);
    const size: [number, number] = [
      Math.max(...layout.lines.map(lineW)) + GL.margin,
      layout.lines.length * layout.height + (layout.lines.length - 1) * GL.lineGap + GL.margin,
    ];
    const gg = findSite(
      ctx,
      isl,
      park,
      [0],
      size,
      GL.ring,
      GL.maxRelief,
      GL.minShore,
      (p, rel, r) =>
        rel + 0.02 * r - 2 * Math.cos(Math.atan2(p.z - park.z, p.x - park.x) - GL.bearing),
    );
    if (!gg) continue;
    bed(gg, size);
    layout.lines.forEach((line, li) => {
      // line li's top edge, top line first (up = -V)
      const vTop = -size[1] / 2 + GL.margin / 2 + li * (layout.height + GL.lineGap);
      let a0 = -lineW(line) / 2;
      for (const c of line) {
        const ch = c as keyof typeof GLYPH_W;
        const world = (a: number, b: number): XZ =>
          at(gg, a0 + a * k, vTop + layout.height - b * k);
        for (const [A, B] of GLYPH_STROKES[ch]) {
          const pa = world(A[0], A[1]);
          const pb = world(B[0], B[1]);
          const n = Math.max(1, Math.ceil(dist(pa, pb) / GL.piece - 0.05));
          const yaw = headingOfX(pb.x - pa.x, pb.z - pa.z);
          for (let j = 0; j < n; j++) {
            const t = (j + 0.5) / n;
            fixture('hedge', { x: pa.x + (pb.x - pa.x) * t, z: pa.z + (pb.z - pa.z) * t }, yaw, 0);
          }
        }
        a0 += GLYPH_W[ch] * k + GL.gap;
      }
    });
    break;
  }

  // ---- C4 pinwheel meadow (last: it takes what the grove and the glyphs left; smaller grids when
  // the plateau has no room for 6 x 8)
  const PW = M.pinwheels;
  const pr = rng.fork('pinwheels');
  const windward = (p: XZ): number =>
    -((p.x - centre.x) * Math.cos(wd) + (p.z - centre.z) * Math.sin(wd)) / (dist(p, centre) || 1);
  for (const [cols, rows] of PW.grids) {
    const size: [number, number] = [
      (rows - 1) * PW.spacing + PW.margin,
      (cols - 1) * PW.spacing + PW.margin,
    ];
    const mg = findSite(
      ctx,
      isl,
      park,
      [0, Math.PI / 2],
      size,
      PW.ring,
      PW.maxRelief,
      PW.minShore,
      // a flat spot near the park, the windward side slightly preferred (the gusts arrive over it)
      (p, rel, r) => rel + 0.04 * r - 1.5 * windward(p),
    );
    if (!mg) continue;
    bed(mg, size);
    for (let j = 0; j < rows; j++)
      for (let i = 0; i < cols; i++) {
        const p = at(
          mg,
          (j - (rows - 1) / 2) * PW.spacing + pr.range(-PW.jitter, PW.jitter),
          (i - (cols - 1) / 2) * PW.spacing + pr.range(-PW.jitter, PW.jitter),
        );
        // the pinwheel faces local +z: heading wind + pi points it into the wind
        fixture('kite', p, wd + Math.PI, 3);
      }
    break;
  }

  ctx.shapes[isl.id] = ctx.shapes[isl.id].filter((o) => !strips.includes(o));
  return stories;
}

/** Highest plateau sample clear of turbines, the park and every obstacle (extra turbines). */
function bestSampleHigh(ctx: SiteCtx, isl: IslandData, turbines: number[], park: XZ): XZ | null {
  const T = P.turbine;
  const [x0, x1] = gridRange(isl.minX, isl.maxX);
  const [z0, z1] = gridRange(isl.minZ, isl.maxZ);
  let best: XZ | null = null;
  let bs = Infinity;
  for (let iz = z0; iz <= z1; iz++)
    for (let ix = x0; ix <= x1; ix++) {
      const i = iz * ctx.n + ix;
      if (ctx.islandMap[i] !== isl.id + 1 || ctx.sdf[i] < T.minShore) continue;
      const p = { x: cellX(ix), z: cellZ(iz) };
      if (dist(p, park) < T.spacing + 4) continue;
      if (turbines.some((li) => dist(ctx.landmarks[li], p) < T.spacing)) continue;
      const s = -ctx.h.data[i];
      if (s >= bs) continue;
      const sh = discShape(p.x, p.z, 3);
      if (relief(ctx, sh) > 1.5 || !onLand(ctx, isl, sh, T.minShore) || !clear(ctx, isl, sh, T.gap))
        continue;
      bs = s;
      best = p;
    }
  return best;
}

/** The Hack Garden frame and which end (±U) is its entrance. */
interface GardenSite {
  f: Frame;
  entrance: number;
  gu: number;
}

interface CultureSite {
  /** Tech Park frame. */
  f: Frame;
  /** Quad end (±1 along U) of the hub; the nap hammock hangs at the other end. */
  hubEnd: number;
  garden: GardenSite | null;
  turbines: readonly number[];
  sheds: readonly number[];
}

/**
 * Wind Gardens (M19 TASK-421, ISLAND_CULTURES §2.2): the culture kit placed round the Tech Park,
 * the turbines and the Hack Garden, plus its story spots. Every number is CODING_CULTURE_SITES;
 * every draw comes from a sub-fork of `rng` (one per kit piece / story).
 */
function windGardens(ctx: SiteCtx, isl: IslandData, rng: Rng, s: CultureSite): StorySpot[] {
  const { f } = s;
  const K = P.park;
  const stories: StorySpot[] = [];
  const story = (kind: string, p: XZ, rotY: number, defs: readonly string[]): void => {
    stories.push({ kind, islandId: isl.id, pos: { x: p.x, y: 0, z: p.z }, rotY, defs });
  };
  const rects: Readonly<Record<string, readonly [number, number]>> = CS.rect;
  /** Rect obstacle of a rect def at `p` (local x × local z). */
  const rectOf = (defId: string, p: XZ, rotY: number): Shape =>
    rectShape(p.x, p.z, rotY, rects[defId][0], rects[defId][1]);
  /** Fixture with its obstacle (a rect for the rect defs, else a disc). */
  const place = (defId: string, p: XZ, rotY: number, variant: number): void => {
    ctx.fixtures.push({ defId, x: p.x, z: p.z, rotY, islandId: isl.id, variant });
    const sh = rects[defId] ? rectOf(defId, p, rotY) : discShape(p.x, p.z, FIXTURE_RADIUS[defId]);
    addShape(ctx, isl, sh, true);
  };

  // ---- lawn strips: two pergola desks each, a mug crate between them, a whiteboard at the end
  const L = CS.lawn;
  [1, -1].forEach((sv, si) => {
    const front = facing(f, sv > 0 ? 3 : 1); // toward the paved spine
    L.pergolaU.forEach((u, k) =>
      place('pergolaDesk', at(f, u, sv * L.pergolaV), front, (si + k) % 2),
    );
    place('mugStack', at(f, L.mugU, sv * L.pergolaV), front, 0);
    // the board faces the spine like the desks (read from the paving and the park's walks)
    const bu = sv * L.boardU;
    place('whiteboardA', at(f, bu, sv * L.pergolaV), front, L.boards[si]);
    if (L.boards[si] === 1) {
      // rubber-duck debugging: a duck sits in front of the bug doodle, looking at it
      const duck = at(f, bu, sv * (L.pergolaV - L.boardDuck));
      place('rubberDuck', duck, front + Math.PI, rng.fork('boardDuck').int(0, 2));
      story('bugDoodle', duck, front + Math.PI, ['whiteboardA', 'rubberDuck']);
    }
  });

  // ---- pools: the giant duck in one, rubber ducks afloat in the other
  const pr = rng.fork('pools');
  const giant = pr.int(0, 1);
  const su = [-1, 1];
  const gp = at(f, su[giant] * K.poolU, 0);
  // along the pool's long side (the 3.9 u duck fits the 5.2 u pool that way), beak either end
  const gYaw = facing(f, pr.chance(0.5) ? 0 : 2) + pr.range(-0.15, 0.15);
  place('giantDuck', gp, gYaw, 0);
  story('gullOnDuck', gp, gYaw, ['giantDuck']);
  const other = frameAt(at(f, su[1 - giant] * K.poolU, 0), f.a);
  const nd = pr.int(CS.pool.ducks[0], CS.pool.ducks[1]);
  for (let k = 0; k < nd; k++) {
    const [du, dv] = CS.pool.duckAt[k];
    place('rubberDuck', at(other, du, dv), pr.range(0, Math.PI * 2), pr.int(0, 2));
  }
  // the duck family crossing the walk beside that pool (a bot waits for them)
  const cv = (pr.chance(0.5) ? 1 : -1) * (K.lawn[1] + K.walk);
  story('duckCrossing', at(f, su[1 - giant] * K.poolU, cv), facing(f, 0), [
    'bikeRack',
    'reflectingPoolEdge',
  ]);

  // ---- hammocks at the turbine feet, the chime tower's first: the first one is the nap (sleeper
  // with a laptop, the toppled mug crate beside it). With no room at any mast the nap hangs
  // between the two quad-end trees far from the hub (under their canopies: a T3 find)
  const H = CS.hammock;
  const hr = rng.fork('hammocks');
  const chime = (li: number): number => (ctx.landmarks[li].variant === CS.chimeVariant ? 0 : 1);
  let napped = false;
  const nap = (p: XZ, rotY: number, mug: XZ): void => {
    place('hammock', p, rotY, 0);
    place('mugStack', mug, rotY, 1);
    story('hammockNap', p, rotY, ['hammock', 'mugStack']);
    napped = true;
  };
  for (const li of [...s.turbines].sort((x, y) => chime(x) - chime(y) || x - y)) {
    const m = ctx.landmarks[li];
    const phase = hr.range(0, Math.PI * 2);
    const toPark = Math.atan2(f.o.z - m.z, f.o.x - m.x);
    let best: { p: XZ; rotY: number } | null = null;
    let bs = -Infinity;
    for (let r = H.ring[0]; r <= H.ring[1]; r += 0.8)
      for (let j = 0; j < H.samples; j++) {
        const ang = phase + (j / H.samples) * Math.PI * 2;
        if (Math.cos(ang - toPark) > H.parkCos) continue;
        const p = add(m, { x: Math.cos(ang), z: Math.sin(ang) }, r);
        // rotY = ang: local z along the radius, the hammock's length (local x) tangent to the ring
        const sh = rectOf('hammock', p, ang);
        if (!onLand(ctx, isl, sh, H.minShore) || relief(ctx, sh) > H.maxRelief) continue;
        if (!clear(ctx, isl, sh, H.gap)) continue;
        // the lee side of the mast (sheltered), close in
        const sc = Math.cos(ang - ctx.windDir) - 0.1 * r;
        if (sc > bs) {
          bs = sc;
          best = { p, rotY: ang };
        }
      }
    if (!best) continue;
    addPad(ctx, isl, rectOf('hammock', best.p, best.rotY), FLATTEN.discMargin);
    const out = { x: Math.cos(best.rotY), z: Math.sin(best.rotY) };
    if (!napped) nap(best.p, best.rotY, add(best.p, out, H.napMug));
    else place('hammock', best.p, best.rotY, 1);
  }
  if (!napped) {
    const endU = -s.hubEnd * (K.lawn[0] - K.treeInset);
    const hv = (hr.chance(0.5) ? 1 : -1) * H.treeV;
    nap(at(f, endU, hv), facing(f, 2), at(f, endU + s.hubEnd * H.napMug, hv));
  }

  // ---- kite field on the windward side: poles across the windward edge, the rack at the lee edge
  const KF = CS.kites;
  const kr = rng.fork('kites');
  const W = { x: Math.cos(ctx.windDir), z: Math.sin(ctx.windDir) };
  const centre = { x: isl.cx, z: isl.cz };
  let field: { g: Frame; su: number; sv: number } | null = null;
  let fs = -Infinity;
  const [x0, x1] = gridRange(isl.minX, isl.maxX);
  const [z0, z1] = gridRange(isl.minZ, isl.maxZ);
  for (const [minWindward, su, sv] of KF.tries) {
    for (let iz = z0; iz <= z1; iz += KF.step)
      for (let ix = x0; ix <= x1; ix += KF.step) {
        const i = iz * ctx.n + ix;
        if (ctx.islandMap[i] !== isl.id + 1 || ctx.sdf[i] < KF.minShore) continue;
        const p = { x: cellX(ix), z: cellZ(iz) };
        const proj = -((p.x - centre.x) * W.x + (p.z - centre.z) * W.z);
        if (proj / (dist(p, centre) || 1) < minWindward || proj <= fs) continue;
        // U points into the wind (windward), V across it
        const g = frameAt(p, ctx.windDir + Math.PI);
        const sh = frameRect(g, 0, 0, su / 2, sv / 2);
        if (!onLand(ctx, isl, sh, KF.minShore) || relief(ctx, sh) > KF.maxRelief) continue;
        if (!clear(ctx, isl, sh, KF.gap)) continue;
        fs = proj;
        field = { g, su, sv };
      }
    if (field) break;
  }
  if (field) {
    const { g, su, sv } = field;
    // smaller fields scale the layout (poles, spread and rack keep inside the rect)
    const ku = su / KF.tries[0][1];
    const kv = sv / KF.tries[0][2];
    const n = Math.min(
      kr.int(KF.count[0], KF.count[1]),
      1 + Math.floor((2 * KF.spread * kv) / KF.minGap),
    );
    // the kite hangs off the pole's local +x: point it downwind (rotY = wind + π/2)
    const downwind = ctx.windDir + Math.PI / 2;
    for (let k = 0; k < n; k++) {
      const v = n > 1 ? kv * (-KF.spread + (2 * KF.spread * k) / (n - 1)) : 0;
      const j = (): number => kr.range(-KF.jitter, KF.jitter);
      place('kite', at(g, ku * KF.poleU + j(), v + j()), downwind + kr.range(-0.25, 0.25), k % 3);
    }
    addPad(ctx, isl, frameRect(g, 0, 0, su / 2, sv / 2), FLATTEN.discMargin);
    const rack = at(g, ku * KF.rackU, 0);
    place('kiteRack', rack, facing(g, 0), KF.rackVariant);
    const rd = at(g, ku * KF.rackU + KF.rackDuck[1], KF.rackDuck[0]);
    place('rubberDuck', rd, facing(g, 0), kr.int(0, 2));
    story('kiteDay', rack, facing(g, 0), ['kiteRack', 'kite']);
  }

  // ---- the kite stuck on the Hack Garden's `{`: its pole outside the closed end, kite over it
  // (no garden: on a lawn-edge hedge, the pole on the lawn strip)
  const B = CS.garden;
  const side = rng.fork('stuckKite').chance(0.5) ? 1 : -1;
  let stuck: { p: XZ; rotY: number } | null = null;
  if (s.garden) {
    const { f: gf, entrance, gu } = s.garden;
    const p = at(gf, -entrance * (gu + B.stuckKiteU), side * B.stuckKiteV);
    const disc = discShape(p.x, p.z, FIXTURE_RADIUS.kite);
    // local +x (the kite) into the garden
    if (onLand(ctx, isl, disc, 1.5) && relief(ctx, disc) < 0.6)
      stuck = { p, rotY: facing(gf, entrance > 0 ? 1 : 3) };
  }
  if (!stuck)
    stuck = {
      p: at(f, -s.hubEnd * B.lawnStuck[0], side * B.lawnStuck[1]),
      rotY: facing(f, side > 0 ? 1 : 3),
    };
  place('kite', stuck.p, stuck.rotY, 1);
  story('stuckKite', stuck.p, stuck.rotY, ['kite', 'hedge']);

  // ---- the cat asleep on the warm rack of the first server shed
  if (s.sheds.length) {
    const lot = ctx.lots[s.sheds[0]];
    story('warmRackCat', lot, lot.rotY, ['serverShed']);
  }
  return stories;
}
