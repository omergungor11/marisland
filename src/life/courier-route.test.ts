import { describe, expect, it } from 'vitest';
import { COURIER } from '../content/fleet-ships.ts';
import { generateWorld } from '../world/index.ts';
import { THEME_IDS } from '../world/types.ts';
import {
  berthOf,
  landSamples,
  voyageDist,
  voyageProfile,
  voyageRoute,
  type CourierWorld,
} from './courier-route.ts';

const world: CourierWorld = generateWorld(1001);

describe('courier voyage routes', () => {
  it('every island has a berth', () => {
    for (const t of THEME_IDS) expect(berthOf(world, t), t).not.toBeNull();
  });

  it('every ordered island pair: a route with length, no sample on land', () => {
    const kinds: string[] = [];
    for (const a of THEME_IDS)
      for (const b of THEME_IDS) {
        if (a === b) continue;
        const r = voyageRoute(world, a, b);
        expect(r, `${a}>${b}`).not.toBeNull();
        if (!r) continue;
        expect(r.total, `${a}>${b}`).toBeGreaterThan(5);
        expect(landSamples(world, r.pts, r.lens), `${a}>${b} land`).toBe(0);
        const A = berthOf(world, a);
        expect(r.pts[0]).toEqual({ x: A?.x, y: A?.z });
        kinds.push(`${a}>${b}:${r.kind}:${r.total.toFixed(0)}`);
      }
    expect(kinds.length).toBe(42);
  });

  it('is deterministic', () => {
    const a = voyageRoute(world, 'marketing', 'qa');
    const b = voyageRoute(generateWorld(1001), 'marketing', 'qa');
    expect(a?.pts).toEqual(b?.pts);
  });
});

describe('voyage profile', () => {
  it('duration clamped, monotone, exact ends', () => {
    for (const L of [10, 60, 150, 400, 900]) {
      const p = voyageProfile(L);
      expect(p.dur).toBeGreaterThanOrEqual(COURIER.voyageS[0]);
      expect(p.dur).toBeLessThanOrEqual(COURIER.voyageS[1]);
      expect(voyageDist(p, 0)).toBe(0);
      expect(voyageDist(p, p.dur)).toBe(L);
      let prev = -1;
      for (let t = 0; t <= p.dur; t += 0.25) {
        const d = voyageDist(p, t);
        expect(d).toBeGreaterThanOrEqual(prev);
        prev = d;
      }
      expect(voyageDist(p, p.dur - 1e-6)).toBeCloseTo(L, 3);
    }
  });
});
