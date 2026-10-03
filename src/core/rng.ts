import { hashLabel, hashToUnit, mix32 } from './hash.ts';

/**
 * sfc32 PRNG with label-based forking (ARCHITECTURE §2 "Determinism").
 *
 * `rng.fork('props:3:pine')` derives an independent stream from the parent's
 * seed and the label only — never from how many numbers the parent has drawn.
 * Adding a new system therefore never shifts any existing stream.
 */
export interface Rng {
  readonly seed: number;
  /** Next uint32. */
  nextU32(): number;
  /** Float in [0, 1). */
  next(): number;
  /** Float in [min, max). */
  range(min: number, max: number): number;
  /** Integer in [min, max] inclusive. */
  int(min: number, max: number): number;
  /** True with probability p. */
  chance(p: number): boolean;
  /** Pick one element. */
  pick<T>(arr: readonly T[]): T;
  /** In-place Fisher–Yates shuffle; returns the same array. */
  shuffle<T>(arr: T[]): T[];
  /** Approximately normal (sum of 4 uniforms), mean 0, sd ≈ 1. */
  gauss(): number;
  /** Independent child stream keyed by label + optional integer parts. */
  fork(label: string, ...parts: number[]): Rng;
}

class Sfc32 implements Rng {
  private a: number;
  private b: number;
  private c: number;
  private d: number;
  readonly seed: number;

  constructor(seed: number) {
    this.seed = seed >>> 0;
    // Expand one uint32 into four state words and warm up.
    let s = this.seed;
    this.a = mix32(s + 0x9e3779b9);
    s = this.a;
    this.b = mix32(s + 0x9e3779b9);
    s = this.b;
    this.c = mix32(s + 0x9e3779b9);
    s = this.c;
    this.d = mix32(s + 0x9e3779b9) | 1;
    for (let i = 0; i < 12; i++) this.nextU32();
  }

  nextU32(): number {
    const t = (((this.a + this.b) >>> 0) + this.d) >>> 0;
    this.d = (this.d + 1) >>> 0;
    this.a = this.b ^ (this.b >>> 9);
    this.b = (this.c + (this.c << 3)) >>> 0;
    this.c = ((this.c << 21) | (this.c >>> 11)) >>> 0;
    this.c = (this.c + t) >>> 0;
    return t >>> 0;
  }

  next(): number {
    return hashToUnit(this.nextU32());
  }

  range(min: number, max: number): number {
    return min + (max - min) * this.next();
  }

  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  chance(p: number): boolean {
    return this.next() < p;
  }

  pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.next() * arr.length)];
  }

  shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      const t = arr[i];
      arr[i] = arr[j];
      arr[j] = t;
    }
    return arr;
  }

  gauss(): number {
    return (this.next() + this.next() + this.next() + this.next() - 2) * 1.7320508;
  }

  fork(label: string, ...parts: number[]): Rng {
    return new Sfc32(hashLabel(this.seed, label, ...parts));
  }
}

export function createRng(seed: number): Rng {
  return new Sfc32(seed);
}
