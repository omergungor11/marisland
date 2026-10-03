import { describe, expect, it } from 'vitest';
import { generateWorld } from './index.ts';
import { scatterProps, createOccupancy } from './gen/scatter.ts';
import { PROP_DEFS } from '../content/props.ts';
import { PropFlag } from './prop-store.ts';
import { heightAt, zoneAt, Zone } from './types.ts';
import { PLACEMENT_RULES } from '../content/placement.ts';

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
    expect(res.counts.roundTree).toBeGreaterThan(30);
    expect(res.counts.grassTuft).toBeGreaterThan(200);
    expect(res.counts.palm).toBeGreaterThan(0);
    console.info(`scatter ${res.props.count} props in ${ms.toFixed(0)} ms`, res.counts);
  });

  it('every prop sits on an accepted zone and above the seabed', () => {
    const p = res.props;
    for (let i = 0; i < p.count; i++) {
      const def = PROP_DEFS[p.defId[i]];
      const zone = zoneAt(world.height, world.zone, p.x[i], p.z[i]);
      const ok = PLACEMENT_RULES.some((r) => r.def === def.id && r.zones.includes(zone));
      expect(ok).toBe(true);
      expect(p.y[i]).toBeGreaterThan(-5);
      if (zone === Zone.lagoon) expect(p.y[i]).toBe(0);
      else {
        if (!(p.flags[i] & PropFlag.groundCover)) expect(p.y[i]).toBeGreaterThanOrEqual(-0.5);
        expect(Math.abs(p.y[i] - heightAt(world.height, p.x[i], p.z[i]))).toBeLessThan(0.2);
      }
    }
  });

  it('no overlaps among occupancy-marked props', () => {
    const p = res.props;
    const solid: number[] = [];
    for (let i = 0; i < p.count; i++) if (!(p.flags[i] & PropFlag.groundCover)) solid.push(i);
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

  it('is fast enough', () => {
    expect(ms).toBeLessThan(600);
  });
});
