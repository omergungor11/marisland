/**
 * QA island plan — the Test Factory (Palmlagoon archetype; M17b TASK-401, replaces the M14b atoll
 * plan of TASK-366). The archetype gives a raised plateau on earth walls with a lee harbour cove
 * and the `yard` / `tower` / `harbour` anchors; the theme builds:
 * - Harbour: the pier in the lee cove (lane 0 of the campus climbs from it to the yard);
 * - Factory yard: a concrete disc (Zone.plaza, the island's network hub) near the `yard` anchor;
 * - the QA tower (landmark 'qaTower', THEMES.qa.landmarks) on the windward knoll, inland, off
 *   the yard: the island's one dominant vertical;
 * - Test hangars (testHangar fixtures) on the yard rim, doors to the yard, chimneys steaming;
 * - Conveyor bridges (rows of conveyor segments) between neighbouring hangars — crates ride
 *   them in the render (render/movers.ts);
 * - the crash-test loop track (testTrack fixture) beside the yard — the test cart laps it;
 * - Test labs (testLab office lots) on campus lanes from the yard, checkpoint barrier gates with
 *   checklist boards and cones on those lanes.
 * Every random decision draws from labelled forks of `rng`; tuning lives in QA_PLAN.
 */
import { FLATTEN, LANDMARKS } from '../../../content/settlements.ts';
import { QA_PLAN as P } from '../../../content/themes/qa.ts';
import { THEMES } from '../../../content/themes/index.ts';
import type { IslandData, XZ } from '../../types.ts';
import { heightAt } from '../../types.ts';
import {
  add,
  addPad,
  addShape,
  ang,
  bestSample,
  campusLots,
  clear,
  dirOf,
  discShape,
  dist,
  dockWithLink,
  findDock,
  linkLandmark,
  newPlan,
  onLand,
  pushLandmark,
  rectShape,
  relief,
  shapeDist,
  siteFree,
  unit,
  type Shape,
  type SiteCtx,
} from '../sites.ts';
import type { ThemePlanner } from './types.ts';

const TAU = Math.PI * 2;
const DEG = Math.PI / 180;

/** Smallest absolute difference of two angles (rad). */
const angGap = (a: number, b: number): number => Math.abs(((a - b + 3 * Math.PI) % TAU) - Math.PI);

/** A fixed prop with its own obstacle shape; `pad` flattens the ground under it. */
function fixture(
  ctx: SiteCtx,
  isl: IslandData,
  defId: string,
  p: XZ,
  rotY: number,
  sh: Shape,
  o: { block: boolean; pad?: number; variant?: number },
): void {
  ctx.fixtures.push({ defId, x: p.x, z: p.z, rotY, islandId: isl.id });
  if (o.variant !== undefined) ctx.fixtures[ctx.fixtures.length - 1].variant = o.variant;
  addShape(ctx, isl, sh, o.block);
  if (o.pad !== undefined) addPad(ctx, isl, sh, o.pad);
}

const freeAt = (ctx: SiteCtx, isl: IslandData, p: XZ, r: number, gap: number): boolean =>
  !ctx.shapes[isl.id].some((o) => o.tag !== 'plaza' && shapeDist(o, p.x, p.z) < r + gap);

/** Factory yard: the flattest clear disc near the anchor (relaxed on a second pass). */
function placeYard(ctx: SiteCtx, isl: IslandData, near: XZ): XZ | null {
  const R = P.yardR;
  for (let pass = 0; pass < 2; pass++) {
    const minShore = P.yardMinShore * (pass ? 0.75 : 1);
    const maxRelief = P.yardMaxRelief * (pass ? 2 : 1);
    const yard = bestSample(ctx, isl, near, P.yardSearch * (pass ? 1.8 : 1), (p, i) => {
      if (ctx.sdf[i] < minShore) return Infinity;
      const sh = discShape(p.x, p.z, R);
      const r = relief(ctx, sh);
      if (r > maxRelief || !clear(ctx, isl, sh, 2) || !siteFree(ctx, isl, sh)) return Infinity;
      return r + P.yardLanding * dist(p, near);
    });
    if (yard) return yard;
  }
  return null;
}

/** QA tower: the highest clear spot near the knoll anchor, inland and off the yard. */
function placeTower(ctx: SiteCtx, isl: IslandData, near: XZ, yard: XZ): XZ | null {
  const r = LANDMARKS.qaTower.radius ?? 2.6;
  for (let pass = 0; pass < 2; pass++)
    for (const search of [P.towerSearch, P.towerSearch * 2]) {
      const p = bestSample(ctx, isl, near, search, (q, i) => {
        if (ctx.sdf[i] < P.towerMinShore * (pass ? 0.6 : 1)) return Infinity;
        if (dist(q, yard) < P.yardR + P.towerYardGap) return Infinity;
        const sh = discShape(q.x, q.z, r);
        if (relief(ctx, sh) > P.towerRelief * (pass ? 2 : 1) || !clear(ctx, isl, sh, 1))
          return Infinity;
        return -heightAt(ctx.h, q.x, q.z) + 0.05 * dist(q, near);
      });
      if (p) return p;
    }
  return null;
}

interface Hangar {
  p: XZ;
  a: number;
  sh: Shape;
}

/**
 * Hangars on the yard rim, doors to the yard: the first as far round from the harbour as fits
 * (the lane up from the pier keeps the near side open), the next ones ≥ hangarSpreadDeg from all
 * placed, nearest the last one (so neighbours can be bridged).
 */
function placeHangars(ctx: SiteCtx, isl: IslandData, yard: XZ, dockA: number, n: number): Hangar[] {
  const [w, d] = P.hangar;
  const rho = P.yardR + P.hangarGap + d / 2;
  const cand: Hangar[] = [];
  for (let k = 0; k < P.hangarAngles; k++) {
    const a = (k / P.hangarAngles) * TAU;
    const p = add(yard, dirOf(a), rho);
    const sh = rectShape(p.x, p.z, a + Math.PI, w, d);
    if (!onLand(ctx, isl, sh, P.hangarMinShore) || relief(ctx, sh) > P.hangarRelief) continue;
    if (!clear(ctx, isl, sh, 1, true) || !siteFree(ctx, isl, sh)) continue;
    cand.push({ p, a, sh });
  }
  const out: Hangar[] = [];
  const spread = P.hangarSpreadDeg * DEG;
  while (out.length < n) {
    let best: Hangar | null = null;
    let bs = Infinity;
    for (const c of cand) {
      if (out.some((h) => angGap(h.a, c.a) < spread)) continue;
      if (out.includes(c) || !clear(ctx, isl, c.sh, 1, true)) continue;
      const s = out.length ? angGap(c.a, out[out.length - 1].a) : -angGap(c.a, dockA);
      if (s < bs - 1e-9) {
        bs = s;
        best = c;
      }
    }
    if (!best) break;
    fixture(ctx, isl, 'testHangar', best.p, best.a + Math.PI, best.sh, {
      block: true,
      pad: FLATTEN.lotMargin,
      variant: out.length % 2,
    });
    out.push(best);
  }
  return out;
}

/**
 * Conveyor bridge from hangar A to B: segments on the centre line (crates run A → B), one
 * segment reaching into each hangar wall; skipped when a leg would stand on another obstacle.
 */
function bridge(ctx: SiteCtx, isl: IslandData, A: Hangar, B: Hangar): boolean {
  const L = dist(A.p, B.p);
  if (L < P.beltSpan[0] || L > P.beltSpan[1]) return false;
  const u = unit(A.p, B.p);
  const n = Math.ceil(L / P.beltSeg);
  const off = (L - n * P.beltSeg) / 2;
  const segs: XZ[] = [];
  for (let k = 0; k < n; k++) {
    const c = add(A.p, u, off + (k + 0.5) * P.beltSeg);
    if (shapeDist(A.sh, c.x, c.z) < -1.2 || shapeDist(B.sh, c.x, c.z) < -1.2) continue;
    const legs = ctx.shapes[isl.id].filter((o) => o !== A.sh && o !== B.sh && o.tag !== 'plaza');
    if (legs.some((o) => shapeDist(o, c.x, c.z) < 0.6)) return false;
    if (heightAt(ctx.h, c.x, c.z) < 1) return false;
    segs.push(c);
  }
  if (segs.length < 2) return false;
  const rotY = ang(u.x, u.z);
  const mid = add(A.p, u, L / 2);
  const corridor = rectShape(mid.x, mid.z, rotY + Math.PI / 2, L, 1.4);
  for (const c of segs)
    ctx.fixtures.push({ defId: 'conveyor', x: c.x, z: c.z, rotY, islandId: isl.id });
  // bots and lanes pass under the belt: a non-blocking obstacle, one level pad (belt stays flat)
  addShape(ctx, isl, corridor, false);
  addPad(ctx, isl, corridor, 0.5);
  return true;
}

/** Loop track beside the yard: flattest fitting spot, long axis radial or tangential. */
function placeTrack(ctx: SiteCtx, isl: IslandData, yard: XZ): void {
  const [w, d] = P.track;
  const r0 = P.yardR + P.trackYardGap + w / 2;
  let best: { p: XZ; rot: number; sh: Shape } | null = null;
  let bs = Infinity;
  bestSample(ctx, isl, yard, P.trackSearch, (p, i) => {
    if (ctx.sdf[i] < P.trackMinShore || dist(p, yard) < r0) return Infinity;
    const f = unit(yard, p);
    const a = ang(f.x, f.z);
    for (const rot of [a, a + Math.PI / 2]) {
      const sh = rectShape(p.x, p.z, rot, w, d);
      if (!onLand(ctx, isl, sh, P.trackMinShore)) continue;
      const r = relief(ctx, sh);
      if (r > P.trackRelief || !clear(ctx, isl, sh, 1.5) || !siteFree(ctx, isl, sh)) continue;
      const s = r + 0.06 * dist(p, yard);
      if (s < bs) {
        bs = s;
        best = { p, rot, sh };
      }
    }
    return Infinity;
  });
  const b = best as { p: XZ; rot: number; sh: Shape } | null;
  if (b) fixture(ctx, isl, 'testTrack', b.p, b.rot, b.sh, { block: true, pad: FLATTEN.discMargin });
}

/** Checkpoints: barrier gates across the campus lanes, a checklist board right, cones left. */
function placeGates(ctx: SiteCtx, isl: IslandData, yard: XZ): void {
  const loose = (defId: string, p: XZ, rotY: number, r: number): void =>
    fixture(ctx, isl, defId, p, rotY, discShape(p.x, p.z, r), { block: false });
  const gates: XZ[] = [];
  const W = P.gateTangent;
  const straight = Math.cos(P.gateStraightDeg * DEG);
  for (const lane of ctx.lanes[isl.id]) {
    const s = [0];
    for (let k = 1; k < lane.length; k++) s.push(s[k - 1] + dist(lane[k - 1], lane[k]));
    for (let at = P.yardR + P.gateStart; at < s[s.length - 1] - 3; at += P.gateEvery) {
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
          if (dist(p, yard) < P.yardR + 2 || gates.some((g) => dist(g, p) < P.gateSpacing))
            return false;
          if (heightAt(ctx.h, p.x, p.z) < 0.4) return false;
          return freeAt(ctx, isl, p, P.gateRadius, 0.2);
        });
        if (k === undefined) continue;
        const p = lane[k];
        const t = unit(lane[k - W], lane[k + W]);
        const right = { x: t.z, z: -t.x }; // lot frame: local +x = (fz, −fx)
        loose('barrierGate', p, ang(t.x, t.z), P.gateRadius);
        gates.push(p);
        const b = add(p, right, P.boardSide);
        if (heightAt(ctx.h, b.x, b.z) >= 0.4 && freeAt(ctx, isl, b, 0.6, 0.2))
          loose('checklistBoard', b, ang(-right.x, -right.z), 0.6);
        for (const sg of [1, -1]) {
          const q = add(add(p, t, sg * P.cone[0]), right, -P.cone[1]);
          if (heightAt(ctx.h, q.x, q.z) >= 0.3 && freeAt(ctx, isl, q, 0.3, 0.1))
            loose('trafficCone', q, ang(t.x, t.z) + sg, 0.3);
        }
        break;
      }
    }
  }
}

export const planQa: ThemePlanner = ({ ctx, isl, rng, sIdx }) => {
  const yardA = isl.anchors.yard ?? { x: isl.cx, z: isl.cz };
  const harbour = isl.anchors.harbour ?? yardA;
  const plan = newPlan('campus', yardA);

  // Harbour: the pier in the lee cove; the campus' lane 0 climbs from it to the yard
  const site = findDock(ctx, isl, {
    near: harbour,
    maxDist: P.dockMaxDist,
    prefer: harbour,
    lee: P.dockLee,
    carve: true,
  });
  dockWithLink(ctx, isl, plan, site, rng.fork('moorings'), { rowboats: 1, sailboats: 0 });
  if (site) plan.hub = site.root;

  // Factory yard (plaza + network hub)
  const yard = placeYard(ctx, isl, yardA);
  if (!yard) return null;
  const R = P.yardR;
  plan.plaza = { x: yard.x, z: yard.z, r: R };
  addShape(ctx, isl, { ...discShape(yard.x, yard.z, R + 0.5), tag: 'plaza' }, false);
  addPad(ctx, isl, discShape(yard.x, yard.z, R), FLATTEN.discMargin);

  // the QA tower on the knoll, facing the archipelago (its check sign reads both ways)
  const towerA = isl.anchors.tower ?? yardA;
  const tp = placeTower(ctx, isl, towerA, yard);
  let cx = 0;
  let cz = 0;
  for (const o of ctx.islands) {
    cx += o.cx / ctx.islands.length;
    cz += o.cz / ctx.islands.length;
  }
  for (const [key, lm] of Object.entries(THEMES[isl.theme].landmarks)) {
    if (key !== 'tower' || !tp) continue;
    const f = unit(tp, { x: cx, z: cz });
    const li = pushLandmark(ctx, isl, lm.kind, tp, ang(f.x, f.z));
    plan.landmarks.push(li);
    linkLandmark(ctx, plan, li, yard);
  }

  // hangars on the yard rim, conveyor bridges between neighbours
  const dockA = site ? Math.atan2(site.root.z - yard.z, site.root.x - yard.x) : 0;
  const hangars = placeHangars(
    ctx,
    isl,
    yard,
    dockA,
    rng.fork('hangars').int(P.hangars[0], P.hangars[1]),
  );
  for (let k = 0; k + 1 < hangars.length; k++) bridge(ctx, isl, hangars[k], hangars[k + 1]);

  // crash-test loop track beside the yard
  placeTrack(ctx, isl, yard);

  // test labs on lanes from the yard (lane 0 runs down to the pier), then the checkpoints
  campusLots(ctx, isl, plan, { ...P.campus, quadR: R }, rng.fork('campus'), sIdx, yard);
  placeGates(ctx, isl, yard);
  return plan;
};
