/**
 * Research M28 kit on its anchors (TASK-526, D-107): runs in the Research plan's `finish` right
 * after `reserveResearchAnchors` (TASK-524) and never searches for a site: every piece stands
 * where an anchor says (world/gen/plans/research-anchors.ts holds the contract).
 * - Star Stair: the `starStair` polyline resampled every ≈ 2 u (one `stairFlight` per point pair,
 *   STAIR_FLIGHT research look) as a 'stair' path, its foot linked straight to the nearest
 *   footpath point with a clear line, its top to the observatory door walk; returned to the
 *   settlement pass, which joins it to the path graph and paints it. The carved groove's grass
 *   becomes rock (the crag's cliff zone): the cut reads as stone, not as a green streak.
 * - Lanterns (`lanternPost` v3) on the `starLamp` stations, beside the flight on the side away
 *   from the other legs.
 * - The meridian `sundial` on `meridian`, local +z (blade high end, XII, noon line) along the
 *   sim's 12:00 gnomon shadow.
 * - A rim telescope deck (`tripodTelescope` v2) on every `rimDeck`, its sea side (local −z) out.
 * Numbers: content/themes/research-m28-site.ts. Fixtures carry explicit variants; no rng.
 */
import { RESEARCH_M28_SITE as S } from '../../../content/themes/research-m28-site.ts';
import { RESEARCH_ANCHORS as RA } from '../../../content/themes/research-anchors.ts';
import { STORY_KEEP_OUT } from '../../../content/placement.ts';
import {
  heightAt,
  Zone,
  type FixtureData,
  type IslandData,
  type Polyline,
  type StorySpot,
  type XZ,
} from '../../types.ts';
import { PATHS } from '../../../content/settlements.ts';
import { cellX, cellZ, gridRange } from '../grid.ts';
import { gridAStar } from '../paths.ts';
import { cellOf, dist, onIsland, sdfAt, segDist, shapeDist, type SiteCtx } from '../sites.ts';
import { storyKeepOuts } from '../story-keepout.ts';
import { anchorPoints, stairCarve, stairOf } from './research-anchors.ts';

const DEG = Math.PI / 180;
/** Zones the groove paint turns to rock (the lawn and meadow the carve cut through). */
const SOFT: readonly number[] = [Zone.grass, Zone.meadow, Zone.field, Zone.forest];
/** Non-blocking shape tags (the quad plaza, the stair's legs and landing). */
const PASS: readonly string[] = ['plaza', 'starStair', 'starLanding'];

/** A piece of the M28 kit (the Star Stair's flights and lanterns, the sundial, a rim deck). */
export const isSummitKit = (f: Pick<FixtureData, 'defId' | 'variant'>): boolean =>
  f.defId === 'sundial' ||
  f.defId === 'stairFlight' ||
  (f.defId === 'lanternPost' && f.variant === S.stair.lamp.variant) ||
  (f.defId === 'tripodTelescope' && f.variant === S.deck.variant);

/** `a` → `b` in ≈ `step` u pieces (end points included). */
function resampled(a: XZ, b: XZ, step: number): XZ[] {
  const n = Math.max(1, Math.round(dist(a, b) / step));
  const out: XZ[] = [];
  for (let k = 0; k <= n; k++)
    out.push({ x: a.x + ((b.x - a.x) * k) / n, z: a.z + ((b.z - a.z) * k) / n });
  return out;
}

/** Distance from `p` to the polyline `pts`. */
const polyDist = (p: XZ, pts: readonly XZ[]): number => {
  let d = Infinity;
  for (let k = 0; k + 1 < pts.length; k++) d = Math.min(d, segDist(p, pts[k], pts[k + 1]));
  return d;
};

/** Straight line `a` → `b` on this island, off the coast and the path-blocking grid. */
function lineClear(ctx: SiteCtx, isl: IslandData, a: XZ, b: XZ): boolean {
  const L = S.stair.link;
  const len = dist(a, b);
  const n = Math.max(1, Math.ceil(len / L.sample));
  for (let k = 0; k <= n; k++) {
    const p = { x: a.x + ((b.x - a.x) * k) / n, z: a.z + ((b.z - a.z) * k) / n };
    if (!onIsland(ctx, isl, p.x, p.z) || sdfAt(ctx, p.x, p.z) < L.shore) return false;
    // (the ends lie on a footpath / the stair: their own cells may border a blocked one)
    if (dist(p, a) < 1 || dist(p, b) < 1) continue;
    const i = cellOf(ctx, p.x, p.z);
    if (i < 0 || ctx.blocked[i]) return false;
  }
  return true;
}

/**
 * Cells blocked only by small pieces that may give way to the foot link (`link.yieldTo`: a quad
 * rim lantern, a bench, a tea trolley walled seed 1001's stair foot in): cell → those fixtures.
 */
function softCells(
  ctx: SiteCtx,
  isl: IslandData,
  c: XZ,
  reach: number,
): Map<number, FixtureData[]> {
  const yieldTo: readonly string[] = S.stair.link.yieldTo;
  const small = ctx.fixtures.filter(
    (f) => f.islandId === isl.id && yieldTo.includes(f.defId) && dist(f, c) <= reach + 3,
  );
  const out = new Map<number, FixtureData[]>();
  const [x0, x1] = gridRange(c.x - reach, c.x + reach);
  const [z0, z1] = gridRange(c.z - reach, c.z + reach);
  // (the plaza disc and the stair's own reservations never block the path grid)
  const shapes = ctx.shapes[isl.id].filter(
    (o) => dist(o, c) <= reach + 8 && !(o.tag && PASS.includes(o.tag)),
  );
  for (let iz = z0; iz <= z1; iz++)
    for (let ix = x0; ix <= x1; ix++) {
      const i = iz * ctx.n + ix;
      if (!ctx.blocked[i]) continue;
      const p = { x: cellX(ix), z: cellZ(iz) };
      const own: FixtureData[] = [];
      let hard = false;
      for (const o of shapes) {
        if (shapeDist(o, p.x, p.z) > 0.5) continue;
        const f = small.find((q) => dist(q, o) < 0.05);
        if (!f) {
          hard = true;
          break;
        }
        own.push(f);
      }
      if (!hard && own.length > 0) out.set(i, own);
    }
  return out;
}

/**
 * The link from `p` to the footpath network: points from a footpath point to `p` (exclusive), or
 * null. First the nearest footpath point within `reach` with a clear straight line; else (when
 * `route`) a grid route (Dijkstra over the path-blocking grid, grade ≤ `link.maxSlope`, within
 * `reach`; a cell blocked only by `yieldTo` pieces costs `yieldCost` × and those pieces leave) to
 * the nearest footpath cell, string-pulled to straight clear legs.
 */
function linkTo(
  ctx: SiteCtx,
  isl: IslandData,
  p: XZ,
  reach: number,
  walk: readonly XZ[],
  stair: readonly XZ[],
  route: boolean,
): XZ[] | null {
  const cands = walk
    .map((q) => ({ q, d: dist(p, q) }))
    .filter((c) => c.d <= reach)
    .sort((a, b) => a.d - b.d || a.q.x - b.q.x || a.q.z - b.q.z);
  for (const { q } of cands) {
    // the link must not cut back across the stair's own legs
    const mid = { x: (p.x + q.x) / 2, z: (p.z + q.z) / 2 };
    if (polyDist(mid, stair) < 1 && dist(mid, p) > 1) continue;
    if (lineClear(ctx, isl, q, p)) return [q];
  }
  if (!route || cands.length === 0) return null;
  const L = S.stair.link;
  const n = ctx.n;
  const goal = new Map<number, XZ>();
  for (const { q } of cands) {
    const i = cellOf(ctx, q.x, q.z);
    if (i >= 0 && !goal.has(i)) goal.set(i, q);
  }
  const soft = softCells(ctx, isl, p, reach);
  const s0 = cellOf(ctx, p.x, p.z);
  const [x0, x1] = gridRange(p.x - reach, p.x + reach);
  const [z0, z1] = gridRange(p.z - reach, p.z + reach);
  const id = isl.id + 1;
  const h = ctx.h.data;
  const cells = gridAStar({
    n,
    x0,
    z0,
    x1,
    z1,
    start: s0,
    goal: -1,
    isGoal: (i) => goal.has(i),
    step: (a, b, d) => {
      if (ctx.islandMap[b] !== id || ctx.sdf[b] < L.shore) return Infinity;
      if (ctx.blocked[b] && !goal.has(b) && !soft.has(b)) return Infinity;
      const run = d * ctx.h.cellSize;
      const slope = Math.abs(h[b] - h[a]) / run;
      if (slope > L.maxSlope) return Infinity;
      // (cells along the stair's own legs cost extra: the link leaves the foot, not the flight)
      const c = { x: cellX(b % n), z: cellZ(Math.floor(b / n)) };
      return (
        run *
        (1 + PATHS.slopeCost * slope) *
        (polyDist(c, stair) < 1.5 ? 4 : 1) *
        (soft.has(b) ? L.yieldCost : 1)
      );
    },
    hScale: 0,
  });
  if (!cells || cells.length < 2) return null;
  // the small pieces the route crosses give way
  const gone = new Set<FixtureData>();
  for (const i of cells) for (const f of soft.get(i) ?? []) gone.add(f);
  if (gone.size > 0) {
    const keep = ctx.fixtures.filter((f) => !gone.has(f));
    ctx.fixtures.length = 0;
    ctx.fixtures.push(...keep);
    for (let i = 0; i < ctx.blocked.length; i++) if (soft.has(i)) ctx.blocked[i] = 0;
  }
  const q = goal.get(cells[cells.length - 1]) as XZ;
  // from the footpath point back to the foot: cell centres, string-pulled
  const raw: XZ[] = [
    q,
    ...cells
      .slice(1, -1)
      .reverse()
      .map((i) => ({ x: cellX(i % n), z: cellZ(Math.floor(i / n)) })),
    p,
  ];
  const out: XZ[] = [raw[0]];
  let k = 0;
  while (k < raw.length - 1) {
    let j = raw.length - 1;
    while (j > k + 1 && !lineClear(ctx, isl, raw[k], raw[j])) j--;
    if (j < raw.length - 1) out.push(raw[j]);
    k = j;
  }
  return out;
}

/**
 * Place the M28 kit; returns the Star Stair path (empty without a stair) for the settlement pass
 * to join to the graph and paint.
 */
export function placeSummitKit(
  ctx: SiteCtx,
  isl: IslandData,
  paths: readonly Polyline[],
  stories: readonly StorySpot[],
): Polyline[] {
  const A = isl.anchors;
  const id = isl.id;
  const out: Polyline[] = [];
  const stair = stairOf(isl);
  if (stair.length >= 2) {
    // ---- the groove: carved (or steep, under a switchback) lawn → the crag's rock
    const G = S.stair.groove;
    const cut = stairCarve(isl);
    const n = ctx.n;
    const d = ctx.h.data;
    const [x0, x1] = gridRange(
      Math.min(...stair.map((q) => q.x)) - G.core,
      Math.max(...stair.map((q) => q.x)) + G.core,
    );
    const [z0, z1] = gridRange(
      Math.min(...stair.map((q) => q.z)) - G.core,
      Math.max(...stair.map((q) => q.z)) + G.core,
    );
    for (let iz = z0; iz <= z1; iz++)
      for (let ix = x0; ix <= x1; ix++) {
        const i = iz * n + ix;
        if (ctx.islandMap[i] !== id + 1 || !SOFT.includes(ctx.zone[i])) continue;
        const p = { x: cellX(ix), z: cellZ(iz) };
        if (polyDist(p, stair) > G.core) continue;
        const slope = Math.hypot(d[i + 1] - d[i - 1], d[i + n] - d[i - n]) / (2 * ctx.h.cellSize);
        if (Math.abs(cut.get(i) ?? 0) > G.depth || slope > G.steep) ctx.zone[i] = Zone.cliff;
      }
    // ---- the crag's foot: a lawn cell at the bottom of the riser (a neighbour ≥ `drop` u
    // higher) tinted the steep face green up to the summit lip; it takes the crag's rock too.
    // So does a lawn cell on the face itself (steeper than `steep` on the final ground; the dial
    // disc and the deck sites keep their lawn): the zones were derived before the pads and the
    // carve, and Research keeps steep inland ground lawn unless the riser tag says cliff, so the
    // riser's soft edge and the faces the summit / meridian / quad pads cut into the crag stayed
    // lawn, their colour blended up the face as a green halo (TASK-529)
    const obs = stair[stair.length - 1];
    const F = S.stair.cragFoot;
    const keep = [
      ...(A.meridian ? [{ ...A.meridian, r: RA.meridian.r }] : []),
      ...anchorPoints(isl, 'rimDeck').map((q) => ({ ...q, r: RA.deck.w / 2 })),
    ];
    const [fx0, fx1] = gridRange(obs.x - F.reach, obs.x + F.reach);
    const [fz0, fz1] = gridRange(obs.z - F.reach, obs.z + F.reach);
    const foot: number[] = [];
    for (let iz = fz0; iz <= fz1; iz++)
      for (let ix = fx0; ix <= fx1; ix++) {
        const i = iz * n + ix;
        if (ctx.islandMap[i] !== id + 1 || !SOFT.includes(ctx.zone[i])) continue;
        const p = { x: cellX(ix), z: cellZ(iz) };
        if (dist(p, obs) > F.reach) continue;
        if ([1, -1, n, -n].some((o) => d[i + o] - d[i] >= F.drop)) foot.push(i);
        else if (
          Math.hypot(d[i + 1] - d[i - 1], d[i + n] - d[i - n]) / (2 * ctx.h.cellSize) > F.steep &&
          !keep.some((k) => dist(p, k) <= k.r)
        )
          foot.push(i);
      }
    for (const i of foot) ctx.zone[i] = Zone.cliff;
    // ---- the stair path: foot link + the legs every ≈ 2 u + top link
    const legs: XZ[] = [stair[0]];
    for (let k = 0; k + 1 < stair.length; k++)
      legs.push(...resampled(stair[k], stair[k + 1], S.stair.step).slice(1));
    const walk = paths
      .filter((p) => p.islandId === id && p.kind !== 'boardwalk')
      .flatMap((p) => p.points);
    const L = S.stair.link;
    const footLink0 = linkTo(ctx, isl, stair[0], L.reach, walk, stair, true);
    const top = linkTo(ctx, isl, stair[stair.length - 1], L.topReach, walk, stair, false);
    // (link vertices every ≈ 2 u too: a sloped lawn piece gets its own flight or none)
    const chain = (ps: readonly XZ[]): XZ[] => {
      const o: XZ[] = [ps[0]];
      for (let k = 0; k + 1 < ps.length; k++)
        o.push(...resampled(ps[k], ps[k + 1], S.stair.step).slice(1));
      return o;
    };
    const pts = [
      ...(footLink0 ? chain([...footLink0, stair[0]]).slice(0, -1) : []),
      ...legs,
      ...(top ? chain([stair[stair.length - 1], top[0]]).slice(1) : []),
    ];
    out.push({ islandId: id, kind: 'stair', closed: false, points: pts });
    const footLink = footLink0 ? [...footLink0, stair[0]] : [];
    const topLink = top ? [stair[stair.length - 1], top[0]] : [];
    // ---- lanterns on the flight's edge, on the side away from the other legs
    const Lp = S.stair.lamp;
    // the flight surface at `q` on the centre line: its piece's ends, straight between (as built)
    const flightY = (pts: readonly XZ[], q: XZ): number => {
      let k = 0;
      for (let j = 1; j + 1 < pts.length; j++)
        if (segDist(q, pts[j], pts[j + 1]) < segDist(q, pts[k], pts[k + 1])) k = j;
      const [a, b] = [pts[k], pts[k + 1]];
      const l2 = (b.x - a.x) ** 2 + (b.z - a.z) ** 2;
      const t = Math.max(
        0,
        Math.min(1, ((q.x - a.x) * (b.x - a.x) + (q.z - a.z) * (b.z - a.z)) / l2),
      );
      const ya = heightAt(ctx.h, a.x, a.z);
      return ya + (heightAt(ctx.h, b.x, b.z) - ya) * t;
    };
    // (off the story stages: clearStoryStages would drop a lantern there; it is a tall pole)
    const stages = stories
      .filter((sp) => sp.islandId === id)
      .flatMap((sp) => storyKeepOuts(sp, STORY_KEEP_OUT.tall.extra));
    for (let k = 0; A[`starLamp${k}`]; k++) {
      const a = A[`starLamp${k}`];
      // its own leg: the nearest one running along the station's heading (at a switchback
      // both legs touch it)
      const runs = (j: number): boolean =>
        Math.cos(Math.atan2(stair[j + 1].z - stair[j].z, stair[j + 1].x - stair[j].x) - a.rotY) >
        0.999;
      let own = -1;
      for (let j = 0; j + 1 < stair.length; j++)
        if (
          runs(j) &&
          (own < 0 || segDist(a, stair[j], stair[j + 1]) < segDist(a, stair[own], stair[own + 1]))
        )
          own = j;
      if (own < 0) continue;
      // (the other legs; the links to the network only off their treads: they may continue the leg)
      const others = (q: XZ): number => {
        let best = Infinity;
        for (let j = 0; j + 1 < stair.length; j++)
          if (j !== own) best = Math.min(best, segDist(q, stair[j], stair[j + 1]));
        return best;
      };
      const offLinks = (q: XZ): boolean =>
        Math.min(polyDist(q, footLink), polyDist(q, topLink)) >= Lp.linkGap;
      const ux = Math.cos(a.rotY);
      const uz = Math.sin(a.rotY);
      const nx = -uz;
      const nz = ux;
      // near a switchback the station slides along its leg (`slide` u steps) until a side is free
      let pick: { s: number; q: XZ; y: number } | null = null;
      const steps = resampled(stair[own], stair[own + 1], S.stair.step);
      // (along its own leg only: past a switchback it would hang beside nothing)
      const along = (a.x - stair[own].x) * ux + (a.z - stair[own].z) * uz;
      const legLen = dist(stair[own], stair[own + 1]);
      for (const t of Lp.slide) {
        if (along + t < 0 || along + t > legLen) continue;
        const sides = [1, -1]
          .map((s) => ({
            s,
            q: { x: a.x + ux * t + nx * s * Lp.side, z: a.z + uz * t + nz * s * Lp.side },
          }))
          .map((c) => ({
            ...c,
            d: others(c.q),
            // the treads' height under it
            y: flightY(steps, { x: a.x + ux * t, z: a.z + uz * t }),
          }))
          .filter(
            (c) =>
              c.d >= Lp.legGap &&
              offLinks(c.q) &&
              onIsland(ctx, isl, c.q.x, c.q.z) &&
              !stages.some((sh) => shapeDist(sh, c.q.x, c.q.z) < 0),
          )
          .sort((p, q) => q.d - p.d);
        if (sides.length > 0) {
          pick = sides[0];
          break;
        }
      }
      if (!pick) continue;
      const { s, q, y } = pick;
      ctx.fixtures.push({
        defId: 'lanternPost',
        x: q.x,
        z: q.z,
        // facing the steps
        rotY: Math.atan2(-nz * s, -nx * s),
        islandId: id,
        variant: Lp.variant,
        // on the flight's tread edge, level with its treads (the crag face beside the carved
        // line falls away or rises: its ground is not the steps')
        y,
      });
    }
  }
  // ---- the meridian sundial: local +z along the 12:00 gnomon shadow
  const m = A.meridian;
  if (m)
    ctx.fixtures.push({
      defId: 'sundial',
      x: m.x,
      z: m.z,
      rotY: S.sundial.noonShadowDeg * DEG,
      islandId: id,
      variant: 0,
    });
  // ---- rim decks: the sea side (local −z) out along the anchor's heading
  for (let k = 0; A[`rimDeck${k}`]; k++) {
    const d = A[`rimDeck${k}`];
    ctx.fixtures.push({
      defId: 'tripodTelescope',
      x: d.x,
      z: d.z,
      rotY: d.rotY + Math.PI,
      islandId: id,
      variant: S.deck.variant,
    });
  }
  return out;
}
