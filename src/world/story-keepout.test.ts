/**
 * Story-spot keep-out (TASK-485): planner fixtures that are not a spot's own props and scatter
 * trees / bushes / rocks stay off every story spot's stage (critter routes, tableau bots' feet).
 * M22 QA: a C11 windsock stood on the Coding duck crossing (seed 1001) and hid the ducks.
 */
import { describe, expect, it } from 'vitest';
import { PROP_DEFS } from '../content/props.ts';
import { STORY_KEEP_OUT } from '../content/placement.ts';
import { PropFlag } from './prop-store.ts';
import { shapeDist } from './gen/sites.ts';
import { clearStoryStages, storyKeepOuts } from './gen/story-keepout.ts';
import { generateWorld } from './index.ts';

const SEEDS = [1001, 1, 2024, 4004, 6006];

describe('story-spot keep-out (TASK-485)', { timeout: 120_000 }, () => {
  it('the duck crossing (seed 1001) has its route clear of windsocks (the tall stage)', () => {
    const w = generateWorld(1001);
    const sp = w.storySpots.find((s) => s.kind === 'duckCrossing');
    expect(sp).toBeDefined();
    const stage = storyKeepOuts(sp!, STORY_KEEP_OUT.tall.extra);
    expect(stage.length).toBeGreaterThan(0);
    const socks = w.fixtures.filter((f) => f.defId === 'windsock' && f.islandId === sp!.islandId);
    expect(socks.length).toBeGreaterThan(0);
    for (const f of socks)
      for (const sh of stage) expect(shapeDist(sh, f.x, f.z)).toBeGreaterThan(0);
  });

  it('no foreign fixture and no scatter prop stands on any stage', () => {
    for (const seed of SEEDS) {
      const w = generateWorld(seed);
      // the filter is idempotent on the final world: nothing left to clear
      expect(clearStoryStages(w.fixtures, w.storySpots).length, `seed ${seed}`).toBe(
        w.fixtures.length,
      );
      const stages = w.storySpots.map((sp) => storyKeepOuts(sp));
      const p = w.props;
      for (let i = 0; i < p.count; i++) {
        const def = PROP_DEFS[p.defId[i]];
        if ((def.flags & PropFlag.groundCover) !== 0) continue;
        for (const [k, st] of stages.entries())
          for (const sh of st)
            expect(
              shapeDist(sh, p.x[i], p.z[i]),
              `seed ${seed} ${def.id} on ${w.storySpots[k].kind}`,
            ).toBeGreaterThan(0);
      }
    }
  });

  it('only foreign fixtures on the stage yield (own props, overhead spans and the rest stay)', () => {
    // duck crossing at the origin facing +x: the ducks cross 2.6 u ahead, along z (± reach 2.4)
    const sp = { kind: 'duckCrossing', islandId: 0, pos: { x: 0, y: 0, z: 0 }, rotY: 0 };
    const spot = { ...sp, defs: ['bikeRack'] as const };
    const fx = (defId: string, x: number, z: number) => ({ defId, x, z, rotY: 0, islandId: 0 });
    const { route, tall } = STORY_KEEP_OUT;
    const onRoute = fx('pergolaDesk', 2.6, 1);
    const own = fx('bikeRack', 2.6, -1);
    const span = fx(STORY_KEEP_OUT.pass[0], 2.6, 0);
    // between the low and the tall clearance: a low fixture stays, a pole yields
    const lowNear = fx('pergolaDesk', 2.6 + route + 0.3, 0);
    const poleNear = fx(tall.defs[0], 2.6 + route + 0.3, 0);
    const poleAway = fx(tall.defs[0], 2.6 + route + tall.extra + 0.3, 0);
    const otherIsland = { ...onRoute, islandId: 1 };
    const kept = clearStoryStages(
      [onRoute, own, span, lowNear, poleNear, poleAway, otherIsland],
      [spot],
    );
    expect(kept).toEqual([own, span, lowNear, poleAway, otherIsland]);
  });
});
