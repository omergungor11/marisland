/**
 * QA island plan (Palmlagoon atoll; M14b §2.5, TASK-366). The archetype gives the land ring, its
 * channel breaks, the lagoon and the wreck anchor; the theme puts on it:
 * - the bug wreck (THEMES.qa.landmarks) in the lagoon, ringed by inspection buoys;
 * - Landing: the channel pier; the lab-paving quad next to it seeds the island network;
 * - The Loop: a path along the ring's ridge both ways from the quad (A* between ridge
 *   waypoints), test labs spaced along it, a checkpoint barrier gate every ~25 u (checklist
 *   board + cones beside each);
 * - the inspection tower beside the Loop on the ring opposite the channel;
 * - the Stilt Lab on the lagoon edge with its boardwalk (path-graph 'boardwalk' edge door →
 *   shore);
 * - tide pools (nature, kept).
 * Everything stands on the walked arc: the longest unbroken piece of the ring.
 */
import { CAMPUS, DOCK, FLATTEN, LANDMARKS, VILLAGE } from '../../../content/settlements.ts';
import { QA_PLAN as P } from '../../../content/themes/qa.ts';
import { THEMES } from '../../../content/themes/index.ts';
import type { IslandData, XZ } from '../../types.ts';
import { heightAt } from '../../types.ts';
import { gridRange } from '../grid.ts';
import { addCellPath, gridAStar, pathStep, resample } from '../paths.ts';
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
  doorOf,
  dockWithLink,
  findDock,
  islandWindow,
  linkLot,
  nearestPathCell,
  newPlan,
  onIsland,
  placeStiltHut,
  placeTidePools,
  pushFixture,
  pushLandmark,
  relief,
  sdfAt,
  seedHub,
  shapeDist,
  siteFree,
  stepCtx,
  tryLot,
  unit,
  walkableFrom,
  type Shape,
  type SiteCtx,
  type SitePlan,
} from '../sites.ts';
import type { ThemePlanner } from './types.ts';

const TAU = Math.PI * 2;

const angleOf = (c: XZ, p: XZ): number => {
  const a = Math.atan2(p.z - c.z, p.x - c.x);
  return a < 0 ? a + TAU : a;
};

/**
 * Ridge of the land ring per ray from the lagoon centre (the sample with the largest shore
 * distance), null where the ring is too thin to walk (channel breaks).
 */
function ringRidge(ctx: SiteCtx, isl: IslandData, c: XZ): (XZ | null)[] {
  const out: (XZ | null)[] = [];
  for (let k = 0; k < P.ringRays; k++) {
    const d = dirOf((k / P.ringRays) * TAU);
    let best: XZ | null = null;
    let bs: number = P.ringMinShore;
    for (let t = 2; t <= isl.reach + 4; t += 1) {
      const p = add(c, d, t);
      if (!onIsland(ctx, isl, p.x, p.z)) continue;
      const s = sdfAt(ctx, p.x, p.z);
      if (s > bs) {
        bs = s;
        best = p;
      }
    }
    out.push(best);
  }
  return out;
}

/** Ray indices of the longest unbroken run of the ridge (trimmed at channel ends), in order. */
function walkedArc(ridge: (XZ | null)[], startHint: number): number[] {
  const K = ridge.length;
  const gaps = ridge.map((p, k) => (p ? -1 : k)).filter((k) => k >= 0);
  if (gaps.length === 0)
    return Array.from({ length: K }, (_, j) => (startHint + j) % K).filter((k) => ridge[k]);
  let best: number[] = [];
  for (const g of gaps) {
    const run: number[] = [];
    for (let j = 1; j < K && ridge[(g + j) % K]; j++) run.push((g + j) % K);
    if (run.length > best.length) best = run;
  }
  return best.length > 2 * P.arcTrim + 2 ? best.slice(P.arcTrim, best.length - P.arcTrim) : best;
}

/** A fixed prop with its own (non-blocking: it stands on or beside the Loop) obstacle disc. */
function looseFixture(
  ctx: SiteCtx,
  isl: IslandData,
  defId: string,
  p: XZ,
  rotY: number,
  r: number,
): void {
  ctx.fixtures.push({ defId, x: p.x, z: p.z, rotY, islandId: isl.id });
  addShape(ctx, isl, discShape(p.x, p.z, r), false);
}

const freeAt = (ctx: SiteCtx, isl: IslandData, p: XZ, r: number, gap: number): boolean =>
  !ctx.shapes[isl.id].some((o) => o.tag !== 'plaza' && shapeDist(o, p.x, p.z) < r + gap);

/** Cumulative arc length along a polyline. */
function arcLengths(line: XZ[]): number[] {
  const s = [0];
  for (let k = 1; k < line.length; k++) s.push(s[k - 1] + dist(line[k - 1], line[k]));
  return s;
}

export const planQa: ThemePlanner = ({ ctx, isl, rng, sIdx }) => {
  const centre = isl.anchors.lagoon ?? { x: isl.cx, z: isl.cz };
  const plan: SitePlan = newPlan('beachhut', centre);

  // the bug wreck (and the shape the inspection buoys ring)
  let wreck: XZ | null = null;
  let wreckShape: Shape | null = null;
  for (const [key, lm] of Object.entries(THEMES[isl.theme].landmarks)) {
    const a = isl.anchors[key];
    if (!a) continue;
    const n0 = ctx.shapes[isl.id].length;
    plan.landmarks.push(pushLandmark(ctx, isl, lm.kind, a, rng.fork('wreck').range(0, TAU)));
    if (lm.kind === 'sunkenShip') {
      wreck = a;
      wreckShape = ctx.shapes[isl.id][n0] ?? null;
    }
  }

  const ch = isl.anchors.channel0 ?? null;
  const ridge = ringRidge(ctx, isl, centre);
  const chRay = ch ? Math.round((angleOf(centre, ch) / TAU) * P.ringRays) % P.ringRays : 0;
  const arc = walkedArc(ridge, chRay);
  if (arc.length < 3) return null;
  const arcPts = arc.map((k) => ridge[k] as XZ);
  const arcMid = arcPts[arcPts.length >> 1];
  const comp = walkableFrom(ctx, isl, arcMid);
  if (!comp) return null;
  const onArc = (p: XZ): boolean => {
    const i = cellOf(ctx, p.x, p.z);
    return i >= 0 && comp[i] === 1;
  };

  // Landing: the channel pier, preferring the arc end next to the channel
  const arcEnd =
    ch && dist(arcPts[0], ch) > dist(arcPts[arcPts.length - 1], ch)
      ? arcPts[arcPts.length - 1]
      : arcPts[0];
  if (ch) {
    const site = findDock(ctx, isl, {
      near: ch,
      maxDist: P.dockSearch,
      prefer: arcEnd,
      carve: false,
      maxSegments: P.dockSegments,
      endDepth: DOCK.lagoonEndDepth,
    });
    dockWithLink(ctx, isl, plan, site, rng.fork('moorings'), { rowboats: 1, sailboats: 0 });
  }
  const landing = ctx.docks[plan.docks[0]] ?? arcEnd;

  // lab-paving quad on the walked arc, near the landing
  const cs = CAMPUS.qa;
  const R = cs.quadR;
  let quad: XZ | null = null;
  for (let pass = 0; pass < 2 && !quad; pass++) {
    const minShore = Math.max(cs.quadMinShore, R + 1) * (pass ? 0.7 : 1);
    const maxRelief = cs.quadMaxRelief * (pass ? 2 : 1);
    quad = bestSample(ctx, isl, landing, P.quadSearch, (p, i) => {
      if (!comp[i] || ctx.sdf[i] < minShore) return Infinity;
      const sh = discShape(p.x, p.z, R);
      const r = relief(ctx, sh);
      if (r > maxRelief || !clear(ctx, isl, sh, 2) || !siteFree(ctx, isl, sh)) return Infinity;
      return r + P.quadLanding * dist(p, landing);
    });
  }
  if (!quad) quad = arcMid;
  plan.hub = quad;
  plan.plaza = { x: quad.x, z: quad.z, r: R };
  addShape(ctx, isl, { ...discShape(quad.x, quad.z, R + 0.5), tag: 'plaza' }, false);
  addPad(ctx, isl, discShape(quad.x, quad.z, R), FLATTEN.discMargin);
  const hubCell = seedHub(ctx, isl, plan, quad);
  if (hubCell < 0) return null;

  // ridge position of the quad and the arc length along the ridge
  let qi = 0;
  for (let j = 1; j < arcPts.length; j++)
    if (dist(arcPts[j], quad) < dist(arcPts[qi], quad)) qi = j;
  const arcS = arcLengths(arcPts);
  const along = (j: number): number => Math.abs(arcS[j] - arcS[qi]);

  // offices stand ON the ridge (the ring is too thin for lots beside a ridge path), door to the
  // lagoon first; the Loop then runs past their doors
  ctx.reach[isl.id] = comp;
  const office: number[] = [];
  const doorAt = new Map<number, XZ>();
  const onRidge = (j: number, def: string): number => {
    const p = arcPts[j];
    const inward = unit(p, centre);
    const a = ang(inward.x, inward.z);
    for (const rot of [a, a + Math.PI, a + Math.PI / 2, a - Math.PI / 2])
      for (const off of [0, 0.8, -0.8]) {
        const li = tryLot(ctx, isl, def, add(p, inward, off), rot, sIdx, {
          minShore: cs.minShore,
          maxRelief: cs.maxRelief,
        });
        if (li < 0) continue;
        office.push(li);
        doorAt.set(j, doorOf(ctx.lots[li]));
        return li;
      }
    return -1;
  };
  const clearOfQuad = (j: number): boolean => dist(arcPts[j], quad) > R + 4;

  // inspection tower on the ring opposite the channel
  const oppA = ch ? (angleOf(centre, ch) + Math.PI) % TAU : angleOf(centre, arcMid);
  const da = (p: XZ): number =>
    Math.abs(((angleOf(centre, p) - oppA + 3 * Math.PI) % TAU) - Math.PI);
  let ti = 0;
  for (let j = 1; j < arcPts.length; j++) if (da(arcPts[j]) < da(arcPts[ti])) ti = j;
  const towerCand = arcPts
    .map((_, j) => j)
    .filter((j) => dist(arcPts[j], arcPts[ti]) <= P.towerSearch && clearOfQuad(j))
    .sort((x, y) => dist(arcPts[x], arcPts[ti]) - dist(arcPts[y], arcPts[ti]) || x - y);
  const placed: XZ[] = [];
  for (const j of towerCand)
    if (onRidge(j, 'inspectionTower') >= 0) {
      placed.push(arcPts[j]);
      break;
    }

  // test labs spaced along the ring, nearest the quad first
  const labs = rng.fork('labs').int(P.labs[0], P.labs[1]);
  const spacing = Math.min(
    P.labSpacing[1],
    Math.max(P.labSpacing[0], arcS[arcS.length - 1] / (labs + 2)),
  );
  const slots = arcPts
    .map((_, j) => j)
    .filter(clearOfQuad)
    .sort((x, y) => along(x) - along(y) || x - y);
  let nLabs = 0;
  for (const j of slots) {
    if (nLabs >= labs) break;
    if (placed.some((q) => dist(q, arcPts[j]) < spacing)) continue;
    if (onRidge(j, 'testLab') < 0) continue;
    placed.push(arcPts[j]);
    nLabs++;
  }
  ctx.reach[isl.id] = null;

  // The Loop: from the quad both ways along the ridge, A* between ridge waypoints and through
  // the office doors
  const step = pathStep({ ...stepCtx(ctx, isl), stair: false });
  const win = islandWindow(ctx, isl);
  const loop: XZ[][] = [];
  for (const dir of [1, -1]) {
    const last = dir > 0 ? arcPts.length - 1 : 0;
    const wps: XZ[] = [];
    for (let j = qi + dir; dir > 0 ? j <= last : j >= last; j += dir) {
      const door = doorAt.get(j);
      if (door) wps.push(door);
      else if (j === last || Math.abs(j - qi) % P.waypointStep === 0) wps.push(arcPts[j]);
    }
    const cells = [hubCell];
    let prev = hubCell;
    for (const wp of wps) {
      const goal = nearestPathCell(ctx, isl, wp);
      if (goal < 0 || goal === prev || !comp[goal]) continue;
      const seg = gridAStar({ ...win, start: prev, goal, step, hScale: 2 });
      if (!seg) break;
      addCellPath(ctx.net, seg, isl.id, 'path');
      cells.push(...seg.slice(1));
      prev = goal;
    }
    if (cells.length < 3) continue;
    const lane = resample(
      cells.map((c) => cellPos(ctx, c)),
      1,
      false,
    );
    ctx.lanes[isl.id].push(lane);
    loop.push(lane);
  }

  // Stilt Lab on the lagoon edge of the walked arc, nearest the quad (short boardwalk walk)
  const arcRays = new Set(arc);
  const spots: XZ[] = [];
  const Rl = isl.radius * 0.8;
  const [x0, x1] = gridRange(centre.x - Rl, centre.x + Rl);
  const [z0, z1] = gridRange(centre.z - Rl, centre.z + Rl);
  for (let iz = z0; iz <= z1; iz++)
    for (let ix = x0; ix <= x1; ix++) {
      const i = iz * ctx.n + ix;
      const y = ctx.h.data[i];
      const s = -ctx.sdf[i];
      if (y > -VILLAGE.stiltDepth[0] || y < -VILLAGE.stiltDepth[1]) continue;
      if (s < VILLAGE.stiltShore[0] || s > VILLAGE.stiltShore[1]) continue;
      const p = cellPos(ctx, i);
      if (dist(p, centre) > Rl || (wreck && dist(p, wreck) < P.stiltWreckClear)) continue;
      const ray = Math.round((angleOf(centre, p) / TAU) * P.ringRays) % P.ringRays;
      if (!arcRays.has(ray)) continue;
      spots.push(p);
    }
  spots.sort((a, b) => dist(a, quad) - dist(b, quad));
  for (const p of spots) {
    const n0 = plan.links.length;
    const li = placeStiltHut(ctx, isl, plan, p, sIdx);
    if (li < 0) continue;
    // its boardwalk lands on the walked arc (else drop the link: the lot is not connected)
    if (!onArc(plan.links[n0].pin)) {
      plan.links.splice(n0, 1);
      plan.lots.pop();
      continue;
    }
    break;
  }

  // labs first (the settlement's lead office is its first office lot), nearest the quad first
  const rank = (li: number): number => (ctx.lots[li].defId === 'testLab' ? 0 : 1);
  office.sort((a, b) => rank(a) - rank(b) || dist(ctx.lots[a], quad) - dist(ctx.lots[b], quad));
  const stilt = plan.lots.splice(0);
  for (const li of office) linkLot(ctx, plan, li);
  plan.lots.push(...stilt);

  // Checkpoints: barrier gates across the Loop, a checklist board right, cones left
  const gates: XZ[] = [];
  const W = P.gateTangent;
  const straight = Math.cos((P.gateStraightDeg * Math.PI) / 180);
  for (const lane of loop) {
    const s = arcLengths(lane);
    for (let at = P.gateStart; at < s[s.length - 1] - 3; at += P.gateEvery) {
      let k0 = 0;
      while (k0 < lane.length - 1 && s[k0] < at) k0++;
      for (let o = 0; o <= P.gateSearch; o++) {
        const ks = o === 0 ? [k0] : [k0 + o, k0 - o];
        const k = ks.find((kk) => {
          if (kk < W || kk >= lane.length - W) return false;
          const p = lane[kk];
          const u0 = unit(lane[kk - W], p);
          const u1 = unit(p, lane[kk + W]);
          if (u0.x * u1.x + u0.z * u1.z < straight) return false;
          if (dist(p, quad) < R + 2 || gates.some((g) => dist(g, p) < P.gateSpacing)) return false;
          if (heightAt(ctx.h, p.x, p.z) < 0.4) return false;
          return freeAt(ctx, isl, p, P.gateRadius, 0.2);
        });
        if (k === undefined) continue;
        const p = lane[k];
        const t = unit(lane[k - W], lane[k + W]);
        const right = { x: t.z, z: -t.x }; // lot frame: local +x = (fz, −fx)
        looseFixture(ctx, isl, 'barrierGate', p, ang(t.x, t.z), P.gateRadius);
        gates.push(p);
        const b = add(p, right, P.boardSide);
        if (heightAt(ctx.h, b.x, b.z) >= 0.4 && freeAt(ctx, isl, b, 0.6, 0.2))
          looseFixture(ctx, isl, 'checklistBoard', b, ang(-right.x, -right.z), 0.6);
        for (const sg of [1, -1]) {
          const q = add(add(p, t, sg * P.cone[0]), right, -P.cone[1]);
          if (heightAt(ctx.h, q.x, q.z) >= 0.3 && freeAt(ctx, isl, q, 0.3, 0.1))
            looseFixture(ctx, isl, 'trafficCone', q, ang(t.x, t.z) + sg, 0.3);
        }
        break;
      }
    }
  }

  // the wreck ringed by red/white inspection buoys
  if (wreck) {
    const r = (LANDMARKS.sunkenShip.radius ?? 6) + P.wreckBuoyGap;
    const ph = rng.fork('wreck-buoys').range(0, TAU);
    for (let k = 0; k < P.wreckBuoys; k++) {
      const p = add(wreck, dirOf(ph + (k / P.wreckBuoys) * TAU), r);
      if (heightAt(ctx.h, p.x, p.z) > -P.wreckBuoyDepth || sdfAt(ctx, p.x, p.z) > -1.5) continue;
      if (ctx.shapes[isl.id].some((o) => o !== wreckShape && shapeDist(o, p.x, p.z) < 1.5))
        continue;
      pushFixture(ctx, isl, 'inspectionBuoy', p, ph + (k / P.wreckBuoys) * TAU);
    }
  }
  placeTidePools(ctx, isl, rng.fork('tidepools'));
  return plan;
};
