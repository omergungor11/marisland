import { describe, expect, it } from 'vitest';
import { createRng } from './rng.ts';
import { hashLabel, unitHash } from './hash.ts';

describe('rng', () => {
  it('is deterministic for the same seed', () => {
    const a = createRng(42);
    const b = createRng(42);
    for (let i = 0; i < 100; i++) expect(a.nextU32()).toBe(b.nextU32());
  });

  it('differs across seeds', () => {
    expect(createRng(1).next()).not.toBe(createRng(2).next());
  });

  it('fork is independent of parent draw count (label-fork)', () => {
    const a = createRng(7);
    const b = createRng(7);
    for (let i = 0; i < 50; i++) b.next(); // b drew a lot more
    const fa = a.fork('props:pine', 3);
    const fb = b.fork('props:pine', 3);
    for (let i = 0; i < 20; i++) expect(fa.next()).toBe(fb.next());
  });

  it('sibling forks do not shift each other', () => {
    const root = createRng(99);
    const before = root.fork('trees').next();
    // adding a new system between must not change 'trees'
    root.fork('rocks').next();
    root.fork('rocks').next();
    expect(root.fork('trees').next()).toBe(before);
    expect(root.fork('trees', 1).next()).not.toBe(root.fork('trees', 2).next());
  });

  it('produces values in range', () => {
    const r = createRng(5);
    for (let i = 0; i < 1000; i++) {
      const f = r.next();
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThan(1);
      const n = r.int(3, 6);
      expect(n).toBeGreaterThanOrEqual(3);
      expect(n).toBeLessThanOrEqual(6);
    }
  });

  it('is roughly uniform', () => {
    const r = createRng(123);
    const bins = new Array(10).fill(0);
    for (let i = 0; i < 20000; i++) bins[Math.floor(r.next() * 10)]++;
    for (const b of bins) expect(Math.abs(b - 2000)).toBeLessThan(200);
  });

  it('hashes are stable', () => {
    expect(hashLabel(1, 'a')).toBe(hashLabel(1, 'a'));
    expect(hashLabel(1, 'a')).not.toBe(hashLabel(2, 'a'));
    expect(hashLabel(1, 'a', 1)).not.toBe(hashLabel(1, 'a', 2));
    expect(unitHash(1, 5)).toBeLessThan(1);
  });
});
