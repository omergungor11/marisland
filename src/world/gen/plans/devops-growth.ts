/**
 * Emberpeak growth reservations (TASK-503, D-083): the sites the M25 DevOps I / M26 DevOps II
 * content will stand on, picked on the apron ring and the cone, reserved as obstacle shapes (lots
 * and kit keep off; paths still cross) and published as island anchors. No fixture, pad or zone.
 *
 * Anchor contract (world u; rotY = xz heading (cos, sin); `…Size` = {x: w, z: d} of the rect whose
 * depth axis is rotY, like QA `stunt` / `stuntSize`):
 * - `lavaChannel0..N-1` (D1): polyline from the rim notch down the windward slope to the apron lip,
 *   rotY = downhill heading of the segment leaving the point; `lavaFall` = the last point (D2 lip,
 *   rotY = out to sea). Reserved: a `width` + 2 × `margin` strip.
 * - `obsidianBeach` (D10): windward coast point beside the lava fall, rotY = out to sea.
 * - `funicular0..2` (D4): foot, mid-slope and summit stations on one heading, rotY = uphill.
 * - `cablewayFrom` (D13 quarry centre, rotY toward the foundry) + `quarrySize`, `cablewayTo` (a
 *   free disc on the foundry's upper step, rotY toward the quarry).
 * - `onsenTown` + `onsenTownSize` (D9): the bank beside the hot-spring pool, rotY toward the pool.
 * - `geyserField` + `geyserFieldSize` (D7): rotY = heading away from the pool.
 * - `smithsLane` + `smithsLaneSize` (D14): strip on the foundry lower shelf, w along the shelf.
 * - `craterDeck` (D6): rim disc, rotY toward the crater.
 * - `breakwater` (D18): harbour-mouth point in water, rotY = the arm's heading (along the coast).
 * Any anchor is missing when its site does not fit (tests track the rate).
 * Deterministic: no rng is drawn — every choice is a scored, ordered search.
 */
import { DEVOPS_GROWTH } from '../../../content/themes/devops-growth.ts';
import { heightAt } from '../../types.ts';
import type { IslandData, XZ } from '../../types.ts';
import {
  add,
  addShape,
  ang,
  bestSample,
  clear,
  discShape,
  dist,
  dirOf,
  onIsland,
  onLand,
  rectShape,
  relief,
  sdfAt,
  segDist,
  siteFree,
  type Shape,
  type SiteCtx,
} from '../sites.ts';

const G = DEVOPS_GROWTH;
const DEG = Math.PI / 180;

/** Smallest absolute difference of two angles (rad). */
const turn = (a: number, b: number): number => {
  const d = Math.abs(a - b) % (Math.PI * 2);
  return d > Math.PI ? Math.PI * 2 - d : d;
};
/** Signed shortest a → b (rad). */
const signedTurn = (a: number, b: number): number => {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
};

const setAnchor = (isl: IslandData, key: string, p: XZ, rotY: number): void => {
  isl.anchors[key] = { x: p.x, z: p.z, rotY };
};
const setSize = (isl: IslandData, key: string, w: number, d: number): void => {
  isl.anchors[key] = { x: w, z: d, rotY: 0 };
};

/** Headings round the crater the windward pieces keep off (shelves, spring), with their margin. */
function keepOffs(isl: IslandData, centre: XZ): [number, number][] {
  const out: [number, number][] = [];
  const at = (k: string, m: number): void => {
    const a = isl.anchors[k];
    if (a) out.push([ang(a.x - centre.x, a.z - centre.z), m * DEG]);
  };
  at('harbour', G.keepOff.harbour);
  for (const k of ['foundry', 'foundryUpper', 'datacenter', 'datacenterUpper'])
    at(k, G.keepOff.shelf);
  at('hotspring', G.keepOff.spring);
  return out;
}

const allowed = (a: number, offs: readonly [number, number][]): boolean =>
  offs.every(([h, m]) => turn(a, h) >= m);

/** Last on-island point along heading `a` from `c` whose shore distance is ≥ `shore`. */
function coastAlong(ctx: SiteCtx, isl: IslandData, c: XZ, a: number, shore: number): XZ | null {
  const d = dirOf(a);
  let last: XZ | null = null;
  for (let s = 2; s < isl.reach + 4; s += 0.5) {
    const p = add(c, d, s);
    if (!onIsland(ctx, isl, p.x, p.z)) {
      if (last) break;
      continue;
    }
    if (sdfAt(ctx, p.x, p.z) >= shore) last = p;
    else if (last && sdfAt(ctx, p.x, p.z) < 0) break;
  }
  return last;
}

/** Reserve a polyline as rect strips (lots keep off; paths cross). */
function reserveStrip(ctx: SiteCtx, isl: IslandData, pts: readonly XZ[], w: number): void {
  for (let k = 0; k + 1 < pts.length; k++) {
    const a = pts[k];
    const b = pts[k + 1];
    const mid = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
    addShape(
      ctx,
      isl,
      rectShape(mid.x, mid.z, ang(b.x - a.x, b.z - a.z), w, dist(a, b) + w),
      false,
    );
  }
}

export interface LavaReservation {
  points: XZ[];
  exit: number;
}

/**
 * D1/D2/D10: the lava channel from the notch to the windward apron lip (first, before every other
 * DevOps facility, so the lots keep off it), the lava fall at its end and the obsidian beach beside.
 */
export function reserveLava(ctx: SiteCtx, isl: IslandData, centre: XZ): LavaReservation | null {
  const L = G.lava;
  const notch = isl.anchors.notch;
  if (!notch) return null;
  const offs = keepOffs(isl, centre);
  const notchA = ang(notch.x - centre.x, notch.z - centre.z);
  const windward = ctx.windDir + Math.PI;
  // exit heading: allowed, closest to the notch heading, pulled toward windward
  let exit = NaN;
  let best = Infinity;
  for (let k = 0; k < 180; k++) {
    const a = (k / 180) * Math.PI * 2;
    if (!allowed(a, offs)) continue;
    const s = turn(a, notchA) + L.windward * turn(a, windward);
    if (s < best) {
      best = s;
      exit = a;
    }
  }
  if (!Number.isFinite(exit)) return null;
  const lip = coastAlong(ctx, isl, centre, exit, L.lipShore);
  if (!lip) return null;
  const r0 = dist(notch, centre);
  const r1 = dist(lip, centre);
  const rStraight = Math.max(r0, L.straightR * isl.radius);
  const rTurn = Math.max(rStraight + L.step, L.turnR * isl.radius);
  const dA = signedTurn(notchA, exit);
  const points: XZ[] = [];
  // below the groove the bed drifts (≤ `drift` per sample, ≤ `maxDrift` total) to the lowest of
  // a few headings, so it follows the gullies instead of climbing a shoulder
  let off = 0;
  for (let r = r0; r < r1 - 0.5; r += L.step) {
    const t = Math.min(1, Math.max(0, (r - rStraight) / (rTurn - rStraight)));
    const a = notchA + dA * t * t * (3 - 2 * t);
    if (r > rStraight) {
      let best = Infinity;
      let pick = off;
      for (const k of [-1, -0.5, 0, 0.5, 1]) {
        const o = Math.max(-L.maxDrift, Math.min(L.maxDrift, off + k * L.drift)) * DEG;
        const q = add(centre, dirOf(a + o), r);
        const y = heightAt(ctx.h, q.x, q.z) + Math.abs(o) / DEG / L.maxDrift;
        if (y < best) {
          best = y;
          pick = o / DEG;
        }
      }
      off = pick;
    }
    const p = add(centre, dirOf(a + off * DEG), r);
    if (!onIsland(ctx, isl, p.x, p.z)) return null;
    points.push(p);
  }
  const end = coastAlong(ctx, isl, centre, exit + off * DEG, L.lipShore) ?? lip;
  points.push(end);
  if (points.length < 3) return null;
  reserveStrip(ctx, isl, points, L.width + 2 * L.margin);
  points.forEach((p, k) => {
    const q = points[Math.min(k + 1, points.length - 1)];
    const o = points[Math.max(k - 1, 0)];
    const h = k + 1 < points.length ? ang(q.x - p.x, q.z - p.z) : ang(p.x - o.x, p.z - o.z);
    setAnchor(isl, `lavaChannel${k}`, p, h);
  });
  setAnchor(isl, 'lavaFall', end, exit + off * DEG);
  // obsidian beach: along the coast to the more windward side of the fall
  const O = G.obsidian;
  const dA2 = O.offset / Math.max(r1, 1);
  const ea = exit + off * DEG;
  const sides = [ea + dA2, ea - dA2].sort((a, b) => turn(a, windward) - turn(b, windward));
  for (const a of sides) {
    const p = coastAlong(ctx, isl, centre, a, O.shore);
    if (!p) continue;
    setAnchor(isl, 'obsidianBeach', p, a);
    addShape(ctx, isl, rectShape(p.x, p.z, a, O.size[0], O.size[1]), false);
    break;
  }
  return { points, exit: ea };
}

/** Best rect of the first size that fits round `c` (score: `cost`, Infinity = reject). */
function fitRect(
  ctx: SiteCtx,
  isl: IslandData,
  c: XZ,
  search: number,
  sizes: readonly (readonly [number, number])[],
  rotOf: (p: XZ) => number,
  ok: (sh: Shape, p: XZ) => number,
): { p: XZ; rot: number; w: number; d: number; sh: Shape } | null {
  for (const [w, d] of sizes) {
    const p = bestSample(ctx, isl, c, search, (q) => ok(rectShape(q.x, q.z, rotOf(q), w, d), q));
    if (p) {
      const rot = rotOf(p);
      return { p, rot, w, d, sh: rectShape(p.x, p.z, rot, w, d) };
    }
  }
  return null;
}

/** Common site test: on land, flat enough, clear of every obstacle and lane. */
function siteCost(
  ctx: SiteCtx,
  isl: IslandData,
  sh: Shape,
  minShore: number,
  maxRelief: number,
  gap: number,
): number {
  if (!onLand(ctx, isl, sh, minShore)) return Infinity;
  const rl = relief(ctx, sh);
  if (rl > maxRelief || !clear(ctx, isl, sh, gap) || !siteFree(ctx, isl, sh)) return Infinity;
  return rl;
}

/**
 * D4/D6/D7/D9/D13/D14/D18: the rest of the growth sites, after the shelf facilities (plant, data
 * centers, quad, ridge, harbour, foundry) and before the culture kit / lodges / village / M22
 * quick wins, which then keep off them.
 */
export function reserveGrowth(
  ctx: SiteCtx,
  isl: IslandData,
  centre: XZ,
  lava: LavaReservation | null,
): void {
  const spring = isl.anchors.hotspring;
  // D9 onsen town on the pool bank, then D7 the geyser field beyond it
  if (spring) {
    const O = G.onsen;
    const townAt = (R: number) =>
      fitRect(
        ctx,
        isl,
        spring,
        R,
        O.sizes,
        (p) => ang(spring.x - p.x, spring.z - p.z),
        (sh, p) => {
          const d = dist(p, spring);
          if (d < O.ring[0]) return Infinity;
          return siteCost(ctx, isl, sh, O.minShore, O.maxRelief, O.gap) + 0.3 * d;
        },
      );
    const town = townAt(O.ring[1]) ?? townAt(O.farther);
    if (town) {
      addShape(ctx, isl, town.sh, false);
      setAnchor(isl, 'onsenTown', town.p, town.rot);
      setSize(isl, 'onsenTownSize', town.w, town.d);
    }
    const Gy = G.geysers;
    const fieldAt = (R: number) =>
      fitRect(
        ctx,
        isl,
        spring,
        R,
        Gy.sizes,
        (p) => ang(p.x - spring.x, p.z - spring.z),
        (sh, p) => {
          const d = dist(p, spring);
          if (d < Gy.ring[0]) return Infinity;
          return siteCost(ctx, isl, sh, Gy.minShore, Gy.maxRelief, Gy.gap) + 0.1 * d;
        },
      );
    const field = fieldAt(Gy.ring[1]) ?? fieldAt(Gy.farther);
    if (field) {
      addShape(ctx, isl, field.sh, false);
      setAnchor(isl, 'geyserField', field.p, field.rot);
      setSize(isl, 'geyserFieldSize', field.w, field.d);
    }
  }
  // D14 smiths' lane on the foundry lower shelf (along it), else on the apron below
  const foundry = isl.anchors.foundry;
  if (foundry) {
    const Sm = G.smiths;
    const y0 = heightAt(ctx.h, foundry.x, foundry.z);
    for (const tol of [Sm.levelTol, Infinity]) {
      const lane = fitRect(
        ctx,
        isl,
        foundry,
        Sm.search,
        Sm.sizes,
        () => foundry.rotY,
        (sh, p) => {
          if (Math.abs(heightAt(ctx.h, p.x, p.z) - y0) > tol) return Infinity;
          return siteCost(ctx, isl, sh, Sm.minShore, Sm.maxRelief, Sm.gap) + 0.1 * dist(p, foundry);
        },
      );
      if (!lane) continue;
      addShape(ctx, isl, lane.sh, false);
      setAnchor(isl, 'smithsLane', lane.p, lane.rot);
      setSize(isl, 'smithsLaneSize', lane.w, lane.d);
      break;
    }
  }
  // D13 ore cableway: a free disc on the foundry's upper step, the quarry across the slope
  const upper = isl.anchors.foundryUpper;
  if (upper) {
    const C = G.cableway;
    const y0 = heightAt(ctx.h, upper.x, upper.z);
    const to = bestSample(ctx, isl, upper, C.toSearch, (p) => {
      if (Math.abs(heightAt(ctx.h, p.x, p.z) - y0) > C.toTol) return Infinity;
      const sh = discShape(p.x, p.z, C.toR);
      return siteCost(ctx, isl, sh, 1, C.toRelief, 0.5) + 0.1 * dist(p, upper);
    });
    const crosses = (a: XZ, b: XZ): boolean =>
      !!lava && lava.points.some((q) => segDist(q, a, b) < G.lava.width);
    const quarry = to
      ? fitRect(
          ctx,
          isl,
          to,
          C.span[1],
          C.quarry,
          (p) => ang(to.x - p.x, to.z - p.z),
          (sh, p) => {
            const d = dist(p, to);
            if (d < C.span[0]) return Infinity;
            const s = siteCost(ctx, isl, sh, C.minShore, C.quarryRelief, C.gap);
            return s * 0.3 + 0.05 * Math.abs(d - C.spanPref) + (crosses(p, to) ? 0 : C.crossBonus);
          },
        )
      : null;
    if (to && quarry) {
      addShape(ctx, isl, quarry.sh, false);
      addShape(ctx, isl, discShape(to.x, to.z, C.toR), false);
      setAnchor(isl, 'cablewayFrom', quarry.p, quarry.rot);
      setSize(isl, 'quarrySize', quarry.w, quarry.d);
      setAnchor(isl, 'cablewayTo', to, ang(quarry.p.x - to.x, quarry.p.z - to.z));
    }
  }
  const head = reserveFunicular(ctx, isl, centre, lava);
  reserveCraterDeck(ctx, isl, centre, lava, head);
  reserveBreakwater(ctx, isl);
}

/**
 * D4: three stations on one heading — the foot (first level ground off the cone), mid-slope and
 * just below the rim — on the first heading (nearest the harbour–foundry gap) where all three fit.
 * Returns the heading (NaN when none fits).
 */
function reserveFunicular(
  ctx: SiteCtx,
  isl: IslandData,
  centre: XZ,
  lava: LavaReservation | null,
): number {
  const F = G.funicular;
  const offs = keepOffs(isl, centre).map(([h, m]): [number, number] => [h, m * 0.6]);
  if (lava) offs.push([lava.exit, F.lavaOff * DEG]);
  const notch = isl.anchors.notch;
  if (notch) offs.push([ang(notch.x - centre.x, notch.z - centre.z), F.notchOff * DEG]);
  const harbour = isl.anchors.harbour;
  const foundry = isl.anchors.foundry;
  const pref =
    harbour && foundry
      ? (() => {
          const a = ang(harbour.x - centre.x, harbour.z - centre.z);
          return a + signedTurn(a, ang(foundry.x - centre.x, foundry.z - centre.z)) / 2;
        })()
      : ctx.windDir;
  const heads: number[] = [];
  for (let k = 0; k < 72; k++) heads.push((k / 72) * Math.PI * 2);
  heads.sort((a, b) => turn(a, pref) - turn(b, pref));
  const topY = isl.peakY - F.topBelow;
  for (const a of heads) {
    if (!allowed(a, offs)) continue;
    const d = dirOf(a);
    // the top: first sample below topY going out; the foot: first level ground below footY
    let top: XZ | null = null;
    let foot: XZ | null = null;
    // start at the rim (highest sample near the crater), never inside the crater bowl
    let s0 = 4;
    for (let s = 4, ry = -Infinity; s <= 18; s += 0.5) {
      const y = heightAt(ctx.h, centre.x + d.x * s, centre.z + d.z * s);
      if (y > ry) {
        ry = y;
        s0 = s;
      }
    }
    for (let s = s0; s < isl.reach; s += 1) {
      const p = add(centre, d, s);
      if (!onIsland(ctx, isl, p.x, p.z) || sdfAt(ctx, p.x, p.z) < 2) break;
      const y = heightAt(ctx.h, p.x, p.z);
      if (!top && y <= topY) top = p;
      if (top && y <= F.footY && relief(ctx, discShape(p.x, p.z, F.stationR)) <= F.footRelief) {
        foot = p;
        break;
      }
    }
    if (!top || !foot) continue;
    const yf = heightAt(ctx.h, foot.x, foot.z);
    const yt = heightAt(ctx.h, top.x, top.z);
    // mid: the sample nearest half height between them
    let mid: XZ | null = null;
    let md = Infinity;
    for (let s = dist(top, centre); s <= dist(foot, centre); s += 1) {
      const p = add(centre, d, s);
      const e = Math.abs(heightAt(ctx.h, p.x, p.z) - (yf + yt) / 2);
      if (e < md) {
        md = e;
        mid = p;
      }
    }
    if (!mid) continue;
    const ideal = [foot, mid, top];
    const st: XZ[] = [];
    for (let k = 0; k < 3; k++) {
      const p = bestSample(ctx, isl, ideal[k], F.search, (q) => {
        const sh = discShape(q.x, q.z, F.stationR);
        if (st.some((o) => dist(o, q) < 2 * F.stationR + F.gap)) return Infinity;
        return siteCost(ctx, isl, sh, 2, F.maxRelief[k], F.gap) + 0.3 * dist(q, ideal[k]);
      });
      if (!p) break;
      st.push(p);
    }
    if (st.length < 3) continue;
    st.forEach((p, k) => {
      addShape(ctx, isl, discShape(p.x, p.z, F.stationR), false);
      setAnchor(isl, `funicular${k}`, p, a + Math.PI);
    });
    return a;
  }
  return NaN;
}

/** D6: a rim disc facing the crater, nearest the funicular top heading, off the notch and lava. */
function reserveCraterDeck(
  ctx: SiteCtx,
  isl: IslandData,
  centre: XZ,
  lava: LavaReservation | null,
  head: number,
): void {
  const D = G.craterDeck;
  const notch = isl.anchors.notch;
  const notchA = notch ? ang(notch.x - centre.x, notch.z - centre.z) : NaN;
  const pref = Number.isFinite(head) ? head : ctx.windDir;
  let best: XZ | null = null;
  let bs = Infinity;
  for (let k = 0; k < 72; k++) {
    const a = (k / 72) * Math.PI * 2;
    if (Number.isFinite(notchA) && turn(a, notchA) < D.notchOff * DEG) continue;
    if (
      lava &&
      turn(a, ang(lava.points[0].x - centre.x, lava.points[0].z - centre.z)) < D.lavaOff * DEG
    )
      continue;
    // the rim: highest sample along the heading
    let rim: XZ | null = null;
    let ry = -Infinity;
    for (let s = D.rim[0]; s <= D.rim[1]; s += 0.5) {
      const p = add(centre, dirOf(a), s);
      const y = heightAt(ctx.h, p.x, p.z);
      if (y > ry) {
        ry = y;
        rim = p;
      }
    }
    if (!rim) continue;
    const sh = discShape(rim.x, rim.z, D.r);
    if (!onIsland(ctx, isl, rim.x, rim.z) || !clear(ctx, isl, sh, 0.5)) continue;
    const rl = relief(ctx, sh);
    if (rl > D.maxRelief) continue;
    const s = turn(a, pref) + 0.1 * rl;
    if (s < bs) {
      bs = s;
      best = rim;
    }
  }
  if (!best) return;
  addShape(ctx, isl, discShape(best.x, best.z, D.r), false);
  setAnchor(isl, 'craterDeck', best, ang(centre.x - best.x, centre.z - best.z));
}

/** D18: a water point off the harbour mouth, shifted to windward, arm along the coast. */
function reserveBreakwater(ctx: SiteCtx, isl: IslandData): void {
  const B = G.breakwater;
  const h = isl.anchors.harbour;
  if (!h) return;
  const f = dirOf(h.rotY);
  const t = { x: -f.z, z: f.x };
  const windward = dirOf(ctx.windDir + Math.PI);
  const side = t.x * windward.x + t.z * windward.z >= 0 ? 1 : -1;
  // first water along the shelf heading
  let s = 0;
  while (s < isl.reach && heightAt(ctx.h, h.x + f.x * s, h.z + f.z * s) > 0) s += 0.5;
  for (let k = 0; k < B.tries; k++) {
    const p = add(add(h, f, s + B.off + k * B.push), t, side * B.shift);
    if (heightAt(ctx.h, p.x, p.z) > -B.depth) continue;
    setAnchor(isl, 'breakwater', p, ang(t.x * side, t.z * side));
    return;
  }
}

/** The anchor polyline `prefix0..N-1` of an island (empty when absent). */
export function anchorChain(isl: IslandData, prefix: string): XZ[] {
  const out: XZ[] = [];
  for (let k = 0; isl.anchors[`${prefix}${k}`]; k++) {
    const a = isl.anchors[`${prefix}${k}`];
    out.push({ x: a.x, z: a.z });
  }
  return out;
}
