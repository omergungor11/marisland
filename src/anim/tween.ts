import { clamp01 } from './spring.ts';

/**
 * Small pool of one-shot tweens driven by an external time (the caller advances `t` from the
 * engine clock). No allocation after the pool is warm; no wall clock anywhere.
 */
export interface Tween {
  active: boolean;
  t0: number;
  dur: number;
  /** Called with eased progress 0..1 each update, then once with 1 on completion. */
  tick: ((u: number) => void) | null;
  ease: (u: number) => number;
  done: (() => void) | null;
}

const lin = (u: number): number => u;

export class TweenPool {
  private readonly pool: Tween[] = [];
  private time = 0;

  start(
    dur: number,
    tick: (u: number) => void,
    ease: (u: number) => number = lin,
    done: (() => void) | null = null,
  ): Tween {
    let tw = this.pool.find((p) => !p.active);
    if (!tw) {
      tw = { active: false, t0: 0, dur: 0, tick: null, ease: lin, done: null };
      this.pool.push(tw);
    }
    tw.active = true;
    tw.t0 = this.time;
    tw.dur = Math.max(dur, 1e-4);
    tw.tick = tick;
    tw.ease = ease;
    tw.done = done;
    return tw;
  }

  update(t: number): void {
    this.time = t;
    for (const tw of this.pool) {
      if (!tw.active) continue;
      const u = clamp01((t - tw.t0) / tw.dur);
      tw.tick?.(tw.ease(u));
      if (u >= 1) {
        tw.active = false;
        tw.done?.();
        tw.tick = null;
        tw.done = null;
      }
    }
  }

  get activeCount(): number {
    let n = 0;
    for (const p of this.pool) if (p.active) n++;
    return n;
  }
}
