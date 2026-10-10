import { describe, expect, it } from 'vitest';
import { generateWorld } from '../world/index.ts';
import { SKY_CRAFT } from '../content/sky-craft.ts';
import { buildAirshipGeometry, buildBalloonGeometry } from '../geo/sky-craft.ts';
import { skyCraftPaths, skyCraftPosition } from './sky-craft.ts';

const world = generateWorld(1001);
const QUALITIES = ['low', 'medium', 'high'] as const;

describe('sky craft', () => {
  it('count follows the quality tier', () => {
    for (const q of QUALITIES) {
      const paths = skyCraftPaths(world, q, 1001);
      const want = SKY_CRAFT.count[q];
      expect(paths.filter((p) => p.kind === 'balloon')).toHaveLength(want.balloons);
      expect(paths.filter((p) => p.kind === 'airship')).toHaveLength(want.airships);
    }
  });

  it('is deterministic per seed and differs across seeds', () => {
    const a = JSON.stringify(skyCraftPaths(world, 'high', 1001));
    expect(JSON.stringify(skyCraftPaths(world, 'high', 1001))).toBe(a);
    expect(JSON.stringify(skyCraftPaths(world, 'high', 1002))).not.toBe(a);
  });

  it('flies inside the islands bbox, under the airship layer, keeping apart', () => {
    const isl = world.islands;
    const minX = Math.min(...isl.map((i) => i.minX));
    const maxX = Math.max(...isl.map((i) => i.maxX));
    const minZ = Math.min(...isl.map((i) => i.minZ));
    const maxZ = Math.max(...isl.map((i) => i.maxZ));
    const paths = skyCraftPaths(world, 'high', 1001);
    let minGap = Infinity;
    for (let t = 0; t < 4000; t += 20) {
      const pos = paths.map((c, k) => skyCraftPosition(c, t, k));
      for (const [x, y, z] of pos) {
        expect(x).toBeGreaterThanOrEqual(minX - 1);
        expect(x).toBeLessThanOrEqual(maxX + 1);
        expect(z).toBeGreaterThanOrEqual(minZ - 1);
        expect(z).toBeLessThanOrEqual(maxZ + 1);
        expect(y).toBeGreaterThan(SKY_CRAFT.balloonY[0] - 2);
        expect(y).toBeLessThan(SKY_CRAFT.airshipY + 2);
      }
      for (let i = 0; i < pos.length; i++)
        for (let j = i + 1; j < pos.length; j++) {
          const d = Math.hypot(pos[i][0] - pos[j][0], pos[i][1] - pos[j][1], pos[i][2] - pos[j][2]);
          minGap = Math.min(minGap, d);
        }
    }
    expect(minGap).toBeGreaterThan(18);
  });

  it('models stay in the low-poly budget with vertex colour', () => {
    for (const [g, max] of [
      [buildBalloonGeometry(), 400],
      [buildAirshipGeometry(), 400],
    ] as const) {
      expect(g.userData.tris).toBeGreaterThan(50);
      expect(g.userData.tris).toBeLessThan(max);
      expect(g.getAttribute('color')).toBeDefined();
    }
  });
});
