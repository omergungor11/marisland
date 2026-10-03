import { describe, expect, it } from 'vitest';
import { GOVERNOR, GOVERNOR_DPR_FLOOR } from '../content/governor.ts';
import {
  Governor,
  governorLabel,
  governorLevels,
  percentile,
  type GovernorAction,
} from './governor.ts';

/** Feed `seconds` of frames of `ms` each starting at `t`; returns the end time and actions. */
function run(
  g: Governor,
  t: number,
  seconds: number,
  ms: number,
): { t: number; actions: GovernorAction[] } {
  const actions: GovernorAction[] = [];
  const end = t + seconds;
  while (t < end) {
    t += ms / 1000;
    const a = g.sample(ms, t);
    if (a) actions.push(a);
  }
  return { t, actions };
}

describe('governorLevels', () => {
  it('steps DPR to the floor, then caps the tier', () => {
    const l = governorLevels(1.75, GOVERNOR_DPR_FLOOR.high, GOVERNOR);
    expect(l[0]).toEqual({ dpr: 1.75, tierCap: 3 });
    expect(l[1]).toEqual({ dpr: 1.49, tierCap: 3 }); // ARCHITECTURE §8: 1.75 → ~1.5
    expect(l[2]).toEqual({ dpr: 1.27, tierCap: 3 });
    expect(l[3]).toEqual({ dpr: 1.25, tierCap: 3 });
    expect(l[4]).toEqual({ dpr: 1.25, tierCap: 2 });
    expect(l).toHaveLength(5);
  });

  it('skips DPR steps when already at the floor', () => {
    const l = governorLevels(1, GOVERNOR_DPR_FLOOR.medium, GOVERNOR);
    expect(l).toEqual([
      { dpr: 1, tierCap: 3 },
      { dpr: 1, tierCap: 2 },
    ]);
  });
});

describe('percentile', () => {
  it('nearest-rank p90', () => {
    const a = Float64Array.from([5, 1, 4, 2, 3, 10, 9, 8, 7, 6]);
    expect(percentile(a, 10, 0.9)).toBe(9);
    expect(percentile(a, 0, 0.9)).toBeNaN();
  });
});

describe('Governor', () => {
  const levels = governorLevels(1.75, GOVERNOR_DPR_FLOOR.high, GOVERNOR);

  it('does nothing while frames are fast', () => {
    const g = new Governor(levels, GOVERNOR);
    expect(run(g, 0, 30, 16.7).actions).toEqual([]);
    expect(g.state.level).toBe(0);
  });

  it('drops one level after ≥ 2 s of p90 > 20 ms, DPR first', () => {
    const g = new Governor(levels, GOVERNOR);
    const r = run(g, 0, 6, 30);
    expect(r.actions).toHaveLength(1);
    const a = r.actions[0];
    expect(a.kind).toBe('down');
    expect(a.to.dpr).toBeLessThan(a.from.dpr);
    expect(a.to.tierCap).toBe(3);
    // settle + window fill + 2 s hold
    expect(a.t).toBeGreaterThanOrEqual(GOVERNOR.settleSeconds + GOVERNOR.windowSeconds + 2 - 0.05);
  });

  it('a short spike does not trigger', () => {
    const g = new Governor(levels, GOVERNOR);
    let t = run(g, 0, 4, 16).t;
    t = run(g, t, 1.5, 40).t;
    expect(run(g, t, 4, 16).actions).toEqual([]);
  });

  it('keeps dropping to the last level under sustained load, then stops', () => {
    const g = new Governor(levels, GOVERNOR);
    const r = run(g, 0, 60, 40);
    expect(r.actions.map((a) => a.kind)).toEqual(['down', 'down', 'down', 'down']);
    expect(g.current).toEqual({ dpr: 1.25, tierCap: 2 });
  });

  it('upgrades at most once, only after ≥ 10 s of p90 < 12 ms', () => {
    const g = new Governor(levels, GOVERNOR);
    let r = run(g, 0, 12, 40);
    expect(g.state.level).toBe(2);
    r = run(g, r.t, 9, 8);
    expect(r.actions).toEqual([]);
    r = run(g, r.t, 5, 8);
    expect(r.actions.map((a) => a.kind)).toEqual(['up']);
    expect(g.state.level).toBe(1);
    r = run(g, r.t, 60, 8);
    expect(r.actions).toEqual([]);
    expect(g.state.upgrades).toBe(1);
  });

  it('is a no-op while disabled and starts a fresh window when re-enabled', () => {
    const g = new Governor(levels, GOVERNOR);
    g.setDisabled('photo', true, 0);
    expect(g.sample(100, 5)).toBeNull();
    expect(run(g, 0, 20, 40).actions).toEqual([]);
    expect(g.state.reason).toBe('photo');
    g.setDisabled('photo', false, 20);
    const r = run(g, 20, 2, 40);
    expect(r.actions).toEqual([]); // settle + window not yet over
    expect(run(g, r.t, 4, 40).actions).toHaveLength(1);
  });

  it('ignores outliers (tab switch) and mid-band frames', () => {
    const g = new Governor(levels, GOVERNOR);
    let t = 0;
    for (let i = 0; i < 20; i++) {
      t += 1;
      expect(g.sample(5000, t)).toBeNull();
    }
    expect(run(g, t, 30, 15).actions).toEqual([]);
  });

  it('still steps down on a device running at a few fps', () => {
    const g = new Governor(levels, GOVERNOR);
    const r = run(g, 0, 10, 400);
    expect(r.actions.length).toBeGreaterThanOrEqual(1);
    expect(r.actions[0].kind).toBe('down');
  });

  it('labels its state for the stats overlay', () => {
    const g = new Governor(levels, GOVERNOR);
    expect(governorLabel(g.state)).toMatch(/^gov L0\/4 {2}dpr 1\.75 {2}Tmax 3/);
    g.setDisabled('capture', true, 0);
    expect(governorLabel(g.state)).toMatch(/^gov off \(capture\)/);
  });
});
