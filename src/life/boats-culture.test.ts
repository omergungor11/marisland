import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { FIXED_STEP } from '../core/clock.ts';
import { Scope } from '../core/scope.ts';
import { CULTURE_BOATS } from '../content/life.ts';
import { generateWorld, heightAt, type WorldData } from '../world/index.ts';
import { islandRing, weaveRing } from './boats.ts';
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

describe('Q10 slalom weave (TASK-480)', () => {
  const ring = (n: number, r: number): { x: number; y: number }[] =>
    Array.from({ length: n }, (_, i) => ({
      x: Math.cos((i / n) * Math.PI * 2) * r,
      y: Math.sin((i / n) * Math.PI * 2) * r,
    }));
  const ang = (p: { x: number; y: number }): number => {
    const a = Math.atan2(p.y, p.x);
    return a < 0 ? a + Math.PI * 2 : a;
  };

  for (const a0 of [0.8, -0.15]) {
    it(`one alternating point per buoy, the loop stays angle-ordered (start ${a0})`, () => {
      const R = 60;
      const buoys = Array.from({ length: 8 }, (_, k) => ({
        x: Math.cos(a0 + k * 0.1) * R,
        z: Math.sin(a0 + k * 0.1) * R,
      }));
      const out = weaveRing(ring(180, R), 0, 0, buoys, 2.6);
      buoys.forEach((b, k) => {
        const p = out.reduce((m, q) =>
          Math.hypot(q.x - b.x, q.y - b.z) < Math.hypot(m.x - b.x, m.y - b.z) ? q : m,
        );
        expect(Math.hypot(p.x, p.y) - R).toBeCloseTo(k % 2 === 0 ? 2.6 : -2.6, 6);
      });
      // one turn round the centre: the angle steps never run backwards
      let turns = 0;
      for (let i = 0; i < out.length; i++) {
        let d = ang(out[(i + 1) % out.length]) - ang(out[i]);
        if (d < -Math.PI) d += Math.PI * 2;
        expect(d).toBeGreaterThan(0);
        turns += d;
      }
      expect(turns).toBeCloseTo(Math.PI * 2, 6);
    });
  }

  it('the QA inspection boat ring weaves through the slalom buoys (seed 1001)', () => {
    const w = generateWorld(1001);
    const qa = w.islands.find((i) => i.theme === 'qa');
    const buoys = w.fixtures.filter((f) => f.islandId === qa?.id && f.defId === 'inspectionBuoy');
    expect(buoys.length).toBe(8);
    const P = CULTURE_BOATS.patrol;
    const ctx = { world: w, h: (x: number, z: number) => heightAt(w.height, x, z) } as never;
    const route = islandRing(ctx, P.theme, P.margin, P.slalom);
    expect(route).not.toBeNull();
    // the smoothed loop passes beside every buoy, never through it
    for (const b of buoys) {
      const d = Math.min(...(route?.pts ?? []).map((p) => Math.hypot(p.x - b.x, p.y - b.z)));
      expect(d).toBeLessThan(P.slalom.weave + 0.6);
      expect(d).toBeGreaterThan(1);
    }
  });
});
