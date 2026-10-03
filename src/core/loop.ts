import { Clock, FIXED_STEP } from './clock.ts';

/**
 * A system plugs into the loop. `fixedUpdate` runs at 30 Hz, `update` once per
 * rendered frame with the interpolation alpha. Order = registration order.
 */
export interface System {
  readonly name: string;
  fixedUpdate?(dt: number): void;
  update?(dt: number, alpha: number): void;
  dispose?(): void;
}

export interface LoopOptions {
  /** Capture mode: never schedules RAF; time advances only via `step()`. */
  manual: boolean;
  /** Called after systems update, performs the actual render. */
  render: () => void;
  /** Wall-clock provider for the live loop (RAF timestamps). */
  now?: () => number;
}

/**
 * One RAF, one clock (ARCHITECTURE §1). In manual (capture) mode the loop
 * only advances through `step(dt, n)` so the sim and the shaders are deterministic.
 */
export class Loop {
  readonly clock = new Clock();
  private systems: System[] = [];
  private raf = 0;
  private last = -1;
  private running = false;
  private opts: LoopOptions;
  /** Frames rendered. */
  frame = 0;
  /** Milliseconds spent on the CPU side of the last frame (0 in manual mode). */
  cpuMs = 0;

  constructor(opts: LoopOptions) {
    this.opts = opts;
  }

  add(system: System): void {
    this.systems.push(system);
  }

  remove(system: System): void {
    const i = this.systems.indexOf(system);
    if (i >= 0) this.systems.splice(i, 1);
  }

  /** Run `n` frames of `dt` seconds each, deterministically. */
  step(dt: number = FIXED_STEP, n = 1): void {
    for (let i = 0; i < n; i++) this.frameAdvance(dt);
  }

  /** Run fixed steps only (no render) — used for `simt` warm-up. */
  warmUp(seconds: number): void {
    const n = Math.round(seconds / FIXED_STEP);
    for (let i = 0; i < n; i++) this.fixedStep();
  }

  start(): void {
    if (this.opts.manual || this.running) return;
    this.running = true;
    this.last = -1;
    const tick = (ts: number): void => {
      if (!this.running) return;
      const t0 = this.opts.now ? this.opts.now() : ts;
      const dt = this.last < 0 ? FIXED_STEP : (ts - this.last) / 1000;
      this.last = ts;
      this.frameAdvance(dt);
      const t1 = this.opts.now ? this.opts.now() : ts;
      this.cpuMs = t1 - t0;
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  stop(): void {
    this.running = false;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  get isRunning(): boolean {
    return this.running;
  }

  private fixedStep(): void {
    this.clock.tick();
    for (let s = 0; s < this.systems.length; s++) this.systems[s].fixedUpdate?.(FIXED_STEP);
  }

  private frameAdvance(dt: number): void {
    const steps = this.clock.advance(dt);
    for (let i = 0; i < steps; i++) this.fixedStep();
    const alpha = this.clock.alpha;
    for (let s = 0; s < this.systems.length; s++) this.systems[s].update?.(dt, alpha);
    this.opts.render();
    this.frame++;
  }

  dispose(): void {
    this.stop();
    for (let s = this.systems.length - 1; s >= 0; s--) this.systems[s].dispose?.();
    this.systems.length = 0;
  }
}
