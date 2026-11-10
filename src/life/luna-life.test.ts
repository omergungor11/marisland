import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { FIXED_STEP } from '../core/clock.ts';
import { Scope } from '../core/scope.ts';
import type { Quality } from '../core/params.ts';
import { LIFE_PLAN } from '../content/life.ts';
import { LUNA_LIFE, lunaCounts } from '../content/life-luna.ts';
import { generateWorld, type WorldData } from '../world/index.ts';
import { createLife } from './index.ts';
import { planLuna } from './luna-world.ts';
import { onShift, strollAt, type StrollPose } from './marina-world.ts';

/** TASK-672: the fun park's visitors (Workers tableau slots, like the marina town). */
const SEED = 1001;
let cached: WorldData | null = null;
const world = (): WorldData => (cached ??= generateWorld(SEED));
const ambientOf: Record<Quality, number> = { low: 0.5, medium: 0.75, high: 1 };
const pose = (): StrollPose => ({ x: 0, z: 0, hd: 0, moving: false });

/** Distance from (x, z) to the closed loop polyline. */
function loopDist(loop: { x: number; z: number }[], x: number, z: number): number {
  let best = Infinity;
  for (let k = 0; k < loop.length; k++) {
    const a = loop[k];
    const b = loop[(k + 1) % loop.length];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const l2 = dx * dx + dz * dz || 1;
    const t = Math.min(1, Math.max(0, ((x - a.x) * dx + (z - a.z) * dz) / l2));
    best = Math.min(best, Math.hypot(x - (a.x + dx * t), z - (a.z + dz * t)));
  }
  return best;
}

describe('fun park visitors plan', () => {
  it('has visitors only where the world has a park', () => {
    expect(planLuna(world(), 0.75)).not.toBeNull();
    const none = { ...world(), islands: world().islands.map((i) => ({ ...i, anchors: {} })) };
    expect(planLuna(none, 0.75)).toBeNull();
  });

  it('sizes the crowd by quality and leaves the campus its reserve', () => {
    for (const q of ['low', 'medium', 'high'] as const) {
      const plan = planLuna(world(), ambientOf[q])!;
      const row = lunaCounts(ambientOf[q]);
      expect(plan.strollers).toBe(row.strollers);
      expect(plan.browsers).toBe(row.browsers);
      expect(plan.gate).toBe(row.gate);
      expect(plan.bots.length).toBeLessThanOrEqual(LIFE_PLAN[q].workers - LUNA_LIFE.reserve);
    }
  });

  it('is deterministic', () => {
    const a = planLuna(world(), 0.75)!;
    const b = planLuna(generateWorld(SEED), 0.75)!;
    expect(JSON.stringify(a.bots)).toBe(JSON.stringify(b.bots));
  });

  it('walks the strollers on the stroll loop, both ways, never in lockstep, on the plank top', () => {
    const plan = planLuna(world(), 1)!;
    const A = world().islands[plan.island].anchors;
    const loop = Array.from({ length: 42 }, (_, k) => A[`lunaStroll${k}`]);
    const strollers = plan.bots.filter((b) => b.kind === 'lunaStroll');
    expect(strollers.length).toBe(6);
    const p = pose();
    const dirs = new Set<number>();
    const starts = new Set<string>();
    for (const b of strollers) {
      const route = b.town!.route!;
      expect(b.y).toBe(A.lunaStroll0.y);
      starts.add(`${Math.round(b.x)},${Math.round(b.z)}`);
      dirs.add(Math.sign(route.legs[0].s1 - route.legs[0].s0));
      let prev: { x: number; z: number } | null = null;
      let maxStep = 0;
      let paused = 0;
      let walked = 0;
      const steps = Math.ceil((route.cycle * 2) / FIXED_STEP);
      for (let k = 0; k <= steps; k++) {
        strollAt(route, k * FIXED_STEP, p);
        // on the loop (the polyline between the stroll anchors), clear of everything the plan cleared
        expect(loopDist(loop, p.x, p.z)).toBeLessThan(0.05);
        if (prev) maxStep = Math.max(maxStep, Math.hypot(p.x - prev.x, p.z - prev.z));
        if (p.moving) walked++;
        else paused++;
        prev = { x: p.x, z: p.z };
      }
      expect(maxStep / FIXED_STEP).toBeLessThan(LUNA_LIFE.stroll.speed * 2.1);
      expect(walked).toBeGreaterThan(0);
      expect(paused).toBeGreaterThan(walked * 0.05);
      // one full lap per cycle: the walk is a loop, the cycle seam is continuous
      strollAt(route, route.cycle - 1e-4, p);
      const end = { x: p.x, z: p.z };
      strollAt(route, 0, p);
      expect(Math.hypot(end.x - p.x, end.z - p.z)).toBeLessThan(0.05);
    }
    expect(dirs.size).toBe(2);
    expect(starts.size).toBeGreaterThanOrEqual(5);
  });

  it('stands the browsers at the stand fronts facing their stand and the greeter inside the gate', () => {
    const plan = planLuna(world(), 1)!;
    const A = world().islands[plan.island].anchors;
    const stalls = Array.from({ length: 5 }, (_, k) => A[`lunaStall${k}`]);
    const browsers = plan.bots.filter((b) => b.kind === 'lunaBrowser');
    expect(browsers.length).toBe(5);
    const seen = new Set<string>();
    for (const b of browsers) {
      const s = stalls.find((o) => o.x === b.x && o.z === b.z)!;
      expect(s).toBeTruthy();
      expect(b.hd).toBe(s.rotY);
      seen.add(`${b.x},${b.z}`);
    }
    expect(seen.size).toBe(5);
    const gate = plan.bots.find((b) => b.kind === 'lunaGate')!;
    const G = A.lunaGate;
    expect(Math.hypot(gate.x - G.x, gate.z - G.z)).toBeCloseTo(LUNA_LIFE.gate.inset, 5);
    // inside the park: on the far side of the sign from its front
    expect((gate.x - G.x) * Math.cos(G.rotY) + (gate.z - G.z) * Math.sin(G.rotY)).toBeLessThan(0);
  });

  it('keeps shifts: busy by day, thinning late, nobody in the small hours', () => {
    const plan = planLuna(world(), 1)!;
    const on = (h: number): number => plan.bots.filter((b) => onShift(b.town!.shift, h)).length;
    expect(on(16)).toBe(plan.bots.length);
    expect(on(23.8)).toBeLessThan(on(16));
    expect(on(23.8)).toBeGreaterThan(0);
    expect(on(4)).toBe(0);
  });
});

function rig(q: Quality, hour: number, cam: 'near' | 'far') {
  const plan = planLuna(world(), ambientOf[q])!;
  const deck = world().islands[plan.island].anchors.lunaDeck;
  const life = createLife({
    world: world(),
    scope: new Scope('luna-life'),
    seed: SEED,
    quality: q,
    water: { splat: () => undefined },
    counters: { agents: 0 } as never,
    getTier: () => 2,
    cameraPos:
      cam === 'near' ? new THREE.Vector3(deck.x, 40, deck.z + 30) : new THREE.Vector3(0, 400, 0),
    cameraTarget:
      cam === 'near' ? new THREE.Vector3(deck.x, 0, deck.z) : new THREE.Vector3(0, 0, 0),
    hour: () => hour,
  });
  life.onTier(2);
  for (let i = 0; i < 90; i++) life.fixedUpdate(FIXED_STEP);
  return life;
}

function parkAwake(life: ReturnType<typeof rig>): Record<string, number> {
  const w = life.kinds.workers as unknown as {
    capacity: number;
    tab: ({ kind: string; site?: string } | undefined)[];
    active: Uint8Array;
  };
  const out: Record<string, number> = {};
  for (let i = 0; i < w.capacity; i++) {
    const t = w.tab[i];
    if (t?.site === 'luna' && w.active[i]) out[t.kind] = (out[t.kind] ?? 0) + 1;
  }
  return out;
}

describe('fun park visitors in the workers kind', () => {
  it('wakes the park by day near the deck, within the worker pool', () => {
    for (const q of ['low', 'medium', 'high'] as const) {
      const life = rig(q, 16, 'near');
      const awake = parkAwake(life);
      const row = lunaCounts(ambientOf[q]);
      expect(awake.lunaStroll ?? 0).toBe(row.strollers);
      expect(awake.lunaBrowser ?? 0).toBe(row.browsers);
      expect(awake.lunaGate ?? 0).toBe(row.gate);
      expect(life.kinds.workers!.liveCount).toBeLessThanOrEqual(LIFE_PLAN[q].workers);
    }
  });

  it('sleeps when the camera is far or the park is closed', () => {
    expect(Object.keys(parkAwake(rig('medium', 16, 'far'))).length).toBe(0);
    expect(Object.keys(parkAwake(rig('medium', 4, 'near'))).length).toBe(0);
  });

  it('keeps walkers on the plank top and is deterministic', () => {
    const run = (): number[] => {
      const life = rig('medium', 16, 'near');
      const w = life.kinds.workers!;
      const tab = (w as unknown as { tab: ({ site?: string } | undefined)[] }).tab;
      const out: number[] = [];
      for (let i = 0; i < w.capacity; i++)
        if (w.active[i] && tab[i]?.site === 'luna') out.push(w.x[i], w.z[i], w.y[i]);
      return out;
    };
    const a = run();
    expect(a.length).toBeGreaterThan(0);
    expect(a).toEqual(run());
    const deckY = world().islands.find((i) => i.anchors.lunaDeck)!.anchors.carnivalDeck.y!;
    for (let k = 2; k < a.length; k += 3) expect(Math.abs(a[k] - deckY)).toBeLessThan(0.2);
  });
});
