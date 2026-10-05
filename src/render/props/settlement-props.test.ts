import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { generateWorld } from '../../world/index.ts';
import { PROP_DEFS, PROP_DEF_INDEX, type PropDef } from '../../content/props.ts';
import { THEMES } from '../../content/themes.ts';
import { EMITTERS, INTERIOR_OF } from '../../content/offices.ts';
import { PropFlag } from '../../world/prop-store.ts';
import { lotLocalToWorld, lotYaw } from '../../world/lot-frame.ts';
import { appendSettlementProps } from './settlement-props.ts';
import { withFakeDefs } from './fake-defs.test-util.ts';

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

describe('settlement props: office lots (TASK-304)', () => {
  const { grounded, clusterable } = PropFlag;
  // fake defs over existing geometry: the themed shells / interior of TASK-303 may not exist yet
  const FAKES: PropDef[] = [
    { id: 'dataCenter', geo: 'barn', tier: 1, variants: 2, footprint: 3, flags: grounded },
    {
      id: 'officeInterior',
      geo: 'bench',
      tier: 2,
      variants: 10,
      footprint: 1,
      flags: grounded | clusterable,
      interior: true,
    },
  ];
  let undo = (): void => {};
  beforeAll(() => (undo = withFakeDefs(FAKES)));
  afterAll(() => undo());

  const make = () => {
    const world = generateWorld(1001, { islands: 1 });
    const land = world.lots.filter((l) => l.kind !== 'hut');
    const office = world.lots.indexOf(land[0]);
    const unknown = world.lots.indexOf(land[1]);
    world.lots[office] = { ...world.lots[office], defId: 'dataCenter', role: 'office' };
    world.lots[unknown] = { ...world.lots[unknown], defId: 'rackShed', role: 'office' };
    return { world, office, unknown, ...appendSettlementProps(world) };
  };

  it('pushes the interior into the lot group, right after the shell, never clusterable', () => {
    const { world, office, props, groups } = make();
    const g = groups.lots[office];
    const lot = world.lots[office];
    expect(PROP_DEFS[props.defId[g[0]]].id).toBe('dataCenter');
    const r = g[1];
    expect(PROP_DEFS[props.defId[r]].id).toBe('officeInterior');
    expect(props.variant[r]).toBe(INTERIOR_OF.dataCenter.variant);
    expect(props.x[r]).toBeCloseTo(lot.x, 4);
    expect(props.z[r]).toBeCloseTo(lot.z, 4);
    expect(props.rotY[r]).toBeCloseTo(lotYaw(lot), 5);
    expect(props.y[r]).toBe(props.y[g[0]]);
    expect(props.flags[r] & PropFlag.clusterable).toBe(0);
    // theme decor (THEMES.hq.decor) beside it: 0–2 items, no laundry / barrels
    const decor = new Set(THEMES[world.islands[lot.islandId].theme].decor.map(([id]) => id));
    expect(g.length).toBeLessThanOrEqual(4);
    for (const d of g.slice(2)) expect(decor.has(PROP_DEFS[props.defId[d]].id)).toBe(true);
  });

  it('emitters come from EMITTERS with their preset, in the lot frame', () => {
    const { world, office, emitters } = make();
    const lot = world.lots[office];
    const mine = emitters.chimneys.filter((c) => c.lot === office);
    expect(mine).toHaveLength(EMITTERS.dataCenter.length);
    for (const [k, c] of mine.entries()) {
      const e = EMITTERS.dataCenter[k];
      const p = lotLocalToWorld(lot, e.x, e.z);
      expect(c.preset).toBe('vent');
      expect(c.x).toBeCloseTo(p.x, 5);
      expect(c.z).toBeCloseTo(p.z, 5);
    }
    for (const c of emitters.chimneys) if (c.lot !== office) expect(c.preset).toBe('chimney');
  });

  it('an unknown def pushes nothing: empty group, no smoke, no decor', () => {
    const { unknown, groups, emitters } = make();
    expect(groups.lots[unknown]).toEqual([]);
    expect(emitters.chimneys.some((c) => c.lot === unknown)).toBe(false);
  });

  it('landmarkVariant applies once the def has the variant, and keeps the decor stream', () => {
    const world = generateWorld(1001, { islands: 1 });
    const def = PROP_DEFS[PROP_DEF_INDEX.clocktower];
    const at = (p: ReturnType<typeof appendSettlementProps>['props']): number => {
      for (let i = world.props.count; i < p.count; i++)
        if (p.defId[i] === PROP_DEF_INDEX.clocktower) return i;
      return -1;
    };
    const before = appendSettlementProps(world).props;
    expect(at(before)).toBeGreaterThanOrEqual(0);
    expect(before.variant[at(before)]).toBeLessThan(def.variants); // override 2 ignored
    const saved = def.variants;
    (def as { variants: number }).variants = 3;
    try {
      const after = appendSettlementProps(world).props;
      expect(after.variant[at(after)]).toBe(THEMES.hq.landmarkVariant.clocktower);
      // same count and same decor positions as without the override
      expect(after.count).toBe(before.count);
      expect(Array.from(after.x.subarray(0, after.count))).toEqual(
        Array.from(before.x.subarray(0, before.count)),
      );
    } finally {
      (def as { variants: number }).variants = saved;
    }
  });
});
