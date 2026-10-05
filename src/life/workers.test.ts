import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { FIXED_STEP } from '../core/clock.ts';
import { Scope } from '../core/scope.ts';
import type { Quality } from '../core/params.ts';
import { LAND, LIFE_PLAN, VILLAGERS, WORKER_ZONES, WORKERS } from '../content/life.ts';
import { THEMES } from '../content/themes.ts';
import {
  FLOOR_Y,
  INTERIOR_OF,
  OFFICE_DEFS,
  RAISED_FLOOR,
  WORK_SPOTS,
  floorOf,
} from '../content/offices.ts';
import { generateWorld, type WorldData } from '../world/index.ts';
import { lotLocalToWorld, lotPivotY } from '../world/lot-frame.ts';
import { perfLimit } from '../test/perf.ts';
import { createLife, type LifeSystem } from './index.ts';
import { makeCtx } from './ctx.ts';
import { buildSolids, buildWalkGraph, makeMask } from './land-world.ts';
import { planWorkers, seatsOf } from './workers-world.ts';
import type { Workers } from './workers.ts';

const worlds = new Map<number, WorldData>();
const world = (seed: number): WorldData => {
  let w = worlds.get(seed);
  if (!w) worlds.set(seed, (w = generateWorld(seed)));
  return w;
};

interface Rig {
  life: LifeSystem;
  w: Workers;
  tier: { v: number };
  cam: THREE.Vector3;
  counters: { agents: number };
}

function rig(
  seed: number,
  quality: Quality = 'medium',
  tier = 2,
  cam = new THREE.Vector3(0, 400, 0),
  wd: WorldData = world(seed),
): Rig {
  const t = { v: tier };
  const counters = { agents: 0 };
  const life = createLife({
    world: wd,
    scope: new Scope('workers-test'),
    seed,
    quality,
    water: { splat: () => undefined },
    counters: counters as never,
    getTier: () => t.v,
    cameraPos: cam,
  });
  life.onTier(tier);
  return { life, w: life.kinds.workers as Workers, tier: t, cam, counters };
}

const run = (r: Rig, n: number, each?: () => void): void => {
  for (let i = 0; i < n; i++) {
    r.life.fixedUpdate(FIXED_STEP);
    each?.();
  }
};

const SEEDS = [7, 42, 1001, 2024];
const STATE_WORK = 4;

describe('workers: planning', () => {
  it('seatsOf places seats via the lot frame at the WORK_SPOTS (legacy lots included)', () => {
    const w = world(1001);
    const seats = seatsOf(w);
    expect(seats.length).toBeGreaterThan(0);
    for (const s of seats.slice(0, 40)) {
      const lot = w.lots[s.lot];
      const spot = WORK_SPOTS[lot.defId][s.spot];
      const p = lotLocalToWorld(lot, spot.x, spot.z);
      expect(Math.hypot(s.x - p.x, s.z - p.z)).toBeLessThan(1e-9);
    }
    // legacy lots have a bench that types (laptop on the knees), themed ones keep their pose
    for (const s of seats) {
      const def = w.lots[s.lot].defId;
      if (!(def in OFFICE_DEFS)) expect(s.pose).toBe(WORKERS.legacyPose);
    }
  });

  it('seats stand on their shell floor: lot pivot + floorOf(def), lifted on the stilt lab', () => {
    let stilt = 0;
    for (const seed of SEEDS) {
      const w = world(seed);
      for (const s of seatsOf(w)) {
        const lot = w.lots[s.lot];
        if (!INTERIOR_OF[lot.defId]) {
          expect(s.floor).toBeNaN();
          continue;
        }
        expect(s.floor).toBeCloseTo(lotPivotY(lot, w.height) + floorOf(lot.defId), 6);
        if (lot.defId === 'testLabStilt') {
          stilt++;
          // the hut stands on the sea (pivot 0) like stiltHut: the floor is the deck, above water
          expect(s.floor).toBeCloseTo(RAISED_FLOOR.testLabStilt + FLOOR_Y, 6);
        }
      }
    }
    expect(stilt).toBeGreaterThan(0);
  });

  it('allocates by island theme within the per-quality plan and the theme caps', () => {
    for (const seed of SEEDS) {
      for (const q of ['low', 'medium', 'high'] as const) {
        const wd = world(seed);
        const r = rig(seed, q);
        const w = r.w;
        expect(w).toBeDefined();
        expect(w.capacity).toBeGreaterThan(0);
        expect(w.capacity).toBeLessThanOrEqual(LIFE_PLAN[q].workers);
        const per = new Map<number, number>();
        for (let i = 0; i < w.capacity; i++)
          per.set(w.islandOf[i], (per.get(w.islandOf[i]) ?? 0) + 1);
        for (const [id, n] of per)
          expect(n).toBeLessThanOrEqual(THEMES[wd.islands[id].theme].workers.cap);
        console.info(
          `seed ${seed} ${q}: ${w.capacity}/${LIFE_PLAN[q].workers} workers on ${[...per.entries()].map(([i, n]) => `${wd.islands[i].archetype}:${n}`).join(' ')}`,
        );
      }
    }
  });

  it('planWorkers is pure: same inputs, same plan', () => {
    const ctx = makeCtx({
      world: world(42),
      scope: new Scope('p'),
      seed: 42,
      quality: 'medium',
      water: { splat: () => undefined },
      counters: { agents: 0 } as never,
      getTier: () => 2,
      cameraPos: new THREE.Vector3(),
    });
    const g = buildWalkGraph(ctx);
    const mask = makeMask(ctx, buildSolids(ctx), WORKER_ZONES);
    const a = planWorkers(ctx, g, mask, 16, ctx.rngFor('workers'));
    const b = planWorkers(ctx, g, mask, 16, ctx.rngFor('workers'));
    expect(a.spawns).toEqual(b.spawns);
  });
});

describe('workers: behaviour', () => {
  it('is deterministic: same seed → same state after 600 steps; seeds differ', () => {
    const snap = (r: Rig): number[] => [
      ...r.w.x,
      ...r.w.y,
      ...r.w.z,
      ...r.w.yaw,
      ...r.w.seatOf,
      ...r.w.state,
    ];
    const a = rig(1001);
    const b = rig(1001);
    const c = rig(2024);
    for (const r of [a, b, c]) run(r, 600);
    expect(snap(a)).toEqual(snap(b));
    expect(snap(a)).not.toEqual(snap(c));
  });

  it('at simt = 2 at least 40 % are seated at their desk, typing', () => {
    for (const seed of SEEDS) {
      for (const q of ['low', 'medium', 'high'] as const) {
        const r = rig(seed, q);
        run(r, 60); // 2 s
        const w = r.w;
        const frac = w.seated / w.capacity;
        let typing = 0;
        for (let i = 0; i < w.capacity; i++) {
          const g = (w as unknown as { gPose: Float32Array }).gPose[i];
          if (w.stateOf(i) === STATE_WORK && g >= 2) typing++;
        }
        console.info(`seed ${seed} ${q}: ${w.seated}/${w.capacity} seated, ${typing} typing`);
        expect(frac).toBeGreaterThanOrEqual(0.4);
        expect(typing).toBeGreaterThan(0);
      }
    }
  });

  it('never shares a seat and keeps seated workers on their seat (≤ 0.05 u)', () => {
    for (const seed of SEEDS) {
      const r = rig(seed, 'high');
      const w = r.w;
      let sat = 0;
      run(r, 30 * 150, () => {
        const owners = new Set<number>();
        for (let i = 0; i < w.capacity; i++) {
          const k = w.seatOf[i];
          if (k < 0) continue;
          expect(w.seatOwner[k]).toBe(i);
          expect(owners.has(k)).toBe(false);
          owners.add(k);
          if (w.stateOf(i) === STATE_WORK) {
            const s = w.seats[k];
            expect(Math.hypot(w.x[i] - s.x, w.z[i] - s.z)).toBeLessThan(0.05);
            sat++;
          }
        }
      });
      expect(sat).toBeGreaterThan(0);
    }
  });

  it('workers come and go: ENTER → WORK → EXIT happens within 150 s and seats are freed', () => {
    const r = rig(1001, 'high');
    const w = r.w;
    const seen = new Set<number>();
    run(r, 30 * 150, () => {
      for (let i = 0; i < w.capacity; i++) seen.add(w.stateOf(i));
    });
    for (const s of [0, 1, 3, 4, 5]) expect(seen.has(s)).toBe(true);
    const held = Array.from(w.seatOwner).filter((o) => o >= 0).length;
    const holding = Array.from(w.seatOf).filter((k) => k >= 0).length;
    expect(held).toBe(holding);
  });

  it('feet stay on the ground (or sink by the seat drop only) and on dry land', () => {
    const r = rig(1001, 'high');
    const w = r.w;
    const ctx = makeCtx({
      world: world(1001),
      scope: new Scope('g'),
      seed: 1001,
      quality: 'high',
      water: { splat: () => undefined },
      counters: { agents: 0 } as never,
      getTier: () => 2,
      cameraPos: new THREE.Vector3(),
    });
    run(r, 30 * 120, () => {
      for (let i = 0; i < w.capacity; i++) {
        const g = ctx.h(w.x[i], w.z[i]);
        const k = w.seatOf[i];
        const seat = k >= 0 ? w.seats[k] : undefined;
        if (seat && !Number.isNaN(seat.floor)) {
          // at / walking to a desk: on the interior floor (ramped from the terrain at the door)
          const lo = Math.min(g, seat.floor) - seat.sit;
          const hi = Math.max(g, seat.floor) + LAND.footLift + WORKERS.hop;
          expect(w.y[i]).toBeGreaterThan(lo - 1e-3);
          expect(w.y[i]).toBeLessThan(hi + 1e-3);
          continue;
        }
        if (w.graph.deckY.length && g < 0.15) continue; // dock decks
        const above = w.y[i] - g;
        expect(above).toBeGreaterThan(-0.3 - 1e-3);
        // on the ground, or on the ramp / deck of a pier (never above deck height)
        if (above > LAND.footLift + WORKERS.hop + 0.05)
          expect(w.y[i]).toBeLessThanOrEqual(VILLAGERS.deckY + LAND.footLift + WORKERS.hop + 0.05);
      }
    });
  });

  it('agent gait phases differ (never in sync)', () => {
    const r = rig(1001, 'high');
    expect(new Set(Array.from(r.w.phase)).size).toBe(r.w.capacity);
  });

  it('each worker carries its theme accessory (aSeed integer) and a theme tint', () => {
    const r = rig(1001, 'high');
    const w = r.w;
    const seed = w.mesh.geometry.getAttribute('aSeed');
    const wd = world(1001);
    for (let i = 0; i < w.capacity; i++) {
      const theme = wd.islands[w.islandOf[i]].theme;
      expect(Math.floor(seed.getX(i))).toBe(THEMES[theme].accessory);
      const c = new THREE.Color();
      w.mesh.getColorAt(i, c);
      const tints = THEMES[theme].teamTints.map((h) => new THREE.Color(h).getHex());
      expect(tints).toContain(c.getHex());
    }
  });

  it('waves for the emote, also while seated, then resumes', () => {
    const r = rig(1001, 'high');
    run(r, 3);
    const w = r.w;
    expect(w.wave(-1)).toBe(false);
    expect(w.wave(w.capacity)).toBe(false);
    const i = Array.from({ length: w.capacity }, (_, k) => k).find(
      (k) => w.stateOf(k) === STATE_WORK,
    ) as number;
    expect(i).toBeDefined();
    expect(w.wave(i)).toBe(true);
    expect(w.stateOf(i)).toBe(2);
    run(r, Math.ceil((WORKERS.wave.emoteSeconds + 0.5) / FIXED_STEP));
    expect(w.stateOf(i)).not.toBe(2);
  });

  it('is hidden below tier 2 and revealed at tier 2', () => {
    const r = rig(1001, 'medium', 0);
    run(r, 5);
    expect(r.w.liveCount).toBe(0);
    r.tier.v = 2;
    r.life.onTier(2);
    run(r, 5);
    expect(r.w.liveCount).toBe(r.w.capacity);
  });

  it('skips lots hidden by flooding (setLotsHidden)', () => {
    const r = rig(1001, 'high');
    const w = r.w;
    const all = new Set(w.seats.map((s) => s.lot));
    w.setLotsHidden(all);
    const before = Array.from(w.seatOf).filter((k) => k >= 0).length;
    run(r, 30 * 120);
    // nobody started a new visit: holders can only shrink
    expect(Array.from(w.seatOf).filter((k) => k >= 0).length).toBeLessThanOrEqual(before);
  });
});

describe('workers: outposts', () => {
  /** A copy of the world with a Research-style hut on the Lonely Palm sand (the real one lands with TASK-302). */
  function withOutpost(seed: number): WorldData | null {
    const wd = world(seed);
    const id = wd.islands.findIndex((i) => i.archetype === 'lonelypalm');
    if (id < 0) return null;
    const palm = wd.landmarks.find((m) => m.islandId === id && m.kind === 'lonelyPalm');
    if (!palm) return null;
    const isl = wd.islands[id];
    const a = Math.atan2(isl.cz - palm.z, isl.cx - palm.x) + 1.2;
    const lot = {
      defId: 'researchHut',
      x: palm.x + Math.cos(a) * 5,
      z: palm.z + Math.sin(a) * 5,
      rotY: a + Math.PI,
      islandId: id,
      kind: 'outpost' as const,
      w: 3,
      d: 3,
      node: -1,
      variant: 0,
      role: 'main' as const,
    };
    return { ...wd, lots: [...wd.lots, lot] };
  }

  it('Lonely Palm research workers loop between anchors and stay on land', () => {
    let tested = 0;
    for (const seed of [1001, 42, 7, 2024, 5005, 9]) {
      const wd = withOutpost(seed);
      if (!wd) continue;
      const r = rig(seed, 'high', 2, new THREE.Vector3(0, 400, 0), wd);
      const w = r.w;
      const idx = Array.from({ length: w.capacity }, (_, k) => k).filter((k) => w.compOf[k] < 0);
      if (idx.length === 0) continue;
      tested++;
      const ctx = makeCtx({
        world: wd,
        scope: new Scope('o'),
        seed,
        quality: 'high',
        water: { splat: () => undefined },
        counters: { agents: 0 } as never,
        getTier: () => 2,
        cameraPos: new THREE.Vector3(),
      });
      const mask = makeMask(ctx, buildSolids(ctx), WORKER_ZONES, -VILLAGERS.minWalkY);
      const start = idx.map((k) => [w.x[k], w.z[k]]);
      let moved = 0;
      run(r, 30 * 120, () => {
        for (const k of idx) {
          if (w.stateOf(k) === 6) {
            expect(mask(w.x[k], w.z[k])).toBe(true);
          }
        }
      });
      idx.forEach((k, n) => {
        moved += Math.hypot(w.x[k] - start[n][0], w.z[k] - start[n][1]);
      });
      expect(moved).toBeGreaterThan(0);
    }
    expect(tested).toBeGreaterThan(0);
  });
});

describe('workers: cost', () => {
  it('fixed step stays cheap (agents × µs)', () => {
    const r = rig(1001, 'high');
    const w = r.w;
    run(r, 100);
    const n = 900;
    // eslint-disable-next-line no-restricted-properties
    const t0 = performance.now();
    for (let i = 0; i < n; i++) (w as unknown as { fixedUpdate(): void }).fixedUpdate();
    // eslint-disable-next-line no-restricted-properties
    const t1 = performance.now();
    for (let i = 0; i < n; i++) w.update((i % 10) / 10);
    // eslint-disable-next-line no-restricted-properties
    const t2 = performance.now();
    const step = (t1 - t0) / n;
    const upd = (t2 - t1) / n;
    console.info(
      `workers cost: ${w.capacity} agents, fixedUpdate ${(step * 1000).toFixed(1)} µs/step (${((step / w.capacity) * 1000).toFixed(2)} µs/agent), update ${(upd * 1000).toFixed(1)} µs/frame`,
    );
    expect(step).toBeLessThan(perfLimit(0.5));
    expect(upd).toBeLessThan(perfLimit(0.2));
  });
});
