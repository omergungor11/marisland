import { describe, expect, it } from 'vitest';
import { CULTURE_CLOCK } from '../content/cultures/rhythm.ts';
import { QA_COASTER as F, QA_COASTER_MOTION as M } from '../content/themes/qa-coaster.ts';
import { QA_PARK } from '../content/themes/qa-park.ts';
import { Scope } from '../core/scope.ts';
import { COASTER_VARIANTS } from '../geo/themes/qa-coaster.ts';
import { buildProp } from '../geo/index.ts';
import { coasterKitOf, coasterKitToWorld, type CoasterKit } from '../world/coaster-kit.ts';
import { newCoasterSample } from '../world/coaster-spline.ts';
import { COASTER_PART_RANGE, coasterTrackOf } from '../world/gen/plans/qa-park.ts';
import { generateWorld, type WorldData } from '../world/index.ts';
import {
  bumperFrame,
  carSample,
  coasterStateAt,
  createCoasterLap,
  createCoasterShow,
  lapArcAt,
  newBumperFrame,
  newCoasterState,
  ratchet,
} from './coaster-motion.ts';
import { createCoasterMovers } from './coaster-movers.ts';
import { coasterTrackGeometry } from './coaster-track.ts';

// 1001 (scale 0.8), three more, and a seed without a site (D-119)
const SEEDS = [1001, 2024, 42, 7];
const NO_SITE = 6786;
const worlds = new Map<number, WorldData>();
const worldOf = (seed: number): WorldData => {
  let w = worlds.get(seed);
  if (!w) worlds.set(seed, (w = generateWorld(seed)));
  return w;
};
const qaOf = (w: WorldData) => w.islands.find((i) => i.theme === 'qa')!;
const kits = (): { seed: number; kit: CoasterKit; w: WorldData }[] =>
  SEEDS.flatMap((seed) => {
    const w = worldOf(seed);
    const kit = coasterKitOf(qaOf(w));
    return kit ? [{ seed, kit, w }] : [];
  });
const SPH = CULTURE_CLOCK.secondsPerHour;
const DAY = 24 * SPH;

describe('TASK-541 the kit frame', () => {
  it('kit frame x scale + site frame = the published world points', () => {
    for (const { seed, kit, w } of kits()) {
      const A = qaOf(w).anchors;
      kit.points.forEach((p, k) => {
        const [x, y, z] = coasterKitToWorld(kit, p[0], p[1], p[2]);
        const a = A[`coasterPt${k}`];
        expect(x, `${seed}`).toBeCloseTo(a.x, 6);
        expect(y, `${seed}`).toBeCloseTo(a.y ?? 0, 6);
        expect(z, `${seed}`).toBeCloseTo(a.z, 6);
      });
    }
  });

  it('the train stands centred on the level platform, on every seed', () => {
    const s0 = newCoasterSample();
    for (const { seed, kit } of kits()) {
      for (let k = 0; k < F.car.cars; k++) {
        carSample(kit, 0, k, s0);
        expect(s0.pos[1], `${seed} car ${k}`).toBeCloseTo(kit.points[0][1], 2);
      }
      carSample(kit, 0, 1, s0);
      expect(s0.pos[2], `${seed}`).toBeCloseTo(QA_PARK.station.z, 1);
    }
  });

  it('a seed without a site: no kit, no movers, no track geometry', () => {
    const w = worldOf(NO_SITE);
    expect(coasterTrackOf(qaOf(w))).toBeNull();
    expect(coasterKitOf(qaOf(w))).toBeNull();
    const scope = new Scope('t');
    expect(createCoasterMovers(w, 'medium', scope)).toBeNull();
    expect(coasterTrackGeometry(w)('coasterTrack', 0)).toBeNull();
    expect(w.fixtures.some((f) => f.defId.startsWith('coaster'))).toBe(false);
    scope.dispose();
  });

  it('kit fixtures on every site: track at the origin, station on the lane, board + cart variants', () => {
    expect(QA_PARK.kit.board).toBe(COASTER_VARIANTS.checklistBoard);
    expect(QA_PARK.kit.candy).toBe(COASTER_VARIANTS.inspectionBooth);
    for (const { seed, kit, w } of kits()) {
      const isl = qaOf(w);
      const fx = w.fixtures.filter((f) => f.islandId === isl.id);
      const track = fx.filter((f) => f.defId === 'coasterTrack');
      expect(track, `${seed}`).toHaveLength(1);
      expect(track[0].x).toBeCloseTo(kit.origin.x, 6);
      expect(track[0].scale).toBe(kit.scale);
      expect(track[0].y).toBeCloseTo(kit.groundY, 6);
      const st = fx.filter((f) => f.defId === 'coasterStation');
      expect(st, `${seed}`).toHaveLength(1);
      // the station's local +z (its deck) points away from the rink, whichever side the lane is
      const dz = { x: Math.cos(st[0].rotY), z: Math.sin(st[0].rotY) };
      const rink = coasterKitToWorld(kit, kit.rink.x, 0, kit.rink.z);
      expect(dz.x * (rink[0] - st[0].x) + dz.z * (rink[2] - st[0].z), `${seed}`).toBeLessThan(0);
      // (the board and the cart stay away from a slope, D-122)
      if (seed === 1001) {
        expect(fx.some((f) => f.defId === 'checklistBoard' && f.variant === 2)).toBe(true);
        expect(fx.some((f) => f.defId === 'inspectionBooth' && f.variant === 1)).toBe(true);
      }
    }
  });
});

describe('TASK-541 the lap', () => {
  it('chain speed up the lift, gravity down, over the crown, braked to the stop', () => {
    for (const { seed, kit } of kits()) {
      const lap = createCoasterLap(kit);
      const S = M.speed;
      const at = (u: number): number => lap.speeds[Math.round(u / lap.du)];
      for (let u = lap.chain0 + 1; u < lap.chain1; u += 0.5)
        expect(at(u), `${seed} chain`).toBeCloseTo(S.chainV, 5);
      const max = Math.max(...lap.speeds);
      expect(max, `${seed} drop`).toBeGreaterThan(8);
      expect(max, `${seed} drop`).toBeLessThan(13);
      const n = lap.speeds.length - 1;
      expect(lap.speeds[n], `${seed} stop`).toBeCloseTo(S.stopV, 5);
      const end = n - Math.ceil(5 / lap.du);
      for (let i = Math.ceil(lap.chain1 / lap.du); i < end; i++)
        expect(lap.speeds[i], `${seed} @${i}`).toBeGreaterThanOrEqual(S.minV - 1e-9);
      // the crown is really carried by gravity: no seed needs the floor speed on the loop's top half
      const crownU = kit.spline.controlS[COASTER_PART_RANGE.loop[0] + 4] + F.car.pitch - kit.stopS;
      expect(at(crownU), `${seed} crown`).toBeGreaterThan(S.minV);
      // one lap is a sensible ride
      const T = lap.times[n];
      expect(T, `${seed}`).toBeGreaterThan(18);
      expect(T, `${seed}`).toBeLessThan(40);
    }
  });

  it('the time table inverts: arc at the lap time of an arc; arc is monotonic', () => {
    const { kit } = kits()[0];
    const lap = createCoasterLap(kit);
    let prev = -1;
    for (let t = 0; t < lap.times[lap.times.length - 1]; t += 0.05) {
      const u = lapArcAt(lap, t);
      expect(u).toBeGreaterThan(prev);
      prev = u;
    }
    expect(lapArcAt(lap, -1)).toBe(0);
    expect(lapArcAt(lap, 1e6)).toBe(lap.length);
  });

  it('the ratchet stops and goes, is monotonic, and meets the plain arc at both ends', () => {
    const { kit } = kits()[0];
    const lap = createCoasterLap(kit);
    expect(ratchet(lap, lap.chain0)).toBe(lap.chain0);
    expect(ratchet(lap, lap.chain1)).toBe(lap.chain1);
    let held = 0;
    let n = 0;
    let prev = ratchet(lap, lap.chain0);
    for (let u = lap.chain0; u <= lap.chain1 - 0.9; u += 0.01) {
      const r = ratchet(lap, u);
      expect(r).toBeGreaterThanOrEqual(prev - 1e-9);
      expect(Math.abs(r - u)).toBeLessThan(M.click.link);
      if (r === prev) held++;
      prev = r;
      n++;
    }
    // it holds for about (1 − move) of a click
    expect(held / n).toBeGreaterThan(0.3);
  });
});

describe('TASK-541 the show', () => {
  it('fits a whole number of times per day; the day clock alone sets the pose', () => {
    for (const { seed, kit } of kits()) {
      const sh = createCoasterShow(kit);
      expect(Number.isInteger(Math.round((DAY / sh.cycle) * 1e9) / 1e9), `${seed}`).toBe(true);
      const a = newCoasterState();
      const b = newCoasterState();
      for (const day of [0.5, 111, 300.25, 599.75]) {
        coasterStateAt(sh, day, a);
        coasterStateAt(sh, day + DAY, b);
        expect(b.u).toBeCloseTo(a.u, 6);
        expect(b.lamp).toBe(a.lamp);
        expect(coasterStateAt(sh, day, newCoasterState())).toEqual(a);
      }
    }
  });

  it('dummy first with the lamp dark, then the lamp lit, then capped bots, then dark again', () => {
    for (const { seed, kit } of kits()) {
      const sh = createCoasterShow(kit);
      const T = sh.lap.times[sh.lap.times.length - 1];
      const st = newCoasterState();
      const zero = sh.zero + DAY;
      const at = (t: number) => coasterStateAt(sh, zero + t, st);
      at(sh.dummyAt + 2);
      expect([st.lap, st.lamp, st.dummy, st.bots], `${seed} dummy lap`).toEqual([0, 0, 1, 0]);
      at(sh.dummyAt + T + M.lamp.delay - 0.1);
      expect(st.lamp, `${seed} before lamp`).toBe(0);
      at(sh.dummyAt + T + M.lamp.delay + 0.1);
      expect(st.lamp, `${seed} lit`).toBe(1);
      expect(st.lap).toBe(-1);
      at(sh.botAt + 2);
      expect([st.lap, st.lamp, st.dummy, st.bots], `${seed} bot lap`).toEqual([1, 1, 0, 1]);
      at(sh.cycle - 0.01);
      expect([st.lamp, st.dummy, st.bots], `${seed} next`).toEqual([0, 1, 0]);
    }
  });

  it('noon: the siren finds the bots entering the loop, lamp lit', () => {
    const sm = newCoasterSample();
    for (const { seed, kit } of kits()) {
      const sh = createCoasterShow(kit);
      const st = newCoasterState();
      coasterStateAt(sh, 12 * SPH + M.noonLead, st);
      expect(st.lap, `${seed}`).toBe(1);
      expect(st.lamp, `${seed}`).toBe(1);
      carSample(kit, st.u, 0, sm);
      const loop0 = kit.spline.controlS[COASTER_PART_RANGE.loop[0]];
      expect(Math.abs(sm.s - loop0), `${seed}`).toBeLessThan(0.05);
      // the crown about a second later, upside down
      let inverted = false;
      for (let d = 0; d < 3; d += 0.1) {
        coasterStateAt(sh, 12 * SPH + M.noonLead + d, st);
        carSample(kit, st.u, 0, sm);
        if (sm.up[1] < -0.8) inverted = true;
      }
      expect(inverted, `${seed}`).toBe(true);
    }
  });

  it('the train never clips itself or the rails through the real loop (the 0.8 site included)', () => {
    // car + rider vertices of each car against the tub box of the others, the whole way round
    const car = buildProp('coasterCar', 1, 0, 0);
    const rider = buildProp('coasterRider', 1, 1, 0);
    const verts: number[][] = [];
    const take = (g: typeof car, off: readonly number[]): void => {
      const p = g.getAttribute('position');
      for (let i = 0; i < p.count; i += 5)
        verts.push([p.getX(i) + off[0], p.getY(i) + off[1], p.getZ(i) + off[2]]);
    };
    take(car, [0, 0, 0]);
    for (const sx of [-1, 1]) take(rider, [sx * F.car.seatX, F.car.seatY, F.car.seatZ]);
    const a = newCoasterSample();
    const b = newCoasterSample();
    const tub = { hx: F.car.width / 2, y0: 0.2, y1: 1.12, hz: F.car.length / 2 };
    for (const { seed, kit } of kits()) {
      const s0 = kit.loopS - kit.stopS - 2;
      const s1 = s0 + 26;
      let worst = -Infinity;
      for (let u = s0; u < s1; u += 0.2)
        for (let k = 0; k + 1 < F.car.cars; k++) {
          carSample(kit, u, k, a);
          carSample(kit, u, k + 1, b);
          for (const v of verts) {
            const wx =
              b.pos[0] + b.side[0] * v[0] + b.up[0] * v[1] + b.tangent[0] * v[2] - a.pos[0];
            const wy =
              b.pos[1] + b.side[1] * v[0] + b.up[1] * v[1] + b.tangent[1] * v[2] - a.pos[1];
            const wz =
              b.pos[2] + b.side[2] * v[0] + b.up[2] * v[1] + b.tangent[2] * v[2] - a.pos[2];
            const lx = wx * a.side[0] + wy * a.side[1] + wz * a.side[2];
            const ly = wx * a.up[0] + wy * a.up[1] + wz * a.up[2];
            const lz = wx * a.tangent[0] + wy * a.tangent[1] + wz * a.tangent[2];
            worst = Math.max(
              worst,
              Math.min(tub.hx - Math.abs(lx), ly - tub.y0, tub.y1 - ly, tub.hz - Math.abs(lz)),
            );
          }
        }
      expect(worst, `${seed}`).toBeLessThan(0);
    }
  });
});

describe('TASK-541 bumper cars', () => {
  it('stay in the rink, never overlap, ram once per period (closed form, no state)', () => {
    for (const { seed, kit } of kits()) {
      for (const n of [3, 5, 6]) {
        const fr = newBumperFrame(n);
        const R = kit.rink;
        let least = Infinity;
        let hits = 0;
        let lastSince = -1;
        for (let t = 0; t < 120; t += 0.03) {
          bumperFrame(t, n, R.w, R.d, seed, fr);
          for (let i = 0; i < n; i++) {
            const c = fr.cars[i];
            expect(Math.abs(c.x), `${seed} ${t}`).toBeLessThan(R.w / 2 - F.bumper.r * 0.9);
            expect(Math.abs(c.z), `${seed} ${t}`).toBeLessThan(R.d / 2 - F.bumper.r * 0.9);
            for (let j = i + 1; j < n; j++)
              least = Math.min(least, Math.hypot(c.x - fr.cars[j].x, c.z - fr.cars[j].z));
          }
          if (fr.hit.since >= 0 && lastSince < 0) hits++;
          lastSince = fr.hit.since;
        }
        // the contact is the bumpers' touch: ring radius + tube on both sides
        expect(least, `${seed} n ${n}`).toBeGreaterThan(M.bumpers.contact * 0.97);
        expect(least, `${seed} n ${n}`).toBeLessThan(M.bumpers.contact * 1.15);
        expect(hits, `${seed} n ${n}`).toBeGreaterThan(30);
      }
    }
  });

  it('same time, same pose', () => {
    const { seed, kit } = kits()[0];
    const f = (): unknown => bumperFrame(73.7, 5, kit.rink.w, kit.rink.d, seed, newBumperFrame(5));
    expect(f()).toEqual(f());
  });
});

describe('TASK-541 the built track', () => {
  it('builds the real points in the kit frame, LOD1 far cheaper, columns reach the ground', () => {
    for (const { seed, kit, w } of kits()) {
      const make = coasterTrackGeometry(w);
      expect(make('testTrack', 0)).toBeNull();
      const g0 = make('coasterTrack', 0)!;
      const g1 = make('coasterTrack', 1)!;
      const tris = (g: typeof g0): number => g.getAttribute('position').count / 3;
      expect(tris(g0), `${seed}`).toBeLessThan(kit.spline.length * 60);
      expect(tris(g1) / tris(g0), `${seed}`).toBeLessThan(0.45);
      g0.computeBoundingBox();
      const b = g0.boundingBox!;
      const top = Math.max(...kit.points.map((p) => p[1]));
      expect(b.max.y, `${seed}`).toBeGreaterThan(top - 0.1);
      expect(b.max.y, `${seed}`).toBeLessThan(top + 0.2 + F.car.length);
      expect(g0.userData.hooks.track.length).toBeCloseTo(kit.spline.length, 5);
      expect(g0.userData.hooks.track.chain).toEqual(kit.chain.map(([p, q]) => [p, q]));
      expect(new Float32Array(g0.getAttribute('position').array).every(Number.isFinite)).toBe(true);
    }
  });
});
