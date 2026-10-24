/**
 * Coding C18 rim boardwalk (TASK-484): the TASK-480 rim walkway primitive on the Coding plateau in
 * `Zone.streetCoding`, wooden posts (RIM_POST_LOOKS[1] = rimPost v2 / v3) and two sea-facing
 * benches on its inland edge. 30 seeds (same set as the other Coding plan tests).
 */
import { describe, expect, it } from 'vitest';
import { RIM_POST_LOOKS } from '../content/rim-walkway.ts';
import { CODING_RIM_BENCHES, CODING_RIM_WALK } from '../content/themes/coding.ts';
import { segDist } from './gen/sites.ts';
import { generateWorld, heightAt, type IslandData, type WorldData, type XZ } from './index.ts';

const SEEDS = Array.from({ length: 30 }, (_, i) => 1 + i * 37);
const worlds = new Map<number, WorldData>();
const world = (seed: number): WorldData => {
  let w = worlds.get(seed);
  if (!w) worlds.set(seed, (w = generateWorld(seed)));
  return w;
};
const codingOf = (w: WorldData): IslandData =>
  w.islands.find((i) => i.theme === 'coding') as IslandData;
const slope = (w: WorldData, x: number, z: number): number =>
  Math.hypot(
    heightAt(w.height, x + 1, z) - heightAt(w.height, x - 1, z),
    heightAt(w.height, x, z + 1) - heightAt(w.height, x, z - 1),
  ) / 2;
const nearPath = (w: WorldData, id: number, p: XZ, r: number): boolean =>
  w.paths.some(
    (pl) =>
      pl.islandId === id &&
      pl.points.some((q, k) => k + 1 < pl.points.length && segDist(p, q, pl.points[k + 1]) < r),
  );

describe('Coding C18 rim boardwalk (TASK-484), 30 seeds', { timeout: 120_000 }, () => {
  const W = CODING_RIM_WALK;
  const P = W.posts!;
  const look = RIM_POST_LOOKS[P.variant >> 1];

  it('the wooden look is its own appended row (QA keeps row 0)', () => {
    expect(P.variant >> 1).toBe(1);
    expect(P.end).toBe(P.variant + 1);
    expect(look.railLen).toBe(P.spacing);
    expect(look.lamp).toBeNull();
  });

  it('a timber walk on the plateau rim, wooden posts every 3 u, gaps at paths', () => {
    let walks = 0;
    for (const seed of SEEDS) {
      const w = world(seed);
      const isl = codingOf(w);
      const ctx = `seed ${seed}`;
      let painted = 0;
      for (let i = 0; i < w.zone.length; i++) {
        if (w.islandMap[i] !== isl.id + 1 || w.zone[i] !== W.zone) continue;
        painted++;
        expect(w.height.data[i], ctx).toBeGreaterThanOrEqual(W.minY - 0.5);
        expect(w.shoreSdf[i], ctx).toBeGreaterThan(3);
      }
      const posts = w.fixtures.filter((f) => f.islandId === isl.id && f.defId === P.def);
      if (painted >= 20 && posts.length >= 10) walks++;
      for (const f of posts) {
        const at = `${ctx} post @${f.x.toFixed(1)},${f.z.toFixed(1)}`;
        expect([P.variant, P.end], at).toContain(f.variant);
        expect(heightAt(w.height, f.x, f.z), at).toBeGreaterThanOrEqual(W.minY);
        expect(slope(w, f.x, f.z), at).toBeLessThanOrEqual(W.maxSlope + 1e-6);
        expect(nearPath(w, isl.id, f, W.pathGap - 0.05), `${at} on a path`).toBe(false);
        // the rail (local +x = (sin, −cos) of rotY) ends at the next post
        if (f.variant === P.variant) {
          const end = {
            x: f.x + Math.sin(f.rotY) * look.railLen,
            z: f.z - Math.cos(f.rotY) * look.railLen,
          };
          const next = Math.min(...posts.map((q) => Math.hypot(q.x - end.x, q.z - end.z)));
          expect(next, `${at} rail end`).toBeLessThan(0.05);
        }
      }
    }
    // TASK-484 (30 seeds): 28 / 30 have a walk; two small plateaus (852, 1037) have only a stub
    expect(walks / SEEDS.length).toBeGreaterThanOrEqual(0.85);
  });

  it('two benches on the walk, facing the sea, apart, off the paths', () => {
    const B = CODING_RIM_BENCHES;
    let benches = 0;
    for (const seed of SEEDS) {
      const w = world(seed);
      const isl = codingOf(w);
      const ctx = `seed ${seed}`;
      const zoneAt = (x: number, z: number): number =>
        w.zone[
          Math.round((z - w.height.originZ) / w.height.cellSize) * w.height.n +
            Math.round((x - w.height.originX) / w.height.cellSize)
        ];
      const sdfAt = (x: number, z: number): number =>
        w.shoreSdf[
          Math.round((z - w.height.originZ) / w.height.cellSize) * w.height.n +
            Math.round((x - w.height.originX) / w.height.cellSize)
        ];
      // the rim benches are the only bench v0 fixtures pinned with a variant on Coding
      const bs = w.fixtures.filter(
        (f) => f.islandId === isl.id && f.defId === 'bench' && f.variant === B.variant,
      );
      expect(bs.length, ctx).toBeLessThanOrEqual(B.count);
      for (const f of bs) {
        const at = `${ctx} bench @${f.x.toFixed(1)},${f.z.toFixed(1)}`;
        expect(nearPath(w, isl.id, f, 1.5), `${at} on a path`).toBe(false);
        // the walk is within a few u, and the bench faces the sea (front = (cos, sin) rotY)
        let walk = false;
        for (let r = 0; r <= 3 && !walk; r += 0.5)
          for (let k = 0; k < 8 && !walk; k++)
            walk =
              zoneAt(
                f.x + Math.cos((k * Math.PI) / 4) * r,
                f.z + Math.sin((k * Math.PI) / 4) * r,
              ) === W.zone;
        expect(walk, `${at} beside the walk`).toBe(true);
        const ahead = sdfAt(f.x + Math.cos(f.rotY) * 4, f.z + Math.sin(f.rotY) * 4);
        const behind = sdfAt(f.x - Math.cos(f.rotY) * 4, f.z - Math.sin(f.rotY) * 4);
        expect(ahead, `${at} faces the sea`).toBeLessThan(behind);
      }
      if (bs.length === 2)
        expect(Math.hypot(bs[0].x - bs[1].x, bs[0].z - bs[1].z), ctx).toBeGreaterThanOrEqual(
          B.apart - 1e-6,
        );
      benches += bs.length;
    }
    // TASK-484: 59 benches on 30 seeds (seed 1037: one)
    expect(benches / SEEDS.length).toBeGreaterThanOrEqual(1.8);
  });
});
