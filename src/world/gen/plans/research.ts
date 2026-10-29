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
 * - the research base on the headland: lab pods, the big radio dish (M28 TASK-524: it stood on
 *   the spur behind the summit, a small dish took its slot here) and the weather mast;
 * - M28 (TASK-524): the meridian ledge, the Star Stair and the rim deck anchors
 *   (research-anchors.ts);
 * - sculptures on the avenues (atom, DNA helix, rocket), the cove pier with the research vessel;
 * - path links from every door to the quad hub;
 * - the Star Academy culture (M19 TASK-426, `academy`): the comet-night observatory and the bell
 *   cupola tower, an orrery on the quad, the tea trolley and book carts at the library, faculty
 *   pennant lines (library front + avenues), lecture steps facing a chalkboard on the lawn, a
 *   summit telescope with a book-pile stool and the comet board, owl boxes, telescopes on the
 *   terrace edges, the weather balloon cart at the mast, pigeon perches by the statues, mini
 *   volcano terrariums before the glasshouses, plus the story spots.
 * Every random decision draws from labelled forks of `rng`; numbers: RESEARCH_SITE.
 */
import type { Rng } from '../../../core/rng.ts';
import { DOCK, FIXTURE_RADIUS, FLATTEN, PATHS } from '../../../content/settlements.ts';
import { RESEARCH_CULTURE_SITES as CS } from '../../../content/cultures/research.ts';
import { ARCHETYPES } from '../../../content/islands.ts';
import { RESEARCH_SITE as S } from '../../../content/themes/research.ts';
import { MAZE, SIDE_VEC, mazeOf } from '../../../content/props-themes/research-maze.ts';
import { lotLocalToWorld } from '../../lot-frame.ts';
import { THEME_IDS, heightAt, type IslandData, type StorySpot, type XZ } from '../../types.ts';
import { cellX, cellZ, gridRange } from '../grid.ts';
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
  onIsland,
  onLand,
  rectShape,
  relief,
  ring,
  sdfAt,
  segDist,
  cellOf,
  shapeCorners,
  shapeDist,
  shapesOverlap,
  unit,
  type Shape,
  type SiteCtx,
  type SitePlan,
} from '../sites.ts';
import {
  planStair,
  reserveMeridian,
  reserveResearchAnchors,
  reserveRimDecks,
  reserveStairLanding,
} from './research-anchors.ts';
import { placeSummitKit } from './research-m28.ts';
import type { ThemePlanner } from './types.ts';

const DEG = Math.PI / 180;
const TAU = Math.PI * 2;
/** Smallest absolute difference of two angles (rad). */
const angGap = (a: number, b: number): number => Math.abs(((a - b + 3 * Math.PI) % TAU) - Math.PI);
const perp = (d: XZ): XZ => ({ x: -d.z, z: d.x });
const radiusOf = (def: string): number => FIXTURE_RADIUS[def] ?? 0.5;
/** Pad level groups (Pad.group): each district is one level, districts differ by ≤ padStep. */
/** chalkboard variant 3 = the arboretum specimen plate (props-themes/research.ts RESEARCH_M22.plate). */
const PLATE_VARIANT = 3;
const LEVEL = { summit: 1, quad: 2, garden: 3, glass: 4, base: 5, tip: 7 } as const;

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
  /** Instance scale (the arboretum's oversized tree). */
  scale?: number;
}

/** A fixture with its obstacle shape (and an optional flatten pad). */
function put(ctx: SiteCtx, isl: IslandData, defId: string, p: XZ, rotY: number, o: Put = {}): void {
  ctx.fixtures.push({
    defId,
    x: p.x,
    z: p.z,
    rotY,
    islandId: isl.id,
    variant: o.variant,
    ...(o.scale !== undefined ? { scale: o.scale } : {}),
  });
  const sh = o.sh ?? discShape(p.x, p.z, radiusOf(defId));
  addShape(ctx, isl, sh, o.block ?? true);
  if (o.pad !== undefined) addPad(ctx, isl, sh, o.pad, S.padStep, o.group);
}

/**
 * M28 (TASK-524): the summit pad keeps its own level (`observatory.padStep`) on the steep crag,
 * so a piece keeps its footprint `observatory.keep` u off the summit pad core (its falloff would
 * tilt the piece's floor toward the crag top), per district (`planResearch` resets the disc).
 * `fits` and the academy's `roomy` keep off it.
 */
const summitKeep = new WeakMap<IslandData, Shape>();

/** On land, clear of everything placed so far, off the summit pad core and level enough. */
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
  const keep = summitKeep.get(isl);
  return (
    onLand(ctx, isl, sh, minShore) &&
    clear(ctx, isl, sh, S.gap, inPlaza) &&
    !(keep && shapesOverlap(keep, sh, 0)) &&
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
  put(ctx, isl, Q.fountain, quad, a0 + Math.PI);
  if (obs) {
    const door = ang(-axis.x, -axis.z);
    // the comet-night variant (dome slit open): the Star Academy's landmark (TASK-426)
    put(ctx, isl, O.def, obs, door, {
      sh: discShape(obs.x, obs.z, O.radius),
      variant: CS.observatoryVariant,
    });
    addPad(ctx, isl, discShape(obs.x, obs.z, O.pad), O.padMargin, O.padStep, LEVEL.summit);
    summitKeep.set(isl, discShape(obs.x, obs.z, O.pad + O.padMargin + O.keep.ring));
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
  // the hub pin (the first link: it seeds the network), just in front of the fountain on the
  // harbour avenue (M28 TASK-524: the observatory avenue side now ends at the crag face, a pocket)
  plan.links.unshift({
    pin: add(quad, toHarbour, radiusOf(Q.fountain) + 1.4),
    kind: 'path',
    done: () => undefined,
  });
  const avenueLen = dist(quad, harbourAt) - Q.radius;
  const lane: XZ[] = [];
  for (let t = 0; t <= avenueLen; t += 1) lane.push(add(harbourAt, toHarbour, -t));
  ctx.lanes[isl.id].push(lane);
  const garden = A.garden ?? quad;
  const aG = ang(garden.x - quad.x, garden.z - quad.z);

  quadRing(ctx, isl, quad, a0, [a0, aH, aG]);
  quadDecor(ctx, isl, quad, [a0, aH, aG]);

  // ---- M28 (TASK-524), after the quad ring, before the districts keep off them: the Star Stair
  // (R2: the landing on the summit ring and the legs up the crag face) and the meridian terrace
  // (R3) at the crag's foot
  const obsCore = O.pad + O.padMargin;
  if (obs) reserveStairLanding(ctx, isl, obs, quad);
  const stair = obs ? planStair(ctx, isl, obs, obsCore, quad, Q.radius + FLATTEN.discMargin) : null;
  const meridian = obs ? reserveMeridian(ctx, isl, obs, obsCore, quad) : null;
  // the districts keep their footprints off the summit pad (O.keep: each district its own reach)
  const keepOff = (k: number): void => {
    if (obs) summitKeep.set(isl, discShape(obs.x, obs.z, obsCore + k));
  };

  // ---- the rest of the campus, each from its own fork
  keepOff(O.keep.garden);
  const g = formalGarden(ctx, isl, plan, garden, quad, rng.fork('garden'));
  keepOff(O.keep.glass);
  glasshouses(ctx, isl, plan, A.glasshouse ?? garden, g, rng.fork('glasshouse'));
  keepOff(O.keep.districts);
  launchGantry(ctx, isl, plan, A.headland);
  keepOff(O.keep.base);
  researchBase(ctx, isl, plan, A.headland, rng.fork('base'));
  keepOff(O.keep.districts);
  // M28 R4 (TASK-524): the rim deck sites on the lip the districts left
  const decks = reserveRimDecks(ctx, isl);
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

  // ---- Star Academy culture (M19 TASK-426): last, so the campus districts keep their room and
  // the path pins' connectivity check sees the blocked rim
  const obsDoor = obs ? add(obs, unit(obs, quad), O.radius + S.doorGap + 0.6) : null;
  const gate = g ? add(g.c, g.u, g.half + 1.2) : null;
  // M28 anchors on the final ground (TASK-524): the meridian, the Star Stair, the rim decks
  // and the M28 kit on them (TASK-526): the Star Stair path comes back to the settlement pass
  plan.finish = (paths) => {
    reserveResearchAnchors(
      ctx,
      isl,
      obs,
      quad,
      Q.radius + FLATTEN.discMargin,
      stair,
      meridian,
      decks,
      paths,
    );
    return placeSummitKit(ctx, isl, paths, plan.stories ?? []);
  };
  plan.stories = academy(ctx, isl, rng.fork('culture'), {
    quad,
    obs,
    avenues: [aH, aG, a0],
    walks: [obsDoor, gate].filter((q): q is XZ => q !== null),
    pins: plan.links.map((l) => l.pin),
  });
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

/** Lab pods, the big dish and the weather mast around a yard on the headland. */
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
  if (best && best.items.length > 0) {
    for (const it of best.items) {
      const toYard = unit(it.p, best.yard);
      // dishes look out to sea (away from the yard), everything else faces the yard
      const rot = it.def === 'radioDish' ? ang(-toYard.x, -toYard.z) : ang(toYard.x, toYard.z);
      put(ctx, isl, it.def, it.p, rot, { pad: 1.2, variant: it.variant, group: LEVEL.base });
    }
    pin(plan, best.yard);
  }
  // M28 (TASK-524): the big dish is the headland's landmark: when the yard had no room for it,
  // the free spot nearest the headland within `dish.reach`, `dish.summitOff` off the summit (it
  // must not stand by the crag again), bowl out to sea
  const D = B.items.find((it) => it.def === 'radioDish');
  if (!D || best?.items.some((it) => it.def === D.def)) return;
  const summit = isl.anchors.summit;
  for (const T of B.dish) {
    const r = radiusOf(D.def) * T.scale;
    const p = bestSample(ctx, isl, anchor, T.reach, (q) =>
      (!summit || dist(q, summit) >= T.summitOff) &&
      fits(ctx, isl, discShape(q.x, q.z, r), B.minShore, B.maxRelief)
        ? dist(q, anchor)
        : Infinity,
    );
    if (!p) continue;
    const out = unit({ x: isl.cx, z: isl.cz }, p);
    put(ctx, isl, D.def, p, ang(out.x, out.z), {
      sh: discShape(p.x, p.z, r),
      pad: 1.2,
      variant: D.variant,
      group: LEVEL.base,
      ...(T.scale !== 1 ? { scale: T.scale } : {}),
    });
    return;
  }
}

/**
 * R13 launch gantry (M22 TASK-483): rocketMonument v1 claims the headland tip before the research
 * base settles round it (the base's pad level group, so one flat yard): the farthest free ground
 * from the island centre within `ring` u of the headland anchor, else anywhere on the island; the
 * rocket stands toward the sea (`turns` tried).
 */
function launchGantry(ctx: SiteCtx, isl: IslandData, plan: SitePlan, anchor: XZ | undefined): void {
  const G = CS.gantry;
  const c0 = { x: isl.cx, z: isl.cz };
  const pins = plan.links.map((l) => l.pin);
  // the glasshouse row keeps its front lawn (the mini volcano row stands there)
  const glass = ctx.fixtures.filter((f) => f.islandId === isl.id && f.defId === S.glasshouse.def);
  const all = islandCells(ctx, isl)
    .filter((i) => ctx.sdf[i] >= G.minShore)
    .map((i) => cellPos(ctx, i))
    .filter((p) => glass.every((f) => dist(p, f) >= G.glassKeep))
    .sort((a, b) => dist(b, c0) - dist(a, c0));
  const passes = anchor ? [all.filter((p) => dist(p, anchor) <= G.ring), all] : [all];
  for (const cells of passes)
    for (const p of cells)
      for (const t of G.turns) {
        const rot = ang(p.x - c0.x, p.z - c0.z) + t * DEG;
        const sh = rectShape(p.x, p.z, rot, G.size[0], G.size[1]);
        if (!fits(ctx, isl, sh, G.minShore, G.relief)) continue;
        if (pins.some((q) => shapeDist(sh, q.x, q.z) < CS.pinKeep)) continue;
        // its pad stays off every other district's flat core (overlapping cores blend their levels)
        if (
          ctx.pads.some(
            (q) =>
              q.islandId === isl.id &&
              q.group !== LEVEL.tip &&
              shapesOverlap(q.shape, sh, 2 * CS.pad + q.margin + CS.level.padKeep + 1),
          )
        )
          continue;
        put(ctx, isl, 'rocketMonument', p, rot, {
          sh,
          variant: G.variant,
          pad: CS.pad,
          group: LEVEL.tip,
        });
        return;
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

interface AcademySite {
  quad: XZ;
  obs: XZ | null;
  /** Avenue bearings out of the quad: harbour, garden, observatory (pennant order). */
  avenues: readonly number[];
  /** Walk ends the lawn pieces keep off (quad → observatory door, quad → garden gate). */
  walks: readonly XZ[];
  /** Path pins of the plan so far (the hub, doors, gates, the pier): kept clear. */
  pins: readonly XZ[];
}

type Cand = { p: XZ; rot: number };

const xz = (p: XZ): [number, number] => [p.x, p.z];
const face = (from: XZ, to: XZ): number => {
  const u = unit(from, to);
  return ang(u.x, u.z);
};

/**
 * Star Academy (M19 TASK-426, ISLAND_CULTURES §2.7): the culture kit round the quad, the library,
 * the lawn, the summit, the base and the glasshouses, plus its story spots. Every number is
 * RESEARCH_CULTURE_SITES; every draw comes from a sub-fork of `rng`.
 */
function academy(ctx: SiteCtx, isl: IslandData, rng: Rng, s: AcademySite): StorySpot[] {
  const stories: StorySpot[] = [];
  const story = (kind: string, p: XZ, rotY: number, defs: readonly string[]): void => {
    stories.push({ kind, islandId: isl.id, pos: { x: p.x, y: 0, z: p.z }, rotY, defs });
  };
  const { quad } = s;
  const fixturesOf = (defId: string) =>
    ctx.fixtures.filter((f) => f.islandId === isl.id && f.defId === defId);
  /** Clear of the walks quad → observatory door / garden gate. */
  const offWalks = (sh: Shape): boolean => {
    const pts = sh.r > 0 ? [sh] : [sh, ...shapeCorners(sh)];
    const keep = CS.avenueKeep + sh.r;
    return pts.every((q) => s.walks.every((w) => segDist(q, quad, w) >= keep));
  };
  /** Relief over the footprint grown by `level.grow` (before the pads). */
  const reliefAround = (sh: Shape): number => {
    const g = CS.level.grow;
    return relief(
      ctx,
      sh.r > 0 ? discShape(sh.x, sh.z, sh.r + g) : { ...sh, hw: sh.hw + g, hd: sh.hd + g },
    );
  };
  /**
   * Footprint free here: on land, clear by `gap`, near-level round it (≤ `maxRelief`; NaN = no
   * test: a district pad levels it later), off the cove ramp.
   */
  const free = (sh: Shape, gap: number, inPlaza: boolean, maxRelief: number, minShore = 1.5) =>
    !(sdfAt(ctx, sh.x, sh.z) < S.coveKeep && coveness(isl, ctx.windDir, sh.x, sh.z) > 0.6) &&
    onLand(ctx, isl, sh, minShore) &&
    clear(ctx, isl, sh, gap, inPlaza) &&
    s.pins.every((q) => shapeDist(sh, q.x, q.z) >= CS.pinKeep) &&
    (Number.isNaN(maxRelief) || reliefAround(sh) <= maxRelief) &&
    opensPins(sh);
  /** `free` without the relief and the path-pin flood fill (the cheap tests, for wide searches). */
  const keep = summitKeep.get(isl);
  const roomy = (sh: Shape, gap: number, minShore: number): boolean =>
    !(keep && shapesOverlap(keep, sh, 0)) &&
    !(sdfAt(ctx, sh.x, sh.z) < S.coveKeep && coveness(isl, ctx.windDir, sh.x, sh.z) > 0.6) &&
    onLand(ctx, isl, sh, minShore) &&
    clear(ctx, isl, sh, gap, false) &&
    s.pins.every((q) => shapeDist(sh, q.x, q.z) >= CS.pinKeep);
  /**
   * Which path pins of the plan (hub first, doors, gates, the pier root) are linked to the hub
   * pin over open cells (8-connected, the rim blocked) with `extra` cells blocked too: the start
   * cell is the pin's nearest open one in a 5 × 5 window, like the path linker's.
   */
  const linkedPins = (extra: ReadonlySet<number>): boolean[] => {
    const n = ctx.n;
    const open = (i: number): boolean =>
      ctx.islandMap[i] === isl.id + 1 &&
      ctx.sdf[i] >= PATHS.minShore &&
      !ctx.blocked[i] &&
      !extra.has(i);
    const near = (p: XZ): number => {
      const c = cellOf(ctx, p.x, p.z);
      let best = -1;
      let bd = Infinity;
      for (let dz = -2; dz <= 2; dz++)
        for (let dx = -2; dx <= 2; dx++) {
          const i = c + dz * n + dx;
          if (!open(i)) continue;
          const d = dist(cellPos(ctx, i), p);
          if (d < bd) {
            bd = d;
            best = i;
          }
        }
      return best;
    };
    const starts = s.pins.map(near);
    if (starts.length === 0 || starts[0] < 0) return s.pins.map(() => false);
    const seen = new Uint8Array(n * n);
    const q = [starts[0]];
    seen[starts[0]] = 1;
    while (q.length) {
      const i = q.pop() as number;
      for (const j of [i + 1, i - 1, i + n, i - n, i + n + 1, i + n - 1, i - n + 1, i - n - 1])
        if (!seen[j] && open(j)) {
          seen[j] = 1;
          q.push(j);
        }
    }
    return starts.map((i) => i >= 0 && seen[i] === 1);
  };
  /** Pins linked before any culture piece (one the campus itself walled off is not checked). */
  const linked0 = linkedPins(new Set());
  /**
   * Every pin linked before stays linked with `sh` in place (its cells blocked): small pieces
   * round the fountain or between the ring buildings could otherwise wall a pin off.
   */
  const opensPins = (sh: Shape): boolean => {
    const R = (sh.r > 0 ? sh.r : Math.hypot(sh.hw, sh.hd)) + 1;
    const extra = new Set<number>();
    const [x0, x1] = gridRange(sh.x - R, sh.x + R);
    const [z0, z1] = gridRange(sh.z - R, sh.z + R);
    for (let iz = z0; iz <= z1; iz++)
      for (let ix = x0; ix <= x1; ix++)
        if (shapeDist(sh, cellX(ix), cellZ(iz)) <= 0.5) extra.add(iz * ctx.n + ix);
    const now = linkedPins(extra);
    return linked0.every((was, k) => !was || now[k]);
  };
  const padsHere = () => ctx.pads.filter((p) => p.islandId === isl.id);
  /** Mean ground height over a shape (centre + rim / corner samples, before the pads). */
  const meanH = (sh: Shape): number => {
    // the grid samples inside the footprint (as the pad's own level is taken)
    const R = sh.r > 0 ? sh.r : Math.hypot(sh.hw, sh.hd);
    const [x0, x1] = gridRange(sh.x - R, sh.x + R);
    const [z0, z1] = gridRange(sh.z - R, sh.z + R);
    let sum = 0;
    let cnt = 0;
    for (let iz = z0; iz <= z1; iz++)
      for (let ix = x0; ix <= x1; ix++) {
        const i = iz * ctx.n + ix;
        if (ctx.islandMap[i] !== isl.id + 1 || shapeDist(sh, cellX(ix), cellZ(iz)) > 0.5) continue;
        sum += ctx.h.data[i];
        cnt++;
      }
    return cnt > 0 ? sum / cnt : heightAt(ctx.h, sh.x, sh.z);
  };
  /**
   * A new pad round `sh` is safe: its core keeps `padKeep` u off every other pad's footprint,
   * and a core it overlaps sits near its level (`padLevel` u): overlapping cores blend their
   * levels, which would tilt both floors.
   */
  const padClear = (sh: Shape): boolean => {
    const y = meanH(sh);
    return padsHere().every(
      (p) =>
        !shapesOverlap(p.shape, sh, CS.pad + CS.level.padKeep) &&
        (!shapesOverlap(p.shape, sh, CS.pad + p.margin) ||
          Math.abs(meanH(p.shape) - y) <= CS.level.padLevel),
    );
  };
  /** The footprint lies inside one existing pad's flat core. */
  // (a terraced island's pad leaves ground more than `padBreak` u off its level alone)
  const brk = (ARCHETYPES[isl.archetype].terraces?.padBreak ?? Infinity) - CS.level.breakKeep;
  const inPadCore = (sh: Shape, cell = 0, group: number = LEVEL.quad): boolean => {
    const pts =
      sh.r > 0
        ? [sh, ...[0, 1, 2, 3, 4, 5, 6, 7].map((k) => add(sh, dirOf((k / 8) * TAU), sh.r))]
        : [sh, ...shapeCorners(sh)];
    // every core the footprint touches: overlapping cores blend their levels, so they must be one
    // pad or `group` (the quad terrace / the garden lawn: one flat level; the slope districts'
    // groups are not)
    const touch = padsHere().filter((p) => shapesOverlap(p.shape, sh, p.margin));
    if (touch.length === 0) return false;
    if (touch.length > 1 && !touch.every((p) => p.group === group)) return false;
    const p = touch.find((q) =>
      sh.r > 0
        ? shapeDist(q.shape, sh.x, sh.z) + sh.r <= q.margin - cell
        : pts.every((c) => shapeDist(q.shape, c.x, c.z) <= q.margin - cell),
    );
    if (!p) return false;
    // every grid sample the footprint's ground blends from is within the pad's reach of its level
    const T = meanH(p.shape);
    const R = (sh.r > 0 ? sh.r : Math.hypot(sh.hw, sh.hd)) + 1;
    const [x0, x1] = gridRange(sh.x - R, sh.x + R);
    const [z0, z1] = gridRange(sh.z - R, sh.z + R);
    for (let iz = z0; iz <= z1; iz++)
      for (let ix = x0; ix <= x1; ix++)
        if (
          shapeDist(sh, cellX(ix), cellZ(iz)) <= 1 &&
          Math.abs(ctx.h.data[iz * ctx.n + ix] - T) > brk
        )
          return false;
    return true;
  };
  /**
   * How a footprint gets level ground: 'core' = inside a district pad's flat core already (no
   * pad of its own); 'pad' = its own pad on near-level ground (`level.relief`), its core clear
   * of every other pad's footprint (core samples blend: it never shifts a building's floor);
   * null = no way to level it here (next to a footprint it must already be flat: `level.flat`).
   */
  const groundOf = (sh: Shape, flat: number = CS.level.flat): 'core' | 'pad' | null => {
    if (inPadCore(sh)) return 'core';
    const rel = reliefAround(sh);
    if (padClear(sh)) return rel <= CS.level.relief ? 'pad' : null;
    return rel <= flat ? 'core' : null;
  };
  interface PlaceO {
    /** On the quad paving: small gap, no relief test, no pad (the quad pad levels it). */
    plaza?: boolean;
    /** Clearance to other obstacles (default `gap.plaza` / `gap.lawn`). */
    gap?: number;
    /** Ground already flat enough next to a footprint (default `level.flat`). */
    flat?: number;
    ok?: (sh: Shape) => boolean;
    /** Level ground test instead of `groundOf` (off the plaza). */
    ground?: (sh: Shape) => 'core' | 'pad' | null;
  }
  /** Place `defId` at the first free candidate (its FIXTURE_RADIUS disc); on the lawn with a pad. */
  const placeFirst = (
    defId: string,
    cands: readonly Cand[],
    variant: number,
    o: PlaceO = {},
  ): Cand | null => {
    const r = radiusOf(defId);
    for (const c of cands) {
      const sh = discShape(c.p.x, c.p.z, r);
      const gap = o.gap ?? (o.plaza ? CS.gap.plaza : CS.gap.lawn);
      if (!free(sh, gap, !!o.plaza, NaN)) continue;
      const g = o.plaza ? 'core' : (o.ground ?? ((q: Shape) => groundOf(q, o.flat)))(sh);
      if (!g || (o.ok && !o.ok(sh))) continue;
      put(ctx, isl, defId, c.p, c.rot, { sh, variant, pad: g === 'pad' ? CS.pad : undefined });
      return c;
    }
    return null;
  };
  const ringAt = (
    c: XZ,
    r0: number,
    r1: number,
    n: number,
    phase: number,
    rot: (p: XZ) => number,
  ): Cand[] => ring(c, r0, r1, 0.5, n, phase).map((p) => ({ p, rot: rot(p) }));

  /**
   * A parterre plot of the formal garden cleared for a site (TASK-461 lecture fallback): the plot
   * nearest the quad whose square, its hedge gone, holds `site(p, rot)` centred on it (grid-
   * aligned turns, the one looking away from the quad first) inside the garden's level core.
   * The hedge fixture and its obstacle are removed (its pad stays: the site keeps its level).
   * `ahead`: site centre − pivot along the facing.
   */
  const gardenPlot = (
    ahead: number,
    site: (p: XZ, rot: number) => Shape,
  ): { p: XZ; rot: number; core: boolean } | null => {
    const shapes = ctx.shapes[isl.id];
    const plots = ctx.fixtures
      .map((f, i) => ({ f, i }))
      .filter(({ f }) => f.islandId === isl.id && f.defId === 'hedgeParterre')
      .sort((a, b) => dist(a.f, quad) - dist(b.f, quad));
    for (const { f, i } of plots) {
      const si = shapes.findIndex((o) => o.r === 0 && o.x === f.x && o.z === f.z);
      if (si < 0) continue;
      const [hedge] = shapes.splice(si, 1);
      const away = face(quad, f);
      const turns = [0, 1, 2, 3]
        .map((k) => f.rotY + (k * Math.PI) / 2)
        .sort((a, b) => angGap(a, away) - angGap(b, away));
      for (const rot of turns) {
        const p = add(f, dirOf(rot), -ahead);
        const all = site(p, rot);
        if (!free(all, CS.lecture.gap, false, NaN, CS.lecture.minShore) || !offWalks(all)) continue;
        if (!inPadCore(all, 0, LEVEL.garden)) continue;
        ctx.fixtures.splice(i, 1);
        return { p, rot, core: true };
      }
      shapes.splice(si, 0, hedge);
    }
    return null;
  };

  // ---- lecture steps facing a chalkboard on the lawn (first: the biggest footprint)
  {
    const C = CS.lecture;
    const st = C.steps;
    const bd = C.board;
    /** The whole site: steps back edge → board back edge. */
    const len = st.back + st.d / 2 + bd.at + bd.d / 2;
    const siteOf = (p: XZ, rot: number): Shape =>
      rectShape(...xz(add(p, dirOf(rot), len / 2 - st.back - st.d / 2)), rot, st.w, len);
    let best: { p: XZ; rot: number; score: number } | null = null;
    bestSample(ctx, isl, quad, C.ring[1], (p) => {
      const d = dist(p, quad);
      if (d < C.ring[0]) return Infinity;
      for (const t of C.turns) {
        // t = 0: the class looks away from the quad (the board's face toward the campus)
        const rot = face(quad, p) + t * DEG;
        const all = siteOf(p, rot);
        if (!free(all, C.gap, false, C.relief, C.minShore) || !offWalks(all)) continue;
        // its pad stays off every other pad core (never drags a building's level)
        if (!padClear(all)) continue;
        const score = d + 2 * relief(ctx, all) + Math.abs(t) * 0.02;
        if (!best || score < best.score) best = { p, rot, score };
      }
      return Infinity;
    });
    let b = best as { p: XZ; rot: number; core?: boolean } | null;
    if (!b) b = gardenPlot(len / 2 - st.back - st.d / 2, (p, rot) => siteOf(p, rot));
    if (b) {
      const f = dirOf(b.rot);
      const sp = add(b.p, f, -st.back);
      const bp = add(b.p, f, bd.at);
      put(ctx, isl, 'lectureSteps', b.p, b.rot, {
        sh: rectShape(sp.x, sp.z, b.rot, st.w, st.d),
        variant: st.variant,
      });
      put(ctx, isl, 'chalkboard', bp, b.rot + Math.PI, {
        sh: rectShape(bp.x, bp.z, b.rot, bd.w, bd.d),
        variant: bd.variant,
      });
      // one pad levels the steps, the lecturer's spot and the board together (a garden plot is
      // level already)
      if (!b.core) addPad(ctx, isl, siteOf(b.p, b.rot), CS.pad, S.padStep);
      story('lecture', add(b.p, f, bd.at - 0.9), b.rot + Math.PI, ['lectureSteps', 'chalkboard']);
    }
  }

  // ---- the quad: the orrery on the paving, between the avenue mouths
  {
    const O = CS.orrery;
    const bearing = (p: XZ): number => Math.atan2(p.z - quad.z, p.x - quad.x);
    const gapOf = (p: XZ): number => Math.min(...s.avenues.map((v) => angGap(bearing(p), v)));
    const cands: Cand[] = [];
    for (const r of O.at)
      for (let k = 0; k < O.angles; k++) {
        const p = add(quad, dirOf((k / O.angles) * TAU), r);
        if (gapOf(p) >= O.keepDeg * DEG) cands.push({ p, rot: face(p, quad) });
      }
    // farthest from the avenues first
    cands.sort((a, b) => gapOf(b.p) - gapOf(a.p));
    placeFirst('orrery', cands, O.variant, { plaza: true });
  }

  // ---- the library: tea trolley and book carts beside the door, the faculty pennants in front
  const lib = fixturesOf('libraryRotunda')[0];
  const L = CS.library;
  const libDepth = S.ring.buildings[0].size[1];
  if (lib) {
    const f = dirOf(lib.rotY);
    const side = perp(f);
    const spots = (sgn: number): Cand[] => {
      const out: Cand[] = [];
      for (const df of L.front)
        for (const ds of L.side)
          out.push({
            p: add(add(lib, f, libDepth / 2 + df), side, sgn * ds),
            rot: lib.rotY + (sgn * Math.PI) / 2,
          });
      return out;
    };
    const lr = rng.fork('library');
    const sgn = lr.chance(0.5) ? 1 : -1;
    const tea = placeFirst('teaTrolley', [...spots(sgn), ...spots(-sgn)], L.trolley.variant, {
      plaza: true,
    });
    if (tea) story('teaTime', add(tea.p, f, 0.9), lib.rotY + Math.PI, ['teaTrolley']);
    const nBooks = lr.int(L.books.count[0], L.books.count[1]);
    for (let k = 0; k < nBooks; k++)
      placeFirst('bookCart', [...spots(-sgn), ...spots(sgn)], L.books.variants[k], {
        plaza: true,
      });
  }
  // a cord crosses a walk: no pad of its own (a terrace step on a ramp breaks the climb), so the
  // whole strip must lie inside one district core (the rigid cord needs both poles level)
  // (M28 TASK-524: by the steep crag a cord keeps a sample cell inside the core, as the ground
  // past the core edge climbs the crag face)
  const byCrag = (sh: Shape): boolean =>
    !!s.obs && dist(sh, s.obs) < S.observatory.pad + S.observatory.padMargin + CS.pennants.cragNear;
  pennants(
    ctx,
    isl,
    quad,
    lib,
    s.avenues,
    (sh) => (inPadCore(sh, byCrag(sh) ? ctx.h.cellSize / 2 : 0) ? 'core' : null),
    opensPins,
    {
      ground: (sh) => groundOf(sh),
      ok: offWalks,
    },
  );

  // ---- summit: the comet watch (telescope + book-pile stool + the comet board) and the owl box,
  // on the flat terrace round the dome (inside the observatory pad's core: no pads of their own)
  const SM = CS.summit;
  let owlStory = false;
  if (s.obs) {
    const obs = s.obs;
    // (the pad's core reaches farther, but on the summit cone only this ring ends up flat)
    const flatR = S.observatory.radius + SM.flat;
    const obsY = meanH(discShape(obs.x, obs.z, S.observatory.pad));
    const door = face(obs, quad);
    const phase = rng.fork('summit').range(0, TAU);
    const offDoor = (p: XZ): boolean => angGap(face(obs, p), door) >= SM.doorKeepDeg * DEG;
    /** Terrace spots for a footprint of radius `r`: just clear of the dome, centre on the flat. */
    const terrace = (r: number, rot: (p: XZ) => number, drop: number = SM.drop): Cand[] => {
      const r0 = S.observatory.radius + SM.gap + r;
      if (r0 > flatR) return [];
      // the terrace edge is not always flat in the end: the ground there must already be near
      // the observatory's level
      return ringAt(obs, r0, flatR, SM.angles, phase, rot).filter(
        (c) => offDoor(c.p) && Math.abs(heightAt(ctx.h, c.p.x, c.p.z) - obsY) <= drop,
      );
    };
    const out = (p: XZ): number => face(obs, p);
    const rS = radiusOf('tripodTelescope');
    const rB = SM.stool.r;
    // the telescope with its book-pile stool beside the eyepiece (either side) where both fit,
    // nearest the door sector first (seen from the quad, beside the open slit)
    const bySlit = (cs: Cand[]): Cand[] =>
      cs
        .map((c) => ({ c, g: angGap(face(obs, c.p), door) }))
        .sort((a, b) => a.g - b.g)
        .map((x) => x.c);
    let scope: Cand | null = null;
    let stool: XZ | null = null;
    for (const withStool of [true, false]) {
      for (const c of bySlit(terrace(rS, out))) {
        if (!free(discShape(c.p.x, c.p.z, rS), SM.gap, false, NaN)) continue;
        const f = dirOf(c.rot);
        const q = [1, -1]
          .map((k) => add(add(c.p, perp(f), k * SM.stool.side), f, -SM.stool.back))
          .find((q) => dist(q, obs) <= flatR && free(discShape(q.x, q.z, rB), SM.gap, false, NaN));
        if (withStool && !q) continue;
        scope = c;
        stool = q ?? null;
        break;
      }
      if (scope) break;
    }
    if (scope) {
      put(ctx, isl, 'tripodTelescope', scope.p, scope.rot, { variant: SM.tripodVariant });
      if (stool) {
        put(ctx, isl, 'bookCart', stool, scope.rot, {
          sh: discShape(stool.x, stool.z, rB),
          variant: SM.stool.variant,
        });
        story('bookStepGazer', stool, scope.rot, ['tripodTelescope', 'bookCart']);
      }
      const at = scope.p;
      // the comet board on the terrace next to it, its face outward (a slim rect along the rim,
      // inside the flat core with a sample cell to spare), nearest the telescope
      const B = SM.board;
      // the passes (TASK-461): the flat rim first; then ground a little farther off the level
      // (the pads level it, the sample cells kept), more bearings, the door sector narrowed
      let board = false;
      for (const pass of B.passes) {
        const r0 = S.observatory.radius + SM.gap + B.d / 2;
        const rim = ringAt(obs, r0, flatR, pass.angles, phase, out)
          .filter(
            (c) =>
              angGap(face(obs, c.p), door) >= pass.doorKeepDeg * DEG &&
              Math.abs(heightAt(ctx.h, c.p.x, c.p.z) - obsY) <= pass.drop,
          )
          .sort((a, b) => dist(a.p, at) - dist(b.p, at));
        for (const c of rim) {
          const sh = rectShape(c.p.x, c.p.z, c.rot, B.w, B.d);
          if (!free(sh, SM.gap, false, NaN) || !inPadCore(sh, pass.cell)) continue;
          put(ctx, isl, 'chalkboard', c.p, c.rot, { sh, variant: B.variant });
          board = true;
          break;
        }
        if (board) break;
      }
      story(
        'cometWatch',
        scope.p,
        scope.rot,
        board
          ? ['observatory', 'tripodTelescope', 'chalkboard']
          : ['observatory', 'tripodTelescope'],
      );
    }
    // the owl box behind the dome (opposite the door first)
    const back = terrace(radiusOf('owlBox'), (p) => face(p, obs), SM.slimDrop).sort(
      (a, b) => angGap(face(obs, b.p), door) - angGap(face(obs, a.p), door),
    );
    const owl = placeFirst('owlBox', back, SM.owlVariant, { gap: SM.gap });
    if (owl) {
      story('owlNight', owl.p, owl.rot, ['owlBox']);
      owlStory = true;
    }
  }

  // ---- the base: the weather balloon cart (and an owl box) by the mast
  const B = CS.balloon;
  const mast = fixturesOf('weatherMast')[0];
  const br = rng.fork('balloon');
  let cart: Cand | null = null;
  if (mast) {
    const cands = ringAt(mast, B.ring[0], B.ring[1], B.angles, br.range(0, TAU), (p) =>
      face(p, mast),
    );
    cart = placeFirst('weatherBalloonCart', cands, B.variant);
    const owl = placeFirst('owlBox', cands, B.owlVariant);
    if (owl && !owlStory) story('owlNight', owl.p, owl.rot, ['owlBox']);
  }
  if (!cart && s.obs) {
    // no mast (or no room by it): the launch spot on the lawn round the summit
    const obs = s.obs;
    const cands = ringAt(obs, B.fallback[0], B.fallback[1], 16, br.range(0, TAU), (p) =>
      face(p, obs),
    );
    cart = placeFirst('weatherBalloonCart', cands, B.variant, { ok: offWalks });
  }
  // M22: neither the summit nor the base had room for the owl box: the nearest free lawn round the quad
  if (!stories.some((st) => st.kind === 'owlNight')) {
    const O = CS.owlFallback;
    const cands = islandCells(ctx, isl)
      .map((i) => cellPos(ctx, i))
      .filter((p) => dist(p, quad) >= O.ring[0] && dist(p, quad) <= O.ring[1])
      .sort((a, b) => dist(a, quad) - dist(b, quad))
      .map((p) => ({ p, rot: face(p, quad) }));
    const owl = placeFirst('owlBox', cands, B.owlVariant, { ok: offWalks });
    if (owl) story('owlNight', owl.p, owl.rot, ['owlBox']);
  }
  const late = !cart;
  if (!cart) {
    // TASK-461: the flattest free lawn round the quad on its own pad (a steeper notch allowed)
    const L = B.lawn;
    const cands = islandCells(ctx, isl)
      .map((i) => cellPos(ctx, i))
      .filter((p) => dist(p, quad) >= L.ring[0] && dist(p, quad) <= L.ring[1])
      .map((p) => ({
        p,
        rot: face(p, quad),
        rel: reliefAround(discShape(p.x, p.z, radiusOf('weatherBalloonCart'))),
      }))
      .filter((c) => c.rel <= L.relief)
      .sort((a, b) => a.rel - b.rel || dist(a.p, quad) - dist(b.p, quad));
    cart = placeFirst('weatherBalloonCart', cands, B.variant, {
      ground: (sh) => (padClear(sh) ? 'pad' : null),
      ok: offWalks,
    });
  }
  if (!cart) {
    // …else on the quad paving round the fountain, off the avenue mouths
    const Q = B.quad;
    const cands = ringAt(quad, Q.ring[0], Q.ring[1], Q.angles, 0, (p) => face(p, quad)).filter(
      (c) => Math.min(...s.avenues.map((v) => angGap(face(quad, c.p), v))) >= Q.avenueKeepDeg * DEG,
    );
    cart = placeFirst('weatherBalloonCart', cands, B.variant, { plaza: true });
  }
  if (cart)
    story(
      'balloonLaunch',
      cart.p,
      cart.rot,
      mast && !late ? ['weatherBalloonCart', 'weatherMast'] : ['weatherBalloonCart'],
    );

  // ---- glasshouses: a row of mini volcano terrariums in front of the terrarium row
  const houses = fixturesOf(S.glasshouse.def);
  if (houses.length) {
    const V = CS.volcanoes;
    const mid = {
      x: houses.reduce((a, h) => a + h.x, 0) / houses.length,
      z: houses.reduce((a, h) => a + h.z, 0) / houses.length,
    };
    const f = dirOf(houses[0].rotY);
    const along = houses.length > 1 ? unit(houses[0], houses[houses.length - 1]) : perp(f);
    const rT = radiusOf(S.glasshouse.def);
    const rV = radiusOf('miniVolcanoTerrarium');
    let row: XZ[] | null = null;
    // behind the row first (the doors and their walk stay open), else in front of it
    let facing = houses[0].rotY;
    let grounds: ('core' | 'pad' | null)[] = [];
    search: for (const n of V.count)
      for (const sd of [-1, 1])
        for (const df of V.front)
          for (const sl of V.slide) {
            const c = add(add(mid, f, sd * (rT + df)), along, sl);
            const pts = Array.from({ length: n }, (_, k) =>
              add(c, along, (k - (n - 1) / 2) * V.pitch),
            );
            const shs = pts.map((q) => discShape(q.x, q.z, rV));
            if (!shs.every((sh) => free(sh, CS.gap.plaza, false, NaN))) continue;
            const gs = shs.map((sh) => groundOf(sh));
            if (gs.some((g) => !g)) continue;
            row = pts;
            grounds = gs;
            facing = houses[0].rotY + (sd > 0 ? 0 : Math.PI);
            break search;
          }
    if (row) {
      row.forEach((q, k) =>
        put(ctx, isl, 'miniVolcanoTerrarium', q, facing, {
          variant: k % 2,
          pad: grounds[k] === 'pad' ? CS.pad : undefined,
        }),
      );
      story('volcanoSteam', row[Math.floor(row.length / 2)], facing + Math.PI, [
        'miniVolcanoTerrarium',
      ]);
    }
  }

  // ---- pigeon perches beside the statues (scholars first)
  {
    const P = CS.pigeons;
    let n = 0;
    for (const def of P.statues)
      for (const st of fixturesOf(def)) {
        if (n >= P.max) break;
        const r = radiusOf(def) + radiusOf('pigeonPerch') + P.out;
        const cands = ringAt(st, r, r, P.angles, st.rotY, (p) => face(p, st));
        // the scholar statues stand on the quad paving
        if (
          !placeFirst('pigeonPerch', cands, n % 2, { plaza: def === 'scholarStatue', flat: P.flat })
        )
          continue;
        if (n === 0) story('pigeonStatue', st, st.rotY, ['pigeonPerch', def]);
        n++;
      }
  }

  // ---- telescopes on the terrace edges, looking out to sea, spread apart
  {
    const T = CS.tripods;
    const want = rng.fork('tripods').int(T.count[0], T.count[1]);
    const placed: XZ[] = fixturesOf('tripodTelescope').map((f) => ({ x: f.x, z: f.z }));
    const c0 = { x: isl.cx, z: isl.cz };
    const cells = islandCells(ctx, isl)
      .filter((i) => ctx.sdf[i] >= T.shore[0] && ctx.sdf[i] <= T.shore[1])
      .map((i) => {
        const p = cellPos(ctx, i);
        return { p, y: heightAt(ctx.h, p.x, p.z) };
      })
      .filter((c) => c.y >= T.minUp)
      // the highest edges first (the view); the cell order breaks ties
      .sort((a, b) => b.y - a.y)
      .map((c) => c.p);
    for (let k = 0; k < want; k++) {
      const cands = cells
        .filter((p) => placed.every((q) => dist(p, q) >= T.spread))
        .map((p) => ({ p, rot: face(c0, p) }));
      const got = placeFirst('tripodTelescope', cands, T.variant, { ok: offWalks });
      if (!got) break;
      placed.push(got.p);
    }
  }
  // ---- R9 arboretum (M22 TASK-483): up to six labelled species in the south-west of the lawns, each
  // placed on its own free spot (the first nearest the south-west, the others within `spread` of it,
  // `spacing` apart), a specimen plate (chalkboard v3) `plate` u in front of it toward the quad. Trees
  // need only their trunk disc; the plate (and the pergola) stand on near-level ground.
  {
    const A = CS.arbor;
    const sw = A.southWest;
    const cands = islandCells(ctx, isl)
      .map((i) => cellPos(ctx, i))
      .filter((p) => dist(p, quad) >= A.quad[0] && dist(p, quad) <= A.quad[1])
      .map((p) => {
        const u = unit(quad, p);
        return { p, bias: -3 * (u.x * sw[0] + u.z * sw[1]) + 0.05 * dist(p, quad) };
      })
      .sort((a, b) => a.bias - b.bias)
      .map((c) => c.p);
    const chosen: XZ[] = [];
    for (const def of A.species) {
      for (const c of cands) {
        if (chosen.some((q) => dist(q, c) < A.spacing)) continue;
        if (chosen.length > 0 && dist(c, chosen[0]) > A.spread) continue;
        let placed = false;
        for (const t of A.turns) {
          const rot = face(c, quad) + t * DEG;
          const sh =
            def.def === 'pergola'
              ? rectShape(c.x, c.z, rot, S.pergola.size[0], S.pergola.size[1])
              : discShape(c.x, c.z, def.r);
          const q = add(c, dirOf(rot), def.plate);
          const shQ = discShape(q.x, q.z, A.plateR);
          if (!roomy(sh, CS.gap.lawn, A.minShore) || !roomy(shQ, CS.gap.lawn, A.minShore)) continue;
          if (reliefAround(shQ) > A.plateRelief) continue;
          if (def.def === 'pergola' && relief(ctx, sh) > A.pergolaRelief) continue;
          if (!opensPins(sh) || !opensPins(shQ)) continue;
          put(ctx, isl, def.def, c, rot, {
            sh,
            variant: def.variant,
            scale: def.scale !== 1 ? def.scale : undefined,
          });
          put(ctx, isl, 'chalkboard', q, rot, { sh: shQ, variant: PLATE_VARIANT });
          placed = true;
          break;
        }
        if (!placed) continue;
        chosen.push(c);
        break;
      }
    }
  }

  // ---- R3-16 / R18: a seal sleeps on the end of the pier (a spot critter, not an agent)
  {
    const SE = CS.seal;
    const dk = ctx.docks.find((d) => d.islandId === isl.id);
    if (dk) {
      const dir = dirOf(dk.rotY);
      const L = dk.segments * DOCK.segment;
      const p = add(add(dk, dir, L - SE.back), perp(dir), SE.side);
      stories.push({
        kind: 'sealPier',
        islandId: isl.id,
        // (y is an offset over the ground: the story spot lands on the deck, not the sea floor)
        pos: { x: p.x, y: SE.deckY - heightAt(ctx.h, p.x, p.z), z: p.z },
        rotY: dk.rotY,
        defs: ['researchVessel'],
      });
    }
  }

  // ---- R12 hedge maze (M22 TASK-483, R3-16): 3-4 of the garden's parterres become maze tiles; each
  // takes the pattern whose openings face the most neighbouring maze tiles; one hosts the pacing bot
  {
    const M = CS.maze;
    const plots = fixturesOf('hedgeParterre');
    const n = plots.length;
    const want = Math.min(rng.fork('maze').int(M.count[0], M.count[1]), n - 1);
    if (want >= 2) {
      const start = rng.fork('maze', 1).int(0, n - 1);
      const picks: number[] = [];
      for (let k = 0; picks.length < want && k < n * 2; k++) {
        const i = (start + Math.floor((k * n) / want)) % n;
        if (!picks.includes(i)) picks.push(i);
      }
      for (let i = 0; picks.length < want; i++) if (!picks.includes(i)) picks.push(i);
      const tiles = picks.sort((a, b) => a - b).map((i) => plots[i]);
      const gaps = tiles.flatMap((a, i) => tiles.slice(i + 1).map((b) => dist(a, b)));
      const pitch = gaps.length > 0 ? Math.min(...gaps) : 1;
      const taken: number[] = [];
      tiles.forEach((t, ti) => {
        let best = 0;
        let bestScore = -Infinity;
        for (let k = 0; k < MAZE.patterns; k++) {
          const pat = mazeOf(MAZE.firstVariant + k);
          let score = 0;
          for (const o of pat.open) {
            const v = SIDE_VEC[o.side];
            const d = unit(t, lotLocalToWorld(t, v[0], v[1]));
            for (let tj = 0; tj < ti; tj++) {
              if (dist(t, tiles[tj]) > pitch * M.near) continue;
              const e = unit(t, tiles[tj]);
              if (d.x * e.x + d.z * e.z > 0.8) score++;
            }
          }
          // on ties, not the pattern taken just before
          if (taken.length > 0 && taken[taken.length - 1] === k) score -= 0.5;
          if (score > bestScore) {
            bestScore = score;
            best = k;
          }
        }
        taken.push(best);
        t.variant = MAZE.firstVariant + best;
      });
      // the maze nearest the quad hosts the pacing bot (first in the story order: a tableau slot)
      const host = [...tiles].sort((a, b) => dist(a, quad) - dist(b, quad))[0];
      const pace = mazeOf(host.variant ?? MAZE.firstVariant).pace;
      const at = lotLocalToWorld(host, pace.x, pace.z);
      stories.unshift({
        kind: 'mazePace',
        islandId: isl.id,
        pos: { x: at.x, y: 0, z: at.z },
        rotY: pace.alongZ ? host.rotY : host.rotY - Math.PI / 2,
        defs: ['hedgeParterre'],
      });
    }
  }
  return stories;
}

/**
 * Faculty pennant lines (pennantLine: poles ±half across the cord): the first along the library
 * front (the research faculty), then across the avenues out of the quad, the other faculties in
 * THEME_IDS order. The cord span stays walkable; only the poles block. `ground` levels the cord
 * strip (inside a pad core, its own pad, or already flat); `opens` keeps the path pins open.
 */
function pennants(
  ctx: SiteCtx,
  isl: IslandData,
  quad: XZ,
  lib: { x: number; z: number; rotY: number } | undefined,
  avenues: readonly number[],
  ground: (sh: Shape) => 'core' | 'pad' | null,
  opens: (sh: Shape) => boolean,
  lawn: { ground: (sh: Shape) => 'core' | 'pad' | null; ok: (sh: Shape) => boolean },
): void {
  const P = CS.pennants;
  const R = S.quad.radius;
  const research = THEME_IDS.indexOf('research');
  const order = [research, ...THEME_IDS.map((_, i) => i).filter((i) => i !== research)];
  const cands: Cand[] = [];
  if (lib) {
    const d = S.ring.buildings[0].size[1] / 2 + P.libraryGap;
    for (const extra of [0, 0.6])
      cands.push({ p: add(lib, dirOf(lib.rotY), d + extra), rot: lib.rotY });
  }
  for (let t = 0; t <= P.reach; t += P.step)
    for (const a of avenues) cands.push({ p: add(quad, dirOf(a), R + P.start + t), rot: a });
  // TASK-461 fallback (only while fewer than `min` lines stand): chords across the quad paving,
  // their poles off the avenue mouths, the chords between the avenues first
  const C = P.chords;
  const avGap = (b: number): number => Math.min(...avenues.map((v) => angGap(b, v)));
  const chords: (Cand & { gap: number })[] = [];
  for (const d of C.d)
    for (let k = 0; k < C.angles; k++) {
      const b = (k / C.angles) * TAU;
      const pb = Math.atan2(P.half, d);
      const gap = Math.min(avGap(b + pb), avGap(b - pb));
      if (gap < C.avenueKeepDeg * DEG) continue;
      chords.push({ p: add(quad, dirOf(b), d), rot: b, gap: avGap(b) });
    }
  chords.sort((a, b) => b.gap - a.gap);
  const primary = cands.length;
  cands.push(...chords);
  // …then lines on the lawn round the quad, the cord along the contour (a low pad levels the
  // strip; off the walks, clear of everything), nearest the quad first
  const lawnFrom = cands.length;
  const L = P.lawn;
  const lawnCands = islandCells(ctx, isl)
    .map((i) => cellPos(ctx, i))
    .filter((p) => dist(p, quad) >= L.ring[0] && dist(p, quad) <= L.ring[1])
    .map((p) => {
      const e = ctx.h.cellSize;
      const gx = heightAt(ctx.h, p.x + e, p.z) - heightAt(ctx.h, p.x - e, p.z);
      const gz = heightAt(ctx.h, p.x, p.z + e) - heightAt(ctx.h, p.x, p.z - e);
      // the strip's depth axis down the slope: the cord runs along the contour
      return { p, rot: Math.hypot(gx, gz) > 1e-6 ? ang(gx, gz) : face(quad, p), d: dist(p, quad) };
    })
    .sort((a, b) => a.d - b.d);
  cands.push(...lawnCands);
  const lines: XZ[] = [];
  // (the pins' flood fill last: every test is pure, the cheap ones go first)
  const pole = (q: XZ): boolean =>
    onIsland(ctx, isl, q.x, q.z) &&
    heightAt(ctx.h, q.x, q.z) > 0.5 &&
    clear(ctx, isl, discShape(q.x, q.z, P.poleR), 0.2, true);
  for (const [i, c] of cands.entries()) {
    if (lines.length >= (i < primary ? P.count : P.min)) break;
    if (lines.some((q) => dist(q, c.p) < P.spacing - 0.1)) continue;
    const nrm = perp(dirOf(c.rot));
    const a = add(c.p, nrm, P.half);
    const b = add(c.p, nrm, -P.half);
    if (!pole(a) || !pole(b)) continue;
    // the rigid cord needs both poles on one level: the strip under it is levelled
    const strip = rectShape(c.p.x, c.p.z, c.rot, 2 * (P.half + P.poleR), P.cordDepth);
    // the cord grazes no building or dome (posts and lamps beside the walk may stand under it)
    const big = (o: Shape): boolean => (o.r > 0 ? o.r : Math.max(o.hw, o.hd)) > P.bigR;
    if (ctx.shapes[isl.id].some((o) => o.tag !== 'plaza' && big(o) && shapesOverlap(o, strip, 0.2)))
      continue;
    let g: 'core' | 'pad' | null;
    if (i < lawnFrom) g = ground(strip);
    else {
      if (!clear(ctx, isl, strip, 0.2) || !lawn.ok(strip)) continue;
      g = lawn.ground(strip);
    }
    if (!g || !opens(discShape(a.x, a.z, P.poleR)) || !opens(discShape(b.x, b.z, P.poleR)))
      continue;
    ctx.fixtures.push({
      defId: 'pennantLine',
      x: c.p.x,
      z: c.p.z,
      rotY: c.rot,
      islandId: isl.id,
      variant: order[lines.length % order.length],
    });
    if (g === 'pad') addPad(ctx, isl, strip, CS.pad, S.padStep);
    addShape(ctx, isl, discShape(a.x, a.z, P.poleR), true);
    addShape(ctx, isl, discShape(b.x, b.z, P.poleR), true);
    // the span under the cord: walkable, but nothing later grows into the pennants
    addShape(ctx, isl, rectShape(c.p.x, c.p.z, c.rot, 2 * P.half, P.cordDepth), false);
    lines.push(c.p);
  }
}
