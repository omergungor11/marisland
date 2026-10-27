import { describe, expect, it } from 'vitest';
import { createRng } from '../core/rng.ts';
import { ARCHETYPES, ISLET_LAYOUT, LAYOUT } from '../content/islands.ts';
import {
  adjacentPairs,
  centralIndex,
  contrasts,
  generateLayout,
  nearestGaps,
} from './gen/layout.ts';
import { THEME_IDS, type IslandData, type IsletData } from './types.ts';
import { THEME_BY_ARCHETYPE } from '../content/themes.ts';
import { perfLimit } from '../test/perf.ts';

// Tests measure wall time; generation itself never reads a clock.
// eslint-disable-next-line no-restricted-properties
const now = (): number => performance.now();

/** Same stream generateWorld uses for the layout stage. */
const layout = (seed: number): { windDir: number; islands: IslandData[]; islets: IsletData[] } =>
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
  it('roster (all 7 themes), spacing, extent, names and neighbour contrast hold for every seed', () => {
    const t0 = now();
    const counts: Record<number, number> = {};
    let lonely = 0;
    let maxNear = 0;
    let minGap = Infinity;
    let fallbacks = 0;
    for (let seed = 0; seed < 500; seed++) {
      const { islands } = layout(seed);
      const ctx = `seed ${seed}`;
      // roster: always 7, every department theme exactly once (D-024)
      expect(islands.length, ctx).toBe(7);
      counts[islands.length] = (counts[islands.length] ?? 0) + 1;
      expect([...islands.map((i) => i.theme)].sort(), ctx).toEqual([...THEME_IDS].sort());
      for (const i of islands) expect(i.theme, ctx).toBe(THEME_BY_ARCHETYPE[i.archetype]);
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
      // neighbour contrast: archipelago() returns a contrast-violating layout only as its
      // last-resort fallback; count those (must stay rare)
      if (
        adjacentPairs(discs).some(
          ([a, b]) => !contrasts(islands[a].archetype, islands[b].archetype),
        )
      )
        fallbacks++;
    }
    const ms = now() - t0;
    console.info(
      `layout 500 seeds: ${ms.toFixed(0)} ms; counts ${JSON.stringify(counts)}; ` +
        `Lonely Palm ${((lonely / 500) * 100).toFixed(1)} %; min gap ${minGap.toFixed(1)} u; ` +
        `max nearest gap ${maxNear.toFixed(1)} u; contrast fallbacks ${fallbacks}`,
    );
    expect(lonely).toBe(500);
    expect(fallbacks / 500).toBeLessThan(0.05);
    expect(ms).toBeLessThan(perfLimit(2000));
  });

  it('HQ is the island nearest the cluster centroid on every seed (D-058 W:K2)', () => {
    let hubMax = 0;
    let otherMin = Infinity;
    for (let seed = 0; seed < 500; seed++) {
      const { islands } = layout(seed);
      const discs = islands.map(disc);
      const hub = islands.findIndex((i) => i.theme === 'hq');
      expect(centralIndex(discs), `seed ${seed}`).toBe(hub);
      let cx = 0;
      let cz = 0;
      for (const d of discs) {
        cx += d.x / discs.length;
        cz += d.z / discs.length;
      }
      discs.forEach((d, k) => {
        const dist = Math.hypot(d.x - cx, d.z - cz);
        if (k === hub) hubMax = Math.max(hubMax, dist);
        else otherMin = Math.min(otherMin, dist);
      });
      // every other island is a ring neighbour of the hub: one channel of water between them
      for (let k = 0; k < discs.length; k++) {
        if (k === hub) continue;
        const gap =
          Math.hypot(discs[k].x - discs[hub].x, discs[k].z - discs[hub].z) -
          discs[k].r -
          discs[hub].r;
        expect(gap, `seed ${seed} ${islands[k].theme} hub gap`).toBeGreaterThanOrEqual(
          LAYOUT.minGap,
        );
        expect(gap, `seed ${seed} ${islands[k].theme} hub gap`).toBeLessThanOrEqual(
          LAYOUT.hub.gap[1] + 12,
        );
      }
    }
    console.info(
      `hub: max centroid distance ${hubMax.toFixed(1)} u; others ≥ ${otherMin.toFixed(1)} u`,
    );
    expect(hubMax).toBeLessThan(otherMin);
  });

  it('skerries + one Lonely Palm sandbar on every seed, in the channels, off every island (D-058 W:D2/K6)', () => {
    const counts: Record<number, number> = {};
    for (let seed = 0; seed < 500; seed++) {
      const { islands, islets } = layout(seed);
      const ctx = `seed ${seed}`;
      const sand = islets.filter((i) => i.kind === 'sandbar');
      const rock = islets.filter((i) => i.kind === 'skerry');
      expect(sand.length, ctx).toBe(1);
      expect(rock.length, ctx).toBeGreaterThanOrEqual(ISLET_LAYOUT.skerries[0]);
      expect(rock.length, ctx).toBeLessThanOrEqual(ISLET_LAYOUT.skerries[1]);
      counts[rock.length] = (counts[rock.length] ?? 0) + 1;
      islets.forEach((it, k) => {
        expect(it.id, ctx).toBe(islands.length + k);
        for (const isl of islands) {
          const gap = Math.hypot(isl.cx - it.cx, isl.cz - it.cz) - isl.reach - it.reach;
          expect(gap, `${ctx} islet ${k} vs ${isl.theme}`).toBeGreaterThanOrEqual(
            ISLET_LAYOUT.gap[0] - 1e-6,
          );
        }
        for (const o of islets)
          if (o !== it)
            expect(
              Math.hypot(o.cx - it.cx, o.cz - it.cz) - o.reach - it.reach,
              `${ctx} islets`,
            ).toBeGreaterThanOrEqual(ISLET_LAYOUT.isletGap - 1e-6);
        expect(Math.abs(it.cx) + it.reach, ctx).toBeLessThanOrEqual(LAYOUT.extent);
        expect(Math.abs(it.cz) + it.reach, ctx).toBeLessThanOrEqual(LAYOUT.extent);
      });
    }
    console.info(`skerries per seed: ${JSON.stringify(counts)}`);
  });

  it('is deterministic and independent of the island count option', () => {
    expect(layout(1234)).toEqual(layout(1234));
    const single = generateLayout(createRng(1234).fork('layout'), { islands: 1 });
    expect(single.windDir).toBe(layout(1234).windDir);
    expect(single.islands).toHaveLength(1);
  });
});

/** TASK-503 (D-083): Emberpeak's apron growth leaves the rest of the archipelago in place. */
describe('grown island push (TASK-503)', () => {
  it('every other island keeps its pre-growth centre on ≥ 95 % of 500 seeds; Emberpeak moves out', () => {
    const p = ARCHETYPES.emberpeak as { reachScale: number; layoutReachScale?: number };
    const grown = p.reachScale;
    const before: ReturnType<typeof layout>[] = [];
    try {
      p.reachScale = p.layoutReachScale ?? grown;
      for (let s = 0; s < 500; s++) before.push(layout(s));
    } finally {
      p.reachScale = grown;
    }
    let kept = 0;
    for (let s = 0; s < 500; s++) {
      const a = before[s].islands;
      const b = layout(s).islands;
      const same = a.every(
        (x, k) => x.archetype === 'emberpeak' || (x.cx === b[k].cx && x.cz === b[k].cz),
      );
      if (!same) continue;
      kept++;
      const e = b.findIndex((x) => x.archetype === 'emberpeak');
      const hq = b.findIndex((x) => x.archetype === 'hearthholm');
      const out = (l: IslandData[]) => Math.hypot(l[e].cx - l[hq].cx, l[e].cz - l[hq].cz);
      // a real channel to the hub, no wider than LAYOUT.growHubGap (or what it was)
      expect(out(b) - b[e].reach - b[hq].reach, `seed ${s}`).toBeGreaterThanOrEqual(LAYOUT.minGap);
      expect(out(b) - b[e].reach - b[hq].reach, `seed ${s} hub gap`).toBeLessThanOrEqual(
        Math.max(LAYOUT.growHubGap, out(a) - a[e].reach - a[hq].reach) + 1e-6,
      );
    }
    expect(kept / 500).toBeGreaterThanOrEqual(0.95);
  });
});
