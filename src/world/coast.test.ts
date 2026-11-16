import { describe, expect, it } from 'vitest';
import { generateWorld } from './index.ts';
import { PROP_DEFS } from '../content/props.ts';
import { heightAt, sampleGrid } from './types.ts';
import { slopeAt } from './gen/scatter.ts';
import { COAST_FEATURES } from '../content/biome-scatter.ts';
import { KELP } from '../content/biomes.ts';

/** TASK-603 (D-184): coast micro-landscapes on the full seed-1001 archipelago. */
describe('coast micro-landscapes', () => {
  const world = generateWorld(1001);
  const h = world.height;
  const p = world.props;
  const of = (id: string): number[] => {
    const out: number[] = [];
    for (let i = 0; i < p.count; i++) if (PROP_DEFS[p.defId[i]].id === id) out.push(i);
    return out;
  };
  const sdf = (x: number, z: number): number => sampleGrid(h, world.shoreSdf, x, z, -999);

  it('arches stand on the waterline with the opening facing the sea', () => {
    const arches = of('rockArch');
    expect(arches.length).toBeGreaterThanOrEqual(2);
    for (const i of arches) {
      expect(Math.abs(sdf(p.x[i], p.z[i]))).toBeLessThanOrEqual(COAST_FEATURES.arch.sdf + 1e-3);
      expect(p.y[i]).toBeCloseTo(heightAt(h, p.x[i], p.z[i]), 4);
      // local +z (sin yaw, cos yaw) points seaward: the shore SDF falls that way
      const ahead = sdf(p.x[i] + Math.sin(p.rotY[i]) * 3, p.z[i] + Math.cos(p.rotY[i]) * 3);
      expect(ahead).toBeLessThan(sdf(p.x[i], p.z[i]));
    }
  });

  it('tide-pool fields sit on the wet shore above the water', () => {
    const pools = of('tidePoolField');
    expect(pools.length).toBeGreaterThanOrEqual(2);
    for (const i of pools) {
      expect(p.y[i]).toBeGreaterThanOrEqual(COAST_FEATURES.tide.heights[0]);
      expect(sdf(p.x[i], p.z[i])).toBeGreaterThan(0);
    }
  });

  it('kelp blade tips stay under the surface (D-179 Colour Wharf)', () => {
    const kelp = of('kelp');
    expect(kelp.length).toBeGreaterThan(20);
    for (const i of kelp)
      expect(p.y[i] + KELP.heights[p.variant[i]] * p.scale[i]).toBeLessThanOrEqual(-0.4 + 1e-4);
  });

  it('ledge shrubs hang on wall faces with their back to the wall', () => {
    const shrubs = of('ledgeShrub');
    expect(shrubs.length).toBeGreaterThan(25);
    for (const i of shrubs) {
      expect(slopeAt(h, p.x[i], p.z[i])).toBeGreaterThanOrEqual(0.9);
      const out = heightAt(h, p.x[i] + Math.sin(p.rotY[i]), p.z[i] + Math.cos(p.rotY[i]));
      expect(out).toBeLessThan(p.y[i]);
    }
  });

  it('most waterfall feet get a rock rim', () => {
    const stones = world.waterfalls.filter((f) => {
      for (let i = 0; i < p.count; i++) {
        const id = PROP_DEFS[p.defId[i]].id;
        if (id !== 'boulder' && id !== 'basaltBoulder') continue;
        if (Math.hypot(p.x[i] - f.baseX, p.z[i] - f.baseZ) < f.width / 2 + 4) return true;
      }
      return false;
    });
    expect(stones.length).toBeGreaterThanOrEqual(Math.ceil(world.waterfalls.length * 0.6));
  });
});
