/**
 * The one clock (ARCHITECTURE §1). Sim runs at a fixed step; render time is
 * `simTime + alpha * step`. In capture mode nothing advances except via `step()`.
 */
export const FIXED_STEP = 1 / 30;
export const MAX_FRAME_DT = 0.1;

export class Clock {
  /** Accumulated simulation time in seconds (multiples of FIXED_STEP). */
  simTime = 0;
  /** Number of fixed steps taken so far. */
  stepCount = 0;
  /** Fraction [0,1) of the next fixed step that has elapsed. */
  alpha = 0;
  /** Game-of-day time in hours [0, 24). 1 game day = `dayLength` real seconds. */
  dayTime = 15;
  /** Real seconds per game day (ART_BIBLE §2: 600). */
  dayLength = 600;
  /** 0 freezes the day cycle (capture), 1 = live. */
  daySpeed = 1;
  private accumulator = 0;

  /** Render-time in seconds, interpolated between fixed steps. Drives `uTime`. */
  get time(): number {
    return this.simTime + this.alpha * FIXED_STEP;
  }

  /**
   * Advance by a frame delta. Returns the number of fixed steps to run.
   * `dt` is clamped so a background tab never explodes the sim.
   */
  advance(dt: number): number {
    const d = Math.min(Math.max(dt, 0), MAX_FRAME_DT);
    this.accumulator += d;
    let steps = 0;
    while (this.accumulator >= FIXED_STEP) {
      this.accumulator -= FIXED_STEP;
      steps++;
    }
    this.alpha = this.accumulator / FIXED_STEP;
    return steps;
  }

  /** Called once per fixed step by the loop. */
  tick(): void {
    this.simTime = (this.stepCount + 1) * FIXED_STEP;
    this.stepCount++;
    if (this.daySpeed !== 0) {
      this.dayTime = (this.dayTime + (FIXED_STEP * 24 * this.daySpeed) / this.dayLength) % 24;
    }
  }

  /** Jump the fixed-step counter (capture `simt` warm-up decides steps itself). */
  reset(): void {
    this.simTime = 0;
    this.stepCount = 0;
    this.alpha = 0;
    this.accumulator = 0;
  }
}
