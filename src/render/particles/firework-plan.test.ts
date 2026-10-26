import { describe, expect, it } from 'vitest';
import { CULTURE_CLOCK, RELAY } from '../../content/cultures/rhythm.ts';
import { FIREWORKS } from '../../content/signature.ts';
import { generateWorld, heightAt } from '../../world/index.ts';
import { fireworkPlan } from './firework-plan.ts';
import { showActive, showSecond } from './fireworks.ts';

const SPH = CULTURE_CLOCK.secondsPerHour;

describe('fireworks content (W:G7)', () => {
  it('one colour per shell, every shell inside the show, in order', () => {
    expect(FIREWORKS.times.length).toBe(FIREWORKS.themes.length);
    expect(FIREWORKS.kinds.length).toBe(FIREWORKS.themes.length);
    for (let k = 0; k < FIREWORKS.times.length; k++) {
      expect(FIREWORKS.times[k]).toBeGreaterThan(0);
      const life = FIREWORKS.kinds[k] === 'willow' ? FIREWORKS.willow.life : FIREWORKS.life;
      expect(FIREWORKS.times[k] + life[1]).toBeLessThanOrEqual(FIREWORKS.lengthS + FIREWORKS.tailS);
      if (k > 0) expect(FIREWORKS.times[k]).toBeGreaterThan(FIREWORKS.times[k - 1]);
    }
  });

  it('starts when the relay (and its fade) is over: 22:00 + the 60 s Comet Night', () => {
    const start = FIREWORKS.start.hour * SPH + FIREWORKS.start.afterS;
    const relayEnd = RELAY.hour * SPH + RELAY.lengthS + RELAY.fadeS;
    expect(start).toBe(relayEnd);
    expect(showSecond(start)).toBe(0);
    // the day circle wraps: 610 s is 10 s into the next day
    expect(showSecond(start % (24 * SPH))).toBeCloseTo(0, 9);
    expect(showActive(start + 5)).toBe(true);
    expect(showActive(start + FIREWORKS.lengthS + FIREWORKS.tailS + 1)).toBe(false);
    expect(showActive(start - 1)).toBe(false);
    expect(showActive(12 * SPH)).toBe(false);
  });

  it('the capture clock lands on it: time=21 & simt=85 is show second 0', () => {
    expect(showSecond(21 * SPH + 85)).toBeCloseTo(0, 9);
  });
});

describe('fireworkPlan', () => {
  const w = generateWorld(1001, {});

  it(
    'is a pure function of the world: six shells over the harbour water',
    { timeout: 60_000 },
    () => {
      const a = fireworkPlan(w);
      const b = fireworkPlan(w);
      expect(a).toEqual(b);
      expect(a!.shells.length).toBe(FIREWORKS.themes.length);
      for (const s of a!.shells) {
        expect(s.y).toBeGreaterThanOrEqual(FIREWORKS.height[0]);
        expect(s.y).toBeLessThanOrEqual(FIREWORKS.height[1]);
        // the rocket rises from the sea: the ground under the shell is water
        expect(heightAt(w.height, s.x, s.z)).toBeLessThanOrEqual(FIREWORKS.seaMax);
        expect(Math.hypot(s.x - a!.pier.x, s.z - a!.pier.z)).toBeLessThan(120);
      }
      expect(new Set(a!.shells.map((s) => s.theme)).size).toBe(a!.shells.length);
    },
  );

  it('differs by seed', { timeout: 60_000 }, () => {
    const o = generateWorld(1, {});
    expect(fireworkPlan(o)!.shells[0].x).not.toBe(fireworkPlan(w)!.shells[0].x);
  });
});
