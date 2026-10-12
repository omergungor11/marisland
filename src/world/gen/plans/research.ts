/**
 * Research island plan — "Observatory University" (TASK-402b, replaces the TASK-400 Biodome
 * Lab) on the Lonely Palm terraced campus hill (archetype `campusHill`):
 * - the observatory on the summit plateau, its door toward the quad;
 * - the campus quad on the terrace: a paved plaza (the hub) with a fountain, the library rotunda,
 *   faculty halls and the campus tower around it, doors to the fountain, scholar statues at the
 *   library steps, benches and lanterns on the rim; avenues to the observatory and the harbour
 *   stay open;
 * - a formal garden on the lower lawn: a grid of hedge parterres around a sculpture, topiary
 *   lines, flower beds, benches, a pergola walk toward the quad;
 * - the glasshouse district: a row of terrariums with the biodome conservatory at one end;
 * - the research base on the headland (lab pods, small dish, weather mast) and the big radio
 *   dish on the spur behind the summit;
 * - sculptures on the avenues (atom, DNA helix, rocket), the cove pier with the research vessel;
 * - path links from every door to the quad hub.
 * Every random decision draws from labelled forks of `rng`; numbers: RESEARCH_SITE.
 */
import type { Rng } from '../../../core/rng.ts';
import { DOCK, FIXTURE_RADIUS, FLATTEN } from '../../../content/settlements.ts';
import { RESEARCH_SITE as S } from '../../../content/themes/research.ts';
import { heightAt, type IslandData, type XZ } from '../../types.ts';
import { gridRange } from '../grid.ts';
import { coveness } from '../heightfield.ts';
import {
  add,
  addPad,
  addShape,
  ang,
  bestSample,
  cellPos,
  clear,
  dirOf,
  discShape,
  dist,
  dockWithLink,
  findDock,
  newPlan,
  onLand,
  rectShape,
  relief,
  ring,
  sdfAt,
  segDist,
  unit,
  type Shape,
  type SiteCtx,
  type SitePlan,
} from '../sites.ts';
import type { ThemePlanner } from './types.ts';

const DEG = Math.PI / 180;
const TAU = Math.PI * 2;
/** Smallest absolute difference of two angles (rad). */
const angGap = (a: number, b: number): number => Math.abs(((a - b + 3 * Math.PI) % TAU) - Math.PI);
const perp = (d: XZ): XZ => ({ x: -d.z, z: d.x });
const radiusOf = (def: string): number => FIXTURE_RADIUS[def] ?? 0.5;
/** Pad level groups (Pad.group): each district is one level, districts differ by ≤ padStep. */
const LEVEL = { summit: 1, quad: 2, garden: 3, glass: 4, base: 5, dish: 6 } as const;

interface Put {
  /** Obstacle shape (default: the FIXTURE_RADIUS disc). */
  sh?: Shape;
  /** Blocks the path grid (default true). */
  block?: boolean;
  /** Flatten pad margin (unset = no pad). */
  pad?: number;
  /** Level group of the pad (Pad.group): one flat level inside a group, `padStep` between groups. */
  group?: number;
  variant?: number;
}

/** A fixture with its obstacle shape (and an optional flatten pad). */
function put(ctx: SiteCtx, isl: IslandData, defId: string, p: XZ, rotY: number, o: Put = {}): void {
  ctx.fixtures.push({ defId, x: p.x, z: p.z, rotY, islandId: isl.id, variant: o.variant });
  const sh = o.sh ?? discShape(p.x, p.z, radiusOf(defId));
  addShape(ctx, isl, sh, o.block ?? true);
  if (o.pad !== undefined) addPad(ctx, isl, sh, o.pad, S.padStep, o.group);
}

/** On land, clear of everything placed so far and level enough. */
function fits(
  ctx: SiteCtx,
  isl: IslandData,
  sh: Shape,
  minShore: number,
  maxRelief = Infinity,
  inPlaza = false,
): boolean {
  // the cove ramp (pier → plateau) stays open
  if (sdfAt(ctx, sh.x, sh.z) < S.coveKeep && coveness(isl, ctx.windDir, sh.x, sh.z) > 0.6)
    return false;
  return (
    onLand(ctx, isl, sh, minShore) &&
    clear(ctx, isl, sh, S.gap, inPlaza) &&
    (maxRelief === Infinity || relief(ctx, sh) <= maxRelief)
  );
}

/** Grid samples of this island inside its bounds. */
function islandCells(ctx: SiteCtx, isl: IslandData): number[] {
  const out: number[] = [];
  const [x0, x1] = gridRange(isl.minX, isl.maxX);
  const [z0, z1] = gridRange(isl.minZ, isl.maxZ);
  for (let iz = z0; iz <= z1; iz++)
    for (let ix = x0; ix <= x1; ix++) {
      const i = iz * ctx.n + ix;
      if (ctx.islandMap[i] === isl.id + 1) out.push(i);
    }
  return out;
}

const pin = (plan: SitePlan, p: XZ): void => {
  plan.links.push({ pin: p, kind: 'path', done: () => undefined });
};

export const planResearch: ThemePlanner = ({ ctx, isl, rng }) => {
  const A = isl.anchors;
  if (!A.summit || !A.quad) return null;

  // ---- observatory: the highest clear spot on the summit plateau
  const O = S.observatory;
  const obs = bestSample(ctx, isl, A.summit, O.search, (p) => {
    const sh = discShape(p.x, p.z, O.radius);
    if (!fits(ctx, isl, sh, O.minShore, O.maxRelief)) return Infinity;
    return -heightAt(ctx.h, p.x, p.z) + 0.15 * dist(p, A.summit);
  });

  // ---- quad: the flattest plaza disc near the terrace anchor, clear of the observatory
  const Q = S.quad;
  const quad = bestSample(ctx, isl, A.quad, Q.search, (p, i) => {
    if (ctx.sdf[i] < Q.minShore) return Infinity;
    if (obs && dist(p, obs) < Q.obsGap) return Infinity;
    const sh = discShape(p.x, p.z, Q.radius);
    if (!fits(ctx, isl, sh, Q.minShore)) return Infinity;
    const r = relief(ctx, sh);
    return r > Q.maxRelief ? Infinity : r + 0.06 * dist(p, A.quad);
  });
  if (!quad) return null;
  const plan = newPlan('university', quad);
  plan.plaza = { x: quad.x, z: quad.z, r: Q.radius };
  addShape(ctx, isl, { ...discShape(quad.x, quad.z, Q.radius + 0.4), tag: 'plaza' }, false);
  addPad(ctx, isl, discShape(quad.x, quad.z, Q.radius), FLATTEN.discMargin, S.padStep, LEVEL.quad);
  const axis = obs ? unit(quad, obs) : unit(quad, A.summit);
  const a0 = ang(axis.x, axis.z);
  // the hub pin: just in front of the fountain on the observatory avenue
  pin(plan, add(quad, axis, radiusOf(Q.fountain) + 1.4));
  put(ctx, isl, Q.fountain, quad, a0 + Math.PI);
  if (obs) {
    const door = ang(-axis.x, -axis.z);
    put(ctx, isl, O.def, obs, door, {
      sh: discShape(obs.x, obs.z, O.radius),
      variant: rng.fork('observatory').int(0, 1),
    });
    addPad(ctx, isl, discShape(obs.x, obs.z, O.pad), FLATTEN.discMargin, S.padStep, LEVEL.summit);
    pin(plan, add(obs, dirOf(door), O.radius + S.doorGap + 0.6));
  }

  // ---- harbour: the cove pier + vessel (before the ring, so its avenue is known)
  const lee = dirOf(ctx.windDir);
  const prefer = add({ x: isl.cx, z: isl.cz }, lee, isl.radius * 1.2);
  const site = findDock(ctx, isl, {
    near: prefer,
    maxDist: isl.reach,
    prefer,
    lee: S.dock.lee,
    carve: true,
    maxSegments: S.dock.maxSegments,
  });
  const di = dockWithLink(ctx, isl, plan, site, rng.fork('moorings'), {
    rowboats: 0,
    sailboats: 0,
  });
  if (di >= 0) moorVessel(ctx, isl, ctx.docks[di]);
  const harbourAt = site ? site.root : (A.harbour ?? prefer);
  const aH = ang(harbourAt.x - quad.x, harbourAt.z - quad.z);
  // the harbour avenue (pier root → quad rim) stays free: a lane nothing else may stand on
  const toHarbour = unit(quad, harbourAt);
  const avenueLen = dist(quad, harbourAt) - Q.radius;
  const lane: XZ[] = [];
  for (let t = 0; t <= avenueLen; t += 1) lane.push(add(harbourAt, toHarbour, -t));
  ctx.lanes[isl.id].push(lane);
  const garden = A.garden ?? quad;
  const aG = ang(garden.x - quad.x, garden.z - quad.z);

  quadRing(ctx, isl, quad, a0, [a0, aH, aG]);
  quadDecor(ctx, isl, quad, [a0, aH, aG]);

  // ---- the rest of the campus, each from its own fork
  const g = formalGarden(ctx, isl, plan, garden, quad, rng.fork('garden'));
  glasshouses(ctx, isl, plan, A.glasshouse ?? garden, g, rng.fork('glasshouse'));
  bigDish(ctx, isl, plan, A.spur, obs, rng.fork('dish'));
  researchBase(ctx, isl, plan, A.headland, rng.fork('base'));
  if (g) gardenEnds(ctx, isl, g);
  sculptureWalk(ctx, isl, quad, obs, g, harbourAt, rng.fork('sculptures'));

  // paths keep off the steep wall faces (earth): only the cove ramp by the pier leads down
  const n = ctx.n;
  const d = ctx.h.data;
  for (const i of islandCells(ctx, isl)) {
    if (ctx.sdf[i] >= S.rimKeep) continue;
    // central-difference slope over two cells
    const slope = Math.hypot(d[i + 1] - d[i - 1], d[i + n] - d[i - n]) / (2 * ctx.h.cellSize);
    if (slope < S.rimSlope) continue;
    const p = cellPos(ctx, i);
    if (dist(p, harbourAt) < S.rimFree || segDist(p, harbourAt, quad) < 3) continue;
    if (coveness(isl, ctx.windDir, p.x, p.z) < 0.5) ctx.blocked[i] = 1;
  }
  return plan;
};

/** Library, faculty halls and the campus tower around the plaza, doors facing the fountain. */
function quadRing(
  ctx: SiteCtx,
  isl: IslandData,
  quad: XZ,
  a0: number,
  avenues: readonly number[],
): void {
  const R = S.ring;
  const keep = R.keepDeg * DEG;
  for (const b of R.buildings) {
    const [w, d] = b.size;
    const pref = a0 + b.angle * DEG;
    const slide = 'slide' in b ? b.slide : R.slideDeg;
    search: for (let k = 0; k <= slide / R.stepDeg; k++)
      for (const sgn of k === 0 ? [1] : [1, -1])
        for (const extra of R.out) {
          const back = S.quad.radius + R.back + extra + d / 2;
          const a = pref + sgn * k * R.stepDeg * DEG;
          // the avenue sectors stay open (their half-width grows with the building's)
          const half = keep + Math.atan2(w / 2, back);
          if (avenues.some((v) => angGap(a, v) < half)) continue;
          const p = add(quad, dirOf(a), back);
          const rot = a + Math.PI;
          const sh = rectShape(p.x, p.z, rot, w, d);
          if (!fits(ctx, isl, sh, R.minShore, R.maxRelief)) continue;
          put(ctx, isl, b.def, p, rot, {
            sh,
            pad: R.padMargin,
            variant: b.variant,
            group: LEVEL.quad,
          });
          if (b.def === 'libraryRotunda') statues(ctx, isl, p, rot, d);
          break search;
        }
  }
}

/** Scholar statues either side of the library steps, facing the fountain. */
function statues(ctx: SiteCtx, isl: IslandData, lib: XZ, rot: number, depth: number): void {
  const T = S.statues;
  const f = dirOf(rot);
  const side = perp(f);
  for (const [k, s] of [1, -1].entries()) {
    const p = add(add(lib, f, depth / 2 + T.inset), side, s * T.side);
    const sh = discShape(p.x, p.z, radiusOf(T.def));
    if (!fits(ctx, isl, sh, 2, Infinity, true)) continue;
    put(ctx, isl, T.def, p, rot, { variant: k });
  }
}

/** Benches facing the fountain and lantern posts on the plaza rim, between the avenues. */
function quadDecor(ctx: SiteCtx, isl: IslandData, quad: XZ, avenues: readonly number[]): void {
  const D = S.quadDecor;
  const R = S.quad.radius;
  for (const v of avenues) {
    for (const s of [1, -1]) {
      // lanterns flank each avenue mouth
      const a = v + s * 24 * DEG;
      const l = add(quad, dirOf(a), R - D.lanternInset);
      if (fits(ctx, isl, discShape(l.x, l.z, radiusOf(D.lantern)), 1, Infinity, true))
        put(ctx, isl, D.lantern, l, a, { variant: 0 });
    }
  }
  // benches on the bisectors between consecutive avenues
  const sorted = [...avenues].map((a) => ((a % TAU) + TAU) % TAU).sort((a, b) => a - b);
  for (let k = 0; k < sorted.length; k++) {
    const a1 = sorted[k];
    const a2 = k + 1 < sorted.length ? sorted[k + 1] : sorted[0] + TAU;
    if (a2 - a1 < 70 * DEG) continue;
    const a = (a1 + a2) / 2;
    const p = add(quad, dirOf(a), R - D.benchInset);
    if (fits(ctx, isl, discShape(p.x, p.z, radiusOf(D.bench)), 1, Infinity, true))
      put(ctx, isl, D.bench, p, a + Math.PI, { variant: 0 });
  }
}

interface GardenSite {
  c: XZ;
  /** Grid axis toward the quad (and its angle). */
  u: XZ;
  rot: number;
  /** Half extents along u and across it. */
  half: number;
  halfV: number;
  /** The long side axis (topiary lines run along it). */
  long: { ax: XZ; half: number; side: XZ; off: number };
}

/** Pergola walk toward the quad; else a pergola gallery across the far end; else benches there. */
function gardenEnds(ctx: SiteCtx, isl: IslandData, g: GardenSite): void {
  const G = S.garden;
  const gate = add(g.c, g.u, g.half + 1.2);
  const far = add(g.c, g.u, -(g.half + S.pergola.size[1] / 2 + 0.9));
  if (pergolaWalk(ctx, isl, gate, g.u) || pergolaGallery(ctx, isl, far, g.u)) return;
  // a covered walk along a long side, outside the topiary line, open toward the garden
  for (const s of [1, -1]) {
    const side = { x: g.long.side.x * s, z: g.long.side.z * s };
    const mid = add(g.c, side, g.long.off + S.garden.topiary.out + 1.2 + S.pergola.size[1] / 2);
    if (pergolaGallery(ctx, isl, mid, { x: -side.x, z: -side.z })) return;
  }
  const v = perp(g.u);
  for (const sv of [0.5, -0.5]) {
    const p = add(add(g.c, g.u, -(g.half + G.bench.out)), v, sv * G.pitch);
    if (fits(ctx, isl, discShape(p.x, p.z, radiusOf(G.bench.def)), 1.5, 2))
      put(ctx, isl, G.bench.def, p, g.rot, { variant: 0 });
  }
}

/** Formal garden: parterre grid around a sculpture, topiary lines, beds, benches, pergola walk. */
function formalGarden(
  ctx: SiteCtx,
  isl: IslandData,
  plan: SitePlan,
  anchor: XZ,
  quad: XZ,
  rng: Rng,
): GardenSite | null {
  const G = S.garden;
  const toQuad = unit(anchor, quad);
  const a0 = ang(toQuad.x, toQuad.z);
  // grid cells (along u = toward the quad, across v), centre cell left for the sculpture
  const cells = (cols: number, rows: number, c: XZ, u: XZ): { p: XZ; centre: boolean }[] => {
    const v = perp(u);
    const out: { p: XZ; centre: boolean }[] = [];
    for (let i = 0; i < rows; i++)
      for (let j = 0; j < cols; j++) {
        const along = (i - (rows - 1) / 2) * G.pitch;
        const across = (j - (cols - 1) / 2) * G.pitch;
        const centre = rows % 2 === 1 && cols % 2 === 1 && 2 * i === rows - 1 && 2 * j === cols - 1;
        out.push({ p: add(add(c, u, along), v, across), centre });
      }
    return out;
  };
  for (const [cols, rows] of G.layouts) {
    for (const t of G.turns) {
      const u = dirOf(a0 + t * DEG);
      const rot = ang(u.x, u.z);
      const tileOk = (p: XZ): boolean =>
        fits(ctx, isl, rectShape(p.x, p.z, rot, G.tile, G.tile), G.minShore, G.tileRelief);
      const c = bestSample(ctx, isl, anchor, G.search, (p) => {
        const cs = cells(cols, rows, p, u);
        if (!cs.every((q) => tileOk(q.p))) return Infinity;
        const all = rectShape(p.x, p.z, rot, cols * G.pitch, rows * G.pitch);
        const r = relief(ctx, all);
        return r > G.gridRelief ? Infinity : r + 0.08 * dist(p, anchor);
      });
      if (!c) continue;
      const cs = cells(cols, rows, c, u);
      let k = 0;
      let hasCentre = false;
      for (const q of cs) {
        if (q.centre) {
          hasCentre = true;
          continue;
        }
        const sh = rectShape(q.p.x, q.p.z, rot, G.tile, G.tile);
        put(ctx, isl, 'hedgeParterre', q.p, rot, {
          sh,
          pad: 1.2,
          variant: k++ % 2,
          group: LEVEL.garden,
        });
      }
      // even grids: the sculpture stands at the far end instead of the centre cell
      const statue = hasCentre ? c : add(c, u, -((rows * G.pitch) / 2 + G.endStatue));
      if (hasCentre || fits(ctx, isl, discShape(statue.x, statue.z, radiusOf(G.centre)), 2, 1.5))
        put(ctx, isl, G.centre, statue, rot + Math.PI, {
          sh: discShape(statue.x, statue.z, radiusOf(G.centre)),
          pad: 0.8,
          group: LEVEL.garden,
        });
      const halfU = (rows * G.pitch) / 2;
      const halfV = (cols * G.pitch) / 2;
      const v = perp(u);
      // topiary lines along both long sides (mixed shapes), flower beds at the outer corners
      const T = G.topiary;
      const long =
        rows >= cols
          ? { ax: u, half: halfU, side: v, off: halfV }
          : { ax: v, half: halfV, side: u, off: halfU };
      let n = 0;
      for (const s of [1, -1])
        for (let a = -long.half + T.step / 2; a <= long.half - T.step / 2 + 1e-6; a += T.step) {
          const p = add(add(c, long.ax, a), long.side, s * (long.off + T.out));
          if (!fits(ctx, isl, discShape(p.x, p.z, radiusOf(T.def)), 1.5, 2)) continue;
          put(ctx, isl, T.def, p, rot, { variant: T.variants[n++ % T.variants.length] });
        }
      for (const su of [1, -1])
        for (const sv of [1, -1]) {
          const p = add(add(c, u, su * (halfU + G.bed.out)), v, sv * (halfV + G.bed.out));
          if (fits(ctx, isl, discShape(p.x, p.z, radiusOf(G.bed.def)), 1.5, 2))
            put(ctx, isl, G.bed.def, p, rng.range(0, TAU), { variant: 0 });
        }
      // garden entrance (quad side)
      pin(plan, add(c, u, halfU + 1.2));
      return { c, u, rot, half: halfU, halfV, long };
    }
  }
  return null;
}

/**
 * Pergolas end to end from `gate` along `u` (open along the walk, not blocking paths); only when
 * at least `minCount` fit. Returns whether the walk was built.
 */
function pergolaWalk(ctx: SiteCtx, isl: IslandData, gate: XZ, u: XZ): boolean {
  const P = S.pergola;
  const [w, d] = P.size;
  const rot = ang(u.x, u.z);
  const spots: { p: XZ; sh: Shape }[] = [];
  for (let k = 0; k < P.count; k++) {
    const p = add(gate, u, P.lead + d / 2 + k * d);
    const sh = rectShape(p.x, p.z, rot, w, d);
    if (!fits(ctx, isl, sh, 2, 1.6)) break;
    spots.push({ p, sh });
  }
  if (spots.length < P.minCount) return false;
  for (const { p, sh } of spots)
    put(ctx, isl, P.def, p, rot, { sh, block: false, pad: 0.6, group: LEVEL.garden });
  return true;
}

/** Pergolas side by side across the garden's far end (open toward the garden). */
function pergolaGallery(ctx: SiteCtx, isl: IslandData, mid: XZ, u: XZ): boolean {
  const P = S.pergola;
  const [w, d] = P.size;
  const rot = ang(u.x, u.z);
  const v = perp(u);
  for (let n = P.count; n >= P.minCount; n--) {
    const spots = Array.from({ length: n }, (_, k) => add(mid, v, (k - (n - 1) / 2) * w));
    const shapes = spots.map((p) => rectShape(p.x, p.z, rot, w, d));
    if (!shapes.every((sh) => fits(ctx, isl, sh, 2, 1.6))) continue;
    spots.forEach((p, k) =>
      put(ctx, isl, P.def, p, rot, { sh: shapes[k], block: false, pad: 0.6, group: LEVEL.garden }),
    );
    return true;
  }
  return false;
}

/** Terrarium row (+ the biodome conservatory at one end), doors toward the island centre. */
function glasshouses(
  ctx: SiteCtx,
  isl: IslandData,
  plan: SitePlan,
  anchor: XZ,
  garden: GardenSite | null,
  rng: Rng,
): void {
  const G = S.glasshouse;
  const r = radiusOf(G.def);
  const want = rng.int(G.count[0], G.count[1]);
  const v0 = rng.int(0, 1);
  const ok = (q: XZ): boolean => fits(ctx, isl, discShape(q.x, q.z, r), G.minShore, G.maxRelief);
  /** A row of n centred on c along `along`, doors toward `front`. */
  const build = (c: XZ, along: XZ, front: XZ, n: number): void => {
    const rot = ang(front.x, front.z);
    for (let k = 0; k < n; k++) {
      const q = add(c, along, (k - (n - 1) / 2) * G.pitch);
      put(ctx, isl, G.def, q, rot, { pad: 0.8, variant: (v0 + k) % 2, group: LEVEL.glass });
    }
    pin(plan, add(c, front, r + S.doorGap + 0.4));
    // the conservatory dome at whichever end fits
    const R = radiusOf(G.conservatory);
    for (const s of [1, -1]) {
      const q = add(c, along, s * (((n - 1) / 2) * G.pitch + r + R + S.gap + 0.4));
      if (!fits(ctx, isl, discShape(q.x, q.z, R), G.minShore, G.maxRelief)) continue;
      put(ctx, isl, G.conservatory, q, rot, { pad: 0.8, group: LEVEL.glass });
      pin(plan, add(q, front, R + S.doorGap));
      break;
    }
  };
  const row = (c: XZ, along: XZ, n: number): boolean => {
    for (let k = 0; k < n; k++) if (!ok(add(c, along, (k - (n - 1) / 2) * G.pitch))) return false;
    return true;
  };
  // a botanical row beside the garden: past its far end, else along a long side
  if (garden) {
    const sides: { c: XZ; along: XZ; front: XZ }[] = [];
    const v = perp(garden.u);
    const back = { x: -garden.u.x, z: -garden.u.z };
    sides.push({
      c: add(garden.c, back, garden.half + G.gardenGap + r),
      along: v,
      front: garden.u,
    });
    for (const s of [1, -1]) {
      const side = { x: garden.long.side.x * s, z: garden.long.side.z * s };
      sides.push({
        c: add(garden.c, side, garden.long.off + G.gardenGap + r),
        along: garden.long.ax,
        front: { x: -side.x, z: -side.z },
      });
    }
    for (let n = want; n >= 2; n--)
      for (const sd of sides)
        for (const slide of [0, 1, -1, 2, -2])
          if (row(add(sd.c, sd.along, slide * 1.2), sd.along, n)) {
            build(add(sd.c, sd.along, slide * 1.2), sd.along, sd.front, n);
            return;
          }
  }
  // else a row near the anchor, doors toward the island centre
  const front = unit(anchor, { x: isl.cx, z: isl.cz });
  const along = perp(front);
  for (let n = want; n >= 2; n--) {
    const c = bestSample(ctx, isl, anchor, G.search, (p) =>
      row(p, along, n) ? dist(p, anchor) : Infinity,
    );
    if (!c) continue;
    build(c, along, front, n);
    return;
  }
}

/** Lab pods, a small dish and the weather mast around a yard on the headland. */
function researchBase(
  ctx: SiteCtx,
  isl: IslandData,
  plan: SitePlan,
  anchor: XZ | undefined,
  rng: Rng,
): void {
  if (!anchor) return;
  const B = S.base;
  const phase = rng.range(0, 1);
  /** The base around `yard`: each item on the nearest free ring spot (dry run without `commit`). */
  const layout = (yard: XZ): { def: string; variant: number; p: XZ; r: number }[] => {
    const out: { def: string; variant: number; p: XZ; r: number }[] = [];
    for (const it of B.items) {
      const r = radiusOf(it.def);
      const cand = ring(yard, B.ring[0] + r * 0.4, B.ring[1] + r * 0.4, 1.1, 14, phase).filter(
        (p) =>
          fits(ctx, isl, discShape(p.x, p.z, r), B.minShore, B.maxRelief) &&
          out.every((o) => dist(o.p, p) >= o.r + r + S.gap),
      );
      if (cand.length === 0) continue;
      // nearest the yard, then nearest the anchor (the headland tip)
      cand.sort(
        (a, b) => dist(a, yard) + 0.3 * dist(a, anchor) - (dist(b, yard) + 0.3 * dist(b, anchor)),
      );
      out.push({ def: it.def, variant: it.variant, p: cand[0], r });
    }
    return out;
  };
  // yards near the headland first; the first one that takes the most items wins
  let best: { yard: XZ; items: ReturnType<typeof layout> } | null = null;
  for (const search of B.search) {
    const yards: { p: XZ; s: number }[] = [];
    bestSample(ctx, isl, anchor, search, (p) => {
      const sh = discShape(p.x, p.z, 2.5);
      if (fits(ctx, isl, sh, B.minShore, B.maxRelief))
        yards.push({ p, s: relief(ctx, sh) + 0.1 * dist(p, anchor) });
      return Infinity;
    });
    yards.sort((a, b) => a.s - b.s);
    for (const y of yards.slice(0, B.tries)) {
      const items = layout(y.p);
      if (!best || items.length > best.items.length) best = { yard: y.p, items };
      if (items.length === B.items.length) break;
    }
    if (best && best.items.length >= B.minItems) break;
  }
  if (!best || best.items.length === 0) return;
  for (const it of best.items) {
    const toYard = unit(it.p, best.yard);
    // dishes look out to sea (away from the yard), everything else faces the yard
    const rot = it.def === 'radioDish' ? ang(-toYard.x, -toYard.z) : ang(toYard.x, toYard.z);
    put(ctx, isl, it.def, it.p, rot, { pad: 1.2, variant: it.variant, group: LEVEL.base });
  }
  pin(plan, best.yard);
}

/** The big radio dish on the spur, bowl toward the sea, and small dishes beside it. */
function bigDish(
  ctx: SiteCtx,
  isl: IslandData,
  plan: SitePlan,
  anchor: XZ | undefined,
  obs: XZ | null,
  rng: Rng,
): void {
  if (!anchor) return;
  const D = S.dish;
  const r = radiusOf(D.def);
  const p = bestSample(ctx, isl, anchor, D.search, (q) => {
    if (!fits(ctx, isl, discShape(q.x, q.z, r), D.minShore, D.maxRelief)) return Infinity;
    // out on the spur (far from the island centre), not hugging the observatory
    return (
      -0.5 * dist(q, { x: isl.cx, z: isl.cz }) + dist(q, anchor) - (obs ? 0.1 * dist(q, obs) : 0)
    );
  });
  if (!p) return;
  const out = unit({ x: isl.cx, z: isl.cz }, p);
  const rot = ang(out.x, out.z);
  put(ctx, isl, D.def, p, rot, { pad: FLATTEN.discMargin, variant: 0, group: LEVEL.dish });
  pin(plan, add(p, out, -(r + S.doorGap)));
  const rs = radiusOf(D.def) * 0.55;
  const cand = ring(p, D.smallRing[0], D.smallRing[1], 1.25, 16, rng.range(0, 1)).filter((q) =>
    fits(ctx, isl, discShape(q.x, q.z, rs), D.minShore, D.maxRelief),
  );
  cand.sort((a, b) => dist(a, anchor) - dist(b, anchor));
  for (let k = 0; k < D.small && k < cand.length; k++) {
    const q = cand[k];
    put(ctx, isl, D.def, q, rot + rng.range(-0.4, 0.4), {
      sh: discShape(q.x, q.z, rs),
      pad: 0.8,
      variant: 1,
      group: LEVEL.dish,
    });
  }
}

/** Atom on the observatory avenue, DNA helix toward the garden, rocket on the harbour approach. */
function sculptureWalk(
  ctx: SiteCtx,
  isl: IslandData,
  quad: XZ,
  obs: XZ | null,
  garden: GardenSite | null,
  harbour: XZ,
  rng: Rng,
): void {
  const W = S.sculptures;
  const R = S.quad.radius;
  const along = (to: XZ, def: string, ats: readonly number[], side: number): boolean => {
    const u = unit(quad, to);
    const rim = add(quad, u, R);
    const len = dist(rim, to);
    const r = radiusOf(def);
    for (const at of ats)
      for (const s of [1, -1]) {
        const mid = add(rim, u, len * at);
        const p = add(mid, perp(u), s * side);
        if (!fits(ctx, isl, discShape(p.x, p.z, r), 2, 1.5)) continue;
        const face = unit(p, mid);
        put(ctx, isl, def, p, ang(face.x, face.z), { pad: 0.6 });
        return true;
      }
    return false;
  };
  // fallback: a clear lawn spot around the quad, facing it
  const around = (def: string): void => {
    const r = radiusOf(def);
    const cand = ring(quad, W.ring[0], W.ring[1], 1.5, 18, rng.range(0, 1));
    for (const p of cand) {
      if (!fits(ctx, isl, discShape(p.x, p.z, r + 0.6), 2.5, 1.2)) continue;
      const face = unit(p, quad);
      put(ctx, isl, def, p, ang(face.x, face.z), { pad: 0.6 });
      return;
    }
  };
  const O = W.observatory;
  if (!obs || !along(add(obs, unit(obs, quad), S.observatory.radius + 1), O.def, O.at, O.side))
    around(O.def);
  const G = W.garden;
  if (!garden || !along(add(garden.c, garden.u, garden.half + 1.2), G.def, G.at, G.side))
    around(G.def);
  if (!along(harbour, W.harbour.def, W.harbour.at, W.harbour.side)) around(W.harbour.def);
}

/** The research vessel alongside the pier (either side), bow seaward; off the end as a fallback. */
function moorVessel(
  ctx: SiteCtx,
  isl: IslandData,
  dock: { x: number; z: number; rotY: number; segments: number },
): void {
  const V = S.vessel;
  const dir = dirOf(dock.rotY);
  const side = perp(dir);
  const L = dock.segments * DOCK.segment;
  const alongPier = Math.max(V.halfLength * 0.6, L - V.halfLength * 0.7);
  const spots: { p: XZ; rot: number }[] = [];
  for (const sgn of [1, -1])
    spots.push({ p: add(add(dock, dir, alongPier), side, sgn * V.side), rot: dock.rotY });
  spots.push({ p: add(dock, dir, L + V.halfBeam + 1.2), rot: ang(side.x, side.z) });
  for (const { p, rot } of spots) {
    const f = dirOf(rot);
    const s = perp(f);
    let ok = true;
    for (const a of [-1, 0, 1])
      for (const b of [-1, 1]) {
        const q = add(add(p, f, a * V.halfLength), s, b * V.halfBeam);
        if (heightAt(ctx.h, q.x, q.z) > -V.minDepth) ok = false;
      }
    if (!ok) continue;
    ctx.fixtures.push({ defId: V.def, x: p.x, z: p.z, rotY: rot, islandId: isl.id });
    addShape(ctx, isl, rectShape(p.x, p.z, rot, V.halfBeam * 2, V.halfLength * 2), false);
    return;
  }
}
