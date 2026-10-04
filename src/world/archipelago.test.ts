import { describe, expect, it } from 'vitest';
import { adjacentPairs } from './gen/layout.ts';
import { generateWorld, heightAt, Zone, type IslandData, type WorldData } from './index.ts';
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
          "1": "d1121c38c86ab914",
          "1001": "280861f1f77c138f",
          "42": "67de7a8dc8fe8ce7",
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

  it(
    'every island: beach + green (Lonely Palm: sand only), land inside its disc, no NaN',
    { timeout: 30_000 },
    () => {
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
          if (isl.archetype === 'lonelypalm') expect(sum(zc, SAND), ctx).toBe(land);
          else expect(sum(zc, GREEN), ctx).toBeGreaterThan(0);
        }
        const reachFrac = w.islands.map(() => 0);
        for (let i = 0; i < w.islandMap.length; i++) {
          const id = w.islandMap[i];
          if (id === 0) continue;
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
    },
  );

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
            expect(isl.peakY, ctx).toBeLessThanOrEqual(4);
            // ring with 1–2 channel breaks → 1–2 land pieces (W6: ≤ 2 breaks)
            const pieces = components(w, isl);
            expect(pieces, ctx).toBeGreaterThanOrEqual(1);
            expect(pieces, ctx).toBeLessThanOrEqual(2);
            const wreck = isl.anchors.wreck;
            expect(wreck, ctx).toBeDefined();
            const y = heightAt(w.height, wreck.x, wreck.z);
            expect(y, ctx).toBeLessThanOrEqual(-1.8);
            expect(y, ctx).toBeGreaterThanOrEqual(-4.2);
            break;
          }
          case 'millbrook':
            expect(isl.peakY, ctx).toBeLessThanOrEqual(8.5);
            expect(sum(zc, [Zone.field]), ctx).toBeGreaterThan(land * 0.2);
            expect(isl.anchors.knoll0 && isl.anchors.knoll1 && isl.anchors.pond, ctx).toBeTruthy();
            break;
          case 'mossgrove':
            // forest is the dominant zone
            for (const [z, c] of zc)
              if (z !== Zone.forest) expect(zc.get(Zone.forest) ?? 0, ctx).toBeGreaterThan(c);
            expect(sum(zc, [Zone.forest]), ctx).toBeGreaterThan(land * 0.35);
            expect(isl.anchors.giantTree, ctx).toBeDefined();
            expect(
              w.streams?.some((s) => s.islandId === isl.id),
              ctx,
            ).toBe(true);
            break;
          case 'lonelypalm':
            expect(isl.peakY, ctx).toBeLessThanOrEqual(0.7);
            expect(isl.anchors.palm, ctx).toBeDefined();
            break;
          case 'hearthholm':
            expect(isl.anchors.harbour, ctx).toBeDefined();
            break;
        }
      }
    }
    expect(seen.size).toBe(7);
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
