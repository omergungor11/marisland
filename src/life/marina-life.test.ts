import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { FIXED_STEP } from '../core/clock.ts';
import { Scope } from '../core/scope.ts';
import type { Quality } from '../core/params.ts';
import { LIFE_PLAN } from '../content/life.ts';
import { MARINA_LIFE, marinaCounts } from '../content/life-marina.ts';
import { MARINA_LOOK } from '../content/themes/hq-horseshoe-look.ts';
import { MARINA_SITE } from '../content/themes/hq-horseshoe-site.ts';
import { MARINA_KIT } from '../content/themes/hq-horseshoe.ts';
import { generateWorld, type WorldData } from '../world/index.ts';
import { inMarina } from '../world/gen/plans/hq-horseshoe.ts';
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

  it('walks the strollers along the quay, both ways, never in lockstep', () => {
    const plan = planMarina(world(), 0.75)!;
    const strollers = plan.bots.filter((b) => b.kind === 'marinaStroll');
    expect(strollers.length).toBe(5);
    expect(plan.laneLength).toBeGreaterThan(55);
    const p = pose();
    const starts = new Set<string>();
    let longest = 0;
    for (const b of strollers) {
      const route = b.town!.route!;
      starts.add(`${Math.round(b.x)},${Math.round(b.z)}`);
      let prev: { x: number; z: number } | null = null;
      let paused = 0;
      let walked = 0;
      // two full cycles at the fixed step: never faster than an eased walk, pauses exist
      const steps = Math.ceil((route.cycle * 2) / FIXED_STEP);
      let maxStep = 0;
      for (let k = 0; k <= steps; k++) {
        strollAt(route, k * FIXED_STEP, p);
        if (prev) {
          const d = Math.hypot(p.x - prev.x, p.z - prev.z);
          maxStep = Math.max(maxStep, d);
          // heading while moving follows the displacement (the lane's tangent, either way)
          if (p.moving && d > 0.004) {
            const want = Math.atan2(p.z - prev.z, p.x - prev.x);
            const diff = Math.abs(Math.atan2(Math.sin(p.hd - want), Math.cos(p.hd - want)));
            expect(diff).toBeLessThan(0.35);
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
      longest = Math.max(longest, route.cum[route.cum.length - 1]);
    }
    // a walk along the crescent, not pacing one spot
    expect(longest).toBeGreaterThan(55);
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
    // (TASK-674: on the quay point's own ground; the open quay is lower by the pier root)
    perches.slice(1).forEach((p, j) => {
      const q = A[`marinaQuay${(j + 1) * MARINA_LIFE.gull.edgeEvery}`];
      expect(p.y).toBeCloseTo((q.y ?? 0) + MARINA_LIFE.gull.y, 5);
    });
  });
});

/** True when (x, z) lies inside the plan rectangle w x d of a piece at `f`, grown by `m`. */
function inRect(
  f: { x: number; z: number; rotY: number },
  w: number,
  d: number,
  x: number,
  z: number,
  m: number,
): boolean {
  const fx = Math.cos(f.rotY);
  const fz = Math.sin(f.rotY);
  const lx = (x - f.x) * fz - (z - f.z) * fx;
  const lz = (x - f.x) * fx + (z - f.z) * fz;
  return Math.abs(lx) < w / 2 + m && Math.abs(lz) < d / 2 + m;
}

/** Every town footprint of a world: houses, terraces and stalls (plan boxes). */
function footprints(w: WorldData, island: number) {
  const A = w.islands[island].anchors;
  const out: { f: { x: number; z: number; rotY: number }; w: number; d: number; what: string }[] =
    [];
  for (let k = 0; A[`marinaHouse${k}`]; k++) {
    const kit = MARINA_KIT.house[A[`marinaHouseKind${k}`].x];
    out.push({ f: A[`marinaHouse${k}`], w: kit.w, d: kit.d, what: 'house' });
  }
  for (let t = 0; A[`marinaTerrace${t}`]; t++) {
    const h = [...Array(32).keys()].find((k) => A[`marinaHouseKind${k}`]?.z === t)!;
    const kit = MARINA_KIT.terrace[MARINA_SITE.house.restaurant[A[`marinaHouseKind${h}`].x]];
    out.push({ f: A[`marinaTerrace${t}`], w: kit.w, d: kit.d, what: 'terrace' });
  }
  for (const f of w.fixtures)
    if (f.defId === 'quayFurnish' && (f.variant ?? 0) >= 3 && inMarina(w.islands[island], f)) {
      const kit = MARINA_KIT.stall[(f.variant ?? 3) - 3];
      out.push({ f, w: kit.w, d: kit.d, what: 'stall' });
    }
  return out;
}

describe('marina life on the open crescent quay (TASK-676)', () => {
  for (const seed of [1001, 1, 42]) {
    it(`seed ${seed}: strollers stay on the paved promenade, diners and vendors on their anchors`, () => {
      const w = seed === SEED ? world() : generateWorld(seed);
      const plan = planMarina(w, 1)!;
      expect(plan).not.toBeNull();
      const A = w.islands[plan.island].anchors;
      const quay = [...Array(200).keys()].map((k) => A[`marinaQuay${k}`]).filter(Boolean);
      const half = A.marinaQuaySize.x / 2;
      const prints = footprints(w, plan.island);
      // nearest centre-line segment: offset toward the water, and the lower ground of its ends
      const near = (x: number, z: number) => {
        let bd = Infinity;
        let off = 0;
        let y = 0;
        for (let k = 0; k + 1 < quay.length; k++) {
          const a = quay[k];
          const b = quay[k + 1];
          const dx = b.x - a.x;
          const dz = b.z - a.z;
          const l2 = dx * dx + dz * dz || 1;
          const u = Math.min(1, Math.max(0, ((x - a.x) * dx + (z - a.z) * dz) / l2));
          const d = Math.hypot(x - a.x - dx * u, z - a.z - dz * u);
          if (d < bd) {
            bd = d;
            off = ((x - a.x) * -dz + (z - a.z) * dx) / Math.sqrt(l2);
            y = Math.min(a.y ?? 0, b.y ?? 0);
          }
        }
        return { off, y };
      };
      const strollers = plan.bots.filter((b) => b.kind === 'marinaStroll');
      expect(strollers.length).toBe(10);
      const p = pose();
      let covered = 0;
      for (const b of strollers) {
        const route = b.town!.route!;
        covered = Math.max(covered, route.cum[route.cum.length - 1]);
        for (let t = 0; t < route.cycle * 2; t += 0.5) {
          strollAt(route, t, p);
          const n = near(p.x, p.z);
          // on the walk line of the promenade (the band between the terraces and the house fronts)
          expect(Math.abs(n.off - (half - MARINA_SITE.walk))).toBeLessThan(0.5);
          // on the deck, never over the lower ground of the pier-root gap
          expect(n.y).toBeGreaterThanOrEqual(MARINA_SITE.ring.deckY - 0.03);
          expect(inMarina(w.islands[plan.island], p)).toBe(true);
          for (const f of prints)
            expect(inRect(f.f, f.w, f.d, p.x, p.z, 0.2), `${f.what} at ${p.x},${p.z}`).toBe(false);
        }
      }
      expect(covered).toBeGreaterThan(30);
      for (const d of plan.bots.filter((q) => q.kind === 'marinaDiner')) {
        const t = prints.filter((f) => f.what === 'terrace');
        expect(t.some((f) => inRect(f.f, f.w, f.d, d.x, d.z, 0.1))).toBe(true);
      }
      for (const v of plan.bots.filter((q) => q.kind === 'marinaVendor')) {
        for (const f of prints) expect(inRect(f.f, f.w, f.d, v.x, v.z, 0)).toBe(false);
        const stall = prints.filter((f) => f.what === 'stall');
        const nearest = Math.min(...stall.map((f) => Math.hypot(v.x - f.f.x, v.z - f.f.z)));
        expect(nearest).toBeLessThan(2.4);
        expect(inMarina(w.islands[plan.island], v)).toBe(true);
      }
    }, 60000);
  }

  it('leaves a world without a quay inert', () => {
    expect(planMarina(generateWorld(57), 1)).toBeNull();
  });
});

function rig(q: Quality, hour: number, cam: 'near' | 'far' | 'end') {
  const plan = planMarina(world(), ambientOf[q])!;
  const basin = world().islands[plan.island].anchors.marinaBasin;
  const A = world().islands[plan.island].anchors;
  const tip = A.marinaQuay0;
  // 'end': the orbit target on the quay's far end, 60+ u from the bay centre
  const near =
    cam === 'end'
      ? new THREE.Vector3(tip.x, tip.y ?? 0, tip.z)
      : new THREE.Vector3(basin.x, 0, basin.z - 6);
  const life = createLife({
    world: world(),
    scope: new Scope('marina-life'),
    seed: SEED,
    quality: q,
    water: { splat: () => undefined },
    counters: { agents: 0 } as never,
    getTier: () => 2,
    // (TASK-674: the open quay's bay lies within the town's wake reach of the world centre, so the
    // far frame looks 200 u off the bay)
    cameraPos:
      cam === 'far'
        ? new THREE.Vector3(basin.x + 200, 400, basin.z)
        : new THREE.Vector3(near.x, 40, near.z + 30),
    cameraTarget: cam === 'far' ? new THREE.Vector3(basin.x + 200, 0, basin.z) : near,
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

  it('wakes at either end of the long quay, not only at the bay centre', () => {
    for (const cam of ['near', 'end'] as const) {
      const awake = townAwake(rig('medium', 13, cam));
      expect(awake.marinaStroll ?? 0).toBe(marinaCounts(0.75).strollers);
    }
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
