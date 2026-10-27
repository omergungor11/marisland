/**
 * DevOps M22 quick wins (TASK-482, WORLD_PLAN §4.4, D-062 R3-13), on top of the Ember Works plan:
 * - D8 fumarole pools: a trio of level, kerbless pool discs on the cone flank (teal / sulphur /
 *   pink zones inside a salt rim; FUMAROLE_ZONES);
 * - D11 basalt columns: clusters of basaltBoulder v2 (hex columns) on the windward shore at the
 *   foot of a steep rise;
 * - D12 switchback service roads: 'stair' links (switchbacks inside a corridor) from the summit
 *   watch tower down to the hub and from every shelf facility up to the tower, and a lava lantern
 *   every few path samples on the cone (the `finish` pass, once the paths exist).
 * Every random decision draws from the `rng` it is given; tuning lives in DEVOPS_SITE.
 */
import type { Rng } from '../../../core/rng.ts';
import { FLATTEN, PATHS } from '../../../content/settlements.ts';
import { DEVOPS_SITE, FUMAROLE_ZONES } from '../../../content/themes/devops.ts';
import { heightAt, Zone } from '../../types.ts';
import type { IslandData, Polyline, XZ } from '../../types.ts';
import { cellX, cellZ, gridRange } from '../grid.ts';
import { forSamplesNearSegment } from '../paths.ts';
import {
  add,
  addPad,
  addShape,
  ang,
  bestSample,
  cellOf,
  clear,
  discShape,
  lotShape,
  dist,
  dirOf,
  onIsland,
  onLand,
  relief,
  sdfAt,
  shapeDist,
  unit,
  type LinkReq,
  type SiteCtx,
} from '../sites.ts';
import { paintZone } from './devops-works.ts';

const S = DEVOPS_SITE;

/** Smallest absolute difference of two angles (rad). */
const turn = (a: number, b: number): number => {
  const d = Math.abs(a - b) % (Math.PI * 2);
  return d > Math.PI ? Math.PI * 2 - d : d;
};

/**
 * D8: the pool trio on the cone flank between the crater and the hub (pads at their own levels,
 * zones painted, blocking obstacles). Returns the pool centres (empty when nothing fits).
 */
export function placeFumaroles(ctx: SiteCtx, isl: IslandData, centre: XZ, hub: XZ): XZ[] {
  const F = S.fumaroles;
  const head = ang(hub.x - centre.x, hub.z - centre.z);
  const trio = (c: XZ, a0: number): XZ[] =>
    F.radii.map((_, k) => add(c, dirOf(a0 + (k * Math.PI * 2) / 3), F.spread));
  // the trio's first pool points uphill (toward the crater): the others step down beside it;
  // a second pass takes rougher ground (the pads level the core of each disc)
  const search = (maxRelief: number): XZ | null =>
    bestSample(ctx, isl, centre, F.dist[1], (p, i) => {
      if (dist(p, centre) < F.dist[0]) return Infinity;
      const y = ctx.h.data[i];
      if (y < F.y[0] || y > F.y[1] || ctx.sdf[i] < F.minShore + F.spread) return Infinity;
      const a0 = ang(centre.x - p.x, centre.z - p.z);
      let rel = 0;
      for (const [k, q] of trio(p, a0).entries()) {
        const sh = discShape(q.x, q.z, F.radii[k] + F.rim);
        if (!onLand(ctx, isl, sh, F.minShore) || !clear(ctx, isl, sh, 1)) return Infinity;
        // TASK-503: off every lot's pad core, or the relaxation averages the two levels (the
        // summit tower sank 8 u onto a pool's level on seed 3630)
        const core = sh.r + F.padMargin + FLATTEN.lotMargin;
        if (ctx.lots.some((l) => l.islandId === isl.id && shapeDist(lotShape(l), q.x, q.z) < core))
          return Infinity;
        rel = Math.max(rel, relief(ctx, sh));
      }
      if (rel > maxRelief) return Infinity;
      return rel + F.heading * turn(ang(p.x - centre.x, p.z - centre.z), head);
    });
  const best = search(F.maxRelief) ?? search(F.maxRelief * F.rough);
  if (!best) return [];
  const pools = trio(best, ang(centre.x - best.x, centre.z - best.z));
  pools.forEach((q, k) => {
    const r = F.radii[k];
    const sh = discShape(q.x, q.z, r + F.rim);
    addShape(ctx, isl, sh, true);
    addPad(ctx, isl, sh, F.padMargin, F.padStep);
    paintZone(ctx, isl, sh, FUMAROLE_ZONES.rim);
  });
  // the pools over the rims (a neighbour's rim never covers a pool)
  pools.forEach((q, k) =>
    paintZone(ctx, isl, discShape(q.x, q.z, F.radii[k]), FUMAROLE_ZONES.pools[k]),
  );
  return pools;
}

/**
 * D11: basalt column clusters on the windward shore at the foot of a steep rise (the bluff or the
 * cone wall). Cluster centres from the shuffled candidate samples, ≥ `gap` apart.
 */
export function placeColumns(
  ctx: SiteCtx,
  isl: IslandData,
  rng: Rng,
  lee: (p: XZ) => number,
): number {
  const B = S.columns;
  const cand: XZ[] = [];
  const [x0, x1] = gridRange(isl.minX, isl.maxX);
  const [z0, z1] = gridRange(isl.minZ, isl.maxZ);
  for (let iz = z0; iz <= z1; iz++)
    for (let ix = x0; ix <= x1; ix++) {
      const i = iz * ctx.n + ix;
      if (ctx.islandMap[i] !== isl.id + 1) continue;
      const s = ctx.sdf[i];
      if (s < B.shore[0] || s > B.shore[1] || ctx.h.data[i] > B.maxY) continue;
      const p = { x: cellX(ix), z: cellZ(iz) };
      if (lee(p) > B.maxLee) continue;
      // inland = up the shore-distance gradient; the ground there must rise steeply
      const g = { x: sdfAt(ctx, p.x + 2, p.z) - sdfAt(ctx, p.x - 2, p.z), z: 0 };
      g.z = sdfAt(ctx, p.x, p.z + 2) - sdfAt(ctx, p.x, p.z - 2);
      const l = Math.hypot(g.x, g.z);
      if (l < 1e-3) continue;
      const q = add(p, { x: g.x / l, z: g.z / l }, B.probe);
      if (heightAt(ctx.h, q.x, q.z) - ctx.h.data[i] < B.rise) continue;
      cand.push(p);
    }
  rng.shuffle(cand);
  const want = rng.int(B.clusters[0], B.clusters[1]);
  const centres: XZ[] = [];
  let placed = 0;
  for (const c of cand) {
    if (centres.length >= want) break;
    if (centres.some((o) => dist(o, c) < B.gap)) continue;
    if (!clear(ctx, isl, discShape(c.x, c.z, 1), 0.5)) continue;
    const n = rng.int(B.perCluster[0], B.perCluster[1]);
    const put: XZ[] = [];
    for (let t = 0; t < n * 4 && put.length < n; t++) {
      const q =
        put.length === 0 ? c : add(c, dirOf(rng.range(0, Math.PI * 2)), rng.range(0.8, B.spread));
      if (!onIsland(ctx, isl, q.x, q.z) || heightAt(ctx.h, q.x, q.z) < 0.1) continue;
      if (heightAt(ctx.h, q.x, q.z) > B.maxY + 1) continue;
      if (put.some((o) => dist(o, q) < B.sep)) continue;
      if (!clear(ctx, isl, discShape(q.x, q.z, 0.6), 0.2)) continue;
      put.push(q);
    }
    if (put.length === 0) continue;
    centres.push(c);
    for (const q of put) {
      ctx.fixtures.push({
        defId: 'basaltBoulder',
        x: q.x,
        z: q.z,
        rotY: rng.range(0, Math.PI * 2),
        islandId: isl.id,
        variant: B.variant,
      });
      addShape(ctx, isl, discShape(q.x, q.z, 0.6), true);
      placed++;
    }
  }
  return placed;
}

/**
 * Hairpin corners of one switchback road from `top` down to `foot` (both included): legs of about
 * `legRise` u of drop, alternating `amp` / 2 either side of the top -> foot line; a corner that is
 * off the land, too near the shore or on an obstacle tries half the swing, then the line itself.
 */
function hairpins(ctx: SiteCtx, isl: IslandData, top: XZ, foot: XZ): XZ[] {
  const W = S.switchback;
  const drop = heightAt(ctx.h, top.x, top.z) - heightAt(ctx.h, foot.x, foot.z);
  const n = Math.max(W.legs[0], Math.min(W.legs[1], Math.round(drop / W.legRise)));
  const u = unit(top, foot);
  const side = { x: -u.z, z: u.x };
  const L = dist(top, foot);
  const ok = (q: XZ): boolean => {
    const i = cellOf(ctx, q.x, q.z);
    return (
      i >= 0 &&
      ctx.islandMap[i] === isl.id + 1 &&
      ctx.sdf[i] >= W.minShore &&
      !ctx.blocked[i] &&
      heightAt(ctx.h, q.x, q.z) > 1
    );
  };
  const out: XZ[] = [top];
  for (let k = 1; k < n; k++) {
    const base = add(top, u, (L * k) / n);
    const sg = k % 2 === 1 ? 1 : -1;
    const q = [1, 0.5, 0].map((f) => add(base, side, (sg * f * W.amp) / 2)).find(ok);
    if (q) out.push(q);
  }
  out.push(foot);
  return out;
}

/**
 * D12: the switchback roads as chains of 'stair' links, one per leg, each searched inside a narrow
 * corridor along its leg (so the legs stay straight and the hairpins sharp), in attach order:
 * the hub road first, built from the hub up to the tower door (so the summit joins the network),
 * then every chosen shelf foot's road from the door down. The caller puts them at the FRONT of the
 * plan's links, before the facility links (a later facility link then reuses a road's foot).
 */
export function switchbackLinks(
  ctx: SiteCtx,
  isl: IslandData,
  centre: XZ,
  door: XZ,
  hub: XZ,
): LinkReq[] {
  const W = S.switchback;
  const none = (): void => undefined;
  const leg = (pin: XZ, to: XZ): LinkReq => ({
    pin,
    kind: 'stair',
    corridor: { a: pin, b: to, half: W.corridor },
    done: none,
  });
  const links: LinkReq[] = [];
  // hub road: bottom up (the hub is the only net cell yet)
  const up = hairpins(ctx, isl, door, hub);
  for (let k = up.length - 2; k >= 0; k--) links.push(leg(up[k], up[k + 1]));
  const used = [ang(hub.x - centre.x, hub.z - centre.z)];
  let roads = 1;
  for (const key of W.feet) {
    if (roads >= W.maxRoads) break;
    const a = isl.anchors[key];
    if (!a) continue;
    const h = ang(a.x - centre.x, a.z - centre.z);
    if (used.some((v) => turn(v, h) < W.minTurn)) continue;
    used.push(h);
    roads++;
    // foot roads: top down from the door (already on the network)
    const down = hairpins(ctx, isl, door, add(a, unit(a, centre), W.footIn));
    for (let k = 1; k < down.length; k++) links.push(leg(down[k], down[k - 1]));
  }
  return links;
}

/**
 * D12 roads + lanterns (plan `finish` pass): the stair paths are repainted in Zone.streetDevops,
 * and a lavaLantern stands beside every `every`-th sample of this
 * island's paths where the ground is above `minY` (the cone roads), on the downhill side, clear of
 * paths and obstacles. Returns the count.
 */
export function placeRoadLanterns(
  ctx: SiteCtx,
  isl: IslandData,
  paths: readonly Polyline[],
): number {
  const W = S.switchback;
  const pts: XZ[] = [];
  for (const p of paths) if (p.islandId === isl.id) pts.push(...p.points);
  const offPath = (q: XZ): boolean =>
    pts.every((o) => Math.hypot(o.x - q.x, o.z - q.z) > PATHS.halfWidth + W.gap);
  // the roads themselves in the island's street zone (pale gravel on the dark cone)
  for (const p of paths) {
    if (p.islandId !== isl.id || p.kind !== 'stair') continue;
    for (let k = 0; k + 1 < p.points.length; k++)
      forSamplesNearSegment(ctx.h, p.points[k], p.points[k + 1], PATHS.halfWidth, (i) => {
        if (ctx.zone[i] === Zone.path) ctx.zone[i] = Zone.streetDevops;
      });
  }
  let n = 0;
  for (const p of paths) {
    if (p.islandId !== isl.id || p.kind === 'boardwalk') continue;
    const P = p.points;
    for (let k0 = Math.floor(W.every / 2); k0 < P.length; k0 += W.every) {
      if (n >= W.maxLanterns) break;
      let q: XZ | null = null;
      let c = P[k0];
      // the slot's own sample first, then its neighbours along the path
      for (const k of [k0, k0 + 1, k0 - 1]) {
        if (q || k < 1 || k >= P.length - 1) continue;
        c = P[k];
        if (heightAt(ctx.h, c.x, c.z) < W.minY) continue;
        const t = unit(P[k - 1], P[k + 1]);
        const side = { x: -t.z, z: t.x };
        const l = add(c, side, W.side);
        const r = add(c, side, -W.side);
        // the downhill side first (it outlines the hairpins), the other when it is not level
        const sides = heightAt(ctx.h, l.x, l.z) < heightAt(ctx.h, r.x, r.z) ? [l, r] : [r, l];
        q =
          sides.find(
            (o) =>
              onIsland(ctx, isl, o.x, o.z) &&
              sdfAt(ctx, o.x, o.z) >= 2 &&
              offPath(o) &&
              relief(ctx, discShape(o.x, o.z, W.levelR)) <= W.maxRelief &&
              clear(ctx, isl, discShape(o.x, o.z, 0.35), W.gap),
          ) ?? null;
      }
      if (!q) continue;
      const sh = discShape(q.x, q.z, 0.35);
      ctx.fixtures.push({
        defId: 'lavaLantern',
        x: q.x,
        z: q.z,
        rotY: ang(c.x - q.x, c.z - q.z),
        islandId: isl.id,
      });
      addShape(ctx, isl, sh, false);
      n++;
    }
  }
  return n;
}
