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
 * - a lee dock.
 * The campus frame is the patch grid: `u` along the patch axis, `v` across it. Numbers live in
 * content/themes/coding.ts (`CODING_PLAN`); every random draw comes from `rng` forks.
 */
import { CODING_PLAN as P } from '../../../content/themes/coding.ts';
import { THEMES } from '../../../content/themes/index.ts';
import { FLATTEN, LOT_FOOTPRINT, PATHS } from '../../../content/settlements.ts';
import { smoothstep } from '../../../core/math/index.ts';
import type { DistrictData, DistrictKind, FieldPatchData, IslandData, XZ } from '../../types.ts';
import { PATCHWORK } from '../../../content/islands.ts';
import { heightAt, Zone } from '../../types.ts';
import { cellX, cellZ, gridRange } from '../grid.ts';
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

/**
 * Solar districts: every patch rectangle of this island trimmed to clean, free, flat ground and
 * snapped to the panel lattice; other cells of the patch grid while the farm is below `minArea`.
 */
function solarFarm(ctx: SiteCtx, isl: IslandData, plan: SitePlan, a: number): Shape[] {
  const S = P.solar;
  const out: Shape[] = [];
  const { real, grid } = solarCells(ctx, isl, a);
  let area = 0;
  for (const fp of [...real, ...grid]) {
    if (grid.includes(fp) && area >= S.minArea) break;
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
    if (!m) continue;
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
    if (segs < S.minLattice[0] || rowsN < S.minLattice[1]) continue;
    const hAlong = (segs * L.len + 2 * L.margin) / 2;
    const hAcross = ((rowsN - 1) * L.pitch + L.depth + 2 * L.margin) / 2;
    const c = at(f, (uOf(c0) + uOf(c1)) / 2, (vOf(r0) + vOf(r1)) / 2);
    const rot = alongU ? fp.rotY : fp.rotY + Math.PI / 2;
    const sh = rectShape(c.x, c.z, rot, hAcross * 2, hAlong * 2);
    addShape(ctx, isl, sh, true);
    paint(ctx, isl, sh, Zone.field, 0.5);
    plan.districts.push(district(isl, 'solar', sh, rot));
    out.push(sh);
    area += sh.hw * sh.hd * 4;
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
  for (const su of [-1, 1])
    for (const v of K.treeV)
      pushFixture(ctx, isl, 'roundTree', at(f, su * (lu - K.treeInset), v), a);
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
  const gr = rng.fork('garden');
  const G = P.garden;
  const gf = siteOnRing(ctx, isl, f, G.size, G.ring, G.maxRelief, G.minShore, gr.range(0, 6.28));
  if (gf) {
    const [gu, gv] = [G.size[0] / 2, G.size[1] / 2];
    const garden = frameRect(gf, 0, 0, gu, gv);
    paint(ctx, isl, garden, Zone.meadow);
    const hedge = (p: XZ, rotY: number): void => {
      pushFixture(ctx, isl, 'hedge', p, rotY);
      ctx.fixtures[ctx.fixtures.length - 1].variant = 0;
    };
    for (const sv of [-1, 1])
      for (const u of [-3.4, -1.15, 1.15, 3.4]) hedge(at(gf, u, sv * (gv - 0.4)), facing(gf, 1));
    // closed end away from the park, entrance toward it
    const entrance = (f.o.x - gf.o.x) * gf.U.x + (f.o.z - gf.o.z) * gf.U.z >= 0 ? 1 : -1;
    for (const v of [-1.2, 1.2]) hedge(at(gf, -entrance * (gu - 0.4), v), facing(gf, 0));
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

  // ---- links: turbines (service paths), lots nearest the park first
  for (const li of turbines) linkLandmark(ctx, plan, li, f.o);
  lots.sort((x, y) => dist(ctx.lots[x], f.o) - dist(ctx.lots[y], f.o) || x - y);
  for (const li of lots) linkLot(ctx, plan, li);
  return plan;
};

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
