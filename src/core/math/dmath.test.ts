import { describe, expect, it } from 'vitest';
import * as dm from './dmath.ts';
import { bitDigest } from '../../test/bits.ts';

// TASK-552 / D-132. Native Math.* rounds differently on arm64 and x64; dmath must not.
// The golden digests below were taken on an arm64 Mac and checked equal under Linux x64
// (node:22 amd64 container): CI failing here means a platform rounds dmath differently.

const F = new Float64Array(1);
const I = new BigInt64Array(F.buffer);
const ordered = (v: number): bigint => {
  F[0] = v;
  return I[0] < 0n ? -(I[0] & 0x7fffffffffffffffn) : I[0];
};
const ulps = (a: number, b: number): number => {
  if (a === b || (a !== a && b !== b)) return 0;
  const d = ordered(a) - ordered(b);
  return Number(d < 0n ? -d : d);
};

/** LCG inputs in [lo, hi): fixed, platform-free. */
function inputs(n: number, lo: number, hi: number, seed: number): number[] {
  let st = seed >>> 0;
  return Array.from({ length: n }, () => {
    st = (Math.imul(st, 1664525) + 1013904223) >>> 0;
    return lo + (st / 4294967296) * (hi - lo);
  });
}

const ANG = inputs(4000, -200, 200, 1);
const SMALL = inputs(2000, -1, 1, 2);
const POS = inputs(2000, 1e-3, 100, 3);
const EXPS = inputs(2000, -40, 40, 4);
const POWB = inputs(2000, 0, 3, 5);
const POWE = inputs(2000, 1, 2, 6);

describe('dmath (D-132)', () => {
  it('golden bits: the same on every platform', () => {
    const out = {
      sin: ANG.map(dm.sin),
      cos: ANG.map(dm.cos),
      tan: SMALL.map((x) => dm.tan(x * 1.5)),
      atan: EXPS.map(dm.atan),
      atan2: ANG.map((y, i) => dm.atan2(y, ANG[(i * 7 + 3) % ANG.length])),
      acos: SMALL.map(dm.acos),
      exp: EXPS.map(dm.exp),
      log: POS.map(dm.log),
      pow: POWB.map((b, i) => dm.pow(b, POWE[i])),
      powInt: SMALL.map((b) => dm.pow(b * 4, 3)),
      cbrt: ANG.map(dm.cbrt),
    };
    const digests = Object.fromEntries(Object.entries(out).map(([k, v]) => [k, bitDigest(v)]));
    expect(digests).toMatchInlineSnapshot(`
      {
        "acos": "d6a291b71e2fa7cd",
        "atan": "0f18d5833eca34c7",
        "atan2": "3a9e7b37fb3d5fed",
        "cbrt": "1f75671647db89c4",
        "cos": "27ac061414eef1da",
        "exp": "4ee39bb77e5624f9",
        "log": "f0cb320ad8df8538",
        "pow": "e5e64648b67228f8",
        "powInt": "3e956e1dc72af229",
        "sin": "f1b12d9119c5ad4d",
        "tan": "5b4aef6a264efef8",
      }
    `);
  });

  it('stays within a few ulp of the native functions', () => {
    const worst = (f: (x: number) => number, g: (x: number) => number, xs: number[]): number =>
      xs.reduce((m, x) => Math.max(m, ulps(f(x), g(x))), 0);
    expect(worst(dm.sin, Math.sin, ANG)).toBeLessThanOrEqual(1);
    expect(worst(dm.cos, Math.cos, ANG)).toBeLessThanOrEqual(1);
    expect(worst(dm.sin, Math.sin, inputs(500, -1e5, 1e5, 9))).toBeLessThanOrEqual(1);
    expect(worst(dm.tan, Math.tan, SMALL)).toBeLessThanOrEqual(2);
    expect(worst(dm.atan, Math.atan, EXPS)).toBeLessThanOrEqual(1);
    expect(
      worst(
        (y) => dm.atan2(y, 0.7),
        (y) => Math.atan2(y, 0.7),
        ANG,
      ),
    ).toBeLessThanOrEqual(1);
    expect(
      worst(
        (y) => dm.atan2(y, -3),
        (y) => Math.atan2(y, -3),
        ANG,
      ),
    ).toBeLessThanOrEqual(1);
    expect(worst(dm.acos, Math.acos, SMALL)).toBeLessThanOrEqual(4);
    expect(worst(dm.exp, Math.exp, EXPS)).toBeLessThanOrEqual(1);
    expect(worst(dm.log, Math.log, POS)).toBeLessThanOrEqual(1);
    expect(
      worst(
        (b) => dm.pow(b, 1.3),
        (b) => Math.pow(b, 1.3),
        POWB,
      ),
    ).toBeLessThanOrEqual(16);
    expect(
      worst(
        (b) => dm.pow(b, 3),
        (b) => Math.pow(b, 3),
        ANG,
      ),
    ).toBeLessThanOrEqual(2);
    expect(worst(dm.cbrt, Math.cbrt, ANG)).toBeLessThanOrEqual(1);
  });

  it('edge values', () => {
    expect(dm.sin(0)).toBe(0);
    expect(Object.is(dm.sin(-0), -0)).toBe(true);
    expect(dm.cos(0)).toBe(1);
    expect(dm.sin(Infinity)).toBeNaN();
    expect(dm.exp(0)).toBe(1);
    expect(dm.exp(800)).toBe(Infinity);
    expect(dm.exp(-800)).toBe(0);
    expect(dm.log(1)).toBe(0);
    expect(dm.log(0)).toBe(-Infinity);
    expect(dm.log(-1)).toBeNaN();
    expect(dm.atan2(0, -1)).toBe(Math.PI);
    expect(dm.atan2(-0, -1)).toBe(-Math.PI);
    expect(dm.atan2(1, 0)).toBe(Math.PI / 2);
    expect(dm.acos(1)).toBe(0);
    expect(dm.acos(-1)).toBe(Math.PI);
    expect(dm.pow(2, 10)).toBe(1024);
    expect(dm.pow(9, 0.5)).toBe(3);
    expect(dm.pow(-2, 3)).toBe(-8);
    expect(dm.pow(0, 1.5)).toBe(0);
    expect(dm.cbrt(-27)).toBe(-3);
  });
});
