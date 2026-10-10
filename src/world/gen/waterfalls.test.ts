import { describe, expect, it } from 'vitest';
import { createRng } from '../../core/rng.ts';
import { WATERFALLS as W } from '../../content/waterfalls.ts';
import { generateWorld, heightAt, sampleGrid, Zone, type WorldData } from '../index.ts';
import { ARCHETYPES } from '../../content/islands.ts';
import { bluffOf, coveness } from './heightfield.ts';
import { placeWaterfalls } from './waterfalls.ts';

const SEEDS = [1001, 6006, 4004];
const worlds = new Map<number, WorldData>(SEEDS.map((s) => [s, generateWorld(s)]));

/** Zone.cliff within `r` u of (x, z) on the grid. */
function cliffNear(w: WorldData, x: number, z: number, r: number): boolean {
  const h = w.height;
  const i0 = Math.round((x - h.originX) / h.cellSize);
  const j0 = Math.round((z - h.originZ) / h.cellSize);
  const k = Math.ceil(r / h.cellSize);
  for (let j = j0 - k; j <= j0 + k; j++)
    for (let i = i0 - k; i <= i0 + k; i++) if (w.zone[j * h.n + i] === Zone.cliff) return true;
  return false;
}

describe('waterfall placement (TASK-395)', () => {
  it('is deterministic and differs across seeds', () => {
    const a = worlds.get(1001)!;
    const again = placeWaterfalls(a, createRng(1001).fork('waterfalls'));
    expect(JSON.stringify(again)).toBe(JSON.stringify(a.waterfalls));
    expect(JSON.stringify(worlds.get(6006)!.waterfalls)).not.toBe(JSON.stringify(a.waterfalls));
  });

  it('puts 1–3 falls on every bluff island and none elsewhere', () => {
    for (const w of worlds.values()) {
      for (const isl of w.islands) {
        const n = w.waterfalls.filter((f) => f.islandId === isl.id).length;
        if (bluffOf(isl) && !ARCHETYPES[isl.archetype].crater) {
          expect(n).toBeGreaterThanOrEqual(W.count[0]);
          expect(n).toBeLessThanOrEqual(W.count[1]);
        } else expect(n).toBe(0);
      }
    }
  });

  it('starts on a bluff lip, outside the cove, clear of docks and lots', () => {
    for (const w of worlds.values()) {
      for (const f of w.waterfalls) {
        const isl = w.islands[f.islandId];
        expect(sampleGrid(w.height, w.shoreSdf, f.x, f.z, -1)).toBeGreaterThan(0);
        expect(f.y).toBeGreaterThanOrEqual(W.minDrop);
        expect(cliffNear(w, f.x, f.z, 2)).toBe(true);
        expect(coveness(isl, w.windDir, f.x, f.z)).toBeLessThanOrEqual(W.maxCove);
        for (const d of w.docks) expect(Math.hypot(f.x - d.x, f.z - d.z)).toBeGreaterThan(10);
        for (const l of w.lots)
          expect(Math.hypot(f.x - l.x, f.z - l.z) - Math.max(l.w, l.d) / 2).toBeGreaterThan(5);
      }
    }
  });

  it('falls down the face into the water', () => {
    for (const w of worlds.values()) {
      for (const f of w.waterfalls) {
        const run = Math.hypot(f.baseX - f.x, f.baseZ - f.z);
        expect(run).toBeLessThanOrEqual(W.maxRun);
        expect(f.y / run).toBeGreaterThanOrEqual(W.minSteep);
        expect(heightAt(w.height, f.baseX, f.baseZ)).toBeLessThan(0);
        expect(sampleGrid(w.height, w.shoreSdf, f.baseX, f.baseZ, -1)).toBeLessThan(0.5);
        // the base lies along the fall direction
        const dot = ((f.baseX - f.x) * Math.cos(f.rotY) + (f.baseZ - f.z) * Math.sin(f.rotY)) / run;
        expect(dot).toBeGreaterThan(0.99);
      }
    }
  });

  it('keeps falls on one island apart', () => {
    for (const w of worlds.values())
      for (const a of w.waterfalls)
        for (const b of w.waterfalls)
          if (a !== b && a.islandId === b.islandId)
            expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThanOrEqual(W.spacing);
  });
});
