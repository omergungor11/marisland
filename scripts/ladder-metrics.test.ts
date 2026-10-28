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
  liveFailures,
  motionMetric,
  parallaxRatio,
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

  it('a per-step blob override (D-100) only applies to its own step key', () => {
    const a = img(meadow);
    const m = { ...compareFrames(a, landMask, a, landMask, identityMap), blob: 0.017 };
    expect(stepFailures(m, false)).toEqual(['blob 1.7% > 1.5%']);
    expect(stepFailures(m, false, 'L-marketing 60→42')).toEqual([]);
    expect(stepFailures(m, false, 'L-marketing 42→30')).toEqual(['blob 1.7% > 1.5%']);
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

  describe('pair IoU parallax corridor (TASK-487)', () => {
    // L-pairs-marketing 42.4 → 37.6: a cliff band at the top, sea below, a thin mast at the
    // lower right that the far frame shows nearer the centre (parallax off the target plane)
    const roof: [number, number, number] = [238, 112, 79];
    const water = rgb(WATER.deep);
    const land = rgb(TERRAIN_MASK.land);
    const f = parallaxRatio(
      { fovDeg: 35, aspect: 16 / 9, pitchDeg: 48, dist: 37.6 },
      { fovDeg: 35, aspect: 16 / 9, pitchDeg: 48, dist: 42.4 },
    );
    const mast = (u: number, v: number): boolean => Math.abs(u - 0.8) < 0.02 && v > 0.55 && v < 0.9;
    // the far frame's view of a shape: scaled toward the centre by t
    const toward =
      (shape: (u: number, v: number) => boolean, t: number) =>
      (u: number, v: number): boolean =>
        shape(0.5 + (u - 0.5) / t, 0.5 + (v - 0.5) / t);
    const scene = (...props: ((u: number, v: number) => boolean)[]): Img =>
      img((u, v) => (props.some((p) => p(u, v)) ? roof : v < 0.12 ? land : water));
    const pair = (
      near: Img,
      far: Img,
      parallax: number,
      slack: number = LADDER_THRESHOLDS.slack,
    ): ReturnType<typeof compareFrames> => {
      const flat = img(meadow);
      return compareFrames(flat, near, flat, far, identityMap, slack, parallax);
    };
    // the far frame's mast at the corridor's inner edge
    const slid = (): Img => scene(toward(mast, f + 0.005));

    it('a tall prop sliding along its radial corridor is not a footprint change', () => {
      expect(f).toBeGreaterThan(0.85);
      expect(f).toBeLessThan(0.95);
      const near = scene(mast);
      const far = slid();
      // the plain plane registration (no slack, no corridor) misses, as in the M22 report (0.915)
      expect(pair(near, far, 1, 0).iou).toBeLessThan(LADDER_THRESHOLDS.pairIou);
      const m = pair(near, far, f);
      expect(m.parallaxCells).toBeGreaterThan(0);
      expect(m.iou).toBeGreaterThan(0.99);
      expect(stepFailures(m, true)).toEqual([]);
    });

    it('a prop appearing over the water between the pair still fails (a real pop)', () => {
      const boat = (u: number, v: number): boolean => Math.hypot(u - 0.25, v - 0.7) < 0.07;
      const m = pair(scene(mast, boat), slid(), f);
      expect(m.iou).toBeLessThan(LADDER_THRESHOLDS.pairIou);
      expect(stepFailures(m, true).some((s) => s.startsWith('IoU'))).toBe(true);
      // and the other way round: a prop that vanishes
      expect(pair(scene(mast), scene(toward(mast, f + 0.005), boat), f).iou).toBeLessThan(
        LADDER_THRESHOLDS.pairIou,
      );
    });

    it('the corridor is radial, not an isotropic slack: a sideways slide stays a miss', () => {
      const sideways = (u: number, v: number): boolean => mast(u + 0.08, v);
      expect(pair(scene(mast), scene(sideways), f).iou).toBeLessThan(LADDER_THRESHOLDS.pairIou);
    });

    it('a building appearing between rungs still fails the step with the corridor on', () => {
      const a = img(meadow);
      const inBlob = (u: number, v: number): boolean => Math.hypot(u - 0.6, v - 0.4) < 0.08;
      const b = img((u, v) => (inBlob(u, v) ? [70, 110, 220] : meadow(u, v)));
      const bMask = img((u, v) => (inBlob(u, v) ? [70, 110, 220] : land));
      const m = compareFrames(b, bMask, a, landMask, identityMap, LADDER_THRESHOLDS.slack, 0.5);
      expect(stepFailures(m, false).some((s) => s.startsWith('blob'))).toBe(true);
    });
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

  it('island drift leaves a cast-shadow patch out, but not a region-wide darkening', () => {
    const far = img(meadow);
    const shade = (u: number, v: number): [number, number, number] =>
      u < 0.4 && v < 0.4
        ? (meadow(u, v).map((c) => c * 0.3) as [number, number, number])
        : meadow(u, v);
    expect(regionDrift(img(shade), landMask, far, landMask, identityMap)).toBeLessThan(0.5);
    const dark = img((u, v) => meadow(u, v).map((c) => c * 0.3) as [number, number, number]);
    expect(regionDrift(dark, landMask, far, landMask, identityMap)).toBeGreaterThan(
      LADDER_THRESHOLDS.drift,
    );
  });

  it('island drift leaves parallax cells (structure over reference ground) out, not a region-wide one', () => {
    const far = img(meadow);
    const roof: [number, number, number] = [238, 112, 79];
    const view = (inRoof: (u: number, v: number) => boolean): [Img, Img] => [
      img((u, v) => (inRoof(u, v) ? roof : meadow(u, v))),
      img((u, v) => (inRoof(u, v) ? roof : rgb(TERRAIN_MASK.land))),
    ];
    // a roof leaning over a fifth of the ground (near perspective)
    const [lean, leanMask] = view((u) => u < 0.2);
    expect(regionDrift(lean, leanMask, far, landMask, identityMap)).toBeLessThan(0.5);
    // a structure over most of the region stays judged
    const [cover, coverMask] = view((u) => u < 0.6);
    expect(regionDrift(cover, coverMask, far, landMask, identityMap)).toBeGreaterThan(
      LADDER_THRESHOLDS.drift,
    );
    // TASK-487: a frame-filling row (40 % of the frame) the reference does not have is the
    // Design glasshouse pop (tier 2, absent at 170 u), so a "structure fills > 35 % of the frame →
    // keep the class filter" rule would hide it; it stays judged
    const [row, rowMask] = view((u, v) => u < 0.5 && v > 0.2);
    expect(regionDrift(row, rowMask, far, landMask, identityMap)).toBeGreaterThan(
      LADDER_THRESHOLDS.drift,
    );
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

  it('parallaxRatio bounds where the far frame shows a point h above the plane (TASK-487)', () => {
    const near = { fovDeg: 35, aspect: 16 / 9, pitchDeg: 48, dist: 37.6 };
    const far = { ...near, dist: 42.4 };
    const h = 12;
    const f = parallaxRatio(near, far, h);
    expect(parallaxRatio(near, near, h)).toBe(1);
    expect(parallaxRatio(near, far, 0)).toBeCloseTo(1, 9);
    expect(parallaxRatio(near, far, 6)).toBeGreaterThan(f);
    // brute force: the point h above the plane on the near ray of pixel (u, v), projected into
    // the far camera and pulled back onto the near grid along its radial line (planeMap keeps
    // radial lines through the centre); its radius ratio stays within [f, 1]
    const p = (48 * Math.PI) / 180;
    const s = Math.sin(p);
    const c = Math.cos(p);
    const th = Math.tan((35 * Math.PI) / 360);
    const map = planeMap(near, far);
    const rad = ([u, v]: [number, number]): number => Math.hypot((u - 0.5) * near.aspect, v - 0.5);
    let worst = 1;
    for (const [u, v] of [
      [0.5, 1],
      [0.9, 0.95],
      [0.05, 0.9],
      [0.95, 0.5],
      [0.8, 0.2],
    ] as [number, number][]) {
      const x = (2 * u - 1) * th * near.aspect;
      const y = (1 - 2 * v) * th;
      const dy = -s + y * c;
      const t = (near.dist * s - h) / -dy; // down from the camera height to h
      const P = [x * t, near.dist * s + dy * t, near.dist * c + (-c - y * s) * t];
      const ry = P[1] - far.dist * s;
      const rz = P[2] - far.dist * c;
      const depth = -s * ry - c * rz;
      const q: [number, number] = [
        (P[0] / depth / (th * far.aspect) + 1) / 2,
        (1 - (c * ry - s * rz) / depth / th) / 2,
      ];
      // pull q back: the near-grid point on the same radial line that planeMap sends to q
      let lo = 0;
      let hi = 1;
      for (let i = 0; i < 60; i++) {
        const m = (lo + hi) / 2;
        const g = map(0.5 + (u - 0.5) * m, 0.5 + (v - 0.5) * m);
        if (rad(g) < rad(q)) lo = m;
        else hi = m;
      }
      expect(lo).toBeLessThan(1);
      worst = Math.min(worst, lo);
    }
    expect(worst).toBeCloseTo(f, 6);
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
    // mask: the left half is water → its dots and pixels do not count; the land half's 2 dots do
    const mask = img((u) => (u < 0.5 ? rgb(WATER.mid) : rgb(TERRAIN_MASK.land)));
    const masked = motionMetric(a, b, undefined, undefined, undefined, mask);
    expect(masked.clusters).toBe(2);
    const right = motionMetric(a, b, [0.5, 0, 1, 1]);
    expect(masked.changedFrac).toBeCloseTo(right.changedFrac, 3);
  });

  it('liveFailures: M14c thresholds', () => {
    expect(liveFailures({ changedFrac: 0.04, clusters: 5, largest: 10 })).toEqual([]);
    expect(liveFailures({ changedFrac: 0.02, clusters: 4, largest: 10 })).toHaveLength(2);
  });
});
