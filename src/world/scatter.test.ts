import { describe, expect, it } from 'vitest';
import { generateWorld } from './index.ts';
import { scatterProps, createOccupancy } from './gen/scatter.ts';
import { PROP_DEFS, PROP_DEF_INDEX } from '../content/props.ts';
import { PropFlag } from './prop-store.ts';
import { heightAt, zoneAt, Zone } from './types.ts';
import { PLACEMENT_RULES } from '../content/placement.ts';
import { perfLimit } from '../test/perf.ts';
import { THEMES, type ThemeDef } from '../content/themes/index.ts';
import { BIOME_RULES, BIOME_SCATTER, HARBOUR_DRESSING } from '../content/biome-scatter.ts';
import { HARBOUR_BOAT, splitBoatVariant } from '../content/biomes.ts';
import { DOCK } from '../content/settlements.ts';

describe('prop scatter', () => {
  const world = generateWorld(1001, { islands: 1 });
  // eslint-disable-next-line no-restricted-properties -- test timing only
  const t0 = performance.now();
  const res = scatterProps(world);
  // eslint-disable-next-line no-restricted-properties -- test timing only
  const ms = performance.now() - t0;

  it('is deterministic', () => {
    const b = scatterProps(world, createOccupancy());
    expect(b.props.count).toBe(res.props.count);
    expect(Array.from(b.props.x.slice(0, 50))).toEqual(Array.from(res.props.x.slice(0, 50)));
  });

  it('places trees and ground cover on Hearthholm', () => {
    // TASK-600: Hearthholm's scatter round trees are its orchard canopyTrees
    expect(res.counts.canopyTree).toBeGreaterThan(30);
    expect(res.counts.grassTuft).toBeGreaterThan(200);
    expect(res.counts.palm).toBeGreaterThan(0);
    console.info(`scatter ${res.props.count} props in ${ms.toFixed(0)} ms`, res.counts);
  });

  it('every prop sits on an accepted zone and above the seabed', () => {
    const p = res.props;
    for (let i = 0; i < p.count; i++) {
      const def = PROP_DEFS[p.defId[i]];
      // the harbour pass (boats on the water, deck dressing) is checked below
      if (def.id === 'harbourBoat' || def.id === 'dockDressing') continue;
      const zone = zoneAt(world.height, world.zone, p.x[i], p.z[i]);
      // the island's rule list as scatterProps builds it: global minus scatterOff, + theme rules
      const isl = world.islands.find((x) => x.id === p.islandId[i]);
      const theme = THEMES[isl?.theme ?? 'hq'];
      const rules = PLACEMENT_RULES.filter(
        (r) =>
          !theme.scatterOff.includes(r.def) &&
          (!r.archetypes || (isl !== undefined && r.archetypes.includes(isl.archetype))),
      )
        .concat(theme.scatter)
        .concat(BIOME_RULES.filter((r) => isl && r.themes.includes(isl.theme)));
      // TASK-600 swaps: an old def's rule places the v2 def; lot edges sit on the same lawn zones
      const swap = BIOME_SCATTER[isl?.theme ?? 'hq'].swap;
      const ok =
        rules.some(
          (r) => (r.def === def.id || swap[r.def]?.def === def.id) && r.zones.includes(zone),
        ) ||
        ((def.id === 'floraBush' || def.id === 'flowerBed') &&
          [Zone.grass, Zone.meadow, Zone.forest, Zone.sandDry, Zone.rock].includes(zone as never));
      expect(ok, `${def.id} on zone ${zone}`).toBe(true);
      expect(p.y[i]).toBeGreaterThan(-5);
      if (zone === Zone.lagoon) expect(p.y[i]).toBe(0);
      else {
        if (!(p.flags[i] & PropFlag.groundCover)) expect(p.y[i]).toBeGreaterThanOrEqual(-0.5);
        expect(Math.abs(p.y[i] - heightAt(world.height, p.x[i], p.z[i]))).toBeLessThan(0.2);
      }
    }
  });

  it('TASK-600 harbour: boats float on deep enough water beside a pier, dressing on its deck', () => {
    const p = res.props;
    let boats = 0;
    for (let i = 0; i < p.count; i++) {
      const id = PROP_DEFS[p.defId[i]].id;
      if (id !== 'harbourBoat' && id !== 'dockDressing') continue;
      // distance from the nearest pier axis (segment) and along it
      let best = Infinity;
      for (const d of world.docks) {
        const fx = Math.cos(d.rotY);
        const fz = Math.sin(d.rotY);
        const t = (p.x[i] - d.x) * fx + (p.z[i] - d.z) * fz;
        const lat = Math.abs(-(p.x[i] - d.x) * fz + (p.z[i] - d.z) * fx);
        if (t >= 0 && t <= d.segments * DOCK.segment + 1) best = Math.min(best, lat);
      }
      if (id === 'harbourBoat') {
        boats++;
        const { hull } = splitBoatVariant(p.variant[i]);
        expect(p.y[i]).toBe(0);
        expect(heightAt(world.height, p.x[i], p.z[i])).toBeLessThanOrEqual(
          -(HARBOUR_BOAT.draft[hull] + HARBOUR_DRESSING.keel),
        );
        expect(best).toBeCloseTo(DOCK.mooringSide, 3);
      } else {
        expect(p.y[i]).toBeCloseTo(HARBOUR_DRESSING.deckY, 5);
        expect(best).toBeLessThanOrEqual(HARBOUR_DRESSING.ladderSide + 1e-3);
      }
    }
    expect(boats).toBeGreaterThan(0);
  });

  it('no overlaps among occupancy-marked props', () => {
    const p = res.props;
    const solid: number[] = [];
    // (the harbour pass is checked above: a dock ladder hangs beside its boat on purpose)
    const harbour = [PROP_DEF_INDEX.harbourBoat, PROP_DEF_INDEX.dockDressing];
    for (let i = 0; i < p.count; i++)
      if (!(p.flags[i] & PropFlag.groundCover) && !harbour.includes(p.defId[i])) solid.push(i);
    let overlaps = 0;
    for (let a = 0; a < solid.length; a++) {
      const i = solid[a];
      const ri = PROP_DEFS[p.defId[i]].footprint * p.scale[i];
      for (let b = a + 1; b < solid.length; b++) {
        const j = solid[b];
        const rj = PROP_DEFS[p.defId[j]].footprint * p.scale[j];
        const d = Math.hypot(p.x[i] - p.x[j], p.z[i] - p.z[j]);
        if (d < (ri + rj) * 0.6) overlaps++;
      }
    }
    expect(overlaps).toBe(0);
  });

  it('is fast enough', { tags: ['perf'] }, () => {
    expect(ms).toBeLessThan(perfLimit(600));
  });

  it('honours the theme scatterOff list and appends the theme scatter rules (M14b)', () => {
    const theme = THEMES[world.islands[0].theme] as {
      -readonly [K in keyof ThemeDef]: ThemeDef[K];
    };
    const saved = { off: theme.scatterOff, own: theme.scatter };
    const palm = PLACEMENT_RULES.find((r) => r.def === 'palm');
    expect(palm).toBeDefined();
    try {
      theme.scatterOff = ['palm'];
      expect(scatterProps(world, createOccupancy()).counts.palm ?? 0).toBe(0);
      // a theme rule ignores `archetypes` (the theme is implied)
      theme.scatter = [{ ...palm!, archetypes: ['millbrook'] }];
      expect(scatterProps(world, createOccupancy()).counts.palm).toBeGreaterThan(0);
    } finally {
      theme.scatterOff = saved.off;
      theme.scatter = saved.own;
    }
  });
});
