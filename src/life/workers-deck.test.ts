import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { FIXED_STEP } from '../core/clock.ts';
import { Scope } from '../core/scope.ts';
import type { Quality } from '../core/params.ts';
import { LIFE_PLAN, STILT_SPUR, THEME_LIFE, lifeWeight } from '../content/life.ts';
import { RAISED_FLOOR, WORK_SPOTS, floorOf } from '../content/offices.ts';
import { generateWorld, type WorldData } from '../world/index.ts';
import { lotPivotY } from '../world/lot-frame.ts';
import { createLife } from './index.ts';
import { makeCtx } from './ctx.ts';
import { buildSolids, buildWalkGraph, makeMask, walkRoute } from './land-world.ts';
import { attachDeckSpurs, planWorkers, seatsOf } from './workers-world.ts';
import type { Workers } from './workers.ts';
import { WORKER_ZONES } from '../content/life.ts';

/** Seeds whose M14b world has a stilt lab (1001 has none until the QA island plan lands). */
const STILT_SEEDS = [7, 42, 2024];
const STATE_WORK = 4;
const CAPS = { low: 25, medium: 60, high: 110 } as const;

const worlds = new Map<number, WorldData>();
const world = (seed: number): WorldData => {
  let w = worlds.get(seed);
  if (!w) worlds.set(seed, (w = generateWorld(seed)));
  return w;
};

const ctxOf = (seed: number) =>
  makeCtx({
    world: world(seed),
    scope: new Scope('deck'),
    seed,
    quality: 'medium',
    water: { splat: () => undefined },
    counters: { agents: 0 } as never,
    getTier: () => 2,
    cameraPos: new THREE.Vector3(),
  });

function rig(seed: number, quality: Quality) {
  const counters = { agents: 0 };
  const life = createLife({
    world: world(seed),
    scope: new Scope('deck-rig'),
    seed,
    quality,
    water: { splat: () => undefined },
    counters: counters as never,
    getTier: () => 2,
    cameraPos: new THREE.Vector3(0, 400, 0),
  });
  life.onTier(2);
  return { life, w: life.kinds.workers as Workers, counters };
}

describe('workers: stilt lab deck spur (TASK-379)', () => {
  it('connects every stilt-lab door to its island walk graph', () => {
    for (const seed of STILT_SEEDS) {
      const ctx = ctxOf(seed);
      const g = buildWalkGraph(ctx);
      const doors = ctx.world.lots.filter((l) => RAISED_FLOOR[l.defId] > 0);
      expect(doors.length).toBeGreaterThan(0);
      for (const l of doors) expect(g.comp[l.node]).toBe(-1); // the bug: water door, isolated
      const n0 = g.n;
      expect(attachDeckSpurs(ctx, g)).toBe(doors.length);
      expect(g.n).toBeGreaterThan(n0);
      for (const l of doors) {
        const hub = ctx.world.settlements.find((s) => s.islandId === l.islandId)!.hub.node;
        expect(g.comp[l.node]).toBe(g.comp[hub]);
        expect(walkRoute(g, hub, l.node)).not.toBeNull();
        expect(g.deckY[l.node]).toBeCloseTo(STILT_SPUR.deckY, 5);
      }
      // consistent arrays, symmetric adjacency, deck nodes carry the deck height
      expect(g.x.length).toBe(g.n);
      expect(g.adj.length).toBe(g.n);
      for (let a = 0; a < g.n; a++) for (const b of g.adj[a]) expect(g.adj[b]).toContain(a);
      // idempotent: a second call finds walkable doors and adds nothing
      expect(attachDeckSpurs(ctx, g)).toBe(0);
    }
  });

  it('seats workers inside the stilt lab on 3 seeds, on its raised floor, within the caps', () => {
    for (const seed of STILT_SEEDS) {
      const wd = world(seed);
      for (const q of ['low', 'medium', 'high'] as const) {
        const r = rig(seed, q);
        const w = r.w;
        for (let i = 0; i < 60; i++) r.life.fixedUpdate(FIXED_STEP);
        let inside = 0;
        for (let i = 0; i < w.capacity; i++) {
          const k = w.seatOf[i];
          if (k < 0 || w.stateOf(i) !== STATE_WORK) continue;
          const lot = wd.lots[w.seats[k].lot];
          if (!(RAISED_FLOOR[lot.defId] > 0)) continue;
          inside++;
          const c = Math.cos(lot.rotY);
          const s = Math.sin(lot.rotY);
          const dx = w.x[i] - lot.x;
          const dz = w.z[i] - lot.z;
          const lz = dx * c + dz * s;
          const lx = dx * s - dz * c;
          expect(Math.abs(lx)).toBeLessThan(lot.w / 2);
          expect(Math.abs(lz)).toBeLessThan(lot.d / 2);
          const floor = lotPivotY(lot, wd.height) + floorOf(lot.defId);
          expect(w.y[i]).toBeGreaterThan(floor - 0.2);
        }
        console.info(
          `seed ${seed} ${q}: ${inside} seated in the stilt lab (${w.residents} workers)`,
        );
        expect(inside).toBeGreaterThanOrEqual(1);
        expect(w.residents).toBeLessThanOrEqual(LIFE_PLAN[q].workers);
        expect(r.counters.agents).toBeLessThanOrEqual(CAPS[q]);
      }
    }
  });

  it('workers walk the spur to the lab over time (feet on the deck, never in the water)', () => {
    const r = rig(7, 'high');
    const w = r.w;
    const g = w.graph;
    const lab = world(7).lots.findIndex((l) => RAISED_FLOOR[l.defId] > 0);
    let onSpur = 0;
    for (let step = 0; step < 30 * 240; step++) {
      r.life.fixedUpdate(FIXED_STEP);
      for (let i = 0; i < w.capacity; i++) {
        if (w.seatOf[i] < 0 || w.seats[w.seatOf[i]].lot !== lab) continue;
        const s = w.stateOf(i);
        if (s === STATE_WORK) continue;
        onSpur++;
        expect(w.y[i]).toBeGreaterThan(-0.15); // ENTER / EXIT stay on the deck / ramp
      }
    }
    expect(g.deckY[world(7).lots[lab].node]).toBeCloseTo(STILT_SPUR.deckY, 5);
    expect(onSpur).toBeGreaterThan(0);
  });

  it('planWorkers stays pure with the spur (same plan twice)', () => {
    const ctx = ctxOf(42);
    const g = buildWalkGraph(ctx);
    const mask = makeMask(ctx, buildSolids(ctx), WORKER_ZONES);
    const a = planWorkers(ctx, g, mask, 16, ctx.rngFor('workers'));
    const b = planWorkers(ctx, g, mask, 16, ctx.rngFor('workers'));
    expect(a.spawns).toEqual(b.spawns);
    expect(seatsOf(world(42)).length).toBe(a.seats.length);
  });
});

describe('content: life by theme and outdoor work spots (TASK-379)', () => {
  it('sheep live on Design only, none on Coding; weights resolve theme > override > legacy', () => {
    expect(THEME_LIFE.coding.sheep).toBe(0);
    for (const [t, v] of Object.entries(THEME_LIFE))
      if (t !== 'design') expect(THEME_LIFE.design.sheep).toBeGreaterThan(v.sheep);
    expect(lifeWeight('design', 'sheep', 9)).toBe(THEME_LIFE.design.sheep);
    expect(lifeWeight('design', 'sheep', 9, 2)).toBe(2);
    expect(lifeWeight(undefined, 'crabs', 3.5)).toBe(3.5);
  });

  it('every new outdoor structure has finite stand spots with a valid pose', () => {
    const ids = [
      'easel',
      'checklistBoard',
      'solarRow',
      'windTurbine',
      'coolingTower',
      'stage',
      'weatherMast',
      'barrierGate',
    ];
    const poses = { easel: 'paint', checklistBoard: 'inspect', windTurbine: 'look' } as Record<
      string,
      string
    >;
    for (const id of ids) {
      const spots = WORK_SPOTS[id];
      expect(spots?.length).toBeGreaterThan(0);
      for (const s of spots) {
        expect(Number.isFinite(s.x + s.z + s.face)).toBe(true);
        expect(s.sit).toBe(0);
        expect(Math.hypot(s.x, s.z)).toBeGreaterThan(0.5);
        if (poses[id]) expect(s.pose).toBe(poses[id]);
      }
    }
  });
});
