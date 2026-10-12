import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { FIXED_STEP } from '../core/clock.ts';
import { Scope } from '../core/scope.ts';
import { CULTURE_BOATS } from '../content/life.ts';
import { generateWorld, type WorldData } from '../world/index.ts';
import { buildFerrySchedule, ferryDist, ferryDwelling } from './ferry.ts';
import { createLife, type LifeSystem } from './index.ts';

describe('ferry timetable (closed form)', () => {
  const sch = buildFerrySchedule(900, [100, 400, 700], 8, 3.4, 0.45);

  it('stands still for the dwell at every stop and is monotone', () => {
    for (const L of sch.legs) {
      const a = ferryDist(sch, L.t0 + 0.01);
      const b = ferryDist(sch, L.t0 + sch.dwell - 0.01);
      expect(b).toBeCloseTo(a, 9);
      expect(a % sch.total).toBeCloseTo(L.s0 % sch.total, 6);
    }
    let prev = -1;
    for (let t = 0; t < sch.cycle * 2.5; t += 0.37) {
      const d = ferryDist(sch, t);
      expect(d).toBeGreaterThanOrEqual(prev);
      prev = d;
    }
  });

  it('one cycle advances exactly one lap, never exceeds cruise speed, is deterministic', () => {
    expect(ferryDist(sch, sch.cycle * 3 + 5) - ferryDist(sch, 5)).toBeCloseTo(sch.total * 3, 6);
    for (let t = 0; t < sch.cycle; t += 0.1)
      expect((ferryDist(sch, t + 0.1) - ferryDist(sch, t)) / 0.1).toBeLessThanOrEqual(3.4 + 1e-6);
    expect(ferryDist(sch, 123.4)).toBe(
      ferryDist(buildFerrySchedule(900, [700, 100, 400], 8, 3.4, 0.45), 123.4),
    );
    expect(ferryDwelling(sch, 1)).toBe(true);
  });

  it('plain cruise without stops', () => {
    const c = buildFerrySchedule(500, [], 8, 3, 0.45);
    expect(ferryDist(c, 10)).toBeCloseTo(30, 9);
  });
});

describe('life: culture boats', () => {
  let w: WorldData | null = null;
  const rig = (): LifeSystem => {
    w ??= generateWorld(7);
    return createLife({
      world: w,
      scope: new Scope('boats-culture'),
      seed: 7,
      quality: 'medium',
      water: { splat: () => undefined },
      counters: { agents: 0 } as never,
      getTier: () => 0,
      cameraPos: new THREE.Vector3(0, 40, 0),
    });
  };

  it('ferries ride only ferry routes, sailboats only plain loops', () => {
    const life = rig();
    const f = life.kinds.ferries;
    expect(f).toBeDefined();
    expect(f!.routes.every((r) => r.kind === 'ferry' && r.dwell > 0)).toBe(true);
    expect(f!.routes.every((r) => r.stopArcs.length >= 1)).toBe(true);
    expect(life.kinds.sailboats!.routes.every((r) => r.kind !== 'ferry')).toBe(true);
    expect(life.kinds.patrol?.spec.variant).toBe(CULTURE_BOATS.patrol.variant);
    expect(life.kinds.lanternBoat?.spec.variant).toBe(CULTURE_BOATS.lantern.variant);
  });

  it('a ferry holds its position through a whole dwell window, deterministically', () => {
    const run = (): number[][] => {
      const life = rig();
      const f = life.kinds.ferries!;
      const out: number[][] = [];
      let inDwell = 0;
      let at: number[] | null = null;
      for (let s = 0; s < 30 * 600 && inDwell < 3; s++) {
        life.fixedUpdate(FIXED_STEP);
        const sch = f.schedules[0];
        const tau = f.simT + f.tOff[0];
        // well inside a dwell (0.5 s margins)
        const L = sch.legs.find((l) => {
          const c = tau - Math.floor(tau / sch.cycle) * sch.cycle;
          return c > l.t0 + 0.5 && c < l.t0 + sch.dwell - 0.5;
        });
        if (L) {
          if (!at) at = [f.x[0], f.z[0]];
          expect(f.x[0]).toBeCloseTo(at[0], 6);
          expect(f.z[0]).toBeCloseTo(at[1], 6);
          inDwell++;
        } else if (at) {
          out.push(at);
          at = null;
        }
      }
      expect(inDwell).toBeGreaterThan(0);
      return [...out, [f.x[0], f.z[0]]];
    };
    expect(run()).toEqual(run());
  });
});
