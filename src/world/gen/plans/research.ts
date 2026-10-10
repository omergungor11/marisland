/**
 * Research island plan — "Biodome Lab" (TASK-400, M17b) on the Lonely Palm breached crater:
 * - the hero biodome on the profile's `dome` anchor in the bowl, its door toward the breach;
 * - 2 smaller biodomes around it (bowl edge / crater slope, levelled by their pads), clear of
 *   the hero's door sector;
 * - a short pier in the leeward cove with the research vessel moored alongside;
 * - paths: hero door (hub) ↔ small dome doors ↔ pier root, down the breach.
 * Crystal outcrops on the rim, instrument buoys and starfish come from the theme scatter
 * (content/themes/research.ts). Numbers: RESEARCH_SITE.
 */
import { DOCK } from '../../../content/settlements.ts';
import { RESEARCH_SITE as S } from '../../../content/themes/research.ts';
import { heightAt, type IslandData, type XZ } from '../../types.ts';
import {
  add,
  addPad,
  addShape,
  ang,
  bestSample,
  clear,
  dirOf,
  discShape,
  dist,
  dockWithLink,
  findDock,
  newPlan,
  onLand,
  pushFixture,
  rectShape,
  relief,
  ring,
  unit,
  type SiteCtx,
} from '../sites.ts';
import type { ThemePlanner } from './types.ts';

export const planResearch: ThemePlanner = ({ ctx, isl, rng }) => {
  const anchor = isl.anchors.dome;
  if (!anchor) return null;
  const lee = dirOf(ctx.windDir);
  const H = S.hero;
  const fits = (p: XZ, r: number, minShore: number): boolean => {
    const sh = discShape(p.x, p.z, r);
    return onLand(ctx, isl, sh, minShore, 0.3) && clear(ctx, isl, sh, S.gap);
  };
  const hero = fits(anchor, H.radius, H.minShore)
    ? anchor
    : bestSample(ctx, isl, anchor, H.search, (p) =>
        fits(p, H.radius, H.minShore) ? dist(p, anchor) : Infinity,
      );
  if (!hero || !fits(hero, H.radius, H.minShore)) return null;
  // the door faces leeward (the breach and the cove pier)
  const doorRot = ang(lee.x, lee.z);
  pushFixture(ctx, isl, H.def, hero, doorRot);
  addPad(ctx, isl, discShape(hero.x, hero.z, H.pad), 0);
  const heroDoor = add(hero, lee, H.radius + S.doorGap);
  const plan = newPlan('biodomes', heroDoor);
  plan.links.push({ pin: heroDoor, kind: 'path', done: () => undefined });

  // small domes: ring spots off the door sector, flattest and nearest first
  const doorKeep = (p: XZ): boolean => {
    const u = unit(hero, p);
    return u.x * lee.x + u.z * lee.z < S.doorCos;
  };
  const cands = ring(hero, S.small.ring[0], S.small.ring[1], 0.5, 24, rng.range(0, 1))
    .filter((p) => doorKeep(p) && fits(p, S.small.radius, S.small.minShore))
    .map((p) => ({ p, relief: relief(ctx, discShape(p.x, p.z, S.small.radius)) }))
    .filter((c) => c.relief <= S.maxRelief)
    .map((c) => ({ ...c, s: c.relief + 0.15 * dist(c.p, hero) }))
    .sort((a, b) => a.s - b.s);
  for (let k = 0; k < S.small.count; k++) {
    const c = cands.find((q) => fits(q.p, S.small.radius, S.small.minShore));
    if (!c) break;
    const face = unit(c.p, hero);
    // door toward the hero's front path: halfway between "at the hero" and leeward
    const d = unit({ x: 0, z: 0 }, { x: face.x + lee.x, z: face.z + lee.z });
    const rot = ang(d.x, d.z);
    pushFixture(ctx, isl, S.small.def, c.p, rot);
    addPad(ctx, isl, discShape(c.p.x, c.p.z, S.small.pad), 0);
    plan.links.push({
      pin: add(c.p, dirOf(rot), S.small.radius + S.doorGap),
      kind: 'path',
      done: () => undefined,
    });
  }

  // cove pier on the leeward shore + the vessel alongside it
  const prefer = add({ x: isl.cx, z: isl.cz }, lee, isl.radius * 1.3);
  const site = findDock(ctx, isl, {
    near: prefer,
    maxDist: isl.reach,
    prefer,
    lee: 6,
    carve: true,
    maxSegments: S.dock.maxSegments,
  });
  const di = dockWithLink(ctx, isl, plan, site, rng.fork('moorings'), {
    rowboats: 0,
    sailboats: 0,
  });
  if (di >= 0) moorVessel(ctx, isl, ctx.docks[di]);
  return plan;
};

/** The research vessel alongside the pier (either side), bow seaward; off the end as a fallback. */
function moorVessel(
  ctx: SiteCtx,
  isl: IslandData,
  dock: { x: number; z: number; rotY: number; segments: number },
): void {
  const V = S.vessel;
  const dir = dirOf(dock.rotY);
  const perp = { x: -dir.z, z: dir.x };
  const L = dock.segments * DOCK.segment;
  const along = Math.max(V.halfLength * 0.6, L - V.halfLength * 0.7);
  const spots: { p: XZ; rot: number }[] = [];
  for (const side of [1, -1])
    spots.push({ p: add(add(dock, dir, along), perp, side * V.side), rot: dock.rotY });
  spots.push({ p: add(dock, dir, L + V.halfBeam + 1.2), rot: ang(perp.x, perp.z) });
  for (const { p, rot } of spots) {
    const f = dirOf(rot);
    const s = { x: -f.z, z: f.x };
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
