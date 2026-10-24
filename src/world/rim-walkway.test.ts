/** TASK-480: the island-agnostic rim walkway primitive (world/gen/rim-walkway.ts). */
import { describe, expect, it } from 'vitest';
import { QA_RIM_WALK } from '../content/themes/qa.ts';
import { contours, findLip, inlandAt, rimSamples, rimWalkway } from './gen/rim-walkway.ts';
import type { SiteCtx } from './gen/sites.ts';
import { generateWorld, sampleGrid, Zone, type IslandData, type WorldData } from './index.ts';

const worlds = new Map<number, WorldData>();
const world = (seed: number): WorldData => {
  let w = worlds.get(seed);
  if (!w) worlds.set(seed, (w = generateWorld(seed)));
  return w;
};

/** A planner context over a finished world (copied zones, no obstacles): enough for the primitive. */
function ctxOf(w: WorldData): SiteCtx {
  return {
    h: w.height,
    n: w.height.n,
    sdf: w.shoreSdf,
    zone: w.zone.slice(),
    islandMap: w.islandMap,
    islands: w.islands,
    shapes: w.islands.map(() => []),
    fixtures: [],
  } as unknown as SiteCtx;
}
const islandOf = (w: WorldData, theme: string): IslandData =>
  w.islands.find((i) => i.theme === theme) as IslandData;

describe('rim walkway primitive (TASK-480)', () => {
  it('finds the bluff lip on the bluff plateaus (QA, Coding), not on a beach island', () => {
    for (const seed of [1001, 4004, 1263]) {
      const w = world(seed);
      const ctx = ctxOf(w);
      for (const t of ['qa', 'coding']) {
        const lip = findLip(ctx, islandOf(w, t), QA_RIM_WALK);
        expect(lip, `seed ${seed} ${t}`).not.toBeNull();
        expect(lip as number, `seed ${seed} ${t}`).toBeGreaterThanOrEqual(3);
        expect(lip as number, `seed ${seed} ${t}`).toBeLessThanOrEqual(10);
      }
    }
  });

  it('contours: chained iso-lines of the shore SDF, inland on the left', () => {
    const w = world(1001);
    const ctx = ctxOf(w);
    const isl = islandOf(w, 'qa');
    const level = 8;
    const runs = contours(ctx, isl, level);
    const main = runs.reduce((a, b) => (b.pts.length > a.pts.length ? b : a));
    expect(main.closed).toBe(true);
    expect(main.pts.length).toBeGreaterThan(60);
    main.pts.forEach((p, i) => {
      // on the iso-line (bilinear vs the grid's linear edge crossings: within a cell's error)
      expect(Math.abs(sampleGrid(w.height, w.shoreSdf, p.x, p.z, -999) - level)).toBeLessThan(1.2);
      if (i % 7) return;
      const n = inlandAt(main, i);
      const inl = sampleGrid(w.height, w.shoreSdf, p.x + n.x * 1.5, p.z + n.z * 1.5, -999);
      const sea = sampleGrid(w.height, w.shoreSdf, p.x - n.x * 1.5, p.z - n.z * 1.5, -999);
      expect(inl).toBeGreaterThan(sea);
    });
  });

  it('is island-agnostic: the same call builds a walk on Coding with its own zone, deterministically', () => {
    const w = world(1001);
    const isl = islandOf(w, 'coding');
    const spec = { ...QA_RIM_WALK, zone: Zone.streetCoding };
    const run = (): { posts: string; painted: number; samples: number } => {
      const ctx = ctxOf(w);
      const walk = rimWalkway(ctx, isl, spec, w.paths);
      return {
        posts: JSON.stringify(ctx.fixtures),
        painted: walk.painted,
        samples: rimSamples(walk, 2).length,
      };
    };
    const a = run();
    expect(a.painted).toBeGreaterThan(30);
    expect(a.samples).toBeGreaterThan(20);
    expect(JSON.parse(a.posts).length).toBeGreaterThan(10);
    expect(run()).toEqual(a);
  });
});
