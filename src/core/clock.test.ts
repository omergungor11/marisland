import { describe, expect, it } from 'vitest';
import { Clock, FIXED_STEP } from './clock.ts';
import { Loop } from './loop.ts';

describe('clock & loop', () => {
  it('fixed-step count is exact', () => {
    const c = new Clock();
    let steps = 0;
    for (let i = 0; i < 300; i++) steps += c.advance(1 / 60);
    // 300 frames × 1/60 s = 5 s → exactly 150 fixed steps at 30 Hz (allowing fp rounding ±1)
    expect(Math.abs(steps - 150)).toBeLessThanOrEqual(1);
  });

  it('clamps big deltas', () => {
    const c = new Clock();
    expect(c.advance(10)).toBe(Math.floor(0.1 / FIXED_STEP));
  });

  it('manual loop advances only through step()', () => {
    let fixed = 0;
    let frames = 0;
    let renders = 0;
    const loop = new Loop({ manual: true, render: () => renders++ });
    loop.add({
      name: 't',
      fixedUpdate: () => fixed++,
      update: () => frames++,
    });
    loop.start(); // no-op in manual mode
    expect(loop.isRunning).toBe(false);
    loop.step(FIXED_STEP, 30);
    expect(fixed).toBe(30);
    expect(frames).toBe(30);
    expect(renders).toBe(30);
    expect(loop.clock.simTime).toBeCloseTo(1, 5);
  });

  it('warmUp runs fixed steps without rendering', () => {
    let renders = 0;
    const loop = new Loop({ manual: true, render: () => renders++ });
    loop.warmUp(2);
    expect(loop.clock.stepCount).toBe(60);
    expect(renders).toBe(0);
  });

  it('day time advances at 600 s per day', () => {
    const c = new Clock();
    c.dayTime = 15;
    for (let i = 0; i < 30 * 25; i++) c.tick(); // 25 s = 1 game hour
    expect(c.dayTime).toBeCloseTo(16, 3);
  });
});
