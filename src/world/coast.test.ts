import { describe, expect, it } from 'vitest';
import { generateWorld } from './index.ts';
import { PROP_DEFS } from '../content/props.ts';
import { heightAt, sampleGrid } from './types.ts';
import { createOccupancy, lipWithin, scatterProps, segDist, slopeAt } from './gen/scatter.ts';
import { fitArch } from './gen/coast-scatter.ts';
import { COAST_FEATURES, COAST_RULES } from '../content/biome-scatter.ts';
import { KELP, ROCK_ARCH } from '../content/biomes.ts';

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

  it('arches stand clear of the wall with sea or sky through the opening (TASK-682)', () => {
    const arches = of('rockArch');
    expect(arches.length).toBeGreaterThanOrEqual(3);
    const A = COAST_FEATURES.arch;
    for (const i of arches) {
      // the whole siting test passes where the arch stands: legs on the ground (none inside a
      // wall, none in the air), the opening free of ground, both sides of it see sea / sky
      const fit = fitArch(world, p.x[i], p.z[i], p.rotY[i], p.variant[i], p.scale[i]);
      expect(fit, `arch ${i} at ${p.x[i].toFixed(1)}, ${p.z[i].toFixed(1)}`).not.toBeNull();
      expect(p.y[i]).toBeCloseTo(fit!.y, 4);
      expect(fit!.view).toBeGreaterThanOrEqual(A.minView);
      // and, read directly: each leg's ground no higher than legBury over the base
      const sx = Math.cos(p.rotY[i]);
      const sz = -Math.sin(p.rotY[i]);
      const leg = A.legAt[p.variant[i] % ROCK_ARCH.shapes] * p.scale[i];
      for (const side of [-1, 1])
        expect(heightAt(h, p.x[i] + sx * side * leg, p.z[i] + sz * side * leg)).toBeLessThanOrEqual(
          p.y[i] + A.legBury + 1e-4,
        );
      // near the shore: within the push of the waterline band
      expect(sdf(p.x[i], p.z[i])).toBeGreaterThan(-(A.sdf + A.pushMax + 1));
    }
    // Beacon Rock's arch is off the transmitter stack (it stood at −145.9, −26.3, against the wall)
    const mkt = world.islands.find((isl) => isl.theme === 'marketing')!;
    for (const i of arches)
      if (p.islandId[i] === mkt.id)
        expect(Math.hypot(p.x[i] + 145.9, p.z[i] + 26.3)).toBeGreaterThan(10);
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

  it('ledge shrubs hang just under the lip, back to the wall, off the falls (TASK-684)', () => {
    const rule = COAST_RULES.find((r) => r.def === 'ledgeShrub')!;
    const shrubs = of('ledgeShrub');
    expect(shrubs.length).toBeGreaterThan(25);
    for (const i of shrubs) {
      expect(slopeAt(h, p.x[i], p.z[i])).toBeGreaterThanOrEqual(0.9);
      const out = heightAt(h, p.x[i] + Math.sin(p.rotY[i]), p.z[i] + Math.cos(p.rotY[i]));
      expect(out).toBeLessThan(p.y[i]);
      // the wall top (flat, higher ground) within ~1 u up the slope: not mid-wall
      expect(rule.belowLip).toBeLessThanOrEqual(1);
      expect(lipWithin(h, p.x[i], p.z[i], p.rotY[i], rule.belowLip!)).toBe(true);
      // never on (or beside) a waterfall ribbon
      for (const f of world.waterfalls)
        expect(
          segDist(p.x[i], p.z[i], f.x, f.z, f.baseX, f.baseZ),
          `shrub ${p.x[i].toFixed(1)}, ${p.z[i].toFixed(1)}`,
        ).toBeGreaterThanOrEqual(f.width + 1);
    }
  });

  it('every waterfall foot gets 4–6 stones in the pool or on the flat foot (TASK-684)', () => {
    // the coast feature passes' own stones (the same scatter generateWorld ran)
    const res = scatterProps(world, createOccupancy(world.genAux.siteOccupancy.slice()));
    const q = res.props;
    const F = COAST_FEATURES.fall;
    // the passes run arches (+ their sea stacks), tide pools, then the fall feet: the stones after
    // the last tide-pool field are the fall stones (TASK-635: a Design arch's stack zone overlaps a
    // fall foot's ring, so a distance test to the arch misfiled one foot stone)
    let fallFrom = -1;
    for (let i = res.coastFeatures[0]; i < res.coastFeatures[1]; i++)
      if (PROP_DEFS[q.defId[i]].id === 'tidePoolField') fallFrom = i + 1;
    expect(fallFrom).toBeGreaterThan(0);
    const stones: number[] = [];
    for (let i = fallFrom; i < res.coastFeatures[1]; i++) {
      const id = PROP_DEFS[q.defId[i]].id;
      if (id === 'boulder' || id === 'basaltBoulder') stones.push(i);
    }
    expect(world.waterfalls.length).toBeGreaterThan(5);
    for (const f of world.waterfalls) {
      const reach = Math.hypot(f.width / 2 + F.ring[1], F.along[1]) + 0.01;
      const mine = stones.filter((i) => Math.hypot(q.x[i] - f.baseX, q.z[i] - f.baseZ) <= reach);
      expect(
        mine.length,
        `fall at ${f.baseX.toFixed(1)}, ${f.baseZ.toFixed(1)}`,
      ).toBeGreaterThanOrEqual(F.count[0]);
      expect(mine.length).toBeLessThanOrEqual(F.count[1]);
      const fx = Math.cos(f.rotY);
      const fz = Math.sin(f.rotY);
      for (const i of mine) {
        expect(slopeAt(h, q.x[i], q.z[i])).toBeLessThanOrEqual(F.slopeMax);
        expect(q.y[i]).toBeGreaterThanOrEqual(F.heights[0] - 1e-4);
        expect(q.y[i]).toBeLessThanOrEqual(F.heights[1] + 1e-4);
        // beside the plunge, never on the fall line
        const lat = Math.abs(-(q.x[i] - f.baseX) * fz + (q.z[i] - f.baseZ) * fx);
        expect(lat).toBeGreaterThanOrEqual(f.width / 2);
      }
    }
  });
});
