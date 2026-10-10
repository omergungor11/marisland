import { describe, expect, it } from 'vitest';
import { BRIDGES } from '../content/bridges.ts';
import { generateWorld, heightAt, type BridgeData, type WorldData } from './index.ts';
import { GRID_ORIGIN } from './gen/grid.ts';

const SEEDS = [1001, 42, 1, 3, 4004, 6006, 7, 99];
const worlds = new Map<number, WorldData>();
const world = (seed: number): WorldData => {
  let w = worlds.get(seed);
  if (!w) worlds.set(seed, (w = generateWorld(seed)));
  return w;
};

const islandAt = (w: WorldData, x: number, z: number): number => {
  const n = w.height.n;
  const ix = Math.round((x - GRID_ORIGIN) / w.height.cellSize);
  const iz = Math.round((z - GRID_ORIGIN) / w.height.cellSize);
  return w.islandMap[iz * n + ix];
};

describe('bridges (pair picker)', () => {
  it('is deterministic per seed and differs across seeds', () => {
    const a = JSON.stringify(generateWorld(1001).bridges);
    expect(JSON.stringify(generateWorld(1001).bridges)).toBe(a);
    expect(a).not.toBe(JSON.stringify(world(42).bridges));
  });

  it('builds 1–3 bridges per world on every surveyed seed', () => {
    for (const s of SEEDS) {
      const n = world(s).bridges.length;
      expect(n, `seed ${s}`).toBeGreaterThanOrEqual(1);
      expect(n, `seed ${s}`).toBeLessThanOrEqual(BRIDGES.count[1]);
    }
  });

  it('joins two different islands within the gap limit, ends on bluff-top land', () => {
    for (const s of SEEDS) {
      const w = world(s);
      for (const b of w.bridges) {
        expect(b.islandA).not.toBe(b.islandB);
        expect(islandAt(w, b.ax, b.az)).toBe(b.islandA + 1);
        expect(islandAt(w, b.bx, b.bz)).toBe(b.islandB + 1);
        const ga = heightAt(w.height, b.ax, b.az);
        const gb = heightAt(w.height, b.bx, b.bz);
        expect(ga).toBeGreaterThanOrEqual(BRIDGES.topY);
        expect(gb).toBeGreaterThanOrEqual(BRIDGES.topY);
        expect(b.ay).toBeCloseTo(ga + BRIDGES.deckLift, 5);
        expect(b.by).toBeCloseTo(gb + BRIDGES.deckLift, 5);
        expect(Math.abs(ga - gb)).toBeLessThanOrEqual(BRIDGES.maxEndDiff);
        expect(b.bays).toBe(Math.max(2, Math.round(b.length / BRIDGES.model.bay)));
        // water gap between the facing rims
        let first = -1;
        let last = -1;
        const n = Math.ceil(b.length);
        for (let k = 0; k <= n; k++) {
          const f = k / n;
          const id = islandAt(w, b.ax + (b.bx - b.ax) * f, b.az + (b.bz - b.az) * f);
          if (id === b.islandA + 1) first = k;
          if (id === b.islandB + 1 && last < 0) last = k;
        }
        const gap = ((last - first) * b.length) / n;
        expect(gap, `seed ${s}`).toBeGreaterThanOrEqual(BRIDGES.gap.min - 2);
        expect(gap, `seed ${s}`).toBeLessThanOrEqual(BRIDGES.gap.max + 2);
      }
    }
  });

  it('never crosses another island, nor another bridge', () => {
    for (const s of SEEDS) {
      const w = world(s);
      for (const b of w.bridges) {
        const n = Math.ceil(b.length * 2);
        for (let k = 0; k <= n; k++) {
          const f = k / n;
          const id = islandAt(w, b.ax + (b.bx - b.ax) * f, b.az + (b.bz - b.az) * f);
          expect([0, b.islandA + 1, b.islandB + 1], `seed ${s}`).toContain(id);
        }
      }
      const o = (ax: number, az: number, bx: number, bz: number, cx: number, cz: number): number =>
        (bx - ax) * (cz - az) - (bz - az) * (cx - ax);
      const cross = (p: BridgeData, q: BridgeData): boolean =>
        o(p.ax, p.az, p.bx, p.bz, q.ax, q.az) * o(p.ax, p.az, p.bx, p.bz, q.bx, q.bz) < 0 &&
        o(q.ax, q.az, q.bx, q.bz, p.ax, p.az) * o(q.ax, q.az, q.bx, q.bz, p.bx, p.bz) < 0;
      for (let i = 0; i < w.bridges.length; i++)
        for (let j = i + 1; j < w.bridges.length; j++)
          expect(cross(w.bridges[i], w.bridges[j]), `seed ${s}`).toBe(false);
    }
  });

  it('keeps clear of lots and landmarks, and limits bridges per island', () => {
    for (const s of SEEDS) {
      const w = world(s);
      const degree = new Map<number, number>();
      for (const b of w.bridges) {
        degree.set(b.islandA, (degree.get(b.islandA) ?? 0) + 1);
        degree.set(b.islandB, (degree.get(b.islandB) ?? 0) + 1);
        const n = Math.ceil(b.length);
        for (let k = 0; k <= n; k++) {
          const f = k / n;
          const x = b.ax + (b.bx - b.ax) * f;
          const z = b.az + (b.bz - b.az) * f;
          for (const l of w.lots)
            expect(Math.hypot(l.x - x, l.z - z), `seed ${s} lot`).toBeGreaterThan(
              Math.hypot(l.w, l.d) / 2 + b.width / 2,
            );
          for (const m of w.landmarks)
            expect(Math.hypot(m.x - x, m.z - z), `seed ${s} landmark`).toBeGreaterThan(
              b.width / 2 + 3,
            );
        }
      }
      for (const d of degree.values()) expect(d).toBeLessThanOrEqual(BRIDGES.maxPerIsland);
    }
  });

  it('keeps scattered props off the deck', () => {
    const w = world(1001);
    const b = w.bridges[0];
    const p = w.props;
    const dx = b.bx - b.ax;
    const dz = b.bz - b.az;
    for (let i = 0; i < p.count; i++) {
      const t = Math.min(
        1,
        Math.max(0, ((p.x[i] - b.ax) * dx + (p.z[i] - b.az) * dz) / b.length ** 2),
      );
      const d = Math.hypot(p.x[i] - (b.ax + dx * t), p.z[i] - (b.az + dz * t));
      expect(d, `prop ${i}`).toBeGreaterThan(b.width / 2);
    }
  });
});
