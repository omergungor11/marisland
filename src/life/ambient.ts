import { FIXED_STEP } from '../core/clock.ts';
import { createRng, type Rng } from '../core/rng.ts';
import { AMBIENT } from '../content/life.ts';

export type AmbientType = 'fishJump' | 'gullLand' | 'coconutDrop' | 'dolphins';
export const AMBIENT_TYPES: readonly AmbientType[] = [
  'fishJump',
  'gullLand',
  'coconutDrop',
  'dolphins',
];

export interface AmbientEvent {
  type: AmbientType;
  /** Scheduled simulation time (s) — a multiple of the fixed step. */
  t: number;
  /** Running index per type. */
  id: number;
  /** Two uniform [0,1) draws from the event's own stream, for handlers to pick targets. */
  r: number;
  r2: number;
  /** Explicit world position when fired by `fire` (e.g. a clicked water point). */
  x?: number;
  z?: number;
}
export type AmbientHandler = (e: AmbientEvent) => void;

/**
 * Seeded Poisson scheduler: each type has an independent stream (`fork('ambient', type)`),
 * exponential gaps clamped to the bible's [min, max]. Time comes from the fixed-step counter only,
 * so the same number of steps always fires the same events at the same times.
 */
export class AmbientScheduler {
  private readonly rngs = new Map<AmbientType, Rng>();
  private readonly next = new Map<AmbientType, number>();
  private readonly ids = new Map<AmbientType, number>();
  private readonly handlers = new Map<AmbientType, AmbientHandler[]>();
  private steps = 0;

  constructor(seed: number) {
    const root = createRng(seed).fork('life').fork('ambient');
    for (const type of AMBIENT_TYPES) {
      const r = root.fork(type);
      this.rngs.set(type, r);
      this.ids.set(type, 0);
      this.next.set(type, this.gap(type, r));
    }
  }

  get time(): number {
    return this.steps * FIXED_STEP;
  }

  on(type: AmbientType, handler: AmbientHandler): () => void {
    const list = this.handlers.get(type) ?? [];
    list.push(handler);
    this.handlers.set(type, list);
    return () => {
      const i = list.indexOf(handler);
      if (i >= 0) list.splice(i, 1);
    };
  }

  /** Fire `type` now at a world position (interaction layer). Does not disturb the Poisson streams. */
  fire(type: AmbientType, x: number, z: number): void {
    const list = this.handlers.get(type);
    if (!list) return;
    const ev: AmbientEvent = { type, t: this.time, id: -1, r: 0.5, r2: 0.5, x, z };
    for (let h = 0; h < list.length; h++) list[h](ev);
  }

  /** Time (s) of the next event of `type`. */
  nextTime(type: AmbientType): number {
    return this.next.get(type) ?? Infinity;
  }

  fixedUpdate(): void {
    this.steps++;
    const t = this.time;
    for (const type of AMBIENT_TYPES) {
      let at = this.next.get(type) as number;
      while (t >= at) {
        const rng = this.rngs.get(type) as Rng;
        const id = this.ids.get(type) as number;
        this.ids.set(type, id + 1);
        const ev: AmbientEvent = { type, t: at, id, r: rng.next(), r2: rng.next() };
        const list = this.handlers.get(type);
        if (list) for (let h = 0; h < list.length; h++) list[h](ev);
        at += this.gap(type, rng);
        this.next.set(type, at);
      }
    }
  }

  private gap(type: AmbientType, rng: Rng): number {
    const c = AMBIENT[type];
    const g = -c.mean * Math.log(1 - rng.next());
    // snap to the fixed step so event times are exact multiples (stable across runs)
    return Math.round(Math.min(Math.max(g, c.min), c.max) / FIXED_STEP) * FIXED_STEP;
  }
}
