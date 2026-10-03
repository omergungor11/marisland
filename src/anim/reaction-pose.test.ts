import { describe, expect, it } from 'vitest';
import { REACTION, REACTION_PRESETS } from '../content/anim.ts';
import { startReaction, stepReaction, type Pose } from './reaction-pose.ts';

function run(preset: string, dt = 1 / 60, seconds = 3): { poses: Pose[]; doneAt: number } {
  const st = startReaction(REACTION_PRESETS[preset]);
  const poses: Pose[] = [];
  let doneAt = -1;
  for (let i = 0; i < Math.round(seconds / dt); i++) {
    poses.push({ ...stepReaction(st, dt) });
    if (st.done && doneAt < 0) doneAt = (i + 1) * dt;
  }
  return { poses, doneAt };
}

describe('reaction poses (springs k=180, c=17 unless a preset overrides)', () => {
  it('default spring is the bible bloom spring', () => {
    expect(REACTION.spring).toEqual({ k: 180, c: 17 });
  });

  it('squash dips to ~0.85, rebounds into a stretch, settles, keeps volume', () => {
    const { poses, doneAt } = run('generic');
    const sy = poses.map((p) => p.sy);
    expect(Math.min(...sy)).toBeGreaterThan(0.8);
    expect(Math.min(...sy)).toBeLessThan(0.93);
    expect(Math.max(...sy)).toBeGreaterThan(1.06);
    expect(Math.max(...sy)).toBeLessThan(1.2);
    for (const p of poses) expect(p.sy * p.sxz * p.sxz).toBeCloseTo(1, 6);
    expect(doneAt).toBeGreaterThan(0.2);
    expect(doneAt).toBeLessThan(1.2);
    expect(poses[poses.length - 1].sy).toBeCloseTo(1, 2);
  });

  it('wobble leans ~9° and rings out (several swings) within ~1 s', () => {
    const { poses, doneAt } = run('tree');
    const tilt = poses.map((p) => (p.tilt * 180) / Math.PI);
    expect(Math.max(...tilt)).toBeLessThanOrEqual(9.01);
    expect(Math.min(...tilt)).toBeLessThan(-4);
    let crossings = 0;
    for (let i = 1; i < tilt.length; i++) if (tilt[i - 1] * tilt[i] < 0) crossings++;
    expect(crossings).toBeGreaterThanOrEqual(3);
    expect(doneAt).toBeGreaterThan(0.5);
    expect(doneAt).toBeLessThan(1.6);
  });

  it('boats rock 15° on the soft spring', () => {
    const { poses } = run('boat');
    expect(Math.max(...poses.map((p) => p.tilt * (180 / Math.PI)))).toBeCloseTo(15, 0);
  });

  it('sheep double-hop: two arcs, then rest', () => {
    const { poses, doneAt } = run('sheep', 1 / 120);
    const lift = poses.map((p) => p.lift);
    let peaks = 0;
    for (let i = 1; i < lift.length - 1; i++)
      if (lift[i] > lift[i - 1] && lift[i] >= lift[i + 1] && lift[i] > 0.2) peaks++;
    expect(peaks).toBe(2);
    expect(Math.max(...lift)).toBeCloseTo(0.35, 1);
    expect(doneAt).toBeGreaterThan(0.64);
    expect(lift[lift.length - 1]).toBe(0);
  });

  it('crab spins one full turn (with the spring overshoot) and lands', () => {
    const { poses } = run('crab');
    const yaw = poses.map((p) => p.yaw / (2 * Math.PI));
    expect(Math.max(...yaw)).toBeGreaterThan(0.99);
    expect(Math.max(...yaw)).toBeLessThan(1.15);
    expect(yaw[yaw.length - 1]).toBeCloseTo(1, 2);
  });

  it('villager emote wiggles then rests', () => {
    const { poses, doneAt } = run('villager');
    expect(Math.max(...poses.map((p) => Math.abs(p.yaw)))).toBeGreaterThan(0.1);
    expect(doneAt).toBeGreaterThan(0.5);
  });

  it('is frame-rate independent (30 / 60 / 120 fps agree at t = 0.3 s)', () => {
    const at = (dt: number): number => {
      const st = startReaction(REACTION_PRESETS.generic);
      let p = st.pose;
      for (let i = 0; i < Math.round(0.3 / dt); i++) p = stepReaction(st, dt);
      return p.sy;
    };
    expect(at(1 / 30)).toBeCloseTo(at(1 / 120), 1);
    expect(at(1 / 60)).toBeCloseTo(at(1 / 120), 1);
  });

  it('a re-click restarts in place instead of stacking', () => {
    const st = startReaction(REACTION_PRESETS.tree);
    for (let i = 0; i < 20; i++) stepReaction(st, 1 / 60);
    startReaction(REACTION_PRESETS.tree, st);
    expect(st.t).toBe(0);
    expect(st.s).toEqual({ x: 1, v: 0 });
    expect(st.done).toBe(false);
  });

  it('every preset terminates within the hard cap', () => {
    for (const name of Object.keys(REACTION_PRESETS)) {
      expect(run(name).doneAt, name).toBeGreaterThan(0);
      expect(run(name).doneAt, name).toBeLessThanOrEqual(REACTION.maxSeconds);
    }
  });
});
