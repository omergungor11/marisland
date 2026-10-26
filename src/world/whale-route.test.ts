import { describe, expect, it } from 'vitest';
import { CULTURE_CLOCK } from '../content/cultures/rhythm.ts';
import { WHALE } from '../content/whale.ts';
import {
  generateWorld,
  openSeaAt,
  planWhaleRoute,
  whaleEventAt,
  whaleEvents,
  whaleRouteAt,
  whaleTimes,
  type WorldData,
} from './index.ts';
import { blowAge, makePose, slapAngle, whalePose } from '../life/whale-pose.ts';

const SPH = CULTURE_CLOCK.secondsPerHour;
const DAY = 24 * SPH;
const SEEDS = Array.from({ length: 30 }, (_, k) => 1000 + k * 263);

const cache = new Map<number, WorldData>();
const world = (seed: number): WorldData => {
  let w = cache.get(seed);
  if (!w) {
    w = generateWorld(seed);
    cache.set(seed, w);
  }
  return w;
};

describe('whale route (TASK-489), 30 seeds', () => {
  it('stays in open sea: deep, off the reefs, >= 20 u from every boat route', () => {
    for (const seed of SEEDS) {
      const w = world(seed);
      const route = planWhaleRoute(w, seed);
      expect(route, `seed ${seed} has a loop`).not.toBeNull();
      if (!route) continue;
      const out = { x: 0, z: 0, hx: 0, hz: 0 };
      const steps = Math.ceil(route.length / 3);
      for (let i = 0; i < steps; i++) {
        whaleRouteAt(route, (i / steps) * route.length, out);
        expect(
          openSeaAt(w, out.x, out.z, WHALE.route.open),
          `seed ${seed} loop point ${i} (${out.x.toFixed(0)}, ${out.z.toFixed(0)})`,
        ).toBe(true);
      }
      // a real lap round the archipelago, inside the world
      expect(route.length).toBeGreaterThan(600);
      expect(route.length).toBeLessThan(3200);
    }
  });

  it('passes the Research cape at 17:45 (its headland, offshore)', () => {
    for (const seed of SEEDS) {
      const w = world(seed);
      const route = planWhaleRoute(w, seed)!;
      const ev = whaleEvents(route, seed);
      const at = WHALE.capeHour * SPH;
      const run = whaleEventAt(ev, at);
      expect(run, `seed ${seed}: a surfacing runs at 17:45`).not.toBeNull();
      // back up and spouting: the event is between the rise and the slap
      expect(run!.u).toBeGreaterThan(WHALE.event.rise);
      expect(run!.u).toBeLessThan(WHALE.event.slapAt);
      const out = { x: 0, z: 0, hx: 0, hz: 0 };
      whaleRouteAt(route, ev[run!.index].s + whalePose(makePose(), run!.u, 1).forward, out);
      const isl = w.islands.find((i) => i.theme === 'research');
      if (!isl) continue;
      const d = Math.hypot(out.x - isl.cx, out.z - isl.cz) - isl.reach;
      expect(d, `seed ${seed}: off the cape`).toBeLessThan(170);
      expect(d).toBeGreaterThan(8);
    }
  });
});

describe('whale schedule and pose (TASK-489)', () => {
  it('is deterministic and surfaces every 90-150 s', () => {
    for (const seed of SEEDS) {
      const a = whaleTimes(seed);
      expect(whaleTimes(seed)).toEqual(a);
      expect(a).toHaveLength(WHALE.schedule.count);
      for (let i = 0; i < a.length; i++) {
        const gap = (((a[(i + 1) % a.length] - a[i]) % DAY) + DAY) % DAY;
        expect(gap, `seed ${seed} gap ${i}`).toBeGreaterThanOrEqual(90 - 1e-6);
        expect(gap).toBeLessThanOrEqual(150 + 1e-6);
      }
    }
    expect(whaleTimes(1001)).not.toEqual(whaleTimes(1264));
  });

  it('the same day second gives the same pose, one event at a time', () => {
    const w = world(1001);
    const route = planWhaleRoute(w, 1001)!;
    const ev = whaleEvents(route, 1001);
    expect(whaleEvents(route, 1001)).toEqual(ev);
    let running = 0;
    for (let d = 0; d < DAY; d += 0.5) {
      const r = whaleEventAt(ev, d, 0);
      if (r && r.u >= 0) running++;
      const p = whalePose(makePose(), r?.u ?? 0, 1);
      const q = whalePose(makePose(), r?.u ?? 0, 1);
      expect(p).toEqual(q);
    }
    // ~ count x (end) s up of the day
    const share = (running * 0.5) / (WHALE.schedule.count * WHALE.event.end);
    expect(share).toBeGreaterThan(0.95);
    expect(share).toBeLessThan(1.05);
  });

  it('rises, blows, slaps and dives', () => {
    const E = WHALE.event;
    const p = makePose();
    expect(whalePose(p, 0, 1).up).toBe(false);
    expect(whalePose(p, E.rise, 1).up).toBe(true);
    expect(whalePose(p, E.rise + 1, 1).y).toBeGreaterThan(-1);
    expect(blowAge(E.blows[0] + 0.5, 0)).toBeGreaterThan(0);
    expect(blowAge(E.blows[0] - 1, 0)).toBe(-1);
    // slap: lifts, then whips below level, then settles to 0
    expect(slapAngle(0.2)).toBeLessThan(0);
    expect(slapAngle(1.05)).toBeGreaterThan(0.5);
    expect(slapAngle(1.3)).toBeLessThan(0.1);
    expect(slapAngle(WHALE.slap.total + 0.1)).toBe(0);
    expect(slapAngle(Number.NaN)).toBe(0);
    // dive: nose down, the fluke stands up, then gone
    const dPitch = whalePose(makePose(), E.dive.from + E.dive.seconds, 1).pitch;
    expect(dPitch).toBeLessThan(-0.8);
    expect(whalePose(p, E.end, 1).up).toBe(false);
    // reduced motion: shallow dive, no slap
    expect(whalePose(makePose(), E.dive.from + E.dive.seconds, 0).pitch).toBeGreaterThan(dPitch);
    const calmTail = whalePose(makePose(), E.slapAt + 0.8, 0).tail;
    expect(calmTail).toBeLessThan(whalePose(makePose(), E.slapAt + 0.8, 1).tail);
  });
});
