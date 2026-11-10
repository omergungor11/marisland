import { describe, expect, it } from 'vitest';
import { LUNA_MOTION as M } from '../content/life-luna.ts';
import { LUNA_KIT } from '../content/themes/marketing-luna.ts';
import { LUNA_LOOK } from '../content/themes/marketing-luna-look.ts';
import { newCoasterSample, sampleCoaster } from '../world/coaster-spline.ts';
import { generateWorld, type WorldData } from '../world/index.ts';
import {
  boatCentres,
  boatPoses,
  carouselTurns,
  dropHeight,
  frameToDeck,
  frameToWorld,
  makeBoatRig,
  makeTrainClock,
  newBoatPoses,
  ridePhase,
  spinShare,
  spinTurns,
  trainCentres,
  type LunaFrame,
} from './luna-motion.ts';

/** TASK-672: the park's motion functions are bounded, periodic or deterministic, and stay on their tracks. */
describe('swing and carousel turns', () => {
  const S = M.swing;
  it('the swing rotor turns monotonically, a whole number of extra turns per cycle', () => {
    let prev = spinTurns(0, S);
    for (let t = 0.05; t < S.cycle * 3; t += 0.05) {
      const v = spinTurns(t, S);
      expect(v).toBeGreaterThanOrEqual(prev - 1e-9);
      // never faster than `run` (continuity: no jump at a segment seam)
      expect(v - prev).toBeLessThanOrEqual(S.run * 0.05 + 1e-6);
      prev = v;
    }
    const per = spinTurns(S.cycle, S) - spinTurns(0, S);
    expect(spinTurns(S.cycle * 2 + 3.3, S) - spinTurns(S.cycle + 3.3, S)).toBeCloseTo(per, 9);
  });

  it('the share runs 0 → 1 → 0 and the speed is the share between rest and run', () => {
    expect(spinShare(0, S)).toBe(0);
    expect(spinShare(S.up + 1, S)).toBe(1);
    expect(spinShare(S.cycle - 0.01, S)).toBe(0);
    const dt = 1e-4;
    for (const c of [1, 3.5, S.up + 4, S.up + S.hold + 4, S.cycle - 2]) {
      const rate = (spinTurns(c + dt, S) - spinTurns(c, S)) / dt;
      expect(rate).toBeCloseTo(S.rest + (S.run - S.rest) * spinShare(c, S), 2);
    }
  });

  it('the carousel turns steadily, slowly, with a gust of at most `gust` share', () => {
    let prev = carouselTurns(0);
    expect(prev).toBe(0);
    for (let t = 0.1; t < 120; t += 0.1) {
      const v = carouselTurns(t);
      const rate = (v - prev) / 0.1;
      expect(rate).toBeGreaterThan(M.carousel.rev * (1 - M.carousel.gust) - 1e-3);
      expect(rate).toBeLessThan(M.carousel.rev * (1 + M.carousel.gust) + 1e-3);
      prev = v;
    }
  });

  it('every ride has its own period and phase', () => {
    const periods = new Set([M.swing.cycle, M.drop.cycle, M.carousel.gustT, 36]);
    expect(periods.size).toBe(4);
    const ph = [0, 1, 2, 3].map((r) => ridePhase(1001, r));
    expect(new Set(ph).size).toBe(4);
    expect(ph.every((p) => p >= 0 && p < 1)).toBe(true);
    expect(ridePhase(1001, 0)).toBe(ridePhase(1001, 0));
  });
});

describe('drop tower gondola', () => {
  const [lo, hi] = [LUNA_LOOK.drop.lo, LUNA_LOOK.drop.hi];
  const D = M.drop;
  const top = D.climb + D.hold;
  const at = (t: number): number => dropHeight(t, lo, hi);

  it('stays between the bottom and the top (plus the small anticipation lift)', () => {
    for (let t = 0; t < D.cycle * 3; t += 0.01) {
      const y = at(t);
      expect(y).toBeGreaterThanOrEqual(lo - 1e-9);
      expect(y).toBeLessThanOrEqual(hi + D.anticipate + D.shiver.amp + 1e-9);
    }
  });

  it('is periodic', () => {
    for (const t of [0.4, 5, 9.7, 11.1, 12.3]) expect(at(t + D.cycle)).toBeCloseTo(at(t), 9);
  });

  it('climbs slowly (monotone, slower than the fall), pauses at the top, then drops fast', () => {
    let prev = at(0);
    let maxClimb = 0;
    for (let t = 0.01; t <= D.climb; t += 0.01) {
      const y = at(t);
      expect(y).toBeGreaterThanOrEqual(prev - 1e-9);
      maxClimb = Math.max(maxClimb, (y - prev) / 0.01);
      prev = y;
    }
    expect(at(D.climb)).toBeCloseTo(hi, 6);
    // the hold stays within the shiver + anticipation of the top
    for (let t = D.climb; t < top; t += 0.02) expect(Math.abs(at(t) - hi)).toBeLessThan(0.2);
    const fall = (at(top + D.fall * 0.99) - at(top + D.fall * 0.9)) / (D.fall * 0.09);
    expect(-fall).toBeGreaterThan(maxClimb * 3);
    expect(at(top + D.fall)).toBeCloseTo(lo, 6);
  });

  it('bounces softly after landing and settles', () => {
    const land = top + D.fall;
    let peak = 0;
    for (let t = land; t < land + 2; t += 0.01) peak = Math.max(peak, at(t) - lo);
    expect(peak).toBeGreaterThan(0.1);
    expect(peak).toBeLessThan(0.5);
    expect(at(land + 2.5) - lo).toBeLessThan(0.02);
    // continuous across the cycle seam
    expect(Math.abs(at(D.cycle - 1e-6) - at(0))).toBeLessThan(1e-3);
  });

  it('is continuous except at the landing (no teleport between frames)', () => {
    let prev = at(0);
    for (let t = 1 / 60; t < D.cycle; t += 1 / 60) {
      const y = at(t);
      // 11.4 u/s is the fastest fall; a frame covers at most ~0.2 u
      expect(Math.abs(y - prev)).toBeLessThan(0.3);
      prev = y;
    }
  });
});

/** Seed 1001 and the first mirrored park we find. */
const worlds = new Map<number, WorldData>();
const world = (seed: number): WorldData => {
  let w = worlds.get(seed);
  if (!w) worlds.set(seed, (w = generateWorld(seed)));
  return w;
};
function frameOf(seed: number): {
  frame: LunaFrame;
  A: WorldData['islands'][number]['anchors'];
} | null {
  const isl = world(seed).islands.find((i) => i.anchors.lunaDeck);
  if (!isl) return null;
  const d = isl.anchors.lunaDeck;
  return {
    A: isl.anchors,
    frame: {
      cx: d.x,
      cz: d.z,
      ux: Math.cos(d.rotY),
      uz: Math.sin(d.rotY),
      mx: isl.anchors.lunaDeckFrame.x < 0 ? -1 : 1,
    },
  };
}
const SEEDS = [1001, 1, 42, 2024, 1263, 1526, 1789];

describe('bumper boats', () => {
  it('stay in the pool, apart from each other, at any time, on every seed (mirrored included)', () => {
    let mirrored = 0;
    let checked = 0;
    for (const seed of SEEDS) {
      const f = frameOf(seed);
      if (!f) continue;
      checked++;
      if (f.frame.mx < 0) mirrored++;
      const { A, frame } = f;
      const n = Array.from({ length: 9 }, (_, i) => i).findIndex((i) => !A[`lunaBoat${i}`]);
      const starts = Array.from({ length: n }, (_, i) =>
        frameToDeck(frame, A[`lunaBoat${i}`].x, A[`lunaBoat${i}`].z),
      );
      const rig = makeBoatRig(seed, frame, A.lunaPoolSize.x, A.lunaPoolSize.z, starts);
      const xs = new Float64Array(n);
      const zs = new Float64Array(n);
      let minGap = Infinity;
      for (let t = 0; t < 900; t += 0.37) {
        boatCentres(rig, t, xs, zs);
        for (let i = 0; i < n; i++) {
          expect(Math.abs(xs[i])).toBeLessThanOrEqual(
            A.lunaPoolSize.x / 2 - M.boat.r - M.boat.margin + 1e-9,
          );
          expect(Math.abs(zs[i])).toBeLessThanOrEqual(
            A.lunaPoolSize.z / 2 - M.boat.r - M.boat.margin + 1e-9,
          );
          for (let j = i + 1; j < n; j++)
            minGap = Math.min(minGap, Math.hypot(xs[i] - xs[j], zs[i] - zs[j]));
        }
      }
      // boats are 2r wide: they may kiss (bump) but never overlap by more than a sliver
      expect(minGap, `seed ${seed}`).toBeGreaterThan(2 * M.boat.r * 0.9);
    }
    expect(checked).toBeGreaterThanOrEqual(4);
    expect(mirrored).toBeGreaterThanOrEqual(1);
    expect(mirrored).toBeLessThan(checked);
  }, 60_000);

  it('start on their spots, drift (move, turn) and are pure functions of time', () => {
    const f = frameOf(1001)!;
    const { A, frame } = f;
    const n = 5;
    const starts = Array.from({ length: n }, (_, i) =>
      frameToDeck(frame, A[`lunaBoat${i}`].x, A[`lunaBoat${i}`].z),
    );
    const rig = makeBoatRig(1001, frame, A.lunaPoolSize.x, A.lunaPoolSize.z, starts);
    const p0 = newBoatPoses(n);
    const p1 = newBoatPoses(n);
    const p2 = newBoatPoses(n);
    boatPoses(rig, 0, p0);
    boatPoses(rig, 7.3, p1);
    boatPoses(rig, 7.3, p2);
    expect(p1).toEqual(p2);
    let moved = 0;
    let turned = 0;
    for (let i = 0; i < n; i++) {
      // the start spot (pushes aside, so not exact)
      expect(Math.hypot(p0[i].x - A[`lunaBoat${i}`].x, p0[i].z - A[`lunaBoat${i}`].z)).toBeLessThan(
        1.6,
      );
      if (Math.hypot(p1[i].x - p0[i].x, p1[i].z - p0[i].z) > 1) moved++;
      if (Math.abs(p1[i].yaw - p0[i].yaw) > 0.2) turned++;
      expect(Math.abs(p1[i].y)).toBeLessThan(0.05);
      expect(Math.abs(p1[i].roll)).toBeLessThan(0.06);
    }
    expect(moved).toBeGreaterThanOrEqual(4);
    expect(turned).toBeGreaterThanOrEqual(3);
    // reduced motion shrinks bob and roll
    const calm = newBoatPoses(n);
    boatPoses(rig, 7.3, calm, 0.3);
    expect(Math.abs(calm[0].roll)).toBeLessThanOrEqual(Math.abs(p1[0].roll) + 1e-12);
  });

  it('deck frame <-> world round-trips (mirrored too)', () => {
    const out = { x: 0, z: 0 };
    for (const mx of [1, -1] as const) {
      const fr: LunaFrame = { cx: 10, cz: -4, ux: Math.cos(0.7), uz: Math.sin(0.7), mx };
      frameToWorld(fr, 3.2, -1.5, out);
      const d = frameToDeck(fr, out.x, out.z);
      expect(d.x).toBeCloseTo(3.2, 9);
      expect(d.z).toBeCloseTo(-1.5, 9);
    }
  });
});

describe('worm train', () => {
  for (const length of LUNA_KIT.coasterLengths) {
    it(`loop ${length}: slower on the hills, a whole lap in a few seconds, cars follow the spline`, () => {
      const clock = makeTrainClock(length);
      expect(clock.lap).toBeGreaterThan(10);
      expect(clock.lap).toBeLessThan(40);
      // monotone arc (mod lap) and periodic
      let prev = clock.at(0);
      let wraps = 0;
      for (let t = 0.1; t < clock.lap * 2; t += 0.1) {
        const s = clock.at(t);
        if (s < prev) wraps++;
        else expect(s - prev).toBeLessThan(M.train.fast * 0.1 * 1.1);
        prev = s;
      }
      expect(wraps).toBe(1);
      expect(clock.at(5.5 + clock.lap)).toBeCloseTo(clock.at(5.5), 6);
      // speed vs height: the slowest stretch is high, the fastest low
      const sp = newCoasterSample();
      let slow = { v: Infinity, y: 0 };
      let fast = { v: 0, y: 0 };
      for (let t = 0; t < clock.lap; t += 0.2) {
        const a = clock.at(t);
        const b = clock.at(t + 0.2);
        const v = ((((b - a) % clock.sp.length) + clock.sp.length) % clock.sp.length) / 0.2;
        const y = sampleCoaster(clock.sp, a, sp).pos[1];
        if (v < slow.v) slow = { v, y };
        if (v > fast.v) fast = { v, y };
      }
      expect(slow.y).toBeGreaterThan(fast.y + 1);
      expect(fast.v).toBeGreaterThan(slow.v * 1.8);
      // cars: on the rail (spline), one length + gap apart along the arc
      const out = new Float64Array(LUNA_KIT.train.cars + 1);
      trainCentres(clock.at(3), out);
      const T = LUNA_LOOK.train;
      expect(out[0] - out[1]).toBeCloseTo(T.head.len / 2 + T.gap + T.car.len / 2, 9);
      expect(out[1] - out[2]).toBeCloseTo(T.car.len + T.gap, 9);
      for (const s of out) {
        const q = sampleCoaster(clock.sp, s, sp);
        expect(q.pos[1]).toBeGreaterThan(LUNA_LOOK.coaster.base - 0.01);
        expect(Math.abs(q.pos[2])).toBeLessThanOrEqual(LUNA_LOOK.coaster.R + 0.01);
        expect(Math.abs(q.pos[0])).toBeLessThanOrEqual(length / 2 + 0.01);
      }
    });
  }
});
