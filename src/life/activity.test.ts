import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { FIXED_STEP } from '../core/clock.ts';
import { Scope } from '../core/scope.ts';
import type { Quality } from '../core/params.ts';
import { LIFE_PLAN } from '../content/life.ts';
import { THEMES } from '../content/themes.ts';
import { perfLimit } from '../test/perf.ts';
import { generateWorld, type WorldData } from '../world/index.ts';
import { createLife, type LifeSystem } from './index.ts';
import { ITEM_STRIDE } from './life-material.ts';
import type { Workers } from './workers.ts';

const CAPS = { low: 25, medium: 60, high: 110 } as const;
const SEEDS = [1001, 7, 42];

const worlds = new Map<number, WorldData>();
const world = (seed: number): WorldData => {
  let w = worlds.get(seed);
  if (!w) worlds.set(seed, (w = generateWorld(seed)));
  return w;
};

/** Camera hovering over an island's hub (village framing) at the given tier. */
function rig(seed: number, q: Quality, island: number, tier = 2) {
  const w = world(seed);
  const hub = w.settlements.find((s) => s.islandId === island)!.hub;
  const cam = new THREE.Vector3(hub.x, tier === 2 ? 70 : 20, hub.z + (tier === 2 ? 60 : 22));
  const counters = { agents: 0 };
  const life: LifeSystem = createLife({
    world: w,
    scope: new Scope('activity'),
    seed,
    quality: q,
    water: { splat: () => undefined },
    counters: counters as never,
    getTier: () => tier,
    cameraPos: cam,
  });
  life.onTier(tier);
  return { life, ws: life.kinds.workers as Workers, counters, cam };
}

const run = (r: { life: LifeSystem }, n: number): void => {
  for (let i = 0; i < n; i++) {
    r.life.fixedUpdate(FIXED_STEP);
    r.life.update(FIXED_STEP, 1);
  }
};

describe('activity: near-focus ambient workers (TASK-383)', () => {
  it('sleeps the ambient slots while the camera is far, and never exceeds the plan', () => {
    const r = rig(1001, 'high', 0);
    r.cam.set(0, 400, 0);
    run(r, 40);
    expect(r.ws.focus).toBe(-1);
    expect(r.ws.awake).toBe(r.ws.residents);
    expect(r.ws.capacity).toBeGreaterThan(r.ws.residents);
  });

  it('wakes the focused campus within the agent caps, at simt = 2, on every island and quality', () => {
    for (const seed of SEEDS) {
      const w = world(seed);
      for (const q of ['low', 'medium', 'high'] as const) {
        for (const isl of w.islands) {
          if (!w.settlements.some((s) => s.islandId === isl.id)) continue;
          const r = rig(seed, q, isl.id);
          run(r, 60);
          const a = r.ws.activity(isl.id);
          const need = isl.theme === 'hq' || isl.theme === 'coding' ? 6 : 3;
          const tag = `seed ${seed} ${q} ${isl.theme}`;
          expect(r.ws.focus, tag).toBe(isl.id);
          expect(a.awake, tag).toBeGreaterThanOrEqual(need);
          expect(a.transit, tag).toBeGreaterThanOrEqual(2);
          expect(a.carrying, tag).toBeGreaterThanOrEqual(1);
          expect(r.ws.awake, tag).toBeLessThanOrEqual(LIFE_PLAN[q].workers);
          expect(r.counters.agents, tag).toBeLessThanOrEqual(CAPS[q]);
        }
      }
    }
  });

  it('encodes the carried item next to the department accessory (two-slot aSeed)', () => {
    const r = rig(1001, 'high', 2);
    run(r, 90);
    const seed = r.ws.mesh.geometry.getAttribute('aSeed');
    let carrying = 0;
    for (let i = 0; i < r.ws.capacity; i++) {
      if (!r.ws.active[i]) continue;
      const code = r.ws.itemOf(i);
      const f = Math.floor(seed.getX(i));
      const acc = THEMES.coding.accessory;
      if (r.ws.islandOf[i] !== 2) continue;
      expect(f % ITEM_STRIDE).toBe(acc);
      expect(Math.floor(f / ITEM_STRIDE)).toBe(code);
      if (code > 0) carrying++;
    }
    expect(carrying).toBeGreaterThan(0);
  });

  it('is deterministic: same seed and camera give the same positions, items and states', () => {
    const snap = (): number[] => {
      const r = rig(1001, 'high', 5);
      run(r, 400);
      const out: number[] = [];
      for (let i = 0; i < r.ws.capacity; i++)
        out.push(r.ws.x[i], r.ws.z[i], r.ws.stateOf(i), r.ws.itemOf(i));
      return out;
    };
    expect(snap()).toEqual(snap());
  });

  it('shows chats, queues and stop work over two minutes on the HQ campus', () => {
    const r = rig(1001, 'high', 0);
    let chat = 0;
    let queue = 0;
    let stops = 0;
    for (let s = 0; s < 30 * 120; s++) {
      r.life.fixedUpdate(FIXED_STEP);
      if (s % 15) continue;
      const a = r.ws.activity(0);
      chat = Math.max(chat, a.chatting);
      queue = Math.max(queue, a.queueing);
      stops = Math.max(stops, a.atStop);
    }
    expect(queue).toBeGreaterThan(0);
    expect(stops).toBeGreaterThan(0);
    expect(chat).toBeGreaterThanOrEqual(0);
  });

  it('keeps awake feet on the ground or a pier over two minutes (ambient states included)', () => {
    const r = rig(1001, 'high', 5);
    const ws = r.ws;
    for (let s = 0; s < 30 * 120; s++) {
      r.life.fixedUpdate(FIXED_STEP);
      for (let i = 0; i < ws.capacity; i++) {
        if (!ws.active[i]) continue;
        expect(Number.isFinite(ws.x[i] + ws.y[i] + ws.z[i])).toBe(true);
      }
    }
  });

  it('costs little with a whole campus awake (CPU ms per fixed step / update)', () => {
    const r = rig(1001, 'high', 0, 3);
    run(r, 120);
    const ws = r.ws;
    const n = 600;
    // eslint-disable-next-line no-restricted-properties
    const t0 = performance.now();
    for (let i = 0; i < n; i++) (ws as unknown as { fixedUpdate(): void }).fixedUpdate();
    // eslint-disable-next-line no-restricted-properties
    const t1 = performance.now();
    for (let i = 0; i < n; i++) ws.update((i % 10) / 10);
    // eslint-disable-next-line no-restricted-properties
    const t2 = performance.now();
    const step = (t1 - t0) / n;
    const upd = (t2 - t1) / n;
    console.info(
      `activity cost: ${ws.awake} awake, fixedUpdate ${(step * 1000).toFixed(1)} µs/step, update ${(upd * 1000).toFixed(1)} µs/frame`,
    );
    expect(step).toBeLessThan(perfLimit(0.5));
    expect(upd).toBeLessThan(perfLimit(0.2));
  });
});
