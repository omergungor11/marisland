import { describe, expect, it } from 'vitest';
import { adjacentPairs } from './gen/layout.ts';
import { coveness } from './gen/heightfield.ts';
import { ARCHETYPES, KITE_HILL } from '../content/islands.ts';
import {
  generateWorld,
  heightAt,
  openSeaAt,
  reefClearance,
  routeClearance,
  Zone,
  type IslandData,
  type WorldData,
} from './index.ts';
import { REEFS } from '../content/reefs.ts';
import { perfLimit } from '../test/perf.ts';

// Tests measure wall time; generation itself never reads a clock.
// eslint-disable-next-line no-restricted-properties
const now = (): number => performance.now();

const SEEDS = Array.from({ length: 30 }, (_, k) => 1000 + k * 263);

const cache = new Map<number, WorldData>();
const world = (seed: number): WorldData => {
  let w = cache.get(seed);
  if (!w) {
    w = generateWorld(seed, { now });
    cache.set(seed, w);
  }
  return w;
};

const coord = (w: WorldData, i: number): [number, number] => {
  const h = w.height;
  return [h.originX + (i % h.n) * h.cellSize, h.originZ + Math.floor(i / h.n) * h.cellSize];
};

const SAND: number[] = [Zone.sandWet, Zone.sandDry, Zone.sandBlack];
const GREEN: number[] = [Zone.grass, Zone.meadow, Zone.forest, Zone.field];

function zoneCounts(w: WorldData, isl: IslandData): Map<number, number> {
  const m = new Map<number, number>();
  for (let i = 0; i < w.zone.length; i++)
    if (w.islandMap[i] === isl.id + 1) m.set(w.zone[i], (m.get(w.zone[i]) ?? 0) + 1);
  return m;
}
const sum = (m: Map<number, number>, zs: number[]): number =>
  zs.reduce((a, z) => a + (m.get(z) ?? 0), 0);

/** Coast cells (land with a 4-neighbour in water) of one island. */
function coastCells(w: WorldData, isl: IslandData): number[] {
  const n = w.height.n;
  const out: number[] = [];
  for (let i = 0; i < w.islandMap.length; i++) {
    if (w.islandMap[i] !== isl.id + 1) continue;
    const x = i % n;
    if (x === 0 || x === n - 1 || i < n || i >= n * (n - 1)) continue;
    if (
      w.height.data[i - 1] <= 0 ||
      w.height.data[i + 1] <= 0 ||
      w.height.data[i - n] <= 0 ||
      w.height.data[i + n] <= 0
    )
      out.push(i);
  }
  return out;
}

/** 8-connected land components of one island. */
function components(w: WorldData, isl: IslandData): number {
  const n = w.height.n;
  const seen = new Uint8Array(w.islandMap.length);
  let count = 0;
  for (let i = 0; i < w.islandMap.length; i++) {
    if (seen[i] || w.islandMap[i] !== isl.id + 1) continue;
    count++;
    const stack = [i];
    seen[i] = 1;
    while (stack.length > 0) {
      const c = stack.pop() as number;
      const cx = c % n;
      for (let dz = -1; dz <= 1; dz++)
        for (let dx = -1; dx <= 1; dx++) {
          const x = cx + dx;
          const j = c + dz * n + dx;
          if (x < 0 || x >= n || j < 0 || j >= seen.length) continue;
          if (seen[j] || w.islandMap[j] !== isl.id + 1) continue;
          seen[j] = 1;
          stack.push(j);
        }
    }
  }
  return count;
}

describe('archipelago — 30-seed full generation', () => {
  it(
    'stage hashes are locked for seeds 1, 42, 1001 (archipelago mode)',
    { timeout: 30_000 },
    () => {
      const snap = Object.fromEntries([1, 42, 1001].map((s) => [s, world(s).hashes.world]));
      expect(snap).toMatchInlineSnapshot(`
        {
          "1": "6be24599fa4e775a",
          "1001": "184967a3cbda145e",
          "42": "829ec705fc07ce6b",
        }
      `);
    },
  );

  it('same seed twice → identical bytes', () => {
    const a = generateWorld(2024);
    const b = generateWorld(2024);
    expect(a.hashes).toEqual(b.hashes);
    expect(a.islands).toEqual(b.islands);
    expect(a.streams).toEqual(b.streams);
  });

  it('every island: beach + green, land inside its disc, no NaN', { timeout: 30_000 }, () => {
    for (const seed of SEEDS) {
      const w = world(seed);
      let nonFinite = 0;
      for (let i = 0; i < w.height.data.length; i++)
        if (!Number.isFinite(w.height.data[i]) || !Number.isFinite(w.shoreSdf[i])) nonFinite++;
      expect(nonFinite).toBe(0);
      for (const isl of w.islands) {
        const ctx = `seed ${seed} ${isl.archetypeName}`;
        const zc = zoneCounts(w, isl);
        const land = [...zc.values()].reduce((a, b) => a + b, 0);
        expect(land, ctx).toBeGreaterThan(0);
        expect(sum(zc, SAND), ctx).toBeGreaterThan(0);
        // Lonely Palm is the Research campus (TASK-402b): green lawns and a cove beach too
        expect(sum(zc, GREEN), ctx).toBeGreaterThan(0);
      }
      const reachFrac = w.islands.map(() => 0);
      for (let i = 0; i < w.islandMap.length; i++) {
        const id = w.islandMap[i];
        if (id === 0 || id > w.islands.length) continue;
        const isl = w.islands[id - 1];
        const [x, z] = coord(w, i);
        const f = Math.hypot(x - isl.cx, z - isl.cz) / isl.reach;
        if (f > reachFrac[id - 1]) reachFrac[id - 1] = f;
      }
      w.islands.forEach((isl, k) =>
        expect(reachFrac[k], `seed ${seed} ${isl.archetypeName} land outside reach`).toBeLessThan(
          1,
        ),
      );
    }
  });

  it('no land bridges and deep channels between neighbouring islands', () => {
    let worst = -Infinity;
    for (const seed of SEEDS) {
      const w = world(seed);
      const n = w.height.n;
      // no two islands' land touches
      let bridges = 0;
      for (let i = n; i < w.islandMap.length - n; i++) {
        const a = w.islandMap[i];
        if (a === 0) continue;
        const r = w.islandMap[i + 1];
        const d = w.islandMap[i + n];
        if ((r !== 0 && r !== a) || (d !== 0 && d !== a)) bridges++;
      }
      expect(bridges, `seed ${seed} land bridges`).toBe(0);
      const coasts = w.islands.map((isl) => coastCells(w, isl));
      const discs = w.islands.map((i) => ({ x: i.cx, z: i.cz, r: i.reach }));
      for (const [a, b] of adjacentPairs(discs)) {
        let best = Infinity;
        let pa = 0;
        let pb = 0;
        for (const i of coasts[a])
          for (const j of coasts[b]) {
            const [xa, za] = coord(w, i);
            const [xb, zb] = coord(w, j);
            const d = (xa - xb) ** 2 + (za - zb) ** 2;
            if (d < best) {
              best = d;
              pa = i;
              pb = j;
            }
          }
        const [xa, za] = coord(w, pa);
        const [xb, zb] = coord(w, pb);
        const len = Math.sqrt(best);
        let deepest = Infinity;
        for (let t = 4; t <= len - 4; t += 1) {
          const y = heightAt(w.height, xa + ((xb - xa) * t) / len, za + ((zb - za) * t) / len);
          expect(y, `seed ${seed} channel ${a}-${b} dry at ${t}`).toBeLessThan(0);
          deepest = Math.min(deepest, y);
        }
        worst = Math.max(worst, deepest);
        expect(deepest, `seed ${seed} channel ${a}-${b}`).toBeLessThanOrEqual(-2);
      }
    }
    console.info(`shallowest channel (deepest point) over 30 seeds: ${worst.toFixed(1)} u`);
  });

  it('archetype signatures', () => {
    const seen = new Set<string>();
    const noSolar: number[] = [];
    for (const seed of SEEDS) {
      const w = world(seed);
      for (const isl of w.islands) {
        const ctx = `seed ${seed} ${isl.archetypeName}`;
        const zc = zoneCounts(w, isl);
        const land = [...zc.values()].reduce((a, b) => a + b, 0);
        seen.add(isl.archetype);
        switch (isl.archetype) {
          case 'beaconrock': {
            expect(isl.peakY, ctx).toBeGreaterThan(22);
            expect(sum(zc, [Zone.cliff]), ctx).toBeGreaterThan(10);
            expect(
              Object.keys(isl.anchors).filter((k) => k.startsWith('stack')).length,
            ).toBeGreaterThanOrEqual(2);
            // windward face meets deep water: 5 u off the coast is ≤ −3 u on most
            // upwind rays (a sea stack may sit in the way of a few)
            let deep = 0;
            for (let k = -4; k <= 4; k++) {
              const a = w.windDir + Math.PI + (k * 10 * Math.PI) / 180;
              const ux = Math.cos(a);
              const uz = Math.sin(a);
              let d = 0;
              while (heightAt(w.height, isl.cx + ux * d, isl.cz + uz * d) > 0) d += 0.5;
              if (heightAt(w.height, isl.cx + ux * (d + 5), isl.cz + uz * (d + 5)) < -3) deep++;
            }
            expect(deep, ctx).toBeGreaterThanOrEqual(6);
            break;
          }
          case 'emberpeak':
            expect(isl.peakY, ctx).toBeGreaterThan(30);
            expect(sum(zc, [Zone.crater]), ctx).toBeGreaterThan(0);
            expect(sum(zc, [Zone.sandDry, Zone.sandWet]), ctx).toBe(0);
            expect(sum(zc, [Zone.sandBlack]), ctx).toBeGreaterThan(0);
            expect(isl.anchors.hotspring, ctx).toBeDefined();
            break;
          case 'palmlagoon': {
            // TASK-401 Test Factory: one solid plateau on the bluff (8.6–9.6 u), the yard /
            // tower / harbour anchors, no lagoon or wreck any more
            expect(isl.peakY, ctx).toBeGreaterThanOrEqual(8);
            expect(isl.peakY, ctx).toBeLessThanOrEqual(10);
            expect(components(w, isl), ctx).toBe(1);
            expect(isl.anchors.yard && isl.anchors.tower && isl.anchors.harbour, ctx).toBeTruthy();
            expect(isl.anchors.wreck, ctx).toBeUndefined();
            break;
          }
          case 'millbrook':
            // bluff plateau (TASK-390): 10–12 u peak; 6.5–8 u without the bluff; + the Kite Hill
            // knoll (TASK-497), added in u after the peak normalisation
            expect(isl.peakY, ctx).toBeLessThanOrEqual(
              (ARCHETYPES.millbrook.bluff?.on ? 12.5 : 8.5) + KITE_HILL.height,
            );
            // theme-first Coding (D-029): the patches are solar gravel (`field` zone) wherever the
            // tech park left clean ground: median ≈ 13 % over these 30 seeds. Patch cells are
            // world-aligned, so a layout shift reshuffles them; TASK-402b (seed 8101 moved 21.3 u)
            // left one park with no clean patch at all. TASK-497: with the Kite Hill the farm may be
            // a single small block (1.3-1.9 % of the land): a park without solar has no solar
            // district or no gravel under it
            if (
              !w.districts.some((d) => d.islandId === isl.id && d.kind === 'solar') ||
              sum(zc, [Zone.field]) === 0
            )
              noSolar.push(seed);
            expect(isl.anchors.knoll0 && isl.anchors.knoll1 && isl.anchors.pond, ctx).toBeTruthy();
            break;
          case 'mossgrove': {
            // forest + meadow are the walkable land (the bluff walls are cliff); the Glass
            // Conservatory campus opens the dome round its districts (TASK-467, meadow can win)
            const top = land - sum(zc, [Zone.cliff]);
            const water = new Set<number>([Zone.deep, Zone.mid, Zone.shallow, Zone.lagoon]);
            for (const [z, c] of zc)
              if (z !== Zone.forest && z !== Zone.cliff && z !== Zone.meadow && !water.has(z))
                expect(zc.get(Zone.forest) ?? 0, ctx).toBeGreaterThan(c);
            expect(sum(zc, [Zone.forest, Zone.meadow]), ctx).toBeGreaterThan(top * 0.5);
            expect(sum(zc, [Zone.forest]), ctx).toBeGreaterThan(top * 0.2);
            expect(isl.anchors.giantTree, ctx).toBeDefined();
            expect(
              w.streams?.some((s) => s.islandId === isl.id),
              ctx,
            ).toBe(true);
            break;
          }
          case 'lonelypalm': {
            // TASK-402b terraced campus hill: the summit on the bluff peak range, one body, the
            // campus anchors (summit, quad, garden, glasshouse, spur, headland, harbour)
            const b = ARCHETYPES.lonelypalm.bluff;
            expect(isl.peakY, ctx).toBeGreaterThanOrEqual((b?.peak[0] ?? 0) - 0.8);
            expect(isl.peakY, ctx).toBeLessThanOrEqual((b?.peak[1] ?? 0) + 0.5);
            expect(components(w, isl), ctx).toBe(1);
            for (const k of [
              'summit',
              'quad',
              'garden',
              'glasshouse',
              'spur',
              'headland',
              'harbour',
            ])
              expect(isl.anchors[k], `${ctx} ${k}`).toBeDefined();
            break;
          }
          case 'hearthholm':
            expect(isl.anchors.harbour, ctx).toBeDefined();
            break;
        }
      }
    }
    expect(seen.size).toBe(7);
    // TASK-471 re-roll: 3 of 30 (the old layout's seeds had 1; a shifted seed set had 2); TASK-497:
    // the Kite Hill fallback keeps one block on every seed (0 of 30)
    expect(noSolar.length, `Coding parks without solar: ${noSolar.join(', ')}`).toBeLessThanOrEqual(
      3,
    );
  });

  it('full world generation time (warm)', () => {
    generateWorld(7, { now });
    // Best of 2 per seed: the limit is about the code, not about vitest's worker contention.
    const ms = [1001, 2024, 3003, 4004, 5005].map((s) =>
      Math.min(generateWorld(s, { now }).timings.total, generateWorld(s, { now }).timings.total),
    );
    console.info(
      `archipelago gen ms (warm) 1001/2024/3003/4004/5005: ${ms.map((m) => m.toFixed(0)).join(' / ')}`,
    );
    const t = generateWorld(1001, { now }).timings;
    console.info(
      `stages seed 1001: ${JSON.stringify(Object.fromEntries(Object.entries(t).map(([k, v]) => [k, Math.round(v)])))}`,
    );
    for (const m of ms) expect(m).toBeLessThan(perfLimit(600));
  });
});

describe('reef shoals + shared-shelf sills (TASK-488, W:D1 / W:K3), 30 seeds', () => {
  const axisLen = (r: { x0: number; z0: number; x1: number; z1: number }): number =>
    Math.hypot(r.x1 - r.x0, r.z1 - r.z0);

  it(
    '3–6 shoals and ≤ 3 sills per seed; sills join neighbouring islands',
    { timeout: 60_000 },
    () => {
      let withSill = 0;
      for (const seed of SEEDS) {
        const w = world(seed);
        const shoals = w.reefs.filter((r) => r.kind === 'shoal');
        const sills = w.reefs.filter((r) => r.kind === 'sill');
        expect(shoals.length, `seed ${seed} shoals`).toBeGreaterThanOrEqual(REEFS.shoal.count[0]);
        expect(shoals.length, `seed ${seed} shoals`).toBeLessThanOrEqual(REEFS.shoal.count[1]);
        expect(sills.length, `seed ${seed} sills`).toBeLessThanOrEqual(REEFS.sill.maxCount);
        if (sills.length > 0) withSill++;
        for (const s of sills) {
          expect(s.islands).toHaveLength(2);
          expect(axisLen(s)).toBeLessThanOrEqual(REEFS.sill.maxLength);
        }
      }
      expect(withSill, 'seeds with at least one sill').toBeGreaterThanOrEqual(25);
    },
  );

  it('reefs stay under water: no reef cell dries, sill + shoal crests ≤ −2 u off the shelf', () => {
    for (const seed of SEEDS) {
      const w = world(seed);
      let wet = 0;
      let crest = -Infinity;
      for (let i = 0; i < w.reefWeight.length; i++) {
        if (w.reefWeight[i] === 0) continue;
        expect(w.height.data[i], `seed ${seed} reef cell ${i} above water`).toBeLessThan(0);
        // off the islands' own shelf (natural −0.1…−1.5 u out to ≈ 24 u on leeward coasts)
        if (w.shoreSdf[i] < -30) crest = Math.max(crest, w.height.data[i]);
        wet++;
      }
      expect(wet, `seed ${seed} reef cells`).toBeGreaterThan(0);
      expect(crest, `seed ${seed} shallowest reef cell off the shelf`).toBeLessThanOrEqual(-2);
      // the sill crest itself, sampled along the middle of its axis
      for (const s of w.reefs.filter((r) => r.kind === 'sill')) {
        const L = axisLen(s);
        for (let t = 0.3; t <= 0.7; t += 0.05) {
          const y = heightAt(w.height, s.x0 + (s.x1 - s.x0) * t, s.z0 + (s.z1 - s.z0) * t);
          expect(
            y,
            `seed ${seed} sill ${s.islands.join('-')} (${L.toFixed(0)} u) at ${t}`,
          ).toBeLessThanOrEqual(REEFS.sill.maxY + 1e-4);
        }
      }
    }
  });

  it('boat and ferry routes cross a reef only through a deep gap', { timeout: 60_000 }, () => {
    // the same seeds without reefs: the natural seabed (reefs run after the shelf pass and
    // fork their own rng, so nothing before them changes)
    const sh = REEFS.shoal as { count: readonly [number, number] };
    const si = REEFS.sill as { maxCount: number };
    const saved = { count: sh.count, maxCount: si.maxCount };
    const seeds = SEEDS.slice(0, 12);
    const natural = new Map<number, WorldData>();
    try {
      sh.count = [0, 0];
      si.maxCount = 0;
      for (const seed of seeds) natural.set(seed, generateWorld(seed));
    } finally {
      sh.count = saved.count;
      si.maxCount = saved.maxCount;
    }
    let crossings = 0;
    for (const seed of seeds) {
      const w = world(seed);
      const w0 = natural.get(seed) as WorldData;
      expect(w0.reefs).toHaveLength(0);
      for (const route of w.boatRoutes)
        for (const p of route.points) {
          const y = heightAt(w.height, p.x, p.z);
          const y0 = heightAt(w0.height, p.x, p.z);
          if (y <= y0 + 0.25) continue; // the reef did not lift the seabed here
          crossings++;
          expect(
            y,
            `seed ${seed} ${route.kind} over a raised reef at (${p.x.toFixed(0)}, ${p.z.toFixed(0)})`,
          ).toBeLessThanOrEqual(-(REEFS.gap.depth - 0.5));
        }
    }
    console.info(`route samples over raised seabed (all in deep gaps), 12 seeds: ${crossings}`);
    expect(crossings).toBeGreaterThan(0);
  });

  it('open-sea query (TASK-489 whale hook): off reefs, deep, ≥ 20 u from every route', () => {
    const w = world(SEEDS[0]);
    for (const r of w.reefs) {
      const cx = (r.x0 + r.x1) / 2;
      const cz = (r.z0 + r.z1) / 2;
      expect(reefClearance(w.reefs, cx, cz)).toBeLessThan(0);
      expect(openSeaAt(w, cx, cz)).toBe(false);
    }
    const p = w.boatRoutes[0].points[0];
    expect(routeClearance(w.boatRoutes, p.x, p.z)).toBeLessThan(1e-6);
    expect(openSeaAt(w, p.x, p.z)).toBe(false);
    // the open sea well outside the archipelago
    const far = Math.max(...w.islands.map((i) => Math.hypot(i.cx, i.cz) + i.reach)) + 40;
    expect(openSeaAt(w, far, 0) || openSeaAt(w, -far, 0) || openSeaAt(w, 0, far)).toBe(true);
  });
});

describe('bluff coasts (TASK-390), 30 seeds', () => {
  const BLUFFED = (Object.keys(ARCHETYPES) as (keyof typeof ARCHETYPES)[]).filter(
    (a) => ARCHETYPES[a].bluff?.on,
  );

  /** Coast samples (shore SDF ≤ 1 u) with ground ≥ 4 u within 2 samples and 5 u of the shore. */
  function bluffShare(w: WorldData, isl: IslandData): number {
    const n = w.height.n;
    let coast = 0;
    let bluff = 0;
    for (let i = 2 * n; i < n * n - 2 * n; i++) {
      if (w.islandMap[i] !== isl.id + 1 || w.shoreSdf[i] > 1.01) continue;
      coast++;
      let top = 0;
      for (let dz = -2; dz <= 2; dz++)
        for (let dx = -2; dx <= 2; dx++) {
          const j = i + dz * n + dx;
          if (w.shoreSdf[j] <= 5) top = Math.max(top, w.height.data[j]);
        }
      if (top >= 4) bluff++;
    }
    return bluff / coast;
  }

  it('hero and medium plateaus: ≥ 60 % bluff coast on average, faces ≤ ~65°, Zone.cliff', () => {
    expect(BLUFFED).toEqual([
      'hearthholm',
      'millbrook',
      'emberpeak',
      'palmlagoon',
      'mossgrove',
      'lonelypalm',
    ]);
    const share: Record<string, number[]> = {};
    for (const seed of SEEDS) {
      const w = world(seed);
      const n = w.height.n;
      for (const isl of w.islands) {
        if (!ARCHETYPES[isl.archetype].bluff?.on) continue;
        const ctx = `seed ${seed} ${isl.archetype}`;
        const s = bluffShare(w, isl);
        (share[isl.archetype] ??= []).push(s);
        expect(s, ctx).toBeGreaterThanOrEqual(0.5);
        // the face: grid slope of the first 6 u inland (central differences over 4 u)
        const slopes: number[] = [];
        let steep = 0;
        let cliff = 0;
        const d = w.height.data;
        for (let i = n; i < n * n - n; i++) {
          if (w.islandMap[i] !== isl.id + 1 || w.shoreSdf[i] > 6) continue;
          const g = Math.hypot(d[i + 1] - d[i - 1], d[i + n] - d[i - n]) / 4;
          slopes.push(g);
          const x = w.height.originX + (i % n) * w.height.cellSize;
          const z = w.height.originZ + Math.floor(i / n) * w.height.cellSize;
          if (g > 0.6 && d[i] > 1.5 && coveness(isl, w.windDir, x, z) < 0.5) {
            steep++;
            if (w.zone[i] === Zone.cliff) cliff++;
          }
        }
        slopes.sort((a, b) => a - b);
        const deg = (q: number): number =>
          Math.atan(slopes[Math.floor(slopes.length * q)]) * (180 / Math.PI);
        // the wall itself stays ≤ ~65°; the steepest 1 % are rim pads (lots, turbines) that the
        // planners flatten right up to the edge
        expect(deg(0.95), `${ctx} face p95 °`).toBeLessThanOrEqual(68);
        expect(deg(0.99), `${ctx} face p99 °`).toBeLessThanOrEqual(78);
        expect(cliff / steep, `${ctx} steep bluff faces that are Zone.cliff`).toBeGreaterThan(0.85);
        // docks stand on the cove's low ground, never on a wall top
        for (const dk of w.docks.filter((x) => x.islandId === isl.id))
          expect(heightAt(w.height, dk.x, dk.z), `${ctx} dock root`).toBeLessThanOrEqual(2.5);
      }
    }
    for (const [a, v] of Object.entries(share)) {
      const mean = v.reduce((x, y) => x + y, 0) / v.length;
      console.info(
        `bluff coast ${a}: mean ${(mean * 100).toFixed(0)} %, min ${(Math.min(...v) * 100).toFixed(0)} %`,
      );
      expect(mean, a).toBeGreaterThanOrEqual(0.6);
    }
  });

  it('peaks: Hearthholm 18–20 u, Millbrook 10–12 u, Mossgrove ≥ 21.5 u (was 19–21); QA plateau ≤ 10 u; Research summit ≥ 10 u', () => {
    for (const seed of SEEDS) {
      for (const isl of world(seed).islands) {
        const ctx = `seed ${seed} ${isl.archetype}`;
        if (isl.archetype === 'hearthholm') {
          expect(isl.peakY, ctx).toBeGreaterThanOrEqual(17);
          expect(isl.peakY, ctx).toBeLessThanOrEqual(20.5);
        }
        if (isl.archetype === 'millbrook') expect(isl.peakY, ctx).toBeGreaterThanOrEqual(9.5);
        if (isl.archetype === 'mossgrove') expect(isl.peakY, ctx).toBeGreaterThanOrEqual(21.5);
        if (isl.archetype === 'palmlagoon') expect(isl.peakY, ctx).toBeLessThanOrEqual(10);
        // TASK-402b: the Research summit plateau (bluff 4.2–4.8 u + the terraced hill)
        if (isl.archetype === 'lonelypalm') expect(isl.peakY, ctx).toBeGreaterThanOrEqual(10);
      }
    }
  });

  it('the content flag switches an island back: the TASK-390 bluffs off = the pre-M17b world', () => {
    // the Research campus hill (TASK-402b) keeps its bluff: it is the island's shape, not a coast option
    const saved = BLUFFED.filter((a) => a !== 'lonelypalm').map(
      (a) => ARCHETYPES[a].bluff as { on: boolean },
    );
    try {
      for (const b of saved) b.on = false;
      // hashes.world: the pre-TASK-390 world with the TASK-401 QA plateau profile, the
      // TASK-402b Research campus hill (seed 1001 layout moved 16.5 u), the TASK-403 Media Rock
      // and the TASK-405 Emberpeak shelves + Ember Works plan, the TASK-421 Coding Wind Gardens,
      // TASK-420 Harbour Guild, TASK-422 DevOps Ember Smiths and TASK-423 Marketing Carnival
      // placements, TASK-424 QA Inspectors, TASK-426 Research Star Academy and TASK-425 Design
      // Glass & Light, TASK-453c Marketing path-spares-slopes + Emberpeak steam-main slope cap,
      // TASK-461 snapped pipe legs + Star Academy fallbacks, re-pinned
      // TASK-471 (D-058): hub layout + islets, re-pinned; TASK-474 seamarks stage hash, re-pinned;
      // TASK-466 HQ Seven Gates + TASK-467 Design Glass Conservatory, re-pinned; TASK-480 QA quick
      // wins (slalom buoys, grandstand, palm rim rule; the rim walk needs a bluff), re-pinned;
      // TASK-482 DevOps quick wins (watch tower, pools, columns, switchback roads), re-pinned;
      // TASK-479 Coding quick wins, TASK-481 Marketing, TASK-483 Research quick wins, re-pinned;
      // TASK-484 Coding C18 rim boardwalk + benches, re-pinned; TASK-485 story-spot keep-out,
      // Beacon Rock stair flights, HQ streets to the waterline, bigger slalom buoys, re-pinned;
      // TASK-488 reef shoals + sills (routes detour, deep gaps, buoys off crossings), re-pinned;
      // TASK-490 skerry beacon towers (scatter), re-pinned; TASK-499 QA Proving Grounds (stunt yard + kit), re-pinned
      // TASK-497 Coding Kite Hill (profile lift, hill kites, tunnel pad, fallbacks), re-pinned
      expect(generateWorld(1001).hashes.world).toBe('26b393aeee24bed4');
      expect(generateWorld(1).hashes.world).toBe('f385459330421fc6');
    } finally {
      for (const b of saved) b.on = true;
    }
  });
});
