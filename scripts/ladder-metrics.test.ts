import { describe, expect, it } from 'vitest';
import {
  GRID,
  LADDER_THRESHOLDS,
  compareFrames,
  components,
  cropMap,
  deltaE2000,
  identityMap,
  linearToLab,
  maskClass,
  motionMetric,
  planeMap,
  regionDrift,
  stepFailures,
  type Img,
} from './ladder-metrics.ts';
import { TERRAIN_MASK } from '../src/content/terrain.ts';
import { WATER } from '../src/content/palette.ts';

const W = 480;
const H = 270;
const rgb = (h: string): [number, number, number] => {
  const v = parseInt(h.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
};

/** A W × H RGBA image from a colour function of normalised (u, v). */
function img(f: (u: number, v: number) => [number, number, number]): Img {
  const data = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const c = f((x + 0.5) / W, (y + 0.5) / H);
      data.set([c[0], c[1], c[2], 255], (y * W + x) * 4);
    }
  return { width: W, height: H, channels: 4, data };
}

/** Smooth meadow-like terrain with some low-amplitude texture. */
const meadow = (u: number, v: number): [number, number, number] => [
  110 + 20 * Math.sin(u * 9) + 8 * Math.sin(v * 31),
  170 + 15 * Math.cos(v * 7),
  80 + 10 * Math.sin((u + v) * 13),
];
const landMask = img(() => rgb(TERRAIN_MASK.land));

describe('ladder metrics: colour', () => {
  it('ΔE2000 matches the Sharma et al. reference pairs', () => {
    expect(deltaE2000([50, 2.6772, -79.7751], [50, 0, -82.7485])).toBeCloseTo(2.0425, 3);
    expect(deltaE2000([50, -1, 2], [50, 0, 0])).toBeCloseTo(2.3669, 3);
    expect(deltaE2000([60.2574, -34.0099, 36.2677], [60.4626, -34.1751, 39.4387])).toBeCloseTo(
      1.2644,
      3,
    );
  });
  it('linear white is L 100, a b 0', () => {
    const [L, a, b] = linearToLab(1, 1, 1);
    expect(L).toBeCloseTo(100, 3);
    expect(Math.abs(a) + Math.abs(b)).toBeLessThan(0.01);
  });
});

describe('ladder metrics: mask', () => {
  it('classifies the debug=mask colours', () => {
    expect(maskClass(...rgb(TERRAIN_MASK.land))).toBe(1);
    expect(maskClass(...rgb(TERRAIN_MASK.rock))).toBe(1);
    expect(maskClass(...rgb(WATER.shallow))).toBe(0);
    expect(maskClass(0, 0, 0)).toBe(0);
    expect(maskClass(255, 255, 255)).toBe(0);
    expect(maskClass(200, 90, 70)).toBe(2);
  });
});

describe('ladder metrics: steps', () => {
  it('identical frames score 0 and pass', () => {
    const a = img(meadow);
    const m = compareFrames(a, landMask, a, landMask, identityMap);
    expect(m.compared).toBe(GRID.w * GRID.h);
    expect(m.mean).toBe(0);
    expect(m.p95).toBe(0);
    expect(m.blob).toBe(0);
    expect(m.iou).toBe(1);
    expect(stepFailures(m, false)).toEqual([]);
    expect(stepFailures(m, true)).toEqual([]);
  });

  it('a centre crop of a scaled scene matches the zoomed frame', () => {
    const r = 0.7;
    const far = img(meadow);
    // the near frame is the far frame's centre r, magnified
    const near = img((u, v) => meadow(0.5 + (u - 0.5) * r, 0.5 + (v - 0.5) * r));
    const m = compareFrames(near, landMask, far, landMask, cropMap(r));
    expect(m.mean).toBeLessThan(0.5);
    expect(stepFailures(m, false)).toEqual([]);
  });

  it('flags a hue-shifted patch (patchwork)', () => {
    const a = img(meadow);
    // a quarter of the frame turns from green to ochre
    const b = img((u, v) => (u < 0.5 && v < 0.5 ? [200, 160, 70] : meadow(u, v)));
    const m = compareFrames(b, landMask, a, landMask, identityMap);
    expect(m.mean).toBeGreaterThan(LADDER_THRESHOLDS.stepMean);
    expect(m.blob).toBeGreaterThan(0.2);
    expect(stepFailures(m, false).length).toBeGreaterThan(0);
  });

  it('flags an inserted blob (a building appearing) even when the mean is low', () => {
    const a = img(meadow);
    const inBlob = (u: number, v: number): boolean => Math.hypot(u - 0.6, v - 0.4) < 0.08;
    const b = img((u, v) => (inBlob(u, v) ? [70, 110, 220] : meadow(u, v)));
    const bMask = img((u, v) => (inBlob(u, v) ? [70, 110, 220] : rgb(TERRAIN_MASK.land)));
    const m = compareFrames(b, bMask, a, landMask, identityMap);
    expect(m.mean).toBeLessThan(LADDER_THRESHOLDS.stepMean);
    expect(m.blob).toBeGreaterThan(LADDER_THRESHOLDS.stepBlob);
    expect(stepFailures(m, false).some((f) => f.startsWith('blob'))).toBe(true);
    expect(m.structIou).toBe(0);
  });

  it('does not judge a step with too little land', () => {
    const a = img(meadow);
    const water = img((u) => (u < 0.03 ? rgb(TERRAIN_MASK.land) : rgb(WATER.deep)));
    const m = compareFrames(a, water, a, water, identityMap);
    expect(m.judged).toBe(false);
    expect(stepFailures(m, false)).toEqual([]);
  });

  it('island drift compares the same region: 0 for a zoom, flagged for a palette shift', () => {
    const r = 0.7;
    const far = img(meadow);
    const near = img((u, v) => meadow(0.5 + (u - 0.5) * r, 0.5 + (v - 0.5) * r));
    expect(regionDrift(near, landMask, far, landMask, cropMap(r))).toBeLessThan(0.5);
    const dull = img((u, v) => meadow(u, v).map((c) => c * 0.8) as [number, number, number]);
    expect(regionDrift(dull, landMask, far, landMask, identityMap)).toBeGreaterThan(
      LADDER_THRESHOLDS.drift,
    );
    const water = img(() => rgb(WATER.deep));
    expect(regionDrift(far, water, far, water, identityMap)).toBeNull();
  });
});

describe('ladder metrics: mapping', () => {
  it('the plane map is the identity at equal distance and a centre zoom at the centre', () => {
    const v = { fovDeg: 35, aspect: 16 / 9, pitchDeg: 48, dist: 100 };
    const same = planeMap(v, v);
    for (const [u, w] of [
      [0.1, 0.2],
      [0.5, 0.5],
      [0.9, 0.95],
    ]) {
      const [a, b] = same(u, w);
      expect(a).toBeCloseTo(u, 9);
      expect(b).toBeCloseTo(w, 9);
    }
    const zoom = planeMap(v, { ...v, dist: 100 / 0.7 });
    const [cu, cv] = zoom(0.5, 0.5);
    expect(cu).toBeCloseTo(0.5, 9);
    expect(cv).toBeCloseTo(0.5, 9);
    // perspective: the near frame's top edge (farther ground) reaches higher in the far frame than
    // a plain crop says, its bottom edge stays nearer the centre
    expect(zoom(0.5, 0)[1]).toBeLessThan(cropMap(0.7)(0.5, 0)[1] - 0.02);
    expect(zoom(0.5, 1)[1]).toBeLessThan(cropMap(0.7)(0.5, 1)[1]);
  });
});

describe('components', () => {
  it('8-connected sizes, largest first', () => {
    // 4 × 3: a diagonal pair (one component) and a single cell
    const on = [true, false, false, true, false, true, false, false, false, false, false, false];
    expect(components(on, 4, 3)).toEqual([2, 1]);
  });
});

describe('motion metric', () => {
  it('counts changed pixels and moving clusters inside the crop', () => {
    const a = img(() => [100, 100, 100]);
    const dots = [
      [0.2, 0.3],
      [0.4, 0.6],
      [0.7, 0.2],
      [0.8, 0.8],
      [0.3, 0.8],
    ];
    const b = img((u, v) =>
      dots.some(([x, y]) => Math.abs(u - x) < 0.01 && Math.abs(v - y) < 0.02)
        ? [200, 50, 50]
        : // one-pixel sparkle that must not count as a cluster
          Math.abs(u - 0.55) < 0.001 && Math.abs(v - 0.5) < 0.002
          ? [255, 255, 255]
          : [100, 100, 100],
    );
    const m = motionMetric(a, b);
    expect(m.clusters).toBe(5);
    expect(m.changedFrac).toBeGreaterThan(0);
    expect(motionMetric(a, a)).toEqual({ changedFrac: 0, clusters: 0, largest: 0 });
    // the crop keeps only the left half: 3 dots
    expect(motionMetric(a, b, [0, 0, 0.5, 1]).clusters).toBe(3);
  });
});
