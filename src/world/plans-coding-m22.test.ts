/**
 * Coding M22 quick wins (TASK-479): pinwheel meadow, hedge glyphs, windsock avenue, fairy-light
 * grove, nap grove, weather-vane pods, halved solar farm. 30 seeds; the sites are searched on the
 * plateau that is left, so each of them may be missing on a small island (coverage floors below).
 */
import { describe, expect, it } from 'vitest';
import { CODING_CULTURE_SITES as CS } from '../content/cultures/coding.ts';
import { LOT_ROOFS } from '../content/settlements.ts';
import { PINWHEEL_VARIANT } from '../geo/themes/culture-coding-m22.ts';
import { heightAt, generateWorld, type IslandData, type WorldData } from './index.ts';
import { shapeDist } from './gen/sites.ts';
import { storyKeepOuts } from './gen/story-keepout.ts';
import { STORY_KEEP_OUT } from '../content/placement.ts';

const SEEDS = Array.from({ length: 30 }, (_, i) => 1 + i * 37);
const worlds = new Map<number, WorldData>();
const world = (seed: number): WorldData => {
  let w = worlds.get(seed);
  if (!w) {
    w = generateWorld(seed);
    worlds.set(seed, w);
  }
  return w;
};
const codingOf = (w: WorldData): IslandData => {
  const isl = w.islands.find((i) => i.theme === 'coding');
  if (!isl) throw new Error(`seed ${w.seed}: no coding island`);
  return isl;
};

describe('Coding M22 quick wins (TASK-479)', { timeout: 120_000 }, () => {
  it('windsocks: 12 along the park (less the ones on a story stage), every one streams downwind (heading wind + π/2)', () => {
    for (const seed of SEEDS) {
      const w = world(seed);
      const socks = w.fixtures.filter(
        (f) => f.islandId === codingOf(w).id && f.defId === 'windsock',
      );
      // TASK-485: a sock on a story spot's stage (the duck crossing) yields; never more than two
      expect(socks.length, `seed ${seed}`).toBeLessThanOrEqual(CS.m22.windsocks.u.length * 2);
      expect(socks.length, `seed ${seed}`).toBeGreaterThanOrEqual(
        CS.m22.windsocks.u.length * 2 - 2,
      );
      const stages = w.storySpots.flatMap((sp) => storyKeepOuts(sp, STORY_KEEP_OUT.tall.extra));
      for (const s of socks)
        for (const sh of stages) expect(shapeDist(sh, s.x, s.z), `seed ${seed}`).toBeGreaterThan(0);
      for (const s of socks) {
        const d = Math.atan2(
          Math.sin(s.rotY - w.windDir - Math.PI / 2),
          Math.cos(s.rotY - w.windDir - Math.PI / 2),
        );
        expect(Math.abs(d), `seed ${seed}`).toBeLessThan(1e-6);
        expect([0, 1]).toContain(s.variant);
      }
    }
  });

  it('pinwheel meadow: a grid of kite v3 facing the wind, on level land, on all but ≤ 1 seed', () => {
    // TASK-511 (D-090): seed 186 (the island stepped out from the grown HQ: other zone noise) has no
    // room for even the smallest grid; at most one seed may miss the meadow
    let missing = 0;
    for (const seed of SEEDS) {
      const w = world(seed);
      const pins = w.fixtures.filter(
        (f) =>
          f.islandId === codingOf(w).id && f.defId === 'kite' && f.variant === PINWHEEL_VARIANT,
      );
      if (pins.length === 0) {
        missing++;
        continue;
      }
      expect(pins.length, `seed ${seed}`).toBeGreaterThanOrEqual(20);
      expect(pins.length, `seed ${seed}`).toBeLessThanOrEqual(48);
      for (const p of pins) {
        const d = Math.atan2(
          Math.sin(p.rotY - w.windDir - Math.PI),
          Math.cos(p.rotY - w.windDir - Math.PI),
        );
        expect(Math.abs(d), `seed ${seed}`).toBeLessThan(1e-6);
        expect(heightAt(w.height, p.x, p.z), `seed ${seed}`).toBeGreaterThan(0.3);
      }
      // all within one bed (a 6 x 8 grid spans < 14 u)
      const xs = pins.map((p) => p.x);
      const zs = pins.map((p) => p.z);
      expect(Math.max(...xs) - Math.min(...xs), `seed ${seed}`).toBeLessThan(14);
      expect(Math.max(...zs) - Math.min(...zs), `seed ${seed}`).toBeLessThan(14);
    }
    expect(missing, 'seeds without a meadow').toBeLessThanOrEqual(1);
  });

  it('hedge glyphs, nap grove and wreaths: coverage floors over 30 seeds', () => {
    let glyphs = 0;
    let groves = 0;
    let wreathTrees = 0;
    for (const seed of SEEDS) {
      const w = world(seed);
      const id = codingOf(w).id;
      const fx = w.fixtures.filter((f) => f.islandId === id);
      // the park / garden hedges are 16 pieces; glyph pieces come on top (each letter 1 - 7 pieces)
      if (fx.filter((f) => f.defId === 'hedge' && f.variant === 0).length >= 24) glyphs++;
      // turbine-foot hammocks are 3; the grove adds 3 - 6 (+ one mug and a nap story each of 3)
      if (fx.filter((f) => f.defId === 'hammock').length >= 6) groves++;
      const wreaths = fx.filter((f) => f.defId === 'fairyWreath');
      wreathTrees += wreaths.length;
      // every wreath dresses a tree of the same variant, same spot and yaw
      for (const wr of wreaths) {
        const tree = fx.find(
          (f) => f.defId === 'roundTree' && f.x === wr.x && f.z === wr.z && f.rotY === wr.rotY,
        );
        expect(tree, `seed ${seed} wreath@${wr.x.toFixed(1)},${wr.z.toFixed(1)}`).toBeDefined();
        expect(tree?.variant, `seed ${seed}`).toBe(wr.variant);
      }
      // the nap stories stand on hammocks
      for (const s of w.storySpots.filter((x) => x.islandId === id && x.kind === 'hammockNap'))
        expect(
          fx.some((f) => f.defId === 'hammock' && Math.hypot(f.x - s.pos.x, f.z - s.pos.z) < 0.01),
          `seed ${seed} nap`,
        ).toBe(true);
    }
    // TASK-497 (D-075): the Kite Hill takes ~800 u² of the plateau, the farm keeps a block on every
    // seed and the Hack Garden may take the hill foot (30 seeds: glyphs 22 → 21, groves 23 → 14)
    // TASK-511 (D-090): islands that step out from the grown HQ sample other zone noise (groves 14 → 13)
    expect(glyphs / SEEDS.length).toBeGreaterThanOrEqual(0.65);
    expect(groves / SEEDS.length).toBeGreaterThanOrEqual(0.4);
    // the 6 quad-end trees alone: 6 wreaths a seed
    expect(wreathTrees).toBeGreaterThanOrEqual(SEEDS.length * 6);
  });

  it('every dev pod wears a weather vane (devPod v2 / v3) and neighbouring pods differ in roof', () => {
    const roofs = LOT_ROOFS.devPod;
    for (const seed of SEEDS) {
      const w = world(seed);
      const id = codingOf(w).id;
      const pods = w.lots.filter((l) => l.islandId === id && l.defId === 'devPod');
      expect(pods.length, `seed ${seed}`).toBeGreaterThan(0);
      for (const p of pods) expect(CS.m22.vaneVariants, `seed ${seed}`).toContain(p.variant);
      for (let a = 0; a < pods.length; a++)
        for (let b = a + 1; b < pods.length; b++)
          if (Math.hypot(pods[a].x - pods[b].x, pods[a].z - pods[b].z) < 8)
            expect(roofs[pods[a].variant], `seed ${seed}`).not.toBe(roofs[pods[b].variant]);
    }
  });

  it('solar farm halved (R3-12): about two blocks a seed on average', () => {
    let blocks = 0;
    for (const seed of SEEDS) {
      const w = world(seed);
      const n = w.districts.filter(
        (d) => d.islandId === codingOf(w).id && d.kind === 'solar',
      ).length;
      blocks += n;
    }
    // the full farm was 3 - 6 blocks; halved they average about 2
    expect(blocks / SEEDS.length).toBeLessThanOrEqual(3);
  });
});
