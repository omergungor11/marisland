import { describe, expect, it } from 'vitest';
import { createRng } from '../core/rng.ts';
import { ARCHETYPES, LAYOUT } from '../content/islands.ts';
import { adjacentPairs, contrasts, generateLayout, nearestGaps } from './gen/layout.ts';
import type { IslandData } from './types.ts';
import { perfLimit } from '../test/perf.ts';

// Tests measure wall time; generation itself never reads a clock.
// eslint-disable-next-line no-restricted-properties
const now = (): number => performance.now();

/** Same stream generateWorld uses for the layout stage. */
const layout = (seed: number): { windDir: number; islands: IslandData[] } =>
  generateLayout(createRng(seed).fork('layout'), { islands: 'auto' });

const disc = (i: IslandData): { x: number; z: number; r: number } => ({
  x: i.cx,
  z: i.cz,
  r: i.reach,
});

/** Size class from the rolled diameter (bible ranges; Palmlagoon demotes to < 77). */
function sizeClass(i: IslandData): 'hero' | 'medium' | 'small' | 'tiny' {
  if (i.archetype === 'hearthholm') return 'hero';
  const d = i.radius * 2;
  return d < 20 ? 'tiny' : d < 77 ? 'small' : 'medium';
}

describe('archipelago layout — 500-seed properties', () => {
  it('roster, spacing, extent, names and neighbour contrast hold for every seed', () => {
    const t0 = now();
    const counts: Record<number, number> = {};
    let lonely = 0;
    let maxNear = 0;
    let minGap = Infinity;
    for (let seed = 0; seed < 500; seed++) {
      const { islands } = layout(seed);
      const ctx = `seed ${seed}`;
      // roster
      expect(islands.length, ctx).toBeGreaterThanOrEqual(5);
      expect(islands.length, ctx).toBeLessThanOrEqual(7);
      counts[islands.length] = (counts[islands.length] ?? 0) + 1;
      const arch = islands.map((i) => i.archetype);
      expect(new Set(arch).size, ctx).toBe(arch.length);
      expect(arch, ctx).toContain('hearthholm');
      expect(
        arch.some((a) => a === 'beaconrock' || a === 'emberpeak'),
        ctx,
      ).toBe(true);
      if (arch.includes('lonelypalm')) lonely++;
      // size hierarchy: hero largest, 2–3 mediums, ≥ 1 small/tiny
      const hero = islands.find((i) => i.archetype === 'hearthholm') as IslandData;
      for (const i of islands) if (i !== hero) expect(i.radius, ctx).toBeLessThan(hero.radius);
      const cls = islands.map(sizeClass);
      const mediums = cls.filter((c) => c === 'medium').length;
      expect(mediums, ctx).toBeGreaterThanOrEqual(2);
      expect(mediums, ctx).toBeLessThanOrEqual(3);
      expect(
        cls.some((c) => c === 'small' || c === 'tiny'),
        ctx,
      ).toBe(true);
      for (const i of islands) {
        const [lo, hi] = ARCHETYPES[i.archetype].diameter;
        const lo2 = ARCHETYPES[i.archetype].demotedDiameter?.[0] ?? lo;
        expect(i.radius * 2, ctx).toBeGreaterThanOrEqual(Math.min(lo, lo2) - 1e-9);
        expect(i.radius * 2, ctx).toBeLessThanOrEqual(hi + 1e-9);
      }
      // spacing: bounding discs never overlap (gap ≥ 40 u), one connected cluster
      const discs = islands.map(disc);
      for (let a = 0; a < discs.length; a++)
        for (let b = a + 1; b < discs.length; b++) {
          const g = Math.hypot(discs[a].x - discs[b].x, discs[a].z - discs[b].z);
          const gap = g - discs[a].r - discs[b].r;
          minGap = Math.min(minGap, gap);
          expect(gap, ctx).toBeGreaterThanOrEqual(LAYOUT.minGap);
        }
      const near = nearestGaps(discs);
      maxNear = Math.max(maxNear, ...near);
      for (const g of near) expect(g, ctx).toBeLessThanOrEqual(LAYOUT.maxNearestGap);
      // extent: every bounding disc inside ±300 u
      for (const d of discs) {
        expect(Math.abs(d.x) + d.r, ctx).toBeLessThanOrEqual(LAYOUT.extent);
        expect(Math.abs(d.z) + d.r, ctx).toBeLessThanOrEqual(LAYOUT.extent);
      }
      // names: unique, Hearthholm keeps its own, others are 2–3 syllable words
      const names = islands.map((i) => i.name);
      expect(new Set(names.map((n) => n.toLowerCase())).size, ctx).toBe(names.length);
      for (const i of islands) {
        expect(i.archetypeName).toBe(ARCHETYPES[i.archetype].displayName);
        if (i.archetype === 'hearthholm') expect(i.name).toBe('Hearthholm');
        else {
          expect(i.name, ctx).toMatch(/^[A-Z][a-z]{3,10}$/);
          expect(i.name).not.toBe(i.archetypeName);
        }
      }
      // neighbour contrast
      for (const [a, b] of adjacentPairs(discs))
        expect(contrasts(islands[a].archetype, islands[b].archetype), ctx).toBe(true);
    }
    const ms = now() - t0;
    console.info(
      `layout 500 seeds: ${ms.toFixed(0)} ms; counts ${JSON.stringify(counts)}; ` +
        `Lonely Palm ${((lonely / 500) * 100).toFixed(1)} %; min gap ${minGap.toFixed(1)} u; ` +
        `max nearest gap ${maxNear.toFixed(1)} u`,
    );
    expect(lonely / 500).toBeGreaterThanOrEqual(0.7);
    expect(ms).toBeLessThan(perfLimit(2000));
  });

  it('is deterministic and independent of the island count option', () => {
    expect(layout(1234)).toEqual(layout(1234));
    const single = generateLayout(createRng(1234).fork('layout'), { islands: 1 });
    expect(single.windDir).toBe(layout(1234).windDir);
    expect(single.islands).toHaveLength(1);
  });
});
