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
import { QA_CULTURE, QA_CULTURE_SITES } from '../../../content/cultures/qa.ts';
import {
  FIXTURE_RADIUS,
  FLATTEN,
  LANDMARKS,
  PATHS,
  VILLAGE,
} from '../../../content/settlements.ts';
import { QA_PLAN as P } from '../../../content/themes/qa.ts';
import { THEMES } from '../../../content/themes/index.ts';
import type { Rng } from '../../../core/rng.ts';
import type { IslandData, StorySpot, XZ } from '../../types.ts';
import { heightAt } from '../../types.ts';
import { gridRange } from '../grid.ts';
import {
  add,
  addPad,
  addShape,
  ang,
  bestSample,
  campusLots,
  cellPos,
  clear,
  dirOf,
  discShape,
  dist,
  dockWithLink,
  findDock,
  linkLandmark,
  newPlan,
  onLand,
  placeStiltHut,
  pushLandmark,
  rectShape,
  relief,
  shapeDist,
  shapesOverlap,
  siteFree,
  unit,
  type Shape,
  type SiteCtx,
  type SitePlan,
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
  o: { block: boolean; pad?: number },
): void {
  ctx.fixtures.push({ defId, x: p.x, z: p.z, rotY, islandId: isl.id });
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

interface Track {
  p: XZ;
  rot: number;
  sh: Shape;
}

/** Loop track beside the yard: flattest fitting spot, long axis radial or tangential. */
function placeTrack(ctx: SiteCtx, isl: IslandData, yard: XZ): Track | null {
  const [w, d] = P.track;
  const r0 = P.yardR + P.trackYardGap + w / 2;
  let best: Track | null = null;
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
  const b = best as Track | null;
  if (b) fixture(ctx, isl, 'testTrack', b.p, b.rot, b.sh, { block: true, pad: FLATTEN.discMargin });
  return b;
}

/**
 * The dockside lab: the stilt lab (THEMES.qa.defSwap stiltHut → testLabStilt) on the harbour cove
 * water nearest the pier root, its boardwalk landing on the cove beach. After the campus lots,
 * so the settlement's lead office stays a land test lab.
 */
function placeStiltLab(
  ctx: SiteCtx,
  isl: IslandData,
  plan: SitePlan,
  near: XZ,
  sIdx: number,
): void {
  const spots: XZ[] = [];
  const Rs = P.stiltSearch;
  const [x0, x1] = gridRange(near.x - Rs, near.x + Rs);
  const [z0, z1] = gridRange(near.z - Rs, near.z + Rs);
  for (let iz = z0; iz <= z1; iz++)
    for (let ix = x0; ix <= x1; ix++) {
      const i = iz * ctx.n + ix;
      const y = ctx.h.data[i];
      const sd = -ctx.sdf[i];
      if (y > -VILLAGE.stiltDepth[0] || y < -VILLAGE.stiltDepth[1]) continue;
      if (sd < VILLAGE.stiltShore[0] || sd > VILLAGE.stiltShore[1]) continue;
      const p = cellPos(ctx, i);
      if (dist(p, near) <= Rs) spots.push(p);
    }
  spots.sort((a, b) => dist(a, near) - dist(b, near));
  for (const p of spots) if (placeStiltHut(ctx, isl, plan, p, sIdx) >= 0) return;
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
  if (site) {
    plan.hub = site.root;
    // keep lot pads (and their falloff) off the pier root: a raised beach cell would lift the
    // first planks' bilinear ground above the water
    addShape(ctx, isl, discShape(site.root.x, site.root.z, P.dockClear), false);
  }

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
  const track = placeTrack(ctx, isl, yard);

  // test labs on lanes from the yard (lane 0 runs down to the pier), then the checkpoints
  campusLots(ctx, isl, plan, { ...P.campus, quadR: R }, rng.fork('campus'), sIdx, yard);
  placeStiltLab(ctx, isl, plan, site ? site.root : harbour, sIdx);
  placeGates(ctx, isl, yard);

  // Inspectors' Island culture (M19 TASK-424): last, round the finished factory
  plan.stories = inspectors(ctx, isl, plan, rng.fork('culture'), {
    yard,
    hangars,
    track,
    tower: tp,
    root: site ? site.root : null,
  });
  return plan;
};

/* ------------------------------------------------------------------------------------------ */
/* TASK-424 "Müfettişler Adası" (Inspectors' Island): the culture kit round the Test Factory.   */
/* ------------------------------------------------------------------------------------------ */

interface QaSite {
  yard: XZ;
  hangars: readonly Hangar[];
  track: Track | null;
  tower: XZ | null;
  root: XZ | null;
}

/** Geometry-local (x, z) of a prop facing `rotY` → world (+z = dirOf(rotY), +x = (sin, −cos)). */
const loc = (p: XZ, rotY: number, x: number, z: number): XZ => ({
  x: p.x + Math.sin(rotY) * x + Math.cos(rotY) * z,
  z: p.z - Math.cos(rotY) * x + Math.sin(rotY) * z,
});

/** applyPads' relaxation bound of a pad (circumradius + margin). */
const padBound = (sh: Shape, margin: number): number =>
  (sh.r > 0 ? sh.r : Math.hypot(sh.hw, sh.hd)) + margin;

interface KitOpts {
  /** Obstacles (and their pads) the prop may touch: the building it stands against. */
  ignore?: (o: Shape) => boolean;
  minShore?: number;
  maxRelief?: number;
  /** Its level pad margin (default QA_CULTURE_SITES.padMargin). */
  pad?: number;
  /** Skip the lane clearance (props against a building front by the yard). */
  lanesOk?: boolean;
}

interface Spot {
  p: XZ;
  rotY: number;
}

/**
 * Place the Inspectors' kit (ISLAND_CULTURES §2.5) round the yard, hangars, track, tower, gates
 * and labs; returns the story spots. Every number is QA_CULTURE_SITES; draws from forks of `rng`.
 */
function inspectors(
  ctx: SiteCtx,
  isl: IslandData,
  plan: SitePlan,
  rng: Rng,
  s: QaSite,
): StorySpot[] {
  const K = QA_CULTURE_SITES;
  const stories: StorySpot[] = [];
  const story = (kind: string, p: XZ, dy: number, rotY: number): void => {
    const def = QA_CULTURE.storySpots.find((d) => d.kind === kind);
    stories.push({
      kind,
      islandId: isl.id,
      // y above the ground: buildSettlements resolves it once the pads are flat
      pos: { x: p.x, y: dy, z: p.z },
      rotY,
      defs: def?.defs ?? [],
    });
  };
  const pins = (): XZ[] => [...plan.links.map((l) => l.pin), ...(s.root ? [s.root] : [])];
  const radius = (defId: string): number => FIXTURE_RADIUS[defId] ?? 0.5;
  const facing = (from: XZ, to: XZ): number => ang(to.x - from.x, to.z - from.z);

  /** `sh` fits: on land, level, clear of obstacles / lanes / footpath pins / other pad levels. */
  const fits = (sh: Shape, o: KitOpts = {}): boolean => {
    const minShore = o.minShore ?? 1.5;
    if (!onLand(ctx, isl, sh, minShore, 0.5)) return false;
    if (relief(ctx, sh) > (o.maxRelief ?? K.maxRelief)) return false;
    const rr = padBound(sh, 0);
    if (pins().some((q) => dist(q, sh) < K.pinClear + rr)) return false;
    for (const q of ctx.shapes[isl.id])
      if (q.tag !== 'plaza' && !o.ignore?.(q) && shapesOverlap(q, sh, K.gap)) return false;
    if (!o.lanesOk)
      for (const lane of ctx.lanes[isl.id])
        for (const q of lane) if (shapeDist(sh, q.x, q.z) < PATHS.halfWidth + 0.3) return false;
    // never inside the relax bound of a pad on another level (it would flatten the step away)
    const y = heightAt(ctx.h, sh.x, sh.z);
    for (const q of ctx.pads) {
      if (q.islandId !== isl.id || o.ignore?.(q.shape)) continue;
      if (Math.abs(heightAt(ctx.h, q.shape.x, q.shape.z) - y) <= K.stepTol) continue;
      if (dist(q.shape, sh) <= padBound(q.shape, q.margin) + padBound(sh, o.pad ?? K.padMargin))
        return false;
    }
    return true;
  };
  /** Fixture + obstacle (blocks the footpath grid) + a small level pad. */
  const put = (
    defId: string,
    sh: Shape,
    rotY: number,
    variant?: number,
    pad: number = K.padMargin,
  ): void => {
    ctx.fixtures.push({
      defId,
      x: sh.x,
      z: sh.z,
      rotY,
      islandId: isl.id,
      ...(variant === undefined ? {} : { variant }),
    });
    addShape(ctx, isl, sh, true);
    addPad(ctx, isl, sh, pad);
  };
  /** First candidate that fits (the def's K.rect, else its radius disc); null when none does. */
  const kitAt = (
    defId: string,
    cands: readonly Spot[],
    o: KitOpts = {},
    variant?: number,
  ): Spot | null => {
    const rs = (K.rect as Readonly<Record<string, readonly [number, number]>>)[defId];
    for (const c of cands) {
      const sh = rs
        ? rectShape(c.p.x, c.p.z, c.rotY, rs[0], rs[1])
        : discShape(c.p.x, c.p.z, radius(defId));
      if (!fits(sh, o)) continue;
      put(defId, sh, c.rotY, variant);
      return c;
    }
    return null;
  };

  // ---- Hall of Checks: the first hangar (furthest round from the harbour); desk + clipboards
  const hall = s.hangars.length ? s.hangars[0] : null;
  if (hall) {
    const fx = ctx.fixtures.find(
      (f) =>
        f.islandId === isl.id && f.defId === 'testHangar' && f.x === hall.p.x && f.z === hall.p.z,
    );
    if (fx) fx.variant = K.hallVariant;
    const rot = hall.a + Math.PI;
    const front = P.hangar[1] / 2;
    const own: KitOpts = { ignore: (o) => o === hall.sh, lanesOk: true };
    // desk one side of the door, clipboards the other (mirrored when a conveyor bridge is in the way)
    for (const sx of [1, -1]) {
      const desk = loc(hall.p, rot, sx * K.hall.desk[0], front + K.hall.desk[1]);
      if (!kitAt('stampDesk', [{ p: desk, rotY: rot }], own)) continue;
      story('sleepyStamp', desk, 0, rot);
      const boards = K.hall.boards.map(([x, z]) => ({
        p: loc(hall.p, rot, sx * x, front + z),
        rotY: rot,
      }));
      kitAt('clipboardWall', boards, own);
      break;
    }
  }

  // ---- Inspection booths beside the barrier gates (cone side first), window to the lane
  const B = K.booth;
  let booths = 0;
  for (const g of ctx.fixtures.filter((f) => f.islandId === isl.id && f.defId === 'barrierGate')) {
    if (booths >= B.max) break;
    const t = dirOf(g.rotY);
    const right = { x: t.z, z: -t.x };
    search: for (const sg of [-1, 1])
      for (const side of B.side)
        for (const along of B.along) {
          const c = add(add(g, right, sg * side), t, along);
          const rotY = ang(-sg * right.x, -sg * right.z);
          const sh = rectShape(c.x, c.z, rotY, B.size, B.size);
          if (!fits(sh, { maxRelief: B.maxRelief, pad: B.pad })) continue;
          put('inspectionBooth', sh, rotY, undefined, B.pad);
          booths++;
          break search;
        }
  }

  // ---- Flag mast at the QA tower's foot, beside its access path, facing the yard
  if (s.tower) {
    const tower = s.tower;
    const r = (LANDMARKS.qaTower.radius ?? 2.6) + K.mast.ring;
    const a0 = facing(tower, s.yard);
    const n = K.mast.samples;
    const cands: Spot[] = [];
    for (let k = 1; k <= n / 2; k++)
      for (const sg of [1, -1]) {
        const p = add(tower, dirOf(a0 + (sg * k * TAU) / n), r);
        cands.push({ p, rotY: facing(p, s.yard) });
      }
    const m = kitAt('flagMast', cands);
    if (m) story('greenLight', m.p, 0, m.rotY);
  }

  // ---- Scoreboard v0 ("BUGS: 0") on the yard rim across from the hall, facing the yard
  const S = K.scoreboard;
  const hallA = hall ? hall.a : 0;
  const rim = (ringR: number): { p: XZ; a: number }[] => {
    const out: { p: XZ; a: number }[] = [];
    for (let k = 0; k < S.samples; k++) {
      const a = (k / S.samples) * TAU;
      out.push({ p: add(s.yard, dirOf(a), P.yardR + ringR), a });
    }
    return out;
  };
  const across = rim(S.yardRing).sort(
    (u, v) => angGap(u.a, hallA + Math.PI) - angGap(v.a, hallA + Math.PI),
  );
  kitAt(
    'scoreboard',
    across.map((c) => ({ p: c.p, rotY: facing(c.p, s.yard) })),
    {},
    0,
  );

  // ---- Dummy benches on the yard rim, facing it (the first one's coffee break is a story)
  const D = K.benches;
  const want = rng.fork('benches').int(D.count[0], D.count[1]);
  const benchA: number[] = [];
  const benchRim = D.rings.flatMap((r) =>
    rim(r).sort((u, v) => angGap(u.a, hallA) - angGap(v.a, hallA)),
  );
  for (const c of benchRim) {
    if (benchA.length >= want) break;
    if (benchA.some((a) => angGap(a, c.a) < D.minApartDeg * DEG)) continue;
    const rotY = facing(c.p, s.yard);
    if (!kitAt('dummyBench', [{ p: c.p, rotY }])) continue;
    if (!benchA.length) story('dummyCoffee', loc(c.p, rotY, 0, 1.3), 0, rotY + Math.PI);
    benchA.push(c.a);
  }

  // ---- Loop track: UV lamps along its sides, the "BUGS: 1" scoreboard, the cone pyramid
  if (s.track) {
    const T = s.track;
    const [w, d] = P.track;
    const U = K.uvLamps;
    const lampN = rng.fork('uvLamps').int(U.count[0], U.count[1]);
    let lamps = 0;
    for (const [sx, sz] of [
      [1, 0],
      [-1, 1],
      [1, 1],
      [-1, 0],
    ] as const) {
      if (lamps >= lampN) break;
      const p = loc(T.p, T.rot, sx * (w / 2 + U.side), U.at[sz]);
      const l = kitAt('uvLampPost', [{ p, rotY: facing(p, T.p) }]);
      if (!l) continue;
      if (!lamps) story('uvBugHunt', loc(p, l.rotY, 0, -1.2), 0, l.rotY);
      lamps++;
    }
    const sides: Spot[] = [];
    for (const sx of [-1, 1])
      for (const z of [0, 3, -3]) {
        const p = loc(T.p, T.rot, sx * (w / 2 + S.trackSide), z);
        sides.push({ p, rotY: facing(p, loc(T.p, T.rot, 0, z)) });
      }
    // the board stands with its back to the track rim, face out to the yard side visitors
    const sb = kitAt('scoreboard', sides, {}, 1);
    if (sb) {
      const jar = loc(sb.p, sb.rotY, S.jar[0], S.jar[1]);
      kitAt('bugJar', [{ p: jar, rotY: sb.rotY }]);
      story('scoreboardDrop', loc(sb.p, sb.rotY, 0, 1.4), 0, sb.rotY + Math.PI);
    }
    const ends: Spot[] = [];
    for (const sz of [1, -1]) {
      const p = loc(T.p, T.rot, 0, sz * (d / 2 + K.cones.end));
      ends.push({ p, rotY: T.rot + (sz > 0 ? 0 : Math.PI) });
    }
    const cone = kitAt('conePyramid', ends);
    if (cone) story('gullOnCones', cone.p, K.gullY, cone.rotY);
  }

  // ---- Bug Zoo (terrarium v2) near a test lab, door to the nearest lane, its own footpath
  const Z = K.zoo;
  const labs = plan.lots.map((i) => ctx.lots[i]).filter((l) => l.defId === 'testLab');
  const zr = radius('terrarium');
  let zoo: Spot | null = null;
  for (const lab of labs) {
    let best: { p: XZ; score: number } | null = null;
    for (let r = Z.ring[0]; r <= Z.ring[1]; r += 2)
      for (let k = 0; k < Z.samples; k++) {
        const p = add(lab, dirOf(lab.rotY + (k / Z.samples) * TAU), r);
        const sh = discShape(p.x, p.z, zr);
        if (!fits(sh, { minShore: Z.minShore, maxRelief: Z.maxRelief, pad: Z.pad })) continue;
        if (!clear(ctx, isl, sh, 1) || !siteFree(ctx, isl, sh)) continue;
        const score = relief(ctx, sh) + 0.05 * r;
        if (!best || score < best.score - 1e-9) best = { p, score };
      }
    if (!best) continue;
    // door toward the nearest lane sample (else the lab)
    let to: XZ = lab;
    let bd = Infinity;
    for (const lane of ctx.lanes[isl.id])
      for (const q of lane)
        if (dist(q, best.p) < bd) {
          bd = dist(q, best.p);
          to = q;
        }
    const rotY = facing(best.p, to);
    put('terrarium', discShape(best.p.x, best.p.z, zr), rotY, Z.variant, Z.pad);
    plan.links.push({
      pin: add(best.p, dirOf(rotY), zr + Z.doorGap),
      kind: 'path',
      done: () => undefined,
    });
    zoo = { p: best.p, rotY };
    break;
  }
  if (zoo) {
    const z0 = zoo;
    const own: KitOpts = { ignore: (o) => o.r === zr && dist(o, z0.p) < 1e-6 };
    const jar = loc(z0.p, z0.rotY, Z.jar[0], Z.jar[1]);
    kitAt('bugJar', [{ p: jar, rotY: z0.rotY }], own);
    story('antTrail', loc(z0.p, z0.rotY, Z.ants[0], Z.ants[1]), 0, z0.rotY + Math.PI / 2);
  }

  // ---- Bug jars by the test labs: front corners beside the door, else under a side window
  const J = K.jars;
  for (const lab of labs.slice(0, J.labs)) {
    const own: KitOpts = { ignore: (o) => dist(o, lab) < 1e-6 };
    const cands: Spot[] = J.at.map(([fx, ox, fz, oz]) => ({
      p: loc(lab, lab.rotY, fx * (lab.w / 2) + ox, fz * (lab.d / 2) + oz),
      rotY: lab.rotY,
    }));
    kitAt('bugJar', cands, own);
  }

  // ---- The crab under inspection: a cone on the cove beach beside the pier root
  if (s.root) {
    const root = s.root;
    const C = K.crab;
    const pier = (o: Shape): boolean => o.r > 0 && dist(o, root) < 1e-6;
    const spot = bestSample(ctx, isl, root, C.search, (p, i) => {
      const y = ctx.h.data[i];
      if (y < C.y[0] || y > C.y[1] || dist(p, root) < C.minFromRoot) return Infinity;
      const sh = discShape(p.x, p.z, radius('trafficCone'));
      if (!fits(sh, { ignore: pier, minShore: C.minShore, maxRelief: C.maxRelief }))
        return Infinity;
      return dist(p, root);
    });
    if (spot) {
      ctx.fixtures.push({ defId: 'trafficCone', x: spot.x, z: spot.z, rotY: 0, islandId: isl.id });
      addShape(ctx, isl, discShape(spot.x, spot.z, radius('trafficCone')), false);
      // the crab faces the cone from the sea side
      story('crabInspection', spot, 0, facing(root, spot));
    }
  }
  return stories;
}
