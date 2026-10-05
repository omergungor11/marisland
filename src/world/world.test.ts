import { perfLimit } from '../test/perf.ts';
import { describe, expect, it } from 'vitest';
import { createRng } from '../core/rng.ts';
import { edt } from './gen/coast.ts';
import { leewardness } from './gen/heightfield.ts';
import {
  CHUNK_HAS_LAND,
  CHUNKS_PER_SIDE,
  generateWorld,
  heightAt,
  sampleGrid,
  SEABED_Y,
  Zone,
  type WorldData,
} from './index.ts';

// Tests measure wall time; generation itself never reads a clock.
// eslint-disable-next-line no-restricted-properties
const now = (): number => performance.now();

const cache = new Map<number, WorldData>();
const world = (seed: number): WorldData => {
  let w = cache.get(seed);
  if (!w) {
    w = generateWorld(seed, { islands: 1, now });
    cache.set(seed, w);
  }
  return w;
};

const coord = (w: WorldData, i: number): [number, number] => {
  const h = w.height;
  return [h.originX + (i % h.n) * h.cellSize, h.originZ + Math.floor(i / h.n) * h.cellSize];
};

describe('generateWorld — determinism', () => {
  it('stage hashes are locked for seeds 1, 42, 1001', { timeout: 30_000 }, () => {
    const snap = Object.fromEntries([1, 42, 1001].map((s) => [s, world(s).hashes]));
    expect(snap).toMatchInlineSnapshot(`
      {
        "1": {
          "chunks": "87a628cc5d3a2131",
          "fields": "fde62d37a0223454",
          "height": "4327426b623241b2",
          "islandMap": "a655e399542d6130",
          "layout": "18af5e7de418fea8",
          "props": "cd42e56a03d7ca6b",
          "routes": "7c3fb900a1631df7",
          "sdf": "f25821e68b9fc27b",
          "sites": "812ebc904e4eca5f",
          "world": "b23653150e750843",
          "zone": "e5746d5d8b488af9",
        },
        "1001": {
          "chunks": "2308622b7f481c60",
          "fields": "fde62d37a0223454",
          "height": "da4abb69dd1bf075",
          "islandMap": "2108575841e697b4",
          "layout": "5e6b01953012c5e9",
          "props": "6af8439b185650a3",
          "routes": "ad9143a5f0133361",
          "sdf": "cc52d61ebf22894e",
          "sites": "779f36a6b599491f",
          "world": "7e4412b9f2b233db",
          "zone": "f319752a32e23a3f",
        },
        "42": {
          "chunks": "4a2f6ca6294e6b92",
          "fields": "fde62d37a0223454",
          "height": "933e8049ceecd690",
          "islandMap": "2b8b157174488c2e",
          "layout": "674dffe16a0cab5b",
          "props": "1020fbc142065c8f",
          "routes": "96c6c80ad3e5b6b0",
          "sdf": "e18b47a56ddfcd47",
          "sites": "3df23ecf5c8ef04b",
          "world": "ba5c7f4091efd64a",
          "zone": "99f04de36bb5f66e",
        },
      }
    `);
  });

  it('same seed twice → identical hashes and bytes', () => {
    const a = generateWorld(42, { islands: 1 });
    const b = generateWorld(42, { islands: 1 });
    expect(a.hashes).toEqual(b.hashes);
    expect(new Uint32Array(a.height.data.buffer)).toEqual(new Uint32Array(b.height.data.buffer));
    expect(a.zone).toEqual(b.zone);
    expect(a.islands).toEqual(b.islands);
  });

  it('different seeds differ', () => {
    expect(world(1).hashes.world).not.toBe(world(42).hashes.world);
  });
});

describe('coast and shelf', () => {
  it('land mask and shore SDF agree (h > 0 ⇔ sdf > 0)', () => {
    for (const s of [1, 42, 1001]) {
      const w = world(s);
      for (let i = 0; i < w.shoreSdf.length; i++) {
        expect(w.height.data[i] > 0).toBe(w.shoreSdf[i] > 0);
      }
    }
  });

  it('EDT is exact against brute force', () => {
    const rng = createRng(5);
    const W = 23;
    const H = 17;
    const mask = new Uint8Array(W * H);
    for (let i = 0; i < mask.length; i++) mask[i] = rng.chance(0.08) ? 1 : 0;
    const d = edt(mask, W, H, 1);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        let best = Infinity;
        for (let j = 0; j < mask.length; j++)
          if (mask[j] === 1) best = Math.min(best, Math.hypot((j % W) - x, Math.floor(j / W) - y));
        expect(d[y * W + x]).toBeCloseTo(best, 5);
      }
  });

  it('shelf on ~100 % of the coast: 4–10 u outward stays in [−3.5, 0]', () => {
    for (const s of [1, 42, 1001]) {
      const w = world(s);
      const { n } = w.height;
      const sdf = w.shoreSdf;
      let edges = 0;
      let bad = 0;
      for (let iz = 1; iz < n - 1; iz++)
        for (let ix = 1; ix < n - 1; ix++) {
          const i = iz * n + ix;
          if (sdf[i] <= 0) continue;
          if (sdf[i - 1] > 0 && sdf[i + 1] > 0 && sdf[i - n] > 0 && sdf[i + n] > 0) continue;
          edges++;
          const gx = sdf[i + 1] - sdf[i - 1];
          const gz = sdf[i + n] - sdf[i - n];
          const len = Math.hypot(gx, gz) || 1;
          const [x, z] = coord(w, i);
          for (let d = 4; d <= 10; d++) {
            const y = heightAt(w.height, x - (gx / len) * d, z - (gz / len) * d);
            if (y > 0 || y < -3.5) {
              bad++;
              break;
            }
          }
        }
      const pct = (100 * bad) / edges;
      console.info(
        `seed ${s}: shelf violations ${bad}/${edges} edge samples = ${pct.toFixed(2)} %`,
      );
      expect(edges).toBeGreaterThan(100);
      expect(pct).toBeLessThanOrEqual(1);
    }
  });

  it('sea floor reaches ≤ −30 far from islands', () => {
    const w = world(42);
    let far = 0;
    for (let i = 0; i < w.shoreSdf.length; i++) {
      if (w.shoreSdf[i] < -100) {
        far++;
        expect(w.height.data[i]).toBeLessThanOrEqual(-30);
        expect(w.height.data[i]).toBeGreaterThanOrEqual(SEABED_Y);
      }
    }
    expect(far).toBeGreaterThan(1000);
  });

  it('turquoise ring is wider on the leeward side', () => {
    const w = world(1001);
    const isl = w.islands[0];
    let lee = 0;
    let wind = 0;
    for (let i = 0; i < w.zone.length; i++) {
      const z = w.zone[i];
      if (z !== Zone.lagoon && z !== Zone.shallow) continue;
      const [x, zz] = coord(w, i);
      const t = leewardness(isl, w.windDir, x, zz);
      if (t > 0.9) lee++;
      else if (t < 0.1) wind++;
    }
    expect(lee).toBeGreaterThan(wind);
  });
});

describe('islands and zones', () => {
  it('every island has sand and grass, and no land outside its bounds', () => {
    for (const s of [1, 42, 1001]) {
      const w = world(s);
      for (const isl of w.islands) {
        let sand = 0;
        let grass = 0;
        for (let i = 0; i < w.zone.length; i++) {
          if (w.islandMap[i] !== isl.id + 1) continue;
          const z = w.zone[i];
          if (z === Zone.sandWet || z === Zone.sandDry || z === Zone.sandBlack) sand++;
          if (z === Zone.grass) grass++;
        }
        expect(sand).toBeGreaterThan(0);
        expect(grass).toBeGreaterThan(0);
      }
      for (let i = 0; i < w.height.data.length; i++) {
        if (w.height.data[i] <= 0) {
          expect(w.islandMap[i]).toBe(0);
          continue;
        }
        const isl = w.islands[w.islandMap[i] - 1];
        const [x, z] = coord(w, i);
        expect(x >= isl.minX && x <= isl.maxX && z >= isl.minZ && z <= isl.maxZ).toBe(true);
      }
    }
  });

  it('chunk flags mark the island chunk as land', () => {
    const w = world(1);
    const isl = w.islands[0];
    const c = (v: number): number => Math.floor((v + 384) / 64);
    expect(w.chunkFlags.length).toBe(CHUNKS_PER_SIDE * CHUNKS_PER_SIDE);
    expect(w.chunkFlags[c(isl.peakZ) * CHUNKS_PER_SIDE + c(isl.peakX)] & CHUNK_HAS_LAND).toBe(1);
    expect(w.chunkFlags[0]).toBe(0); // far corner: deep open sea, no mesh
  });

  it('heightAt is bilinear over the grid', () => {
    const w = world(42);
    const h = w.height;
    const rng = createRng(3);
    for (let k = 0; k < 200; k++) {
      const ix = rng.int(100, 280);
      const iz = rng.int(100, 280);
      const i = iz * h.n + ix;
      const [x, z] = coord(w, i);
      expect(heightAt(h, x, z)).toBeCloseTo(h.data[i], 5);
      const mid = (h.data[i] + h.data[i + 1] + h.data[i + h.n] + h.data[i + h.n + 1]) / 4;
      expect(heightAt(h, x + 1, z + 1)).toBeCloseTo(mid, 5);
      expect(sampleGrid(h, h.data, x + 0.5, z, 0)).toBeCloseTo(
        h.data[i] * 0.75 + h.data[i + 1] * 0.25,
        5,
      );
    }
    expect(heightAt(h, 10_000, 0)).toBe(SEABED_Y);
  });

  it(
    'property: 50 seeds — no NaN, hearthholm peak 8–16 u, land area ±30 % of πr²',
    { timeout: 30_000 },
    () => {
      const ratios: number[] = [];
      for (let s = 0; s < 50; s++) {
        const w = generateWorld(s * 7919 + 13, { islands: 1 });
        let land = 0;
        let nonFinite = 0;
        for (let i = 0; i < w.height.data.length; i++) {
          if (!Number.isFinite(w.height.data[i]) || !Number.isFinite(w.shoreSdf[i])) nonFinite++;
          if (w.height.data[i] > 0) land++;
        }
        expect(nonFinite).toBe(0);
        const isl = w.islands[0];
        expect(isl.archetype).toBe('hearthholm');
        expect(isl.peakY).toBeGreaterThanOrEqual(8);
        expect(isl.peakY).toBeLessThanOrEqual(16);
        const ratio = (land * w.height.cellSize ** 2) / (Math.PI * isl.radius ** 2);
        ratios.push(ratio);
        expect(ratio).toBeGreaterThan(0.7);
        expect(ratio).toBeLessThan(1.3);
      }
      console.info(
        `land/πr² over 50 seeds: min ${Math.min(...ratios).toFixed(2)} max ${Math.max(...ratios).toFixed(2)}`,
      );
    },
  );

  it('one-island generation < 150 ms in Node', () => {
    generateWorld(77, { islands: 1, now }); // warm-up (JIT)
    const ms: number[] = [];
    // Best of 3 per seed: the limit is about the code, not about vitest's worker contention.
    for (const s of [1, 42, 1001]) {
      let best = Infinity;
      for (let i = 0; i < 3; i++)
        best = Math.min(best, generateWorld(s, { islands: 1, now }).timings.total);
      ms.push(best);
    }
    console.info(
      `gen ms (warm, best of 3) seeds 1/42/1001: ${ms.map((m) => m.toFixed(1)).join(' / ')}`,
    );
    console.info(`cold first-call ms seed 1: ${world(1).timings.total.toFixed(1)}`);
    for (const m of ms) expect(m).toBeLessThan(perfLimit(150));
  });
});
