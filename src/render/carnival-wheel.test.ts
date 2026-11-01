import { describe, expect, it } from 'vitest';
import { MEDIA_MOVERS } from '../content/themes/marketing.ts';
import { CARNIVAL_MOTION } from '../content/themes/marketing-harbour.ts';
import { sinceFerryArrival, type FerryCall } from '../life/ferry.ts';
import { wheelTurns } from './movers.ts';

/** TASK-536 (D-126): the pier wheel's turn is a closed form of the sim time. */
const call: FerryCall = { cycle: 300, at: 40, dwell: 8, offs: [0] };
const W = CARNIVAL_MOTION.wheel;
const frac = (x: number): number => x - Math.floor(x);

describe('Carnival Pier wheel', () => {
  it('a wheel without a call keeps the steady turn', () => {
    for (const t of [0, 7, 123.4]) expect(wheelTurns(t)).toBeCloseTo(t / MEDIA_MOVERS.wheelPeriod);
  });

  it('adds whole turns over the boost, none outside it', () => {
    const after = 40 + W.seconds + 5;
    expect(wheelTurns(after, call)).toBeCloseTo(after / MEDIA_MOVERS.wheelPeriod + W.turns);
    expect(Number.isInteger(W.turns)).toBe(true);
  });

  it('runs faster during the boost, always forward', () => {
    const steady = wheelTurns(100, call) - wheelTurns(99, call);
    const mid =
      wheelTurns(40 + W.seconds / 2 + 0.5, call) - wheelTurns(40 + W.seconds / 2 - 0.5, call);
    expect(mid).toBeGreaterThan(steady * 2);
    for (let t = 0; t < 700; t += 0.5)
      expect(wheelTurns(t + 0.5, call), `t ${t}`).toBeGreaterThanOrEqual(
        wheelTurns(t, call) - 1.01,
      );
  });

  it('is continuous on the rim across the next arrival (the jump is a whole turn)', () => {
    let t0 = 40;
    while (sinceFerryArrival(call, t0) > 1e-6) t0 += 1e-3;
    const a = frac(wheelTurns(t0 + 300 - 1e-4, call));
    const b = frac(wheelTurns(t0 + 300 + 1e-4, call));
    const d = Math.abs(a - b);
    expect(Math.min(d, 1 - d)).toBeLessThan(1e-3);
  });
});
