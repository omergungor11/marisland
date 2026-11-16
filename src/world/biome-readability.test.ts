import { describe, expect, it } from 'vitest';
import { generateWorld } from './index.ts';
import { PROP_DEFS } from '../content/props.ts';
import { heightAt, sampleGrid, type ThemeId } from './types.ts';
import { createOccupancy } from './gen/scatter.ts';
import { BIOME_SCATTER } from '../content/biome-scatter.ts';

/** TASK-692 (D-191): the island signatures read at T1 on the full seed-1001 archipelago. */
describe('biome readability (seed 1001)', () => {
  const world = generateWorld(1001);
  const p = world.props;
  const idOf = (theme: ThemeId): number => world.islands.find((i) => i.theme === theme)!.id;
  const of = (theme: ThemeId, def: string): number[] => {
    const id = idOf(theme);
    const out: number[] = [];
    for (let i = 0; i < p.count; i++)
      if (p.islandId[i] === id && PROP_DEFS[p.defId[i]].id === def) out.push(i);
    return out;
  };

  it('Coding: round-tree groves and a shrub fringe in the open pockets, clear of every site', () => {
    const trees = of('coding', 'roundTree');
    const shrubs = of('coding', 'floraBush');
    // (before TASK-692: 0 scatter round trees, 1 shrub)
    expect(trees.length).toBeGreaterThanOrEqual(30);
    expect(shrubs.length).toBeGreaterThanOrEqual(15);
    // groves, not a sprinkle: most trees have two others within 6 u
    const grouped = trees.filter(
      (i) =>
        trees.filter((j) => j !== i && Math.hypot(p.x[i] - p.x[j], p.z[i] - p.z[j]) < 6).length >=
        2,
    ).length;
    expect(grouped / trees.length).toBeGreaterThan(0.7);
    const sites = createOccupancy(world.genAux.siteOccupancy);
    for (const i of trees) expect(sites.isFree(p.x[i], p.z[i], 2)).toBe(true);
  });

  it('QA: at least eight mint palms (3 before)', () => {
    const palms = of('qa', 'leanPalm');
    expect(palms.length).toBeGreaterThanOrEqual(8);
    for (const i of palms) expect(BIOME_SCATTER.qa.picks.palm).toContain(p.variant[i]);
  });

  it('Design: its pink-plum palms stand on the low shore (0 before)', () => {
    const palms = of('design', 'leanPalm');
    expect(palms.length).toBeGreaterThanOrEqual(4);
    for (const i of palms) {
      expect(BIOME_SCATTER.design.picks.palm).toContain(p.variant[i]);
      expect(heightAt(world.height, p.x[i], p.z[i])).toBeLessThanOrEqual(5);
      expect(sampleGrid(world.height, world.shoreSdf, p.x[i], p.z[i], -999)).toBeLessThanOrEqual(
        12,
      );
    }
  });
});
