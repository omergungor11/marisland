import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { generateWorld } from '../../world/index.ts';
import { PROP_DEFS, PROP_DEF_INDEX } from '../../content/props.ts';
import { THEMES } from '../../content/themes.ts';
import { EMITTERS, INTERIOR_OF, OFFICE_DEFS } from '../../content/offices.ts';
import { PropFlag, type PropStore } from '../../world/prop-store.ts';
import { heightAt } from '../../world/types.ts';
import { lotLocalToWorld, lotYaw } from '../../world/lot-frame.ts';
import { appendSettlementProps } from './settlement-props.ts';

describe('settlement props: flood units (sweep D1)', () => {
  const world = generateWorld(1001, { islands: 1 });
  const { props, groups, emitters } = appendSettlementProps(world);
  const defOf = (r: number): string => PROP_DEFS[props.defId[r]].id;

  it('one group per lot, building first, then its interior, decor beside it', () => {
    expect(groups.lots).toHaveLength(world.lots.length);
    const legacyDecor = ['laundryLine', 'barrel', 'crate'];
    for (const [i, g] of groups.lots.entries()) {
      const lot = world.lots[i];
      expect(g.length).toBeGreaterThanOrEqual(1);
      expect(defOf(g[0])).toBe(lot.defId);
      let rest = g.slice(1);
      if (INTERIOR_OF[lot.defId]) {
        expect(defOf(rest[0])).toBe(INTERIOR_OF[lot.defId].def);
        rest = rest.slice(1);
      }
      // office lots take their theme's decor, legacy houses laundry / barrel / crate
      const allowed = OFFICE_DEFS[lot.defId]
        ? THEMES[world.islands[lot.islandId].theme].decor.map(([id]) => id)
        : legacyDecor;
      for (const r of rest) expect(allowed).toContain(defOf(r));
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
  // `rackShed` has EMITTERS (vents) and theme decor; hiding its PropDef makes it a genuinely
  // unknown def (geometry not landed), so the unknown-def case covers group, smoke and decor
  let saved = -1;
  beforeAll(() => {
    saved = PROP_DEF_INDEX.rackShed;
    delete PROP_DEF_INDEX.rackShed;
  });
  afterAll(() => {
    PROP_DEF_INDEX.rackShed = saved;
  });

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
    // every other emitter carries its own lot's EMITTERS preset
    for (const c of emitters.chimneys) {
      const own = EMITTERS[world.lots[c.lot].defId];
      expect(own?.map((e) => e.preset)).toContain(c.preset);
    }
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

describe('settlement props: districts and pipes (TASK-373)', () => {
  /** A world with one solar district on solid ground and one pipe polyline. */
  const make = () => {
    const world = generateWorld(1001, { islands: 1 });
    const lot = world.lots.find((l) => l.kind !== 'hut')!;
    world.districts = [
      { islandId: lot.islandId, kind: 'solar', x: lot.x, z: lot.z, rotY: 0.4, w: 10, d: 12 },
    ];
    world.fences = [
      ...world.fences,
      {
        islandId: lot.islandId,
        kind: 'pipe',
        closed: false,
        points: [
          { x: lot.x, z: lot.z },
          { x: lot.x + 10, z: lot.z },
        ],
      },
    ];
    return world;
  };
  const ofDef = (props: PropStore, id: string): number[] => {
    const out: number[] = [];
    for (let i = 0; i < props.count; i++) if (PROP_DEFS[props.defId[i]]?.id === id) out.push(i);
    return out;
  };

  it('unknown defs push nothing and leave every earlier store index unchanged', () => {
    const saved = { solarRow: PROP_DEF_INDEX.solarRow, pipe: PROP_DEF_INDEX.pipe };
    delete PROP_DEF_INDEX.solarRow;
    delete PROP_DEF_INDEX.pipe;
    try {
      const plain = generateWorld(1001, { islands: 1 });
      const base = appendSettlementProps(plain).props;
      const { props } = appendSettlementProps(make());
      expect(props.count).toBe(base.count);
      expect(Array.from(props.defId.subarray(0, base.count))).toEqual(
        Array.from(base.defId.subarray(0, base.count)),
      );
    } finally {
      Object.assign(PROP_DEF_INDEX, saved);
    }
  });

  describe('with the defs present', () => {
    it('solar rows on a lattice inside the district, rows along d, appended last', () => {
      const world = make();
      const before = appendSettlementProps(generateWorld(1001, { islands: 1 })).props.count;
      const { props } = appendSettlementProps(world);
      const rows = ofDef(props, 'solarRow');
      // (10 − 3) / 3 + 1 = 3 rows × floor((12 − 3) / 5) = 1 segment, minus any over water
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.length).toBeLessThanOrEqual(3);
      const dist = world.districts[0];
      const [ax, az] = [Math.cos(dist.rotY), Math.sin(dist.rotY)];
      for (const i of rows) {
        expect(i).toBeGreaterThanOrEqual(before);
        const dx = props.x[i] - dist.x;
        const dz = props.z[i] - dist.z;
        const along = dx * ax + dz * az;
        const across = -dx * az + dz * ax;
        expect(Math.abs(along)).toBeLessThanOrEqual(dist.d / 2);
        expect(Math.abs(across)).toBeLessThanOrEqual(dist.w / 2);
        // lattice: across offsets are multiples of the row pitch (3 u) from the centre row
        expect(Math.abs(across / 3 - Math.round(across / 3))).toBeLessThan(1e-4);
        expect(props.rotY[i]).toBeCloseTo(Math.atan2(-az, ax), 5);
        expect(props.y[i]).toBeCloseTo(heightAt(world.height, props.x[i], props.z[i]), 4);
      }
    });

    it('pipe polylines draw pipe segments (2 u), fences stay fences', () => {
      const world = make();
      const { props } = appendSettlementProps(world);
      const pipes = ofDef(props, 'pipe');
      expect(pipes).toHaveLength(5);
      const lot = world.fences[world.fences.length - 1].points[0];
      expect(pipes.map((i) => props.x[i] - lot.x)).toEqual(
        [1, 3, 5, 7, 9].map((v) => expect.closeTo(v, 4)),
      );
      // straight variants only (variant 1 is an elbow)
      expect(pipes.map((i) => props.variant[i])).toEqual([0, 2, 0, 2, 0]);
      const fenceRuns = world.fences.filter((f) => f.kind !== 'pipe').length;
      if (fenceRuns) expect(ofDef(props, 'fence').length).toBeGreaterThan(0);
    });
  });
});
