/**
 * Story-spot keep-out (TASK-485): the stage of a story spot (the critters' routes, the tableau bots'
 * feet) stays clear of planner fixtures that are not the spot's own props and of scatter trees. The
 * stage is derived from the life content (SPOT_CRITTERS, TABLEAU), so every spot of every island
 * gets one; clearances are STORY_KEEP_OUT.
 */
import { TABLEAU } from '../../content/life.ts';
import { SPOT_CRITTERS } from '../../content/life-spot-critters.ts';
import { STORY_KEEP_OUT } from '../../content/placement.ts';
import { lotLocalToWorld } from '../lot-frame.ts';
import type { FixtureData, StorySpot } from '../types.ts';
import { discShape, rectShape, shapeDist, type Shape } from './sites.ts';

type Spot = Pick<StorySpot, 'kind' | 'pos' | 'rotY'>;

/**
 * Keep-out shapes of one story spot (world xz), every clearance grown by `extra` u (the wider stage
 * that tall fixtures keep off). Elevated / fixture-anchored members have none.
 */
export function storyKeepOuts(sp: Spot, extra = 0): Shape[] {
  const out: Shape[] = [];
  const route = STORY_KEEP_OUT.route + extra;
  const stand = STORY_KEEP_OUT.stand + extra;
  const frame = { x: sp.pos.x, z: sp.pos.z, rotY: sp.rotY };
  for (const c of SPOT_CRITTERS[sp.kind] ?? []) {
    if (c.at || c.y === 'spot') continue;
    const p = lotLocalToWorld(frame, c.dx, c.dz);
    const r = c.reach ?? 0;
    if (c.idle === 'cross' || c.idle === 'pace')
      // along the spot frame's right axis = the rect's width axis
      out.push(rectShape(p.x, p.z, sp.rotY, 2 * (r + route), 2 * route));
    else if (c.idle === 'orbit') out.push(discShape(p.x, p.z, r + stand));
    else out.push(discShape(p.x, p.z, stand));
  }
  for (const b of TABLEAU[sp.kind] ?? []) {
    if (b.atSpot) continue;
    const p = lotLocalToWorld(frame, b.dx, b.dz);
    // a pacing bot walks the spot's +z axis = the rect's depth axis
    if (b.pace) out.push(rectShape(p.x, p.z, sp.rotY, 2 * stand, 2 * (b.pace.reach + stand)));
    else out.push(discShape(p.x, p.z, stand));
  }
  return out;
}

/**
 * The fixtures without the ones standing on a story spot's stage (same island; tall poles keep off
 * the wider stage of `STORY_KEEP_OUT.tall`). A spot's own props
 * never yield: the fixtures of its `defs` and of the defs its members anchor to / look at, within
 * `STORY_KEEP_OUT.own` of the spot. Keeps the order of the rest.
 */
export function clearStoryStages(
  fixtures: readonly FixtureData[],
  spots: readonly Pick<StorySpot, 'kind' | 'islandId' | 'pos' | 'rotY' | 'defs'>[],
): FixtureData[] {
  // a spot's own props (its defs, the fixtures its members anchor to / look at) near it always stay
  const own = new Set<FixtureData>();
  for (const sp of spots) {
    const defs = new Set(sp.defs);
    for (const c of SPOT_CRITTERS[sp.kind] ?? []) if (c.at) defs.add(c.at);
    for (const b of TABLEAU[sp.kind] ?? []) if (b.look) defs.add(b.look);
    for (const f of fixtures)
      if (
        f.islandId === sp.islandId &&
        defs.has(f.defId) &&
        Math.hypot(f.x - sp.pos.x, f.z - sp.pos.z) < STORY_KEEP_OUT.own
      )
        own.add(f);
  }
  const T = STORY_KEEP_OUT.tall;
  const stages = spots.map((sp) => ({
    islandId: sp.islandId,
    low: storyKeepOuts(sp),
    tall: storyKeepOuts(sp, T.extra),
  }));
  const pass = new Set<string>(STORY_KEEP_OUT.pass);
  const tall = new Set<string>(T.defs);
  return fixtures.filter(
    (f) =>
      own.has(f) ||
      pass.has(f.defId) ||
      !stages.some(
        (s) =>
          s.islandId === f.islandId &&
          (tall.has(f.defId) ? s.tall : s.low).some((sh) => shapeDist(sh, f.x, f.z) < 0),
      ),
  );
}
