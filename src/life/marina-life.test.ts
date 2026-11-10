import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { FIXED_STEP } from '../core/clock.ts';
import { Scope } from '../core/scope.ts';
import type { Quality } from '../core/params.ts';
import { LIFE_PLAN } from '../content/life.ts';
import { MARINA_LIFE, marinaCounts } from '../content/life-marina.ts';
import { MARINA_LOOK } from '../content/themes/hq-horseshoe-look.ts';
import { MARINA_SITE } from '../content/themes/hq-horseshoe-site.ts';
import { generateWorld, type WorldData } from '../world/index.ts';
import { lotLocalToWorld } from '../world/lot-frame.ts';
import { createLife } from './index.ts';
import { marinaPerches, onShift, planMarina, strollAt, type StrollPose } from './marina-world.ts';

/** Seed 1001: the Marketing island carries the Horseshoe Harbour. */
const SEED = 1001;
let cached: WorldData | null = null;
const world = (): WorldData => (cached ??= generateWorld(SEED));

const ambientOf: Record<Quality, number> = { low: 0.5, medium: 0.75, high: 1 };
const pose = (): StrollPose => ({ x: 0, z: 0, hd: 0, moving: false });

describe('marina life plan (TASK-662)', () => {
  it('has a town only where the world has a marina', () => {
    expect(planMarina(world(), 0.75)).not.toBeNull();
    const none = { ...world(), islands: world().islands.map((i) => ({ ...i, anchors: {} })) };
    expect(planMarina(none, 0.75)).toBeNull();
  });

  it('sizes the town by quality and never past the worker pool', () => {
    for (const q of ['low', 'medium', 'high'] as const) {
      const plan = planMarina(world(), ambientOf[q])!;
      const row = marinaCounts(ambientOf[q]);
      expect(plan.strollers).toBe(row.strollers);
      expect(plan.diners).toBe(row.diners);
      expect(plan.vendors).toBe(row.vendors);
      expect(plan.bots.length).toBeLessThanOrEqual(LIFE_PLAN[q].workers);
    }
  });

  it('is deterministic: the same world plans the same town', () => {
    const a = planMarina(world(), 0.75)!;
    const b = planMarina(generateWorld(SEED), 0.75)!;
    expect(JSON.stringify(a.bots)).toBe(JSON.stringify(b.bots));
  });

  it('walks the strollers on the promenade lane, both ways, never in lockstep', () => {
    const plan = planMarina(world(), 0.75)!;
    const isl = world().islands[plan.island];
    const C = isl.anchors.marinaBasin;
    const Rb = isl.anchors.marinaBasinSize.x / 2;
    const rLane = Rb + MARINA_LIFE.stroll.lane;
    const strollers = plan.bots.filter((b) => b.kind === 'marinaStroll');
    expect(strollers.length).toBe(5);
    const p = pose();
    const dirs = new Set<number>();
    const starts = new Set<string>();
    for (const b of strollers) {
      const route = b.town!.route!;
      starts.add(`${Math.round(b.x)},${Math.round(b.z)}`);
      let prev: { x: number; z: number } | null = null;
      let paused = 0;
      let walked = 0;
      // two full cycles at the fixed step: on the lane, never faster than an eased walk, pauses exist
      const steps = Math.ceil((route.cycle * 2) / FIXED_STEP);
      let maxStep = 0;
      for (let k = 0; k <= steps; k++) {
        strollAt(route, k * FIXED_STEP, p);
        expect(Math.abs(Math.hypot(p.x - C.x, p.z - C.z) - rLane)).toBeLessThan(0.08);
        if (prev) {
          const d = Math.hypot(p.x - prev.x, p.z - prev.z);
          maxStep = Math.max(maxStep, d);
          if (d > 1e-6) {
            // heading while moving follows the displacement (the lane's tangent, either way)
            if (p.moving && d > 0.004) {
              const want = Math.atan2(p.z - prev.z, p.x - prev.x);
              const diff = Math.abs(Math.atan2(Math.sin(p.hd - want), Math.cos(p.hd - want)));
              expect(diff).toBeLessThan(0.35);
            }
          }
        }
        if (p.moving) walked++;
        else paused++;
        prev = { x: p.x, z: p.z };
      }
      expect(maxStep / FIXED_STEP).toBeLessThan(MARINA_LIFE.stroll.speed * 2.1);
      expect(paused).toBeGreaterThan(walked * 0.1);
      expect(walked).toBeGreaterThan(0);
      // both directions: the route comes back
      let right = 0;
      let left = 0;
      for (const l of route.legs) {
        if (l.s1 > l.s0) right++;
        else left++;
      }
      expect(right).toBeGreaterThan(0);
      expect(left).toBeGreaterThan(0);
      dirs.add(Math.sign(route.legs[0].s1 - route.legs[0].s0));
    }
    // phase offsets: five strollers do not start on the same spot
    expect(starts.size).toBeGreaterThanOrEqual(4);
  });

  it('seats the diners on the terrace chairs, facing their table, feet on the chair', () => {
    const plan = planMarina(world(), 0.75)!;
    const A = world().islands[plan.island].anchors;
    const diners = plan.bots.filter((b) => b.kind === 'marinaDiner');
    expect(diners.length).toBe(9);
    const seen = new Set<string>();
    for (const d of diners) {
      // nearest terrace and its table / chair
      let best = { dist: Infinity, t: -1, table: -1 };
      for (let t = 0; A[`marinaTerrace${t}`]; t++) {
        const house = [...Array(16).keys()].find((k) => A[`marinaHouseKind${k}`]?.z === t)!;
        const variant = MARINA_SITE.house.restaurant[A[`marinaHouseKind${house}`].x];
        MARINA_LOOK.terraces[variant].tables.forEach((tb, j) => {
          const w = lotLocalToWorld(A[`marinaTerrace${t}`], tb.x, tb.z);
          const dist = Math.hypot(d.x - w.x, d.z - w.z);
          if (dist < best.dist) best = { dist, t, table: j };
        });
      }
      // on the chair ring of a table (chair distance, jitter allowed), never inside the table
      expect(best.dist).toBeGreaterThan(MARINA_LIFE.diner.chairDist - 0.05);
      expect(best.dist).toBeLessThan(MARINA_LIFE.diner.chairDist + 0.05);
      const house = [...Array(16).keys()].find((k) => A[`marinaHouseKind${k}`]?.z === best.t)!;
      const variant = MARINA_SITE.house.restaurant[A[`marinaHouseKind${house}`].x];
      const tb = MARINA_LOOK.terraces[variant].tables[best.table];
      const tw = lotLocalToWorld(A[`marinaTerrace${best.t}`], tb.x, tb.z);
      const toTable = Math.atan2(tw.z - d.z, tw.x - d.x);
      expect(Math.abs(Math.atan2(Math.sin(d.hd - toTable), Math.cos(d.hd - toTable)))).toBeLessThan(
        0.05,
      );
      // body bottom on the seat top
      const deck = A[`marinaTerrace${best.t}`].y;
      expect(d.y + MARINA_LIFE.diner.hip).toBeCloseTo((deck ?? 0) + MARINA_LOOK.terrace.chairH, 5);
      // one bot per chair
      const key = `${d.x.toFixed(2)},${d.z.toFixed(2)}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });

  it('stands the vendors beside the stalls', () => {
    const plan = planMarina(world(), 1)!;
    const stalls = world().fixtures.filter(
      (f) => f.defId === 'quayFurnish' && (f.variant ?? 0) >= 3,
    );
    const vendors = plan.bots.filter((b) => b.kind === 'marinaVendor');
    expect(vendors.length).toBe(3);
    for (const v of vendors) {
      const near = Math.min(...stalls.map((s) => Math.hypot(v.x - s.x, v.z - s.z)));
      expect(near).toBeGreaterThan(1.2);
      expect(near).toBeLessThan(2.4);
    }
  });

  it('keeps shifts: busy by day, a few diners late, nobody in the small hours', () => {
    const plan = planMarina(world(), 1)!;
    const on = (kind: string, h: number): number =>
      plan.bots.filter((b) => b.kind === kind && onShift(b.town!.shift, h)).length;
    expect(on('marinaStroll', 13)).toBeGreaterThanOrEqual(6);
    expect(on('marinaDiner', 13)).toBeGreaterThanOrEqual(5);
    expect(on('marinaVendor', 13)).toBe(3);
    // after the neon night starts the vendors close and the dinner crowd thins
    expect(on('marinaVendor', 21)).toBe(0);
    expect(on('marinaDiner', 19.5)).toBeGreaterThan(on('marinaDiner', 22.9));
    expect(on('marinaDiner', 22.9)).toBeGreaterThanOrEqual(1);
    expect(on('marinaDiner', 22.9)).toBeLessThanOrEqual(4);
    expect(on('marinaStroll', 22.9)).toBeLessThanOrEqual(4);
    // 04:00: the harbour sleeps; the shift wraps past midnight
    for (const k of ['marinaStroll', 'marinaDiner', 'marinaVendor']) expect(on(k, 4)).toBe(0);
    expect(onShift([19.5, 24.7], 0.5)).toBe(true);
    expect(onShift([19.5, 24.7], 1.0)).toBe(false);
    expect(onShift([9, 23], 8.9)).toBe(false);
  });

  it('perches gulls on the tower and the quay edge', () => {
    const perches = marinaPerches(world());
    expect(perches.length).toBeGreaterThanOrEqual(3);
    const A = world().islands.find((i) => i.anchors.marinaTower)!.anchors;
    expect(perches[0].y).toBeCloseTo((A.marinaTower.y ?? 0) + MARINA_LIFE.gull.towerTop, 5);
    for (const p of perches.slice(1)) expect(p.y).toBeCloseTo(1.35 + MARINA_LIFE.gull.y, 1);
  });
});

function rig(q: Quality, hour: number, cam: 'near' | 'far') {
  const plan = planMarina(world(), ambientOf[q])!;
  const basin = world().islands[plan.island].anchors.marinaBasin;
  const near = new THREE.Vector3(basin.x, 0, basin.z - 6);
  const life = createLife({
    world: world(),
    scope: new Scope('marina-life'),
    seed: SEED,
    quality: q,
    water: { splat: () => undefined },
    counters: { agents: 0 } as never,
    getTier: () => 2,
    cameraPos:
      cam === 'near' ? new THREE.Vector3(basin.x, 40, basin.z + 30) : new THREE.Vector3(0, 400, 0),
    cameraTarget: cam === 'near' ? near : new THREE.Vector3(0, 0, 0),
    hour: () => hour,
  });
  life.onTier(2);
  for (let i = 0; i < 90; i++) life.fixedUpdate(FIXED_STEP);
  return life;
}

function townAwake(life: ReturnType<typeof rig>): Record<string, number> {
  const w = life.kinds.workers as unknown as {
    capacity: number;
    tab: ({ kind: string; town?: unknown } | undefined)[];
    active: Uint8Array;
  };
  const out: Record<string, number> = {};
  for (let i = 0; i < w.capacity; i++) {
    const t = w.tab[i];
    if (t?.town && w.active[i]) out[t.kind] = (out[t.kind] ?? 0) + 1;
  }
  return out;
}

describe('marina life in the workers kind (TASK-662)', () => {
  it('wakes the town at the quay by day, within the worker pool', () => {
    for (const q of ['low', 'medium', 'high'] as const) {
      const life = rig(q, 13, 'near');
      const awake = townAwake(life);
      const row = marinaCounts(ambientOf[q]);
      expect(awake.marinaStroll ?? 0).toBe(row.strollers);
      expect(awake.marinaDiner ?? 0).toBeGreaterThan(0);
      expect(life.kinds.workers!.liveCount).toBeLessThanOrEqual(LIFE_PLAN[q].workers);
    }
  });

  it('keeps the town asleep when the camera is far or the harbour is closed', () => {
    expect(Object.keys(townAwake(rig('medium', 13, 'far'))).length).toBe(0);
    expect(Object.keys(townAwake(rig('medium', 4, 'near'))).length).toBe(0);
  });

  it('thins out at night and never grows the agent count', () => {
    const day = rig('medium', 13, 'near');
    const night = rig('medium', 22, 'near');
    const d = townAwake(day);
    const n = townAwake(night);
    const sum = (o: Record<string, number>): number => Object.values(o).reduce((a, b) => a + b, 0);
    expect(sum(n)).toBeLessThan(sum(d));
    expect(sum(n)).toBeGreaterThan(0);
    // the town takes pool slots: awake workers never pass the plan, day or night
    expect(night.kinds.workers!.liveCount).toBeLessThanOrEqual(LIFE_PLAN.medium.workers);
    const far = rig('medium', 13, 'far');
    expect(day.stats.agents).toBeLessThanOrEqual(far.stats.agents + 0);
  });

  it('is deterministic: the same clock gives the same positions', () => {
    const run = (): number[] => {
      const life = rig('medium', 13, 'near');
      const w = life.kinds.workers!;
      const out: number[] = [];
      for (let i = 0; i < w.capacity; i++) if (w.active[i]) out.push(w.x[i], w.z[i], w.y[i]);
      return out;
    };
    expect(run()).toEqual(run());
  });
});
