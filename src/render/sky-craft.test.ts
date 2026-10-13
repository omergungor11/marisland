import { describe, expect, it } from 'vitest';
import { generateWorld } from '../world/index.ts';
import { SKY_CRAFT } from '../content/sky-craft.ts';
import { buildAirshipGeometry, buildBalloonGeometry } from '../geo/sky-craft.ts';
import {
  launchBlend,
  launchSite,
  launchStartDay,
  orbitAngle,
  skyCraftPaths,
  skyCraftPosition,
} from './sky-craft.ts';
import { buildFleetGeometry } from '../geo/sky-craft.ts';
import { THEME_IDS } from '../world/types.ts';

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

  it('steampunk models stay in budget with vertex colour; lod 1 is lighter', () => {
    for (const [g, g1, min, max] of [
      [buildBalloonGeometry(), buildBalloonGeometry(1), 1500, 4000],
      [buildAirshipGeometry(), buildAirshipGeometry(1), 2000, 5000],
    ] as const) {
      expect(g.userData.tris).toBeGreaterThan(min);
      expect(g.userData.tris).toBeLessThan(max);
      expect(g1.userData.tris).toBeLessThan(g.userData.tris * 0.7);
      expect(g.getAttribute('color')).toBeDefined();
      expect(g.getAttribute('emissive')).toBeDefined();
    }
  });

  it('airship propellers carry aSpin hubs on the z axis; geometry is deterministic', () => {
    const g = buildAirshipGeometry();
    const spin = g.getAttribute('aSpin');
    let spinning = 0;
    for (let i = 0; i < spin.count; i++) if (spin.getW(i) === 1) spinning++;
    expect(spinning).toBeGreaterThan(30);
    expect(g.userData.hubs).toHaveLength(3);
    const a = buildBalloonGeometry().getAttribute('color').array;
    expect(Array.from(buildBalloonGeometry().getAttribute('color').array)).toEqual(Array.from(a));
  });
});

describe('sky culture (TASK-441)', () => {
  it('the Hype Fleet: one culture per balloon, marketing first, seeded', () => {
    for (const q of QUALITIES) {
      const b = skyCraftPaths(world, q, 1001).filter((p) => p.kind === 'balloon');
      expect(b[0].theme).toBe(SKY_CRAFT.fleet.launchTheme);
      expect(new Set(b.map((p) => p.theme)).size).toBe(b.length);
      for (const p of b) expect(THEME_IDS).toContain(p.theme);
    }
    const themes = (s: number): string =>
      skyCraftPaths(world, 'high', s)
        .filter((p) => p.kind === 'balloon')
        .map((p) => p.theme)
        .join();
    expect(themes(1001)).toBe(themes(1001));
  });

  it('the fleet is one geometry; liveries differ, pennants and emblems stay in budget', () => {
    const liv = (['marketing', 'research', 'hq', 'qa', 'design'] as const).map((theme, i, a) => ({
      theme,
      alt: a[(i + 1) % a.length],
    }));
    const f = buildFleetGeometry(liv);
    expect(f.ranges).toHaveLength(5);
    expect(f.ranges[4].start + f.ranges[4].count).toBe(f.geometry.getAttribute('position').count);
    const solo = buildFleetGeometry([liv[0]]);
    expect(f.geometry.userData.tris).toBeLessThan(5 * 4400);
    // a livery balloon is the plain one plus spars and pennants, in different colours
    expect(solo.geometry.userData.tris).toBeGreaterThan(buildBalloonGeometry().userData.tris);
    const c0 = Array.from(solo.geometry.getAttribute('color').array.slice(0, 600));
    const c1 = Array.from(
      buildFleetGeometry([liv[1]]).geometry.getAttribute('color').array.slice(0, 600),
    );
    expect(c0).not.toEqual(c1);
  });

  it('the Orchestrator slows over HQ and is periodic and continuous', () => {
    const ship = skyCraftPaths(world, 'medium', 1001).find((p) => p.kind === 'airship')!;
    expect(ship.hqAngle).toBeDefined();
    // angles are compared on the circle (the lap table wraps at 2 pi)
    const wrap = (x: number): number => Math.atan2(Math.sin(x), Math.cos(x));
    expect(wrap(orbitAngle(ship, 0) - ship.phase)).toBeCloseTo(0, 3);
    const rate = (t: number): number =>
      Math.abs(wrap(orbitAngle(ship, t + 0.5) - orbitAngle(ship, t - 0.5)));
    const rates: Array<[number, number]> = [];
    for (let t = 1; t < 700; t += 1) rates.push([t, rate(t)]);
    const base = Math.abs(ship.w);
    const slowest = rates.reduce((a, b) => (b[1] < a[1] ? b : a));
    expect(slowest[1]).toBeCloseTo(base * SKY_CRAFT.orchestrator.slow.floor, 2);
    expect(Math.max(...rates.map((r) => r[1]))).toBeLessThan(base * 1.001);
    // the slowest moment is the HQ crossing
    const a = orbitAngle(ship, slowest[0]);
    expect(Math.abs(wrap(a - ship.hqAngle!))).toBeLessThan(0.05);
    // no jump
    for (let t = 0; t < 700; t += 0.5)
      expect(Math.abs(wrap(orbitAngle(ship, t + 0.5) - orbitAngle(ship, t)))).toBeLessThan(
        base * 0.5 * 1.01,
      );
  });

  it('the Launch Show: mast stand, inflate, lift, join, return; continuous', () => {
    const site = launchSite(world);
    expect(site).not.toBeNull();
    const paths = skyCraftPaths(world, 'medium', 1001);
    expect(paths.filter((p) => p.launchSite)).toHaveLength(1);
    expect(paths[0].launchSite).toEqual(site);
    const L = SKY_CRAFT.launch;
    const t0 = launchStartDay();
    expect(launchBlend(t0)).toEqual({ k: 0, scale: L.packedScale });
    expect(launchBlend(t0 + L.inflateS).k).toBe(0);
    expect(launchBlend(t0 + L.inflateS).scale).toBeCloseTo(1, 6);
    expect(launchBlend(t0 + L.inflateS + L.liftS + 1)).toEqual({ k: 1, scale: 1 });
    expect(launchBlend(t0 - L.preS - 1)).toEqual({ k: 1, scale: 1 });
    // continuous over the whole 600 s day (incl. the wrap at the slot start)
    let prev = launchBlend(0);
    for (let d = 0.25; d <= 600; d += 0.25) {
      const cur = launchBlend(d);
      expect(Math.abs(cur.k - prev.k)).toBeLessThan(0.05);
      expect(Math.abs(cur.scale - prev.scale)).toBeLessThan(0.1);
      prev = cur;
    }
  });
});
