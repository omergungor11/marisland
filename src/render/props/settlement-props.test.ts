import { describe, expect, it } from 'vitest';
import { generateWorld } from '../../world/index.ts';
import { PROP_DEFS } from '../../content/props.ts';
import { appendSettlementProps } from './settlement-props.ts';

describe('settlement props: flood units (sweep D1)', () => {
  const world = generateWorld(1001, { islands: 1 });
  const { props, groups, emitters } = appendSettlementProps(world);
  const defOf = (r: number): string => PROP_DEFS[props.defId[r]].id;

  it('one group per lot, building first, decor beside it', () => {
    expect(groups.lots).toHaveLength(world.lots.length);
    for (const [i, g] of groups.lots.entries()) {
      expect(g.length).toBeGreaterThanOrEqual(1);
      expect(defOf(g[0])).toBe(world.lots[i].defId);
      for (const r of g.slice(1)) expect(['laundryLine', 'barrel', 'crate']).toContain(defOf(r));
    }
  });

  it('one group per pier: its plank segments, cargo and root lantern', () => {
    expect(groups.docks).toHaveLength(world.docks.length);
    for (const [i, g] of groups.docks.entries()) {
      const planks = g.filter((r) => defOf(r) === 'dock');
      expect(planks).toHaveLength(world.docks[i].segments);
      for (const r of g) expect(['dock', 'barrel', 'crate', 'lanternPost']).toContain(defOf(r));
    }
  });

  it('every chimney names its lot', () => {
    for (const c of emitters.chimneys) {
      const lot = world.lots[c.lot];
      expect(['cottage', 'logCabin', 'towerHouse']).toContain(lot.defId);
      expect(Math.hypot(c.x - lot.x, c.z - lot.z)).toBeLessThan(2);
    }
  });
});
