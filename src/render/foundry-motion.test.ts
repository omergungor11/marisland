/**
 * Bot Foundry motion (TASK-545, D-124): closed form, a part lands exactly where its bot's socket is,
 * nothing crosses the belt while it moves, walkers and first-step bots keep to their yards, and each site
 * group skips cleanly on the seeds without room. Drones: hub slots, straight rise and landing.
 */
import { describe, expect, it } from 'vitest';
import { CODING_FOUNDRY_MOTION as M } from '../content/themes/coding-foundry-motion.ts';
import { CODING_M33 as K } from '../content/themes/coding-m33.ts';
import { generateWorld } from '../world/index.ts';
import { dronePosition, droneRoutes } from './drones.ts';
import {
  ITEM,
  armAt,
  botTrackOf,
  courseHeight,
  foundryFrame,
  foundryLineOf,
  newFoundryFrame,
  trackBotFrame,
  walkerPeriods,
  type FoundryFrame,
  type FoundryLine,
} from './foundry-motion.ts';

/** 1001 has all four sites, 186 lacks lake and line, 1074 the line (D-121). */
const SEEDS = [1001, 186, 1074, 29, 31];
const worlds = new Map(SEEDS.map((s) => [s, generateWorld(s)]));
const codingOf = (seed: number) => {
  const w = worlds.get(seed)!;
  return { w, isl: w.islands.find((i) => i.theme === 'coding')! };
};
const line = (seed: number): FoundryLine => {
  const { w, isl } = codingOf(seed);
  return foundryLineOf(w, isl, M.plan.medium.walkLen)!;
};
const frameCap = (l: FoundryLine): number => 9 + walkerPeriods(l) + 1;
const P = M.line.period;

describe('the shift (TASK-557, D-133)', () => {
  it('an asleep line parks its arms (down, turned to the crate, empty) at every phase; awake is unchanged', () => {
    const l = line(1001);
    for (let t = 0; t < 2 * P; t += 0.13) {
      for (let k = 0; k < l.arms.length; k++) {
        const asleep = armAt(l, k, t, 0);
        expect(asleep.lift, `t ${t} arm ${k}`).toBe(0);
        const dir = k % 2 === 0 ? 1 : -1;
        expect(asleep.heading).toBeCloseTo(l.arms[k].toBelt + dir * Math.PI, 9);
        // the phase underneath keeps running: awake 1 is the old closed form
        expect(armAt(l, k, t, 1)).toEqual(armAt(l, k, t));
        // half awake sits between parked and working
        const half = armAt(l, k, t, 0.5);
        const work = armAt(l, k, t);
        expect(Math.abs(half.lift)).toBeLessThanOrEqual(Math.abs(work.lift) + 1e-9);
      }
    }
  });
});

describe('site groups skip per seed (TASK-545)', () => {
  it('seeds without a line have no line movers and no line kit', () => {
    for (const seed of [186, 1074]) {
      const { w, isl } = codingOf(seed);
      expect(isl.anchors.foundryLine0, `seed ${seed}`).toBeUndefined();
      expect(foundryLineOf(w, isl, 26), `seed ${seed}`).toBeNull();
      const ids = w.fixtures.filter((f) => f.islandId === isl.id).map((f) => f.defId);
      expect(ids, `seed ${seed}`).not.toContain('conveyorLine');
      expect(ids, `seed ${seed}`).not.toContain('assemblyArm');
    }
    // 186 has no lake either
    const { w, isl } = codingOf(186);
    expect(isl.anchors.dataLake).toBeUndefined();
    const ids = w.fixtures.filter((f) => f.islandId === isl.id).map((f) => f.defId);
    expect(ids).not.toContain('serverPod');
    expect(ids).not.toContain('quantumPavilion');
  });

  it('the kit stands on its anchors where a site exists', () => {
    for (const seed of [1001, 29, 31]) {
      const { w, isl } = codingOf(seed);
      const A = isl.anchors;
      const fx = w.fixtures.filter((f) => f.islandId === isl.id);
      const of = (id: string) => fx.filter((f) => f.defId === id);
      let segs = 0;
      while (A[`foundrySeg${segs}`]) segs++;
      expect(of('conveyorLine'), `seed ${seed}`).toHaveLength(segs);
      expect(of('conveyorLine').filter((f) => f.variant === 1)).toHaveLength(1);
      expect(of('assemblyArm').every((f) => f.variant === 2)).toBe(true);
      expect(of('foundryPart').map((f) => f.variant)).toEqual([0, 1, 2]);
      expect(of('chargeMast')).toHaveLength(4);
      expect(of('dronePad')).toHaveLength(1);
      expect(of('droneHangar')).toHaveLength(1);
      expect(of('botCourse').length).toBe(botTrackOf(isl)!.stations.length);
    }
  });
});

describe('the line (TASK-545)', () => {
  it('is a pure function of the time', () => {
    const l = line(1001);
    const a = newFoundryFrame(frameCap(l));
    const b = newFoundryFrame(frameCap(l));
    for (const t of [0, 0.7, 3.3, 41.2, 1234.56]) {
      foundryFrame(l, t, a);
      foundryFrame(l, t, b);
      expect(b.n).toBe(a.n);
      expect(b.items.slice(0, b.n)).toEqual(a.items.slice(0, a.n));
    }
  });

  it('a fixed pool: the frame never runs out of slots', () => {
    for (const seed of [1001, 29, 31]) {
      const l = line(seed);
      const f = newFoundryFrame(64);
      let max = 0;
      for (let t = 0; t < 120; t += 0.13) {
        foundryFrame(l, t, f);
        max = Math.max(max, f.n);
      }
      expect(max, `seed ${seed}`).toBeLessThanOrEqual(frameCap(l));
    }
  });

  it('each part lands exactly on its socket', () => {
    const l = line(1001);
    const f = newFoundryFrame(frameCap(l));
    const kinds = [ITEM.body, ITEM.head, ITEM.antenna];
    for (let k = 0; k < 3; k++) {
      const t = 100 * P + k * M.line.armLag + M.arm.releaseAt - 1e-4;
      foundryFrame(l, t, f);
      const held = f.items.slice(0, f.n).find((i) => i.kind === kinds[k]);
      expect(held, `arm ${k}`).toBeDefined();
      const sx = l.x0 + l.hx * l.stations[k];
      const sz = l.z0 + l.hz * l.stations[k];
      expect(Math.hypot(held!.x - sx, held!.z - sz), `arm ${k}`).toBeLessThan(0.01);
      expect(held!.y, `arm ${k}`).toBeCloseTo(l.beltY, 2);
    }
  });

  it('the arms stay off the belt while it moves, and within the riser', () => {
    const l = line(1001);
    for (let k = 0; k < 3; k++)
      for (let ph = 0; ph < P; ph += 0.05) {
        const a = armAt(l, k, 200 * P + ph);
        expect(a.lift).toBeLessThanOrEqual(M.arm.lift[k] + M.arm.dip + 1e-6);
        expect(a.lift).toBeGreaterThanOrEqual(-1e-6);
        // riser top 1.95 over the plinth: the post (from 0.88) must not lift off it
        expect(a.lift + 0.88).toBeLessThan(1.95);
        if (ph < M.line.move) {
          const c = Math.cos(a.heading - l.arms[k].toBelt);
          expect(c, `arm ${k} at ${ph}`).toBeLessThan(0.05);
        }
      }
  });

  it('one bot leaves per period and walks a route clear of the arms and crates', () => {
    for (const seed of [1001, 29, 31]) {
      const l = line(seed);
      expect(l.walk, `seed ${seed}`).toBeGreaterThan(5);
      const { isl } = codingOf(seed);
      for (let k = 0; k < 3; k++) {
        const c = isl.anchors[`foundryCrate${k}`];
        const a = isl.anchors[`foundryArm${k}`];
        for (const p of l.route) {
          expect(Math.hypot(p.x - c.x, p.z - c.z), `seed ${seed} crate ${k}`).toBeGreaterThan(1.1);
          expect(Math.hypot(p.x - a.x, p.z - a.z), `seed ${seed} arm ${k}`).toBeGreaterThan(1.7);
        }
      }
      // equal spacing (the queue keeps its gaps)
      for (let i = 0; i + 1 < l.route.length; i++) {
        const d = Math.hypot(l.route[i + 1].x - l.route[i].x, l.route[i + 1].z - l.route[i].z);
        expect(d, `seed ${seed}`).toBeLessThanOrEqual(M.walk.sample * 1.01);
      }
    }
  });

  it('the hop clears the chute and comes down on the exit', () => {
    const l = line(1001);
    const f = newFoundryFrame(frameCap(l));
    const endX = l.x0 + l.hx * l.belt;
    const endZ = l.z0 + l.hz * l.belt;
    let highest = -Infinity;
    for (let ph = 0; ph < P; ph += 0.02) {
      foundryFrame(l, 300 * P + ph, f);
      for (const it of f.items.slice(0, f.n)) {
        if (it.kind !== ITEM.bot) continue;
        expect(it.sy).toBeGreaterThan(0);
        // the bot in the air: past the belt's end, short of the exit
        const u = (it.x - endX) * l.hx + (it.z - endZ) * l.hz;
        const v = -(it.x - endX) * l.hz + (it.z - endZ) * l.hx;
        if (Math.abs(v) < 0.01 && u > 0.01 && u < M.hop.exitU - 0.01)
          highest = Math.max(highest, it.y);
      }
    }
    expect(highest).toBeGreaterThan(l.beltY + 0.1);
    expect(highest).toBeLessThan(l.beltY + M.hop.height + 0.01);
  });
});

describe('first-step bots (TASK-545)', () => {
  const lapOf = (seed: number) => botTrackOf(codingOf(seed).isl)!;

  it('stay inside the yard for a whole lap, off the cones', () => {
    for (const seed of [1001, 186, 29]) {
      const tr = lapOf(seed);
      const f = newFoundryFrame(4);
      const { isl } = codingOf(seed);
      const size = isl.anchors.botTrackSize;
      const yard = isl.anchors.botTrackYard;
      const c = Math.cos(yard.rotY);
      const s = Math.sin(yard.rotY);
      for (let t = 0; t < tr.lap; t += 0.11) {
        f.n = 0;
        trackBotFrame(tr, 0, 1, t, f);
        const it = f.items[0];
        const du = (it.x - yard.x) * c + (it.z - yard.z) * s;
        const dv = -(it.x - yard.x) * s + (it.z - yard.z) * c;
        expect(Math.abs(du), `seed ${seed} t ${t}`).toBeLessThanOrEqual(size.z / 2 + 1e-3);
        expect(Math.abs(dv), `seed ${seed} t ${t}`).toBeLessThanOrEqual(size.x / 2 + 1e-3);
        expect(it.y).toBeGreaterThanOrEqual(tr.y - 1e-6);
      }
    }
  });

  it('the height profiles meet the courses: 0.6 u steps, flat cones, level at both ends', () => {
    expect(courseHeight(0, 0.7)).toBeCloseTo(0.6, 5);
    expect(courseHeight(2, 0)).toBe(0);
    for (const v of [0, 1, 2, 3]) {
      expect(courseHeight(v, -1.8), `v${v}`).toBe(0);
      expect(courseHeight(v, 1.8), `v${v}`).toBe(0);
    }
    expect(courseHeight(3, 0)).toBeCloseTo(0.46, 5);
  });

  it('bots never share a spot (even lap spacing)', () => {
    const tr = lapOf(1001);
    const n = M.plan.medium.trackBots;
    const f: FoundryFrame = newFoundryFrame(n);
    for (let t = 0; t < tr.lap; t += 0.5) {
      f.n = 0;
      for (let k = 0; k < n; k++) trackBotFrame(tr, k, n, t, f);
      for (let a = 0; a < n; a++)
        for (let b = a + 1; b < n; b++) {
          const d = Math.hypot(f.items[a].x - f.items[b].x, f.items[a].z - f.items[b].z);
          expect(d, `t ${t}`).toBeGreaterThan(1);
        }
    }
  });
});

describe('courier drones at the port (TASK-545)', () => {
  it('each hub drone has its own slot and leaves it straight up', () => {
    const { w, isl } = codingOf(1001);
    const routes = droneRoutes(w, 10, 1001).filter((r) => r.rise > 0);
    expect(routes.length).toBe(5);
    const pad = isl.anchors.dronePort;
    expect(routes[0].ax).toBeCloseTo(pad.x, 5);
    expect(routes[0].rest).toBeCloseTo((pad.y ?? 0) + K.pad.restY, 5);
    const keys = new Set(routes.map((r) => `${r.ax.toFixed(3)},${r.az.toFixed(3)}`));
    expect(keys.size).toBe(5);
    for (const r of routes) {
      const at = (u: number): [number, number, number] => dronePosition(r, u - r.phase, 0);
      // parked, no bob
      const a = at(1);
      const b = at(r.park * 0.9);
      expect(a[1]).toBeCloseTo(r.rest, 5);
      expect(b[1]).toBeCloseTo(r.rest, 5);
      // rising: y grows, x / z stand
      const m = at(r.park + r.rise / 2);
      expect(m[0]).toBeCloseTo(r.ax, 5);
      expect(m[2]).toBeCloseTo(r.az, 5);
      expect(m[1]).toBeGreaterThan(r.rest + 1);
      // landing: the mirror of it, ending on the slot
      const e = at(r.cycle - 1e-3);
      expect(e[0]).toBeCloseTo(r.ax, 3);
      expect(e[1]).toBeCloseTo(r.rest, 2);
      // no jump at the rise / flight seam
      const s0 = at(r.park + r.rise - 1e-3);
      const s1 = at(r.park + r.rise + 1e-3);
      expect(Math.abs(s1[1] - s0[1])).toBeLessThan(0.05);
    }
  });

  it('a route off the hub keeps its old timing', () => {
    const { w } = codingOf(1001);
    for (const r of droneRoutes(w, 6, 1001).filter((q) => q.rise === 0)) expect(r.park).toBe(2.5);
  });

  it('a seed without a port keeps the HQ hub and no slots', () => {
    for (const seed of SEEDS) {
      const { w, isl } = codingOf(seed);
      const rs = droneRoutes(w, 6, seed);
      if (isl.anchors.dronePort) continue;
      for (const r of rs) expect(r.rise).toBe(0);
    }
  });
});
