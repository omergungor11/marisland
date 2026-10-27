import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { Scope } from '../core/scope.ts';
import { PROP_DEFS } from '../content/props.ts';
import { CULTURE_CLOCK } from '../content/cultures/rhythm.ts';
import { QA_PROVING, QA_PROVING_MOTION as M } from '../content/themes/qa-proving.ts';
import { createEnvState, sampleEnv } from '../env/env-state.ts';
import { cartFrame, newCartFrame } from '../geo/themes/qa-track.ts';
import { CRASH_RAMP_TOP, crashPath, dummyPose, landingSquash } from '../geo/themes/qa-crash.ts';
import { generateWorld } from '../world/index.ts';
import { THEME_IDS, type ThemeId } from '../world/types.ts';
import { PART } from './culture-mover-parts.ts';
import { createCultureMovers } from './culture-movers.ts';
import { dropState, fanSpinExtra, type DropState } from './qa-proving-motion.ts';
import { appendSettlementProps } from './props/settlement-props.ts';

const K = QA_PROVING.tower.crate;
const state = (): DropState => ({ y: 0, squash: 0, since: -1, lamp: 0 });

describe('drop tower crate (TASK-501)', () => {
  it('rests, lifts to the top, hangs, falls and lands on the pad every cycle', () => {
    const D = M.drop;
    const s = state();
    // cycle start (phase shifts it): the crate rests on the pad
    dropState(-D.phase, 1, s);
    expect(s.y).toBeCloseTo(K.rest, 6);
    expect(s.squash).toBe(0);
    let top = 0;
    let maxY = 0;
    let lamp = 0;
    let squash = 0;
    for (let t = 0; t < D.period; t += 0.02) {
      dropState(t - D.phase, 1, s);
      expect(Number.isFinite(s.y)).toBe(true);
      expect(s.y).toBeGreaterThan(K.rest - 0.2);
      expect(s.y).toBeLessThan(K.top + 0.2);
      maxY = Math.max(maxY, s.y);
      top = Math.max(top, s.y >= K.top - 0.1 ? 1 : 0);
      lamp = Math.max(lamp, s.lamp);
      squash = Math.max(squash, s.squash);
    }
    expect(maxY).toBeGreaterThan(K.top - 0.1);
    expect(lamp).toBeGreaterThan(0.9);
    expect(squash).toBeGreaterThan(M.drop.squashDepth * 0.5);
  });

  it('falls faster than it rises, with free-fall acceleration (monotonic descent)', () => {
    const D = M.drop;
    const tFall = D.rest + D.lift + D.hang - D.phase;
    const s = state();
    let prev = K.top + 1;
    let lastDrop = 0;
    for (let u = 0; u < 1.2; u += 0.05) {
      dropState(tFall + u, 1, s);
      if (s.y < K.rest + 0.01) break;
      expect(s.y).toBeLessThanOrEqual(prev + 1e-9);
      lastDrop = prev - s.y;
      prev = s.y;
    }
    expect(lastDrop).toBeGreaterThan(0.3);
  });

  it('is a pure function of time and reduced motion keeps the cycle inside its period', () => {
    const a = state();
    const b = state();
    dropState(137.77, 1, a);
    dropState(137.77, 1, b);
    expect(a).toEqual(b);
    // reduced motion: the lift and the fall are slower, the crate still lands before the cycle ends
    const D = M.drop;
    const s = state();
    let landed = false;
    for (let t = 0; t < D.period; t += 0.05) {
      dropState(t - D.phase, 0, s);
      if (s.since >= 0) landed = true;
      expect(Math.abs(s.squash)).toBe(0);
    }
    expect(landed).toBe(true);
  });
});

describe('test fan siren speed-up (TASK-501)', () => {
  const SPH = CULTURE_CLOCK.secondsPerHour;
  it('adds whole turns inside the 12:00 siren test and nothing outside it', () => {
    const t0 = 12 * SPH;
    expect(fanSpinExtra(t0 - 5)).toBe(0);
    expect(fanSpinExtra(t0)).toBeCloseTo(0, 9);
    const end = fanSpinExtra(t0 + 9.999);
    expect(end / (2 * Math.PI)).toBeCloseTo(M.fan.revs, 2);
    expect(fanSpinExtra(t0 + 10.5)).toBe(0);
    // continuous and never reversing
    let prev = 0;
    for (let u = 0; u < 10; u += 0.05) {
      const v = fanSpinExtra(t0 + u);
      expect(v).toBeGreaterThanOrEqual(prev - 1e-9);
      expect(v - prev).toBeLessThan(0.5);
      prev = v;
    }
    // speeds up: mid-ritual turns at least 3 x the base rate (base ~ 1.05 rad/s)
    const rate = (fanSpinExtra(t0 + 5.1) - fanSpinExtra(t0 + 5)) / 0.1;
    expect(rate).toBeGreaterThan(3);
  });
});

describe('figure-8 crash track (TASK-501)', () => {
  const path = crashPath();
  it('is a closed figure-8 that fits the smallest stunt yard (9 x 18)', () => {
    expect(path.halfX).toBeLessThan(4.5 - 0.9);
    expect(path.halfZ).toBeLessThan(9 - 0.9);
    const n = path.p.length;
    const a = path.p[0];
    const b = path.p[n - 1];
    expect(Math.hypot(a[0] - b[0], a[2] - b[2])).toBeLessThan(0.5);
    // it crosses itself: two samples of the centreline within 0.4 u of each other, far apart in arc
    let crossing = 0;
    for (let i = 0; i < n; i++)
      for (let j = i + n / 6; j < n; j++)
        if (Math.hypot(path.p[i][0] - path.p[j][0], path.p[i][2] - path.p[j][2]) < 0.3) crossing++;
    expect(crossing).toBeGreaterThan(0);
  });
  it('climbs a ramp, flies a parabola over the crossing and lands', () => {
    const n = path.p.length;
    const air = path.air.filter(Boolean).length;
    expect(air).toBeGreaterThan(8);
    const maxY = Math.max(...path.p.map((p) => p[1]));
    expect(maxY).toBeGreaterThan(CRASH_RAMP_TOP);
    expect(Math.min(...path.p.map((p) => p[1]))).toBeGreaterThanOrEqual(0);
    for (let i = 0; i < n; i++)
      expect(Math.abs(path.p[(i + 1) % n][1] - path.p[i][1])).toBeLessThan(0.25);
    // the airborne cart is above the strand it crosses
    const peak = path.p.reduce((m, p) => (p[1] > m[1] ? p : m), path.p[0]);
    let under = Infinity;
    for (const p of path.p)
      if (p[1] < 0.01) under = Math.min(under, Math.hypot(p[0] - peak[0], p[2] - peak[2]));
    expect(under).toBeLessThan(0.6);
    expect(path.land).toBeGreaterThan(path.launch);
    expect(path.lap).toBeGreaterThan(path.land);
  });
  it('cart + dummy poses are deterministic, finite and unit-framed', () => {
    const fr = newCartFrame();
    const dp = { roll: 0, pitch: 0, hop: 0 };
    let sq = 0;
    for (let t = 0; t < path.lap * 2; t += 0.1) {
      cartFrame(path, t, fr);
      expect([...fr.p, ...fr.x, ...fr.y, ...fr.z].every(Number.isFinite)).toBe(true);
      expect(Math.hypot(...fr.z)).toBeCloseTo(1, 5);
      dummyPose(path, t, 1, dp);
      expect([dp.roll, dp.pitch, dp.hop].every(Number.isFinite)).toBe(true);
      expect(Math.abs(dp.roll)).toBeLessThan(1);
      sq = Math.max(sq, landingSquash(path, t));
    }
    expect(sq).toBeGreaterThan(0.1);
    // reduced motion calms the dummy
    dummyPose(path, path.land + 0.2, 0, dp);
    expect(Math.abs(dp.roll)).toBe(0);
    expect(Math.abs(dp.pitch)).toBe(0);
    expect(Math.abs(landingSquash(path, path.land + 0.1, 0))).toBe(0);
  });
});

describe('proving grounds scenes (TASK-501)', () => {
  const world = generateWorld(1001);
  const { props } = appendSettlementProps(world);
  const view = createCultureMovers(props, world, new Scope('proving'));
  const festival = {} as Record<ThemeId, null>;
  for (const t of THEME_IDS) festival[t] = null;
  const e = createEnvState();
  sampleEnv(12, e);

  function find(id: string, variant: number): THREE.Vector3 | null {
    for (let i = 0; i < props.count; i++)
      if (PROP_DEFS[props.defId[i]].id === id && props.variant[i] === variant)
        return new THREE.Vector3(props.x[i], props.y[i] + 2, props.z[i]);
    return null;
  }
  const count = (kind: number): number => view.meshes[kind].count;

  it('the empty-cradle tower carries a crate that moves; the crash track a riding dummy', () => {
    const tower = find('dropTower', 1);
    const track = find('testTrack', 1);
    expect(tower).not.toBeNull();
    expect(track).not.toBeNull();
    view.update(0, 12, e, tower!, { festival });
    expect(count(PART.crate)).toBe(1);
    const ys: number[] = [];
    for (const t of [0, 5, 8, 11.9]) {
      view.update(t, 12, e, tower!, { festival });
      ys.push(view.meshes[PART.crate].instanceMatrix.array[13]);
    }
    expect(new Set(ys.map((y) => y.toFixed(2))).size).toBeGreaterThan(2);
    view.update(5, 12, e, track!, { festival });
    expect(count(PART.dummy)).toBe(1);
    // far away: both scenes sleep
    view.update(5, 12, e, new THREE.Vector3(1e4, 20, 1e4), { festival });
    expect(count(PART.crate)).toBe(0);
    expect(count(PART.dummy)).toBe(0);
  });
});
