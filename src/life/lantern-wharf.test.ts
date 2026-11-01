import { describe, expect, it } from 'vitest';
import { CULTURE_BOATS, SAILBOAT } from '../content/life.ts';
import { pointAtLength } from '../core/math/catmull-rom.ts';
import { generateWorld, heightAt } from '../world/index.ts';
import { lanternWharfRoute, ferryCallAt } from './boats.ts';
import type { LifeCtx } from './ctx.ts';
import { buildFerrySchedule, ferryDist, ferryDwelling, sinceFerryArrival } from './ferry.ts';

/** The lantern boat's mooring route (M31 TASK-537, D-127). */
const SEEDS = [1001, 1000, 2052, 2841, 4682, 7312];
const LB = CULTURE_BOATS.lantern;
const ctxOf = (seed: number) => {
  const world = generateWorld(seed);
  const ctx = {
    world,
    h: (x: number, z: number) => heightAt(world.height, x, z),
  } as unknown as LifeCtx;
  return { world, ctx };
};

describe('lantern boat at Colour Wharf', { timeout: 120_000 }, () => {
  it('a closed route with one stop at the mooring, all in water', () => {
    for (const seed of SEEDS) {
      const { world, ctx } = ctxOf(seed);
      const R = lanternWharfRoute(ctx);
      const m = `seed ${seed}`;
      expect(R, m).not.toBeNull();
      expect(R!.stopArcs, m).toHaveLength(1);
      const moor = world.islands.find((i) => i.theme === 'design')!.anchors.lanternMoor;
      const p = pointAtLength(R!.pts, R!.lens, R!.stopArcs[0], true, { x: 0, y: 0 });
      expect(Math.hypot(p.x - moor.x, p.y - moor.z), m).toBeLessThan(1);
      let dry = 0;
      for (let s = 0; s < R!.total; s += 1) {
        const q = pointAtLength(R!.pts, R!.lens, s, true, { x: 0, y: 0 });
        if (ctx.h(q.x, q.y) > -SAILBOAT.route.minDepth * 0.2) dry++;
      }
      expect(dry, `${m} dry samples`).toBe(0);
    }
  });

  it('stands at the mooring from t = 0 for its dwell, then leaves and comes home', () => {
    const { ctx } = ctxOf(1001);
    const R = lanternWharfRoute(ctx)!;
    const sch = buildFerrySchedule(R.total, R.stopArcs, R.dwell, LB.speed, LB.decel);
    expect(ferryDwelling(sch, 1)).toBe(true);
    expect(ferryDwelling(sch, LB.dwell - 1)).toBe(true);
    expect(ferryDwelling(sch, LB.dwell + 5)).toBe(false);
    expect(ferryDist(sch, LB.dwell + 5)).toBeGreaterThan(0);
    expect(ferryDist(sch, sch.cycle - 1) - ferryDist(sch, 0)).toBeGreaterThan(R.total - 1);
  });

  it('the ferry call runs the ritual clock: a line 0 harbour keeps it with one ferry', () => {
    const { world } = ctxOf(1001);
    const isl = world.islands.find((i) => i.theme === 'design')!;
    const di = world.docks.findIndex((d) => d.islandId === isl.id);
    const call = ferryCallAt(world, di, 2);
    expect(call).not.toBeNull();
    let t = 0;
    while (sinceFerryArrival(call!, t) > 0.25) t += 0.25;
    expect(t).toBeLessThan(call!.cycle + 1);
  });
});
